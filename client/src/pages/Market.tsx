import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

function calcSupportResistance(series: { high: number; low: number; close: number }[], window = 5) {
  const supports: number[] = [];
  const resistances: number[] = [];
  for (let i = window; i < series.length - window; i++) {
    const slice = series.slice(i - window, i + window + 1);
    const minLow = Math.min(...slice.map(s => s.low));
    const maxHigh = Math.max(...slice.map(s => s.high));
    if (series[i].low === minLow) supports.push(series[i].low);
    if (series[i].high === maxHigh) resistances.push(series[i].high);
  }
  const unique = (arr: number[]) => [...new Set(arr.map(v => Math.round(v * 100) / 100))];
  return { supports: unique(supports).slice(-3), resistances: unique(resistances).slice(-3) };
}

function calcSignalMarkers(series: { ema7: number; ema25: number; close: number; time: string }[]) {
  const markers: { i: number; type: "BUY" | "SELL"; price: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    if (prev.ema7 <= prev.ema25 && cur.ema7 > cur.ema25) {
      markers.push({ i, type: "BUY", price: cur.close });
    } else if (prev.ema7 >= prev.ema25 && cur.ema7 < cur.ema25) {
      markers.push({ i, type: "SELL", price: cur.close });
    }
  }
  return markers;
}

const C = {
  green: "oklch(0.85 0.28 145)",
  cyan: "oklch(0.80 0.22 200)",
  orange: "oklch(0.72 0.22 50)",
  pink: "oklch(0.72 0.28 340)",
  purple: "oklch(0.75 0.2 290)",
  dim: "oklch(0.55 0.04 220)",
  bg: "oklch(0.10 0.015 240)",
  card: "oklch(0.12 0.015 240)",
};

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  return values.reduce<number[]>((acc, v, i) => {
    acc.push(i === 0 ? v : v * k + acc[i - 1] * (1 - k));
    return acc;
  }, []);
}

function macd(values: number[]) {
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const diff = values.map((_, i) => fast[i] - slow[i]);
  const dea = ema(diff, 9);
  const hist = diff.map((d, i) => (d - dea[i]) * 2);
  return { diff, dea, hist };
}

const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];

function formatTime(iso: string, interval: string) {
  try {
    const d = new Date(iso);
    if (interval === "1d") return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function formatPrice(price: number) {
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return price.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function Market() {
  const { data: signals } = trpc.signals.list.useQuery({ limit: 20 }, { refetchInterval: 15000 });
  const [symbol, setSymbol] = useState("BTC");
  const [interval, setInterval] = useState("15m");

  const selected = SYMBOLS.includes(symbol) ? symbol : "BTC";

  const { data: klinesData, isLoading: klinesLoading } = trpc.market.klines.useQuery(
    { symbol: selected, interval, limit: 72 },
    { refetchInterval: 30000, staleTime: 15000 }
  );

  const { data: tickersData } = trpc.market.tickers.useQuery(
    { symbols: SYMBOLS },
    { refetchInterval: 15000, staleTime: 10000 }
  );

  const series = useMemo(() => {
    const candles = klinesData?.candles ?? [];
    if (candles.length === 0) return [];
    const closes = candles.map((c: any) => c.close);
    const ema7 = ema(closes, 7);
    const ema25 = ema(closes, 25);
    const macdData = macd(closes);
    return candles.map((c: any, i: number) => ({
      ...c,
      time: formatTime(c.time, interval),
      ema7: ema7[i],
      ema25: ema25[i],
      diff: macdData.diff[i],
      dea: macdData.dea[i],
      hist: macdData.hist[i],
      volumeColor: c.close >= c.open ? C.green : C.pink,
    }));
  }, [klinesData, interval]);

  const last = series.at(-1);
  const prev = series.at(-2);
  const longBias = last && last.close >= last.ema25 && last.ema7 >= last.ema25;

  const signalMarkers = useMemo(() => (series.length > 0 ? calcSignalMarkers(series) : []), [series]);
  const { supports, resistances } = useMemo(() => (series.length > 0 ? calcSupportResistance(series) : { supports: [], resistances: [] }), [series]);

  const tickers = tickersData?.tickers ?? {};

  const currentPrice = tickers[selected]?.price ?? last?.close ?? 0;
  const currentChange = tickers[selected]?.change24h ?? 0;

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>市场行情</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>
            实时 K 线 · OKX 数据源 · 30s 自动刷新
            {klinesData?.source && (
              <span style={{ color: klinesData.source === "error" ? C.orange : C.green, marginLeft: 8 }}>
                {klinesData.source === "error" ? "[○ 数据异常]" : "[● 实时]"}
              </span>
            )}
          </p>
        </div>
        {tickersData?.updatedAt ? (
          <div className="text-xs" style={{ color: C.dim }}>
            更新: {new Date(tickersData.updatedAt).toLocaleTimeString("zh-CN")}
          </div>
        ) : null}
      </div>

      {/* ─── 币种选择卡（真实报价） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {SYMBOLS.map(sym => {
          const tk = tickers[sym];
          const sig = signals?.find(s => s.symbol === sym);
          const change = tk ? tk.change24h : null;
          const price = tk ? tk.price : null;
          const isUp = (change ?? 0) >= 0;
          return (
            <button key={sym} onClick={() => setSymbol(sym)} className="cyber-card p-3 text-left" style={{ borderColor: sym === selected ? C.green : undefined }}>
              <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-sm" style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>{sym}</span>
                {change !== null ? (
                  <span className="text-xs" style={{ color: isUp ? C.green : C.pink }}>{isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%</span>
                ) : <span className="text-xs" style={{ color: C.dim }}>--</span>}
              </div>
              {price !== null ? (
                <div className="text-xs font-bold" style={{ color: C.cyan, fontFamily: "'Orbitron', monospace" }}>${formatPrice(price)}</div>
              ) : (
                <div className="text-xs" style={{ color: C.dim }}>加载中...</div>
              )}
              {sig && (
                <div className="text-xs mt-1" style={{ color: C.dim }}>
                  信号: <span className={`badge-${sig.type.toLowerCase()}`}>{sig.type}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="cyber-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold" style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>
              {selected} / USDT &nbsp;
              <span style={{ color: currentChange >= 0 ? C.green : C.pink, fontSize: 12 }}>
                {currentChange >= 0 ? "▲" : "▼"} {Math.abs(currentChange).toFixed(2)}%
              </span>
            </div>
            <div className="text-xs" style={{ color: C.dim }}>
              周期 {interval} · 当前价 ${formatPrice(currentPrice)} · {series.length > 0 ? `${series.length} 根 K 线` : "加载中..."}
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            {["5m", "15m", "1h", "4h"].map(v => (
              <button key={v} onClick={() => setInterval(v)} className="px-2 py-1" style={{ border: `1px solid ${interval === v ? C.green : C.dim}60`, color: interval === v ? C.green : C.dim, background: "transparent", borderRadius: 2, cursor: "pointer" }}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* 四项指标 */}
        {last && prev ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
              <div className="text-[10px]" style={{ color: C.dim }}>趋势</div>
              <div className="text-sm font-bold" style={{ color: longBias ? C.green : C.pink }}>{longBias ? "多头占优" : "空头占优"}</div>
            </div>
            <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.cyan}20`, borderRadius: 4 }}>
              <div className="text-[10px]" style={{ color: C.dim }}>EMA7 / EMA25</div>
              <div className="text-sm font-bold" style={{ color: C.cyan }}>{last.ema7.toFixed(2)} / {last.ema25.toFixed(2)}</div>
            </div>
            <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.orange}20`, borderRadius: 4 }}>
              <div className="text-[10px]" style={{ color: C.dim }}>MACD</div>
              <div className="text-sm font-bold" style={{ color: last.diff >= last.dea ? C.green : C.pink }}>{last.diff.toFixed(2)} / {last.dea.toFixed(2)}</div>
            </div>
            <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.purple}20`, borderRadius: 4 }}>
              <div className="text-[10px]" style={{ color: C.dim }}>24h 成交量</div>
              <div className="text-sm font-bold" style={{ color: C.purple }}>
                {tickers[selected]?.volume ? (tickers[selected].volume / 1000).toFixed(0) + "K" : Math.round(last.volume).toLocaleString()}
              </div>
            </div>
          </div>
        ) : null}

        {/* ─── 主 K 线图 */}
        <div className="p-3 mb-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs" style={{ color: C.dim }}>K 线图 · 多空信号标注</div>
            <div className="flex items-center gap-3 text-[10px]">
              <span style={{ color: C.green }}>── EMA7</span>
              <span style={{ color: C.orange }}>── EMA25</span>
              <span style={{ color: C.green }}>▲ 买点</span>
              <span style={{ color: C.pink }}>▼ 卖点</span>
              <span style={{ color: `${C.green}80` }}>- 支撑</span>
              <span style={{ color: `${C.pink}80` }}>- 压力</span>
            </div>
          </div>
          <div style={{ background: "linear-gradient(180deg, oklch(0.13 0.015 240), oklch(0.09 0.015 240))", borderRadius: 4, overflow: "hidden", minHeight: 260 }}>
            {klinesLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 260, color: C.dim, fontSize: 13 }}>
                ⏳ 加载 Binance 实时数据...
              </div>
            ) : series.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 260, color: C.dim, fontSize: 13 }}>
                ⚠ 数据加载失败，请稍后重试
              </div>
            ) : (() => {
              const W = 720, H = 260, PAD = 12;
              const priceMin = Math.min(...series.map(s => s.low));
              const priceMax = Math.max(...series.map(s => s.high));
              const range = priceMax - priceMin || 1;
              const toX = (i: number) => (i / (series.length - 1)) * (W - PAD * 2) + PAD;
              const toY = (p: number) => H - PAD - ((p - priceMin) / range) * (H - PAD * 2 - 20);
              const ema7Path = series.map((c, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(c.ema7).toFixed(1)}`).join(" ");
              const ema25Path = series.map((c, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(c.ema25).toFixed(1)}`).join(" ");
              return (
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
                  {[0.25, 0.5, 0.75].map(f => (
                    <line key={f} x1={PAD} y1={H - PAD - f * (H - PAD * 2 - 20)} x2={W - PAD} y2={H - PAD - f * (H - PAD * 2 - 20)} stroke={`${C.dim}30`} strokeWidth="1" />
                  ))}
                  {/* 价格刻度 */}
                  {[0.25, 0.5, 0.75].map(f => {
                    const p = priceMin + f * range;
                    return <text key={`lbl${f}`} x={PAD + 2} y={H - PAD - f * (H - PAD * 2 - 20) - 3} fill={C.dim} fontSize="8" fontFamily="'Share Tech Mono', monospace">{formatPrice(p)}</text>;
                  })}
                  {supports.map((p, i) => (
                    <g key={`sup${i}`}>
                      <line x1={PAD} y1={toY(p)} x2={W - PAD} y2={toY(p)} stroke={C.green} strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />
                      <text x={W - PAD - 2} y={toY(p) - 3} fill={C.green} fontSize="8" textAnchor="end" fontFamily="'Share Tech Mono', monospace" opacity="0.8">S {formatPrice(p)}</text>
                    </g>
                  ))}
                  {resistances.map((p, i) => (
                    <g key={`res${i}`}>
                      <line x1={PAD} y1={toY(p)} x2={W - PAD} y2={toY(p)} stroke={C.pink} strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />
                      <text x={W - PAD - 2} y={toY(p) - 3} fill={C.pink} fontSize="8" textAnchor="end" fontFamily="'Share Tech Mono', monospace" opacity="0.8">R {formatPrice(p)}</text>
                    </g>
                  ))}
                  {series.map((c, i) => {
                    const x = toX(i);
                    const isUp = c.close >= c.open;
                    const bodyTop = toY(Math.max(c.open, c.close));
                    const bodyBot = toY(Math.min(c.open, c.close));
                    const bodyH = Math.max(2, bodyBot - bodyTop);
                    return (
                      <g key={i}>
                        <line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={isUp ? C.green : C.pink} strokeWidth="1.5" opacity="0.7" />
                        <rect x={x - 4} y={bodyTop} width="8" height={bodyH} fill={isUp ? C.green : C.pink} opacity="0.85" rx="1" />
                      </g>
                    );
                  })}
                  <path d={ema7Path} fill="none" stroke={C.green} strokeWidth="1.5" opacity="0.8" />
                  <path d={ema25Path} fill="none" stroke={C.orange} strokeWidth="1.5" opacity="0.8" />
                  {signalMarkers.map((m, idx) => {
                    const x = toX(m.i);
                    if (m.type === "BUY") {
                      const y = toY(series[m.i].low) + 18;
                      return (
                        <g key={idx}>
                          <polygon points={`${x},${y - 12} ${x - 7},${y + 4} ${x + 7},${y + 4}`} fill={C.green} opacity="0.95" />
                          <text x={x} y={y + 16} textAnchor="middle" fill={C.green} fontSize="8" fontFamily="'Share Tech Mono', monospace">BUY</text>
                        </g>
                      );
                    } else {
                      const y = toY(series[m.i].high) - 18;
                      return (
                        <g key={idx}>
                          <polygon points={`${x},${y + 12} ${x - 7},${y - 4} ${x + 7},${y - 4}`} fill={C.pink} opacity="0.95" />
                          <text x={x} y={y - 8} textAnchor="middle" fill={C.pink} fontSize="8" fontFamily="'Share Tech Mono', monospace">SELL</text>
                        </g>
                      );
                    }
                  })}
                  {last && <text x={W - PAD + 2} y={toY(last.close) + 4} fill={longBias ? C.green : C.pink} fontSize="9" fontFamily="'Share Tech Mono', monospace">{formatPrice(last.close)}</text>}
                </svg>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* 成交量柱 */}
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>成交量（最近 12 根）</div>
            {series.length > 0 ? (
              <div className="grid grid-cols-12 gap-1 items-end h-40">
                {series.slice(-12).map((c, i) => {
                  const maxVol = Math.max(...series.slice(-12).map(x => x.volume));
                  const barH = Math.max(8, (c.volume / (maxVol || 1)) * 130);
                  return (
                    <div key={i} className="flex flex-col items-center justify-end h-full">
                      <div style={{ height: `${barH}px`, width: "100%", background: c.close >= c.open ? C.green : C.pink, opacity: 0.6, borderRadius: 1 }} />
                      <div className="text-[8px] mt-1 truncate w-full text-center" style={{ color: C.dim }}>{c.time}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 12 }}>加载中...</div>
            )}
          </div>

          {/* 支撑/压力 */}
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>支撑 / 压力位</div>
            <div className="space-y-2">
              {resistances.map((r, i) => (
                <div key={`r${i}`} className="flex items-center justify-between text-xs px-2 py-1.5" style={{ background: `${C.pink}10`, borderRadius: 3, border: `1px solid ${C.pink}30` }}>
                  <span style={{ color: C.dim }}>压力 R{i + 1}</span>
                  <span style={{ color: C.pink, fontFamily: "'Orbitron', monospace" }}>${formatPrice(r)}</span>
                  {last && <span style={{ color: C.dim, fontSize: 10 }}>+{((r - last.close) / last.close * 100).toFixed(2)}%</span>}
                </div>
              ))}
              {supports.map((s, i) => (
                <div key={`s${i}`} className="flex items-center justify-between text-xs px-2 py-1.5" style={{ background: `${C.green}10`, borderRadius: 3, border: `1px solid ${C.green}30` }}>
                  <span style={{ color: C.dim }}>支撑 S{i + 1}</span>
                  <span style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>${formatPrice(s)}</span>
                  {last && <span style={{ color: C.dim, fontSize: 10 }}>{((s - last.close) / last.close * 100).toFixed(2)}%</span>}
                </div>
              ))}
              {signalMarkers.length > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.green}20` }}>
                  <div className="text-[10px] mb-1" style={{ color: C.dim }}>最近 EMA 信号</div>
                  {signalMarkers.slice(-3).reverse().map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1">
                      <span style={{ color: m.type === "BUY" ? C.green : C.pink }}>{m.type === "BUY" ? "▲ 买入" : "▼ 卖出"}</span>
                      <span style={{ color: C.cyan, fontFamily: "'Orbitron', monospace" }}>${formatPrice(m.price)}</span>
                      <span style={{ color: C.dim, fontSize: 10 }}>第 {m.i} 根</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 指标判断 + 24h 统计 */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>技术指标判断</div>
            {last && prev ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>EMA 结构</span><span style={{ color: longBias ? C.green : C.pink }}>{longBias ? "多头排列" : "空头排列"}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>MACD 柱</span><span style={{ color: last.hist >= 0 ? C.green : C.pink }}>{last.hist >= 0 ? "转强" : "转弱"}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>动量</span><span style={{ color: last.close > prev.close ? C.green : C.pink }}>{last.close > prev.close ? "上行" : "下行"}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>EMA7 穿越</span><span style={{ color: last.ema7 > last.ema25 ? C.green : C.pink }}>{last.ema7 > last.ema25 ? "在 EMA25 上方" : "在 EMA25 下方"}</span></div>
              </div>
            ) : (
              <div style={{ color: C.dim, fontSize: 12 }}>加载中...</div>
            )}
          </div>
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.cyan}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>24h 行情统计（Binance）</div>
            {tickers[selected] ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>最高价</span><span style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>${formatPrice(tickers[selected].high24h)}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>最低价</span><span style={{ color: C.pink, fontFamily: "'Orbitron', monospace" }}>${formatPrice(tickers[selected].low24h)}</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>24h 涨跌</span><span style={{ color: tickers[selected].change24h >= 0 ? C.green : C.pink }}>{tickers[selected].change24h >= 0 ? "+" : ""}{tickers[selected].change24h.toFixed(2)}%</span></div>
                <div className="flex items-center justify-between"><span style={{ color: C.dim }}>24h 成交量</span><span style={{ color: C.cyan }}>{(tickers[selected].volume / 1000).toFixed(0)}K {selected}</span></div>
              </div>
            ) : (
              <div style={{ color: C.dim, fontSize: 12 }}>加载中...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
