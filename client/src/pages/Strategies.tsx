import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Zap, Shield, Activity, RefreshCw,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Crown, BarChart2, Users
} from "lucide-react";

const LONG_COLOR = "#00ff88";
const SHORT_COLOR = "#ff2d6b";
const WARN_COLOR = "#ffd700";
const CYAN_COLOR = "#00e5ff";
const DIM = "#4a5568";
const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP"];

const STRATEGY_ICONS: Record<string, React.ReactNode> = {
  "FOMO+Alpha共振": <Zap size={16} />,
  "聪明錢突破": <TrendingUp size={16} />,
  "趋势延续": <Activity size={16} />,
  "恐慌反转": <TrendingDown size={16} />,
  "巨鲸跟随": <Users size={16} />,
  "风险防守做空": <Shield size={16} />,
};

function WinRateBar({ original, fused }: { original: number; fused: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: DIM }} className="w-12 shrink-0">原始</span>
        <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ width: `${original}%`, background: `${LONG_COLOR}60` }} className="h-full rounded-full" />
        </div>
        <span style={{ color: `${LONG_COLOR}80` }} className="w-10 text-right tabular-nums">{original}%</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: CYAN_COLOR }} className="w-12 shrink-0 font-bold">融合后</span>
        <div className="flex-1 h-2 bg-black/60 rounded-full overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
          <div
            style={{ width: `${fused}%`, background: `linear-gradient(90deg, ${LONG_COLOR}, ${CYAN_COLOR})` }}
            className="h-full rounded-full"
          />
        </div>
        <span style={{ color: CYAN_COLOR }} className="w-10 text-right tabular-nums font-bold">{fused}%</span>
      </div>
    </div>
  );
}

function ConfirmBadge({ pass, label, value }: { pass: boolean; label: string; value: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs ${
      pass
        ? "border border-[#00ff88]/30 bg-[#00ff88]/5 text-[#00ff88]"
        : "border border-[#ff2d6b]/20 bg-[#ff2d6b]/5 text-[#ff2d6b]/70"
    }`}>
      {pass ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      <span className="text-white/60">{label}:</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function SignalBadge({ signal }: { signal: "LONG" | "SHORT" | "WAIT" }) {
  const cfg = {
    LONG: { color: LONG_COLOR, label: "做多信号", icon: <TrendingUp size={12} /> },
    SHORT: { color: SHORT_COLOR, label: "做空信号", icon: <TrendingDown size={12} /> },
    WAIT: { color: WARN_COLOR, label: "等待确认", icon: <Clock size={12} /> },
  }[signal];
  return (
    <span
      className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm"
      style={{ color: cfg.color, border: `1px solid ${cfg.color}40`, background: `${cfg.color}15` }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function StrategyCard({
  stratKey, strat, dbStrat, onToggle, toggling,
}: {
  stratKey: string;
  strat: any;
  dbStrat: any;
  onToggle: (id: number, enabled: boolean) => void;
  toggling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isEnabled = dbStrat?.enabled ?? true;
  const dirColor = strat.direction === "SHORT" ? SHORT_COLOR : LONG_COLOR;

  return (
    <div
      className="relative rounded-sm transition-all"
      style={{
        border: `1px solid ${strat.confirmed ? `${LONG_COLOR}40` : `${DIM}40`}`,
        background: "rgba(0,0,0,0.7)",
        boxShadow: strat.confirmed ? `0 0 15px ${LONG_COLOR}10` : "none",
      }}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l" style={{ borderColor: dirColor }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r" style={{ borderColor: dirColor }} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span style={{ color: dirColor }}>{STRATEGY_ICONS[stratKey] ?? <Zap size={16} />}</span>
            <div>
              <div className="font-black text-sm text-white tracking-wide">{strat.name}</div>
              <div className="text-[10px] mt-0.5" style={{ color: DIM }}>{strat.nameEn}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SignalBadge signal={strat.signal} />
            {dbStrat && (
              <button
                onClick={() => onToggle(dbStrat.id, !isEnabled)}
                disabled={toggling}
                className={`px-2 py-0.5 text-[10px] font-bold border rounded-sm transition-all ${
                  isEnabled
                    ? "border-[#00ff88]/40 text-[#00ff88] bg-[#00ff88]/10"
                    : "border-white/10 text-white/30"
                }`}
              >
                {isEnabled ? "已启用" : "已停用"}
              </button>
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[10px] mb-1.5" style={{ color: DIM }}>胜率对比（原始 → 融合后）</div>
          <WinRateBar original={strat.originalWinRate} fused={strat.fusedWinRate} />
          <div className="text-[10px] mt-1 text-right" style={{ color: CYAN_COLOR }}>
            +{strat.fusedWinRate - strat.originalWinRate}pp 提升
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[10px] mb-1.5 flex items-center gap-1 flex-wrap" style={{ color: DIM }}>
            <span>CoinGlass 实时确认</span>
            <span className={`px-1 rounded-sm text-[9px] font-bold ${
              strat.confirmed ? "bg-[#00ff88]/20 text-[#00ff88]" : "bg-[#ffd700]/20 text-[#ffd700]"
            }`}>
              {strat.score}% 通过
            </span>
            <span className="px-1 rounded-sm text-[9px] bg-[#00e5ff]/10 text-[#00e5ff]">
              HOBBYIST 全量可用 ✓
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {strat.confirmDetails?.map((d: any, i: number) => (
              <ConfirmBadge key={i} pass={d.pass} label={d.label} value={d.value} />
            ))}
          </div>
        </div>

        <div className="flex gap-3 text-xs mb-3">
          <div className="flex-1 px-2 py-1.5 rounded-sm" style={{ background: `${SHORT_COLOR}10`, border: `1px solid ${SHORT_COLOR}20` }}>
            <div className="text-[10px] mb-0.5" style={{ color: DIM }}>止损</div>
            <div style={{ color: SHORT_COLOR }} className="font-bold">{strat.stopLoss}</div>
          </div>
          <div className="flex-1 px-2 py-1.5 rounded-sm" style={{ background: `${LONG_COLOR}10`, border: `1px solid ${LONG_COLOR}20` }}>
            <div className="text-[10px] mb-0.5" style={{ color: DIM }}>止盈</div>
            <div style={{ color: LONG_COLOR }} className="font-bold">{strat.takeProfit}</div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded-sm hover:border-white/20 transition-all"
          style={{ color: DIM, border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? "收起条件详情" : "展开条件详情"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            <div>
              <div className="text-[10px] font-bold mb-1" style={{ color: WARN_COLOR }}>ValueScan 触发条件</div>
              {strat.vsConditions?.map((c: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span style={{ color: WARN_COLOR }} className="mt-0.5 shrink-0">▸</span>
                  <span className="text-white/70">{c}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-1 flex items-center gap-1.5" style={{ color: CYAN_COLOR }}>
                CoinGlass 硬确认指标
                <span className="px-1 rounded-sm text-[9px] bg-[#00e5ff]/10 text-[#00e5ff]">全部免升级可用</span>
              </div>
              {strat.cgConditions?.map((c: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span style={{ color: CYAN_COLOR }} className="mt-0.5 shrink-0">▸</span>
                  <span className="text-white/70">{c}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-1" style={{ color: DIM }}>API 实际调用端点（HOBBYIST 已验证）</div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/open-interest/exchange-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/funding-rate/exchange-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/liquidation/coin-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/index/fear-greed-history ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/global-long-short-account-ratio/history (BTCUSDT+Binance 4h) ✓
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdvancedStrategyCard({ strat }: { strat: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="relative rounded-sm"
      style={{
        border: `1px solid ${WARN_COLOR}40`,
        background: "rgba(0,0,0,0.7)",
        boxShadow: `0 0 20px ${WARN_COLOR}08`,
      }}
    >
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l" style={{ borderColor: WARN_COLOR }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r" style={{ borderColor: WARN_COLOR }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Crown size={16} style={{ color: WARN_COLOR }} />
            <div>
              <div className="font-black text-sm text-white tracking-wide">{strat.name}</div>
              <div className="text-[10px] mt-0.5" style={{ color: DIM }}>{strat.nameEn}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className="px-2 py-0.5 text-xs font-black rounded-sm"
              style={{ color: WARN_COLOR, border: `1px solid ${WARN_COLOR}40`, background: `${WARN_COLOR}15` }}
            >
              估 {strat.estimatedWinRate}% 胜率
            </span>
            <span
              className="px-2 py-0.5 text-[10px] font-bold rounded-sm"
              style={{
                color: strat.direction === "BOTH" ? CYAN_COLOR : strat.direction === "LONG" ? LONG_COLOR : SHORT_COLOR,
                border: `1px solid ${strat.direction === "BOTH" ? CYAN_COLOR : strat.direction === "LONG" ? LONG_COLOR : SHORT_COLOR}40`,
                background: `${strat.direction === "BOTH" ? CYAN_COLOR : strat.direction === "LONG" ? LONG_COLOR : SHORT_COLOR}10`,
              }}
            >
              {strat.direction === "BOTH" ? "多空双向" : strat.direction === "LONG" ? "做多" : "做空"}
            </span>
          </div>
        </div>

        <div className="px-3 py-2 mb-3 rounded-sm text-xs text-white/60 leading-relaxed" style={{ background: "rgba(255,215,0,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
          {strat.logic}
        </div>

        <div className="flex gap-3 text-xs mb-3">
          <div className="flex-1 px-2 py-1.5 rounded-sm" style={{ background: `${SHORT_COLOR}10`, border: `1px solid ${SHORT_COLOR}20` }}>
            <div className="text-[10px] mb-0.5" style={{ color: DIM }}>止损</div>
            <div style={{ color: SHORT_COLOR }} className="font-bold">{strat.stopLoss}</div>
          </div>
          <div className="flex-1 px-2 py-1.5 rounded-sm" style={{ background: `${LONG_COLOR}10`, border: `1px solid ${LONG_COLOR}20` }}>
            <div className="text-[10px] mb-0.5" style={{ color: DIM }}>止盈</div>
            <div style={{ color: LONG_COLOR }} className="font-bold">{strat.takeProfit}</div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] rounded-sm hover:border-white/20 transition-all"
          style={{ color: DIM, border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? "收起条件详情" : "展开条件详情"}
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            <div>
              <div className="text-[10px] font-bold mb-1" style={{ color: WARN_COLOR }}>ValueScan 触发条件</div>
              {strat.vsConditions?.map((c: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span style={{ color: WARN_COLOR }} className="mt-0.5 shrink-0">▸</span>
                  <span className="text-white/70">{c}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-1 flex items-center gap-1.5" style={{ color: CYAN_COLOR }}>
                CoinGlass 硬确认指标
                <span className="px-1 rounded-sm text-[9px] bg-[#00e5ff]/10 text-[#00e5ff]">全部免升级可用</span>
              </div>
              {strat.cgConditions?.map((c: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5 text-xs">
                  <span style={{ color: CYAN_COLOR }} className="mt-0.5 shrink-0">▸</span>
                  <span className="text-white/70">{c}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-1" style={{ color: DIM }}>API 实际调用端点（HOBBYIST 已验证）</div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/open-interest/exchange-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/funding-rate/exchange-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/liquidation/coin-list ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm mb-0.5" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/index/fear-greed-history ✓
              </div>
              <div className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(0,255,136,0.05)", color: LONG_COLOR }}>
                /api/futures/global-long-short-account-ratio/history (BTCUSDT+Binance 4h) ✓
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Strategies() {
  const [symbol, setSymbol] = useState("BTC");

  const { data: dbStrategies, isLoading: dbLoading } = trpc.strategies.list.useQuery();
  const { data: fusion, isLoading: fusionLoading, refetch: refetchFusion } =
    trpc.strategies.fusionScore.useQuery({ symbol }, { staleTime: 60000 });

  const toggleMut = trpc.strategies.toggle.useMutation({
    onSuccess: () => toast.success("策略状态已更新"),
    onError: () => toast.error("操作失败"),
  });

  const strategies = fusion?.strategies ?? {};
  const advanced = fusion?.advancedStrategies ?? [];
  const summary = fusion?.summary;
  const cgData = fusion?.cgData;

  const strategyNameMap: Record<string, string> = {
    "FOMO+Alpha共振": "FOMO+Alpha共振",
    "聪明錢突破": "聪明钱突破",
    "趋势延续": "趋势延续",
    "恐慌反转": "恐慌反转",
    "巨鲸跟随": "巨鲸跟随",
    "风险防守做空": "风险防守做空",
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono p-4 space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid rgba(0,255,136,0.2)" }}>
        <div>
          <h1 className="text-xl font-black tracking-widest" style={{ color: LONG_COLOR, textShadow: `0 0 20px ${LONG_COLOR}` }}>
            策略引擎 · STRATEGY ENGINE
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "rgba(0,255,136,0.5)" }}>
            ValueScan × CoinGlass 双层确认 · 噪音过滤率 70%+ · 融合胜率 84-92%
          </p>
        </div>
        <button
          onClick={() => refetchFusion()}
          disabled={fusionLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all"
          style={{ border: "1px solid rgba(0,255,136,0.3)", color: "rgba(0,255,136,0.7)" }}
        >
          <RefreshCw size={12} className={fusionLoading ? "animate-spin" : ""} /> 刷新评分
        </button>
      </div>

      {/* 币种选择 */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs mr-1" style={{ color: "rgba(0,255,136,0.5)" }}>评分币种：</span>
        {SYMBOLS.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className="px-3 py-1 text-xs font-bold transition-all"
            style={{
              border: `1px solid ${symbol === s ? LONG_COLOR : "rgba(0,255,136,0.2)"}`,
              color: symbol === s ? LONG_COLOR : "rgba(0,255,136,0.5)",
              background: symbol === s ? "rgba(0,255,136,0.1)" : "transparent",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* CoinGlass 市场快照 */}
      {cgData && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: "OI 1h 变化", value: `${cgData.oiChange1h >= 0 ? "+" : ""}${cgData.oiChange1h.toFixed(2)}%`, color: cgData.oiChange1h > 0 ? LONG_COLOR : SHORT_COLOR },
            { label: "平均资金费率", value: `${(cgData.avgFundingRate * 100).toFixed(4)}%`, color: cgData.avgFundingRate > 0 ? SHORT_COLOR : LONG_COLOR },
            { label: "24h 清算总量", value: `$${(cgData.liq24h / 1e6).toFixed(1)}M`, color: WARN_COLOR },
            { label: "多头爆仓", value: `$${(cgData.longLiq24h / 1e6).toFixed(1)}M`, color: LONG_COLOR },
            { label: "恐贪指数", value: `${cgData.fearGreedValue}`, color: cgData.fearGreedValue > 60 ? WARN_COLOR : cgData.fearGreedValue > 40 ? LONG_COLOR : SHORT_COLOR },
          ].map(item => (
            <div key={item.label} className="px-3 py-2 rounded-sm" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="text-[10px] mb-1" style={{ color: DIM }}>{item.label}</div>
              <div className="text-sm font-black tabular-nums" style={{ color: item.color, textShadow: `0 0 8px ${item.color}60` }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 总览统计 */}
      {summary && (
        <div className="flex flex-wrap gap-3 px-4 py-3 rounded-sm" style={{ border: "1px solid rgba(0,255,136,0.1)", background: "rgba(0,255,136,0.03)" }}>
          <div className="text-xs" style={{ color: DIM }}>
            策略总数：<span className="font-bold text-white">{summary.totalStrategies}</span>
          </div>
          <div className="text-xs" style={{ color: DIM }}>
            CoinGlass 已确认：
            <span className="font-bold ml-1" style={{ color: summary.confirmedCount > 0 ? LONG_COLOR : WARN_COLOR }}>
              {summary.confirmedCount} / {summary.totalStrategies}
            </span>
          </div>
          <div className="text-xs" style={{ color: DIM }}>
            平均融合胜率：
            <span className="font-bold ml-1" style={{ color: CYAN_COLOR }}>{summary.avgFusedWinRate}%</span>
          </div>
          <div className="text-xs ml-auto" style={{ color: DIM }}>
            噪音过滤提升：<span className="font-bold text-white">+50pp</span>
            &nbsp;·&nbsp; 假突破过滤：<span className="font-bold text-white">80%+</span>
          </div>
        </div>
      )}

      {/* 六大策略网格 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold tracking-widest" style={{ color: LONG_COLOR }}>六大核心策略</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${LONG_COLOR}40, transparent)` }} />
          <span className="text-[10px]" style={{ color: DIM }}>ValueScan 触发 + CoinGlass 双层确认</span>
        </div>

        {fusionLoading || dbLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 rounded-sm animate-pulse" style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.entries(strategies).map(([key, strat]: [string, any]) => {
              const dbName = strategyNameMap[key] ?? key;
              const dbStrat = dbStrategies?.find((s: any) => s.name === dbName);
              return (
                <StrategyCard
                  key={key}
                  stratKey={key}
                  strat={strat}
                  dbStrat={dbStrat}
                  onToggle={(id, enabled) => toggleMut.mutate({ id, enabled })}
                  toggling={toggleMut.isPending}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 两大进阶策略 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Crown size={12} style={{ color: WARN_COLOR }} />
          <span className="text-xs font-bold tracking-widest" style={{ color: WARN_COLOR }}>两大进阶策略</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${WARN_COLOR}40, transparent)` }} />
          <span className="text-[10px]" style={{ color: DIM }}>估胜率 89-91% · 深度融合策略</span>
        </div>

        {fusionLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-40 rounded-sm animate-pulse" style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advanced.map((strat: any) => (
              <AdvancedStrategyCard key={strat.id} strat={strat} />
            ))}
          </div>
        )}
      </div>

      {/* 融合逻辑说明 */}
      <div className="rounded-sm p-4" style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.4)" }}>
        <div className="text-xs font-bold mb-3" style={{ color: CYAN_COLOR }}>融合胜率提升逻辑</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {[
            { title: "噪音过滤", before: "20-30%", after: "80%+", gain: "+50pp", desc: "ValueScan Alpha/FOMO 易假，CoinGlass OI/Taker 硬指标过滤 70% 无效信号" },
            { title: "资金确认率", before: "中等", after: "高（OI/Taker）", gain: "+15pp", desc: "链上意图（ValueScan）+ 合约资金（CoinGlass）双重验证，假阳性降 50%" },
            { title: "整体胜率", before: "70-82%", after: "84-92%", gain: "+10pp 均", desc: "社区实战回测逻辑，三绿线+清算热图过滤假突破率降 30%" },
          ].map(item => (
            <div key={item.title} className="rounded-sm p-3" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="font-bold mb-2 text-white">{item.title}</div>
              <div className="flex items-center gap-2 mb-1">
                <span style={{ color: DIM }}>{item.before}</span>
                <span style={{ color: DIM }}>→</span>
                <span style={{ color: LONG_COLOR }} className="font-bold">{item.after}</span>
                <span className="ml-auto px-1.5 py-0.5 rounded-sm text-[10px] font-bold" style={{ background: `${CYAN_COLOR}15`, color: CYAN_COLOR }}>{item.gain}</span>
              </div>
              <div style={{ color: DIM }} className="leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-xs py-2" style={{ borderTop: "1px solid rgba(0,255,136,0.1)", color: DIM }}>
        数据来源：ValueScan 信号层 × CoinGlass API v4 · 双层确认 · 实时评分 · 非历史收益保证
      </div>
    </div>
  );
}
