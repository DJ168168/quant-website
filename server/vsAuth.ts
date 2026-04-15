import { getSetting, setSetting } from "./db";

export const VS_EMAIL = "mc678906@qq.com";
export const VS_PASSWORD = "dj168168168~";

export async function loginValueScan(): Promise<string | null> {
  try {
    const resp = await fetch("https://api.valuescan.io/api/authority/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneOrEmail: VS_EMAIL, code: VS_PASSWORD, loginTypeEnum: 2, endpointEnum: "WEB" }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await resp.json() as any;
    if (data?.code === 200) {
      const token = data.data?.account_token;
      if (token) {
        await setSetting("vs_token", token);
        await setSetting("vs_token_updated_at", String(Date.now()));
        console.log("[VS Auth] Token refreshed and saved");
        return token;
      }
    }
    console.warn("[VS Auth] Login failed, code:", data?.code, "msg:", JSON.stringify(data?.msg ?? "").slice(0, 100));
  } catch (e) {
    console.error("[VS Auth] Login error:", e);
  }
  return null;
}

export async function getVSToken(): Promise<string | null> {
  return getSetting("vs_token");
}
