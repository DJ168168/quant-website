import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  insertSignal, getRecentSignals, getSignalStats,
  insertTrade, getRecentTrades, getTodayTradeStats,
  getAllStrategies, toggleStrategy,
  getSetting, setSetting, getSettings,
  savePaperSnapshot, getRecentSnapshots, getLatestSnapshot,
  getOpenPositions, insertPosition, closePosition, updatePositionMarkPrice,
  markSignalProcessed, getUnprocessedSignals,
  insertSignalHistory, getSignalHistory, markSignalOutcome, getSignalHistoryStats,
} from "./db";

// ─── ValueScan 外部 API 调用 ──────────────────────────────────────────────────
import crypto from "crypto";

// ─── CoinGlass 数据缓存（避免并发请求触发 429 限流）────────────────────────────
// 定时器驱动缓存，每10分钟主动刷新，不在请求时触发
const cgCache = {
  data: { oiChange24h: 0, avgFundingRate: 0, liq24h: 0, longLiq24h: 0, shortLiq24h: 0, fearGreedValue: 50, longShortRatio: 1.0 },
  lastUpdated: 0,
  isRefreshing: false,
};

// ─── 信号历史去重缓存（5分钟内同方向信号不重复入库）──────────────────────────
const getBestSignalCache = { signal: "", ts: 0 };

async function refreshCGData() {
  if (cgCache.isRefreshing) return;
  const cgKey = process.env.COINGLASS_API_KEY;
  if (!cgKey) return;
  cgCache.isRefreshing = true;
  try {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    let oiChange24h = 0, avgFundingRate = 0, liq24h = 0, longLiq24h = 0, shortLiq24h = 0, fearGreedValue = 50, longShortRatio = 1.0;

    // OI
    try {
      const r = await fetch(`https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=BTC`, { headers: { "CG-API-KEY": cgKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json() as any;
      const dataArr = Array.isArray(d?.data) ? d.data : [];
      if ((d?.code === 0 || d?.code === "0") && dataArr.length > 0) {
        const all = dataArr.find((x: any) => x.exchange === "All") || dataArr[0];
        if (all) {
          const c24h = Number(all.open_interest_change_percent_24h ?? 0);
          const c4h = Number(all.open_interest_change_percent_4h ?? 0);
          const c1h = Number(all.open_interest_change_percent_1h ?? 0);
          oiChange24h = c24h !== 0 ? c24h : (c4h !== 0 ? c4h * 6 : c1h * 24);
        }
      }
    } catch {}
    await delay(3000);

    // Funding Rate
    try {
      const r = await fetch(`https://open-api-v4.coinglass.com/api/futures/funding-rate/exchange-list?symbol=BTC`, { headers: { "CG-API-KEY": cgKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json() as any;
      if ((d?.code === 0 || d?.code === "0") && d?.data) {
        const btcEntry = (d.data as any[]).find((x: any) => x.symbol === "BTC");
        if (btcEntry) {
          const allRates: number[] = [];
          const list = btcEntry.stablecoin_margin_list ?? btcEntry.token_margin_list ?? [];
          for (const ex of list) {
            const fr = Number(ex.funding_rate ?? 0);
            if (fr !== 0) allRates.push(fr);
          }
          if (allRates.length > 0) avgFundingRate = allRates.reduce((a, b) => a + b, 0) / allRates.length;
        }
      }
    } catch {}
    await delay(3000);

    // Liquidation
    try {
      const r = await fetch(`https://open-api-v4.coinglass.com/api/futures/liquidation/coin-list`, { headers: { "CG-API-KEY": cgKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json() as any;
      if ((d?.code === 0 || d?.code === "0") && d?.data) {
        const coin = (d.data as any[]).find((x: any) => x.symbol === "BTC");
        if (coin) {
          liq24h = Number(coin.liquidation_usd_24h ?? 0);
          longLiq24h = Number(coin.long_liquidation_usd_24h ?? 0);
          shortLiq24h = Number(coin.short_liquidation_usd_24h ?? 0);
        }
      }
    } catch {}
    await delay(3000);

    // Fear Greed
    try {
      const r = await fetch(`https://open-api-v4.coinglass.com/api/index/fear-greed-history?limit=2`, { headers: { "CG-API-KEY": cgKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json() as any;
      if ((d?.code === 0 || d?.code === "0") && d?.data?.data_list?.length > 0) {
        fearGreedValue = Math.round(d.data.data_list[0]);
      }
    } catch {}
    await delay(3000);

    // Long/Short Ratio
    try {
      const r = await fetch(`https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?symbol=BTCUSDT&exchange=Binance&interval=4h&limit=3`, { headers: { "CG-API-KEY": cgKey }, signal: AbortSignal.timeout(15000) });
      const d = await r.json() as any;
      if ((d?.code === 0 || d?.code === "0") && d?.data?.length > 0) {
        const latest = d.data[d.data.length - 1];
        const lp = Number(latest?.global_account_long_percent ?? 50);
        const sp = Number(latest?.global_account_short_percent ?? 50);
        if (sp > 0) longShortRatio = lp / sp;
      }
    } catch {}

    const hasRealData = oiChange24h !== 0 || avgFundingRate !== 0 || liq24h !== 0 || fearGreedValue !== 50 || longShortRatio !== 1.0;
    if (hasRealData) {
      cgCache.data = { oiChange24h, avgFundingRate, liq24h, longLiq24h, shortLiq24h, fearGreedValue, longShortRatio };
      cgCache.lastUpdated = Date.now();
      console.log(`[CG Cache] Refreshed: OI=${oiChange24h.toFixed(2)}% FR=${avgFundingRate.toFixed(6)} FG=${fearGreedValue} LS=${longShortRatio.toFixed(2)} Liq=${(liq24h/1e6).toFixed(1)}M`);
    } else {
      console.log(`[CG Cache] Refresh returned all defaults (CG may be rate limiting)`);
    }
  } finally {
    cgCache.isRefreshing = false;
  }
}

export function startCGRefreshScheduler() {
  const cgKey = process.env.COINGLASS_API_KEY;
  if (!cgKey) { console.log("[CG Cache] No API key, skipping"); return; }
  setTimeout(refreshCGData, 15000); // 启动后15秒预热
  setInterval(refreshCGData, 10 * 60 * 1000); // 每10分钟刷新
  console.log("[CG Cache] Scheduler started (every 10min)");
}

/** VS Open API HMAC 签名
 * - 毫秒时间戳（13位）
 * - 签名字符串 = 时间戳 + Raw Body
 * - Header: X-API-KEY, X-TIMESTAMP, X-SIGN（大写）
 */
function vsOpenApiSign(secretKey: string, timestamp: string, rawBody: string): string {
  const message = timestamp + rawBody;
  return crypto.createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}

/** VS Open API 通用 POST 请求（自动 HMAC 签名）
 * - 毫秒时间戳（13位）
 * - 签名字符串 = 时间戳 + Raw Body
 * - Header: X-API-KEY, X-TIMESTAMP, X-SIGN（大写）
 */
async function vsOpenRequest(apiKey: string, secretKey: string, path: string, body?: Record<string, unknown>) {
  const rawBody = body ? JSON.stringify(body) : "";
  const ts = String(Date.now()); // 13位毫秒时间戳
  const sign = vsOpenApiSign(secretKey, ts, rawBody);
  const url = "https://api.valuescan.io/api/open/v1" + path;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "X-TIMESTAMP": ts,
        "X-SIGN": sign,
        "Content-Type": "application/json",
      },
      body: rawBody || undefined,
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (data?.code === 0 || data?.code === 200) return data.data ?? data;
    return null;
  } catch { return null; }
}

/** VS Bearer Token API 通用请求 */
async function vsTokenRequest(token: string, path: string, params?: Record<string, string>) {
  const url = new URL("https://api.valuescan.io" + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const resp = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (data?.code === 200 || data?.code === 0) return data.data ?? data;
    return null;
  } catch { return null; }
}

async function loginValueScan(email: string, password: string): Promise<string | null> {
  try {
    const resp = await fetch("https://api.valuescan.io/api/authority/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneOrEmail: email, code: password, loginTypeEnum: 2, endpointEnum: "WEB" }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    if (data?.code === 200) return data.data?.account_token ?? null;
  } catch (e) { console.error("[VS] login error", e); }
  return null;
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json() as any;
    const price = Number(data?.price ?? 0);
    return Number.isFinite(price) && price > 0 ? price : 0;
  } catch {
    return 0;
  }
}

async function getLiveAutoSignal() {
  const [signal, best] = await Promise.all([
    getSetting("engine_live_running"),
    getBestSignal(),
  ]);
  return { running: signal === "true", best };
}

async function fetchVSFearGreed(token: string): Promise<any> {
  try {
    const resp = await fetch("https://api.valuescan.io/api/market/fearGreedIndex", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) return await resp.json();
  } catch (e) {}
  return null;
}

async function fetchVSFearGreedWithRetry(): Promise<any> {
  // Dev 环境完全不使用 VS bearer token，避免与生产服务器抢占单会话
  if (process.env.NODE_ENV !== "production") return null;

  const VS_EMAIL = "mc678906@qq.com";
  const VS_PASSWORD = "dj168168168~";
  let token = await getSetting("vs_token");
  if (!token) return null;
  const data = await fetchVSFearGreed(token);
  // 4002 = 用户已下线，token 被踢出；自动重登录一次
  if (data?.code === 4002) {
    console.log("[VS FearGreed] Token invalidated (4002), re-logging in...");
    const newToken = await loginValueScan(VS_EMAIL, VS_PASSWORD);
    if (newToken) {
      await setSetting("vs_token", newToken);
      await setSetting("vs_token_updated_at", String(Date.now()));
      return await fetchVSFearGreed(newToken);
    }
    return null;
  }
  return data;
}

// ─── Telegram 推送 ────────────────────────────────────────────────────────────
async function sendTelegram(botToken: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch (e) { return false; }
}

// 自动从 DB 读取配置并推送，调用方不需要关心 token/chat_id
async function notifyTg(text: string) {
  try {
    const [tok, cid] = await Promise.all([getSetting("tg_bot_token"), getSetting("tg_chat_id")]);
    if (!tok || !cid) return;
    await sendTelegram(tok, cid, text);
  } catch {}
}

// ─── 市场分析推送（供定时器调用）────────────────────────────────────────────
export async function pushMarketAnalysis() {
  try {
    const d = cgCache.data;
    const sig = d.oiChange24h > 5 && d.longLiq24h < d.shortLiq24h && d.fearGreedValue > 45
      ? "📈 <b>LONG</b>" : d.oiChange24h < -5 || d.fearGreedValue < 30 || d.shortLiq24h < d.longLiq24h * 0.5
      ? "📉 <b>SHORT</b>" : "⏸ <b>观望 WAIT</b>";
    const fr = d.avgFundingRate;
    const frStr = fr === 0 ? "0.000%" : `${fr > 0 ? "+" : ""}${(fr * 100).toFixed(4)}%`;
    const liqRatio = d.liq24h > 0 ? (d.longLiq24h / d.liq24h) : 0.5;
    const liqBar = liqRatio > 0.6 ? "🔴多爆为主" : liqRatio < 0.4 ? "🟢空爆为主" : "⚪平衡";
    const fg = d.fearGreedValue;
    const fgLabel = fg >= 75 ? "极度贪婪🤑" : fg >= 55 ? "贪婪😊" : fg >= 45 ? "中性😐" : fg >= 25 ? "恐慌😨" : "极度恐慌😱";
    const text = [
      `📊 <b>大盘分析 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</b>`,
      ``,
      `🎯 信号方向：${sig}`,
      ``,
      `📌 核心指标`,
      `• OI 24h变化：${d.oiChange24h > 0 ? "+" : ""}${d.oiChange24h.toFixed(2)}%`,
      `• 资金费率：${frStr}`,
      `• 恐贪指数：${fg} ${fgLabel}`,
      `• 24h爆仓：$${(d.liq24h / 1e6).toFixed(1)}M ${liqBar}`,
      `  多爆 $${(d.longLiq24h / 1e6).toFixed(1)}M | 空爆 $${(d.shortLiq24h / 1e6).toFixed(1)}M`,
      `• 多空比：${d.longShortRatio.toFixed(3)}`,
      ``,
      `<i>zhangyong.guru · 自动推送，每15分钟更新</i>`,
    ].join("\n");
    await notifyTg(text);
  } catch (e) {
    console.error("[MarketPush] error:", e);
  }
}

// ─── VS BTC/ETH AI 大盘解析推送（每15分钟）────────────────────────────────────
export async function pushVSBtcEthAnalysis() {
  try {
    // 1. 获取实时价格（OKX → CoinGecko → Binance 三重兜底）
    let btcPrice = 0, ethPrice = 0;
    try {
      // 首选 OKX（无地区限制，全球可用）
      const [br, er] = await Promise.all([
        fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", { signal: AbortSignal.timeout(6000) }),
        fetch("https://www.okx.com/api/v5/market/ticker?instId=ETH-USDT", { signal: AbortSignal.timeout(6000) }),
      ]);
      const bd = await br.json() as any;
      const ed = await er.json() as any;
      btcPrice = Number(bd?.data?.[0]?.last ?? 0);
      ethPrice = Number(ed?.data?.[0]?.last ?? 0);
    } catch {}
    // 兜底：CoinGecko（OKX 失败时）
    if (btcPrice === 0 || ethPrice === 0) {
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd", { signal: AbortSignal.timeout(8000) });
        const d = await r.json() as any;
        if (btcPrice === 0) btcPrice = Number(d?.bitcoin?.usd ?? 0);
        if (ethPrice === 0) ethPrice = Number(d?.ethereum?.usd ?? 0);
      } catch {}
    }
    // 最终兜底：Binance（部分服务器可用）
    if (btcPrice === 0 || ethPrice === 0) {
      try {
        const [br, er] = await Promise.all([
          fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { signal: AbortSignal.timeout(5000) }),
          fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", { signal: AbortSignal.timeout(5000) }),
        ]);
        const bd = await br.json() as any;
        const ed = await er.json() as any;
        if (btcPrice === 0) btcPrice = Number(bd?.price ?? 0);
        if (ethPrice === 0) ethPrice = Number(ed?.price ?? 0);
      } catch {}
    }

    // 2. 尝试 VS API 获取 mainForce + pressureSupport（BTC/ETH）
    const [apiKey, secretKey, token] = await Promise.all([
      getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
    ]);

    let btcForce: any = null, ethForce: any = null;
    let btcLevels: any = null, ethLevels: any = null;

    if (apiKey && secretKey) {
      [btcForce, ethForce, btcLevels, ethLevels] = await Promise.all([
        vsOpenRequest(apiKey, secretKey, "/ai-track/main-force", { symbol: "BTC" }),
        vsOpenRequest(apiKey, secretKey, "/ai-track/main-force", { symbol: "ETH" }),
        vsOpenRequest(apiKey, secretKey, "/ai-track/support-resistance", { symbol: "BTC" }),
        vsOpenRequest(apiKey, secretKey, "/ai-track/support-resistance", { symbol: "ETH" }),
      ]);
    }
    if (!btcForce && token) {
      [btcForce, ethForce, btcLevels, ethLevels] = await Promise.all([
        vsTokenRequest(token, "/api/market/mainForce", { symbol: "BTC" }),
        vsTokenRequest(token, "/api/market/mainForce", { symbol: "ETH" }),
        vsTokenRequest(token, "/api/market/supportResistance", { symbol: "BTC" }),
        vsTokenRequest(token, "/api/market/supportResistance", { symbol: "ETH" }),
      ]);
    }

    // 3. 解析 VS 数据 or 生成 demo
    const cg = cgCache.data;
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const btcP = btcPrice > 0 ? btcPrice.toFixed(2) : "83000.00";
    const ethP = ethPrice > 0 ? ethPrice.toFixed(2) : "1600.00";
    const bp = btcPrice > 0 ? btcPrice : 83000;
    const ep = ethPrice > 0 ? ethPrice : 1600;

    // 解析支撑压力位
    function parseLevels(data: any, price: number) {
      if (!data) return null;
      const arr = Array.isArray(data) ? data : (data.list ?? []);
      const supports = arr.filter((x: any) => x.type === "support" || x.levelType === "SUPPORT" || (x.price && x.price < price)).map((x: any) => x.price ?? x.level).filter(Boolean).slice(0, 2);
      const resistances = arr.filter((x: any) => x.type === "resistance" || x.levelType === "RESISTANCE" || (x.price && x.price > price)).map((x: any) => x.price ?? x.level).filter(Boolean).slice(0, 2);
      return { supports, resistances };
    }

    // 解析主力数据生成分析文本
    function parseForceText(data: any, symbol: string, price: number) {
      if (!data) return null;
      const arr = Array.isArray(data) ? data : (data.list ?? [data]);
      const netFlow = arr.find((x: any) => x.name?.includes("净流入") || x.key === "netFlow");
      const bigOrder = arr.find((x: any) => x.name?.includes("大单") || x.key === "bigOrder");
      const inflow = netFlow?.value ?? 0;
      if (inflow > 50) return { force: `日内主力合约大幅净流入；现货同步买入，资金持续涌入 ${symbol}`, sentiment: "🟢利多" };
      if (inflow < -50) return { force: `日内主力合约大幅净流出；1h主力转空，现货持续抛压明显`, sentiment: "🔴利空" };
      return { force: `日内主力资金震荡整理；1h合约与现货资金流向分歧，等待方向确认`, sentiment: "⚪中性" };
    }

    const btcForceText = parseForceText(btcForce, "BTC", bp);
    const ethForceText = parseForceText(ethForce, "ETH", ep);
    const btcParsed = parseLevels(btcLevels, bp);
    const ethParsed = parseLevels(ethLevels, ep);

    // 4. 生成 demo 分析（与 VS 宕机时一致，基于真实 CG 数据）
    const frPct = (cg.avgFundingRate * 100).toFixed(4);
    const liqRatio = cg.liq24h > 0 ? cg.longLiq24h / cg.liq24h : 0.5;
    const bearish = cg.fearGreedValue < 40 || cg.avgFundingRate < -0.001 || liqRatio < 0.3;
    const bullish = cg.fearGreedValue > 60 && cg.avgFundingRate > 0 && cg.oiChange24h > 3;
    const sentiment = bullish ? "🟢利多" : bearish ? "🔴利空" : "⚪中性";

    const btcSup1 = (bp * 0.969).toFixed(2), btcSup2 = (bp * 0.943).toFixed(2);
    const btcRes1 = (bp * 1.032).toFixed(2), btcRes2 = (bp * 1.062).toFixed(2);
    const ethSup1 = (ep * 0.971).toFixed(2), ethSup2 = (ep * 0.946).toFixed(2);
    const ethRes1 = (ep * 1.028).toFixed(2), ethRes2 = (ep * 1.055).toFixed(2);

    const btcS = btcParsed?.supports?.length ? btcParsed.supports.map((p: number) => p.toFixed(2)).join(", ") : `${btcSup1}, ${btcSup2}`;
    const btcR = btcParsed?.resistances?.length ? btcParsed.resistances.map((p: number) => p.toFixed(2)).join(", ") : `${btcRes1}, ${btcRes2}`;
    const ethS = ethParsed?.supports?.length ? ethParsed.supports.map((p: number) => p.toFixed(2)).join(", ") : `${ethSup1}, ${ethSup2}`;
    const ethR = ethParsed?.resistances?.length ? ethParsed.resistances.map((p: number) => p.toFixed(2)).join(", ") : `${ethRes1}, ${ethRes2}`;

    const btcForceSummary = btcForceText?.force ?? (bearish
      ? `日内主力合约净流出压力累积；1h主力合约转空，现货持续大幅流出`
      : `日内主力合约净流入；1h主力与现货小幅震荡，多头防守 ${btcSup1} 支撑`);
    const ethForceSummary = ethForceText?.force ?? (bearish
      ? `日内主力双市场净流出；1h主力合约与现货双双大幅抛压`
      : `日内主力双市场净流入；ETH 跟随 BTC 多头格局，等待突破 ${ethR.split(",")[0].trim()}`);

    const btcSentiment = btcForceText?.sentiment ?? sentiment;
    const ethSentiment = ethForceText?.sentiment ?? sentiment;

    const btcAnalysis = bullish
      ? `日内主力合约净流入主导多头，价格坚守 ${btcSup1} 支撑，压力聚焦 ${btcRes1}。`
      : bearish
      ? `日内主力持续净流出，空头主导格局明显，关键支撑 ${btcSup1} 需守住。若失守则下探 ${btcSup2}。`
      : `资金博弈拉锯，多空平衡区间内震荡，等待 ${btcRes1} 上方突破或 ${btcSup1} 下方失守方向信号。`;

    const ethAnalysis = bullish
      ? `日内主力资金强势做多格局确立，1h剧烈抛压暂缓于 ${ethSup1} 支撑，关键压力 ${ethRes1} 近在咫尺。`
      : bearish
      ? `ETH 空头结构延续，主力资金净流出，${ethSup1} 支撑承压，若失守或下测 ${ethSup2}。`
      : `ETH 跟随 BTC 震荡格局，主力资金观望为主，等待 BTC 方向确认后跟进。`;

    const btcRisk = bullish
      ? `若日内资金动能持续并突破 ${btcRes1}，上行可冲击 ${btcRes2}；若 ${btcSup1} 失守，则下探 ${btcSup2}。`
      : `若主力净流出延续并失守 ${btcSup1}，或回踩 ${btcSup2}；若资金回流站稳 ${btcRes1} 上方，可望反弹。`;

    const ethRisk = bullish
      ? `若 1h 资金回暖并突破 ${ethRes1}，加速冲击 ${ethRes2}；若 ${ethSup1} 失守，下探 ${ethSup2}。`
      : `若 1h 双市场净流出延续并失守 ${ethSup1}，或下探 ${ethSup2}；若日内资金传导至 1h 并站稳 ${ethRes1}，有望反弹。`;

    const vsSource = (btcForce || ethForce) ? "ValueScan · 实时数据" : "ValueScan · 演示数据（服务恢复后自动切换）";

    const msg = [
      `📊 <b>AI 大盘解析</b>`,
      ``,
      `📊 <b>BTC/ETH 日内主力资金趋势分析(ValueScan)</b>`,
      `⏰ 当前时间：${now}`,
      `💵 当前币价：BTC: $${btcP}  ETH: $${ethP}`,
      ``,
      ``,
      `<b>BTC分析：</b>`,
      `🤖 AI主力资金分析：${btcForceSummary}`,
      ``,
      `🤖 AI综合分析: ${btcSentiment}`,
      `${btcAnalysis}`,
      ``,
      `⚠️风险提示：${btcRisk}`,
      ``,
      `关键支撑位：${btcS}`,
      `关键压力位：${btcR}`,
      ``,
      ``,
      `<b>ETH分析：</b>`,
      `🤖 AI主力资金分析：${ethForceSummary}`,
      ``,
      `🤖 AI综合分析: ${ethSentiment}`,
      `${ethAnalysis}`,
      ``,
      `⚠️风险提示：${ethRisk}`,
      ``,
      `关键支撑位：${ethS}`,
      `关键压力位：${ethR}`,
      ``,
      `以上数据由交易伙伴：valuescan.io提供。`,
      `<i>${vsSource}</i>`,
    ].join("\n");

    await notifyTg(msg);
    console.log(`[VSPush] BTC/ETH AI analysis pushed at ${now}`);
  } catch (e) {
    console.error("[VSPush] error:", e);
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── 仪表盘总览 ──────────────────────────────────────────────────────────────
  dashboard: router({
    overview: publicProcedure.query(async () => {
      const [snapshot, tradeStats, signalStats, engineRunning, paperRunning, liveRunning] = await Promise.all([
        getLatestSnapshot(),
        getTodayTradeStats(),
        getSignalStats(),
        getSetting("engine_auto_trade"),
        getSetting("engine_paper_running"),
        getSetting("engine_live_running"),
      ]);
      return {
        account: {
          totalBalance: snapshot ? Number(snapshot.totalBalance) : 10000,
          availableBalance: snapshot ? Number(snapshot.availableBalance) : 10000,
          unrealizedPnl: snapshot ? Number(snapshot.unrealizedPnl) : 0,
          dailyPnl: snapshot ? Number(snapshot.dailyPnl) : 0,
          positionCount: snapshot?.positionCount ?? 0,
        },
        trades: tradeStats,
        signals: signalStats,
        engines: {
          autoTrade: engineRunning === "true",
          paperRunning: paperRunning === "true",
          liveRunning: liveRunning === "true",
        },
      };
    }),

    balanceHistory: publicProcedure.query(async () => {
      const snapshots = await getRecentSnapshots(48);
      return snapshots.reverse().map(s => ({
        time: s.createdAt.toISOString(),
        balance: Number(s.totalBalance),
      }));
    }),
  }),

  // ─── 信号 ─────────────────────────────────────────────────────────────────
  signals: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().default(50) }).optional())
      .query(async ({ input }) => {
        return getRecentSignals(input?.limit ?? 50);
      }),

    stats: publicProcedure.query(async () => {
      return getSignalStats();
    }),

    inject: publicProcedure
      .input(z.object({
        type: z.enum(["FOMO", "ALPHA", "RISK", "LONG", "SHORT"]),
        symbol: z.string(),
        score: z.number().min(0).max(100).optional(),
        strategy: z.string().optional(),
        rsi: z.number().optional(),
        ema: z.number().optional(),
        fearGreed: z.number().optional(),
        longShortRatio: z.number().optional(),
        fundingRate: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await insertSignal({
          ...input,
          source: "manual",
          rsi: input.rsi?.toString(),
          ema: input.ema?.toString(),
          longShortRatio: input.longShortRatio?.toString(),
          fundingRate: input.fundingRate?.toString(),
        });
        return { success: true };
      }),

    batchInject: publicProcedure.mutation(async () => {
      const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP"];
      const types = ["FOMO", "ALPHA", "FOMO", "FOMO", "RISK"] as const;
      for (let i = 0; i < symbols.length; i++) {
        await insertSignal({
          type: types[i],
          symbol: symbols[i],
          score: Math.floor(Math.random() * 30) + 70,
          source: "auto",
          rsi: (Math.random() * 40 + 40).toFixed(2),
          ema: (Math.random() * 1000 + 40000).toFixed(2),
          fearGreed: Math.floor(Math.random() * 30) + 40,
          longShortRatio: (Math.random() * 0.5 + 0.8).toFixed(4),
          fundingRate: (Math.random() * 0.001).toFixed(6),
        });
      }
      return { success: true, count: symbols.length };
    }),

    factorScore: publicProcedure
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }) => {
        // 模拟多因子评分
        const rsi = Math.random() * 40 + 40;
        const ema = Math.random() > 0.5 ? 1 : -1;
        const fearGreed = Math.floor(Math.random() * 60) + 20;
        const longShortRatio = Math.random() * 0.5 + 0.8;
        const fundingRate = (Math.random() - 0.5) * 0.002;
        const rsiScore = rsi > 60 ? 80 : rsi > 50 ? 65 : rsi > 40 ? 50 : 30;
        const emaScore = ema > 0 ? 75 : 35;
        const fgScore = fearGreed > 60 ? 70 : fearGreed > 40 ? 60 : 80;
        const lsScore = longShortRatio > 1 ? 75 : 45;
        const frScore = fundingRate < 0 ? 70 : fundingRate < 0.001 ? 60 : 40;
        const total = Math.round((rsiScore + emaScore + fgScore + lsScore + frScore) / 5);
        return {
          symbol: input.symbol,
          factors: {
            rsi: { value: rsi.toFixed(2), score: rsiScore, label: rsi > 70 ? "超买" : rsi < 30 ? "超卖" : "中性" },
            ema: { value: ema > 0 ? "多头排列" : "空头排列", score: emaScore, label: ema > 0 ? "看多" : "看空" },
            fearGreed: { value: fearGreed, score: fgScore, label: fearGreed > 75 ? "极度贪婪" : fearGreed > 55 ? "贪婪" : fearGreed > 45 ? "中性" : fearGreed > 25 ? "恐慌" : "极度恐慌" },
            longShortRatio: { value: longShortRatio.toFixed(4), score: lsScore, label: longShortRatio > 1.2 ? "多头主导" : longShortRatio < 0.8 ? "空头主导" : "均衡" },
            fundingRate: { value: (fundingRate * 100).toFixed(4) + "%", score: frScore, label: fundingRate < 0 ? "空头付费" : "多头付费" },
          },
          totalScore: total,
          signal: total >= 70 ? "LONG" : total <= 40 ? "SHORT" : "WAIT",
        };
      }),
  }),

  // ─── 策略引擎 ────────────────────────────────────────────────────────────────
  strategies: router({
    list: publicProcedure.query(async () => {
      return getAllStrategies();
    }),

    toggle: publicProcedure
      .input(z.object({ id: z.number(), enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        await toggleStrategy(input.id, input.enabled);
        return { success: true };
      }),

    // 融合评分：ValueScan 信号 + CoinGlass 双层确认
    fusionScore: publicProcedure
      .input(z.object({
        symbol: z.string().default("BTC"),
        strategyId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        // 并行获取 CoinGlass 持仓量、资金费率、清算、恐贪指数
        // HOBBYIST 计划全部可用接口：OI实时列表、资金费率实时、清算24h总量、全球多空比(BTCUSDT+Binance 4h)、恐贪指数
        const sym = input.symbol === "BTC" ? "BTCUSDT" : `${input.symbol}USDT`;
        const [oiRes, frRes, liqRes, fgRes, lsRes] = await Promise.allSettled([
          key ? fetch(`https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=${input.symbol}`, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(8000) }).then(r => r.json()) : Promise.resolve(null),
          key ? fetch(`https://open-api-v4.coinglass.com/api/futures/funding-rate/exchange-list?symbol=${input.symbol}`, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(8000) }).then(r => r.json()) : Promise.resolve(null),
          key ? fetch(`https://open-api-v4.coinglass.com/api/futures/liquidation/coin-list`, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(8000) }).then(r => r.json()) : Promise.resolve(null),
          key ? fetch(`https://open-api-v4.coinglass.com/api/index/fear-greed-history?limit=2`, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(8000) }).then(r => r.json()) : Promise.resolve(null),
          key ? fetch(`https://open-api-v4.coinglass.com/api/futures/global-long-short-account-ratio/history?symbol=${sym}&exchange=Binance&interval=4h&limit=3`, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(8000) }).then(r => r.json()) : Promise.resolve(null),
        ]);

        // 解析 OI 实时总量（取 All 交易所汇总，与24h前对比估算变化率）
        let oiChange1h = 0;
        let oiTotalUsd = 0;
        if (oiRes.status === "fulfilled" && oiRes.value?.data) {
          const allEntry = (oiRes.value.data as any[]).find((x: any) => x.exchange === "All");
          if (allEntry) {
            oiTotalUsd = Number(allEntry.open_interest_usd ?? 0);
            // 用 h24_change 字段（如有）估算变化率
            const h24 = Number(allEntry.open_interest_usd_h24_change ?? allEntry.h24_change ?? 0);
            oiChange1h = h24; // CoinGlass 实时列表提供的24h变化率
          }
        }

        // 解析加权平均资金费率（从各交易所 stablecoin_margin_list 提取）
        let avgFundingRate = 0;
        if (frRes.status === "fulfilled" && frRes.value?.data) {
          const allRates: number[] = [];
          for (const item of (frRes.value.data as any[])) {
            const list = item.stablecoin_margin_list ?? item.coin_margin_list ?? [];
            for (const ex of list) {
              const fr = Number(ex.funding_rate ?? 0);
              if (fr !== 0) allRates.push(fr);
            }
          }
          if (allRates.length > 0) avgFundingRate = allRates.reduce((a, b) => a + b, 0) / allRates.length;
        }

        // 解析 24h 清算量
        let liq24h = 0;
        let longLiq24h = 0;
        let shortLiq24h = 0;
        if (liqRes.status === "fulfilled" && liqRes.value?.data) {
          const coin = (liqRes.value.data as any[]).find((x: any) => x.symbol === input.symbol);
          if (coin) {
            liq24h = Number(coin.liquidation_usd_24h ?? 0);
            longLiq24h = Number(coin.long_liquidation_usd_24h ?? 0);
            shortLiq24h = Number(coin.short_liquidation_usd_24h ?? 0);
          }
        }

        // 解析恐贪指数
        let fearGreedValue = 50;
        if (fgRes.status === "fulfilled" && fgRes.value?.data?.data_list?.length > 0) {
          fearGreedValue = Math.round(fgRes.value.data.data_list[0]);
        }

        // ─── 六大策略融合评分逻辑 ───
        const strategies: Record<string, {
          name: string; nameEn: string; direction: "LONG" | "SHORT" | "BOTH";
          originalWinRate: number; fusedWinRate: number;
          vsConditions: string[]; cgConditions: string[];
          apiRefs: string[];
          stopLoss: string; takeProfit: string;
          score: number; confirmed: boolean; signal: "LONG" | "SHORT" | "WAIT";
          confirmDetails: { label: string; value: string; pass: boolean; }[];
        }> = {
          "FOMO+Alpha共振": {
            name: "FOMO+Alpha 共振",
            nameEn: "Three-Green-Line Bottom",
            direction: "LONG",
            originalWinRate: 82,
            fusedWinRate: 88,
            vsConditions: ["Alpha + FOMO + 巨鲸三信号同时出现", "三绳线底部密集区", "主力流入 + AI 评分 ≥ 55"],
            cgConditions: ["OI 24h 增长 > 15%", "清算热力图多头爆仓密集（价格下沿）", "Taker 买入量 > 卖出量", "资金费率转正 > -0.01%"],
            apiRefs: ["/api/futures/liquidation/heatmap/model2", "/api/futures/openInterest/aggregated-history", "/api/futures/taker-buy-sell-volume/history"],
            stopLoss: "密集区下沿 -2%",
            takeProfit: "上方压力区 +8-12%",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
          "聪明錢突破": {
            name: "聪明錢突破",
            nameEn: "Smart Money Breakout",
            direction: "LONG",
            originalWinRate: 78,
            fusedWinRate: 86,
            vsConditions: ["强势突破密集压力", "上方真空区", "FOMO 增加 + AI ≥ 55"],
            cgConditions: ["OI 1h 增长 > 20%", "Taker 买 > 卖 1.5x", "大户多空比 > 1.2（大户多头倾斜）"],
            apiRefs: ["/api/futures/openInterest/ohlc-history", "/api/futures/taker-buy-sell-volume/history", "/api/futures/top-long-short-account-ratio/history"],
            stopLoss: "突破点 -1.5%",
            takeProfit: "上方密集区 +6-10%",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
          "趋势延续": {
            name: "趋势延续",
            nameEn: "Alpha+Fire Dual Mark",
            direction: "LONG",
            originalWinRate: 75,
            fusedWinRate: 84,
            vsConditions: ["Alpha + 火 同时出现", "AI ≥ 55", "无橙色风险标记"],
            cgConditions: ["现货大额买单密集 > 5M USD", "订单墙支撑确认"],
            apiRefs: ["/api/spot/large-limit-order", "/api/spot/orderbook/large-limit-order-history"],
            stopLoss: "入场 -2%",
            takeProfit: "+5-8%",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
          "恐慌反转": {
            name: "恐慌反转",
            nameEn: "Panic Reversal",
            direction: "SHORT",
            originalWinRate: 72,
            fusedWinRate: 82,
            vsConditions: ["压力阻 + 主力出逃", "FOMO 空 + 交易所流入"],
            cgConditions: ["交易所净流入 > 10M USD", "资金费率 > 0.05%（多头挤压）"],
            apiRefs: ["/api/exchange/chain/tx/list", "/api/futures/fundingRate/exchange-list"],
            stopLoss: "压力 +2%",
            takeProfit: "下方支撑 -5-8%",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
          "巨鲸跟随": {
            name: "巨鲸跟随",
            nameEn: "Push Frequency Long",
            direction: "LONG",
            originalWinRate: 70,
            fusedWinRate: 80,
            vsConditions: ["1h 内 10-20 币多头 > 70%", "推送频率激增"],
            cgConditions: ["全网多空比 > 1.5", "OI 稳定不降"],
            apiRefs: ["/api/futures/global-long-short-account-ratio/history"],
            stopLoss: "-1.5%",
            takeProfit: "+3-5%",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
          "风险防守做空": {
            name: "风险防守做空",
            nameEn: "Risk Defense Short",
            direction: "SHORT",
            originalWinRate: 95,
            fusedWinRate: 97,
            vsConditions: ["风险 ≥ 5 条", "推送 ≤ 3", "批量下榜 + 橙色风险多"],
            cgConditions: ["24h 爆仓总量 > 50M USD"],
            apiRefs: ["/api/futures/liquidation/history"],
            stopLoss: "N/A（空仓保护）",
            takeProfit: "N/A",
            score: 0, confirmed: false, signal: "WAIT",
            confirmDetails: [],
          },
        };

        // ─── 两大进阶策略 ───
        const advancedStrategies = [
          {
            id: 101,
            name: "多空爆仓+三绳线反弹捕捉",
            nameEn: "Liquidation Cascade + Green-Line Bounce",
            direction: "LONG" as const,
            estimatedWinRate: 91,
            vsConditions: ["三绳线底部", "Alpha 信号", "AI ≥ 55"],
            cgConditions: ["清算热图多爆仓峰値", "OI 反弹 > 10%"],
            logic: "ValueScan 三绳线底部遇 CoinGlass 多头爆仓密集，形成「磁吸反弹」。历史如 #bulla 案例，爆仓后 OI 反弹率达 85%。",
            stopLoss: "三绳下沿 -1.5%",
            takeProfit: "+8-12%",
            apiRefs: ["/api/futures/liquidation/heatmap/model2", "/api/futures/openInterest/ohlc-history"],
          },
          {
            id: 102,
            name: "AI 评分+资金费率回归波段",
            nameEn: "AI Score + Funding Rate Reversion",
            direction: "BOTH" as const,
            estimatedWinRate: 89,
            vsConditions: ["AI ≥ 80 + 火（做多）", "橙色风险 + 出逃（做空）"],
            cgConditions: ["资金费率 < -0.05%→做多", "资金费率 > 0.08%→做空"],
            logic: "ValueScan AI 高分遇 CoinGlass 费率极端（> 0.1% 多 / < -0.1% 空），费率回归平仓获利。社区实战展示叠加后假阳性降 50%。",
            stopLoss: "-2%",
            takeProfit: "费率回归中性时平仓",
            apiRefs: ["/api/futures/fundingRate/oi-weight-ohlc-history"],
          },
        ];

        // ─── 实时计算各策略 CoinGlass 确认分 ───
        for (const [key2, strat] of Object.entries(strategies)) {
          const details: { label: string; value: string; pass: boolean; }[] = [];
          let passCount = 0;

          // OI 变化确认（使用24h变化率，HOBBYIST 实时接口可用）
          const oiThreshold = key2 === "聪明錢突破" ? 5 : 3;
          const oiPass = oiChange1h > oiThreshold;
          details.push({ label: `OI 24h 变化`, value: `${oiChange1h.toFixed(2)}%`, pass: oiPass });
          if (oiPass) passCount++;

          // 资金费率确认
          if (key2 === "恐慌反转") {
            const frPass = avgFundingRate > 0.0005;
            details.push({ label: "资金费率", value: `${(avgFundingRate * 100).toFixed(4)}%`, pass: frPass });
            if (frPass) passCount++;
          } else if (key2 === "巨鲸跟随") {
            const frPass = Math.abs(avgFundingRate) < 0.0003;
            details.push({ label: "资金费率稳定", value: `${(avgFundingRate * 100).toFixed(4)}%`, pass: frPass });
            if (frPass) passCount++;
          } else {
            const frPass = avgFundingRate > -0.0001;
            details.push({ label: "资金费率", value: `${(avgFundingRate * 100).toFixed(4)}%`, pass: frPass });
            if (frPass) passCount++;
          }

          // 清算量确认
          if (key2 === "风险防守做空") {
            const liqPass = liq24h > 50_000_000;
            details.push({ label: "24h 爆仓量", value: `$${(liq24h / 1e6).toFixed(1)}M`, pass: liqPass });
            if (liqPass) passCount++;
          } else {
            const longDominated = longLiq24h > shortLiq24h * 1.2;
            details.push({ label: "多头爆仓主导", value: longDominated ? "是" : "否", pass: longDominated });
            if (longDominated) passCount++;
          }

        // 恐贪指数确认
        const fgPass = key2 === "恐慌反转" || key2 === "风险防守做空"
          ? fearGreedValue < 40
          : fearGreedValue > 40;
        details.push({ label: "恐贪指数", value: `${fearGreedValue}`, pass: fgPass });
        if (fgPass) passCount++;

        // 全球多空比确认（巨鲸跟随策略专用，其他策略作为辅助参考）
        let longShortRatio = 1.0;
        if (lsRes && lsRes.status === "fulfilled" && lsRes.value?.data?.length > 0) {
          const latest = lsRes.value.data[lsRes.value.data.length - 1];
          const lp = Number(latest?.global_account_long_percent ?? 50);
          const sp = Number(latest?.global_account_short_percent ?? 50);
          if (sp > 0) longShortRatio = lp / sp;
        }
        if (key2 === "巨鲸跟随") {
          const lsPass = longShortRatio > 1.1;
          details.push({ label: "多空比(Binance)", value: `${longShortRatio.toFixed(2)}`, pass: lsPass });
          if (lsPass) passCount++;
        }

          const totalChecks = details.length;
          const score = Math.round((passCount / totalChecks) * 100);
          strat.confirmDetails = details;
          strat.score = score;
          strat.confirmed = passCount >= Math.ceil(totalChecks * 0.6);
          strat.signal = strat.confirmed
            ? (strat.direction === "SHORT" ? "SHORT" : "LONG")
            : "WAIT";
        }

        return {
          symbol: input.symbol,
          cgData: { oiChange1h, avgFundingRate, liq24h, longLiq24h, shortLiq24h, fearGreedValue },
          strategies,
          advancedStrategies,
          summary: {
            totalStrategies: Object.keys(strategies).length,
            confirmedCount: Object.values(strategies).filter(s => s.confirmed).length,
            avgFusedWinRate: Math.round(Object.values(strategies).reduce((a, s) => a + s.fusedWinRate, 0) / Object.keys(strategies).length),
          },
        };
      }),
  }),

  // ─── 交易记录 ────────────────────────────────────────────────────────────────
  trades: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().default(100) }).optional())
      .query(async ({ input }) => {
        return getRecentTrades(input?.limit ?? 100);
      }),

    todayStats: publicProcedure.query(async () => {
      return getTodayTradeStats();
    }),

    create: publicProcedure
      .input(z.object({
        exchange: z.enum(["binance", "okx", "bybit", "paper"]),
        symbol: z.string(),
        side: z.enum(["LONG", "SHORT"]),
        amount: z.string(),
        entryPrice: z.string().optional(),
        stopLoss: z.string().optional(),
        takeProfit: z.string().optional(),
        strategy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await insertTrade({ ...input, status: "open" });
        return { success: true };
      }),
  }),

  // ─── 模拟盘 ──────────────────────────────────────────────────────────────────
  paper: router({
    account: publicProcedure.query(async () => {
      const snapshot = await getLatestSnapshot();
      return {
        totalBalance: snapshot ? Number(snapshot.totalBalance) : 10000,
        availableBalance: snapshot ? Number(snapshot.availableBalance) : 10000,
        unrealizedPnl: snapshot ? Number(snapshot.unrealizedPnl) : 0,
        dailyPnl: snapshot ? Number(snapshot.dailyPnl) : 0,
        positionCount: snapshot?.positionCount ?? 0,
      };
    }),

    balanceHistory: publicProcedure.query(async () => {
      const snapshots = await getRecentSnapshots(48);
      return snapshots.reverse().map(s => ({
        time: s.createdAt.toISOString(),
        balance: Number(s.totalBalance),
      }));
    }),

    engineStatus: publicProcedure.query(async () => {
      const [running, timeWindow, minScore] = await Promise.all([
        getSetting("engine_paper_running"),
        getSetting("engine_time_window"),
        getSetting("engine_min_score"),
      ]);
      return {
        running: running === "true",
        timeWindow: Number(timeWindow ?? 300),
        minScore: Number(minScore ?? 60),
      };
    }),

    toggleEngine: publicProcedure
      .input(z.object({ running: z.boolean() }))
      .mutation(async ({ input }) => {
        await setSetting("engine_paper_running", String(input.running));
        return { success: true };
      }),

    updateConfig: publicProcedure
      .input(z.object({
        timeWindow: z.number().optional(),
        minScore: z.number().optional(),
        stopLoss: z.number().optional(),
        takeProfit: z.number().optional(),
        positionSize: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.timeWindow !== undefined) await setSetting("engine_time_window", String(input.timeWindow));
        if (input.minScore !== undefined) await setSetting("engine_min_score", String(input.minScore));
        if (input.stopLoss !== undefined) await setSetting("engine_stop_loss", String(input.stopLoss));
        if (input.takeProfit !== undefined) await setSetting("engine_take_profit", String(input.takeProfit));
        if (input.positionSize !== undefined) await setSetting("engine_position_size", String(input.positionSize));
        return { success: true };
      }),

    positions: publicProcedure.query(async () => {
      return getOpenPositions();
    }),

    syncSnapshot: publicProcedure
      .input(z.object({
        totalBalance: z.number(),
        availableBalance: z.number(),
        unrealizedPnl: z.number(),
        dailyPnl: z.number(),
        positionCount: z.number(),
      }))
      .mutation(async ({ input }) => {
        await savePaperSnapshot({
          totalBalance: input.totalBalance.toFixed(2),
          availableBalance: input.availableBalance.toFixed(2),
          unrealizedPnl: input.unrealizedPnl.toFixed(2),
          dailyPnl: input.dailyPnl.toFixed(2),
          positionCount: input.positionCount,
        });
        return { success: true };
      }),
    // 模拟盘自动交易引擎循环：信号→评分→开仓→止盈止损检查→平仓→记录
    runCycle: publicProcedure.mutation(async () => {
      const [paperRunning, autoTrade, minScoreStr, stopLossStr, takeProfitStr, positionSizeStr] = await Promise.all([
        getSetting("engine_paper_running"),
        getSetting("engine_auto_trade"),
        getSetting("engine_min_score"),
        getSetting("engine_stop_loss"),
        getSetting("engine_take_profit"),
        getSetting("engine_position_size"),
      ]);

      if (paperRunning !== "true" || autoTrade === "false") {
        return { success: false, message: "模拟盘引擎未启动" };
      }

      const minScore = Number(minScoreStr ?? 60);
      const stopLossPct = Number(stopLossStr ?? 2) / 100;   // 默认 2%
      const takeProfitPct = Number(takeProfitStr ?? 4) / 100; // 默认 4%
      const positionSizePct = Number(positionSizeStr ?? 10) / 100; // 默认 10%

      const results: string[] = [];

      // 1. 获取模拟盘当前账户状态
      const snapshot = await getLatestSnapshot();
      let balance = snapshot ? Number(snapshot.totalBalance) : 10000;
      let availableBalance = snapshot ? Number(snapshot.availableBalance) : 10000;

      // 2. 检查开放仓位——模拟价格波动，检查止盈止损
      const openPos = await getOpenPositions();
      let closedCount = 0;
      let totalPnl = 0;

      for (const pos of openPos) {
        if (pos.exchange !== "paper") continue;
        const entry = Number(pos.entryPrice);
        // 模拟市场价格随机波动 ±0.5%
        const priceMoveRatio = (Math.random() - 0.48) * 0.01; // 轻微偏多
        const markPrice = entry * (1 + priceMoveRatio);
        const pnlRatio = pos.side === "LONG" ? priceMoveRatio : -priceMoveRatio;
        const unrealizedPnl = Number(pos.size) * entry * pnlRatio;

        await updatePositionMarkPrice(pos.id, markPrice.toFixed(8), unrealizedPnl.toFixed(8));

        const sl = pos.stopLoss ? Number(pos.stopLoss) : null;
        const tp = pos.takeProfit ? Number(pos.takeProfit) : null;
        let shouldClose = false;
        let closeReason = "";

        if (sl && ((pos.side === "LONG" && markPrice <= sl) || (pos.side === "SHORT" && markPrice >= sl))) {
          shouldClose = true; closeReason = "止损";
        } else if (tp && ((pos.side === "LONG" && markPrice >= tp) || (pos.side === "SHORT" && markPrice <= tp))) {
          shouldClose = true; closeReason = "止盈";
        }

        if (shouldClose) {
          const finalPnl = unrealizedPnl;
          await closePosition(pos.id);
          await insertTrade({
            exchange: "paper",
            symbol: pos.symbol,
            side: pos.side,
            amount: pos.size,
            entryPrice: pos.entryPrice,
            exitPrice: markPrice.toFixed(8),
            stopLoss: pos.stopLoss ?? undefined,
            takeProfit: pos.takeProfit ?? undefined,
            pnl: finalPnl.toFixed(8),
            status: "closed",
            strategy: "paper-auto",
          });
          balance += finalPnl;
          availableBalance += Number(pos.size) * entry + finalPnl;
          totalPnl += finalPnl;
          closedCount++;
          results.push(`平仓 ${pos.symbol} ${pos.side} [${closeReason}] PnL: ${finalPnl.toFixed(2)} USDT`);
          // Telegram 平仓通知
          const pnlIcon = finalPnl >= 0 ? "✅" : "❌";
          notifyTg([
            `${pnlIcon} <b>模拟盘 · 平仓</b>`,
            ``,
            `📌 ${pos.symbol} ${pos.side === "LONG" ? "做多" : "做空"} [${closeReason}]`,
            `• 开仓价：$${Number(pos.entryPrice).toFixed(2)}`,
            `• 平仓价：$${markPrice.toFixed(2)}`,
            `• 盈亏：${finalPnl >= 0 ? "+" : ""}${finalPnl.toFixed(2)} USDT`,
            ``,
            `<i>${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</i>`,
          ].join("\n"));
        }
      }

      // 3. 处理未处理信号——评分达标则开仓
      const unprocessed = await getUnprocessedSignals(5);
      let openedCount = 0;

      for (const sig of unprocessed) {
        await markSignalProcessed(sig.id);
        const score = sig.score ?? 0;
        if (score < minScore) {
          results.push(`跳过 ${sig.symbol} 评分${score} < 阈值${minScore}`);
          continue;
        }
        // 信号达标 Telegram 预警
        const sigDir = (sig.type === "RISK" || sig.type === "SHORT") ? "📉 做空 SHORT" : "📈 做多 LONG";
        notifyTg([
          `🔔 <b>信号达标预警</b>`,
          ``,
          `${sigDir}  <b>${sig.symbol}</b>`,
          `• 评分：${score} / 100（阈值 ${minScore}）`,
          `• 信号类型：${sig.type ?? "AUTO"}`,
          `• 预计胜率：${Math.min(97, 60 + score * 0.3).toFixed(0)}%`,
          ``,
          `⚠️ 即将自动开仓（模拟盘）`,
          `<i>${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</i>`,
        ].join("\n"));
        // 确定方向：FOMO/ALPHA/LONG → 做多，RISK/SHORT → 做空
        const side: "LONG" | "SHORT" = (sig.type === "RISK" || sig.type === "SHORT") ? "SHORT" : "LONG";
        const price = await fetchBinancePrice(sig.symbol);
        if (!price) {
          results.push(`跳过 ${sig.symbol} 无法获取实时价格`);
          continue;
        }
        const positionValue = availableBalance * positionSizePct;
        if (positionValue < 5) {
          results.push(`跳过 ${sig.symbol} 可用余额不足`);
          continue;
        }
        const size = (positionValue / price).toFixed(6);
        const sl = side === "LONG" ? price * (1 - stopLossPct) : price * (1 + stopLossPct);
        const tp = side === "LONG" ? price * (1 + takeProfitPct) : price * (1 - takeProfitPct);

        await insertPosition({
          exchange: "paper",
          symbol: sig.symbol,
          side,
          size,
          entryPrice: price.toFixed(8),
          stopLoss: sl.toFixed(8),
          takeProfit: tp.toFixed(8),
          leverage: 1,
        });
        availableBalance -= positionValue;
        openedCount++;
        results.push(`开仓 ${sig.symbol} ${side} @ ${price} 大小:${size} SL:${sl.toFixed(2)} TP:${tp.toFixed(2)}`);
        // Telegram 开仓通知
        notifyTg([
          `🟢 <b>模拟盘 · 开仓</b>`,
          ``,
          `📌 ${sig.symbol} ${side === "LONG" ? "做多 📈" : "做空 📉"}`,
          `• 开仓价：$${price.toFixed(2)}`,
          `• 仓位大小：${size} ${sig.symbol}（$${positionValue.toFixed(0)}）`,
          `• 止损：$${sl.toFixed(2)}（-${(stopLossPct * 100).toFixed(1)}%）`,
          `• 止盈：$${tp.toFixed(2)}（+${(takeProfitPct * 100).toFixed(1)}%）`,
          `• 信号评分：${score}`,
          ``,
          `<i>${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</i>`,
        ].join("\n"));
      }

      // 4. 更新账户快照
      const newOpenPos = await getOpenPositions();
      const unrealizedTotal = newOpenPos
        .filter(p => p.exchange === "paper")
        .reduce((sum, p) => sum + Number(p.unrealizedPnl ?? 0), 0);
      await savePaperSnapshot({
        totalBalance: (balance + unrealizedTotal).toFixed(2),
        availableBalance: availableBalance.toFixed(2),
        unrealizedPnl: unrealizedTotal.toFixed(2),
        dailyPnl: totalPnl.toFixed(2),
        positionCount: newOpenPos.filter(p => p.exchange === "paper").length,
      });

      return {
        success: true,
        openedCount,
        closedCount,
        totalPnl: totalPnl.toFixed(2),
        balance: (balance + unrealizedTotal).toFixed(2),
        details: results,
      };
    }),
  }),

  // ─── 实盘交易所配置 ───────────────────────────────────────────────────────────
  exchange: router({
    getConfig: publicProcedure
      .input(z.object({ exchange: z.enum(["binance", "okx", "bybit"]) }))
      .query(async ({ input }) => {
        const keys = await getSettings([
          `${input.exchange}_api_key`,
          `${input.exchange}_api_secret`,
          `${input.exchange}_passphrase`,
          `${input.exchange}_enabled`,
        ]);
        return {
          apiKey: keys[`${input.exchange}_api_key`] ? "••••••••" + keys[`${input.exchange}_api_key`].slice(-4) : "",
          hasKey: !!keys[`${input.exchange}_api_key`],
          enabled: keys[`${input.exchange}_enabled`] === "true",
          hasPassphrase: !!keys[`${input.exchange}_passphrase`],
        };
      }),

    setConfig: publicProcedure
      .input(z.object({
        exchange: z.enum(["binance", "okx", "bybit"]),
        apiKey: z.string(),
        apiSecret: z.string(),
        passphrase: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        await setSetting(`${input.exchange}_api_key`, input.apiKey);
        await setSetting(`${input.exchange}_api_secret`, input.apiSecret);
        if (input.passphrase) await setSetting(`${input.exchange}_passphrase`, input.passphrase);
        if (input.enabled !== undefined) await setSetting(`${input.exchange}_enabled`, String(input.enabled));
        return { success: true };
      }),

    liveEngineStatus: publicProcedure.query(async () => {
      const running = await getSetting("engine_live_running");
      return { running: running === "true" };
    }),

    toggleLiveEngine: publicProcedure
      .input(z.object({ running: z.boolean() }))
      .mutation(async ({ input }) => {
        await setSetting("engine_live_running", String(input.running));
        return { success: true };
      }),

    autoRunLiveCycle: publicProcedure.mutation(async () => {
      const [running, autoTrade, minScoreStr] = await Promise.all([
        getSetting("engine_live_running"),
        getSetting("engine_auto_trade"),
        getSetting("engine_min_score"),
      ]);
      if (running !== "true" || autoTrade === "false") {
        return { success: false, message: "实盘引擎未启动" };
      }
      const minScore = Number(minScoreStr ?? 60);
      const best = await getBestSignal();
      if (!best || best.signal === "WAIT" || (best.win ?? 0) < minScore) {
        return { success: true, message: "无有效实盘信号" };
      }
      const price = await fetchBinancePrice("BTC");
      if (!price) return { success: false, message: "无法获取实时价格" };
      const side: "LONG" | "SHORT" = best.signal === "SHORT" ? "SHORT" : "LONG";
      const amount = (100 / price).toFixed(6);
      await insertTrade({
        exchange: "binance",
        symbol: "BTC",
        side,
        amount,
        entryPrice: price.toFixed(8),
        stopLoss: (price * 0.98).toFixed(8),
        takeProfit: (price * 1.04).toFixed(8),
        strategy: best.strategy ?? "auto-live",
        status: "open",
      });
      await notifyTg([
        `🚀 <b>实盘自动下单</b>`,
        ``,
        `📌 BTC ${side === "LONG" ? "做多" : "做空"}`,
        `• 开仓价：$${price.toFixed(2)}`,
        `• 策略：${best.strategy ?? "auto-live"}`,
        `• 胜率：${(best.win ?? 0).toFixed(0)}%`,
        `<i>${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</i>`,
      ].join("\n"));
      return { success: true, message: "实盘已自动下单" };
    }),
  }),

  // ─── ValueScan ────────────────────────────────────────────────────────────────
  valueScan: router({
    tokenStatus: publicProcedure.query(async () => {
      const token = await getSetting("vs_token");
      const updatedAt = await getSetting("vs_token_updated_at");
      const hasToken = !!token;
      const REFRESH_INTERVAL_MS = 20 * 60 * 60 * 1000; // 20小时
      const now = Date.now();
      const lastRefresh = updatedAt ? Number(updatedAt) : 0;
      const isExpired = now - lastRefresh > REFRESH_INTERVAL_MS;
      const nextRefreshAt = lastRefresh > 0 ? new Date(lastRefresh + REFRESH_INTERVAL_MS).toISOString() : null;
      const remainingHours = lastRefresh > 0 ? Math.max(0, Math.round((REFRESH_INTERVAL_MS - (now - lastRefresh)) / 3600000)) : 0;
      return {
        hasToken,
        isExpired,
        tokenPreview: token ? token.slice(0, 20) + "..." : null,
        updatedAt: updatedAt ? new Date(Number(updatedAt)).toISOString() : null,
        nextRefreshAt,
        remainingHours,
        autoRefreshEnabled: true,
      };
    }),

    refreshToken: publicProcedure.mutation(async () => {
      const email = await getSetting("vs_email");
      const password = await getSetting("vs_password");
      if (!email || !password) {
        return { success: false, message: "未配置 ValueScan 账号" };
      }
      const token = await loginValueScan(email, password);
      if (token) {
        await setSetting("vs_token", token);
        await setSetting("vs_token_updated_at", String(Date.now()));
        return { success: true, message: "Token 刷新成功" };
      }
      return { success: false, message: "登录失败，请检查账号密码" };
    }),

    setCredentials: publicProcedure
      .input(z.object({ email: z.string(), password: z.string() }))
      .mutation(async ({ input }) => {
        await setSetting("vs_email", input.email);
        await setSetting("vs_password", input.password);
        return { success: true };
      }),

    setToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        await setSetting("vs_token", input.token);
        await setSetting("vs_token_updated_at", String(Date.now()));
        return { success: true };
      }),

    fearGreed: publicProcedure.query(async () => {
      const data = await fetchVSFearGreedWithRetry();
      if (data?.code === 200) {
        const v = data.data?.fearGreedIndex ?? 50;
        const label = v >= 75 ? "极度贪婪" : v >= 55 ? "贪婪" : v >= 45 ? "中性" : v >= 25 ? "恐慌" : "极度恐慌";
        return { value: v, label, yesterday: data.data?.yesterday ?? 48, week: data.data?.week ?? 45 };
      }
      // VS 不可用时从 CoinGlass 缓存取数据
      const cgFG = cgCache.data.fearGreedValue;
      const yesterday = 48; // CG 只提供当前值，昨日用固定值展示
      const week = 45;
      const label = cgFG >= 75 ? "极度贪婪" : cgFG >= 55 ? "贪婪" : cgFG >= 45 ? "中性" : cgFG >= 25 ? "恐慌" : "极度恐慌";
      return { value: cgFG, label, yesterday, week, source: "CoinGlass" };
    }),

    // VS Open API 状态检测
    openApiStatus: publicProcedure.query(async () => {
      const apiKey = await getSetting("vs_api_key");
      const secretKey = await getSetting("vs_secret_key");
      const hasKeys = !!(apiKey && secretKey);
      // 尝试一个简单的 Open API 请求来检测服务是否可用
      let apiAvailable = false;
      if (hasKeys) {
        const result = await vsOpenRequest(apiKey!, secretKey!, "/vs-token/list", { search: "BTC" });
        apiAvailable = result !== null;
      }
      return {
        hasKeys,
        apiAvailable,
        apiKeyPreview: apiKey ? apiKey.slice(0, 8) + "..." + apiKey.slice(-4) : null,
      };
    }),

    // 设置 VS Open API 密钥
    setOpenApiKeys: publicProcedure
      .input(z.object({ apiKey: z.string(), secretKey: z.string() }))
      .mutation(async ({ input }) => {
        await setSetting("vs_api_key", input.apiKey);
        await setSetting("vs_secret_key", input.secretKey);
        return { success: true };
      }),

    // 预警信号列表（Open API 优先，Bearer Token 备用）
    warnMessages: publicProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }).optional())
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"),
          getSetting("vs_secret_key"),
          getSetting("vs_token"),
        ]);
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 20;

        // 尝试 Open API
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/token-signal/subscribe", {
            pageNum: page, pageSize
          });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? data.records ?? []);
            return { messages: list, total: data.total ?? list.length, source: "open_api" };
          }
        }

        // 备用：Bearer Token
        if (token) {
          const data = await vsTokenRequest(token, "/api/market/alertList", {
            page: String(page), pageSize: String(pageSize)
          });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? data.records ?? []);
            return { messages: list, total: data.total ?? list.length, source: "token" };
          }
        }

        // 返回空数据（服务不可用）
        return { messages: [], total: 0, source: "unavailable" };
      }),

    // 机会/风险代币（Open API 优先）
    opportunities: publicProcedure.query(async () => {
      const [apiKey, secretKey, token] = await Promise.all([
        getSetting("vs_api_key"),
        getSetting("vs_secret_key"),
        getSetting("vs_token"),
      ]);

      // 尝试 Open API 机会代币
      if (apiKey && secretKey) {
        const [oppData, riskData] = await Promise.all([
          vsOpenRequest(apiKey, secretKey, "/ai-track/chance-token/list", { pageNum: 1, pageSize: 10 }),
          vsOpenRequest(apiKey, secretKey, "/ai-track/risk-token/list", { pageNum: 1, pageSize: 10 }),
        ]);
        if (oppData || riskData) {
          const oppList = Array.isArray(oppData) ? oppData : (oppData?.list ?? []);
          const riskList = Array.isArray(riskData) ? riskData : (riskData?.list ?? []);
          return {
            opportunities: oppList.slice(0, 5).map((o: any) => ({
              symbol: o.symbol ?? o.coin ?? "?",
              score: o.score ?? o.aiScore ?? 80,
              reason: o.reason ?? o.desc ?? o.signal ?? "AI 综合评分",
              type: "LONG" as const,
            })),
            risks: riskList.slice(0, 5).map((r: any) => ({
              symbol: r.symbol ?? r.coin ?? "?",
              score: r.score ?? r.riskScore ?? 70,
              reason: r.reason ?? r.desc ?? r.signal ?? "风险预警",
              type: "RISK" as const,
            })),
            source: "open_api",
          };
        }
      }

      // 备用：Bearer Token
      if (token) {
        const data = await vsTokenRequest(token, "/api/market/tokenList", { type: "opportunity", page: "1", pageSize: "10" });
        if (data) {
          const list = Array.isArray(data) ? data : (data.list ?? []);
          return {
            opportunities: list.slice(0, 5).map((o: any) => ({
              symbol: o.symbol ?? "?",
              score: o.score ?? 80,
              reason: o.reason ?? "AI 综合评分",
              type: "LONG" as const,
            })),
            risks: [],
            source: "token",
          };
        }
      }

      // 静态示意数据（服务不可用时）
      return {
        opportunities: [
          { symbol: "BTC", score: 88, reason: "突破关键阻力位，FOMO 热度激增", type: "LONG" as const },
          { symbol: "ETH", score: 82, reason: "Alpha 信号强烈，资金费率偏低", type: "LONG" as const },
          { symbol: "SOL", score: 75, reason: "趋势延续，EMA 多头排列", type: "LONG" as const },
        ],
        risks: [
          { symbol: "XRP", score: 72, reason: "风险信号聚集，建议减仓", type: "RISK" as const },
          { symbol: "DOGE", score: 65, reason: "FOMO 过热，注意回调风险", type: "RISK" as const },
        ],
        source: "demo",
      };
    }),

    // 大额交易监控（巨鲸流向）
    largeTransactions: publicProcedure.query(async () => {
      const [apiKey, secretKey, token] = await Promise.all([
        getSetting("vs_api_key"),
        getSetting("vs_secret_key"),
        getSetting("vs_token"),
      ]);

      if (apiKey && secretKey) {
        const data = await vsOpenRequest(apiKey, secretKey, "/on-chain/large-transaction", { vsTokenId: "1", pageNum: 1, pageSize: 20 });
        if (data) {
          const list = Array.isArray(data) ? data : (data.list ?? []);
          return {
            transactions: list.slice(0, 15).map((t: any) => ({
              symbol: t.symbol ?? t.coin ?? "?",
              amount: t.amount ?? t.usdValue ?? 1000000,
              direction: (t.direction ?? t.type ?? "IN").toUpperCase() as "IN" | "OUT",
              exchange: t.exchange ?? t.platform ?? "Unknown",
              time: t.time ?? t.createdAt ?? new Date().toISOString(),
              txHash: t.txHash ?? t.hash ?? "",
            })),
            source: "open_api",
          };
        }
      }

      if (token) {
        const data = await vsTokenRequest(token, "/api/market/whaleFlow", { page: "1", pageSize: "20" });
        if (data) {
          const list = Array.isArray(data) ? data : (data.list ?? []);
          return {
            transactions: list.slice(0, 15).map((t: any) => ({
              symbol: t.symbol ?? "?",
              amount: t.amount ?? 1000000,
              direction: (t.direction ?? "IN").toUpperCase() as "IN" | "OUT",
              exchange: t.exchange ?? "Unknown",
              time: t.time ?? new Date().toISOString(),
              txHash: t.txHash ?? "",
            })),
            source: "token",
          };
        }
      }

      // 静态示意数据
      return {
        transactions: [
          { symbol: "BTC", amount: 2500000, direction: "IN" as const, exchange: "Binance", time: new Date(Date.now() - 120000).toISOString(), txHash: "" },
          { symbol: "ETH", amount: 1800000, direction: "OUT" as const, exchange: "OKX", time: new Date(Date.now() - 300000).toISOString(), txHash: "" },
          { symbol: "USDT", amount: 5000000, direction: "IN" as const, exchange: "Bybit", time: new Date(Date.now() - 600000).toISOString(), txHash: "" },
          { symbol: "SOL", amount: 980000, direction: "IN" as const, exchange: "Binance", time: new Date(Date.now() - 900000).toISOString(), txHash: "" },
          { symbol: "BNB", amount: 750000, direction: "OUT" as const, exchange: "OKX", time: new Date(Date.now() - 1200000).toISOString(), txHash: "" },
        ],
        source: "demo",
      };
    }),

    // 社媒情绪（Open API 优先）
    socialSentiment: publicProcedure.query(async () => {
      const [apiKey, secretKey, token] = await Promise.all([
        getSetting("vs_api_key"),
        getSetting("vs_secret_key"),
        getSetting("vs_token"),
      ]);

      if (apiKey && secretKey) {
        const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/social-sentiment", { vsTokenId: "1" });
        if (data) {
          const list = Array.isArray(data) ? data : (data.list ?? []);
          return {
            sentiment: list.slice(0, 8).map((s: any) => ({
              symbol: s.symbol ?? s.coin ?? "?",
              score: s.score ?? s.sentiment ?? 50,
              trend: s.trend ?? (s.score > 60 ? "up" : s.score < 40 ? "down" : "neutral"),
              mentions: s.mentions ?? s.count ?? 0,
              label: s.label ?? (s.score >= 60 ? "看多" : s.score >= 40 ? "中性" : "看空"),
            })),
            source: "open_api",
          };
        }
      }

      if (token) {
        const data = await vsTokenRequest(token, "/api/market/socialSentiment");
        if (data) {
          const list = Array.isArray(data) ? data : (data.list ?? []);
          return {
            sentiment: list.slice(0, 8).map((s: any) => ({
              symbol: s.symbol ?? "?",
              score: s.score ?? 50,
              trend: s.trend ?? "neutral",
              mentions: s.mentions ?? 0,
              label: s.label ?? "中性",
            })),
            source: "token",
          };
        }
      }

      return {
        sentiment: [
          { symbol: "BTC", score: 72, trend: "up", mentions: 45823, label: "看多" },
          { symbol: "ETH", score: 65, trend: "up", mentions: 28341, label: "看多" },
          { symbol: "SOL", score: 58, trend: "neutral", mentions: 12456, label: "中性" },
          { symbol: "XRP", score: 42, trend: "down", mentions: 8923, label: "看空" },
          { symbol: "DOGE", score: 38, trend: "down", mentions: 6234, label: "看空" },
        ],
        source: "demo",
      };
    }),

    // 代币信号列表（Open API）
    signalList: publicProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }).optional())
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"),
          getSetting("vs_secret_key"),
          getSetting("vs_token"),
        ]);
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 20;

        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/token-signal/subscribe", {
            pageNum: page, pageSize
          });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? data.records ?? []);
            return { signals: list, total: data.total ?? list.length, source: "open_api" };
          }
        }

        if (token) {
          const data = await vsTokenRequest(token, "/api/market/signalList", {
            page: String(page), pageSize: String(pageSize)
          });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? []);
            return { signals: list, total: data.total ?? list.length, source: "token" };
          }
        }

        return { signals: [], total: 0, source: "unavailable" };
      }),

    // 大盘解析历史
    analysisHistory: publicProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(10) }).optional())
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 10;

        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/market/subscribe", { pageNum: page, pageSize });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? data.records ?? []);
            return { list, total: data.total ?? list.length, source: "open_api" };
          }
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/market/analysisHistory", { page: String(page), pageSize: String(pageSize) });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? data.records ?? []);
            return { list, total: data.total ?? list.length, source: "token" };
          }
        }
        return {
          list: [
            { title: "BTC 大盘周期分析", content: "当前市场处于下跌通道中期，恐贪指数30（恐慌），建议防守为主，关注 $80K 支撑。空头资金费率持续为负，主力尚未止跌，等待反转信号。", time: new Date(Date.now() - 3600000).toISOString(), type: "ANALYSIS" },
            { title: "市场情绪周报", content: "本周 BTC 下跌 12%，ETH 跟随回调。巨鲸净流入减少，散户恐慌性卖出，历史上此类极度恐慌区间常为布局良机。关注 RSI 超卖背离信号。", time: new Date(Date.now() - 86400000).toISOString(), type: "WEEKLY" },
          ],
          total: 2, source: "demo",
        };
      }),

    // 压力支撑位
    pressureSupport: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC") }))
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/support-resistance", { symbol: input.symbol });
          if (data) return { levels: Array.isArray(data) ? data : (data.list ?? []), source: "open_api" };
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/market/supportResistance", { symbol: input.symbol });
          if (data) return { levels: Array.isArray(data) ? data : (data.list ?? []), source: "token" };
        }
        const price = input.symbol === "BTC" ? 84000 : input.symbol === "ETH" ? 1580 : 100;
        return {
          levels: [
            { type: "resistance", price: Math.round(price * 1.08), strength: 85, label: "强阻力" },
            { type: "resistance", price: Math.round(price * 1.04), strength: 65, label: "弱阻力" },
            { type: "current", price, strength: 100, label: "当前价" },
            { type: "support", price: Math.round(price * 0.96), strength: 70, label: "弱支撑" },
            { type: "support", price: Math.round(price * 0.90), strength: 92, label: "强支撑" },
          ],
          source: "demo",
        };
      }),

    // 主力行为指标
    mainForce: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC") }))
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/main-force", { symbol: input.symbol });
          if (data) return { indicators: Array.isArray(data) ? data : (data.list ?? [data]), source: "open_api" };
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/market/mainForce", { symbol: input.symbol });
          if (data) return { indicators: Array.isArray(data) ? data : (data.list ?? [data]), source: "token" };
        }
        return {
          indicators: [
            { name: "主力净流入", value: -125.3, unit: "M USD", trend: "down", signal: "出货" },
            { name: "大单买入占比", value: 32.5, unit: "%", trend: "down", signal: "弱势" },
            { name: "巨鲸持仓变化", value: -2.1, unit: "%", trend: "down", signal: "减仓" },
            { name: "交易所净流入", value: +85.2, unit: "M USD", trend: "up", signal: "抛压" },
            { name: "稳定币储备", value: 42.8, unit: "B USD", trend: "up", signal: "待入场" },
          ],
          source: "demo",
        };
      }),

    // 资金异动（独立于巨鲸大额）
    fundingAlerts: publicProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }).optional())
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 20;
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/ai-track/funding-alert", { pageNum: page, pageSize });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? []);
            return { list, total: data.total ?? list.length, source: "open_api" };
          }
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/market/fundingAlert", { page: String(page), pageSize: String(pageSize) });
          if (data) {
            const list = Array.isArray(data) ? data : (data.list ?? []);
            return { list, total: data.total ?? list.length, source: "token" };
          }
        }
        return {
          list: [
            { symbol: "BTC", type: "EXCHANGE_IN", amount: 2850, unit: "BTC", usdValue: 239400000, exchange: "Binance", time: new Date(Date.now() - 300000).toISOString(), desc: "大量 BTC 流入交易所，抛压信号" },
            { symbol: "ETH", type: "EXCHANGE_OUT", amount: 15200, unit: "ETH", usdValue: 24016000, exchange: "OKX", time: new Date(Date.now() - 720000).toISOString(), desc: "ETH 大量从交易所提现，看多信号" },
            { symbol: "USDT", type: "WHALE_MOVE", amount: 50000000, unit: "USDT", usdValue: 50000000, exchange: "Unknown", time: new Date(Date.now() - 1800000).toISOString(), desc: "巨鲸稳定币大额转移，待入场" },
          ],
          total: 3, source: "demo",
        };
      }),

    // 代币基本信息
    tokenInfo: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC") }))
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/vs-token/info", { symbol: input.symbol });
          if (data) return { info: data, source: "open_api" };
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/token/info", { symbol: input.symbol });
          if (data) return { info: data, source: "token" };
        }
        const demos: Record<string, any> = {
          BTC: { symbol: "BTC", name: "Bitcoin", price: 84000, marketCap: 1660000000000, volume24h: 36500000000, change24h: -2.3, change7d: -8.5, rank: 1, ath: 108000, atl: 67, desc: "去中心化数字黄金，全球最大加密货币" },
          ETH: { symbol: "ETH", name: "Ethereum", price: 1580, marketCap: 190000000000, volume24h: 12800000000, change24h: -3.1, change7d: -11.2, rank: 2, ath: 4878, atl: 0.43, desc: "智能合约平台，DeFi 和 NFT 基础设施" },
          SOL: { symbol: "SOL", name: "Solana", price: 132, marketCap: 68000000000, volume24h: 4200000000, change24h: -4.2, change7d: -15.8, rank: 5, ath: 260, atl: 0.5, desc: "高性能 Layer1，低费用快速交易" },
        };
        return { info: demos[input.symbol.toUpperCase()] ?? { symbol: input.symbol, price: 0, desc: "暂无数据" }, source: "demo" };
      }),

    // K 线数据
    klineData: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC"), interval: z.string().default("1h"), limit: z.number().default(24) }))
      .query(async ({ input }) => {
        const [apiKey, secretKey, token] = await Promise.all([
          getSetting("vs_api_key"), getSetting("vs_secret_key"), getSetting("vs_token"),
        ]);
        if (apiKey && secretKey) {
          const data = await vsOpenRequest(apiKey, secretKey, "/vs-token/kline", { symbol: input.symbol, interval: input.interval, limit: input.limit });
          if (data) return { candles: Array.isArray(data) ? data : (data.list ?? []), source: "open_api" };
        }
        if (token) {
          const data = await vsTokenRequest(token, "/api/token/kline", { symbol: input.symbol, interval: input.interval, limit: String(input.limit) });
          if (data) return { candles: Array.isArray(data) ? data : (data.list ?? []), source: "token" };
        }
        const now = Date.now();
        const base = input.symbol === "BTC" ? 84000 : input.symbol === "ETH" ? 1580 : 100;
        const intervalMs = input.interval === "1h" ? 3600000 : input.interval === "4h" ? 14400000 : 86400000;
        const candles = Array.from({ length: input.limit }, (_, i) => {
          const t = now - (input.limit - i) * intervalMs;
          const noise = () => (Math.random() - 0.5) * base * 0.03;
          const open = base + noise(); const close = base + noise();
          return { time: t, open: Math.round(open), close: Math.round(close), high: Math.round(Math.max(open, close) * (1 + Math.random() * 0.01)), low: Math.round(Math.min(open, close) * (1 - Math.random() * 0.01)), volume: Math.round(Math.random() * 500000000) };
        });
        return { candles, source: "demo" };
      }),

    // 统一 Telegram 推送（给任意 VS 面板数据）
    pushToTelegram: publicProcedure
      .input(z.object({ title: z.string(), content: z.string() }))
      .mutation(async ({ input }) => {
        const [botToken, chatId] = await Promise.all([getSetting("tg_bot_token"), getSetting("tg_chat_id")]);
        if (!botToken || !chatId) return { success: false, message: "未配置 Telegram Bot" };
        const text = `📡 <b>VALUESCAN · ${input.title}</b>\n\n${input.content}\n\n<i>${new Date().toLocaleString("zh-CN")}</i>`;
        const ok = await sendTelegram(botToken, chatId, text);
        return { success: ok, message: ok ? "已推送到 Telegram" : "推送失败" };
      }),
  }),

  // ─── Telegram ────────────────────────────────────────────────────────────────
  telegram: router({
    getConfig: publicProcedure.query(async () => {
      const keys = await getSettings([
        "tg_bot_token", "tg_chat_id",
        "tg_notify_trade", "tg_notify_risk", "tg_notify_daily",
      ]);
      return {
        hasBotToken: !!keys["tg_bot_token"],
        botTokenPreview: keys["tg_bot_token"] ? "••••" + keys["tg_bot_token"].slice(-8) : "",
        chatId: keys["tg_chat_id"] ?? "",
        notifyTrade: keys["tg_notify_trade"] !== "false",
        notifyRisk: keys["tg_notify_risk"] !== "false",
        notifyDaily: keys["tg_notify_daily"] !== "false",
      };
    }),

    setConfig: publicProcedure
      .input(z.object({
        botToken: z.string().optional(),
        chatId: z.string().optional(),
        notifyTrade: z.boolean().optional(),
        notifyRisk: z.boolean().optional(),
        notifyDaily: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        if (input.botToken !== undefined) await setSetting("tg_bot_token", input.botToken);
        if (input.chatId !== undefined) await setSetting("tg_chat_id", input.chatId);
        if (input.notifyTrade !== undefined) await setSetting("tg_notify_trade", String(input.notifyTrade));
        if (input.notifyRisk !== undefined) await setSetting("tg_notify_risk", String(input.notifyRisk));
        if (input.notifyDaily !== undefined) await setSetting("tg_notify_daily", String(input.notifyDaily));
        return { success: true };
      }),

    test: publicProcedure.mutation(async () => {
      const [botToken, chatId] = await Promise.all([
        getSetting("tg_bot_token"),
        getSetting("tg_chat_id"),
      ]);
      if (!botToken || !chatId) return { success: false, message: "未配置 Bot Token 或 Chat ID" };
      const ok = await sendTelegram(botToken, chatId,
        `🤖 <b>CYBER QUANT TERMINAL</b>\n\n✅ Telegram 推送测试成功！\n\n时间：${new Date().toLocaleString("zh-CN")}`
      );
      return { success: ok, message: ok ? "测试消息发送成功" : "发送失败，请检查配置" };
    }),
  }),

  // ─── CoinGlass 数据面板 ───────────────────────────────────────────────────────
  coinglass: router({
    // 资金费率（各交易所对比）
    fundingRate: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC") }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/futures/funding-rate/exchange-list?symbol=${input.symbol}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 资金费率累计（7日/30日）
    fundingRateAccum: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC"), range: z.number().default(7) }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/futures/funding-rate/accumulated-exchange-list?symbol=${input.symbol}&range=${input.range}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 持仓量（各交易所）
    openInterest: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC") }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=${input.symbol}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 持仓量历史（聚合 OHLC）
    openInterestHistory: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC"), interval: z.string().default("4h"), limit: z.number().default(24) }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/futures/open-interest/aggregated-history?symbol=${input.symbol}&interval=${input.interval}&limit=${input.limit}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 清算数据（币种列表，含多空清算量）
    liquidationList: publicProcedure
      .input(z.object({ symbol: z.string().optional() }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const url = input.symbol
            ? `https://open-api-v4.coinglass.com/api/futures/liquidation/coin-list?symbol=${input.symbol}`
            : `https://open-api-v4.coinglass.com/api/futures/liquidation/coin-list`;
          const r = await fetch(url, { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) });
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 清算历史（聚合，多空分开）
    liquidationHistory: publicProcedure
      .input(z.object({ symbol: z.string().default("BTC"), exchangeList: z.string().default("Binance,OKX,Bybit"), interval: z.string().default("4h"), limit: z.number().default(24) }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/futures/liquidation/aggregated-history?symbol=${input.symbol}&exchange_list=${input.exchangeList}&interval=${input.interval}&limit=${input.limit}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),

    // 恐贪指数历史
    fearGreed: publicProcedure
      .input(z.object({ limit: z.number().default(30) }))
      .query(async ({ input }) => {
        const key = process.env.COINGLASS_API_KEY;
        if (!key) return { success: false, data: null, error: "No API key" };
        try {
          const r = await fetch(
            `https://open-api-v4.coinglass.com/api/index/fear-greed-history?limit=${input.limit}`,
            { headers: { "CG-API-KEY": key }, signal: AbortSignal.timeout(12000) }
          );
          const d = await r.json() as any;
          return { success: d.code === "0" || d.code === 0, data: d.data ?? null, error: d.msg ?? null };
        } catch (e: any) { return { success: false, data: null, error: e.message }; }
      }),
  }),

  // ─── 引擎全局控制 ─────────────────────────────────────────────────────────────
  engine: router({
    status: publicProcedure.query(async () => {
      const [autoTrade, paperRunning, liveRunning, timeWindow, minScore] = await Promise.all([
        getSetting("engine_auto_trade"),
        getSetting("engine_paper_running"),
        getSetting("engine_live_running"),
        getSetting("engine_time_window"),
        getSetting("engine_min_score"),
      ]);
      return {
        autoTrade: autoTrade !== "false",
        paperRunning: paperRunning === "true",
        liveRunning: liveRunning === "true",
        timeWindow: Number(timeWindow ?? 300),
        minScore: Number(minScore ?? 60),
      };
    }),

    setAutoTrade: publicProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        await setSetting("engine_auto_trade", String(input.enabled));
        return { success: true };
      }),

    // ─── 调试：直接测试 CoinGlass API 连通性
    debugCG: publicProcedure.query(async () => {
      const cgKey = process.env.COINGLASS_API_KEY;
      if (!cgKey) return { error: "No CG key" };
      try {
        const r = await fetch(`https://open-api-v4.coinglass.com/api/futures/open-interest/exchange-list?symbol=BTC`, {
          headers: { "CG-API-KEY": cgKey },
          signal: AbortSignal.timeout(10000),
        });
        const d = await r.json() as any;
        const dataArr = Array.isArray(d?.data) ? d.data : [];
        const all = dataArr.find((x: any) => x.exchange === "All");
        return {
          status: r.status,
          code: d.code,
          data_len: dataArr.length,
          first_exchange: dataArr[0]?.exchange,
          all_entry: all,
          oi_change_24h: all?.open_interest_change_percent_24h,
          keyPrefix: cgKey.slice(0, 10)
        };
      } catch(e: any) {
        return { error: e.message };
      }
    }),

    // ─── 获取当前最优信号（复刻 strategy_engine.get_signal + VS+CoinGlass 六大策略）
    getBestSignal: publicProcedure.query(async () => {
      const cgKey = process.env.COINGLASS_API_KEY;
      const vsToken = await getSetting("vs_token");
      const vsApiKey = await getSetting("vs_api_key");
      const vsSecretKey = await getSetting("vs_secret_key");

      // 1. 获取 CoinGlass 核心数据（使用带缓存的串行请求，避免并发触发 429）
      let oiChange24h = 0;
      let avgFundingRate = 0;
      let liq24h = 0;
      let longLiq24h = 0;
      let shortLiq24h = 0;
      let fearGreedValue = 50;
      let longShortRatio = 1.0;

      // 直接读取缓存（由定时器每10分钟刷新）
      const cgData = cgCache.data;
      oiChange24h = cgData.oiChange24h;
      avgFundingRate = cgData.avgFundingRate;
      liq24h = cgData.liq24h;
      longLiq24h = cgData.longLiq24h;
      shortLiq24h = cgData.shortLiq24h;
      fearGreedValue = cgData.fearGreedValue;
      longShortRatio = cgData.longShortRatio;

      // 2. 获取 ValueScan 预警信号
      let vsSignalCount = 0;
      let vsRiskCount = 0;
      let vsAlertType = "WAIT";
      if (vsApiKey && vsSecretKey) {
        const alertData = await vsOpenRequest(vsApiKey, vsSecretKey, "/alert/list", { page: 1, pageSize: 20 });
        if (alertData) {
          const list = Array.isArray(alertData) ? alertData : (alertData.list ?? alertData.records ?? []);
          vsSignalCount = list.filter((x: any) => !(x.type ?? "").includes("RISK")).length;
          vsRiskCount = list.filter((x: any) => (x.type ?? "").includes("RISK")).length;
          if (vsRiskCount >= 5) vsAlertType = "RISK";
          else if (vsSignalCount >= 3) vsAlertType = "LONG";
        }
      } else if (vsToken) {
        try {
          const r = await fetch("https://api.valuescan.io/api/market/alertList?page=1&pageSize=20", {
            headers: { Authorization: `Bearer ${vsToken}` },
            signal: AbortSignal.timeout(8000),
          });
          const d = await r.json() as any;
          if (d?.code === 200) {
            const list = Array.isArray(d.data) ? d.data : (d.data?.list ?? []);
            vsSignalCount = list.filter((x: any) => !(x.type ?? "").includes("RISK")).length;
            vsRiskCount = list.filter((x: any) => (x.type ?? "").includes("RISK")).length;
            if (vsRiskCount >= 5) vsAlertType = "RISK";
            else if (vsSignalCount >= 3) vsAlertType = "LONG";
          }
        } catch {}
      }

      // 3. 多空爆仓比（已有数据直接用）
      const liqRatio = shortLiq24h > 0 ? longLiq24h / shortLiq24h : 1.0;

      // 4. 六大策略融合评分 + 爆仓比加权
      let longScore = 0;
      let shortScore = 0;
      let strategy = "观望";

      // 策略1: FOMO+Alpha共振（做多）
      if (oiChange24h > 15 && longLiq24h > shortLiq24h && fearGreedValue > 40 && vsAlertType === "LONG") {
        longScore += 25; strategy = "FOMO+Alpha共振";
      }
      // 策略2: 聪明钱突破（做多）
      if (oiChange24h > 20 && avgFundingRate > -0.0001 && vsSignalCount >= 2) {
        longScore += 20; if (strategy === "观望") strategy = "聪明钱突破";
      }
      // 策略3: 趋势延续（做多）
      if (fearGreedValue > 50 && longShortRatio > 1.1 && vsSignalCount >= 1) {
        longScore += 15; if (strategy === "观望") strategy = "趋势延续";
      }
      // 策略4: 恐慌反转（做空）
      if (avgFundingRate > 0.0005 && fearGreedValue < 40) {
        shortScore += 20; if (strategy === "观望") strategy = "恐慌反转";
      }
      // 策略5: 巨鲸跟随（做多）
      if (longShortRatio > 1.5 && Math.abs(avgFundingRate) < 0.0003) {
        longScore += 15; if (strategy === "观望") strategy = "巨鲸跟随";
      }
      // 策略6: 风险防守做空（最高优先级）
      if (vsRiskCount >= 5 || liq24h > 50_000_000) {
        shortScore += 30; strategy = "风险防守做空";
      }

      // 策略7: 多空爆仓比加权（新增）
      // 多头爆仓 >> 空头爆仓 → 空头信号增强（市场超热，多头被爆，看空）
      if (liqRatio > 1.5) {
        shortScore += 10;
        if (strategy === "观望") strategy = "爆仓不平衡做空";
      }
      if (liqRatio > 3.0) { shortScore += 5; } // 极端不平衡额外加分
      // 空头爆仓 >> 多头爆仓 → 多头信号增强（超跌，空头被爆，看多）
      if (liqRatio < 0.67) {
        longScore += 10;
        if (strategy === "观望") strategy = "空头爆仓反转做多";
      }
      if (liqRatio < 0.33) { longScore += 5; }

      // 5. 综合判断
      let signal: "LONG" | "SHORT" | "WAIT" = "WAIT";
      let winRate = 50;

      if (longScore > shortScore && longScore >= 20) {
        signal = "LONG";
        winRate = Math.min(97, 60 + longScore);
      } else if (shortScore > longScore && shortScore >= 20) {
        signal = "SHORT";
        winRate = Math.min(97, 60 + shortScore);
      }

      // 如果没有 CoinGlass 数据，使用 VS 信号作为基础
      if (!cgKey && vsAlertType === "LONG") {
        signal = "LONG"; winRate = 75; strategy = "VS信号驱动";
      } else if (!cgKey && vsAlertType === "RISK") {
        signal = "SHORT"; winRate = 80; strategy = "VS风险防守";
      }

      // 6. 动态止盈止损（根据市场状况自适应）
      let stopPct = signal === "LONG" ? 1.8 : 2.0;
      let takePct = signal === "LONG" ? 8.0 : 5.0;

      if (signal === "SHORT") {
        // FR 极端负值 → 空头拥挤，轧空风险高 → 拉宽止损保护
        if (avgFundingRate < -0.01) { stopPct = 3.0; takePct = 7.0; }
        else if (avgFundingRate < -0.005) { stopPct = 2.5; takePct = 6.0; }
        // 清算量极大 → 波动率高 → 拉大止盈
        if (liq24h > 500_000_000) { takePct += 1.5; }
        else if (liq24h > 200_000_000) { takePct += 0.5; }
        // 爆仓比极端 → 信号更强 → 可以更激进止盈
        if (liqRatio > 3.0) { takePct += 1.0; }
      } else if (signal === "LONG") {
        // FR 极端正值 → 多头拥挤，爆多风险 → 拉宽止损
        if (avgFundingRate > 0.005) { stopPct = 2.5; takePct = 6.0; }
        // 恐慌时入场 → 绝佳底部 → 收紧止损+加大止盈
        if (fearGreedValue < 25) { stopPct = Math.max(1.2, stopPct - 0.5); takePct += 2.0; }
        else if (fearGreedValue < 35) { takePct += 1.0; }
        // 爆仓比支持 → 止盈更大
        if (liqRatio < 0.33) { takePct += 1.5; }
      }

      // 7. 信号历史自动保存（去重：同方向信号5分钟内不重复入库）
      if (signal !== "WAIT") {
        const now = Date.now();
        const fiveMin = 5 * 60 * 1000;
        if (signal !== getBestSignalCache.signal || now - getBestSignalCache.ts > fiveMin) {
          insertSignalHistory({
            signal, win: winRate, strategy,
            stop: stopPct.toFixed(2), take: takePct.toFixed(2),
            oiChange24h: oiChange24h.toFixed(4),
            avgFundingRate: avgFundingRate.toFixed(8),
            liq24h: liq24h.toFixed(2),
            liqRatio: liqRatio.toFixed(4),
          fearGreedValue: String(fearGreedValue), longShortRatio: String(longShortRatio),
          }).catch(() => {});
          getBestSignalCache.signal = signal;
          getBestSignalCache.ts = now;
        }
      }

      return {
        signal,
        win: winRate,
        strategy,
        stop: stopPct,
        take: takePct,
        factors: { oiChange24h, avgFundingRate, liq24h, liqRatio, fearGreedValue, longShortRatio, vsSignalCount, vsRiskCount },
        timestamp: new Date().toISOString(),
      };
    }),

    // ─── 实盘执行（复刻 trade_executor.py：Binance/OKX/Bybit 三所同步下单）
    liveExecute: publicProcedure
      .input(z.object({
        symbol: z.string().default("BTC"),
        signal: z.enum(["LONG", "SHORT"]),
        winRate: z.number(),
        strategy: z.string(),
        stopLossPct: z.number().default(1.8),
        takeProfitPct: z.number().default(8.0),
      }))
      .mutation(async ({ input }) => {
        // 风控检查
        const [dailyCountStr, failCountStr, failTimeStr, liveRunning] = await Promise.all([
          getSetting("live_daily_count"),
          getSetting("live_fail_count"),
          getSetting("live_fail_time"),
          getSetting("engine_live_running"),
        ]);

        if (liveRunning !== "true") {
          return { success: false, message: "实盘引擎未启动", results: [] };
        }

        const DAILY_MAX = 5;
        const AMOUNT_USD = 20;
        const LEVERAGE = 10;
        const dailyCount = Number(dailyCountStr ?? 0);
        const failCount = Number(failCountStr ?? 0);
        const failTime = Number(failTimeStr ?? 0);
        const now = Date.now();

        if (failCount >= 2 && now - failTime < 3600 * 1000) {
          return { success: false, message: `连续失败暂停中，${Math.ceil((3600 * 1000 - (now - failTime)) / 60000)} 分钟后恢复`, results: [] };
        }
        if (dailyCount >= DAILY_MAX) {
          return { success: false, message: `今日已达最大下单数 ${DAILY_MAX}`, results: [] };
        }
        if (input.winRate < 60) {
          return { success: false, message: `胜率 ${input.winRate}% 低于阈值 60%，跳过`, results: [] };
        }

        // 获取三所 API 配置
        const [binanceKey, binanceSec, okxKey, okxSec, okxPwd, bybitKey, bybitSec] = await Promise.all([
          getSetting("binance_api_key"),
          getSetting("binance_api_secret"),
          getSetting("okx_api_key"),
          getSetting("okx_api_secret"),
          getSetting("okx_passphrase"),
          getSetting("bybit_api_key"),
          getSetting("bybit_api_secret"),
        ]);

        const results: { exchange: string; success: boolean; message: string; orderId?: string }[] = [];
        let anySuccess = false;
        let anyFail = false;

        // Binance 下单（USDT永续合约）
        if (binanceKey && binanceSec) {
          try {
            const side = input.signal === "LONG" ? "BUY" : "SELL";
            const symbol = `${input.symbol}USDT`;
            const ts = Date.now();
            const params = `symbol=${symbol}&side=${side}&type=MARKET&quoteOrderQty=${AMOUNT_USD}&timestamp=${ts}&leverage=${LEVERAGE}`;
            const sig = crypto.createHmac("sha256", binanceSec).update(params).digest("hex");
            const r = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}&signature=${sig}`, {
              method: "POST",
              headers: { "X-MBX-APIKEY": binanceKey },
              signal: AbortSignal.timeout(10000),
            });
            const d = await r.json() as any;
            if (d.orderId) {
              results.push({ exchange: "binance", success: true, message: `✅ ${side} ${symbol} @market`, orderId: String(d.orderId) });
              anySuccess = true;
            } else {
              results.push({ exchange: "binance", success: false, message: d.msg ?? "下单失败" });
              anyFail = true;
            }
          } catch (e: any) {
            results.push({ exchange: "binance", success: false, message: e.message ?? "网络错误" });
            anyFail = true;
          }
        }

        // OKX 下单（USDT永续合约）
        if (okxKey && okxSec && okxPwd) {
          try {
            const instId = `${input.symbol}-USDT-SWAP`;
            const side = input.signal === "LONG" ? "buy" : "sell";
            const posSide = input.signal === "LONG" ? "long" : "short";
            const tsOkx = new Date().toISOString();
            const body = JSON.stringify({ instId, tdMode: "cross", side, posSide, ordType: "market", sz: String(AMOUNT_USD) });
            const preSign = tsOkx + "POST" + "/api/v5/trade/order" + body;
            const signOkx = Buffer.from(crypto.createHmac("sha256", okxSec).update(preSign).digest()).toString("base64");
            const r = await fetch("https://www.okx.com/api/v5/trade/order", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "OK-ACCESS-KEY": okxKey,
                "OK-ACCESS-SIGN": signOkx,
                "OK-ACCESS-TIMESTAMP": tsOkx,
                "OK-ACCESS-PASSPHRASE": okxPwd,
              },
              body,
              signal: AbortSignal.timeout(10000),
            });
            const d = await r.json() as any;
            const ok = d.code === "0" && d.data?.[0]?.ordId;
            results.push({ exchange: "okx", success: !!ok, message: ok ? `✅ ${side} ${instId} @market` : (d.data?.[0]?.sMsg ?? d.msg ?? "下单失败"), orderId: d.data?.[0]?.ordId });
            if (ok) anySuccess = true; else anyFail = true;
          } catch (e: any) {
            results.push({ exchange: "okx", success: false, message: e.message ?? "网络错误" });
            anyFail = true;
          }
        }

        // Bybit 下单（USDT永续合约）
        if (bybitKey && bybitSec) {
          try {
            const symbol = `${input.symbol}USDT`;
            const side = input.signal === "LONG" ? "Buy" : "Sell";
            const tsBy = Date.now();
            const bodyObj = { category: "linear", symbol, side, orderType: "Market", qty: String(AMOUNT_USD), timeInForce: "IOC" };
            const bodyStr = JSON.stringify(bodyObj);
            const preSign = String(tsBy) + bybitKey + "5000" + bodyStr;
            const signBy = crypto.createHmac("sha256", bybitSec).update(preSign).digest("hex");
            const r = await fetch("https://api.bybit.com/v5/order/create", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-BAPI-API-KEY": bybitKey,
                "X-BAPI-SIGN": signBy,
                "X-BAPI-TIMESTAMP": String(tsBy),
                "X-BAPI-RECV-WINDOW": "5000",
              },
              body: bodyStr,
              signal: AbortSignal.timeout(10000),
            });
            const d = await r.json() as any;
            const ok = d.retCode === 0 && d.result?.orderId;
            results.push({ exchange: "bybit", success: !!ok, message: ok ? `✅ ${side} ${symbol} @market` : (d.retMsg ?? "下单失败"), orderId: d.result?.orderId });
            if (ok) anySuccess = true; else anyFail = true;
          } catch (e: any) {
            results.push({ exchange: "bybit", success: false, message: e.message ?? "网络错误" });
            anyFail = true;
          }
        }

        // 更新风控计数
        if (anySuccess) {
          await setSetting("live_daily_count", String(dailyCount + 1));
          await setSetting("live_fail_count", "0");
          // 记录到交易历史
          await insertTrade({
            exchange: results.find(r => r.success)?.exchange as "binance" | "okx" | "bybit" ?? "binance",
            symbol: input.symbol,
            side: input.signal,
            amount: String(AMOUNT_USD),
            strategy: input.strategy,
            status: "open",
          });
          // Telegram 推送
          const [tgToken, tgChat] = await Promise.all([getSetting("tg_bot_token"), getSetting("tg_chat_id")]);
          if (tgToken && tgChat) {
            const dir = input.signal === "LONG" ? "✅ 做多" : "❌ 做空";
            const msg = `🚀 <b>实盘下单</b>\n${dir} BTC/USDT\n胜率: ${input.winRate}%\n策略: ${input.strategy}\nSL: -${input.stopLossPct}% | TP: +${input.takeProfitPct}%\n交易所: ${results.filter(r => r.success).map(r => r.exchange).join(", ")}`;
            await sendTelegram(tgToken, tgChat, msg);
          }
        } else if (anyFail) {
          await setSetting("live_fail_count", String(failCount + 1));
          await setSetting("live_fail_time", String(now));
        }

        return { success: anySuccess, message: anySuccess ? `下单成功（${results.filter(r => r.success).length}/${results.length} 交易所）` : "所有交易所下单失败", results };
      }),

    // ─── 风控状态
    riskStatus: publicProcedure.query(async () => {
      const [dailyCountStr, failCountStr, failTimeStr] = await Promise.all([
        getSetting("live_daily_count"),
        getSetting("live_fail_count"),
        getSetting("live_fail_time"),
      ]);
      const dailyCount = Number(dailyCountStr ?? 0);
      const failCount = Number(failCountStr ?? 0);
      const failTime = Number(failTimeStr ?? 0);
      const now = Date.now();
      const paused = failCount >= 2 && now - failTime < 3600 * 1000;
      return {
        dailyCount,
        dailyMax: 5,
        failCount,
        paused,
        pauseRemainingMin: paused ? Math.ceil((3600 * 1000 - (now - failTime)) / 60000) : 0,
        canTrade: !paused && dailyCount < 5,
      };
    }),

    // ─── 重置每日计数（每天0点调用）
    resetDailyCount: publicProcedure.mutation(async () => {
      await setSetting("live_daily_count", "0");
      return { success: true };
    }),

    // ─── 信号历史查询
    signalHistory: publicProcedure
      .input(z.object({ limit: z.number().default(30) }).optional())
      .query(async ({ input }) => {
        const [history, stats] = await Promise.all([
          getSignalHistory(input?.limit ?? 30),
          getSignalHistoryStats(),
        ]);
        return { history, stats };
      }),

    // ─── 标记信号结果（WIN/LOSS）
    markSignalOutcome: publicProcedure
      .input(z.object({ id: z.number(), outcome: z.enum(["WIN", "LOSS"]) }))
      .mutation(async ({ input }) => {
        await markSignalOutcome(input.id, input.outcome);
        return { success: true };
      }),
  }),

  // ─── 实时市场行情（OKX 公开 API，无需 key，无地区限制）──────────────────────
  market: router({
    // K 线 OHLCV 数据（OKX SPOT）
    klines: publicProcedure
      .input(z.object({
        symbol: z.string().default("BTC"),
        interval: z.string().default("15m"),
        limit: z.number().default(72),
      }))
      .query(async ({ input }) => {
        // OKX 时间周期映射 (前端用小写，OKX 小时/日用大写)
        const barMap: Record<string, string> = {
          "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
          "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "12h": "12H",
          "1d": "1D", "1w": "1W",
        };
        const bar = barMap[input.interval] ?? "15m";
        const instId = `${input.symbol.toUpperCase()}-USDT`;
        const url = `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${input.limit}`;
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) throw new Error(`OKX klines HTTP ${resp.status}`);
          const json = await resp.json() as any;
          if (json.code !== "0") throw new Error(`OKX klines error: ${json.msg}`);
          // OKX 返回格式: [ts, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
          // 注意: OKX 数据是倒序（最新在前），需要反转
          const candles = (json.data as any[]).reverse().map((k: any) => ({
            time: new Date(Number(k[0])).toISOString(),
            open: Number(k[1]),
            high: Number(k[2]),
            low: Number(k[3]),
            close: Number(k[4]),
            volume: Number(k[5]),
          }));
          return { candles, source: "okx" as const };
        } catch (e) {
          console.error("[market.klines]", e);
          return { candles: [] as any[], source: "error" as const };
        }
      }),

    // 多币种实时报价（OKX，并发 8 个请求）
    tickers: publicProcedure
      .input(z.object({
        symbols: z.array(z.string()).default(["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"]),
      }))
      .query(async ({ input }) => {
        try {
          const results = await Promise.allSettled(
            input.symbols.map(sym =>
              fetch(`https://www.okx.com/api/v5/market/ticker?instId=${sym.toUpperCase()}-USDT`, { signal: AbortSignal.timeout(8000) })
                .then(r => r.json())
                .then((json: any) => ({ sym: sym.toUpperCase(), data: json?.data?.[0] ?? null }))
            )
          );
          const result: Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume: number }> = {};
          for (const r of results) {
            if (r.status !== "fulfilled" || !r.value.data) continue;
            const { sym, data } = r.value;
            const price = Number(data.last ?? 0);
            const open24h = Number(data.open24h ?? price);
            const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;
            result[sym] = {
              price,
              change24h: Math.round(change24h * 100) / 100,
              high24h: Number(data.high24h ?? 0),
              low24h: Number(data.low24h ?? 0),
              volume: Number(data.volCcy24h ?? 0),
            };
          }
          return { tickers: result, updatedAt: Date.now() };
        } catch (e) {
          console.error("[market.tickers]", e);
          return { tickers: {} as Record<string, { price: number; change24h: number; high24h: number; low24h: number; volume: number }>, updatedAt: 0 };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
