/**
 * ValueScan 路由测试
 * 覆盖三条路径：open_api 成功 / token 回退 / unavailable 降级
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── 辅助：创建公共 context ───────────────────────────────────────────────────
function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {} as any,
    res: {} as any,
  };
}

// ─── 辅助：mock getSetting ────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getSetting: vi.fn(),
    setSetting: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({}),
  };
});

import { getSetting } from "./db";
const mockGetSetting = getSetting as ReturnType<typeof vi.fn>;

// ─── 辅助：mock global fetch ──────────────────────────────────────────────────
const originalFetch = global.fetch;

describe("ValueScan Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ─── tokenStatus ─────────────────────────────────────────────────────────
  describe("tokenStatus", () => {
    it("returns hasToken=false when no token stored", async () => {
      mockGetSetting.mockResolvedValue(null);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.tokenStatus();
      expect(result.hasToken).toBe(false);
      expect(result.isExpired).toBe(true);
    });

    it("returns hasToken=true and isExpired=false for fresh token", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_token") return "eyJhbGciOiJIUzUxMiJ9.test";
        if (key === "vs_token_updated_at") return String(Date.now() - 1000); // 1 second ago
        return null;
      });
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.tokenStatus();
      expect(result.hasToken).toBe(true);
      expect(result.isExpired).toBe(false);
    });

    it("returns isExpired=true for token older than 24h", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_token") return "eyJhbGciOiJIUzUxMiJ9.old";
        if (key === "vs_token_updated_at") return String(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
        return null;
      });
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.tokenStatus();
      expect(result.hasToken).toBe(true);
      expect(result.isExpired).toBe(true);
    });
  });

  // ─── openApiStatus ────────────────────────────────────────────────────────
  describe("openApiStatus", () => {
    it("returns hasKeys=false when no API keys stored", async () => {
      mockGetSetting.mockResolvedValue(null);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.openApiStatus();
      expect(result.hasKeys).toBe(false);
      expect(result.apiAvailable).toBe(false);
    });

    it("returns apiAvailable=true when Open API responds successfully", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_api_key") return "ak_testkey";
        if (key === "vs_secret_key") return "sk_testsecret";
        return null;
      });
      // Mock fetch to return success
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 0, data: { list: [], total: 0 } }),
      } as any);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.openApiStatus();
      expect(result.hasKeys).toBe(true);
      expect(result.apiAvailable).toBe(true);
    });

    it("returns apiAvailable=false when Open API returns error code", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_api_key") return "ak_testkey";
        if (key === "vs_secret_key") return "sk_testsecret";
        return null;
      });
      // Mock fetch to return error (timestamp expired)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 20012, msg: "Timestamp expired" }),
      } as any);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.openApiStatus();
      expect(result.hasKeys).toBe(true);
      expect(result.apiAvailable).toBe(false);
    });
  });

  // ─── opportunities: 三条路径 ─────────────────────────────────────────────
  describe("opportunities", () => {
    it("path 1: returns open_api data when Open API succeeds", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_api_key") return "ak_testkey";
        if (key === "vs_secret_key") return "sk_testsecret";
        return null;
      });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            list: [{ symbol: "BTC", score: 90, reason: "Test reason" }],
          },
        }),
      } as any);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.opportunities();
      expect(result.source).toBe("open_api");
      expect(result.opportunities.length).toBeGreaterThan(0);
      expect(result.opportunities[0].symbol).toBe("BTC");
    });

    it("path 2: falls back to token when Open API fails", async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === "vs_api_key") return "ak_testkey";
        if (key === "vs_secret_key") return "sk_testsecret";
        if (key === "vs_token") return "eyJhbGciOiJIUzUxMiJ9.test";
        return null;
      });
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // Open API calls fail
          return { ok: true, json: async () => ({ code: 20012, msg: "Timestamp expired" }) };
        }
        // Token call succeeds
        return {
          ok: true,
          json: async () => ({
            code: 200,
            data: { list: [{ symbol: "ETH", score: 85, reason: "Token data" }] },
          }),
        };
      });
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.opportunities();
      expect(result.source).toBe("token");
    });

    it("path 3: returns demo data when both Open API and token fail", async () => {
      mockGetSetting.mockResolvedValue(null); // No keys, no token
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.opportunities();
      expect(result.source).toBe("demo");
      expect(result.opportunities.length).toBeGreaterThan(0);
      expect(result.risks.length).toBeGreaterThan(0);
    });
  });

  // ─── largeTransactions: demo fallback ────────────────────────────────────
  describe("largeTransactions", () => {
    it("returns demo data with correct structure when no keys configured", async () => {
      mockGetSetting.mockResolvedValue(null);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.largeTransactions();
      expect(result.source).toBe("demo");
      expect(result.transactions.length).toBeGreaterThan(0);
      result.transactions.forEach((t) => {
        expect(t).toHaveProperty("symbol");
        expect(t).toHaveProperty("amount");
        expect(["IN", "OUT"]).toContain(t.direction);
        expect(t).toHaveProperty("exchange");
        expect(t).toHaveProperty("time");
      });
    });
  });

  // ─── socialSentiment: demo fallback ──────────────────────────────────────
  describe("socialSentiment", () => {
    it("returns demo data with score in 0-100 range", async () => {
      mockGetSetting.mockResolvedValue(null);
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.socialSentiment();
      expect(result.source).toBe("demo");
      result.sentiment.forEach((s) => {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s).toHaveProperty("symbol");
        expect(s).toHaveProperty("label");
      });
    });
  });

  // ─── setOpenApiKeys ───────────────────────────────────────────────────────
  describe("setOpenApiKeys", () => {
    it("saves API keys and returns success", async () => {
      const { setSetting } = await import("./db");
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.valueScan.setOpenApiKeys({
        apiKey: "ak_testkey123",
        secretKey: "sk_testsecret456",
      });
      expect(result.success).toBe(true);
      expect(setSetting).toHaveBeenCalledWith("vs_api_key", "ak_testkey123");
      expect(setSetting).toHaveBeenCalledWith("vs_secret_key", "sk_testsecret456");
    });
  });
});
