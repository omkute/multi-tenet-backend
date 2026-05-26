import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@/types/index.js";

export interface TenantContext {
  orgId: string;
  role: Role;
  userId: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | null {
  return tenantStorage.getStore() ?? null;
}

export function requireTenantContext(): TenantContext {
  const ctx = tenantStorage.getStore();
  if (!ctx) {
    throw new Error("Tenant context not set — missing requireOrg middleware");
  }
  return ctx;
}
