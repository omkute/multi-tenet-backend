import { Router } from "express";
import { requireAuth } from "@/middleware/auth.middleware.js";
import { requireOrg } from "@/middleware/tenant.middleware.js";
import { requireMinRole } from "@/middleware/rbac.middleware.js";
import * as orgController from "@/controllers/org.controller.js";

const router = Router();

router.get("/", requireAuth, orgController.listMyOrgs);
router.post("/", requireAuth, orgController.createOrg);

router.get(
  "/:orgId",
  requireAuth,
  requireOrg,
  requireMinRole("MEMBER"),
  orgController.getOrg,
);
router.patch(
  "/:orgId",
  requireAuth,
  requireOrg,
  requireMinRole("ADMIN"),
  orgController.updateOrg,
);
router.get(
  "/:orgId/members",
  requireAuth,
  requireOrg,
  requireMinRole("MEMBER"),
  orgController.listMembers,
);

export default router;
