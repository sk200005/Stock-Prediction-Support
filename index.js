import fs from "fs";
import { spawnSync } from "child_process";
import { MongoClient } from "mongodb";

const RAW_NEWS_PATH = "./data/raw_news.json";
const OUTPUT_PATH = "./output/processedArticles.json";
const PYTHON_ANALYZER_PATH = "./analysis_pipeline.py";
const PYTHON_EXECUTABLE = process.env.PYTHON_ANALYZER_BIN || "python3";
const ARTICLES_PER_SOURCE = 10;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DATABASE = process.env.MONGODB_DATABASE || "market_signals";
const MONGODB_ARTICLES_COLLECTION = process.env.MONGODB_ARTICLES_COLLECTION || "articles";
const MONGODB_METADATA_COLLECTION = process.env.MONGODB_METADATA_COLLECTION || "metadata";
const NEW_ARTICLES_PER_RUN = 5;

function normalizeTitle(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function getArticleIdentity(article) {
  const normalizedTitle = normalizeTitle(article.title);
  const normalizedLink = (article.link || "").trim().toLowerCase();
  return normalizedLink || normalizedTitle;
}

function groupBySource(articles) {
  return articles.reduce((grouped, article) => {
    const source = article.source || "Unknown";
    if (!grouped[source]) {
      grouped[source] = [];
    }
    grouped[source].push(article);
    return grouped;
  }, {});
}

function computeAggregates(articles) {
  const mentionCounts = new Map();
  const signalStrength = new Map();
  const impactDistribution = {
    bullish: 0,
    bearish: 0,
    neutral: 0
  };

  for (const article of articles) {
    const analysis = article.analysis || {};
    const company = analysis.company || "Unknown";
    const impact = String(analysis.impact || "Neutral").toLowerCase();
    const score = Number(analysis.signal_score || 0);

    if (company && company !== "Unknown") {
      mentionCounts.set(company, (mentionCounts.get(company) || 0) + 1);
      signalStrength.set(company, (signalStrength.get(company) || 0) + score);
    }

    if (Object.prototype.hasOwnProperty.call(impactDistribution, impact)) {
      impactDistribution[impact] += 1;
    } else {
      impactDistribution.neutral += 1;
    }
  }

  return {
    company_mentions: [...mentionCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([company, mentions]) => ({ company, mentions })),
    company_signal_strength: [...signalStrength.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([company, signal_strength]) => ({ company, signal_strength })),
    impact_distribution: impactDistribution
  };
}

function selectArticles(rawArticles) {
  const groupedArticles = groupBySource(rawArticles);
  const seenTitles = new Set();
  const selectedArticles = [];

  const targetSources = [
    "Moneycontrol",
    "Economic Times",
    "Reuters",
    "Livemint",
    "Business Standard",
    "CNBC TV18 India",
    "Financial Express",
    "The Hindu BusinessLine",
    "NSE India"
  ];

  for (const source of targetSources) {
    const articles = groupedArticles[source] || [];
    let count = 0;

    for (const article of articles) {
      const key = normalizeTitle(article.title);
      if (seenTitles.has(key)) {
        continue;
      }

      seenTitles.add(key);
      selectedArticles.push(article);
      count += 1;

      console.log(`Queued [${source}]: ${article.title}`);

      if (count >= ARTICLES_PER_SOURCE) {
        break;
      }
    }
  }

  return selectedArticles;
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
    aggregates: payload.aggregates || {}
  };
}

async function loadExistingArticlesFromMongo() {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000
  });

  try {
    await client.connect();
    const database = client.db(MONGODB_DATABASE);
    const articlesCollection = database.collection(MONGODB_ARTICLES_COLLECTION);
    const articles = await articlesCollection.find({}, { projection: { _id: 0 } }).toArray();
    return articles;
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

function filterNewArticles(candidateArticles, existingArticles) {
  const seenIdentities = new Set(existingArticles.map(getArticleIdentity).filter(Boolean));
  const newArticles = [];

  for (const article of candidateArticles) {
    const identity = getArticleIdentity(article);
    if (!identity || seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    newArticles.push(article);

    if (newArticles.length >= NEW_ARTICLES_PER_RUN) {
      break;
    }
  }

  return newArticles;
}

function runPythonAnalysis(articles) {
  const payload = JSON.stringify({ articles });
  let result;

  try {
    result = spawnSync(
      PYTHON_EXECUTABLE,
      [PYTHON_ANALYZER_PATH],
      {
        input: payload,
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024
      }
    );
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
    throw new Error(result.stdout || "Python analysis pipeline failed.");
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

async function syncPayloadToMongo(processedPayload) {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000
  });

  try {
    await client.connect();
    const database = client.db(MONGODB_DATABASE);
    const articlesCollection = database.collection(MONGODB_ARTICLES_COLLECTION);
    const metadataCollection = database.collection(MONGODB_METADATA_COLLECTION);
    const incomingArticles = processedPayload.articles || [];

    if (incomingArticles.length) {
      await articlesCollection.insertMany(incomingArticles);
    }

    const allArticles = await articlesCollection.find({}, { projection: { _id: 0 } }).toArray();

    const aggregates = computeAggregates(allArticles);

    await metadataCollection.updateOne(
      { type: "processed_payload" },
      {
        $set: {
          type: "processed_payload",
          aggregates,
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    console.log("✅ Synced processed payload to MongoDB");
    return { allArticles, aggregates };
  } finally {
    await client.close();
  }
}

async function main() {
  if (!fs.existsSync(RAW_NEWS_PATH)) {
    throw new Error("Missing data/raw_news.json. Run RSS ingestion first.");
  }

  const rawArticles = JSON.parse(fs.readFileSync(RAW_NEWS_PATH, "utf-8"));
  const selectedArticles = selectArticles(rawArticles);
  const existingArticles = await loadExistingArticles();
  const newArticles = filterNewArticles(selectedArticles, existingArticles);

  console.log(`Selected ${selectedArticles.length} candidate articles from raw ingestion.`);
  console.log(`Found ${newArticles.length} new articles to analyze.`);

  if (newArticles.length === 0) {
    const existingPayload = loadExistingPayloadFromJson();
    console.log("No unseen articles found. Skipping analysis.");
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
    allArticles = [...processedPayload.articles, ...(existingPayload.articles || [])];
    aggregates = computeAggregates(allArticles);
  }

  const finalPayload = {
    articles: allArticles,
    aggregates
  };

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(finalPayload, null, 2)
  );

  console.log("✅ Market signal analysis completed");
  console.log(`Saved results to ${OUTPUT_PATH}`);
  return finalPayload;
}

try {
  await main();
} catch (error) {
  console.error("Pipeline Error:", error.message);
  process.exit(1);
}
