import { NavLink, Outlet } from "react-router-dom";


const linkBaseClass =
  "rounded-full px-4 py-2 text-sm font-medium transition";


export default function AppShell() {
  return (
    <div className="min-h-screen bg-transparent">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 pt-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-sky-400">Market Intelligence</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Financial News Market Signals</h1>
        </div>

        <div className="flex items-center gap-3 rounded-full border border-panelBorder bg-panel px-2 py-2 shadow-soft">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `${linkBaseClass} ${
                isActive
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/companies"
            className={({ isActive }) =>
              `${linkBaseClass} ${
                isActive
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            Companies
          </NavLink>
          <NavLink
            to="/market-insights"
            className={({ isActive }) =>
              `${linkBaseClass} ${
                isActive
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            Market Insights
          </NavLink>
          <NavLink
            to="/sentiment-analytics"
            className={({ isActive }) =>
              `${linkBaseClass} ${
                isActive
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            Sentiment Analytics
          </NavLink>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
