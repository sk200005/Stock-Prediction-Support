import { useEffect, useMemo, useState } from "react";
import { getCompanySignals, getMentions } from "../services/api";


function getSignalLabel(signalStrength) {
  if (signalStrength > 0) {
    return "Bullish";
  }
  if (signalStrength < 0) {
    return "Bearish";
  }
  return "Neutral";
}


function getSignalBadgeClass(signalLabel) {
  if (signalLabel === "Bullish") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (signalLabel === "Bearish") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}


export default function Companies() {
  const [companySignals, setCompanySignals] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadCompanies() {
      setLoading(true);
      setError("");

      try {
        const [signalsResponse, mentionsResponse] = await Promise.all([
          getCompanySignals(),
          getMentions(),
        ]);

        if (!ignore) {
          setCompanySignals(signalsResponse.company_signals || []);
          setMentions(mentionsResponse.mentions || []);
        }
      } catch (requestError) {
        if (!ignore) {
          setError(
            requestError?.response?.data?.detail ||
              requestError.message ||
              "Failed to load company signal data."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadCompanies();
    return () => {
      ignore = true;
    };
  }, []);

  const companyRows = useMemo(() => {
    const mentionMap = new Map(
      mentions.map((entry) => [entry.company, entry.mentions])
    );

    return companySignals.map((entry) => {
      const signalLabel = getSignalLabel(entry.signal_strength);
      return {
        company: entry.company,
        signal_strength: entry.signal_strength,
        mentions: mentionMap.get(entry.company) || 0,
        signal_label: signalLabel,
      };
    });
  }, [companySignals, mentions]);

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl border border-panelBorder bg-panel px-8 py-6 text-slate-200 shadow-soft">
          Loading company signal page...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-8 py-6 text-rose-100 shadow-soft">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h2 className="text-3xl font-semibold text-white">Company Signal List</h2>
        <p className="mt-3 max-w-2xl text-slate-400">
          A simple list of companies with their current overall market stance: bullish, bearish, or neutral.
        </p>
      </header>

      <section className="overflow-hidden rounded-3xl border border-panelBorder bg-panel shadow-soft">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-slate-800 px-6 py-4 text-xs uppercase tracking-[0.2em] text-slate-400">
          <span>Company</span>
          <span>Status</span>
          <span>Signal Strength</span>
          <span>Mentions</span>
        </div>

        {companyRows.length === 0 ? (
          <div className="px-6 py-8 text-slate-300">No company signal data available yet.</div>
        ) : (
          companyRows.map((row) => (
            <div
              key={row.company}
              className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-slate-900/70 px-6 py-5 text-sm text-slate-200 last:border-b-0"
            >
              <span className="font-medium text-white">{row.company}</span>
              <span>
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getSignalBadgeClass(
                    row.signal_label
                  )}`}
                >
                  {row.signal_label}
                </span>
              </span>
              <span>{row.signal_strength}</span>
              <span>{row.mentions}</span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
