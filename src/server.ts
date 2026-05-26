import "dotenv/config";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
});

const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, "Received shutdown signal");

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
