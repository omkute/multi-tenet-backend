import { pinoHttp } from "pino-http";
import type { IncomingMessage } from "http";
import { logger } from "@/lib/logger.js";

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: IncomingMessage) => req.url === "/api/health",
  },
});
