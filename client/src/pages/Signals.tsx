import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Zap, RefreshCw, TrendingUp } from "lucide-react";

const C = {
  green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)",
  orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)",
  purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)",
};

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
    </div>
  );
}

export default function Signals() {
  const [form, setForm] = useState({ type: "FOMO" as "FOMO" | "ALPHA" | "RISK" | "LONG" | "SHORT", symbol: "BTC", score: 80, rsi: 65, ema: 45000, fearGreed: 55, longShortRatio: 1.2, fundingRate: 0.0001 });
  const [selectedSymbol, setSelectedSymbol] = useState("BTC");

  const { data: signals, refetch } = trpc.signals.list.useQuery({ limit: 50 }, { refetchInterval: 15000 });
  const { data: factorScore, refetch: refetchFactor } = trpc.signals.factorScore.useQuery({ symbol: selectedSymbol }, { refetchInterval: 30000 });
  const inject = trpc.signals.inject.useMutation({ onSuccess: () => { toast.success("✅ 信号注入成功"); refetch(); }, onError: () => toast.error("注入失败") });
  const batchInject = trpc.signals.batchInject.useMutation({ onSuccess: (d) => { toast.success(`✅ 批量注入 ${d.count} 条信号`); refetch(); } });

  const scoreColor = (s: number) => s >= 70 ? C.green : s >= 50 ? C.cyan : s >= 30 ? C.orange : C.pink;

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>信号控制台</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>多因子信号评分与手动注入</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => batchInject.mutate()} disabled={batchInject.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.orange}60`, color: C.orange, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <Zap size={12} />{batchInject.isPending ? "注入中..." : "批量注入"}
          </button>
          <button onClick={() => refetch()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.green}60`, color: C.green, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <RefreshCw size={12} />刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {/* Factor score panel */}
        <div className="cyber-card p-4">
          <SectionHeader title="多因子评分" />
          <div className="flex gap-2 mb-3 flex-wrap">
            {["BTC", "ETH", "SOL", "BNB", "XRP"].map(s => (
              <button key={s} onClick={() => { setSelectedSymbol(s); refetchFactor(); }}
                className="px-2 py-0.5 text-xs"
                style={{ border: `1px solid ${selectedSymbol === s ? C.green : C.dim + "40"}`, color: selectedSymbol === s ? C.green : C.dim, background: selectedSymbol === s ? `${C.green}10` : "transparent", borderRadius: 2, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
          {factorScore && (
            <div className="space-y-2">
              {Object.entries(factorScore.factors).map(([key, f]) => {
                const labels: Record<string, string> = { rsi: "RSI", ema: "EMA趋势", fearGreed: "恐贪指数", longShortRatio: "多空比", fundingRate: "资金费率" };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span style={{ color: C.dim }}>{labels[key]}</span>
                      <div className="flex gap-2">
                        <span style={{ color: C.cyan }}>{String(f.value)}</span>
                        <span style={{ color: scoreColor(f.score) }}>{f.score}分</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full" style={{ background: "oklch(0.15 0.02 240)" }}>
                      <div className="h-1 rounded-full transition-all" style={{ width: `${f.score}%`, background: scoreColor(f.score), boxShadow: `0 0 4px ${scoreColor(f.score)}` }} />
                    </div>
                  </div>
                );
              })}
              <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${C.green}20` }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: C.dim }}>综合评分</span>
                  <span className="text-xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: scoreColor(factorScore.totalScore), textShadow: `0 0 10px ${scoreColor(factorScore.totalScore)}60` }}>
                    {factorScore.totalScore}
                  </span>
                </div>
                <div className="text-center mt-1">
                  <span className={`badge-${factorScore.signal.toLowerCase()}`}>{factorScore.signal}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual inject form */}
        <div className="cyber-card p-4">
          <SectionHeader title="手动注入信号" />
          <div className="space-y-2">
            <div>
              <label className="text-xs" style={{ color: C.dim }}>信号类型</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as typeof form.type }))}
                className="cyber-input mt-1" style={{ background: "oklch(0.12 0.02 240)", border: `1px solid ${C.green}30`, color: C.green, fontFamily: "'Share Tech Mono', monospace", fontSize: "0.875rem", padding: "0.4rem 0.6rem", width: "100%", borderRadius: 2, outline: "none" }}>
                {["FOMO", "ALPHA", "RISK", "LONG", "SHORT"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs" style={{ color: C.dim }}>交易对</label>
              <input value={form.symbol} onChange={e => setForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                className="cyber-input mt-1" placeholder="BTC" />
            </div>
            <div>
              <label className="text-xs" style={{ color: C.dim }}>信号评分 (0-100)</label>
              <input type="number" value={form.score} onChange={e => setForm(p => ({ ...p, score: Number(e.target.value) }))}
                className="cyber-input mt-1" min={0} max={100} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs" style={{ color: C.dim }}>RSI</label>
                <input type="number" value={form.rsi} onChange={e => setForm(p => ({ ...p, rsi: Number(e.target.value) }))} className="cyber-input mt-1" />
              </div>
              <div>
                <label className="text-xs" style={{ color: C.dim }}>恐贪指数</label>
                <input type="number" value={form.fearGreed} onChange={e => setForm(p => ({ ...p, fearGreed: Number(e.target.value) }))} className="cyber-input mt-1" />
              </div>
            </div>
            <button
              onClick={() => inject.mutate({ ...form, rsi: form.rsi, ema: form.ema, fearGreed: form.fearGreed, longShortRatio: form.longShortRatio, fundingRate: form.fundingRate })}
              disabled={inject.isPending}
              className="w-full py-2 text-xs mt-2"
              style={{ border: `1px solid ${C.green}60`, color: C.green, background: `${C.green}10`, borderRadius: 2, cursor: "pointer", fontFamily: "'Share Tech Mono', monospace" }}>
              {inject.isPending ? "注入中..." : "▶ 注入信号"}
            </button>
          </div>
        </div>

        {/* Signal list */}
        <div className="cyber-card p-4">
          <SectionHeader title="信号流" />
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 380 }}>
            {signals && signals.length > 0 ? signals.map(s => (
              <div key={s.id} className="p-2 text-xs" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2, borderLeft: `2px solid ${s.type === "FOMO" ? C.orange : s.type === "ALPHA" ? C.purple : s.type === "RISK" ? C.pink : C.green}` }}>
                <div className="flex justify-between mb-0.5">
                  <div className="flex gap-1.5 items-center">
                    <span className={`badge-${s.type.toLowerCase()}`}>{s.type}</span>
                    <span style={{ color: C.green }}>{s.symbol}</span>
                  </div>
                  <span style={{ color: C.dim }}>{new Date(s.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                <div className="flex gap-3" style={{ color: C.dim }}>
                  <span>评分: <span style={{ color: scoreColor(s.score ?? 0) }}>{s.score}</span></span>
                  {s.rsi && <span>RSI: {Number(s.rsi).toFixed(1)}</span>}
                  {s.fearGreed && <span>FG: {s.fearGreed}</span>}
                </div>
              </div>
            )) : (
              <div className="text-xs text-center py-8" style={{ color: C.dim }}>暂无信号数据</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
