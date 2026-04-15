import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Settings, RefreshCw, Play, TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
    </div>
  );
}

export default function PaperTrading() {
  const [config, setConfig] = useState({ timeWindow: 600, minScore: 52, stopLoss: 1.8, takeProfit: 5.2, positionSize: 6 });
  const [showConfig, setShowConfig] = useState(false);
  const [cycleLog, setCycleLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const { data: account, refetch: refetchAccount } = trpc.paper.account.useQuery(undefined, { refetchInterval: 30000 });
  const { data: history } = trpc.paper.balanceHistory.useQuery(undefined, { refetchInterval: 60000 });
  const { data: engineStatus, refetch: refetchStatus } = trpc.paper.engineStatus.useQuery(undefined, { refetchInterval: 15000 });

  const toggleEngine = trpc.paper.toggleEngine.useMutation({
    onSuccess: () => { toast.success("引擎状态已更新"); refetchStatus(); },
  });
  const updateConfig = trpc.paper.updateConfig.useMutation({
    onSuccess: () => { toast.success("配置已保存"); setShowConfig(false); },
  });
  const syncSnapshot = trpc.paper.syncSnapshot.useMutation({
    onSuccess: () => { toast.success("账户快照已同步"); refetchAccount(); },
  });

  const runCycle = trpc.paper.runCycle.useMutation({
    onSuccess: (data) => {
      if (!data.success) {
        toast.error(data.message ?? "引擎未启动");
        return;
      }
      const summary = `开仓 ${data.openedCount} 笔 | 平仓 ${data.closedCount} 笔 | 盈亏 $${data.totalPnl}`;
      toast.success(`周期完成：${summary}`);
      setCycleLog(prev => [
        `[${new Date().toLocaleTimeString('zh-CN')}] ${summary}`,
        ...(data.details ?? []).map((d: string) => `  → ${d}`),
        ...prev,
      ].slice(0, 50));
      setShowLog(true);
      refetchAccount();
    },
    onError: (e) => toast.error(`执行失败: ${e.message}`),
  });

  const chartData = history?.length
    ? history.map(h => ({ time: new Date(h.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), balance: h.balance }))
    : Array.from({ length: 12 }, (_, i) => ({ time: `${i * 2}:00`, balance: 10000 + Math.sin(i * 0.5) * 300 + i * 50 }));

  const acc = account ?? { totalBalance: 10000, availableBalance: 10000, unrealizedPnl: 0, dailyPnl: 0, positionCount: 0 };

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>模拟交易引擎</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>模拟试策略平台 · 用来练进场和胜率</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => syncSnapshot.mutate({ totalBalance: acc.totalBalance, availableBalance: acc.availableBalance, unrealizedPnl: acc.unrealizedPnl, dailyPnl: acc.dailyPnl, positionCount: acc.positionCount })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <RefreshCw size={12} />同步快照
          </button>
          <button
            onClick={() => runCycle.mutate()}
            disabled={runCycle.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
            style={{ border: `1px solid ${C.green}80`, color: C.green, background: `${C.green}15`, borderRadius: 2, cursor: runCycle.isPending ? "wait" : "pointer", opacity: runCycle.isPending ? 0.6 : 1 }}>
            {runCycle.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
            {runCycle.isPending ? "执行中..." : "试策略开仓"}
          </button>
          <button onClick={() => setShowConfig(!showConfig)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}60`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <Settings size={12} />引擎配置
          </button>
        </div>
      </div>

      {/* Account overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { label: "总余额", value: `$${acc.totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: C.green },
          { label: "可用余额", value: `$${acc.availableBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, color: C.cyan },
          { label: "今日盈亏", value: `${acc.dailyPnl >= 0 ? "+" : ""}$${acc.dailyPnl.toFixed(2)}`, color: acc.dailyPnl >= 0 ? C.green : C.pink },
          { label: "持仓数量", value: String(acc.positionCount), color: C.orange },
        ].map(s => (
          <div key={s.label} className="cyber-card p-3 text-center">
            <div className="text-xs tracking-wider uppercase mb-1" style={{ color: C.dim }}>{s.label}</div>
            <div className="text-lg font-bold mono-num" style={{ fontFamily: "'Orbitron', monospace", color: s.color, textShadow: `0 0 8px ${s.color}60` }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {/* Equity curve */}
        <div className="lg:col-span-2 cyber-card p-4">
          <SectionHeader title="权益曲线" />
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} width={65} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
              <Tooltip contentStyle={{ background: "oklch(0.10 0.015 240)", border: `1px solid ${C.cyan}40`, borderRadius: 2, fontSize: 11 }} labelStyle={{ color: C.dim }} itemStyle={{ color: C.cyan }} formatter={(v: number) => [`$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "余额"]} />
              <Area type="monotone" dataKey="balance" stroke={C.cyan} strokeWidth={1.5} fill="url(#eqGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Engine control */}
        <div className="cyber-card p-4">
          <SectionHeader title="引擎控制" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: C.dim }}>引擎状态</span>
              <div className="flex items-center gap-1.5">
                <span className={`pulse-dot ${engineStatus?.running ? "" : "pulse-dot-red"}`} style={{ width: 6, height: 6, animationDuration: engineStatus?.running ? "1.5s" : "0s", opacity: engineStatus?.running ? 1 : 0.4 }} />
                <span className="text-xs" style={{ color: engineStatus?.running ? C.green : "oklch(0.65 0.22 25)" }}>
                  {engineStatus?.running ? "运行中" : "已停止"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: C.dim }}>时间窗口</span>
              <span style={{ color: C.cyan }}>{engineStatus?.timeWindow ?? 300}s</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: C.dim }}>最低评分</span>
              <span style={{ color: C.cyan }}>{engineStatus?.minScore ?? 60}</span>
            </div>
            <button
              onClick={() => toggleEngine.mutate({ running: !engineStatus?.running })}
              className="w-full py-2 text-xs mt-2"
              style={{
                border: `1px solid ${engineStatus?.running ? C.pink : C.green}60`,
                color: engineStatus?.running ? C.pink : C.green,
                background: engineStatus?.running ? `${C.pink}08` : `${C.green}08`,
                borderRadius: 2, cursor: "pointer",
              }}>
              {engineStatus?.running ? "⏹ 停止引擎" : "▶ 启动引擎"}
            </button>
          </div>
        </div>
      </div>

      {/* Positions list */}
      <PositionsListSection C={C} />

      {/* Cycle log */}
      {showLog && cycleLog.length > 0 && (
        <div className="cyber-card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <SectionHeader title="引擎执行日志" />
            <button onClick={() => setShowLog(false)} className="text-xs" style={{ color: C.dim }}>收起</button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {cycleLog.map((line, i) => (
              <div key={i} className="text-xs font-mono" style={{
                color: line.includes('开仓') ? C.green : line.includes('平仓') ? C.cyan : line.includes('止损') ? C.pink : line.includes('止盈') ? C.orange : C.dim,
                paddingLeft: line.startsWith('  →') ? 12 : 0,
              }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="cyber-card p-4 mb-4">
          <SectionHeader title="试策略配置" />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "时间窗口(s)", key: "timeWindow" as const, min: 60, max: 3600 },
              { label: "最低评分", key: "minScore" as const, min: 0, max: 100 },
              { label: "止损(%)", key: "stopLoss" as const, min: 0.5, max: 20 },
              { label: "止盈(%)", key: "takeProfit" as const, min: 1, max: 50 },
              { label: "仓位(%)", key: "positionSize" as const, min: 1, max: 100 },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs" style={{ color: C.dim }}>{f.label}</label>
                <input type="number" value={config[f.key]} min={f.min} max={f.max}
                  onChange={e => setConfig(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                  className="cyber-input mt-1" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => updateConfig.mutate(config)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.green}60`, color: C.green, background: `${C.green}10`, borderRadius: 2, cursor: "pointer" }}>
              保存试策略参数
            </button>
            <button onClick={() => setShowConfig(false)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PositionsListSection({ C }: { C: Record<string, string> }) {
  const { data: positions } = trpc.paper.positions.useQuery(undefined, { refetchInterval: 15000 });

  if (!positions || positions.length === 0) {
    return (
      <div className="cyber-card p-4 mb-4">
        <SectionHeader title="当前持仓" />
        <div className="text-center py-6 text-xs" style={{ color: C.dim }}>暂无持仓 · 等待策略信号触发开仓</div>
      </div>
    );
  }

  return (
    <div className="cyber-card p-4 mb-4">
      <SectionHeader title={`当前持仓 (${positions.length})`} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: C.dim }}>
              {["币种", "方向", "开仓价", "数量", "未实现盈亏", "止损", "止盈"].map(h => (
                <th key={h} className="text-left py-1.5 pr-3 font-normal tracking-wider uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid oklch(0.20 0.02 240)` }}>
                <td className="py-2 pr-3 font-bold" style={{ color: C.cyan }}>{p.symbol}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1" style={{ color: p.side === "LONG" ? C.green : C.pink }}>
                    {p.side === "LONG" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {p.side}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono" style={{ color: C.dim }}>${Number(p.entryPrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td className="py-2 pr-3 font-mono" style={{ color: C.dim }}>{Number(p.size).toFixed(4)}</td>
                <td className="py-2 pr-3 font-mono font-bold" style={{ color: Number(p.unrealizedPnl) >= 0 ? C.green : C.pink }}>
                  {Number(p.unrealizedPnl) >= 0 ? "+" : ""}${Number(p.unrealizedPnl).toFixed(2)}
                </td>
                <td className="py-2 pr-3 font-mono" style={{ color: C.pink }}>{p.stopLoss ? `$${Number(p.stopLoss).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                <td className="py-2 font-mono" style={{ color: C.orange }}>{p.takeProfit ? `$${Number(p.takeProfit).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
