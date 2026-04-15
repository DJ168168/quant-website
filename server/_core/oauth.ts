import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export function registerOAuthRoutes(app: Express) {
  // Auto-login route for personal trading console - no OAuth needed
  app.get("/api/oauth/login", async (req: Request, res: Response) => {
    try {
      const sessionToken = await sdk.getOwnerSessionToken();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Auth] Auto-login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Keep callback route for compatibility
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    try {
      const sessionToken = await sdk.getOwnerSessionToken();
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[Auth] Callback failed", error);
      res.status(500).json({ error: "Auth callback failed" });
    }
  });
}
