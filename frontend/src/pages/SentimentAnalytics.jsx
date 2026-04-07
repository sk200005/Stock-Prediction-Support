import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getSentimentAnalytics } from "../services/api";


function SectionShell({ title, subtitle, description, children }) {
  return (
    <section className="rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        {description ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}


function SummaryCard({ label, value, tone }) {
  return (
    <div className="rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}


function formatTimestamp(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}


function formatSentiment(value) {
  return typeof value === "number" ? value.toFixed(2) : value;
}


const companyTrendPalette = [
  "#22c55e",
  "#38bdf8",
  "#f59e0b",
  "#ef4444",
  "#a78bfa",
  "#14b8a6",
  "#f97316",
  "#e879f9",
  "#84cc16",
  "#f43f5e",
];


export default function SentimentAnalytics() {
  const [payload, setPayload] = useState({
    sentiment_trend: [],
    news_impact: [],
    company_sentiment: [],
    company_sentiment_trend: [],
    generated_at: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const response = await getSentimentAnalytics();
        if (!ignore) {
          setPayload(response);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError?.response?.data?.detail ||
              requestError.message ||
              "Failed to load sentiment analytics."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();
    return () => {
      ignore = true;
    };
  }, []);

  const trendData = useMemo(
    () =>
      (payload.sentiment_trend || []).map((item) => ({
        ...item,
        short_time: formatTimestamp(item.time),
      })),
    [payload.sentiment_trend]
  );

  const impactData = useMemo(
    () =>
      [...(payload.news_impact || [])].sort(
        (left, right) => Math.abs(right.impact_score) - Math.abs(left.impact_score)
      ),
    [payload.news_impact]
  );

  const companySentimentData = useMemo(
    () => [...(payload.company_sentiment || [])].sort((left, right) => right.avg_sentiment - left.avg_sentiment),
    [payload.company_sentiment]
  );

  const companyTrendConfig = useMemo(
    () =>
      companySentimentData.slice(0, 10).map((item, index) => ({
        company: item.company,
        color: companyTrendPalette[index % companyTrendPalette.length],
      })),
    [companySentimentData]
  );

  const companyTrendData = useMemo(() => {
    const activeCompanies = new Set(companyTrendConfig.map((item) => item.company));
    const buckets = new Map();

    for (const item of payload.company_sentiment_trend || []) {
      if (!activeCompanies.has(item.company)) {
        continue;
      }

      if (!buckets.has(item.time)) {
        buckets.set(item.time, {
          time: item.time,
          short_time: formatTimestamp(item.time),
        });
      }

      buckets.get(item.time)[item.company] = item.avg_sentiment;
    }

    return [...buckets.values()].sort((left, right) => new Date(left.time) - new Date(right.time));
  }, [payload.company_sentiment_trend, companyTrendConfig]);

  const strongestCompany = companySentimentData[0];
  const weakestCompany = companySentimentData[companySentimentData.length - 1];
  const confirmedMoves = impactData.filter((item) => item.impact_score >= 0).length;

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl border border-panelBorder bg-panel px-8 py-6 text-slate-200 shadow-soft">
          Loading market sentiment analytics...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="max-w-xl rounded-3xl border border-rose-500/30 bg-rose-500/10 px-8 py-6 text-rose-100 shadow-soft">
          <h1 className="text-xl font-semibold">Sentiment analytics unavailable</h1>
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
          <h1 className="mt-3 text-4xl font-semibold text-white">Market Sentiment Analytics</h1>
          <p className="mt-3 max-w-3xl text-slate-400">
            A professional view of how financial news sentiment evolves over time, how prices react,
            and which companies are receiving the strongest positive or negative coverage.
          </p>
        </div>

        {payload.generated_at ? (
          <div className="rounded-full border border-panelBorder bg-panel px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400 shadow-soft">
            Updated {formatTimestamp(payload.generated_at)}
          </div>
        ) : null}
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Trend Points"
          value={trendData.length}
          tone="text-sky-200"
        />
        <SummaryCard
          label="Confirmed Moves"
          value={confirmedMoves}
          tone="text-emerald-200"
        />
        <SummaryCard
          label="Top Positive Company"
          value={strongestCompany ? `${strongestCompany.company} ${strongestCompany.avg_sentiment.toFixed(2)}` : "N/A"}
          tone="text-white"
        />
      </section>

      <div className="mt-8 grid gap-6">
        <SectionShell
          title="Market Sentiment Trend"
          subtitle="Sentiment Trend Over Time"
          description="This line chart groups articles by publication hour and averages the sentiment score, helping you see when the overall news flow turned more bullish or bearish."
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 16, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="short_time"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  minTickGap={32}
                />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[-1, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  formatter={(value) => [formatSentiment(value), "Avg Sentiment"]}
                  labelFormatter={(_, items) => items?.[0]?.payload?.short_time || ""}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Line
                  type="monotone"
                  dataKey="avg_sentiment"
                  stroke="#22c55e"
                  strokeWidth={3}
                  dot={({ cx, cy, payload, index }) => (
                    <circle
                      key={`dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={payload.avg_sentiment >= 0 ? "#22c55e" : "#ef4444"}
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                  )}
                  activeDot={{ r: 6, fill: "#f8fafc" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell
          title="Top 10 Company Sentiment Trends"
          subtitle="Sentiment Trend Over Time for Each Company"
          description="This multi-line chart tracks the top 10 most-mentioned companies over time, so you can compare how company-specific sentiment shifts across the same market window."
        >
          <div className="h-[28rem]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={companyTrendData} margin={{ top: 16, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="short_time"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  minTickGap={32}
                />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[-1, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  formatter={(value, name) => [formatSentiment(value), name]}
                  labelFormatter={(_, items) => items?.[0]?.payload?.short_time || ""}
                />
                <Legend wrapperStyle={{ color: "#cbd5e1", paddingTop: "12px" }} />
                <ReferenceLine y={0} stroke="#475569" />
                {companyTrendConfig.map((item) => (
                  <Line
                    key={item.company}
                    type="monotone"
                    dataKey={item.company}
                    name={item.company}
                    stroke={item.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell
          title="News Impact vs Market Reaction"
          subtitle="News Impact vs Price Movement"
          description="Each point represents an article-level news signal. When sentiment and price move in the same direction, the impact score is positive and the market is confirming the news."
        >
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  type="number"
                  dataKey="sentiment_score"
                  name="Sentiment Score"
                  domain={[-1, 1]}
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
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
                    formatSentiment(value),
                    name === "price_change_percent" ? "Price Move %" : name,
                  ]}
                  labelFormatter={(_, items) => {
                    const item = items?.[0]?.payload;
                    if (!item) {
                      return "";
                    }
                    return `${item.company} • ${formatTimestamp(item.published_at)}`;
                  }}
                />
                <ReferenceLine x={0} stroke="#475569" />
                <ReferenceLine y={0} stroke="#475569" />
                <Scatter data={impactData}>
                  {impactData.map((item, index) => (
                    <Cell
                      key={`${item.company}-${item.published_at}-${index}`}
                      fill={item.sentiment_score >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </SectionShell>

        <SectionShell
          title="Average News Sentiment by Company"
          subtitle="Average Sentiment Per Company"
          description="This bar chart aggregates average sentiment by company and includes article volume, making it easier to separate a persistent narrative from one-off headlines."
        >
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={companySentimentData}
                margin={{ top: 16, right: 18, left: 0, bottom: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="company"
                  tick={{ fill: "#cbd5e1", fontSize: 12 }}
                  angle={-25}
                  textAnchor="end"
                  height={68}
                  interval={0}
                />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[-1, 1]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                  }}
                  formatter={(value, name, item) => {
                    if (name === "avg_sentiment") {
                      return [formatSentiment(value), "Avg Sentiment"];
                    }
                    return [item?.payload?.articles ?? value, "Articles"];
                  }}
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Bar dataKey="avg_sentiment" radius={[10, 10, 0, 0]}>
                  {companySentimentData.map((item) => (
                    <Cell
                      key={item.company}
                      fill={item.avg_sentiment >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {weakestCompany ? (
            <p className="mt-4 text-sm text-slate-400">
              Most negative current coverage: <span className="font-semibold text-rose-300">{weakestCompany.company}</span>{" "}
              at {weakestCompany.avg_sentiment.toFixed(2)} across {weakestCompany.articles} articles.
            </p>
          ) : null}
        </SectionShell>
      </div>
    </main>
  );
}
