import pino from "pino";
import { env } from "@/config/env.js";

const transport = pino.transport({
  target: "pino-pretty",
  options: { colorize: true },
});

export const logger = pino(
  {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
  env.NODE_ENV === "production" ? undefined : transport,
);
