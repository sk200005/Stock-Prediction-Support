import { memo, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";


function CompanyMentionsChart({ data }) {
  const chartData = useMemo(() => data.slice(0, 10), [data]);

  return (
    <div className="rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Most Mentioned Companies</h2>
        <p className="text-sm text-slate-400">Mention count per company</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="company" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
            <YAxis tick={{ fill: "#cbd5e1" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "12px",
              }}
            />
            <Bar dataKey="mentions" fill="#38bdf8" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


export default memo(CompanyMentionsChart);

