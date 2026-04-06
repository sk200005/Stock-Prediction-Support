const impactStyles = {
  Bullish: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Bearish: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  Neutral: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};


export default function ArticleCard({ article }) {
  const analysis = article.analysis || {};
  const impact = analysis.impact || "Neutral";
  const summarySource = analysis.summary_source === "gemini" ? "Gemini Summary" : "Fallback Summary";

  return (
    <article className="flex h-full flex-col justify-between rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
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
            <p className="text-slate-500">Company</p>
            <p className="mt-1 font-medium text-slate-100">{analysis.company || "Unknown"}</p>
          </div>
          <div>
            <p className="text-slate-500">Sentiment</p>
            <p className="mt-1 font-medium capitalize text-slate-100">{analysis.sentiment || "neutral"}</p>
          </div>
          <div>
            <p className="text-slate-500">Signal Score</p>
            <p className="mt-1 font-medium text-slate-100">{analysis.signal_score ?? 0}</p>
          </div>
          <div>
            <p className="text-slate-500">Summary Source</p>
            <p className="mt-1 font-medium text-slate-100">{summarySource}</p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-7 text-slate-300">{analysis.summary || "No summary available."}</p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">{article.published_at || "Unknown date"}</p>
        <a
          href={article.link}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-sky-400 transition hover:text-sky-300"
        >
          Read article
        </a>
      </div>
    </article>
  );
}
