import type { Request, Response, NextFunction } from "express";
import { getTenantContext } from "@/lib/tenant-context.js";
import type { Role } from "@/types/index.js";

const ROLE_LEVELS: Record<Role, number> = {
  MEMBER: 0,
  ADMIN: 1,
  OWNER: 2,
};

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getTenantContext();
    if (!ctx) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userLevel = ROLE_LEVELS[ctx.role];
    const requiredLevel = Math.max(...allowedRoles.map((r) => ROLE_LEVELS[r]));

    if (userLevel < requiredLevel) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requireMinRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = getTenantContext();
    if (!ctx) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userLevel = ROLE_LEVELS[ctx.role];
    const minLevel = ROLE_LEVELS[minRole];

    if (userLevel < minLevel) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
