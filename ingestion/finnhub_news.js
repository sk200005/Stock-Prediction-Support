import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const RAW_NEWS_PATH = path.resolve("data/raw_news.json");
const VALID_TICKERS_PATH = path.resolve("data/valid_tickers.json");
const TRACKED_COMPANIES_PATH = path.resolve("data/tracked_companies.json");
const REQUEST_INTERVAL_MS = Math.max(
  Number.parseInt(process.env.FINNHUB_REQUEST_INTERVAL_MS || "1100", 10),
  1000
);
const MAX_GENERAL_ARTICLES = Number.parseInt(process.env.FINNHUB_MAX_ARTICLES || "30", 10);
const MAX_ARTICLES_PER_COMPANY = Number.parseInt(
  process.env.FINNHUB_MAX_ARTICLES_PER_COMPANY || "20",
  10
);
const FINANCE_KEYWORDS = [
  "stock",
  "stocks",
  "share",
  "shares",
  "earnings",
  "profit",
  "revenue",
  "market",
  "ipo",
  "acquisition",
  "investment",
  "quarter",
  "guidance",
];

let lastRequestAt = 0;

function isAxiosStatus(error, statusCode) {
  return error?.response?.status === statusCode;
}

function buildFinnhubErrorMessage(error, context) {
  const statusCode = error?.response?.status;
  const apiMessage = error?.response?.data?.error || error?.response?.data?.message;

  if (statusCode === 401 || statusCode === 403) {
    return `${context} failed with status ${statusCode}. Check FINNHUB_API_KEY and your Finnhub plan access. ${apiMessage || ""}`.trim();
  }

  if (statusCode === 429) {
    return `${context} failed with status 429. Finnhub rate limit exceeded. Increase request spacing or reduce tracked symbols.`;
  }

  return `${context} failed: ${apiMessage || error.message}`;
}

function ensureApiKey() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error("FINNHUB_API_KEY is missing. Add it to your .env file before running ingestion.");
  }
  return apiKey;
}

function ensureRawNewsFile() {
  fs.mkdirSync(path.dirname(RAW_NEWS_PATH), { recursive: true });
  if (!fs.existsSync(RAW_NEWS_PATH)) {
    fs.writeFileSync(RAW_NEWS_PATH, "[]\n");
  }
}

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readJsonArray(filePath) {
  const payload = readJson(filePath, []);
  return Array.isArray(payload) ? payload : [];
}

function readRawNews() {
  ensureRawNewsFile();
  return readJsonArray(RAW_NEWS_PATH);
}

function writeRawNews(articles) {
  ensureRawNewsFile();
  fs.writeFileSync(RAW_NEWS_PATH, JSON.stringify(articles, null, 2));
}

function loadValidTickers() {
  return new Set(
    readJsonArray(VALID_TICKERS_PATH)
      .map((ticker) => String(ticker).trim().toUpperCase())
      .filter(Boolean)
  );
}

function loadTrackedCompanySymbols(validTickers) {
  const payload = readJson(TRACKED_COMPANIES_PATH, {});
  const indian = Array.isArray(payload.indian) ? payload.indian : [];
  const foreign = Array.isArray(payload.foreign) ? payload.foreign : [];

  const normalizedIndian = indian
    .map((ticker) => String(ticker).trim().toUpperCase())
    .filter((ticker) => validTickers.has(ticker));
  const normalizedForeign = foreign
    .map((ticker) => String(ticker).trim().toUpperCase())
    .filter((ticker) => validTickers.has(ticker));
  const balancedCount = Math.min(normalizedIndian.length, normalizedForeign.length);

  return [
    ...normalizedIndian.slice(0, balancedCount),
    ...normalizedForeign.slice(0, balancedCount),
  ];
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function throttledGet(url, params) {
  const waitTime = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitTime > 0) {
    await sleep(waitTime);
  }

  const response = await axios.get(url, {
    params,
    timeout: 15000,
  });

  lastRequestAt = Date.now();
  return response.data;
}

function normalizePublishedAt(datetime) {
  if (!datetime) {
    return "";
  }

  const value = typeof datetime === "number" ? datetime * 1000 : Date.parse(datetime);
  if (Number.isNaN(value)) {
    return "";
  }

  return new Date(value).toISOString();
}

function extractTickers(relatedValue) {
  if (!relatedValue) {
    return [];
  }

  return [...new Set(
    String(relatedValue)
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => /^[A-Z.\-]{1,20}$/.test(symbol))
  )];
}

function hasFinancialKeywordMatch(article) {
  const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
  return FINANCE_KEYWORDS.some((keyword) => text.includes(keyword));
}

function normalizeFinnhubArticle(item, validTickers, fallbackTicker = "") {
  const extractedTickers = extractTickers(item.related);
  const validatedTickers = extractedTickers.filter((ticker) => validTickers.has(ticker));
  const tickers = validatedTickers.length > 0
    ? validatedTickers
    : (fallbackTicker && validTickers.has(fallbackTicker) ? [fallbackTicker] : []);

  return {
    title: item.headline || "",
    description: item.summary || "",
    link: item.url || "",
    url: item.url || "",
    source: item.source || "Finnhub",
    published_at: normalizePublishedAt(item.datetime),
    image: item.image || "",
    tickers,
    companies: tickers,
    company: tickers[0] || null,
    ingestion_source: "finnhub",
    summary: item.summary || "",
  };
}

function isFinanciallyRelevant(article) {
  if (article.tickers.length > 0) {
    return true;
  }

  return hasFinancialKeywordMatch(article);
}

function filterRelevantArticles(articles) {
  return articles.filter((article) => {
    if (!article.link && !article.url) {
      return false;
    }

    return isFinanciallyRelevant(article);
  });
}

function mergeArticles(existingArticles, incomingArticles) {
  const byUrl = new Map();

  for (const article of existingArticles) {
    const url = (article.link || article.url || "").trim().toLowerCase();
    if (!url) {
      continue;
    }
    byUrl.set(url, article);
  }

  for (const article of incomingArticles) {
    const url = (article.link || article.url || "").trim().toLowerCase();
    if (!url) {
      continue;
    }

    const previous = byUrl.get(url) || {};
    const tickers = article.tickers?.length ? article.tickers : previous.tickers || [];

    byUrl.set(url, {
      ...previous,
      ...article,
      tickers,
      companies: tickers,
      company: tickers[0] || previous.company || null,
    });
  }

  return [...byUrl.values()].sort((left, right) => {
    const leftTime = Date.parse(left.published_at || 0);
    const rightTime = Date.parse(right.published_at || 0);
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
  });
}

async function fetchGeneralNews(validTickers) {
  const apiKey = ensureApiKey();
  let response;

  try {
    response = await throttledGet(`${FINNHUB_BASE_URL}/news`, {
      category: "general",
      token: apiKey,
    });
  } catch (error) {
    throw new Error(buildFinnhubErrorMessage(error, "Finnhub general news request"));
  }

  const news = Array.isArray(response) ? response : [];
  const limitedNews = news.slice(0, MAX_GENERAL_ARTICLES);
  return filterRelevantArticles(
    limitedNews.map((item) => normalizeFinnhubArticle(item, validTickers))
  );
}

export async function fetchCompanyNews(symbol, options = {}) {
  const apiKey = ensureApiKey();
  const validTickers = loadValidTickers();
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  const now = new Date();
  const toDate = options.to || now.toISOString().slice(0, 10);
  const fromDate = options.from
    || new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let response;

  try {
    response = await throttledGet(`${FINNHUB_BASE_URL}/company-news`, {
      symbol: normalizedSymbol,
      from: fromDate,
      to: toDate,
      token: apiKey,
    });
  } catch (error) {
    if (isAxiosStatus(error, 403)) {
      console.warn(
        `Skipping ${normalizedSymbol}: Finnhub returned 403 for company-news. This symbol may not be available on your plan.`
      );
      return [];
    }

    throw new Error(buildFinnhubErrorMessage(error, `Finnhub company news request for ${normalizedSymbol}`));
  }

  const news = Array.isArray(response) ? response : [];
  const limitedNews = news.slice(0, MAX_ARTICLES_PER_COMPANY);
  return filterRelevantArticles(
    limitedNews.map((item) =>
      normalizeFinnhubArticle(
        {
          ...item,
          related: item.related || normalizedSymbol,
        },
        validTickers,
        normalizedSymbol
      )
    )
  );
}

export async function runFinnhubNewsIngestion() {
  const validTickers = loadValidTickers();
  const trackedCompanySymbols = loadTrackedCompanySymbols(validTickers);
  const existingArticles = readRawNews();
  const generalNews = await fetchGeneralNews(validTickers);

  const companyNewsCollections = [];
  for (const symbol of trackedCompanySymbols) {
    const companyNews = await fetchCompanyNews(symbol);
    companyNewsCollections.push(...companyNews);
  }

  const mergedArticles = mergeArticles(existingArticles, [
    ...generalNews,
    ...companyNewsCollections,
  ]);

  writeRawNews(mergedArticles);

  console.log(
    `Finnhub ingestion complete: ${generalNews.length} general articles, ${companyNewsCollections.length} company articles across ${trackedCompanySymbols.length} tracked symbols, ${mergedArticles.length} stored total.`
  );

  return mergedArticles;
}
