import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const signalTypeEnum = pgEnum("signal_type", ["FOMO", "ALPHA", "RISK", "LONG", "SHORT"]);
export const exchangeEnum = pgEnum("exchange_type", ["binance", "okx", "bybit", "paper"]);
export const tradeSideEnum = pgEnum("trade_side", ["LONG", "SHORT"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const positionStatusEnum = pgEnum("position_status", ["open", "closed"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const signals = pgTable("signals", {
  id: serial("id").primaryKey(),
  type: signalTypeEnum("type").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  score: integer("score").default(0),
  source: varchar("source", { length: 50 }).default("manual"),
  strategy: varchar("strategy", { length: 100 }),
  rsi: decimal("rsi", { precision: 8, scale: 2 }),
  ema: decimal("ema", { precision: 8, scale: 2 }),
  fearGreed: integer("fearGreed"),
  longShortRatio: decimal("longShortRatio", { precision: 8, scale: 4 }),
  fundingRate: decimal("fundingRate", { precision: 10, scale: 6 }),
  processed: boolean("processed").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  exchange: exchangeEnum("exchange").notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  side: tradeSideEnum("side").notNull(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 8 }),
  exitPrice: decimal("exitPrice", { precision: 18, scale: 8 }),
  stopLoss: decimal("stopLoss", { precision: 18, scale: 8 }),
  takeProfit: decimal("takeProfit", { precision: 18, scale: 8 }),
  pnl: decimal("pnl", { precision: 18, scale: 8 }).default("0"),
  status: tradeStatusEnum("status").default("open"),
  strategy: varchar("strategy", { length: 100 }),
  winRate: integer("winRate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

export const paperSnapshots = pgTable("paper_snapshots", {
  id: serial("id").primaryKey(),
  totalBalance: decimal("totalBalance", { precision: 18, scale: 2 }).notNull(),
  availableBalance: decimal("availableBalance", { precision: 18, scale: 2 }).notNull(),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 18, scale: 2 }).default("0"),
  dailyPnl: decimal("dailyPnl", { precision: 18, scale: 2 }).default("0"),
  positionCount: integer("positionCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaperSnapshot = typeof paperSnapshots.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

export const strategies = pgTable("strategies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  nameEn: varchar("nameEn", { length: 100 }),
  description: text("description"),
  enabled: boolean("enabled").default(false),
  winRate: integer("winRate").default(0),
  totalTrades: integer("totalTrades").default(0),
  profitFactor: decimal("profitFactor", { precision: 8, scale: 2 }).default("0"),
  config: jsonb("config"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Strategy = typeof strategies.$inferSelect;
export type InsertStrategy = typeof strategies.$inferInsert;

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  exchange: varchar("exchange", { length: 20 }).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  side: tradeSideEnum("side").notNull(),
  size: decimal("size", { precision: 18, scale: 8 }).notNull(),
  entryPrice: decimal("entryPrice", { precision: 18, scale: 8 }).notNull(),
  markPrice: decimal("markPrice", { precision: 18, scale: 8 }),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 18, scale: 8 }).default("0"),
  leverage: integer("leverage").default(1),
  stopLoss: decimal("stopLoss", { precision: 18, scale: 8 }),
  takeProfit: decimal("takeProfit", { precision: 18, scale: 8 }),
  status: positionStatusEnum("status").default("open"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Position = typeof positions.$inferSelect;

export const signalHistory = pgTable("signal_history", {
  id: serial("id").primaryKey(),
  signal: varchar("signal", { length: 10 }).notNull(),
  win: integer("win").default(0),
  strategy: varchar("strategy", { length: 100 }),
  stop: decimal("stop", { precision: 6, scale: 2 }),
  take: decimal("take", { precision: 6, scale: 2 }),
  oiChange24h: decimal("oiChange24h", { precision: 10, scale: 4 }),
  avgFundingRate: decimal("avgFundingRate", { precision: 14, scale: 8 }),
  liq24h: decimal("liq24h", { precision: 22, scale: 2 }),
  liqRatio: decimal("liqRatio", { precision: 8, scale: 4 }),
  fearGreedValue: integer("fearGreedValue"),
  longShortRatio: decimal("longShortRatio", { precision: 8, scale: 4 }),
  outcome: varchar("outcome", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SignalHistory = typeof signalHistory.$inferSelect;
export type InsertSignalHistory = typeof signalHistory.$inferInsert;
