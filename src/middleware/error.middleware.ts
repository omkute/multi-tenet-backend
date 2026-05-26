import type { Request, Response, NextFunction } from "express";
import { logger } from "@/lib/logger.js";
import { AppError } from "@/utils/app-error.js";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({ error: "Internal Server Error" });
};
