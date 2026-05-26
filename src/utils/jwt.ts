import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "@/config/env.js";

export interface AccessTokenPayload {
  sub: string;
  sessionId: string;
}

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sessionId }, env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  return {
    sub: payload.sub as string,
    sessionId: payload.sessionId as string,
  };
}

export interface RefreshTokenResult {
  raw: string;
  hash: string;
}

export function generateRefreshToken(): RefreshTokenResult {
  const raw = crypto.randomBytes(64).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
