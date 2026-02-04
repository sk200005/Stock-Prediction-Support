import fs from "fs";
import { analyzeArticle } from "./llm/analyzeArticle.js";

const rawArticles = JSON.parse(
  fs.readFileSync("./data/raw_news.json", "utf-8")
);

const processed = [];

for (const article of rawArticles) {
  console.log("Processing:", article.title);

  const analysis = await analyzeArticle(article);

  if (!analysis) {
    console.log("❌ Invalid JSON, skipped");
    continue;
  }

  processed.push({
    ...article,
    analysis
  });
}

fs.writeFileSync(
  "./output/processedArticles.json",
  JSON.stringify(processed, null, 2)
);

console.log("✅ Phase 2 completed");
