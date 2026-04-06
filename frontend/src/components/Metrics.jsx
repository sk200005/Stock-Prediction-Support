const metricStyles = {
  bullish: "from-emerald-500/20 to-emerald-700/10 border-emerald-500/30",
  bearish: "from-rose-500/20 to-rose-700/10 border-rose-500/30",
  neutral: "from-slate-500/20 to-slate-700/10 border-slate-500/30",
  companies: "from-sky-500/20 to-sky-700/10 border-sky-500/30",
};


function MetricCard({ label, value, tone }) {
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-soft ${metricStyles[tone]}`}
    >
      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
    </div>
  );
}


export default function Metrics({ stats }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total Articles" value={stats.total_articles} tone="neutral" />
      <MetricCard label="Bullish Signals" value={stats.bullish_count} tone="bullish" />
      <MetricCard label="Bearish Signals" value={stats.bearish_count} tone="bearish" />
      <MetricCard label="Companies Detected" value={stats.unique_companies} tone="companies" />
    </section>
  );
}

