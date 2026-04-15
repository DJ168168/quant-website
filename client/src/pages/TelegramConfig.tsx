import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MessageSquare, Send, Eye, EyeOff } from "lucide-react";

const C = { green: "oklch(0.85 0.28 145)", cyan: "oklch(0.80 0.22 200)", orange: "oklch(0.72 0.22 50)", pink: "oklch(0.72 0.28 340)", purple: "oklch(0.75 0.2 290)", dim: "oklch(0.55 0.04 220)" };

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs tracking-widest uppercase" style={{ color: C.dim }}>{title}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${C.green}40, transparent)` }} />
    </div>
  );
}

export default function TelegramConfig() {
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ botToken: "", chatId: "" });

  const { data: config, refetch } = trpc.telegram.getConfig.useQuery();
  const setConfig = trpc.telegram.setConfig.useMutation({
    onSuccess: () => { toast.success("✅ Telegram 配置已保存"); refetch(); },
    onError: () => toast.error("保存失败"),
  });
  const toggleNotif = trpc.telegram.setConfig.useMutation({
    onSuccess: () => { toast.success("通知设置已更新"); refetch(); },
  });
  const sendTest = trpc.telegram.test.useMutation({
    onSuccess: (d: { success: boolean; message: string }) => toast[d.success ? "success" : "error"](d.message),
  });

  return (
    <div style={{ fontFamily: "'Share Tech Mono', monospace" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Orbitron', monospace", color: C.green, textShadow: `0 0 10px ${C.green}60` }}>Telegram 推送</h1>
          <p className="text-xs mt-0.5" style={{ color: C.dim }}>实时交易通知 · 风险预警 · 每日报告</p>
        </div>
        <button onClick={() => sendTest.mutate()} disabled={sendTest.isPending || !config?.hasBotToken}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
          style={{ border: `1px solid ${C.cyan}60`, color: C.cyan, background: "transparent", borderRadius: 2, cursor: config?.hasBotToken ? "pointer" : "not-allowed", opacity: config?.hasBotToken ? 1 : 0.5 }}>
          <Send size={12} />{sendTest.isPending ? "发送中..." : "发送测试消息"}
        </button>
      </div>

      {/* Connection status */}
      <div className="cyber-card p-3 mb-4 flex items-center gap-3">
        <MessageSquare size={16} style={{ color: config?.hasBotToken ? C.green : C.dim }} />
        <div>
          <div className="text-xs" style={{ color: C.dim }}>连接状态</div>
          <div className="text-xs mt-0.5" style={{ color: config?.hasBotToken ? C.green : C.orange }}>
            {config?.hasBotToken ? "✓ Bot 已配置" : "⚠ 未配置 Bot Token"}
            {config?.chatId && <span style={{ color: C.dim }}> · Chat ID: {config.chatId}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Bot config */}
        <div className="cyber-card p-4">
          <SectionHeader title="Bot 配置" />
          <div className="space-y-3">
            <div>
              <label className="text-xs" style={{ color: C.dim }}>Bot Token</label>
              <div className="relative mt-1">
                <input
                  type={showToken ? "text" : "password"}
                  value={form.botToken}
                  onChange={e => setForm(p => ({ ...p, botToken: e.target.value }))}
                  className="cyber-input"
                  placeholder={config?.hasBotToken ? "••••••••（已配置）" : "输入 Bot Token"}
                  style={{ paddingRight: "2.5rem" }}
                />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: C.dim, background: "none", border: "none", cursor: "pointer" }}>
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="text-xs mt-1" style={{ color: C.dim }}>通过 @BotFather 创建 Bot 获取 Token</div>
            </div>
            <div>
              <label className="text-xs" style={{ color: C.dim }}>Chat ID</label>
              <input
                value={form.chatId}
                onChange={e => setForm(p => ({ ...p, chatId: e.target.value }))}
                className="cyber-input mt-1"
                placeholder={config?.chatId || "输入 Chat ID"}
              />
              <div className="text-xs mt-1" style={{ color: C.dim }}>通过 @userinfobot 获取你的 Chat ID</div>
            </div>
            <button
              onClick={() => setConfig.mutate(form)}
              disabled={setConfig.isPending || (!form.botToken && !form.chatId)}
              className="w-full py-2 text-xs"
              style={{ border: `1px solid ${C.green}60`, color: C.green, background: `${C.green}10`, borderRadius: 2, cursor: "pointer" }}>
              {setConfig.isPending ? "保存中..." : "保存配置"}
            </button>
          </div>
        </div>

        {/* Notification toggles */}
        <div className="cyber-card p-4">
          <SectionHeader title="通知开关" />
          <div className="space-y-3">
            {[
              { key: "notifyTrade" as const, label: "交易通知", desc: "开仓、平仓、止损止盈时推送", color: C.green },
              { key: "notifyRisk" as const, label: "风险预警", desc: "市场异常、大额清算时推送", color: C.orange },
              { key: "notifyDaily" as const, label: "每日报告", desc: "每日收盘后推送账户总结", color: C.cyan },
            ].map(item => (
              <div key={item.key} className="flex items-center justify-between p-3" style={{ background: "oklch(0.12 0.015 240)", borderRadius: 2 }}>
                <div>
                  <div className="text-xs font-bold" style={{ color: item.color }}>{item.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.dim }}>{item.desc}</div>
                </div>
                <button
                  onClick={() => toggleNotif.mutate({ [item.key]: !config?.[item.key] } as { notifyTrade?: boolean; notifyRisk?: boolean; notifyDaily?: boolean })}
                  style={{
                    width: 44, height: 22,
                    background: (config as Record<string, unknown>)?.[item.key] ? `${item.color}20` : "oklch(0.15 0.02 240)",
                    border: `1px solid ${(config as Record<string, unknown>)?.[item.key] ? item.color : "oklch(0.30 0.04 220)"}`,
                    borderRadius: 11,
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.2s",
                    boxShadow: config?.[item.key] ? `0 0 8px ${item.color}40` : "none",
                    flexShrink: 0,
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, width: 16, height: 16, borderRadius: "50%",
                    background: config?.[item.key] ? item.color : "oklch(0.40 0.04 220)",
                    left: config?.[item.key] ? 24 : 2,
                    transition: "all 0.2s",
                    boxShadow: config?.[item.key] ? `0 0 6px ${item.color}` : "none",
                  }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
