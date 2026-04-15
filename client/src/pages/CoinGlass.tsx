import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Zap, Activity, AlertTriangle, DollarSign, ToggleLeft, ToggleRight, Lock, Crown } from "lucide-react";

// ─── 颜色常量 ─────────────────────────────────────────────────────────────────
const LONG_COLOR = "#00ff88";
const SHORT_COLOR = "#ff2d6b";
const NEUTRAL_COLOR = "#00e5ff";
const DIM = "#1a1a2e";

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];
const INTERVALS = [
  { label: "4H", value: "4h" },
  { label: "6H", value: "6h" },
  { label: "8H", value: "8h" },
  { label: "12H", value: "12h" },
  { label: "1D", value: "1d" },
];

function fmt(n: number, decimals = 2) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(decimals)}`;
}

function pct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(4)}%`;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
}

// ─── 恐贪指数颜色 ─────────────────────────────────────────────────────────────
function fgColor(v: number) {
  if (v <= 25) return "#ff2d6b";
  if (v <= 45) return "#ff8c00";
  if (v <= 55) return "#ffd700";
  if (v <= 75) return "#00ff88";
  return "#00e5ff";
}
function fgLabel(v: number) {
  if (v <= 25) return "极度恐慌";
  if (v <= 45) return "恐慌";
  if (v <= 55) return "中性";
  if (v <= 75) return "贪婪";
  return "极度贪婪";
}

// ─── 通用卡片 ─────────────────────────────────────────────────────────────────
function CyberCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-[#00ff88]/20 bg-black/60 backdrop-blur rounded-sm ${className}`}>
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#00ff88]/60" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#00ff88]/60" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[#00ff88]/60" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[#00ff88]/60" />
      <div className="px-4 py-2 border-b border-[#00ff88]/10">
        <span className="text-xs font-bold tracking-widest text-[#00ff88]/70 uppercase">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── 加载骨架 ─────────────────────────────────────────────────────────────────
function Skeleton({ h = "h-32" }: { h?: string }) {
  return <div className={`${h} bg-[#00ff88]/5 animate-pulse rounded`} />;
}

// ─── 恐贪指数仪表盘 ───────────────────────────────────────────────────────────
function FearGreedGauge({ value }: { value: number }) {
  const color = fgColor(value);
  const label = fgLabel(value);
  const angle = (value / 100) * 180 - 90; // -90 to 90 degrees
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-40 h-20 overflow-hidden">
        {/* 半圆背景 */}
        <svg viewBox="0 0 160 80" className="w-full h-full">
          <path d="M 10 80 A 70 70 0 0 1 150 80" fill="none" stroke="#ff2d6b" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 40 80 A 50 50 0 0 1 120 80" fill="none" stroke="#ffd700" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          <path d="M 60 80 A 30 30 0 0 1 100 80" fill="none" stroke="#00ff88" strokeWidth="12" strokeLinecap="round" opacity="0.3" />
          {/* 指针 */}
          <line
            x1="80" y1="80"
            x2={80 + 60 * Math.cos(((angle - 90) * Math.PI) / 180)}
            y2={80 + 60 * Math.sin(((angle - 90) * Math.PI) / 180)}
            stroke={color} strokeWidth="3" strokeLinecap="round"
          />
          <circle cx="80" cy="80" r="5" fill={color} />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-4xl font-black" style={{ color, textShadow: `0 0 20px ${color}` }}>{value}</div>
        <div className="text-sm font-bold mt-1" style={{ color }}>{label}</div>
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function CoinGlass() {
  const [symbol, setSymbol] = useState("BTC");
  const [interval, setIntervalVal] = useState("4h");
  const [frRange, setFrRange] = useState(7);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 数据查询 ────────────────────────────────────────────────────────────────
  const { data: frData, isLoading: frLoading, refetch: refetchFR } =
    trpc.coinglass.fundingRate.useQuery({ symbol }, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: frAccumData, isLoading: frAccumLoading } =
    trpc.coinglass.fundingRateAccum.useQuery({ symbol, range: frRange }, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: oiData, isLoading: oiLoading, refetch: refetchOI } =
    trpc.coinglass.openInterest.useQuery({ symbol }, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: oiHistData, isLoading: oiHistLoading, refetch: refetchOIHist } =
    trpc.coinglass.openInterestHistory.useQuery({ symbol, interval, limit: 24 }, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: liqListData, isLoading: liqListLoading, refetch: refetchLiqList } =
    trpc.coinglass.liquidationList.useQuery({}, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: liqHistData, isLoading: liqHistLoading, refetch: refetchLiqHist } =
    trpc.coinglass.liquidationHistory.useQuery({ symbol, interval, limit: 24 }, { staleTime: 60000, refetchInterval: autoRefresh ? 30000 : false });

  const { data: fgData, isLoading: fgLoading, refetch: refetchFG } =
    trpc.coinglass.fearGreed.useQuery({ limit: 30 }, { staleTime: 300000, refetchInterval: autoRefresh ? 60000 : false });

  // ─── 处理资金费率数据 ─────────────────────────────────────────────────────────
  const frRows = useMemo(() => {
    if (!frData?.data) return [];
    const symbolData = frData.data.find((d: any) => d.symbol === symbol);
    if (!symbolData) return [];
    const list = symbolData.stablecoin_margin_list ?? [];
    return list
      .filter((x: any) => x.exchange !== "All")
      .sort((a: any, b: any) => Math.abs(b.funding_rate) - Math.abs(a.funding_rate))
      .slice(0, 12);
  }, [frData, symbol]);

  // ─── 处理持仓量数据 ───────────────────────────────────────────────────────────
  const oiRows = useMemo(() => {
    if (!oiData?.data) return [];
    return oiData.data
      .filter((x: any) => x.exchange !== "All")
      .sort((a: any, b: any) => b.open_interest_usd - a.open_interest_usd)
      .slice(0, 10);
  }, [oiData]);

  const oiTotal = useMemo(() => {
    if (!oiData?.data) return 0;
    const all = oiData.data.find((x: any) => x.exchange === "All");
    return all?.open_interest_usd ?? 0;
  }, [oiData]);

  // ─── 处理持仓量历史 ───────────────────────────────────────────────────────────
  const oiHistRows = useMemo(() => {
    if (!oiHistData?.data) return [];
    return oiHistData.data.map((x: any) => ({
      time: fmtTime(x.time),
      oi: Number(x.close) / 1e9,
    }));
  }, [oiHistData]);

  // ─── 处理清算列表 ─────────────────────────────────────────────────────────────
  const liqTop = useMemo(() => {
    if (!liqListData?.data) return [];
    return liqListData.data
      .filter((x: any) => x.liquidation_usd_24h > 0)
      .sort((a: any, b: any) => b.liquidation_usd_24h - a.liquidation_usd_24h)
      .slice(0, 20);
  }, [liqListData]);

  // ─── 处理清算历史 ─────────────────────────────────────────────────────────────
  const liqHistRows = useMemo(() => {
    if (!liqHistData?.data) return [];
    return liqHistData.data.map((x: any) => ({
      time: fmtTime(x.time),
      long: Number(x.aggregated_long_liquidation_usd) / 1e6,
      short: Number(x.aggregated_short_liquidation_usd) / 1e6,
    }));
  }, [liqHistData]);

  // ─── 处理恐贪指数 ─────────────────────────────────────────────────────────────
  const fgCurrent = useMemo(() => {
    if (!fgData?.data?.data_list) return 50;
    return Math.round(fgData.data.data_list[0] ?? 50);
  }, [fgData]);

  const fgHistory = useMemo(() => {
    if (!fgData?.data?.data_list) return [];
    const list = fgData.data.data_list.slice(0, 14).reverse();
    const times = fgData.data.time_list?.slice(0, 14).reverse() ?? [];
    return list.map((v: number, i: number) => ({
      time: times[i] ? new Date(times[i] * 1000).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : `D-${i}`,
      value: Math.round(v),
    }));
  }, [fgData]);

  // ─── 处理资金费率累计 ─────────────────────────────────────────────────────────
  const frAccumRows = useMemo(() => {
    if (!frAccumData?.data) return [];
    const symbolData = frAccumData.data.find((d: any) => d.symbol === symbol);
    if (!symbolData) return [];
    return (symbolData.stablecoin_margin_list ?? [])
      .filter((x: any) => x.exchange !== "All")
      .sort((a: any, b: any) => Math.abs(b.accumulated_funding_rate) - Math.abs(a.accumulated_funding_rate))
      .slice(0, 10);
  }, [frAccumData, symbol]);

  // 手动刷新所有数据
  const handleRefreshAll = useCallback(() => {
    refetchFR();
    refetchOI();
    refetchOIHist();
    refetchLiqList();
    refetchLiqHist();
    refetchFG();
    setCountdown(30);
  }, [refetchFR, refetchOI, refetchOIHist, refetchLiqList, refetchLiqHist, refetchFG]);

  // 自动刷新倒计时
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current);
      setCountdown(30);
      return;
    }
    setCountdown(30);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh]);

  return (
    <div className="min-h-screen bg-black text-[#e0ffe0] font-mono p-4 space-y-4">
      {/* ─── 顶部标题栏 ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#00ff88]/20 pb-3">
        <div>
          <h1 className="text-xl font-black tracking-widest text-[#00ff88]" style={{ textShadow: "0 0 20px #00ff88" }}>
            COINGLASS 数据面板
          </h1>
          <p className="text-xs text-[#00ff88]/50 mt-0.5">实时衍生品市场数据 · 多空分析 · 清算监控</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 自动刷新开关 */}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold transition-all ${
              autoRefresh
                ? "border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10"
                : "border-[#00ff88]/30 text-[#00ff88]/50 hover:border-[#00ff88]/50"
            }`}
          >
            {autoRefresh ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
            {autoRefresh ? (
              <span>自动刷新 <span className="tabular-nums text-[#ffd700]">{countdown}s</span></span>
            ) : "自动刷新"}
          </button>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#00ff88]/30 text-[#00ff88]/70 text-xs hover:border-[#00ff88] hover:text-[#00ff88] transition-all"
          >
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* ─── 币种 + 时间周期选择 ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-[#00ff88]/50 mr-1">币种：</span>
        {SYMBOLS.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`px-3 py-1 text-xs font-bold border transition-all ${
              symbol === s
                ? "border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10"
                : "border-[#00ff88]/20 text-[#00ff88]/50 hover:border-[#00ff88]/50"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="text-xs text-[#00ff88]/50 ml-4 mr-1">周期：</span>
        {INTERVALS.map(iv => (
          <button
            key={iv.value}
            onClick={() => setIntervalVal(iv.value)}
            className={`px-3 py-1 text-xs font-bold border transition-all ${
              interval === iv.value
                ? "border-[#00e5ff] text-[#00e5ff] bg-[#00e5ff]/10"
                : "border-[#00e5ff]/20 text-[#00e5ff]/50 hover:border-[#00e5ff]/50"
            }`}
          >
            {iv.label}
          </button>
        ))}
      </div>

      {/* ─── 第一行：恐贪指数 + 持仓量总览 + 清算总览 ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 恐贪指数 */}
        <CyberCard title="恐贪指数 · FEAR & GREED">
          {fgLoading ? <Skeleton /> : (
            <div className="flex flex-col items-center gap-3">
              <FearGreedGauge value={fgCurrent} />
              <div className="w-full h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fgHistory}>
                    <defs>
                      <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffd700" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ffd700" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fill: "#00ff88", fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: "#0a0a0f", border: "1px solid #00ff88", fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#ffd700" fill="url(#fgGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CyberCard>

        {/* 持仓量总览 */}
        <CyberCard title={`持仓量 · OPEN INTEREST · ${symbol}`}>
          {oiLoading ? <Skeleton /> : (
            <div className="space-y-2">
              <div className="text-center">
                <div className="text-2xl font-black text-[#00e5ff]" style={{ textShadow: "0 0 15px #00e5ff" }}>
                  {fmt(oiTotal)}
                </div>
                <div className="text-xs text-[#00e5ff]/50 mt-0.5">全市场总持仓量</div>
              </div>
              <div className="space-y-1 mt-3 max-h-36 overflow-y-auto">
                {oiRows.map((row: any) => {
                  const pctOfTotal = oiTotal > 0 ? (row.open_interest_usd / oiTotal) * 100 : 0;
                  return (
                    <div key={row.exchange} className="flex items-center gap-2">
                      <span className="text-xs text-[#00e5ff]/70 w-20 truncate">{row.exchange}</span>
                      <div className="flex-1 h-1.5 bg-[#00e5ff]/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00e5ff] rounded-full"
                          style={{ width: `${Math.min(pctOfTotal * 3, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#00e5ff] w-16 text-right">{fmt(row.open_interest_usd)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CyberCard>

        {/* 清算总览 */}
        <CyberCard title="清算总览 · TOP LIQUIDATIONS 24H">
          {liqListLoading ? <Skeleton /> : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {liqTop.slice(0, 8).map((row: any) => {
                const longPct = row.liquidation_usd_24h > 0
                  ? (row.long_liquidation_usd_24h / row.liquidation_usd_24h) * 100
                  : 50;
                const shortPct = 100 - longPct;
                return (
                  <div key={row.symbol} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white font-bold">{row.symbol}</span>
                      <span className="text-[#00ff88]/70">{fmt(row.liquidation_usd_24h)}</span>
                    </div>
                    <div className="flex h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${longPct}%`, background: LONG_COLOR, opacity: 0.8 }}
                        title={`多单爆仓 ${fmt(row.long_liquidation_usd_24h)}`}
                      />
                      <div
                        className="h-full transition-all"
                        style={{ width: `${shortPct}%`, background: SHORT_COLOR, opacity: 0.8 }}
                        title={`空单爆仓 ${fmt(row.short_liquidation_usd_24h)}`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span style={{ color: LONG_COLOR }}>多 {longPct.toFixed(0)}%</span>
                      <span style={{ color: SHORT_COLOR }}>空 {shortPct.toFixed(0)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CyberCard>
      </div>

      {/* ─── 第二行：资金费率表 ──────────────────────────────────────────────────── */}
      <CyberCard title={`资金费率 · FUNDING RATE · ${symbol} · 各交易所实时`}>
        {frLoading ? <Skeleton h="h-48" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#00ff88]/50 border-b border-[#00ff88]/10">
                  <th className="text-left py-1.5 pr-4">交易所</th>
                  <th className="text-right pr-4">当前费率</th>
                  <th className="text-right pr-4">结算周期</th>
                  <th className="text-right pr-4">下次结算</th>
                  <th className="text-right">多空判断</th>
                </tr>
              </thead>
              <tbody>
                {frRows.map((row: any) => {
                  const rate = row.funding_rate;
                  const isLong = rate > 0;
                  const isNeutral = Math.abs(rate) < 0.0001;
                  const color = isNeutral ? "#ffd700" : isLong ? LONG_COLOR : SHORT_COLOR;
                  const nextTime = row.next_funding_time
                    ? new Date(row.next_funding_time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
                    : "--";
                  return (
                    <tr key={row.exchange} className="border-b border-[#00ff88]/5 hover:bg-[#00ff88]/5 transition-colors">
                      <td className="py-2 pr-4 font-bold text-white">{row.exchange}</td>
                      <td className="text-right pr-4 font-bold tabular-nums" style={{ color }}>
                        {pct(rate)}
                      </td>
                      <td className="text-right pr-4 text-[#00ff88]/50">{row.funding_rate_interval}H</td>
                      <td className="text-right pr-4 text-[#00ff88]/50">{nextTime}</td>
                      <td className="text-right">
                        <span
                          className="px-2 py-0.5 text-[10px] font-bold rounded-sm"
                          style={{
                            background: `${color}20`,
                            color,
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {isNeutral ? "中性" : isLong ? "多头主导" : "空头主导"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CyberCard>

      {/* ─── 第三行：持仓量历史 + 清算历史 ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 持仓量历史 */}
        <CyberCard title={`持仓量历史 · OI HISTORY · ${symbol} · ${interval.toUpperCase()}`}>
          {oiHistLoading ? <Skeleton h="h-48" /> : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={oiHistRows}>
                  <defs>
                    <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={NEUTRAL_COLOR} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={NEUTRAL_COLOR} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00ff8810" />
                  <XAxis dataKey="time" tick={{ fill: "#00ff88", fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#00ff88", fontSize: 9 }} tickFormatter={v => `${v.toFixed(1)}B`} />
                  <Tooltip
                    contentStyle={{ background: "#0a0a0f", border: "1px solid #00e5ff", fontSize: 11 }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)}B USD`, "持仓量"]}
                  />
                  <Area type="monotone" dataKey="oi" stroke={NEUTRAL_COLOR} fill="url(#oiGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CyberCard>

        {/* 清算历史 */}
        <CyberCard title={`清算历史 · LIQUIDATION · ${symbol} · 多空对比`}>
          {liqHistLoading ? <Skeleton h="h-48" /> : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liqHistRows} barGap={1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00ff8810" />
                  <XAxis dataKey="time" tick={{ fill: "#00ff88", fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#00ff88", fontSize: 9 }} tickFormatter={v => `${v.toFixed(1)}M`} />
                  <Tooltip
                    contentStyle={{ background: "#0a0a0f", border: "1px solid #00ff88", fontSize: 11 }}
                    formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}M USD`, name === "long" ? "多单爆仓" : "空单爆仓"]}
                  />
                  <Legend
                    formatter={(value) => value === "long" ? "多单爆仓" : "空单爆仓"}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="long" fill={LONG_COLOR} opacity={0.8} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="short" fill={SHORT_COLOR} opacity={0.8} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CyberCard>
      </div>

      {/* ─── 第四行：清算排行榜（完整） ─────────────────────────────────────────── */}
      <CyberCard title="清算排行榜 · LIQUIDATION LEADERBOARD · 24H · 全市场">
        {liqListLoading ? <Skeleton h="h-64" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#00ff88]/50 border-b border-[#00ff88]/10">
                  <th className="text-left py-1.5 pr-3 w-8">#</th>
                  <th className="text-left pr-4">币种</th>
                  <th className="text-right pr-4">总清算量</th>
                  <th className="text-right pr-4">多单爆仓</th>
                  <th className="text-right pr-4">空单爆仓</th>
                  <th className="text-right pr-4">多空比</th>
                  <th className="text-right">多空分布</th>
                </tr>
              </thead>
              <tbody>
                {liqTop.map((row: any, i: number) => {
                  const longPct = row.liquidation_usd_24h > 0
                    ? (row.long_liquidation_usd_24h / row.liquidation_usd_24h) * 100
                    : 50;
                  const shortPct = 100 - longPct;
                  const dominated = longPct > 60 ? "多头主导" : shortPct > 60 ? "空头主导" : "均衡";
                  const domColor = longPct > 60 ? LONG_COLOR : shortPct > 60 ? SHORT_COLOR : "#ffd700";
                  return (
                    <tr key={row.symbol} className="border-b border-[#00ff88]/5 hover:bg-[#00ff88]/5 transition-colors">
                      <td className="py-2 pr-3 text-[#00ff88]/30 font-bold">{i + 1}</td>
                      <td className="pr-4 font-black text-white">{row.symbol}</td>
                      <td className="text-right pr-4 text-[#00ff88] font-bold">{fmt(row.liquidation_usd_24h)}</td>
                      <td className="text-right pr-4" style={{ color: LONG_COLOR }}>{fmt(row.long_liquidation_usd_24h)}</td>
                      <td className="text-right pr-4" style={{ color: SHORT_COLOR }}>{fmt(row.short_liquidation_usd_24h)}</td>
                      <td className="text-right pr-4">
                        <span className="font-bold" style={{ color: domColor }}>{longPct.toFixed(0)}% / {shortPct.toFixed(0)}%</span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-20 h-2 flex rounded-full overflow-hidden">
                            <div style={{ width: `${longPct}%`, background: LONG_COLOR, opacity: 0.8 }} />
                            <div style={{ width: `${shortPct}%`, background: SHORT_COLOR, opacity: 0.8 }} />
                          </div>
                          <span className="text-[10px] w-16 text-right" style={{ color: domColor }}>{dominated}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CyberCard>

      {/* ─── 第五行：资金费率累计 ────────────────────────────────────────────────── */}
      <CyberCard title={`资金费率累计 · ACCUMULATED FUNDING RATE · ${symbol}`}>
        <div className="flex gap-2 mb-3">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setFrRange(d)}
              className={`px-3 py-1 text-xs font-bold border transition-all ${
                frRange === d
                  ? "border-[#ff2d6b] text-[#ff2d6b] bg-[#ff2d6b]/10"
                  : "border-[#ff2d6b]/20 text-[#ff2d6b]/50 hover:border-[#ff2d6b]/50"
              }`}
            >
              {d}日
            </button>
          ))}
        </div>
        {frAccumLoading ? <Skeleton h="h-48" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#00ff88]/50 border-b border-[#00ff88]/10">
                  <th className="text-left py-1.5 pr-4">交易所</th>
                  <th className="text-right pr-4">{frRange}日累计费率</th>
                  <th className="text-right pr-4">年化估算</th>
                  <th className="text-right">多空判断</th>
                </tr>
              </thead>
              <tbody>
                {frAccumRows.map((row: any) => {
                  const rate = row.accumulated_funding_rate;
                  const isLong = rate > 0;
                  const color = Math.abs(rate) < 0.001 ? "#ffd700" : isLong ? LONG_COLOR : SHORT_COLOR;
                  const annualized = (rate / frRange) * 365;
                  return (
                    <tr key={row.exchange} className="border-b border-[#00ff88]/5 hover:bg-[#00ff88]/5 transition-colors">
                      <td className="py-2 pr-4 font-bold text-white">{row.exchange}</td>
                      <td className="text-right pr-4 font-bold tabular-nums" style={{ color }}>
                        {pct(rate)}
                      </td>
                      <td className="text-right pr-4 tabular-nums" style={{ color: `${color}99` }}>
                        {pct(annualized)}
                      </td>
                      <td className="text-right">
                        <span
                          className="px-2 py-0.5 text-[10px] font-bold rounded-sm"
                          style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
                        >
                          {Math.abs(rate) < 0.001 ? "中性" : isLong ? "多头付费" : "空头付费"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CyberCard>

      {/* ─── 多空比模块 ──────────────────────────────────────────────────────────── */}
      <CyberCard title="多空比 · LONG / SHORT RATIO · 大户 / 散户 / 全市场">
        <div className="flex flex-col items-center gap-4 py-2">
          {/* 升级提示横幅 */}
          <div className="w-full flex items-center gap-3 px-4 py-3 border border-[#ffd700]/30 bg-[#ffd700]/5 rounded-sm">
            <Crown size={16} className="text-[#ffd700] shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-bold text-[#ffd700]">此功能需要 CoinGlass PREMIUM 或更高套餐</div>
              <div className="text-[10px] text-[#ffd700]/60 mt-0.5">多空比（Long/Short Ratio）接口仅对 PREMIUM+ 计划开放。升级后可获取大户持仓多空比、散户多空比、全市场多空比等核心数据。</div>
            </div>
            <a
              href="https://www.coinglass.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-3 py-1.5 text-xs font-bold border border-[#ffd700] text-[#ffd700] hover:bg-[#ffd700]/20 transition-all"
            >
              查看套餐
            </a>
          </div>

          {/* 模拟数据展示（标注为示意） */}
          <div className="w-full">
            <div className="text-xs text-[#00ff88]/40 mb-3 text-center">↓ 以下为示意数据，升级后显示实时数据 ↓</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "大户持仓多空比", long: 52.3, short: 47.7, desc: "Top Trader Position Ratio", note: "大户偏多" },
                { label: "散户多空比", long: 44.1, short: 55.9, desc: "Retail Trader Ratio", note: "散户偏空" },
                { label: "全市场多空比", long: 48.7, short: 51.3, desc: "Global Long/Short Ratio", note: "市场均衡" },
              ].map(item => {
                const dominated = item.long > 50 ? LONG_COLOR : SHORT_COLOR;
                return (
                  <div key={item.label} className="border border-[#00ff88]/10 p-3 rounded-sm opacity-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-xs font-bold text-white">{item.label}</div>
                        <div className="text-[10px] text-[#00ff88]/40">{item.desc}</div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 border rounded-sm" style={{ color: dominated, borderColor: `${dominated}40`, background: `${dominated}10` }}>
                        {item.note}
                      </span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden mb-1.5">
                      <div style={{ width: `${item.long}%`, background: LONG_COLOR, opacity: 0.7 }} />
                      <div style={{ width: `${item.short}%`, background: SHORT_COLOR, opacity: 0.7 }} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: LONG_COLOR }}>多 {item.long}%</span>
                      <span style={{ color: SHORT_COLOR }}>空 {item.short}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CyberCard>

      {/* ─── 底部说明 ────────────────────────────────────────────────────────────── */}
      <div className="text-center text-xs text-[#00ff88]/20 py-2 border-t border-[#00ff88]/10">
        数据来源：CoinGlass API v4 · HOBBYIST 计划 · 4H+ 时间粒度 · {autoRefresh ? `自动刷新中（${countdown}s）` : "手动刷新"}
      </div>
    </div>
  );
}
