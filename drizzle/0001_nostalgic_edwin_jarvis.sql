CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `paper_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`totalBalance` decimal(18,2) NOT NULL,
	`availableBalance` decimal(18,2) NOT NULL,
	`unrealizedPnl` decimal(18,2) DEFAULT '0',
	`dailyPnl` decimal(18,2) DEFAULT '0',
	`positionCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exchange` varchar(20) NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`side` enum('LONG','SHORT') NOT NULL,
	`size` decimal(18,8) NOT NULL,
	`entryPrice` decimal(18,8) NOT NULL,
	`markPrice` decimal(18,8),
	`unrealizedPnl` decimal(18,8) DEFAULT '0',
	`leverage` int DEFAULT 1,
	`stopLoss` decimal(18,8),
	`takeProfit` decimal(18,8),
	`status` enum('open','closed') DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('FOMO','ALPHA','RISK','LONG','SHORT') NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`score` int DEFAULT 0,
	`source` varchar(50) DEFAULT 'manual',
	`strategy` varchar(100),
	`rsi` decimal(8,2),
	`ema` decimal(8,2),
	`fearGreed` int,
	`longShortRatio` decimal(8,4),
	`fundingRate` decimal(10,6),
	`processed` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameEn` varchar(100),
	`description` text,
	`enabled` boolean DEFAULT false,
	`winRate` int DEFAULT 0,
	`totalTrades` int DEFAULT 0,
	`profitFactor` decimal(8,2) DEFAULT '0',
	`config` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `strategies_id` PRIMARY KEY(`id`),
	CONSTRAINT `strategies_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`exchange` enum('binance','okx','bybit','paper') NOT NULL,
	`symbol` varchar(20) NOT NULL,
	`side` enum('LONG','SHORT') NOT NULL,
	`amount` decimal(18,8) NOT NULL,
	`entryPrice` decimal(18,8),
	`exitPrice` decimal(18,8),
	`stopLoss` decimal(18,8),
	`takeProfit` decimal(18,8),
	`pnl` decimal(18,8) DEFAULT '0',
	`status` enum('open','closed','cancelled') DEFAULT 'open',
	`strategy` varchar(100),
	`winRate` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
