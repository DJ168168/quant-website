import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Radio, Zap } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

export default function Resonance() {
  const { data: signals } = trpc.signals.list.useQuery({ limit: 30 }, { refetchInterval: 15000 });
  const batchInject = trpc.signals.batchInject.useMutation({ onSuccess: () => toast.success("✅ 共振信号已注入") });

  const fomoSignals = signals?.filter(s => s.type === "FOMO") ?? [];
  const alphaSignals = signals?.filter(s => s.type === "ALPHA") ?? [];
  const resonanceSignals = fomoSignals.filter(f => alphaSignals.some(a => a.symbol === f.symbol));

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>共振引擎</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>FOMO + Alpha 双信号共振检测</p>
        </div>
        <button onClick={() => batchInject.mutate()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.orange}60`, color: C.orange, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
          <Zap size={12} />注入测试信号
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {[{ label: "FOMO 缓存", value: fomoSignals.length, color: C.orange }, { label: "Alpha 缓存", value: alphaSignals.length, color: C.purple }, { label: "共振信号", value: resonanceSignals.length, color: C.green }].map(s => (
          <div key={s.label} className="cyber-card p-4 text-center">
            <div className="text-xs tracking-wider uppercase mb-2" style={{ color: C.dim }}>{s.label}</div>
            <div className="text-4xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: s.color, textShadow: `0 0 15px ${s.color}60` }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>FOMO 信号列表</span>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.orange}40, transparent)` }} />
          </div>
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 300 }}>
            {fomoSignals.length > 0 ? fomoSignals.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 text-xs" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2, borderLeft: `2px solid ${C.orange}` }}>
                <div className="flex gap-2 items-center">
                  <span className="badge-fomo">FOMO</span>
                  <span style={{ color: C.green }}>{s.symbol}</span>
                </div>
                <div className="flex gap-3">
                  <span style={{ color: C.orange }}>评分: {s.score}</span>
                  <span style={{ color: C.dim }}>{new Date(s.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            )) : <div className="text-xs text-center py-4" style={{ color: C.dim }}>暂无 FOMO 信号</div>}
          </div>
        </div>

        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>共振信号（FOMO+Alpha）</span>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
          </div>
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 300 }}>
            {resonanceSignals.length > 0 ? resonanceSignals.map(s => (
              <div key={s.id} className="p-3 text-xs" style={{ background: `${C.green}08`, border: `1px solid ${C.green}30`, borderRadius: 2 }}>
                <div className="flex justify-between mb-1">
                  <div className="flex gap-2 items-center">
                    <Radio size={12} style={{ color: C.green }} />
                    <span style={{ color: C.green, fontWeight: "bold" }}>{s.symbol}</span>
                    <span style={{ color: C.dim }}>共振确认</span>
                  </div>
                  <span style={{ color: C.green, textShadow: `0 0 6px ${C.green}` }}>评分: {s.score}</span>
                </div>
                <div style={{ color: C.dim }}>FOMO 热度 + Alpha 强度同时触发，建议关注</div>
              </div>
            )) : (
              <div className="text-xs text-center py-8" style={{ color: C.dim }}>
                <Radio size={24} style={{ color: C.dim, margin: "0 auto 8px" }} />
                <div>暂无共振信号</div>
                <div className="mt-1">等待 FOMO 与 Alpha 信号同时触发...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
