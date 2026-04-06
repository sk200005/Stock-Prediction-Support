import { memo, useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";


const COLORS = {
  Bullish: "#22c55e",
  Bearish: "#ef4444",
  Neutral: "#94a3b8",
};


function ImpactPieChart({ distribution }) {
  const data = useMemo(
    () => [
      { name: "Bullish", value: distribution.bullish ?? 0 },
      { name: "Bearish", value: distribution.bearish ?? 0 },
      { name: "Neutral", value: distribution.neutral ?? 0 },
    ],
    [distribution]
  );

  return (
    <div className="rounded-3xl border border-panelBorder bg-panel p-5 shadow-soft">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Impact Distribution</h2>
        <p className="text-sm text-slate-400">Bullish vs bearish vs neutral</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={105}
              paddingAngle={4}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "12px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-300">
        {data.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[item.name] }}
            />
            {item.name}: {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}


export default memo(ImpactPieChart);

