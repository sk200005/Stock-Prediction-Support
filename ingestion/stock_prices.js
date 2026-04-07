import fs from "fs";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const RAW_NEWS_PATH = path.resolve("data/raw_news.json");
const REQUEST_INTERVAL_MS = Math.max(
  Number.parseInt(process.env.FINNHUB_REQUEST_INTERVAL_MS || "1100", 10),
  1000
);

let lastRequestAt = 0;

function ensureApiKey() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error("FINNHUB_API_KEY is missing. Add it to your .env file before running stock price enrichment.");
  }
  return apiKey;
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

function readRawNews() {
  if (!fs.existsSync(RAW_NEWS_PATH)) {
    return [];
  }

  const payload = JSON.parse(fs.readFileSync(RAW_NEWS_PATH, "utf-8"));
  return Array.isArray(payload) ? payload : [];
}

function writeRawNews(articles) {
  fs.mkdirSync(path.dirname(RAW_NEWS_PATH), { recursive: true });
  fs.writeFileSync(RAW_NEWS_PATH, JSON.stringify(articles, null, 2));
}

function getPrimaryTicker(article) {
  if (Array.isArray(article.tickers) && article.tickers.length > 0) {
    return String(article.tickers[0]).trim().toUpperCase();
  }

  if (article.company) {
    return String(article.company).trim().toUpperCase();
  }

  return "";
}

async function fetchQuote(symbol) {
  const apiKey = ensureApiKey();
  const response = await throttledGet(`${FINNHUB_BASE_URL}/quote`, {
    symbol,
    token: apiKey,
  });

  return {
    current_price: response?.c ?? null,
    percent_change: response?.dp ?? null,
    high: response?.h ?? null,
    low: response?.l ?? null,
  };
}

export async function runStockPriceFetcher() {
  const rawArticles = readRawNews();
  if (rawArticles.length === 0) {
    console.log("No raw Finnhub articles found. Skipping stock price enrichment.");
    return [];
  }

  const symbols = [...new Set(rawArticles.map(getPrimaryTicker).filter(Boolean))];
  const quotesBySymbol = new Map();

  for (const symbol of symbols) {
    try {
      const quote = await fetchQuote(symbol);
      quotesBySymbol.set(symbol, quote);
    } catch (error) {
      console.warn(`Quote fetch failed for ${symbol}: ${error.message}`);
    }
  }

  const enrichedArticles = rawArticles.map((article) => {
    const ticker = getPrimaryTicker(article);
    const quote = quotesBySymbol.get(ticker) || {};
    const priceData = {
      current_price: quote.current_price ?? article.current_price ?? null,
      percent_change: quote.percent_change ?? article.price_change_percent ?? null,
      high: quote.high ?? article.high ?? null,
      low: quote.low ?? article.low ?? null,
    };

    return {
      ...article,
      company: ticker || article.company || null,
      price_change_percent: priceData.percent_change,
      current_price: priceData.current_price,
      high: priceData.high,
      low: priceData.low,
      price_data: priceData,
    };
  });

  writeRawNews(enrichedArticles);
  console.log(`Stock price enrichment complete for ${quotesBySymbol.size} tickers.`);
  return enrichedArticles;
}
