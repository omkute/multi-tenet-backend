import { prismaWithAudit as prisma } from "@/lib/prisma.js";
import { requireTenantContext } from "@/lib/tenant-context.js";
import { Prisma } from "@prisma/client";

type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export function withOrg<T>(fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
  const ctx = requireTenantContext();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT set_config('app.current_org_id', ${ctx.orgId}, true)`,
    );
    return fn(tx);
  });
}

export function getOrgId(): string {
  return requireTenantContext().orgId;
}

export function getRole(): string {
  return requireTenantContext().role;
}
