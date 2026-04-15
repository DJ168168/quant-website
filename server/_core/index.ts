import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getSetting } from "../db";
import { startCGRefreshScheduler, pushMarketAnalysis, pushVSBtcEthAnalysis } from "../routers";
import { loginValueScan } from "../vsAuth";
import { appRouter as tradingRouter } from "../routers";

// ─── VS Token 自动续期 ────────────────────────────────────────────────────────
// 每4小时刷新一次（VS bearer token 有效期不稳定，单会话机制）
const VS_TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4小时

async function autoRefreshVSToken() {
  try {
    const updatedAt = await getSetting("vs_token_updated_at");
    const now = Date.now();
    const lastRefresh = updatedAt ? Number(updatedAt) : 0;
    const shouldRefresh = now - lastRefresh > VS_TOKEN_REFRESH_INTERVAL_MS;
    if (shouldRefresh) {
      console.log("[VS AutoRefresh] Token expired or not set, refreshing...");
      await loginValueScan();
    } else {
      const remainingHours = Math.round((VS_TOKEN_REFRESH_INTERVAL_MS - (now - lastRefresh)) / 3600000);
      console.log(`[VS AutoRefresh] Token still valid, next refresh in ~${remainingHours}h`);
    }
  } catch (e) {
    console.error("[VS AutoRefresh] Error:", e);
  }
}

function startVSTokenAutoRefresh() {
  const isDev = process.env.NODE_ENV === "development";
  // 启动时立即强制刷新（5秒后）确保 token 是最新的
  setTimeout(async () => {
    console.log("[VS AutoRefresh] Startup check...");
    await Promise.race([
      autoRefreshVSToken(),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
  }, 5000);
  if (!isDev) {
    // 生产环境：每小时检查，每4小时真正刷新
    setInterval(autoRefreshVSToken, 60 * 60 * 1000);
    console.log("[VS AutoRefresh] Auto-refresh scheduler started (prod, every 4h)");
  } else {
    console.log("[VS AutoRefresh] Dev mode: startup check only, no interval (prod manages token)");
  }
}

// ─── 大盘分析 Telegram 定时推送（每15分钟，24小时不中断）────────────────────
const MARKET_PUSH_INTERVAL_MS = 15 * 60 * 1000; // 15 分钟
const PAPER_CYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

function startMarketAnalysisScheduler() {
  // 启动后等 CoinGlass 缓存预热（30秒）再发第一次
  setTimeout(async () => {
    console.log("[MarketPush] Sending startup analysis...");
    await pushMarketAnalysis();
    // VS BTC/ETH 分析延迟 5 秒后发送（避免同时发两条）
    setTimeout(() => pushVSBtcEthAnalysis(), 5000);
  }, 30 * 1000);
  // 之后每 15 分钟：先发大盘指标，5秒后再发 VS AI 解析
  setInterval(async () => {
    console.log("[MarketPush] Scheduled push triggered");
    await pushMarketAnalysis();
    setTimeout(() => pushVSBtcEthAnalysis(), 5000);
  }, MARKET_PUSH_INTERVAL_MS);
  console.log("[MarketPush] Scheduler started — CG + VS BTC/ETH every 15min, 24/7");
}

function startPaperTradingScheduler() {
  setTimeout(async () => {
    try {
      await tradingRouter.createCaller({} as any).paper.runCycle();
      console.log("[PaperTrade] Startup cycle executed");
    } catch (e) {
      console.error("[PaperTrade] Startup cycle failed:", e);
    }
  }, 15000);
  setInterval(async () => {
    try {
      await tradingRouter.createCaller({} as any).paper.runCycle();
      console.log("[PaperTrade] Scheduled cycle executed");
    } catch (e) {
      console.error("[PaperTrade] Scheduled cycle failed:", e);
    }
  }, PAPER_CYCLE_INTERVAL_MS);
  console.log("[PaperTrade] Scheduler started — every 5min");
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── 启动时从数据库预加载 API Key 到环境变量 ────────────────────────────────
async function preloadApiKeysFromDB() {
  const keyMap: Record<string, string> = {
    COINGLASS_API_KEY: "coinglass_api_key",
    VS_API_KEY: "vs_api_key",
    VS_SECRET_KEY: "vs_secret_key",
  };
  for (const [envKey, dbKey] of Object.entries(keyMap)) {
    if (!process.env[envKey]) {
      const val = await getSetting(dbKey);
      if (val) {
        process.env[envKey] = val;
        console.log(`[ApiKeys] Loaded ${envKey} from DB`);
      }
    }
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    // 从数据库加载 API Keys 到环境变量（dev 环境补充 env 文件中没有的 key）
    await preloadApiKeysFromDB();
    // 启动 VS Token 自动续期
    startVSTokenAutoRefresh();
    // 启动 CoinGlass 数据定时刷新调度器
    startCGRefreshScheduler();
    // 启动大盘分析 Telegram 定时推送（每15分钟）
    startMarketAnalysisScheduler();
    // 启动模拟盘自动循环（每5分钟）
    startPaperTradingScheduler();
  });
}

startServer().catch(console.error);
