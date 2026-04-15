import { trpc } from "@/lib/trpc";
import { TrendingUp } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

export default function Sentiment() {
  const { data: fearGreed } = trpc.valueScan.fearGreed.useQuery(undefined, { refetchInterval: 60000 });
  const { data: social } = trpc.valueScan.socialSentiment.useQuery(undefined, { refetchInterval: 60000 });

  const fgValue = fearGreed?.value ?? 50;
  const fgColor = fgValue >= 75 ? C.orange : fgValue >= 55 ? C.green : fgValue >= 45 ? C.cyan : fgValue >= 25 ? C.orange : C.pink;

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="mb-4">
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>情绪分析</h1>
        <p className="text-xs mt-0.5" style={{ color: C.dim }}>市场恐贪指数 · 社媒情绪追踪</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <div className="cyber-card p-6 text-center">
          <div className="text-xs tracking-widest uppercase mb-3" style={{ color: C.dim }}>恐贪指数</div>
          <div className="text-7xl font-bold mb-2" style={{ fontFamily: "'Orbitron', monospace", color: fgColor, textShadow: `0 0 30px ${fgColor}80` }}>{fgValue}</div>
          <div className="text-lg" style={{ color: fgColor }}>{fearGreed?.label ?? "中性"}</div>
          <div className="mt-4 h-3 rounded-full" style={{ background: "oklch(0.15 0.02 240)" }}>
            <div className="h-3 rounded-full" style={{ width: `${fgValue}%`, background: `linear-gradient(90deg, ${C.pink}, ${C.orange}, ${C.green})`, boxShadow: `0 0 8px ${fgColor}` }} />
          </div>
          <div className="flex justify-between text-xs mt-1" style={{ color: C.dim }}>
            <span>极度恐慌 0</span><span>50 中性</span><span>100 极度贪婪</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
            <div className="p-2" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
              <div style={{ color: C.dim }}>昨日</div>
              <div style={{ color: C.cyan, fontFamily: "'Orbitron', monospace" }}>{fearGreed?.yesterday ?? 48}</div>
            </div>
            <div className="p-2" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
              <div style={{ color: C.dim }}>周均</div>
              <div style={{ color: C.cyan, fontFamily: "'Orbitron', monospace" }}>{fearGreed?.week ?? 45}</div>
            </div>
          </div>
        </div>

        <div className="cyber-card p-4">
          <div className="text-xs tracking-widest uppercase mb-3" style={{ color: C.dim }}>社媒情绪排行</div>
          <div className="space-y-3">
            {social?.sentiment.map((s: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>{s.symbol}</span>
                    <span style={{ color: C.dim }}>{s.mentions.toLocaleString()} 提及</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: s.score >= 60 ? C.green : s.score >= 40 ? C.cyan : C.pink }}>{s.label}</span>
                    <span style={{ color: C.dim, fontFamily: "'Orbitron', monospace" }}>{s.score}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "oklch(0.15 0.02 240)" }}>
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${s.score}%`, background: s.score >= 60 ? C.green : s.score >= 40 ? C.cyan : C.pink, boxShadow: `0 0 4px ${s.score >= 60 ? C.green : s.score >= 40 ? C.cyan : C.pink}` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
