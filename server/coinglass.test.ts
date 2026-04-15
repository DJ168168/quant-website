import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("coinglass router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COINGLASS_API_KEY = "test-api-key";
  });

  it("fundingRate returns success when API key is set and API responds ok", async () => {
    const mockData = [{ symbol: "BTC", stablecoin_margin_list: [{ exchange: "Binance", funding_rate: 0.0001 }] }];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: "0", data: mockData }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.fundingRate({ symbol: "BTC" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("funding-rate/exchange-list"),
      expect.objectContaining({ headers: { "CG-API-KEY": "test-api-key" } })
    );
  });

  it("fundingRate returns error when no API key", async () => {
    delete process.env.COINGLASS_API_KEY;
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.fundingRate({ symbol: "BTC" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("No API key");
  });

  it("openInterest returns success with exchange list data", async () => {
    const mockData = [{ exchange: "All", symbol: "BTC", open_interest_usd: 50000000000 }];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: 0, data: mockData }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.openInterest({ symbol: "BTC" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
  });

  it("liquidationList returns coin liquidation data", async () => {
    const mockData = [
      { symbol: "BTC", liquidation_usd_24h: 80000000, long_liquidation_usd_24h: 60000000, short_liquidation_usd_24h: 20000000 }
    ];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: "0", data: mockData }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.liquidationList({});

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("fearGreed returns fear greed index history", async () => {
    const mockData = { data_list: [45, 50, 55], time_list: [1000, 2000, 3000], price_list: [30000, 31000, 32000] };
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: "0", data: mockData }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.fearGreed({ limit: 3 });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("data_list");
  });

  it("openInterestHistory returns OHLC history data", async () => {
    const mockData = [
      { time: 1700000000000, open: "50000000000", high: "51000000000", low: "49000000000", close: "50500000000" }
    ];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ code: 0, data: mockData }),
    });

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.coinglass.openInterestHistory({ symbol: "BTC", interval: "4h", limit: 1 });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
