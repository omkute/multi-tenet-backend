import promClient from "prom-client";
import type { Request, Response, NextFunction } from "express";

const register = new promClient.Registry();

promClient.collectDefaultMetrics({ register });

const httpRequestCounter = new promClient.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const route = req.route?.path ?? req.path;

    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration,
    );
  });

  next();
}

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
