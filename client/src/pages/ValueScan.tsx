import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Database, RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
  DollarSign, Wifi, WifiOff, Key, Bell, Activity, Eye, EyeOff,
  ArrowUpRight, ArrowDownRight, Minus, Zap, Send, BarChart2,
  BookOpen, Radio, Layers, Search, CandlestickChart, Shield,
} from "lucide-react";

const C = {
  green:  "oklch(0.85 0.28 145)",
  cyan:   "oklch(0.80 0.22 200)",
  orange: "oklch(0.72 0.22 50)",
  pink:   "oklch(0.72 0.28 340)",
  purple: "oklch(0.75 0.2 290)",
  yellow: "oklch(0.85 0.22 90)",
  dim:    "oklch(0.55 0.04 220)",
  bg:     "oklch(0.10 0.015 240)",
  bgCard: "oklch(0.12 0.015 240)",
  border: "oklch(0.20 0.03 240)",
};

function SectionHeader({ title, color = C.green, icon }: { title: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span style={{ color }}>{icon}</span>}
      <span className="text-xs tracking-widest uppercase font-bold" style={{ color }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}50, transparent)` }} />
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-sm" style={{
      background: ok ? `${C.green}15` : `${C.pink}15`,
      border: `1px solid ${ok ? C.green : C.pink}40`,
      color: ok ? C.green : C.pink,
    }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? C.green : C.pink }} />
      {label}
    </span>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full" style={{ background: "oklch(0.15 0.02 240)" }}>
      <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, value)}%`, background: color, boxShadow: `0 0 6px ${color}80` }} />
    </div>
  );
}

function TimeAgo({ time }: { time: string }) {
  const diff = Date.now() - new Date(time).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const label = mins < 1 ? "刚刚" : mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  return <span style={{ color: C.dim, fontSize: "0.65rem" }}>{label}</span>;
}

function SourceTag({ src }: { src?: string }) {
  if (src === "open_api") return <span style={{ color: C.green, fontSize: "0.6rem" }}>● OPEN API</span>;
  if (src === "token") return <span style={{ color: C.cyan, fontSize: "0.6rem" }}>● TOKEN</span>;
  if (src === "demo") return <span style={{ color: C.dim, fontSize: "0.6rem" }}>● DEMO</span>;
  return null;
}

function TgButton({ title, content, disabled }: { title: string; content: string; disabled?: boolean }) {
  const push = trpc.valueScan.pushToTelegram.useMutation({
    onSuccess: (d) => toast[d.success ? "success" : "error"](d.message),
  });
  return (
    <button
      onClick={() => push.mutate({ title, content })}
      disabled={disabled || push.isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all"
      style={{
        border: `1px solid ${C.cyan}50`,
        color: push.isPending ? C.dim : C.cyan,
        background: push.isPending ? "transparent" : `${C.cyan}08`,
        borderRadius: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Send size={10} /> {push.isPending ? "推送中..." : "电报推送"}
    </button>
  );
}

type Tab = "overview" | "alert" | "funding" | "market" | "signal" | "social" | "token";

export default function ValueScanPage() {
  const [showApiForm, setShowApiForm] = useState(false);
  const [showCredForm, setShowCredForm] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [apiKeys, setApiKeys] = useState({ apiKey: "", secretKey: "" });
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tokenSymbol, setTokenSymbol] = useState("BTC");
  const [searchInput, setSearchInput] = useState("BTC");
  const [klineInterval, setKlineInterval] = useState("1h");

  const { data: tokenStatus, refetch: refetchToken } = trpc.valueScan.tokenStatus.useQuery(undefined, { refetchInterval: 60000 });
  const { data: openApiStatus, refetch: refetchApiStatus } = trpc.valueScan.openApiStatus.useQuery(undefined, { refetchInterval: 120000 });
  const { data: fearGreed } = trpc.valueScan.fearGreed.useQuery(undefined, { refetchInterval: 60000 });
  const { data: opportunities, refetch: refetchOpp } = trpc.valueScan.opportunities.useQuery(undefined, { refetchInterval: 30000 });
  const { data: warnData, refetch: refetchWarn } = trpc.valueScan.warnMessages.useQuery(undefined, { refetchInterval: 15000 });
  const { data: signalData, refetch: refetchSignal } = trpc.valueScan.signalList.useQuery(undefined, { refetchInterval: 15000 });
  const { data: largeTransactions, refetch: refetchLarge } = trpc.valueScan.largeTransactions.useQuery(undefined, { refetchInterval: 20000 });
  const { data: socialSentiment, refetch: refetchSocial } = trpc.valueScan.socialSentiment.useQuery(undefined, { refetchInterval: 60000 });
  const { data: analysisHistory, refetch: refetchHistory } = trpc.valueScan.analysisHistory.useQuery(undefined, { refetchInterval: 120000 });
  const { data: pressureData, refetch: refetchPressure } = trpc.valueScan.pressureSupport.useQuery({ symbol: tokenSymbol }, { refetchInterval: 60000 });
  const { data: mainForceData, refetch: refetchMainForce } = trpc.valueScan.mainForce.useQuery({ symbol: tokenSymbol }, { refetchInterval: 60000 });
  const { data: fundingAlerts, refetch: refetchFunding } = trpc.valueScan.fundingAlerts.useQuery(undefined, { refetchInterval: 20000 });
  const { data: tokenInfoData, refetch: refetchTokenInfo } = trpc.valueScan.tokenInfo.useQuery({ symbol: tokenSymbol }, { refetchInterval: 60000 });
  const { data: klineData, refetch: refetchKline } = trpc.valueScan.klineData.useQuery({ symbol: tokenSymbol, interval: klineInterval, limit: 24 }, { refetchInterval: 60000 });

  const refreshToken = trpc.valueScan.refreshToken.useMutation({
    onSuccess: (d) => { toast[d.success ? "success" : "error"](d.message); refetchToken(); },
  });
  const setCredentialsMutation = trpc.valueScan.setCredentials.useMutation({
    onSuccess: () => { toast.success("账号已保存，正在刷新 Token..."); setShowCredForm(false); refreshToken.mutate(); },
  });
  const setOpenApiKeys = trpc.valueScan.setOpenApiKeys.useMutation({
    onSuccess: () => { toast.success("Open API 密钥已保存"); setShowApiForm(false); refetchApiStatus(); },
  });

  const fgValue = fearGreed?.value ?? 50;
  const fgColor = fgValue >= 75 ? C.orange : fgValue >= 55 ? C.green : fgValue >= 45 ? C.cyan : fgValue >= 25 ? C.orange : C.pink;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "总览", icon: <Activity size={11} /> },
    { id: "alert",    label: "预警", icon: <Bell size={11} /> },
    { id: "funding",  label: "资金", icon: <DollarSign size={11} /> },
    { id: "market",   label: "大盘", icon: <BarChart2 size={11} /> },
    { id: "signal",   label: "信号", icon: <Radio size={11} /> },
    { id: "social",   label: "情绪", icon: <Zap size={11} /> },
    { id: "token",    label: "代币", icon: <Layers size={11} /> },
  ];

  const buildOppText = () => {
    const opp = (opportunities?.opportunities ?? []).map((o: any) => `${o.symbol} LONG 评分${o.score} · ${o.reason}`).join("\n");
    const risk = (opportunities?.risks ?? []).map((r: any) => `${r.symbol} RISK 评分${r.score} · ${r.reason}`).join("\n");
    return `📈 机会代币\n${opp || "暂无"}\n\n⚠️ 风险代币\n${risk || "暂无"}`;
  };
  const buildFundingText = () =>
    (fundingAlerts?.list ?? []).map((f: any) => `${f.symbol} ${f.type} $${((f.usdValue ?? 0)/1e6).toFixed(1)}M · ${f.desc}`).join("\n") || "暂无资金异动";
  const buildMarketText = () =>
    (analysisHistory?.list ?? []).map((a: any) => `【${a.title}】\n${a.content}`).join("\n\n---\n") || "暂无大盘分析";
  const buildSignalText = () =>
    (signalData?.signals ?? []).map((s: any) => `${s.symbol ?? "?"} ${s.direction ?? s.signal ?? "SIGNAL"} 评分${s.score ?? "-"} · ${s.reason ?? ""}`).join("\n") || "暂无代币信号";
  const buildSocialText = () =>
    (socialSentiment?.sentiment ?? []).map((s: any) => `${s.symbol} ${s.label} 情绪分${s.score} 提及${s.mentions?.toLocaleString() ?? 0}`).join("\n") || "暂无情绪数据";
  const buildPressureText = () =>
    (pressureData?.levels ?? []).map((l: any) => `${l.type === "resistance" ? "阻力" : l.type === "support" ? "支撑" : "当前"} $${l.price?.toLocaleString()} 强度${l.strength}% ${l.label}`).join("\n");

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      {/* 页头 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.cyan, textShadow: `0 0 12px ${C.cyan}60` }}>
            VALUESCAN
          </h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>AI 雷达 · 实时预警 · 巨鲸追踪 · 情绪分析 · 压力支撑 · 大盘解析</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setShowApiForm(!showApiForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.purple}60`, color: C.purple, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            <Key size={11} /> API 密钥
          </button>
          <button onClick={() => setShowCredForm(!showCredForm)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}60`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
            账号
          </button>
          <button onClick={() => refreshToken.mutate()} disabled={refreshToken.isPending} className="flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: `${C.cyan}08`, borderRadius: 2, cursor: "pointer" }}>
            <RefreshCw size={11} className={refreshToken.isPending ? "animate-spin" : ""} /> 刷新Token
          </button>
        </div>
      </div>

      {/* 状态栏 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <div className="cyber-card p-3 flex items-center gap-2">
          <Database size={14} style={{ color: C.cyan }} />
          <div className="flex-1 min-w-0">
            <div className="text-xs" style={{ color: C.dim }}>Bearer Token</div>
            <StatusBadge ok={!!(tokenStatus?.hasToken && !tokenStatus?.isExpired)} label={tokenStatus?.hasToken ? (tokenStatus.isExpired ? "已过期" : "有效") : "未配置"} />
          </div>
        </div>
        <div className="cyber-card p-3 flex items-center gap-2">
          {openApiStatus?.apiAvailable ? <Wifi size={14} style={{ color: C.green }} /> : <WifiOff size={14} style={{ color: C.pink }} />}
          <div>
            <div className="text-xs" style={{ color: C.dim }}>Open API</div>
            <StatusBadge ok={!!openApiStatus?.apiAvailable} label={openApiStatus?.hasKeys ? (openApiStatus.apiAvailable ? "在线" : "服务异常") : "未配置"} />
          </div>
        </div>
        <div className="cyber-card p-3 flex items-center gap-3">
          <div className="text-2xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: fgColor, textShadow: `0 0 10px ${fgColor}60` }}>{fgValue}</div>
          <div>
            <div className="text-xs" style={{ color: C.dim }}>恐贪指数</div>
            <div className="text-xs font-bold" style={{ color: fgColor }}>{fearGreed?.label ?? "中性"}</div>
          </div>
        </div>
        <div className="cyber-card p-3 flex items-center gap-2">
          <Bell size={14} style={{ color: C.orange }} />
          <div>
            <div className="text-xs" style={{ color: C.dim }}>预警信号</div>
            <div className="text-sm font-bold" style={{ color: C.orange }}>{warnData?.total ?? 0}</div>
          </div>
        </div>
      </div>

      {/* 账号 / API 配置 */}
      {showApiForm && (
        <div className="cyber-card p-4 mb-4">
          <SectionHeader title="ValueScan Open API 密钥" color={C.purple} icon={<Key size={12} />} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: C.dim }}>API Key (ak_xxx)</label>
              <input value={apiKeys.apiKey} onChange={e => setApiKeys(p => ({ ...p, apiKey: e.target.value }))} className="cyber-input mt-1" placeholder="ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </div>
            <div>
              <label className="text-xs" style={{ color: C.dim }}>Secret Key (sk_xxx)</label>
              <div className="relative mt-1">
                <input type={showSecret ? "text" : "password"} value={apiKeys.secretKey} onChange={e => setApiKeys(p => ({ ...p, secretKey: e.target.value }))} className="cyber-input w-full pr-8" placeholder="sk_xxx" />
                <button onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: C.dim, background: "none", border: "none", cursor: "pointer" }}>
                  {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setOpenApiKeys.mutate(apiKeys)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.purple}60`, color: C.purple, background: `${C.purple}10`, borderRadius: 2, cursor: "pointer" }}>
              {setOpenApiKeys.isPending ? "保存中..." : "保存密钥"}
            </button>
            <button onClick={() => setShowApiForm(false)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}
      {showCredForm && (
        <div className="cyber-card p-4 mb-4">
          <SectionHeader title="ValueScan 账号（Bearer Token）" color={C.cyan} icon={<Database size={12} />} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: C.dim }}>邮箱</label>
              <input value={credentials.email} onChange={e => setCredentials(p => ({ ...p, email: e.target.value }))} className="cyber-input mt-1" placeholder="your@email.com" />
            </div>
            <div>
              <label className="text-xs" style={{ color: C.dim }}>密码</label>
              <input type="password" value={credentials.password} onChange={e => setCredentials(p => ({ ...p, password: e.target.value }))} className="cyber-input mt-1" placeholder="••••••••" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setCredentialsMutation.mutate(credentials)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: `${C.cyan}10`, borderRadius: 2, cursor: "pointer" }}>
              {setCredentialsMutation.isPending ? "保存中..." : "保存并登录"}
            </button>
            <button onClick={() => setShowCredForm(false)} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all" style={{
            border: `1px solid ${activeTab === tab.id ? C.cyan : C.border}`,
            color: activeTab === tab.id ? C.cyan : C.dim,
            background: activeTab === tab.id ? `${C.cyan}10` : "transparent",
            borderRadius: 2, cursor: "pointer",
            boxShadow: activeTab === tab.id ? `0 0 8px ${C.cyan}20` : "none",
          }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ 总览 Tab ═══ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* 恐贪指数大卡 */}
          <div className="cyber-card p-5">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="市场恐贪指数" color={fgColor} icon={<Activity size={12} />} />
              <TgButton title="市场恐贪指数" content={`恐贪指数: ${fgValue} ${fearGreed?.label ?? ""}\n昨日: ${fearGreed?.yesterday ?? 48}  7日均值: ${fearGreed?.week ?? 45}`} />
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-6xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: fgColor, textShadow: `0 0 30px ${fgColor}60` }}>{fgValue}</div>
                <div className="text-base mt-1 font-bold" style={{ color: fgColor }}>{fearGreed?.label ?? "中性"}</div>
              </div>
              <div className="flex-1">
                <div className="relative h-4 rounded-full overflow-hidden mb-3" style={{ background: "oklch(0.15 0.02 240)" }}>
                  <div className="h-4 rounded-full transition-all duration-1000" style={{ width: `${fgValue}%`, background: `linear-gradient(90deg, ${C.pink} 0%, ${C.orange} 40%, ${C.yellow} 60%, ${C.green} 100%)`, boxShadow: `0 0 10px ${fgColor}60` }} />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: "oklch(0.05 0 0)" }}>{fgValue}%</div>
                </div>
                <div className="flex justify-between text-xs mb-4" style={{ color: C.dim }}>
                  <span>0 极度恐慌</span><span>50 中性</span><span>100 极度贪婪</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2 rounded" style={{ background: "oklch(0.14 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="text-xs" style={{ color: C.dim }}>昨日</div>
                    <div className="text-lg font-bold" style={{ color: C.cyan }}>{fearGreed?.yesterday ?? 48}</div>
                  </div>
                  <div className="p-2 rounded" style={{ background: "oklch(0.14 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="text-xs" style={{ color: C.dim }}>7日均值</div>
                    <div className="text-lg font-bold" style={{ color: C.cyan }}>{fearGreed?.week ?? 45}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 机会 + 风险代币 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="cyber-card p-4">
              <div className="flex items-center justify-between mb-3">
                <SectionHeader title="机会代币列表" color={C.green} icon={<TrendingUp size={12} />} />
                <div className="flex items-center gap-2">
                  <SourceTag src={opportunities?.source} />
                  <TgButton title="机会代币" content={buildOppText()} />
                </div>
              </div>
              <div className="space-y-2">
                {(opportunities?.opportunities ?? []).map((o: any, i: number) => (
                  <div key={i} className="p-3 rounded" style={{ background: `${C.green}06`, border: `1px solid ${C.green}20` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: `${C.green}20`, color: C.green }}>{o.symbol}</span>
                        <ArrowUpRight size={12} style={{ color: C.green }} />
                        <span className="text-xs font-bold" style={{ color: C.green }}>LONG</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.green }}>{o.score}<span style={{ color: C.dim }}>/100</span></span>
                    </div>
                    <ScoreBar value={o.score} color={C.green} />
                    <div className="text-xs mt-1.5" style={{ color: C.dim }}>{o.reason}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cyber-card p-4">
              <div className="flex items-center justify-between mb-3">
                <SectionHeader title="风险代币列表" color={C.pink} icon={<AlertTriangle size={12} />} />
                <div className="flex items-center gap-2">
                  <SourceTag src={opportunities?.source} />
                  <button onClick={() => refetchOpp()} className="flex items-center gap-1 px-2 py-1 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
                    <RefreshCw size={9} />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {(opportunities?.risks ?? []).map((r: any, i: number) => (
                  <div key={i} className="p-3 rounded" style={{ background: `${C.pink}06`, border: `1px solid ${C.pink}20` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: `${C.pink}20`, color: C.pink }}>{r.symbol}</span>
                        <ArrowDownRight size={12} style={{ color: C.pink }} />
                        <span className="text-xs font-bold" style={{ color: C.pink }}>RISK</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.pink }}>{r.score}<span style={{ color: C.dim }}>/100</span></span>
                    </div>
                    <ScoreBar value={r.score} color={C.pink} />
                    <div className="text-xs mt-1.5" style={{ color: C.dim }}>{r.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 预警 Tab ═══ */}
      {activeTab === "alert" && (
        <div className="space-y-4">
          {/* 代币选择 */}
          <div className="cyber-card p-3 flex items-center gap-3">
            <Search size={13} style={{ color: C.dim }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter") { setTokenSymbol(searchInput); refetchPressure(); refetchMainForce(); } }}
              className="cyber-input flex-1 text-xs"
              placeholder="输入代币符号 (如 BTC, ETH, SOL)..."
            />
            <button onClick={() => { setTokenSymbol(searchInput); refetchPressure(); refetchMainForce(); }} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: `${C.cyan}10`, borderRadius: 2, cursor: "pointer" }}>
              查询 {searchInput}
            </button>
          </div>

          {/* 压力支撑位 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title={`压力支撑位 · ${tokenSymbol}`} color={C.yellow} icon={<Shield size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={pressureData?.source} />
                <TgButton title={`${tokenSymbol} 压力支撑位`} content={buildPressureText()} />
              </div>
            </div>
            <div className="space-y-2">
              {(pressureData?.levels ?? []).map((l: any, i: number) => {
                const isResist = l.type === "resistance";
                const isCurrent = l.type === "current";
                const lvColor = isResist ? C.pink : isCurrent ? C.cyan : C.green;
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded" style={{ background: isCurrent ? `${C.cyan}10` : "oklch(0.12 0.015 240)", border: `1px solid ${lvColor}${isCurrent ? "60" : "20"}` }}>
                    <div className="w-16 text-xs font-bold" style={{ color: lvColor }}>
                      {isResist ? "▲ 阻力" : isCurrent ? "◈ 当前" : "▼ 支撑"}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold" style={{ color: lvColor, fontFamily: "'Orbitron', monospace" }}>${l.price?.toLocaleString()}</span>
                        <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${lvColor}15`, color: lvColor }}>{l.label}</span>
                      </div>
                      {!isCurrent && <ScoreBar value={l.strength} color={lvColor} />}
                      {!isCurrent && <div className="text-xs mt-0.5" style={{ color: C.dim }}>强度 {l.strength}%</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 主力行为指标 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title={`主力行为指标 · ${tokenSymbol}`} color={C.purple} icon={<BarChart2 size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={mainForceData?.source} />
                <TgButton title={`${tokenSymbol} 主力行为`} content={(mainForceData?.indicators ?? []).map((ind: any) => `${ind.name}: ${ind.value > 0 ? "+" : ""}${ind.value}${ind.unit} [${ind.signal}]`).join("\n")} />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(mainForceData?.indicators ?? []).map((ind: any, i: number) => {
                const isPos = ind.trend === "up";
                const indColor = ind.signal === "出货" || ind.signal === "抛压" || ind.signal === "减仓" ? C.pink :
                                 ind.signal === "待入场" ? C.yellow : isPos ? C.green : C.orange;
                return (
                  <div key={i} className="p-3 rounded" style={{ background: "oklch(0.13 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: C.dim }}>{ind.name}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${indColor}15`, color: indColor }}>{ind.signal}</span>
                    </div>
                    <div className="text-base font-bold" style={{ color: indColor, fontFamily: "'Orbitron', monospace" }}>
                      {ind.value > 0 ? "+" : ""}{ind.value}<span className="text-xs ml-1" style={{ color: C.dim }}>{ind.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 预警信号列表 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="预警信号消息" color={C.orange} icon={<Bell size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={warnData?.source} />
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${C.orange}15`, color: C.orange }}>共 {warnData?.total ?? 0} 条</span>
                <TgButton title="预警信号" content={(warnData?.messages ?? []).slice(0, 10).map((m: any) => `${m.symbol ?? ""} ${m.type ?? ""}: ${m.content ?? m.message ?? m.desc ?? JSON.stringify(m).slice(0, 60)}`).join("\n")} />
              </div>
            </div>
            {warnData?.messages && warnData.messages.length > 0 ? (
              <div className="space-y-2">
                {warnData.messages.map((msg: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded" style={{ background: "oklch(0.13 0.015 240)", border: `1px solid ${C.border}` }}>
                    <AlertTriangle size={14} style={{ color: C.orange, flexShrink: 0, marginTop: 1 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {msg.symbol && <span className="text-xs font-bold" style={{ color: C.cyan }}>{msg.symbol}</span>}
                        {msg.type && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${C.orange}15`, color: C.orange }}>{msg.type}</span>}
                        <span className="flex-1" />
                        {msg.time && <TimeAgo time={msg.time} />}
                      </div>
                      <div className="text-xs" style={{ color: "oklch(0.80 0.04 220)" }}>{msg.content ?? msg.message ?? msg.desc ?? JSON.stringify(msg).slice(0, 100)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: C.dim }}>
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                <div className="text-xs">{warnData?.source === "unavailable" ? "VS API 服务暂时不可用" : "暂无预警信号"}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 资金 Tab ═══ */}
      {activeTab === "funding" && (
        <div className="space-y-4">
          {/* 资金异动列表 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="资金异动列表" color={C.orange} icon={<DollarSign size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={fundingAlerts?.source} />
                <TgButton title="资金异动" content={buildFundingText()} />
              </div>
            </div>
            <div className="space-y-2">
              {(fundingAlerts?.list ?? []).map((f: any, i: number) => {
                const isIn = (f.type ?? "").includes("IN") || (f.type ?? "").includes("INFLOW");
                const fColor = isIn ? C.pink : C.green;
                return (
                  <div key={i} className="p-3 rounded" style={{ background: "oklch(0.12 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${fColor}15` }}>
                        {isIn ? <ArrowDownRight size={16} style={{ color: fColor }} /> : <ArrowUpRight size={16} style={{ color: fColor }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: `${fColor}20`, color: fColor }}>{f.symbol}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.15 0.02 240)", color: C.dim }}>{f.type}</span>
                          <span className="flex-1" />
                          {f.time && <TimeAgo time={f.time} />}
                        </div>
                        <div className="text-xs" style={{ color: C.dim }}>{f.desc}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold" style={{ color: fColor }}>${((f.usdValue ?? 0) / 1e6).toFixed(1)}M</div>
                        <div className="text-xs" style={{ color: C.dim }}>{f.exchange ?? ""}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 巨鲸大额流向 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="资金异动消息 · 巨鲸大额" color={C.yellow} icon={<DollarSign size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={largeTransactions?.source} />
                <TgButton title="巨鲸资金异动" content={(largeTransactions?.transactions ?? []).map((t: any) => `${t.symbol} ${t.direction === "IN" ? "流入" : "流出"} $${(t.amount / 1e6).toFixed(1)}M · ${t.exchange}`).join("\n")} />
              </div>
            </div>
            {largeTransactions?.transactions && largeTransactions.transactions.length > 0 && (() => {
              const txs = largeTransactions.transactions;
              const inTotal = txs.filter((t: any) => t.direction === "IN").reduce((s: number, t: any) => s + t.amount, 0);
              const outTotal = txs.filter((t: any) => t.direction === "OUT").reduce((s: number, t: any) => s + t.amount, 0);
              const total = inTotal + outTotal;
              const inPct = total > 0 ? (inTotal / total) * 100 : 50;
              return (
                <div className="mb-3 p-3 rounded" style={{ background: "oklch(0.13 0.015 240)", border: `1px solid ${C.border}` }}>
                  <div className="flex justify-between text-xs mb-2">
                    <span style={{ color: C.green }}>▲ 流入 ${(inTotal / 1e6).toFixed(1)}M</span>
                    <span style={{ color: C.pink }}>流出 ${(outTotal / 1e6).toFixed(1)}M ▼</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: `${C.pink}30` }}>
                    <div className="h-2.5 rounded-full" style={{ width: `${inPct}%`, background: C.green }} />
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: C.dim }}>
                    <span>{inPct.toFixed(0)}% 流入</span><span>{(100 - inPct).toFixed(0)}% 流出</span>
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              {(largeTransactions?.transactions ?? []).map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded" style={{ background: "oklch(0.12 0.015 240)", border: `1px solid ${C.border}` }}>
                  <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: t.direction === "IN" ? `${C.green}15` : `${C.pink}15` }}>
                    {t.direction === "IN" ? <ArrowUpRight size={14} style={{ color: C.green }} /> : <ArrowDownRight size={14} style={{ color: C.pink }} />}
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-bold" style={{ color: t.direction === "IN" ? C.green : C.pink }}>{t.symbol}</span>
                    <span className="text-xs ml-2" style={{ color: C.dim }}>{t.exchange}</span>
                  </div>
                  <div className="text-sm font-bold" style={{ color: t.direction === "IN" ? C.green : C.pink }}>
                    {t.direction === "IN" ? "+" : "-"}${(t.amount / 1e6).toFixed(2)}M
                  </div>
                  <TimeAgo time={t.time} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ 大盘 Tab ═══ */}
      {activeTab === "market" && (
        <div className="space-y-4">
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="大盘分析订阅 · 解析历史" color={C.cyan} icon={<BookOpen size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={analysisHistory?.source} />
                <TgButton title="大盘解析" content={buildMarketText()} />
                <button onClick={() => refetchHistory()} className="flex items-center gap-1 px-2 py-1 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
                  <RefreshCw size={9} />
                </button>
              </div>
            </div>
            {(analysisHistory?.list ?? []).length > 0 ? (
              <div className="space-y-3">
                {(analysisHistory?.list ?? []).map((a: any, i: number) => (
                  <div key={i} className="p-4 rounded" style={{ background: "oklch(0.13 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen size={13} style={{ color: C.cyan }} />
                        <span className="text-sm font-bold" style={{ color: C.cyan }}>{a.title ?? "大盘分析"}</span>
                        {a.type && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${C.cyan}15`, color: C.cyan }}>{a.type}</span>}
                      </div>
                      {a.time && <TimeAgo time={a.time} />}
                    </div>
                    <div className="text-xs leading-relaxed" style={{ color: "oklch(0.78 0.04 220)" }}>{a.content ?? a.desc ?? a.message ?? JSON.stringify(a).slice(0, 200)}</div>
                    <div className="mt-2 flex justify-end">
                      <TgButton
                        title={a.title ?? "大盘分析"}
                        content={a.content ?? a.desc ?? a.message ?? ""}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: C.dim }}>
                <BookOpen size={24} className="mx-auto mb-2 opacity-30" />
                <div className="text-xs">暂无大盘分析数据</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 信号 Tab ═══ */}
      {activeTab === "signal" && (
        <div className="space-y-4">
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="代币信号订阅" color={C.green} icon={<Radio size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={signalData?.source} />
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${C.green}15`, color: C.green }}>共 {signalData?.total ?? 0}</span>
                <TgButton title="代币信号" content={buildSignalText()} />
                <button onClick={() => refetchSignal()} className="flex items-center gap-1 px-2 py-1 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
                  <RefreshCw size={9} />
                </button>
              </div>
            </div>
            {signalData?.signals && signalData.signals.length > 0 ? (
              <div className="space-y-2">
                {signalData.signals.map((sig: any, i: number) => {
                  const dir = (sig.direction ?? sig.signal ?? "").toUpperCase();
                  const isLong = dir.includes("LONG") || dir.includes("BUY");
                  const isShort = dir.includes("SHORT") || dir.includes("SELL");
                  const sigColor = isLong ? C.green : isShort ? C.pink : C.cyan;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded" style={{ background: `${sigColor}06`, border: `1px solid ${sigColor}20` }}>
                      {isLong ? <TrendingUp size={14} style={{ color: sigColor }} /> : isShort ? <TrendingDown size={14} style={{ color: sigColor }} /> : <Minus size={14} style={{ color: sigColor }} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: sigColor }}>{sig.symbol ?? sig.coin ?? "?"}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: `${sigColor}20`, color: sigColor }}>{sig.direction ?? sig.signal ?? "SIGNAL"}</span>
                          {sig.score && <span className="text-xs" style={{ color: C.dim }}>评分 {sig.score}</span>}
                        </div>
                        {sig.reason && <div className="text-xs mt-0.5" style={{ color: C.dim }}>{sig.reason}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {sig.time && <TimeAgo time={sig.time} />}
                        <TgButton
                          title={`${sig.symbol ?? "?"} 信号`}
                          content={`${sig.symbol ?? "?"} ${sig.direction ?? sig.signal ?? "SIGNAL"} 评分${sig.score ?? "-"}\n${sig.reason ?? ""}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: C.dim }}>
                <Radio size={24} className="mx-auto mb-2 opacity-30" />
                <div className="text-xs">{signalData?.source === "unavailable" ? "VS API 服务暂时不可用" : "暂无代币信号"}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 情绪 Tab ═══ */}
      {activeTab === "social" && (
        <div className="space-y-4">
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title="社媒情绪分析" color={C.purple} icon={<Zap size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={socialSentiment?.source} />
                <TgButton title="社媒情绪" content={buildSocialText()} />
                <button onClick={() => refetchSocial()} className="flex items-center gap-1 px-2 py-1 text-xs" style={{ border: `1px solid ${C.dim}40`, color: C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
                  <RefreshCw size={9} />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {(socialSentiment?.sentiment ?? []).map((s: any, i: number) => {
                const sentColor = s.score >= 60 ? C.green : s.score >= 40 ? C.cyan : C.pink;
                return (
                  <div key={i} className="p-3 rounded" style={{ background: "oklch(0.13 0.015 240)", border: `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: sentColor, fontFamily: "'Orbitron', monospace" }}>{s.symbol}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${sentColor}15`, color: sentColor }}>{s.label}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: sentColor }}>{s.score}</div>
                        <div className="text-xs" style={{ color: C.dim }}>{s.mentions?.toLocaleString()} 提及</div>
                      </div>
                    </div>
                    <ScoreBar value={s.score} color={sentColor} />
                    <div className="flex justify-between text-xs mt-1" style={{ color: C.dim }}>
                      <span>0 极度看空</span><span>50 中性</span><span>100 极度看多</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {socialSentiment?.sentiment && socialSentiment.sentiment.length > 0 && (() => {
            const sents = socialSentiment.sentiment;
            const bullish = sents.filter((s: any) => s.score >= 55).length;
            const bearish = sents.filter((s: any) => s.score < 45).length;
            const neutral = sents.length - bullish - bearish;
            const total = sents.length;
            return (
              <div className="cyber-card p-4">
                <SectionHeader title="多空情绪分布" color={C.cyan} />
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: "看多", count: bullish, color: C.green },
                    { label: "中性", count: neutral, color: C.cyan },
                    { label: "看空", count: bearish, color: C.pink },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="text-center p-3 rounded" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
                      <div className="text-2xl font-bold" style={{ color, fontFamily: "'Orbitron', monospace" }}>{count}</div>
                      <div className="text-xs" style={{ color }}>{label}</div>
                      <div className="text-xs" style={{ color: C.dim }}>{((count / total) * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
                <div className="h-3 rounded-full overflow-hidden flex">
                  <div style={{ width: `${(bullish / total) * 100}%`, background: C.green }} />
                  <div style={{ width: `${(neutral / total) * 100}%`, background: C.cyan }} />
                  <div style={{ flex: 1, background: C.pink }} />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ 代币 Tab ═══ */}
      {activeTab === "token" && (
        <div className="space-y-4">
          {/* 代币搜索 */}
          <div className="cyber-card p-3 flex items-center gap-3">
            <Search size={13} style={{ color: C.dim }} />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter") { setTokenSymbol(searchInput); refetchTokenInfo(); refetchKline(); } }}
              className="cyber-input flex-1 text-xs"
              placeholder="输入代币符号 (如 BTC, ETH, SOL)..."
            />
            <select
              value={klineInterval}
              onChange={e => setKlineInterval(e.target.value)}
              className="cyber-input text-xs"
              style={{ width: 80 }}
            >
              <option value="1h">1小时</option>
              <option value="4h">4小时</option>
              <option value="1d">日线</option>
            </select>
            <button onClick={() => { setTokenSymbol(searchInput); refetchTokenInfo(); refetchKline(); }} className="px-4 py-1.5 text-xs" style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: `${C.cyan}10`, borderRadius: 2, cursor: "pointer" }}>
              查询
            </button>
          </div>

          {/* 代币基本信息 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title={`代币基本信息 · ${tokenSymbol}`} color={C.cyan} icon={<Layers size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={tokenInfoData?.source} />
                <TgButton
                  title={`${tokenSymbol} 基本信息`}
                  content={tokenInfoData?.info ? `${tokenInfoData.info.name ?? tokenSymbol} ($${tokenInfoData.info.price?.toLocaleString() ?? "N/A"})\n市值: $${((tokenInfoData.info.marketCap ?? 0) / 1e9).toFixed(1)}B\n24h量: $${((tokenInfoData.info.volume24h ?? 0) / 1e9).toFixed(1)}B\n24h: ${tokenInfoData.info.change24h ?? 0}%  7d: ${tokenInfoData.info.change7d ?? 0}%\n${tokenInfoData.info.desc ?? ""}` : "暂无数据"}
                />
              </div>
            </div>
            {tokenInfoData?.info ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-3xl font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.cyan }}>${tokenInfoData.info.price?.toLocaleString() ?? "N/A"}</div>
                    <div className="text-xs mt-0.5" style={{ color: C.dim }}>{tokenInfoData.info.name ?? tokenSymbol}</div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-sm font-bold px-2 py-1 rounded" style={{ background: (tokenInfoData.info.change24h ?? 0) >= 0 ? `${C.green}15` : `${C.pink}15`, color: (tokenInfoData.info.change24h ?? 0) >= 0 ? C.green : C.pink }}>
                      {(tokenInfoData.info.change24h ?? 0) > 0 ? "+" : ""}{tokenInfoData.info.change24h ?? 0}% 24h
                    </span>
                    <span className="text-sm font-bold px-2 py-1 rounded" style={{ background: (tokenInfoData.info.change7d ?? 0) >= 0 ? `${C.green}15` : `${C.pink}15`, color: (tokenInfoData.info.change7d ?? 0) >= 0 ? C.green : C.pink }}>
                      {(tokenInfoData.info.change7d ?? 0) > 0 ? "+" : ""}{tokenInfoData.info.change7d ?? 0}% 7d
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {[
                    { label: "市值排名", value: `#${tokenInfoData.info.rank ?? "-"}`, color: C.yellow },
                    { label: "市值", value: `$${((tokenInfoData.info.marketCap ?? 0) / 1e9).toFixed(1)}B`, color: C.cyan },
                    { label: "24h成交量", value: `$${((tokenInfoData.info.volume24h ?? 0) / 1e9).toFixed(1)}B`, color: C.purple },
                    { label: "历史高点", value: `$${tokenInfoData.info.ath?.toLocaleString() ?? "-"}`, color: C.green },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-2 rounded" style={{ background: "oklch(0.14 0.015 240)", border: `1px solid ${C.border}` }}>
                      <div className="text-xs" style={{ color: C.dim }}>{label}</div>
                      <div className="text-sm font-bold" style={{ color }}>{value}</div>
                    </div>
                  ))}
                </div>
                {tokenInfoData.info.desc && (
                  <div className="p-3 rounded text-xs" style={{ background: "oklch(0.13 0.015 240)", color: C.dim, border: `1px solid ${C.border}` }}>
                    {tokenInfoData.info.desc}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6" style={{ color: C.dim }}><Layers size={20} className="mx-auto mb-2 opacity-30" /><div className="text-xs">查询 {tokenSymbol} 基本信息中...</div></div>
            )}
          </div>

          {/* K 线数据 */}
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader title={`K 线数据 · ${tokenSymbol} · ${klineInterval}`} color={C.purple} icon={<CandlestickChart size={12} />} />
              <div className="flex items-center gap-2">
                <SourceTag src={klineData?.source} />
                <TgButton
                  title={`${tokenSymbol} K线数据`}
                  content={`${tokenSymbol} ${klineInterval} 最近24根K线\n最新价: ${klineData?.candles?.at(-1)?.close?.toLocaleString() ?? "N/A"}\n最高: ${Math.max(...(klineData?.candles ?? []).map((c: any) => c.high ?? 0)).toLocaleString()}\n最低: ${Math.min(...(klineData?.candles ?? []).filter((c: any) => c.low > 0).map((c: any) => c.low)).toLocaleString()}`}
                />
              </div>
            </div>
            {klineData?.candles && klineData.candles.length > 0 ? (() => {
              const candles = klineData.candles;
              const maxH = Math.max(...candles.map((c: any) => c.high ?? 0));
              const minL = Math.min(...candles.filter((c: any) => c.low > 0).map((c: any) => c.low));
              const range = maxH - minL;
              return (
                <div>
                  <div className="flex items-end gap-0.5 mb-3" style={{ height: 80 }}>
                    {candles.map((c: any, i: number) => {
                      const isBull = (c.close ?? 0) >= (c.open ?? 0);
                      const bodyH = Math.abs((c.close ?? 0) - (c.open ?? 0)) / range;
                      const bodyBot = (Math.min(c.close ?? 0, c.open ?? 0) - minL) / range;
                      return (
                        <div key={i} className="flex-1 relative" style={{ height: "100%" }}>
                          <div className="absolute w-px left-1/2 -translate-x-1/2" style={{
                            bottom: `${(((c.low ?? 0) - minL) / range) * 100}%`,
                            height: `${(((c.high ?? 0) - (c.low ?? 0)) / range) * 100}%`,
                            background: isBull ? C.green : C.pink,
                          }} />
                          <div className="absolute left-0 right-0 mx-px rounded-sm" style={{
                            bottom: `${bodyBot * 100}%`,
                            height: `${Math.max(1, bodyH * 100)}%`,
                            background: isBull ? C.green : C.pink,
                            opacity: 0.85,
                          }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div style={{ color: C.dim }}>最高: <span style={{ color: C.green }}>${maxH.toLocaleString()}</span></div>
                    <div className="text-center" style={{ color: C.dim }}>最低: <span style={{ color: C.pink }}>${minL.toLocaleString()}</span></div>
                    <div className="text-right" style={{ color: C.dim }}>最新: <span style={{ color: C.cyan }}>${(candles.at(-1)?.close ?? 0).toLocaleString()}</span></div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                    {candles.slice(-8).reverse().map((c: any, i: number) => {
                      const isBull = (c.close ?? 0) >= (c.open ?? 0);
                      const chg = (((c.close ?? 0) - (c.open ?? 0)) / (c.open ?? 1) * 100).toFixed(2);
                      return (
                        <div key={i} className="p-1.5 rounded text-xs" style={{ background: isBull ? `${C.green}08` : `${C.pink}08`, border: `1px solid ${isBull ? C.green : C.pink}20` }}>
                          <div style={{ color: C.dim, fontSize: "0.55rem" }}>{new Date(c.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
                          <div style={{ color: isBull ? C.green : C.pink, fontFamily: "'Orbitron', monospace", fontSize: "0.65rem" }}>{isBull ? "+" : ""}{chg}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (
              <div className="text-center py-6" style={{ color: C.dim }}><CandlestickChart size={20} className="mx-auto mb-2 opacity-30" /><div className="text-xs">K 线数据加载中...</div></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
