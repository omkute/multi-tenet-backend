import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";
import { metricsHandler } from "../controllers/metrics.controller.js";
import authRoutes from "./auth.routes.js";
import orgRoutes from "./org.routes.js";
import inviteRoutes, { orgInviteRoutes } from "./invite.routes.js";
import { metricsMiddleware } from "../lib/metrics.js";
import { generalRateLimiter } from "../middleware/rate-limiter.middleware.js";

const router = Router();

router.use(metricsMiddleware);
router.use(generalRateLimiter);

router.get("/health", getHealth);
router.get("/metrics", metricsHandler);
router.use("/auth", authRoutes);
router.use("/orgs", orgRoutes);
router.use("/orgs/:orgId/invites", orgInviteRoutes);
router.use("/invites", inviteRoutes);

export default router;
