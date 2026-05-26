import type { Request, Response } from "express";
import { getMetrics } from "@/lib/metrics.js";

export const metricsHandler = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const metrics = await getMetrics();
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(metrics);
};
