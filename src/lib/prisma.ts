import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "@/config/env.js";
import { createAuditExtension } from "./audit.js";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["warn", "error"],
});

export const prismaWithAudit = prisma.$extends(createAuditExtension(prisma));
