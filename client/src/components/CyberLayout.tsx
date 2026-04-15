import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Zap, Activity, BarChart2, TrendingUp,
  Database, Settings, MessageSquare, BookOpen, Target,
  Shield, Cpu, Radio, ChevronDown, ChevronRight, Menu, X,
  LineChart
} from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "总览",
    items: [
      { label: "控制台", path: "/", icon: <LayoutDashboard size={13} /> },
      { label: "信号控制台", path: "/signals", icon: <Zap size={13} /> },
      { label: "共振引擎", path: "/resonance", icon: <Radio size={13} /> },
    ],
  },
  {
    label: "策略与交易",
    items: [
      { label: "策略引擎", path: "/strategies", icon: <Cpu size={13} /> },
      { label: "模拟交易", path: "/paper", icon: <Activity size={13} /> },
      { label: "实盘交易", path: "/live", icon: <Target size={13} /> },
      { label: "交易记录", path: "/trades", icon: <BookOpen size={13} /> },
    ],
  },
  {
    label: "数据面板",
    items: [
      { label: "ValueScan", path: "/valuescan", icon: <Database size={13} /> },
      { label: "CoinGlass", path: "/coinglass", icon: <LineChart size={13} /> },
      { label: "市场行情", path: "/market", icon: <BarChart2 size={13} /> },
      { label: "情绪分析", path: "/sentiment", icon: <TrendingUp size={13} /> },
    ],
  },
  {
    label: "系统配置",
    items: [
      { label: "Telegram 推送", path: "/telegram", icon: <MessageSquare size={13} /> },
      { label: "系统设置", path: "/settings", icon: <Settings size={13} /> },
    ],
  },
];

export default function CyberLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleGroup = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path: string) => {
    if (path === "/") return location === "/";
    return location.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.07 0.01 240)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative z-50 lg:z-auto flex flex-col h-full transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{
          width: "220px",
          minWidth: "220px",
          background: "oklch(0.09 0.012 240)",
          borderRight: "1px solid oklch(0.85 0.28 145 / 0.2)",
        }}
      >
        {/* Logo */}
        <div className="p-4 border-b" style={{ borderColor: "oklch(0.85 0.28 145 / 0.2)" }}>
          <div className="text-xs tracking-widest mb-1" style={{ color: "oklch(0.55 0.04 220)" }}>
            CYBER QUANT TERMINAL
          </div>
          <div
            className="text-lg font-bold"
            style={{
              fontFamily: "'Orbitron', monospace",
              color: "oklch(0.85 0.28 145)",
              textShadow: "0 0 10px oklch(0.85 0.28 145 / 0.6)",
            }}
          >
            勇少交易之王
          </div>
          <div className="text-xs mt-1" style={{ color: "oklch(0.55 0.04 220)" }}>
            赛博朋克量化交易系统
          </div>
        </div>

        {/* Status bar */}
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{ borderBottom: "1px solid oklch(0.85 0.28 145 / 0.1)", color: "oklch(0.55 0.04 220)" }}
        >
          <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          <span>Terminal Online</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navGroups.map(group => (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs tracking-widest uppercase"
                style={{ color: "oklch(0.45 0.04 220)" }}
              >
                <span>{group.label}</span>
                {collapsed[group.label]
                  ? <ChevronRight size={10} />
                  : <ChevronDown size={10} />
                }
              </button>
              {!collapsed[group.label] && (
                <div>
                  {group.items.map(item => (
                    <Link key={item.path} href={item.path}>
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-all duration-150 mb-0.5 rounded-sm ${isActive(item.path) ? "active-nav" : "hover-nav"}`}
                        style={isActive(item.path) ? {
                          color: "oklch(0.85 0.28 145)",
                          border: "1px dashed oklch(0.85 0.28 145 / 0.5)",
                          background: "oklch(0.85 0.28 145 / 0.08)",
                          textShadow: "0 0 6px oklch(0.85 0.28 145 / 0.5)",
                        } : {
                          color: "oklch(0.60 0.04 220)",
                          border: "1px solid transparent",
                        }}
                        onMouseEnter={e => {
                          if (!isActive(item.path)) {
                            (e.currentTarget as HTMLElement).style.color = "oklch(0.85 0.28 145)";
                            (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.85 0.28 145 / 0.3)";
                            (e.currentTarget as HTMLElement).style.background = "oklch(0.85 0.28 145 / 0.05)";
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive(item.path)) {
                            (e.currentTarget as HTMLElement).style.color = "oklch(0.60 0.04 220)";
                            (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                            (e.currentTarget as HTMLElement).style.background = "transparent";
                          }
                        }}
                        onClick={() => setSidebarOpen(false)}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 text-xs" style={{ borderTop: "1px solid oklch(0.85 0.28 145 / 0.1)", color: "oklch(0.35 0.04 220)" }}>
          ZHANGYONG.GURU
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{
            borderBottom: "1px solid oklch(0.85 0.28 145 / 0.15)",
            background: "oklch(0.08 0.01 240)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1"
              style={{ color: "oklch(0.85 0.28 145)" }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="text-xs tracking-widest" style={{ color: "oklch(0.45 0.04 220)" }}>
              ZHANGYONG.GURU
            </div>
            <div className="text-sm" style={{ color: "oklch(0.70 0.04 220)" }}>
              实时信号 · 策略执行 · 风险控制
            </div>
          </div>
          <div
            className="flex items-center gap-1.5 text-xs px-2 py-1"
            style={{
              color: "oklch(0.85 0.28 145)",
              border: "1px solid oklch(0.85 0.28 145 / 0.4)",
              borderRadius: "2px",
              textShadow: "0 0 6px oklch(0.85 0.28 145 / 0.5)",
            }}
          >
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            Terminal Online
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
