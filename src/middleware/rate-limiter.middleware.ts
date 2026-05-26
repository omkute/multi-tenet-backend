import type { Request, Response, NextFunction } from "express";
import { getRedis } from "@/lib/redis.js";

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const WINDOW_MS = 15 * 60 * 1000;
const GENERAL_MAX = 100;
const AUTH_MAX = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

const BRUTE_MAX_FAILURES = 5;
const BRUTE_BLOCK_MS = 15 * 60 * 1000;

const AUTH_PATHS = ["/auth/login", "/auth/signup"];

export function generalRateLimiter(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const isAuth = AUTH_PATHS.some((p) => req.path.startsWith(p));
  const config: RateLimitConfig = {
    windowMs: isAuth ? AUTH_WINDOW_MS : WINDOW_MS,
    max: isAuth ? AUTH_MAX : GENERAL_MAX,
    keyPrefix: isAuth ? "rate:ip:auth" : "rate:ip:general",
  };

  slidingWindow(config, req, _res, next);
}

export function bruteForceProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const email: string | undefined = req.body?.email;
  if (!email) return next();

  const redis = getRedis();
  const key = `brute:email:${email.toLowerCase()}`;

  redis
    .get(key)
    .then((val: string | null) => {
      const count = val ? Number(val) : 0;
      if (count >= BRUTE_MAX_FAILURES) {
        _res.status(429).json({
          error: "Too many attempts. Try again later.",
        });
        return;
      }
      next();
    })
    .catch(() => next());
}

export async function recordFailedAttempt(email: string): Promise<void> {
  const redis = getRedis();
  const key = `brute:email:${email.toLowerCase()}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.pexpire(key, BRUTE_BLOCK_MS);
  }

  if (count >= BRUTE_MAX_FAILURES) {
    await redis.pexpire(key, BRUTE_BLOCK_MS);
  }
}

export async function clearBruteForce(email: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`brute:email:${email.toLowerCase()}`);
}

function slidingWindow(
  config: RateLimitConfig,
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const redis = getRedis();
  const key = `${config.keyPrefix}:${req.ip ?? "unknown"}`;
  const now = Date.now();

  redis
    .multi()
    .zremrangebyscore(key, 0, now - config.windowMs)
    .zcard(key)
    .zadd(key, now, `${now}-${Math.random()}`)
    .pexpire(key, config.windowMs)
    .exec()
    .then((results: [Error | null, unknown][] | null) => {
      if (!results) return next();
      const count = results[1]?.[1] as number | undefined;

      if (count !== undefined && count > config.max) {
        _res.status(429).json({
          error: "Too many requests. Please slow down.",
        });
        return;
      }

      next();
    })
    .catch(() => next());
}
