import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Settings } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", dim: "oklch(0.55 0.04 220)" };

export default function SystemSettings() {
  const { data: engineStatus } = trpc.engine.status.useQuery();
  const setAutoTrade = trpc.engine.setAutoTrade.useMutation({
    onSuccess: () => toast.success("设置已更新"),
  });

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="mb-4">
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>系统设置</h1>
        <p className="text-xs mt-0.5" style={{ color: C.dim }}>全局引擎配置 · 系统参数</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>引擎全局状态</span>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
          </div>
          <div className="space-y-3">
            {[
              { label: "自动交易引擎", key: "autoTrade" as const, value: engineStatus?.autoTrade },
              { label: "模拟盘引擎", key: "paperRunning" as const, value: engineStatus?.paperRunning },
              { label: "实盘引擎", key: "liveRunning" as const, value: engineStatus?.liveRunning },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
                <span className="text-xs" style={{ color: C.dim }}>{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className={`pulse-dot ${item.value ? "" : "pulse-dot-red"}`} style={{ width: 6, height: 6, animationDuration: item.value ? "1.5s" : "0s", opacity: item.value ? 1 : 0.4 }} />
                  <span className="text-xs" style={{ color: item.value ? C.green : "oklch(0.65 0.22 25)" }}>
                    {item.value ? "运行中" : "已停止"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setAutoTrade.mutate({ enabled: !engineStatus?.autoTrade })} className="mt-3 w-full py-2 text-xs"
            style={{ border: `1px solid ${engineStatus?.autoTrade ? C.pink : C.green}60`, color: engineStatus?.autoTrade ? C.pink : C.green, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            {engineStatus?.autoTrade ? "停止自动交易" : "启动自动交易"}
          </button>
        </div>

        <div className="cyber-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>系统信息</span>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
          </div>
          <div className="space-y-2 text-xs">
            {[
              { label: "系统版本", value: "v2.0.0-cyberpunk" },
              { label: "时间窗口", value: `${engineStatus?.timeWindow ?? 300}s` },
              { label: "最低评分", value: String(engineStatus?.minScore ?? 60) },
              { label: "运行时间", value: "24/7 自动运行" },
            ].map(item => (
              <div key={item.label} className="flex justify-between p-2" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
                <span style={{ color: C.dim }}>{item.label}</span>
                <span style={{ color: C.cyan }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
