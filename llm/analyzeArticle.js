import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
let geminiUnavailable = false;

const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: { responseMimeType: "application/json" } 
});

const POSITIVE_TERMS = [
  "buy",
  "accumulate",
  "add",
  "upgrade",
  "overweight",
  "bullish",
  "surge",
  "soars",
  "gains",
  "rally",
  "hit 52-week high"
];

const NEGATIVE_TERMS = [
  "sell",
  "reduce",
  "downgrade",
  "underweight",
  "bearish",
  "falls",
  "drop",
  "decline",
  "cuts",
  "slump"
];

const NEUTRAL_TERMS = [
  "hold",
  "neutral"
];

const NON_STOCK_TERMS = [
  "bond",
  "bonds",
  "rupee",
  "gold",
  "bitcoin",
  "ethereum",
  "forex",
  "currency",
  "inflation",
  "rbi",
  "yield"
];

function buildArticleText(articleInput) {
  if (typeof articleInput === "string") {
    return articleInput;
  }

  if (articleInput && typeof articleInput === "object") {
    return [
      `Title: ${articleInput.title || ""}`,
      `Description: ${articleInput.description || ""}`,
      `Source: ${articleInput.source || ""}`
    ]
      .join("\n")
      .trim();
  }

  return "";
}

function normalizeAnalysis(parsed) {
  const isStockRelated =
    parsed?.is_stock_related === true ||
    String(parsed?.is_stock_related).toLowerCase() === "true";

  return {
    is_stock_related: isStockRelated,
    company: parsed?.company || "Unknown",
    sentiment: parsed?.sentiment || "Neutral",
    impact: parsed?.impact || "Neutral",
    summary: parsed?.summary || "No summary available."
  };
}

function stripHtml(text = "") {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function titleCase(text) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferCompany(title) {
  const cleanTitle = stripHtml(title || "");
  const patterns = [
    /^(Buy|Sell|Reduce|Accumulate|Hold)\s+(.+?);/i,
    /^(.+?)\s+shares?\s+/i,
    /^(.+?)\s+stock/i,
    /^Goldman Sachs upgrades\s+(.+?)\s+to/i,
    /^(.+?)\s+among\s+/i
  ];

  for (const pattern of patterns) {
    const match = cleanTitle.match(pattern);
    if (match?.[2]) return titleCase(match[2].trim());
    if (match?.[1] && !/^(buy|sell|reduce|accumulate|hold)$/i.test(match[1])) {
      return titleCase(match[1].trim());
    }
  }

  return "Unknown";
}

function detectImpact(...texts) {
  const orderedTexts = texts.filter(Boolean).map((text) => text.toLowerCase());

  for (const lower of orderedTexts) {
    if (POSITIVE_TERMS.some((term) => lower.includes(term))) {
      return { sentiment: "Positive", impact: "Bullish" };
    }
    if (NEGATIVE_TERMS.some((term) => lower.includes(term))) {
      return { sentiment: "Negative", impact: "Bearish" };
    }
    if (NEUTRAL_TERMS.some((term) => lower.includes(term))) {
      return { sentiment: "Neutral", impact: "Neutral" };
    }
  }

  return { sentiment: "Neutral", impact: "Neutral" };
}

function isLikelyStockRelated(articleInput) {
  const title = stripHtml(articleInput?.title || "");
  const description = stripHtml(articleInput?.description || "");
  const text = `${title} ${description}`.toLowerCase();

  if (NON_STOCK_TERMS.some((term) => text.includes(term))) {
    return false;
  }

  return /(stock|shares|target|buy|sell|reduce|accumulate|company|results|q[1-4]|pre-sales|upgrades?)/i.test(
    `${title} ${description}`
  );
}

function buildFallbackAnalysis(articleInput) {
  const title = stripHtml(articleInput?.title || articleInput || "");
  const description = stripHtml(articleInput?.description || "");
  const combined = `${title} ${description}`.trim();
  const stockRelated = isLikelyStockRelated(articleInput || {});

  if (!stockRelated) {
    return {
      is_stock_related: false,
      company: "N/A",
      sentiment: "Neutral",
      impact: "Neutral",
      summary: description || title || "No summary available."
    };
  }

  const { sentiment, impact } = detectImpact(title, combined);
  const company = inferCompany(title);
  const summarySource = description || title || "No summary available.";
  const summaryWords = summarySource.split(/\s+/).slice(0, 35).join(" ");

  return {
    is_stock_related: true,
    company,
    sentiment,
    impact,
    summary: summaryWords
  };
}

export async function analyzeArticle(articleInput) {
  if (geminiUnavailable) {
    return buildFallbackAnalysis(articleInput);
  }

  const articleText = buildArticleText(articleInput);
  const truncatedText = articleText.split(/\s+/).slice(0, 1000).join(" ");

  const prompt = `Analyze this financial news item and return ONLY valid JSON.
Return this exact shape:
{
  "is_stock_related": boolean,
  "company": "string",
  "sentiment": "Positive | Negative | Neutral | Mixed",
  "impact": "Bullish | Bearish | Neutral",
  "summary": "1-2 sentence concise summary"
}

Rules:
- Set "is_stock_related" to false if the article is mainly about macroeconomics, bonds, policy, or topics not tied to a listed company or stock sector.
- If "is_stock_related" is false, still return the same JSON shape and use "company": "N/A", "sentiment": "Neutral", "impact": "Neutral".
- Keep the summary short and plain.

Article:
${truncatedText}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return normalizeAnalysis(JSON.parse(response.text()));
  } catch (error) {
    if (error.status === 429) {
      console.error("Rate limit hit. Slowing down...");
      geminiUnavailable = true;
    } else {
      console.error("Gemini Error:", error.message);
      if (error.status === 404) {
        geminiUnavailable = true;
      }
    }
    return buildFallbackAnalysis(articleInput);
  }
}
