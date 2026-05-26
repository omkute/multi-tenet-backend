import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma.js";
import { pingRedis } from "@/lib/redis.js";

const startTime = Date.now();

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  const dbHealthy = await pingDatabase();
  const redisHealthy = await pingRedis();
  const healthy = dbHealthy && redisHealthy;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    database: dbHealthy ? "connected" : "disconnected",
    redis: redisHealthy ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
};

async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
