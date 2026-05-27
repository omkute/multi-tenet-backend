import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "@/config/env.js";
import { createAuditExtension } from "./audit.js";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const logLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "development"
    ? ["query", "info", "warn"]
    : env.NODE_ENV === "test"
      ? []
      : ["warn"];

export const prisma = new PrismaClient({
  adapter,
  log: logLevels,
});

export const prismaWithAudit = prisma.$extends(createAuditExtension(prisma));
