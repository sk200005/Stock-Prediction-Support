import fs from "fs";
import { analyzeArticle } from "./llm/analyzeArticle.js";

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function groupBySource(articles) {
  const grouped = {};
  for (const article of articles) {
    const src = article.source;
    if (!grouped[src]) grouped[src] = [];
    grouped[src].push(article);
  }
  return grouped;
}

const rawArticles = JSON.parse(
  fs.readFileSync("./data/raw_news.json", "utf-8")
);

const ARTICLES_PER_SOURCE = 10;
const processed = [];
const seenTitles = new Set();

const groupedArticles = groupBySource(rawArticles);

// Sources you care about
const TARGET_SOURCES = [
  "Moneycontrol",
  "Economic Times",
  "Reuters",
  "Livemint"
];

for (const source of TARGET_SOURCES) {
  const articles = groupedArticles[source] || [];
  let count = 0;

  for (const article of articles) {
    const key = normalizeTitle(article.title);
    if (seenTitles.has(key)) continue;

    seenTitles.add(key);

    console.log(`Processing [${source}]:`, article.title);

    const analysis = await analyzeArticle(article);
    if (!analysis) continue;

    processed.push({ ...article, analysis });
    count++;

    if (count >= ARTICLES_PER_SOURCE) break;
  }
}

fs.writeFileSync(
  "./output/processedArticles.json",
  JSON.stringify(processed, null, 2)
);

console.log("✅ Phase 2 completed (10 articles per source)");
