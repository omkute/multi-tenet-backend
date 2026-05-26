import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "@/utils/jwt.js";

export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    _res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.sub, sessionId: payload.sessionId };
    next();
  } catch {
    _res.status(401).json({ error: "Invalid or expired token" });
  }
};
