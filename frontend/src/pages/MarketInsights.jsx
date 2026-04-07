import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getMarketInsights } from "../services/api";


const metricCardStyles = {
  signals: "border-panelBorder bg-panel",
  beat: "border-emerald-500/20 bg-emerald-500/10",
  miss: "border-rose-500/20 bg-rose-500/10",
  coverage: "border-sky-500/20 bg-sky-500/10",
};


function MetricCard({ label, value, tone = "text-white", cardTone = metricCardStyles.signals }) {
  return (
    <div className={`rounded-3xl border p-6 shadow-soft ${cardTone}`}>
      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</p>
      <p className={`mt-4 text-4xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}


function SectionShell({ title, subtitle, children, className = "" }) {
  return (
    <section className={`rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft ${className}`}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}


function MetricLine({ label, value, tone = "text-slate-100" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800/70 py-3 last:border-b-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${tone}`}>{value}</span>
    </div>
  );
}


export default function MarketInsights() {
  const [payload, setPayload] = useState({
    sentiment_price_reaction: [],
    earnings_surprise: [],
    diagnostics: [],
    generated_at: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadInsights() {
      setLoading(true);
      setError("");

      try {
        const response = await getMarketInsights();
        if (!ignore) {
          setPayload(response);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError?.response?.data?.detail ||
              requestError.message ||
              "Failed to load market insights."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInsights();
    return () => {
      ignore = true;
    };
  }, []);

  const reactionData = useMemo(
    () =>
      [...(payload.sentiment_price_reaction || [])].sort(
        (left, right) => Math.abs(right.reaction_score) - Math.abs(left.reaction_score)
      ),
    [payload.sentiment_price_reaction]
  );

  const earningsData = useMemo(
    () =>
      [...(payload.earnings_surprise || [])].sort(
        (left, right) => right.earnings_surprise - left.earnings_surprise
      ),
    [payload.earnings_surprise]
  );

  const strongestReaction = reactionData[0];
  const bestBeat = earningsData[0];
  const missCount = earningsData.filter((item) => item.earnings_surprise < 0).length;
  const trackedTickers = new Set([
    ...reactionData.map((item) => item.ticker),
    ...earningsData.map((item) => item.ticker),
  ]).size;

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl border border-panelBorder bg-panel px-8 py-6 text-slate-200 shadow-soft">
          Loading market insights...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="max-w-xl rounded-3xl border border-rose-500/30 bg-rose-500/10 px-8 py-6 text-rose-100 shadow-soft">
          <h1 className="text-xl font-semibold">Market Insights unavailable</h1>
          <p className="mt-3 text-sm leading-7">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-sky-400">Market Intelligence</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Market Insights</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            News reaction and earnings execution for the most actively discussed companies in the feed.
          </p>
        </div>

        {payload.generated_at ? (
          <div className="rounded-full border border-panelBorder bg-panel px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400 shadow-soft">
            Updated {payload.generated_at}
          </div>
        ) : null}
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reaction Signals"
          value={reactionData.length}
          tone="text-white"
          cardTone={metricCardStyles.signals}
        />
        <MetricCard
          label="Best Beat"
          value={bestBeat ? `${bestBeat.ticker} ${(bestBeat.earnings_surprise * 100).toFixed(1)}%` : "N/A"}
          tone="text-emerald-200"
          cardTone={metricCardStyles.beat}
        />
        <MetricCard
          label="Negative Surprises"
          value={missCount}
          tone="text-rose-200"
          cardTone={metricCardStyles.miss}
        />
        <MetricCard
          label="Companies Covered"
          value={trackedTickers}
          tone="text-sky-200"
          cardTone={metricCardStyles.coverage}
        />
      </section>

      {(payload.diagnostics || []).length > 0 ? (
        <section className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 shadow-soft">
          {(payload.diagnostics || []).slice(0, 3).map((item) => (
            <div key={item}>{item}</div>
          ))}
        </section>
      ) : null}

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.9fr_1fr]">
        <SectionShell title="News Impact" subtitle="Sentiment vs price move">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  type="number"
                  dataKey="sentiment"
                  name="Sentiment"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  domain={[-1, 1]}
                />
                <YAxis
                  type="number"
                  dataKey="price_change_percent"
                  name="Price Change %"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  formatter={(value, name) => [
                    typeof value === "number" ? value.toFixed(2) : value,
                    name === "price_change_percent" ? "Move %" : "Sentiment",
                  ]}
                  labelFormatter={(_, payloadItems) => payloadItems?.[0]?.payload?.ticker || ""}
                />
                <ReferenceLine x={0} stroke="#475569" />
                <ReferenceLine y={0} stroke="#475569" />
                <Scatter data={reactionData} fill="#60a5fa" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell title="Top Reaction" subtitle="Highest signal alignment">
          <div className="space-y-4">
            {reactionData.slice(0, 5).map((item) => (
              <div key={item.ticker} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{item.ticker}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {item.article_count} articles
                  </span>
                </div>
                <div className="mt-3">
                  <MetricLine label="Sentiment" value={item.sentiment.toFixed(2)} />
                  <MetricLine
                    label="Move"
                    value={`${item.price_change_percent.toFixed(2)}%`}
                    tone={item.price_change_percent >= 0 ? "text-emerald-300" : "text-rose-300"}
                  />
                  <MetricLine
                    label="Reaction"
                    value={item.reaction_score.toFixed(2)}
                    tone={item.reaction_score >= 0 ? "text-emerald-300" : "text-amber-300"}
                  />
                </div>
              </div>
            ))}
            {!strongestReaction ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                No reaction signals available.
              </div>
            ) : null}
          </div>
        </SectionShell>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.9fr_1fr]">
        <SectionShell title="Earnings Surprise" subtitle="Actual vs estimate">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earningsData} margin={{ top: 16, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="ticker" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="earnings_surprise" radius={[8, 8, 0, 0]}>
                  {earningsData.map((entry) => (
                    <Cell
                      key={entry.ticker}
                      fill={entry.earnings_surprise >= 0 ? "#22c55e" : "#f43f5e"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell title="Earnings Readout" subtitle="Latest reported beats and misses">
          <div className="space-y-4">
            {earningsData.slice(0, 6).map((item) => (
              <div key={item.ticker} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{item.ticker}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {item.period || "Recent"}
                  </span>
                </div>
                <div className="mt-3">
                  <MetricLine label="Actual EPS" value={item.actual_eps.toFixed(2)} />
                  <MetricLine label="Estimate" value={item.expected_eps.toFixed(2)} />
                  <MetricLine
                    label="Surprise"
                    value={`${(item.earnings_surprise * 100).toFixed(2)}%`}
                    tone={item.earnings_surprise >= 0 ? "text-emerald-300" : "text-rose-300"}
                  />
                </div>
              </div>
            ))}
            {earningsData.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                No earnings data available.
              </div>
            ) : null}
          </div>
        </SectionShell>
      </section>
    </main>
  );
}
