import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, Eye, EyeOff } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

type Exchange = "binance" | "okx" | "bybit";

const EXCHANGES: { id: Exchange; name: string; color: string; hasPassphrase: boolean }[] = [
  { id: "binance", name: "Binance", color: C.orange, hasPassphrase: false },
  { id: "okx", name: "OKX", color: C.cyan, hasPassphrase: true },
  { id: "bybit", name: "Bybit", color: C.purple, hasPassphrase: false },
];

function ExchangeCard({ exchange }: { exchange: typeof EXCHANGES[0] }) {
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", passphrase: "", enabled: false });
  const [showSecret, setShowSecret] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: config, refetch } = trpc.exchange.getConfig.useQuery({ exchange: exchange.id });
  const setConfig = trpc.exchange.setConfig.useMutation({
    onSuccess: () => { toast.success(`✅ ${exchange.name} 配置已保存`); setEditing(false); refetch(); },
    onError: () => toast.error("保存失败"),
  });

  return (
    <div className="cyber-card p-4" style={{ borderColor: `${exchange.color}30` }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: exchange.color, boxShadow: `0 0 6px ${exchange.color}` }} />
          <span className="font-bold text-sm" style={{ fontFamily: "'Orbitron', monospace", color: exchange.color }}>{exchange.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {config?.hasKey && (
            <span className="text-xs px-2 py-0.5" style={{ background: `${C.green}15`, border: `1px solid ${C.green}40`, color: C.green, borderRadius: 2 }}>
              已配置
            </span>
          )}
          <span className="text-xs px-2 py-0.5" style={{
            background: config?.enabled ? `${C.green}10` : "transparent",
            border: `1px solid ${config?.enabled ? C.green : C.dim}40`,
            color: config?.enabled ? C.green : C.dim,
            borderRadius: 2,
          }}>
            {config?.enabled ? "已启用" : "未启用"}
          </span>
        </div>
      </div>

      {/* Current config display */}
      {config?.hasKey && !editing && (
        <div className="space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span style={{ color: C.dim }}>API Key</span>
            <span style={{ color: C.cyan }}>{config.apiKey}</span>
          </div>
          {exchange.hasPassphrase && (
            <div className="flex justify-between text-xs">
              <span style={{ color: C.dim }}>Passphrase</span>
              <span style={{ color: C.cyan }}>{config.hasPassphrase ? "••••••••" : "未设置"}</span>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="space-y-2 mb-3">
          <div>
            <label className="text-xs" style={{ color: C.dim }}>API Key</label>
            <input value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} className="cyber-input mt-1" placeholder="输入 API Key" />
          </div>
          <div>
            <label className="text-xs" style={{ color: C.dim }}>API Secret</label>
            <div className="relative mt-1">
              <input type={showSecret ? "text" : "password"} value={form.apiSecret} onChange={e => setForm(p => ({ ...p, apiSecret: e.target.value }))} className="cyber-input" placeholder="输入 API Secret" style={{ paddingRight: "2.5rem" }} />
              <button onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: C.dim, background: "none", border: "none", cursor: "pointer" }}>
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {exchange.hasPassphrase && (
            <div>
              <label className="text-xs" style={{ color: C.dim }}>Passphrase</label>
              <input type="password" value={form.passphrase} onChange={e => setForm(p => ({ ...p, passphrase: e.target.value }))} className="cyber-input mt-1" placeholder="输入 Passphrase" />
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setConfig.mutate({ exchange: exchange.id, ...form, enabled: true })} className="flex-1 py-1.5 text-xs" style={{ border: `1px solid ${C.green}60`, color: C.green, background: `${C.green}10`, borderRadius: 2, cursor: "pointer" }}>
              保存
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
              取消
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <button onClick={() => setEditing(true)} className="w-full py-1.5 text-xs" style={{ border: `1px solid ${exchange.color}40`, color: exchange.color, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
          {config?.hasKey ? "修改配置" : "配置 API"}
        </button>
      )}
    </div>
  );
}

export default function LiveTrading() {
  const { data: liveStatus, refetch: refetchStatus } = trpc.exchange.liveEngineStatus.useQuery(undefined, { refetchInterval: 15000 });
  const toggleLive = trpc.exchange.toggleLiveEngine.useMutation({
    onSuccess: () => { toast.success("实盘引擎状态已更新"); refetchStatus(); },
  });

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>实盘交易</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>Binance · OKX · Bybit 三所实盘配置</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`pulse-dot ${liveStatus?.running ? "" : "pulse-dot-red"}`} style={{ width: 6, height: 6, animationDuration: liveStatus?.running ? "1.5s" : "0s", opacity: liveStatus?.running ? 1 : 0.4 }} />
            <span style={{ color: liveStatus?.running ? C.green : "oklch(0.65 0.22 25)" }}>
              {liveStatus?.running ? "实盘运行中" : "实盘已停止"}
            </span>
          </div>
          <button onClick={() => toggleLive.mutate({ running: !liveStatus?.running })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
            style={{ border: `1px solid ${liveStatus?.running ? C.pink : C.green}60`, color: liveStatus?.running ? C.pink : C.green, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <Shield size={12} />
            {liveStatus?.running ? "停止实盘" : "启动实盘"}
          </button>
        </div>
      </div>

      {/* Warning */}
      <div className="p-3 mb-4 text-xs" style={{ background: `${C.orange}08`, border: `1px solid ${C.orange}30`, borderRadius: 2, color: C.orange }}>
        ⚠️ 实盘交易使用真实资金，请确保 API 权限配置正确，并充分了解风险后再启动实盘引擎。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {EXCHANGES.map(ex => <ExchangeCard key={ex.id} exchange={ex} />)}
      </div>
    </div>
  );
}
