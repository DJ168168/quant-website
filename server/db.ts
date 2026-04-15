import { eq, desc, and, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { InsertUser, users, signals, trades, strategies, appSettings, paperSnapshots, positions, signalHistory, InsertSignal, InsertTrade, InsertSignalHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId || !ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export async function insertSignal(signal: InsertSignal) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(signals).values(signal).returning();
  return result[0] ?? null;
}

export async function getRecentSignals(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signals).orderBy(desc(signals.createdAt)).limit(limit);
}

export async function getSignalStats() {
  const db = await getDb();
  if (!db) return { fomo: 0, alpha: 0, risk: 0, total: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db.select({
    type: signals.type,
    count: sql<number>`count(*)`,
  }).from(signals).where(gte(signals.createdAt, today)).groupBy(signals.type);
  const stats = { fomo: 0, alpha: 0, risk: 0, total: 0 };
  for (const row of rows) {
    const c = Number(row.count);
    stats.total += c;
    if (row.type === 'FOMO') stats.fomo = c;
    else if (row.type === 'ALPHA') stats.alpha = c;
    else if (row.type === 'RISK') stats.risk = c;
  }
  return stats;
}

// ─── Trades ───────────────────────────────────────────────────────────────────

export async function insertTrade(trade: InsertTrade) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(trades).values(trade).returning();
  return result[0] ?? null;
}

export async function getRecentTrades(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trades).orderBy(desc(trades.createdAt)).limit(limit);
}

export async function getTodayTradeStats() {
  const db = await getDb();
  if (!db) return { count: 0, winCount: 0, totalPnl: 0, winRate: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await db.select().from(trades).where(
    and(gte(trades.createdAt, today), eq(trades.status, 'closed'))
  );
  const count = rows.length;
  const winCount = rows.filter(r => parseFloat(r.pnl ?? '0') > 0).length;
  const totalPnl = rows.reduce((sum, r) => sum + parseFloat(r.pnl ?? '0'), 0);
  const winRate = count > 0 ? Math.round((winCount / count) * 100) : 0;
  return { count, winCount, totalPnl, winRate };
}

// ─── Strategies ───────────────────────────────────────────────────────────────

export async function getAllStrategies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(strategies).orderBy(strategies.name);
}

export async function toggleStrategy(id: number, enabled: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(strategies).set({ enabled }).where(eq(strategies.id, id));
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appSettings).where(sql`${appSettings.key} = ANY(ARRAY[${sql.join(keys.map(k => sql`${k}`), sql`, `)}]::text[])`);
  return Object.fromEntries(rows.map(r => [r.key, r.value ?? '']));
}

// ─── Paper Snapshots ──────────────────────────────────────────────────────────

export async function savePaperSnapshot(data: { totalBalance: string; availableBalance: string; unrealizedPnl?: string; dailyPnl?: string; positionCount?: number }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(paperSnapshots).values(data).returning();
  return result[0] ?? null;
}

export async function getRecentSnapshots(limit = 48) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paperSnapshots).orderBy(desc(paperSnapshots.createdAt)).limit(limit);
}

export async function getLatestSnapshot() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(paperSnapshots).orderBy(desc(paperSnapshots.createdAt)).limit(1);
  return result[0] ?? null;
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function getOpenPositions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(positions).where(eq(positions.status, 'open'));
}

export async function insertPosition(data: {
  exchange: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  stopLoss?: string;
  takeProfit?: string;
  leverage?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(positions).values({
    exchange: data.exchange,
    symbol: data.symbol,
    side: data.side,
    size: data.size,
    entryPrice: data.entryPrice,
    markPrice: data.entryPrice,
    stopLoss: data.stopLoss,
    takeProfit: data.takeProfit,
    leverage: data.leverage ?? 1,
    status: 'open',
  }).returning();
  return result[0] ?? null;
}

export async function updatePositionMarkPrice(id: number, markPrice: string, unrealizedPnl: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(positions).set({ markPrice, unrealizedPnl }).where(eq(positions.id, id));
}

export async function closePosition(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(positions).set({ status: 'closed' }).where(eq(positions.id, id));
}

export async function markSignalProcessed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(signals).set({ processed: true }).where(eq(signals.id, id));
}

export async function getUnprocessedSignals(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signals)
    .where(eq(signals.processed, false))
    .orderBy(desc(signals.createdAt))
    .limit(limit);
}

// ─── Signal History ────────────────────────────────────────────────────────────

export async function insertSignalHistory(data: InsertSignalHistory) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(signalHistory).values(data).returning();
  return result[0] ?? null;
}

export async function getSignalHistory(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signalHistory).orderBy(desc(signalHistory.createdAt)).limit(limit);
}

export async function markSignalOutcome(id: number, outcome: "WIN" | "LOSS") {
  const db = await getDb();
  if (!db) return;
  await db.update(signalHistory).set({ outcome }).where(eq(signalHistory.id, id));
}

export async function getSignalHistoryStats() {
  const db = await getDb();
  if (!db) return {
    total: 0, wins: 0, losses: 0, pending: 0, realWinRate: 0,
    longWins: 0, longLosses: 0, longWinRate: 0,
    shortWins: 0, shortLosses: 0, shortWinRate: 0,
    profitLossRatio: 0, takeProfitHitRate: 0, stopLossHitRate: 0,
    maxConsecLosses: 0, maxDrawdown: 0, equityCurve: [] as number[],
  };
  const rows = await db.select().from(signalHistory).orderBy(desc(signalHistory.createdAt)).limit(200);
  const decided = rows.filter(r => r.outcome === "WIN" || r.outcome === "LOSS");
  const wins = decided.filter(r => r.outcome === "WIN").length;
  const losses = decided.filter(r => r.outcome === "LOSS").length;
  const pending = rows.filter(r => !r.outcome).length;
  const realWinRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : 0;

  // 多空分类胜率
  const longDecided = decided.filter(r => r.signal === "LONG");
  const longWins = longDecided.filter(r => r.outcome === "WIN").length;
  const longLosses = longDecided.filter(r => r.outcome === "LOSS").length;
  const longWinRate = longDecided.length > 0 ? Math.round((longWins / longDecided.length) * 100) : 0;
  const shortDecided = decided.filter(r => r.signal === "SHORT");
  const shortWins = shortDecided.filter(r => r.outcome === "WIN").length;
  const shortLosses = shortDecided.filter(r => r.outcome === "LOSS").length;
  const shortWinRate = shortDecided.length > 0 ? Math.round((shortWins / shortDecided.length) * 100) : 0;

  // 盈亏比：平均止盈 / 平均止损
  const avgTake = decided.length > 0
    ? decided.reduce((s, r) => s + Number(r.take ?? 5), 0) / decided.length : 5;
  const avgStop = decided.length > 0
    ? decided.reduce((s, r) => s + Number(r.stop ?? 2), 0) / decided.length : 2;
  const profitLossRatio = avgStop > 0 ? Math.round((avgTake / avgStop) * 100) / 100 : 0;

  // 止盈/止损命中率
  const takeProfitHitRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : 0;
  const stopLossHitRate = decided.length > 0 ? Math.round((losses / decided.length) * 100) : 0;

  // 最大连亏次数
  let maxConsecLosses = 0, curConsec = 0;
  for (const r of [...decided].reverse()) {
    if (r.outcome === "LOSS") { curConsec++; maxConsecLosses = Math.max(maxConsecLosses, curConsec); }
    else { curConsec = 0; }
  }

  // 权益曲线（每笔模拟 $1000 起，赢 +take%, 亏 -stop%）
  const equityCurve: number[] = [1000];
  let equity = 1000;
  for (const r of [...decided].reverse()) {
    const take = Number(r.take ?? 5) / 100;
    const stop = Number(r.stop ?? 2) / 100;
    equity = r.outcome === "WIN" ? equity * (1 + take) : equity * (1 - stop);
    equityCurve.push(Math.round(equity * 100) / 100);
  }

  // 最大回撤
  let peak = equityCurve[0], maxDrawdown = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    total: rows.length, wins, losses, pending, realWinRate,
    longWins, longLosses, longWinRate,
    shortWins, shortLosses, shortWinRate,
    profitLossRatio, takeProfitHitRate, stopLossHitRate,
    maxConsecLosses, maxDrawdown: Math.round(maxDrawdown * 10) / 10,
    equityCurve,
  };
}
