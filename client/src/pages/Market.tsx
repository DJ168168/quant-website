import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BarChart2, ChevronDown, ChevronUp, Minus } from "lucide-react";

// 计算支撑/压力（局部高低点，窗口 = 5根）
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
  // 只取最近 3 条支撑/压力
  const unique = (arr: number[]) => [...new Set(arr.map(v => Math.round(v * 100) / 100))];
  return { supports: unique(supports).slice(-3), resistances: unique(resistances).slice(-3) };
}

// 买卖信号标注点（EMA7 上穿 / 下穿 EMA25）
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

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)", bg: "oklch(0.10 0.015 240)", card: "oklch(0.12 0.015 240)" };

function genCandles(base: number) {
  return Array.from({ length: 72 }, (_, i) => {
    const drift = Math.sin(i / 7) * 1.8 + Math.cos(i / 11) * 1.2;
    const trend = i * 0.18;
    const close = base + trend + drift * 10 + Math.sin(i / 3) * 6;
    const open = close + Math.sin(i * 1.7) * 4;
    const high = Math.max(open, close) + 3 + Math.abs(Math.cos(i)) * 6;
    const low = Math.min(open, close) - 3 - Math.abs(Math.sin(i)) * 6;
    const volume = 120 + Math.abs(Math.sin(i / 2.7)) * 180 + (close > open ? 40 : 0);
    return { time: `${String(Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6) * 10).padStart(2, "0")}`, open, high, low, close, volume };
  });
}

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

export default function Market() {
  const { data: signals } = trpc.signals.list.useQuery({ limit: 20 }, { refetchInterval: 15000 });
  const [symbol, setSymbol] = useState("BTC");
  const [interval, setInterval] = useState("15m");
  const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"];
  const selected = symbols.includes(symbol) ? symbol : "BTC";
  const series = useMemo(() => {
    const seed = selected === "BTC" ? 68500 : selected === "ETH" ? 3520 : selected === "SOL" ? 178 : selected === "BNB" ? 615 : 100;
    const candles = genCandles(seed);
    const closes = candles.map(c => c.close);
    const ema7 = ema(closes, 7);
    const ema25 = ema(closes, 25);
    const macdData = macd(closes);
    return candles.map((c, i) => ({
      ...c,
      ema7: ema7[i],
      ema25: ema25[i],
      diff: macdData.diff[i],
      dea: macdData.dea[i],
      hist: macdData.hist[i],
      volumeColor: c.close >= c.open ? C.green : C.pink,
    }));
  }, [selected]);
  const last = series.at(-1)!;
  const prev = series.at(-2)!;
  const longBias = last.close >= last.ema25 && last.ema7 >= last.ema25;

  // 信号标注 & 支撑/压力
  const signalMarkers = useMemo(() => calcSignalMarkers(series), [series]);
  const { supports, resistances } = useMemo(() => calcSupportResistance(series), [series]);

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="mb-4">
        <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>市场行情</h1>
        <p className="text-xs mt-0.5" style={{ color: C.dim }}>TV 风格图表 · 均线 / MACD / 成交量 / 多空判断</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {symbols.map(sym => {
          const sig = signals?.find(s => s.symbol === sym);
          const change = sym === selected ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : (Math.random() * 10 - 5).toFixed(2);
          const isUp = Number(change) >= 0;
          return (
            <button key={sym} onClick={() => setSymbol(sym)} className="cyber-card p-3 text-left" style={{ borderColor: sym === selected ? C.green : undefined }}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-sm" style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>{sym}</span>
                <span className="text-xs" style={{ color: isUp ? C.green : C.pink }}>{isUp ? "▲" : "▼"} {Math.abs(Number(change))}%</span>
              </div>
              {sig && (
                <div className="text-xs" style={{ color: C.dim }}>
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
            <div className="text-sm font-bold" style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>{selected} / USDT</div>
            <div className="text-xs" style={{ color: C.dim }}>周期 {interval} · 当前价 ${last.close.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>
          <div className="flex gap-2 text-xs">
            {["5m", "15m", "1h"].map(v => (
              <button key={v} onClick={() => setInterval(v)} className="px-2 py-1" style={{ border: `1px solid ${interval === v ? C.green : C.dim}60`, color: interval === v ? C.green : C.dim, background: "transparent", borderRadius: 2 }}>
                {v}
              </button>
            ))}
          </div>
        </div>

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
            <div className="text-[10px]" style={{ color: C.dim }}>成交量</div>
            <div className="text-sm font-bold" style={{ color: C.purple }}>{Math.round(last.volume)}K</div>
          </div>
        </div>

        {/* ─── 主 K 线图（全宽，带买卖箭头 + 支撑/压力） */}
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
          <div style={{ background: "linear-gradient(180deg, oklch(0.13 0.015 240), oklch(0.09 0.015 240))", borderRadius: 4, overflow: "hidden" }}>
            {(() => {
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
                  {/* 网格线 */}
                  {[0.25, 0.5, 0.75].map(f => (
                    <line key={f} x1={PAD} y1={H - PAD - f * (H - PAD * 2 - 20)} x2={W - PAD} y2={H - PAD - f * (H - PAD * 2 - 20)} stroke={`${C.dim}30`} strokeWidth="1" />
                  ))}
                  {/* 支撑线（绿色虚线） */}
                  {supports.map((p, i) => (
                    <g key={`sup${i}`}>
                      <line x1={PAD} y1={toY(p)} x2={W - PAD} y2={toY(p)} stroke={C.green} strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />
                      <text x={W - PAD - 2} y={toY(p) - 3} fill={C.green} fontSize="8" textAnchor="end" fontFamily="'Share Tech Mono', monospace" opacity="0.8">S {p.toFixed(0)}</text>
                    </g>
                  ))}
                  {/* 压力线（红色虚线） */}
                  {resistances.map((p, i) => (
                    <g key={`res${i}`}>
                      <line x1={PAD} y1={toY(p)} x2={W - PAD} y2={toY(p)} stroke={C.pink} strokeWidth="1" strokeDasharray="6 4" opacity="0.5" />
                      <text x={W - PAD - 2} y={toY(p) - 3} fill={C.pink} fontSize="8" textAnchor="end" fontFamily="'Share Tech Mono', monospace" opacity="0.8">R {p.toFixed(0)}</text>
                    </g>
                  ))}
                  {/* K 线蜡烛体 */}
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
                  {/* EMA 均线 */}
                  <path d={ema7Path} fill="none" stroke={C.green} strokeWidth="1.5" opacity="0.8" />
                  <path d={ema25Path} fill="none" stroke={C.orange} strokeWidth="1.5" opacity="0.8" />
                  {/* 买卖信号箭头 */}
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
                  {/* 价格标签 */}
                  <text x={W - PAD + 2} y={toY(last.close) + 4} fill={longBias ? C.green : C.pink} fontSize="9" fontFamily="'Share Tech Mono', monospace">{last.close.toFixed(0)}</text>
                </svg>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>成交量 / 均线</div>
            <div className="grid grid-cols-12 gap-1 items-end h-40">
              {series.slice(-12).map((c, i) => (
                <div key={i} className="flex flex-col items-center justify-end h-full">
                  <div style={{ height: `${Math.max(10, c.volume / 6)}px`, width: "100%", background: c.close >= c.open ? C.green : C.pink, opacity: 0.25, borderRadius: 1 }} />
                  <div className="text-[9px] mt-1" style={{ color: C.dim }}>{c.time}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>支撑 / 压力位</div>
            <div className="space-y-2">
              {resistances.map((r, i) => (
                <div key={`r${i}`} className="flex items-center justify-between text-xs px-2 py-1.5" style={{ background: `${C.pink}10`, borderRadius: 3, border: `1px solid ${C.pink}30` }}>
                  <span style={{ color: C.dim }}>压力 R{i + 1}</span>
                  <span style={{ color: C.pink, fontFamily: "'Orbitron', monospace" }}>${r.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span style={{ color: C.dim, fontSize: 10 }}>+{((r - last.close) / last.close * 100).toFixed(2)}%</span>
                </div>
              ))}
              {supports.map((s, i) => (
                <div key={`s${i}`} className="flex items-center justify-between text-xs px-2 py-1.5" style={{ background: `${C.green}10`, borderRadius: 3, border: `1px solid ${C.green}30` }}>
                  <span style={{ color: C.dim }}>支撑 S{i + 1}</span>
                  <span style={{ color: C.green, fontFamily: "'Orbitron', monospace" }}>${s.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  <span style={{ color: C.dim, fontSize: 10 }}>{((s - last.close) / last.close * 100).toFixed(2)}%</span>
                </div>
              ))}
              {signalMarkers.length > 0 && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.green}20` }}>
                  <div className="text-[10px] mb-1" style={{ color: C.dim }}>最近信号</div>
                  {signalMarkers.slice(-3).reverse().map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1">
                      <span style={{ color: m.type === "BUY" ? C.green : C.pink }}>{m.type === "BUY" ? "▲ 买入" : "▼ 卖出"}</span>
                      <span style={{ color: C.cyan, fontFamily: "'Orbitron', monospace" }}>${m.price.toFixed(2)}</span>
                      <span style={{ color: C.dim, fontSize: 10 }}>第 {m.i} 根</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>K 线最后 12 根</div>
            <div className="grid grid-cols-12 gap-1 items-end h-32">
              {series.slice(-12).map((c, i) => {
                const bodyH = Math.max(4, Math.abs(c.close - c.open) / 2);
                const wickH = Math.max(20, (c.high - c.low) / 2);
                const isUp = c.close >= c.open;
                return (
                  <div key={i} className="flex flex-col items-center justify-end h-full">
                    <div style={{ height: `${wickH}px`, width: 2, background: isUp ? C.green : C.pink, opacity: 0.9 }} />
                    <div style={{ height: `${bodyH}px`, width: "100%", background: isUp ? C.green : C.pink, opacity: 0.9, borderRadius: 1 }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-3" style={{ background: C.bg, border: `1px solid ${C.green}20`, borderRadius: 4 }}>
            <div className="text-xs mb-2" style={{ color: C.dim }}>指标判断</div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span style={{ color: C.dim }}>EMA 结构</span><span style={{ color: longBias ? C.green : C.pink }}>{longBias ? "多头排列" : "空头排列"}</span></div>
              <div className="flex items-center justify-between"><span style={{ color: C.dim }}>MACD 柱</span><span style={{ color: last.hist >= 0 ? C.green : C.pink }}>{last.hist >= 0 ? "转强" : "转弱"}</span></div>
              <div className="flex items-center justify-between"><span style={{ color: C.dim }}>动量</span><span style={{ color: last.close > prev.close ? C.green : C.pink }}>{last.close > prev.close ? "上行" : "下行"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
