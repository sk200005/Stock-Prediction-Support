function limitWords(text, maxWords) {
  if (!text) return "";
  return text.split(/\s+/).slice(0, maxWords).join(" ");
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return text.substring(start, end + 1);
}

async function callOllama(prompt) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "phi3",
      prompt: prompt,
      stream: false
    })
  });

  const data = await response.json();
  return data.response.trim();
}

export async function analyzeArticle(article) {
  const description = limitWords(article.description, 300);

  const prompt = `
You are a financial news analysis system.

STRICT RULES (VERY IMPORTANT):
- If the headline contains words like:
  "Reduce", "Sell", "Cut", "Downgrade" → impact MUST be "Bearish"
- If the headline contains words like:
  "Buy", "Add", "Accumulate" → impact MUST be "Bullish"
- If the headline contains words like:
  "Hold", "Neutral" → impact MUST be "Neutral"

Task:
Analyze the given news article and return ONLY valid JSON.

If NOT stock related:
{ "is_stock_related": false }

If stock related:
{
  "is_stock_related": true,
  "company": "Company name",
  "sentiment": "Positive | Negative | Neutral",
  "impact": "Bullish | Bearish | Neutral",
  "summary": "3-4 line descriptive business summary"
}

IMPORTANT:
- Follow the STRICT RULES above even if the tone sounds positive
- Do NOT explain your reasoning
- Do NOT add extra text

Article:
Title: ${article.title}
Description: ${description}
`;


  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callOllama(
      attempt === 1
        ? prompt
        : prompt + "\nIMPORTANT: Return COMPLETE valid JSON only."
    );

    const jsonText = extractJSON(raw);
    if (!jsonText) continue;

    try {
      return JSON.parse(jsonText);
    } catch {
      console.log(`❌ Invalid JSON attempt ${attempt}`);
    }
  }

  return null;
}
