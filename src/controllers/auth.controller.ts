import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { env } from "../config/env.js";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const signup = async (req: Request, res: Response): Promise<void> => {
  const { email, password, name } = req.body;
  const result = await authService.signup(email, password, name);

  res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(201).json({
    user: result.user,
    accessToken: result.accessToken,
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);

  res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({
    user: result.user,
    accessToken: result.accessToken,
  });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const rawRefreshToken = req.cookies?.refreshToken;
  if (!rawRefreshToken) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  const result = await authService.refresh(rawRefreshToken);

  res.cookie("refreshToken", result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.json({
    user: result.user,
    accessToken: result.accessToken,
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.user!;
  await authService.logout(sessionId);

  res.clearCookie("refreshToken", { path: "/api/auth" });
  res.json({ message: "Logged out" });
};

export const logoutAll = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.user!;
  await authService.logoutAll(userId);

  res.clearCookie("refreshToken", { path: "/api/auth" });
  res.json({ message: "Logged out from all sessions" });
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const user = await authService.getMe(userId);
  res.json({ user });
};
