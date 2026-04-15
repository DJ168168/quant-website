import mysql from "mysql2/promise";
const dbUrl = process.env.DATABASE_URL;

const connection = await mysql.createConnection(dbUrl);

const strategies = [
  ["FOMO+Alpha 共振", "FOMO Alpha Resonance", "捕捉 FOMO 热度与 Alpha 强度同时共振的高质量信号，适合短线追涨与趋势加速阶段。", 87, "2.4"],
  ["聪明钱突破", "Smart Money Breakout", "追踪大资金流入方向，在关键阻力位突破时跟随聪明钱方向入场。", 82, "2.1"],
  ["趋势延续", "Trend Continuation", "识别主趋势中的回调低点，在趋势延续时顺势加仓，适合中线持仓策略。", 79, "1.9"],
  ["恐慌反转", "Panic Reversal", "在市场极度恐慌（恐贪指数 < 25）时逆向布局，捕捉超卖反弹机会。", 76, "1.8"],
  ["巨鲸跟随", "Whale Following", "监控链上大额转账与交易所大额买单，跟随巨鲸资金流向进行交易。", 84, "2.2"],
  ["风险防守做空", "Risk Defense Short", "在高风险信号聚集时启动防守性做空，对冲多头持仓风险，保护账户安全。", 73, "1.6"],
];

try {
  for (const [name, nameEn, desc, winRate, pf] of strategies) {
    await connection.execute(
      `INSERT INTO strategies (name, nameEn, description, enabled, winRate, totalTrades, profitFactor)
       VALUES (?, ?, ?, false, ?, 0, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`,
      [name, nameEn, desc, winRate, pf]
    );
  }
  console.log("✅ 策略数据初始化完成");
} catch (e) {
  console.error("❌ 失败:", e.message);
} finally {
  await connection.end();
}
