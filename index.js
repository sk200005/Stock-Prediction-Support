import fs from "fs";
import dotenv from "dotenv";
import { spawnSync } from "child_process";
import { MongoClient } from "mongodb";

import { runFinnhubNewsIngestion } from "./ingestion/finnhub_news.js";
import { runStockPriceFetcher } from "./ingestion/stock_prices.js";

dotenv.config();

const RAW_NEWS_PATH = "./data/raw_news.json";
const OUTPUT_PATH = "./output/processedArticles.json";
const PYTHON_ANALYZER_PATH = "./analysis_pipeline.py";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || "market_signals";
const MONGODB_ARTICLES_COLLECTION = process.env.MONGODB_ARTICLES_COLLECTION || "articles";
const MONGODB_METADATA_COLLECTION = process.env.MONGODB_METADATA_COLLECTION || "metadata";
const PYTHON_DEPENDENCY_CHECK = "import torch, transformers, spacy";

function commandExists(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf-8",
  });

  return result.status === 0 && Boolean(result.stdout?.trim());
}

function pythonHasAnalyzerDependencies(pythonExecutable) {
  const result = spawnSync(pythonExecutable, ["-c", PYTHON_DEPENDENCY_CHECK], {
    encoding: "utf-8",
  });

  return result.status === 0;
}

function resolvePythonAnalyzerExecutable() {
  const candidates = [
    process.env.PYTHON_ANALYZER_BIN,
    process.env.PROJECT_PYTHON_BIN,
    "./.venv/bin/python",
    "./venv/bin/python",
    "/opt/homebrew/opt/python@3.10/bin/python3.10",
    "python3",
    "python",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if ((candidate === "python3" || candidate === "python") && !commandExists(candidate)) {
      continue;
    }

    if (pythonHasAnalyzerDependencies(candidate)) {
      return candidate;
    }
  }

  return process.env.PYTHON_ANALYZER_BIN || process.env.PROJECT_PYTHON_BIN || "python3";
}

const PYTHON_EXECUTABLE = resolvePythonAnalyzerExecutable();

function normalizeTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function getArticleIdentity(article) {
  const normalizedLink = (article.link || article.url || "").trim().toLowerCase();
  if (normalizedLink) {
    return normalizedLink;
  }

  return normalizeTitle(article.title);
}

function loadRawArticles() {
  if (!fs.existsSync(RAW_NEWS_PATH)) {
    return [];
  }

  const payload = JSON.parse(fs.readFileSync(RAW_NEWS_PATH, "utf-8"));
  return Array.isArray(payload) ? payload : [];
}

function loadExistingPayloadFromJson() {
  if (!fs.existsSync(OUTPUT_PATH)) {
    return { articles: [], aggregates: {} };
  }

  const payload = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  if (Array.isArray(payload)) {
    return { articles: payload, aggregates: {} };
  }

  return {
    articles: payload.articles || [],
    aggregates: payload.aggregates || {},
  };
}

async function loadExistingArticlesFromMongo() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000,
  });

  try {
    await client.connect();
    const database = client.db(MONGODB_DATABASE);
    const articlesCollection = database.collection(MONGODB_ARTICLES_COLLECTION);
    return await articlesCollection.find({}, { projection: { _id: 0 } }).toArray();
  } finally {
    await client.close();
  }
}

async function loadExistingArticles() {
  try {
    return await loadExistingArticlesFromMongo();
  } catch (error) {
    console.warn(`MongoDB read skipped: ${error.message}`);
    return loadExistingPayloadFromJson().articles;
  }
}

function sortArticlesByPublishedAt(articles) {
  return [...articles].sort((left, right) => {
    const leftTime = Date.parse(left.published_at || 0);
    const rightTime = Date.parse(right.published_at || 0);
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

function filterNewArticles(candidateArticles, existingArticles) {
  const seenIdentities = new Set(existingArticles.map(getArticleIdentity).filter(Boolean));
  return sortArticlesByPublishedAt(candidateArticles).filter((article) => {
    const identity = getArticleIdentity(article);
    if (!identity || seenIdentities.has(identity)) {
      return false;
    }

    seenIdentities.add(identity);
    return true;
  });
}

function runPythonAnalysis(articles) {
  const payload = JSON.stringify({ articles });
  let result;

  try {
    result = spawnSync(PYTHON_EXECUTABLE, [PYTHON_ANALYZER_PATH], {
      input: payload,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === "EPIPE") {
      throw new Error(
        `The Python analyzer exited early. Set PYTHON_ANALYZER_BIN to the Python interpreter that has torch, transformers, and spacy installed. Current interpreter: ${PYTHON_EXECUTABLE}`
      );
    }
    throw error;
  }

  if (result.error) {
    if (result.error.code === "EPIPE") {
      throw new Error(
        `The Python analyzer exited early. Set PYTHON_ANALYZER_BIN to the Python interpreter that has torch, transformers, and spacy installed. Current interpreter: ${PYTHON_EXECUTABLE}`
      );
    }
    throw result.error;
  }

  if (result.stderr?.trim()) {
    console.error(result.stderr.trim());
  }

  if (result.status !== 0) {
    throw new Error(
      result.stdout
      || result.stderr
      || `Python analysis pipeline failed with interpreter: ${PYTHON_EXECUTABLE}`
    );
  }

  const parsed = JSON.parse(result.stdout);
  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return parsed;
}

function ensureOutputDirectoryExists() {
  fs.mkdirSync("./output", { recursive: true });
}

function shapeProcessedArticle(article) {
  const analysis = article.analysis || {};
  const tickers = Array.isArray(article.tickers)
    ? article.tickers
    : Array.isArray(article.companies)
      ? article.companies
      : [];
  const companyTicker = article.company || tickers[0] || analysis.company || "Unknown";
  const priceData = article.price_data || {
    current_price: article.current_price ?? null,
    percent_change: article.price_change_percent ?? null,
    high: article.high ?? null,
    low: article.low ?? null,
  };

  return {
    ...article,
    url: article.url || article.link || "",
    summary: analysis.summary || article.description || "",
    tickers,
    companies: tickers,
    company: companyTicker,
    sentiment: analysis.sentiment || "neutral",
    impact: analysis.impact || "Neutral",
    signal_score: Number(analysis.signal_score || 0),
    price_change_percent: priceData.percent_change ?? null,
    current_price: priceData.current_price ?? null,
    high: priceData.high ?? null,
    low: priceData.low ?? null,
    price_data: priceData,
    analysis,
  };
}

function deduplicateArticles(articles) {
  const seen = new Set();
  const unique = [];

  for (const article of sortArticlesByPublishedAt(articles)) {
    const identity = getArticleIdentity(article);
    if (!identity || seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    unique.push(article);
  }

  return unique;
}

async function syncPayloadToMongo(processedPayload) {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000,
  });

  try {
    await client.connect();
    const database = client.db(MONGODB_DATABASE);
    const articlesCollection = database.collection(MONGODB_ARTICLES_COLLECTION);
    const metadataCollection = database.collection(MONGODB_METADATA_COLLECTION);

    const processedArticles = processedPayload.articles.map(shapeProcessedArticle);

    for (const article of processedArticles) {
      const identity = getArticleIdentity(article);
      if (!identity) {
        continue;
      }

      await articlesCollection.updateOne(
        { identity },
        {
          $set: {
            identity,
            ...article,
            updated_at: new Date().toISOString(),
          },
          $setOnInsert: {
            created_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    const allArticles = await articlesCollection
      .find({}, { projection: { _id: 0, identity: 0 } })
      .sort({ published_at: -1 })
      .toArray();

    const aggregates = processedPayload.aggregates || {};

    await metadataCollection.updateOne(
      { type: "processed_payload" },
      {
        $set: {
          type: "processed_payload",
          aggregates,
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    console.log("Synced processed payload to MongoDB");
    return { allArticles, aggregates };
  } finally {
    await client.close();
  }
}

async function main() {
  console.log("Starting Finnhub news ingestion...");
  await runFinnhubNewsIngestion();

  console.log("Starting stock price enrichment...");
  await runStockPriceFetcher();

  const rawArticles = loadRawArticles();
  const existingArticles = await loadExistingArticles();
  const newArticles = filterNewArticles(rawArticles, existingArticles);

  console.log(`Loaded ${rawArticles.length} articles from raw_news.json.`);
  console.log(`Found ${newArticles.length} new articles to analyze.`);

  if (newArticles.length === 0) {
    const existingPayload = loadExistingPayloadFromJson();
    console.log("No unseen Finnhub articles found. Skipping analysis.");
    return existingPayload;
  }

  const processedPayload = runPythonAnalysis(newArticles);

  ensureOutputDirectoryExists();
  let allArticles = [];
  let aggregates = processedPayload.aggregates || {};

  try {
    const mongoResult = await syncPayloadToMongo(processedPayload);
    allArticles = mongoResult.allArticles;
    aggregates = mongoResult.aggregates;
  } catch (error) {
    console.warn(`MongoDB sync skipped: ${error.message}`);
    const existingPayload = loadExistingPayloadFromJson();
    const mergedArticles = processedPayload.articles
      .map(shapeProcessedArticle)
      .concat(existingPayload.articles || []);
    allArticles = deduplicateArticles(mergedArticles);
    aggregates = processedPayload.aggregates || existingPayload.aggregates || {};
  }

  const finalPayload = {
    articles: allArticles,
    aggregates,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalPayload, null, 2));

  console.log("Market signal analysis completed");
  console.log(`Saved results to ${OUTPUT_PATH}`);
  return finalPayload;
}

try {
  await main();
} catch (error) {
  console.error("Pipeline Error:", error.message);
  process.exit(1);
}
