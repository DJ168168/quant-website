import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

const OWNER_OPEN_ID = "owner_admin_001";

class SDKServer {
  private getJwtSecret(): Uint8Array {
    const secret = ENV.cookieSecret || process.env.SESSION_SECRET || "default-secret-change-me";
    return new TextEncoder().encode(secret);
  }

  async createSessionToken(openId: string, opts: { name: string; expiresInMs: number }): Promise<string> {
    const secret = this.getJwtSecret();
    return await new SignJWT({ openId, appId: ENV.appId || "quant-console", name: opts.name })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Date.now() + opts.expiresInMs)
      .sign(secret);
  }

  async verifySession(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      const secret = this.getJwtSecret();
      const { payload } = await jwtVerify(token, secret);
      return payload as unknown as SessionPayload;
    } catch {
      return null;
    }
  }

  private parseCookies(cookieHeader: string | undefined): Map<string, string> {
    if (!cookieHeader) return new Map();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (session) {
      const user = await db.getUserByOpenId(session.openId);
      if (user) return user;
    }

    // Auto-create owner user if no valid session - personal trading console
    let ownerUser = await db.getUserByOpenId(OWNER_OPEN_ID);
    if (!ownerUser) {
      await db.upsertUser({
        openId: OWNER_OPEN_ID,
        name: "管理员",
        role: "admin",
        lastSignedIn: new Date(),
      });
      ownerUser = await db.getUserByOpenId(OWNER_OPEN_ID);
    }

    if (!ownerUser) {
      throw ForbiddenError("Failed to authenticate");
    }

    return ownerUser;
  }

  async getOwnerSessionToken(): Promise<string> {
    return this.createSessionToken(OWNER_OPEN_ID, { name: "管理员", expiresInMs: ONE_YEAR_MS });
  }
}

export const sdk = new SDKServer();
