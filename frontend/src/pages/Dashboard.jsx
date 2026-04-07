import { useEffect, useMemo, useState } from "react";
import ArticleCard from "../components/ArticleCard";
import CompanyMentionsChart from "../components/CompanyMentionsChart";
import ImpactPieChart from "../components/ImpactPieChart";
import Metrics from "../components/Metrics";
import SignalChart from "../components/SignalChart";
import {
  getArticles,
  getCompanySignals,
  getImpactDistribution,
  getMentions,
  getStats,
  runPipeline,
} from "../services/api";


const PAGE_SIZE = 6;


function parsePublishedDate(dateString) {
  const timestamp = Date.parse(dateString);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}


export default function Dashboard() {
  const [articles, setArticles] = useState([]);
  const [stats, setStats] = useState({
    total_articles: 0,
    bullish_count: 0,
    bearish_count: 0,
    neutral_count: 0,
    unique_companies: 0,
  });
  const [companySignals, setCompanySignals] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [impactDistribution, setImpactDistribution] = useState({
    bullish: 0,
    bearish: 0,
    neutral: 0,
  });
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [error, setError] = useState("");
  const [pipelineError, setPipelineError] = useState("");
  const [pipelineLogs, setPipelineLogs] = useState([]);
  const [pipelineSuccess, setPipelineSuccess] = useState("");
  const [pipelineSummary, setPipelineSummary] = useState("");
  const [showPipelineLogs, setShowPipelineLogs] = useState(false);
  const [page, setPage] = useState(1);

  async function loadDashboard() {
    setError("");

    const [articlesRes, statsRes, signalsRes, mentionsRes, impactRes] = await Promise.all([
      getArticles(),
      getStats(),
      getCompanySignals(),
      getMentions(),
      getImpactDistribution(),
    ]);

    setArticles(articlesRes.articles || []);
    setStats(statsRes);
    setCompanySignals(signalsRes.company_signals || []);
    setMentions(mentionsRes.mentions || []);
    setImpactDistribution(impactRes);
  }

  useEffect(() => {
    let ignore = false;

    async function bootstrapDashboard() {
      setLoading(true);
      setError("");

      try {
        await loadDashboard();
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError?.response?.data?.detail ||
              requestError.message ||
              "Failed to load dashboard data."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    bootstrapDashboard();
    return () => {
      ignore = true;
    };
  }, []);

  const safeArticles = useMemo(
    () =>
      articles
        .filter((article) => article && typeof article === "object")
        .sort(
          (left, right) =>
            parsePublishedDate(right.published_at) - parsePublishedDate(left.published_at)
        ),
    [articles]
  );

  const totalPages = Math.max(1, Math.ceil(safeArticles.length / PAGE_SIZE));
  const paginatedArticles = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return safeArticles.slice(startIndex, startIndex + PAGE_SIZE);
  }, [safeArticles, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="rounded-3xl border border-panelBorder bg-panel px-8 py-6 text-slate-200 shadow-soft">
          Loading market intelligence dashboard...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="max-w-xl rounded-3xl border border-rose-500/30 bg-rose-500/10 px-8 py-6 text-rose-100 shadow-soft">
          <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
          <p className="mt-3 text-sm leading-7">{error}</p>
        </div>
      </div>
    );
  }

  async function handleRefreshPipeline() {
    setPipelineRunning(true);
    setPipelineError("");
    setPipelineSuccess("");
    setPipelineSummary("");

    try {
      const result = await runPipeline();
      setPipelineLogs(result.logs || []);
      setShowPipelineLogs(false);
      await loadDashboard();
      setPage(1);
      setPipelineSuccess("News fetched and analysis completed successfully.");
      setPipelineSummary(
        result.message ||
          `${result.new_articles_added || 0} new analyzed articles added. Total stored articles: ${result.total_articles || 0}.`
      );
    } catch (requestError) {
      setPipelineError(
        requestError?.response?.data?.detail ||
          requestError.message ||
          "Pipeline execution failed."
      );
    } finally {
      setPipelineRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-sky-400">Market Intelligence</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">Financial News Market Signals</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            A React dashboard powered by Finnhub, FastAPI, spaCy, and FinBERT to track company
            mentions, sentiment, price movement, and market impact from stock news.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshPipeline}
          disabled={pipelineRunning}
          className="rounded-full border border-sky-400/40 bg-sky-500/15 px-5 py-3 text-sm font-semibold text-sky-200 transition hover:border-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pipelineRunning ? "Fetching and analyzing..." : "Fetch News and Analyze"}
        </button>
      </header>

      {pipelineError ? (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
          {pipelineError}
        </div>
      ) : null}

      {pipelineSuccess ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          <div className="font-medium">{pipelineSuccess}</div>
          {pipelineSummary ? <div className="mt-1 text-emerald-200/90">{pipelineSummary}</div> : null}
        </div>
      ) : null}

      {pipelineLogs.length > 0 ? (
        <div className="mb-6 rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Latest Pipeline Run</h2>
            <button
              type="button"
              onClick={() => setShowPipelineLogs((current) => !current)}
              className="rounded-full border border-panelBorder bg-slate-950/50 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
            >
              {showPipelineLogs ? "Hide Logs" : "Show Logs"}
            </button>
          </div>

          {!showPipelineLogs ? (
            <p className="mt-3 text-sm text-slate-400">
              The latest pipeline run completed. Expand logs only if you want to inspect ingestion and model output.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {pipelineLogs.map((log) => (
                <div key={log.command} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="font-mono text-xs text-sky-300">$ {log.command}</p>
                  {log.stdout ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">{log.stdout}</pre> : null}
                  {log.stderr ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-amber-300">{log.stderr}</pre> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Metrics stats={stats} />

      <section className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SignalChart data={companySignals} />
        </div>
        <div className="xl:col-span-1">
          <ImpactPieChart distribution={impactDistribution} />
        </div>
      </section>

      <section className="mt-6">
        <CompanyMentionsChart data={mentions} />
      </section>

      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">Company News Feed</h2>
            <p className="mt-1 text-sm text-slate-400">
              Paginated Finnhub article cards with price-aware market signals and summaries.
            </p>
          </div>
          <div className="rounded-full border border-panelBorder bg-panel px-4 py-2 text-sm text-slate-300">
            Page {page} of {totalPages}
          </div>
        </div>

        {paginatedArticles.length === 0 ? (
          <div className="rounded-3xl border border-panelBorder bg-panel p-8 text-slate-300 shadow-soft">
            No articles are available from the API right now. Check that
            <span className="mx-1 font-semibold text-white">processedArticles.json</span>
            has articles and the FastAPI backend is running.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {paginatedArticles.map((article) => (
              <ArticleCard
                key={`${article.title}-${article.published_at}-${article.link}`}
                article={article}
              />
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="rounded-full border border-panelBorder bg-panel px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page === totalPages}
            className="rounded-full border border-panelBorder bg-panel px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
