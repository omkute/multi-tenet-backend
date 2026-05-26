import type { Request, Response, NextFunction } from "express";
import { logger } from "@/lib/logger.js";

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode || 500;

  logger.error(
    { err, statusCode, path: req.path, method: req.method },
    err.message,
  );

  res.status(statusCode).json({
    error: statusCode === 500 ? "Internal Server Error" : err.message,
  });
};
