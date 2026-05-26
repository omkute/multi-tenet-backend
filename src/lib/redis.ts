import { Redis } from "ioredis";
import { env } from "@/config/env.js";
import { logger } from "./logger.js";

let redis: InstanceType<typeof Redis> | null = null;

export function getRedis(): InstanceType<typeof Redis> {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });

    redis.on("error", (err: Error) => {
      logger.warn({ err }, "Redis connection error");
    });
  }
  return redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status !== "ready") {
      await r.connect();
    }
    const result = await r.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
