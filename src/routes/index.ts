import { Router } from "express";
import authRoutes from "./auth.routes.js";
import orgRoutes from "./org.routes.js";
import inviteRoutes, { orgInviteRoutes } from "./invite.routes.js";
import { generalRateLimiter } from "../middleware/rate-limiter.middleware.js";

const router = Router();

router.use(generalRateLimiter);

router.use("/auth", authRoutes);
router.use("/orgs", orgRoutes);
router.use("/orgs/:orgId/invites", orgInviteRoutes);
router.use("/invites", inviteRoutes);

export default router;
