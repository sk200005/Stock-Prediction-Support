import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function analyzeArticle(article) {
  const prompt = `
You are a financial news analysis system.

Task:
Analyze the given news article and return ONLY valid JSON.

Steps:
1. Check if the news is related to stocks, companies, markets, or business.
2. If NOT stock-related, return:
   { "is_stock_related": false }

3. If stock-related:
   - Identify the main company
   - Determine sentiment: Positive, Negative, or Neutral
   - Determine market impact: Bullish, Bearish, or Neutral
   - Generate a 2–3 line business-focused summary

Rules:
- Output MUST be strict JSON
- No explanations
- No markdown
- No extra text
- Use exact key names

Article:
Title: ${article.title}
Description: ${article.description}
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0
  });

  const raw = response.choices[0].message.content;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
