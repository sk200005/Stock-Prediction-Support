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
Return ONLY valid JSON.
No explanations.
No markdown.
No extra text.

If NOT stock related:
{ "is_stock_related": false }

If stock related:
{
  "is_stock_related": true,
  "company": "Company name",
  "sentiment": "Positive | Negative | Neutral",
  "impact": "Bullish | Bearish | Neutral",
  "summary": "2–3 line business summary"
}

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
