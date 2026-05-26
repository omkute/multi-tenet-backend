import { Router } from "express";
import { requireAuth } from "@/middleware/auth.middleware.js";
import { requireOrg } from "@/middleware/tenant.middleware.js";
import { requireMinRole } from "@/middleware/rbac.middleware.js";
import * as inviteController from "@/controllers/invite.controller.js";

const router = Router();

router.post("/accept", requireAuth, inviteController.acceptInvite);

export default router;

export const orgInviteRoutes = Router({ mergeParams: true });
orgInviteRoutes.post(
  "/",
  requireAuth,
  requireOrg,
  requireMinRole("ADMIN"),
  inviteController.createInvite,
);
