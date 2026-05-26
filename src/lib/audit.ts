import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { getTenantContext } from "./tenant-context.js";
import { getUserId } from "./user-context.js";

const AUDITED_MODELS = new Set([
  "User",
  "Organization",
  "Membership",
  "Project",
  "Invite",
]);
const AUDITED_ACTIONS = new Set(["create", "update", "delete"]);

function getModelId(result: unknown, args: unknown): string {
  const r = result as Record<string, unknown> | null;
  if (r?.id) return String(r.id);
  const a = args as Record<string, unknown> | null;
  const where = a?.where as Record<string, unknown> | null;
  if (where?.id) return String(where.id);
  return "unknown";
}

export function createAuditExtension(basePrisma: PrismaClient) {
  return Prisma.defineExtension({
    name: "audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          if (
            model !== "AuditLog" &&
            AUDITED_MODELS.has(model) &&
            AUDITED_ACTIONS.has(operation)
          ) {
            const ctx = getTenantContext();
            const actorId = ctx?.userId ?? getUserId();

            basePrisma.auditLog
              .create({
                data: {
                  orgId: ctx?.orgId ?? null,
                  actorId,
                  action: operation,
                  model,
                  modelId: getModelId(result, args),
                  data: result as Prisma.InputJsonValue,
                },
              })
              .catch((err) => console.error("[audit] write failed:", err));
          }

          return result;
        },
      },
    },
  });
}
