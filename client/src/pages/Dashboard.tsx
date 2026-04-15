import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RefreshCw, Zap, TrendingUp, TrendingDown, Shield, Activity, DollarSign, BarChart2, Play, Square, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const C = {
  green: "oklch(0.85 0.28 145)",
  cyan: "oklch(0.80 0.22 200)",
  orange: "oklch(0.72 0.22 50)",
  pink: "oklch(0.72 0.28 340)",
  purple: "oklch(0.75 0.2 290)",
  dim: "oklch(0.55 0.04 220)",
  bg: "oklch(0.07 0.01 240)",
  card: "oklch(0.10 0.015 240)",
  border: "oklch(0.85 0.28 145 / 0.2)",
  red: "oklch(0.65 0.25 25)",
};

function StatCard({ label, value, sub, color = C.green, icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <div className="cyber-card p-4" style={{ flex: 1, minWidth: 0 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs tracking-wider uppercase" style={{ color: C.dim }}>{label}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="text-2xl font-bold mono-num" style={{ color, fontFamily: "'Orbitron', monospace", textShadow: `0 0 10px ${color}80` }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1" style={{ color: C.dim }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>{title}</span>
      {badge && <span className="text-xs px-1.5 py-0.5" style={{ background: `${C.green}20`, color: C.green, borderRadius: 2 }}>{badge}</span>}
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
    </div>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const isLong = signal === "LONG";
  const isShort = signal === "SHORT";
  const color = isLong ? C.green : isShort ? C.pink : C.dim;
  const label = isLong ? "✅ 做多" : isShort ? "❌ 做空" : "⌛ 观望";
  return (
    <span className="text-lg font-bold" style={{ color, fontFamily: "'Orbitron', monospace", textShadow: `0 0 12px ${color}80` }}>
      {label}
    </span>
  );
}

function MiniChart({ points, up }: { points: number[]; up: boolean }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const path = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * 220 + 8;
    const y = 88 - ((p - min) / Math.max(1, max - min)) * 70;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 240 96" width="100%" height="96" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={up ? C.green : C.pink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── 权益曲线迷你 SVG
function EquityCurve({ points }: { points: number[] }) {
  if (points.length < 2) return <div style={{ color: C.dim, fontSize: 11, textAlign: "center", padding: "16px 0" }}>信号记录增多后自动生成曲线</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 560, h = 90;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (w - 16) + 8;
    const y = h - 8 - ((p - min) / range) * (h - 16);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const isUp = points[points.length - 1] >= points[0];
  const color = isUp ? C.green : C.pink;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${w - 8} ${h - 8} L 8 ${h - 8} Z`} fill="url(#eqFill)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="8" y="14" fill={C.dim} fontSize="9" fontFamily="'Share Tech Mono', monospace">${points[0].toFixed(0)}</text>
      <text x={w - 8} y="14" fill={color} fontSize="9" fontFamily="'Share Tech Mono', monospace" textAnchor="end">${points[points.length - 1].toFixed(0)}</text>
    </svg>
  );
}

// ─── 历史信号回测面板
function BacktestPanel() {
  const { data } = trpc.engine.signalHistory.useQuery({ limit: 200 }, { refetchInterval: 60000 });
  const stats = data?.stats;

  const items = [
    { label: "📈 做多胜率", value: stats ? (stats.longWins + stats.longLosses > 0 ? `${stats.longWinRate}%` : "累计中") : "--", color: C.green, sub: stats ? `${stats.longWins}胜 / ${stats.longLosses}负` : "" },
    { label: "📉 做空胜率", value: stats ? (stats.shortWins + stats.shortLosses > 0 ? `${stats.shortWinRate}%` : "累计中") : "--", color: C.pink, sub: stats ? `${stats.shortWins}胜 / ${stats.shortLosses}负` : "" },
    { label: "🏆 综合胜率", value: stats ? (stats.wins + stats.losses > 0 ? `${stats.realWinRate}%` : "累计中") : "--", color: C.cyan, sub: stats ? `${stats.wins}胜 ${stats.losses}负 ${stats.pending}待定` : "" },
    { label: "⚖️ 盈亏比", value: stats?.profitLossRatio ? `${stats.profitLossRatio}x` : "--", color: stats && stats.profitLossRatio >= 2 ? C.green : C.orange, sub: "止盈 / 止损均值" },
    { label: "✅ 止盈命中率", value: stats ? `${stats.takeProfitHitRate}%` : "--", color: C.green, sub: `${stats?.wins ?? 0} 次触发止盈` },
    { label: "🛑 止损命中率", value: stats ? `${stats.stopLossHitRate}%` : "--", color: C.pink, sub: `${stats?.losses ?? 0} 次触发止损` },
    { label: "🔴 最大连亏", value: stats ? `${stats.maxConsecLosses} 笔` : "--", color: (stats?.maxConsecLosses ?? 0) >= 3 ? C.orange : C.dim, sub: "连续亏损最多次数" },
    { label: "📉 最大回撤", value: stats ? `${stats.maxDrawdown}%` : "--", color: (stats?.maxDrawdown ?? 0) >= 10 ? C.pink : C.green, sub: "基于止盈止损模拟" },
  ];

  return (
    <div className="cyber-card p-4 mt-4">
      <SectionHeader title="历史信号回测" badge={`共 ${stats?.total ?? 0} 条信号`} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {items.map(it => (
          <div key={it.label} className="p-3" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 4, border: `1px solid ${it.color}20` }}>
            <div className="text-[10px] mb-1" style={{ color: C.dim }}>{it.label}</div>
            <div className="text-xl font-bold" style={{ color: it.color, fontFamily: "'Orbitron', monospace" }}>{it.value}</div>
            {it.sub && <div className="text-[10px] mt-0.5" style={{ color: C.dim }}>{it.sub}</div>}
          </div>
        ))}
      </div>
      <div>
        <div className="text-[10px] mb-2" style={{ color: C.dim }}>📊 权益曲线（每笔 $1000 模拟，基于实际止盈止损）</div>
        <EquityCurve points={data?.stats?.equityCurve ?? []} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [countdown, setCountdown] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [executing, setExecuting] = useState(false);

  // ─── 数据查询（30秒自动刷新，对齐原始 index.html 的 setInterval 5s→30s）
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = trpc.dashboard.overview.useQuery(undefined, { refetchInterval: 30000 });
  const { data: history } = trpc.dashboard.balanceHistory.useQuery(undefined, { refetchInterval: 60000 });
  const { data: bestSignal, refetch: refetchSignal } = trpc.engine.getBestSignal.useQuery(undefined, { refetchInterval: 30000 });
  const { data: riskStatus, refetch: refetchRisk } = trpc.engine.riskStatus.useQuery(undefined, { refetchInterval: 30000 });
  const { data: recentTrades, refetch: refetchTrades } = trpc.trades.list.useQuery({ limit: 8 }, { refetchInterval: 30000 });
  const { data: cgFearGreed } = trpc.coinglass.fearGreed.useQuery({ limit: 3 }, { refetchInterval: 60000 });
  const { data: vsFearGreed } = trpc.valueScan.fearGreed.useQuery(undefined, { refetchInterval: 120000 });
  const { data: engineStatus } = trpc.engine.status.useQuery(undefined, { refetchInterval: 15000 });

  // ─── Mutations
  const markOutcome = trpc.engine.markSignalOutcome.useMutation({
    onSuccess: () => { toast.success("结果已记录"); refetchHistory(); },
  });
  const setAutoTrade = trpc.engine.setAutoTrade.useMutation({
    onSuccess: () => { toast.success("引擎状态已更新"); refetchOverview(); },
  });
  const toggleLive = trpc.exchange.toggleLiveEngine.useMutation({
    onSuccess: () => { toast.success("实盘引擎状态已更新"); refetchOverview(); },
  });
  const liveExecute = trpc.engine.liveExecute.useMutation({
    onSuccess: (d) => {
      setExecuting(false);
      if (d.success) {
        toast.success(d.message);
        refetchTrades();
        refetchRisk();
      } else {
        toast.error(d.message);
      }
    },
    onError: (e) => { setExecuting(false); toast.error(e.message); },
  });

  // ─── 30秒倒计时（对齐原始 index.html 的 setInterval）
  const doRefreshAll = useCallback(() => {
    refetchSignal();
    refetchOverview();
    refetchTrades();
    refetchRisk();
    setLastRefresh(new Date());
    setCountdown(30);
  }, [refetchSignal, refetchOverview, refetchTrades, refetchRisk]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { doRefreshAll(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [doRefreshAll]);

  // ─── 恐贪指数
  const fearGreed = (() => {
    if (cgFearGreed?.data?.data_list) {
      const list = cgFearGreed.data.data_list;
      const value = Math.round(list[0] ?? 50);
      const yesterday = Math.round(list[1] ?? value);
      const week = Math.round((list.slice(0, 7).reduce((a: number, b: number) => a + b, 0)) / Math.min(list.length, 7));
      const label = value <= 25 ? "极度恐慌" : value <= 45 ? "恐慌" : value <= 55 ? "中性" : value <= 75 ? "贪婪" : "极度贪婪";
      return { value, label, yesterday, week, source: "CoinGlass" };
    }
    if (vsFearGreed) return { ...vsFearGreed, source: "ValueScan" };
    return null;
  })();

  const acc = overview?.account;
  const engines = overview?.engines;
  const sigs = overview?.signals;
  const fgValue = fearGreed?.value ?? 50;
  const fgColor = fgValue >= 75 ? C.orange : fgValue >= 55 ? C.green : fgValue >= 45 ? C.cyan : fgValue >= 25 ? C.orange : C.pink;
  const signal = bestSignal?.signal ?? "WAIT";
  const winRate = bestSignal?.win ?? 0;
  const strategy = bestSignal?.strategy ?? "等待信号";
  const signalColor = signal === "LONG" ? C.green : signal === "SHORT" ? C.pink : C.dim;

  const handleExecute = () => {
    if (!bestSignal || signal === "WAIT") { toast.error("当前无有效信号"); return; }
    if (!riskStatus?.canTrade) { toast.error(riskStatus?.paused ? `风控暂停，剩余 ${riskStatus.pauseRemainingMin} 分钟` : "今日已达最大下单数"); return; }
    setExecuting(true);
    liveExecute.mutate({
      symbol: "BTC",
      signal: signal as "LONG" | "SHORT",
      winRate,
      strategy,
      stopLossPct: bestSignal?.stop ?? 1.8,
      takeProfitPct: bestSignal?.take ?? 8.0,
    });
  };

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      {/* ─── 顶部标题栏 + 倒计时 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>
            🚀 实盘量化终端
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>
            实时信号 · 策略执行 · 风险控制 &nbsp;|&nbsp;
            <span style={{ color: C.cyan }}>上次刷新: {lastRefresh.toLocaleTimeString("zh-CN")}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}40`, color: C.cyan, borderRadius: 2 }}>
            <Clock size={11} />
            <span style={{ fontFamily: "'Orbitron', monospace" }}>{countdown}s</span>
          </div>
          <button
            onClick={doRefreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all"
            style={{ border: `1px solid ${C.green}60`, color: C.green, background: "transparent", borderRadius: 2, cursor: "pointer" }}
          >
            <RefreshCw size={12} />
            刷新
          </button>
        </div>
      </div>

      {/* ─── 四大指标卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="总余额" value={`$${(acc?.totalBalance ?? 10000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub="USDT" color={C.green} icon={<DollarSign size={16} />} />
        <StatCard label="今日盈亏" value={`${(acc?.dailyPnl ?? 0) >= 0 ? "+" : ""}$${(acc?.dailyPnl ?? 0).toFixed(2)}`} sub={`${(acc?.dailyPnl ?? 0) >= 0 ? "盈利" : "亏损"}`} color={(acc?.dailyPnl ?? 0) >= 0 ? C.green : C.pink} icon={<TrendingUp size={16} />} />
        <StatCard label="今日下单" value={`${riskStatus?.dailyCount ?? 0} / ${riskStatus?.dailyMax ?? 5}`} sub={!riskStatus ? "加载中..." : riskStatus.paused ? `风控暂停 ${riskStatus.pauseRemainingMin}min` : riskStatus.canTrade ? "可交易" : "已达上限"} color={!riskStatus ? C.dim : riskStatus?.canTrade ? C.cyan : C.orange} icon={<Activity size={16} />} />
        <StatCard label="当前持仓" value={`${acc?.positionCount ?? 0}`} sub={`未实现 $${(acc?.unrealizedPnl ?? 0).toFixed(2)}`} color={C.purple} icon={<BarChart2 size={16} />} />
      </div>

      <div className="cyber-card p-4 mb-4">
        <SectionHeader title="真实账户曲线" badge="首页可见" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
          <div className="lg:col-span-2">
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between"><span style={{ color: C.dim }}>实盘状态</span><span style={{ color: engines?.liveRunning ? C.green : C.pink }}>{engines?.liveRunning ? "运行中" : "已停止"}</span></div>
            <div className="flex items-center justify-between"><span style={{ color: C.dim }}>自动交易</span><span style={{ color: engines?.autoTrade ? C.green : C.pink }}>{engines?.autoTrade ? "开启" : "关闭"}</span></div>
            <div className="flex items-center justify-between"><span style={{ color: C.dim }}>最优信号</span><span style={{ color: signalColor }}>{signal}</span></div>
            <div className="flex items-center justify-between"><span style={{ color: C.dim }}>胜率</span><span style={{ color: signalColor }}>{winRate}%</span></div>
          </div>
        </div>
      </div>

      {/* ─── 主体：信号卡 + 引擎状态 + 恐贪指数 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">

        {/* 当前最优信号（复刻 index.html #sig 模块） */}
        <div className="cyber-card p-5" style={{ borderColor: `${signalColor}40` }}>
          <SectionHeader title="当前最优信号" badge="30s 刷新" />
          <div className="flex flex-col items-center justify-center py-4 gap-3">
            <SignalBadge signal={signal} />
            <div className="text-3xl font-bold mono-num" style={{ fontFamily: "'Orbitron', monospace", color: signalColor, textShadow: `0 0 20px ${signalColor}80` }}>
              {winRate}%
            </div>
            <div className="text-xs text-center" style={{ color: C.dim }}>{strategy}</div>
            {bestSignal?.factors && (
              <div className="w-full grid grid-cols-2 gap-1 mt-2">
                {[
                  { label: "OI 24h", value: `${(bestSignal.factors.oiChange24h ?? 0).toFixed(1)}%` },
                  { label: "资金费率", value: `${((bestSignal.factors.avgFundingRate ?? 0) * 100).toFixed(4)}%` },
                  { label: "恐贪", value: String(bestSignal.factors.fearGreedValue ?? 50) },
                  { label: "多空比", value: (bestSignal.factors.longShortRatio ?? 1).toFixed(2) },
                  { label: "爆仓比 多/空", value: (bestSignal.factors.liqRatio ?? 1).toFixed(2), highlight: (bestSignal.factors.liqRatio ?? 1) > 1.5 || (bestSignal.factors.liqRatio ?? 1) < 0.67 },
                  { label: "VS信号/风险", value: `${bestSignal.factors.vsSignalCount ?? 0}/${bestSignal.factors.vsRiskCount ?? 0}` },
                ].map(f => (
                  <div key={f.label} className="flex justify-between text-xs px-2 py-1" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
                    <span style={{ color: C.dim }}>{f.label}</span>
                    <span style={{ color: (f as any).highlight ? C.orange : C.cyan }}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
            {bestSignal && bestSignal.signal !== "WAIT" && (
              <div className="w-full flex gap-1 mt-1">
                <div className="flex-1 text-center text-xs py-1" style={{ background: `${C.pink}15`, borderRadius: 2, color: C.pink }}>
                  止损 {bestSignal.stop}%
                </div>
                <div className="flex-1 text-center text-xs py-1" style={{ background: `${C.green}15`, borderRadius: 2, color: C.green }}>
                  止盈 {bestSignal.take}%
                </div>
              </div>
            )}
          </div>
          {/* 实盘执行按钮（复刻 index.html #toggle 按钮） */}
          <button
            onClick={handleExecute}
            disabled={executing || signal === "WAIT" || !riskStatus?.canTrade}
            className="w-full py-2.5 text-sm font-bold transition-all mt-2"
            style={{
              background: executing ? "transparent" : signal === "LONG" ? `${C.green}20` : signal === "SHORT" ? `${C.pink}20` : "transparent",
              border: `1px solid ${executing ? C.dim : signal === "LONG" ? C.green : signal === "SHORT" ? C.pink : C.dim}`,
              color: executing ? C.dim : signal === "LONG" ? C.green : signal === "SHORT" ? C.pink : C.dim,
              borderRadius: 2,
              cursor: executing || signal === "WAIT" || !riskStatus?.canTrade ? "not-allowed" : "pointer",
              fontFamily: "'Orbitron', monospace",
              opacity: signal === "WAIT" || !riskStatus?.canTrade ? 0.5 : 1,
            }}
          >
            {executing ? "⏳ 下单中..." : signal === "LONG" ? "▲ 实盘做多" : signal === "SHORT" ? "▼ 实盘做空" : "⌛ 等待信号"}
          </button>
        </div>

        <div className="cyber-card p-4">
          <SectionHeader title="账户余额走势" />
        </div>

        {/* 引擎状态 + 恐贪指数（复刻 index.html #stat 模块） */}
        <div className="flex flex-col gap-3">
          {/* 恐贪指数 */}
          <div className="cyber-card p-4">
            <SectionHeader title="恐贪指数" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold mono-num" style={{ fontFamily: "'Orbitron', monospace", color: fgColor, textShadow: `0 0 15px ${fgColor}80` }}>
                  {fgValue}
                </div>
                <div className="text-sm mt-1" style={{ color: fgColor }}>{fearGreed?.label ?? "中性"}</div>
              </div>
              <div className="text-right text-xs" style={{ color: C.dim }}>
                <div>昨日: {fearGreed?.yesterday ?? 48}</div>
                <div>周均: {fearGreed?.week ?? 45}</div>
                <div className="mt-1" style={{ color: `${fgColor}60`, fontSize: 9 }}>{fearGreed?.source ?? "--"}</div>
              </div>
            </div>
          </div>

          {/* 引擎状态开关（复刻 index.html 运行状态 + 开关按钮） */}
          <div className="cyber-card p-4 flex-1">
            <SectionHeader title="引擎状态" />
            <div className="space-y-2 mb-3">
              {[
                { label: "自动交易", value: engines?.autoTrade },
                { label: "模拟引擎", value: engines?.paperRunning },
                { label: "实盘引擎", value: engines?.liveRunning },
              ].map(e => {
                const isKnown = engines !== undefined;
                const dotColor = !isKnown ? C.dim : e.value ? C.green : C.red;
                const textColor = !isKnown ? C.dim : e.value ? C.green : C.red;
                const label = !isKnown ? "···" : e.value ? "运行中" : "已停止";
                return (
                  <div key={e.label} className="flex items-center justify-between text-xs">
                    <span style={{ color: C.dim }}>{e.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="pulse-dot" style={{ width: 6, height: 6, background: dotColor, borderRadius: "50%", display: "inline-block", boxShadow: (isKnown && e.value) ? `0 0 6px ${C.green}` : "none" }} />
                      <span style={{ color: textColor }}>{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setAutoTrade.mutate({ enabled: !engines?.autoTrade })}
                className="flex-1 py-1.5 text-xs transition-all"
                style={{
                  border: `1px solid ${engines?.autoTrade ? C.pink : C.green}60`,
                  color: engines?.autoTrade ? C.pink : C.green,
                  background: "transparent", borderRadius: 2, cursor: "pointer",
                }}
              >
                {engines?.autoTrade ? <><Square size={10} style={{ display: "inline", marginRight: 4 }} />停止</> : <><Play size={10} style={{ display: "inline", marginRight: 4 }} />启动</>}
              </button>
              <button
                onClick={() => toggleLive.mutate({ running: !engines?.liveRunning })}
                className="flex-1 py-1.5 text-xs transition-all"
                style={{
                  border: `1px solid ${engines?.liveRunning ? C.orange : C.cyan}60`,
                  color: engines?.liveRunning ? C.orange : C.cyan,
                  background: "transparent", borderRadius: 2, cursor: "pointer",
                }}
              >
                {engines?.liveRunning ? "停实盘" : "开实盘"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 最近交易记录（复刻 index.html #log 模块） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 信号统计 */}
        <div className="cyber-card p-4">
          <SectionHeader title="今日信号统计" />
          <div className="space-y-3">
            {[
              { label: "FOMO 信号", value: sigs?.fomo ?? 0, color: C.orange },
              { label: "ALPHA 信号", value: sigs?.alpha ?? 0, color: C.purple },
              { label: "风险信号", value: sigs?.risk ?? 0, color: C.pink },
              { label: "总计", value: sigs?.total ?? 0, color: C.cyan },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: C.dim }}>{s.label}</span>
                <span className="text-sm font-bold mono-num" style={{ color: s.color, fontFamily: "'Orbitron', monospace" }}>{s.value}</span>
              </div>
            ))}
            <div className="pt-2 border-t" style={{ borderColor: `${C.green}20` }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: C.dim }}>今日下单</span>
                <span style={{ color: riskStatus?.canTrade ? C.green : C.orange, fontFamily: "'Orbitron', monospace" }}>
                  {riskStatus?.dailyCount ?? 0} / {riskStatus?.dailyMax ?? 5}
                </span>
              </div>
              {riskStatus?.paused && (
                <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: C.orange }}>
                  <AlertTriangle size={10} />
                  风控暂停 {riskStatus.pauseRemainingMin} 分钟
                </div>
              )}
              {riskStatus?.canTrade && !riskStatus?.paused && (
                <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: C.green }}>
                  <CheckCircle size={10} />
                  风控正常，可交易
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 最近8条交易记录（复刻 index.html #log 模块） */}
        <div className="lg:col-span-2 cyber-card p-4">
          <SectionHeader title="最近交易" badge={`共 ${recentTrades?.length ?? 0} 条`} />
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 220 }}>
            {recentTrades && recentTrades.length > 0 ? recentTrades.slice(0, 8).map((t, i) => (
              <div key={t.id ?? i} className="flex items-center justify-between text-xs py-1.5 px-2" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: C.dim, fontSize: 10 }}>{t.exchange?.toUpperCase()}</span>
                  <span style={{ color: C.green }}>{t.symbol}</span>
                  <span className="font-bold" style={{ color: t.side === "LONG" ? C.green : C.pink }}>
                    {t.side === "LONG" ? "▲ 多" : "▼ 空"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {t.pnl !== null && t.pnl !== undefined && (
                    <span style={{ color: Number(t.pnl) >= 0 ? C.green : C.pink }}>
                      {Number(t.pnl) >= 0 ? "+" : ""}{Number(t.pnl).toFixed(2)} USDT
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5" style={{
                    background: t.status === "open" ? `${C.cyan}20` : t.status === "closed" ? `${C.green}20` : `${C.dim}20`,
                    color: t.status === "open" ? C.cyan : t.status === "closed" ? C.green : C.dim,
                    borderRadius: 2,
                  }}>
                    {t.status === "open" ? "持仓" : t.status === "closed" ? "已平" : t.status}
                  </span>
                  <span style={{ color: C.dim }}>{new Date(t.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            )) : (
              <div className="text-xs text-center py-6" style={{ color: C.dim }}>
                暂无交易记录<br />
                <span style={{ fontSize: 10 }}>信号达到 80% 胜率时将自动执行实盘</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 历史信号回测面板 */}
      <BacktestPanel />
    </div>
  );
}
