import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BookOpen, TrendingUp, TrendingDown } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
    </div>
  );
}

export default function TradeHistory() {
  const [filter, setFilter] = useState<"all" | "paper" | "live">("all");

  const { data: todayStats } = trpc.trades.todayStats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: trades } = trpc.trades.list.useQuery({ limit: 100 }, { refetchInterval: 30000 });
  const filteredTrades = trades?.filter(t => filter === "all" ? true : filter === "paper" ? t.exchange === "paper" : t.exchange !== "paper");

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>交易记录</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>历史交易 · 统计分析 · 胜率追踪</p>
        </div>
        <div className="flex gap-1">
          {(["all", "paper", "live"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1 text-xs"
              style={{ border: `1px solid ${filter === f ? C.green : C.dim + "40"}`, color: filter === f ? C.green : C.dim, background: filter === f ? `${C.green}10` : "transparent", borderRadius: 2, cursor: "pointer" }}>
              {f === "all" ? "全部" : f === "paper" ? "模拟盘" : "实盘"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "总交易次数", value: String(todayStats?.count ?? 0), color: C.cyan },
          { label: "胜率", value: `${todayStats?.winRate ?? 0}%`, color: (todayStats?.winRate ?? 0) >= 60 ? C.green : C.orange },
          { label: "总盈亏", value: `${(todayStats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(todayStats?.totalPnl ?? 0).toFixed(2)}`, color: (todayStats?.totalPnl ?? 0) >= 0 ? C.green : C.pink },
          { label: "胜利次数", value: String(todayStats?.winCount ?? 0), color: C.purple },
        ].map(s => (
          <div key={s.label} className="cyber-card p-3 text-center">
            <div className="text-xs tracking-wider uppercase mb-1" style={{ color: C.dim }}>{s.label}</div>
            <div className="text-xl font-bold mono-num" style={{ fontFamily: "'Orbitron', monospace", color: s.color, textShadow: `0 0 8px ${s.color}60` }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Today stats */}
      <div className="cyber-card p-4 mb-4">
        <SectionHeader title="今日统计" />
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "今日交易", value: String(todayStats?.count ?? 0), color: C.cyan },
            { label: "今日盈亏", value: `${(todayStats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(todayStats?.totalPnl ?? 0).toFixed(2)}`, color: (todayStats?.totalPnl ?? 0) >= 0 ? C.green : C.pink },
            { label: "今日胜率", value: `${todayStats?.winRate ?? 0}%`, color: (todayStats?.winRate ?? 0) >= 60 ? C.green : C.orange },
            { label: "胜利次数", value: String(todayStats?.winCount ?? 0), color: C.green },
            { label: "总盈亏", value: `${(todayStats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(todayStats?.totalPnl ?? 0).toFixed(2)}`, color: (todayStats?.totalPnl ?? 0) >= 0 ? C.green : C.pink },
            { label: "盈利因子", value: todayStats?.winRate ? (todayStats.winRate / 100 * 2).toFixed(2) : "0.00", color: C.purple },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-xs" style={{ color: C.dim }}>{s.label}</div>
              <div className="text-sm font-bold mono-num mt-0.5" style={{ fontFamily: "'Orbitron', monospace", color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade list */}
      <div className="cyber-card p-4">
        <SectionHeader title="交易明细" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.green}20` }}>
                {["时间", "交易对", "方向", "类型", "数量", "开仓价", "平仓价", "盈亏", "状态"].map(h => (
                  <th key={h} className="text-left py-2 pr-3 font-normal" style={{ color: C.dim }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTrades && filteredTrades.length > 0 ? filteredTrades.map(t => {
                const pnl = Number(t.pnl ?? 0);
                const isLong = t.side === "LONG";
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${C.green}08` }}>
                    <td className="py-1.5 pr-3" style={{ color: C.dim }}>{new Date(t.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="py-1.5 pr-3" style={{ color: C.green }}>{t.symbol}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`badge-${isLong ? "long" : "short"}`}>{t.side}</span>
                    </td>
                    <td className="py-1.5 pr-3" style={{ color: C.dim }}>{t.exchange === "paper" ? "模拟" : "实盘"}</td>
                    <td className="py-1.5 pr-3" style={{ color: C.cyan }}>{Number(t.amount ?? 0).toFixed(4)}</td>
                    <td className="py-1.5 pr-3" style={{ color: C.dim }}>{Number(t.entryPrice ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td className="py-1.5 pr-3" style={{ color: C.dim }}>{t.exitPrice ? Number(t.exitPrice).toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}</td>
                    <td className="py-1.5 pr-3">
                      <span style={{ color: pnl >= 0 ? C.green : C.pink }}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span style={{ color: t.status === "closed" ? C.dim : t.status === "open" ? C.green : C.orange }}>
                        {t.status === "closed" ? "已平仓" : t.status === "open" ? "持仓中" : t.status}
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center" style={{ color: C.dim }}>暂无交易记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
