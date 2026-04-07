const impactStyles = {
  Bullish: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Bearish: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  Neutral: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

function formatPriceChange(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return {
      label: "N/A",
      className: "text-slate-200",
      indicator: "Price",
    };
  }

  const numericValue = Number(value);
  if (numericValue > 0) {
    return {
      label: `+${numericValue.toFixed(2)}%`,
      className: "text-emerald-300",
      indicator: "Price ↑",
    };
  }

  if (numericValue < 0) {
    return {
      label: `${numericValue.toFixed(2)}%`,
      className: "text-rose-300",
      indicator: "Price ↓",
    };
  }

  return {
    label: "0.00%",
    className: "text-slate-200",
    indicator: "Price",
  };
}

export default function ArticleCard({ article }) {
  const analysis = article.analysis || {};
  const priceData = article.price_data || {};
  const impact = article.impact || analysis.impact || "Neutral";
  const summarySource = analysis.summary_source === "gemini" ? "Gemini Summary" : "Fallback Summary";
  const ticker = article.company || article.tickers?.[0] || article.companies?.[0] || analysis.company || "Unknown";
  const priceChange = formatPriceChange(
    article.price_change_percent ?? priceData.percent_change
  );
  const currentPrice = article.current_price ?? priceData.current_price;
  const priceLabel = currentPrice !== null && currentPrice !== undefined
    ? `$${Number(currentPrice).toFixed(2)}`
    : "N/A";
  const signalScore = article.signal_score ?? analysis.signal_score ?? 0;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-panelBorder bg-panel shadow-soft">
      {article.image ? (
        <img
          src={article.image}
          alt={article.title}
          className="h-48 w-full object-cover"
        />
      ) : (
        <div className="h-48 w-full bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.95),_rgba(30,41,59,0.85))]" />
      )}

      <div className="flex h-full flex-col justify-between p-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{article.source}</p>
              <h3 className="mt-2 text-lg font-semibold leading-7 text-white">{article.title}</h3>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${impactStyles[impact]}`}
            >
              {impact}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <div>
              <p className="text-slate-500">Ticker</p>
              <p className="mt-1 font-medium text-slate-100">{ticker}</p>
            </div>
            <div>
              <p className="text-slate-500">Sentiment</p>
              <p className="mt-1 font-medium capitalize text-slate-100">{article.sentiment || analysis.sentiment || "neutral"}</p>
            </div>
            <div>
              <p className="text-slate-500">Signal Score</p>
              <p className="mt-1 font-medium text-slate-100">{Number(signalScore).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-slate-500">Summary Source</p>
              <p className="mt-1 font-medium text-slate-100">{summarySource}</p>
            </div>
            <div>
              <p className="text-slate-500">{priceChange.indicator}</p>
              <p className={`mt-1 font-medium ${priceChange.className}`}>{priceChange.label}</p>
            </div>
            <div>
              <p className="text-slate-500">Current Price</p>
              <p className="mt-1 font-medium text-slate-100">{priceLabel}</p>
            </div>
          </div>

          <p className="mt-5 text-sm leading-7 text-slate-300">{article.summary || analysis.summary || "No summary available."}</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <p className="text-xs text-slate-500">{article.published_at || "Unknown date"}</p>
          <a
            href={article.url || article.link}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-sky-400 transition hover:text-sky-300"
          >
            Read article
          </a>
        </div>
      </div>
    </article>
  );
}
