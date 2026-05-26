import type { Request, Response, NextFunction } from "express";
import { prisma } from "@/lib/prisma.js";
import { tenantStorage } from "@/lib/tenant-context.js";
import type { Role } from "@/types/index.js";

export const requireOrg = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const orgId = req.headers["x-org-id"] as string | undefined;
  if (!orgId) {
    res.status(400).json({ error: "X-Org-Id header is required" });
    return;
  }

  const { userId } = req.user!;

  prisma.membership
    .findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    })
    .then((membership) => {
      if (!membership) {
        res.status(403).json({ error: "Not a member of this organization" });
        return;
      }

      tenantStorage.run({ orgId, role: membership.role as Role, userId }, () =>
        next(),
      );
    })
    .catch((err) => next(err));
};
