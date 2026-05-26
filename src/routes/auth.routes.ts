import { Router } from "express";
import * as authController from "@/controllers/auth.controller.js";
import { requireAuth } from "@/middleware/auth.middleware.js";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", requireAuth, authController.logout);
router.post("/logout-all", requireAuth, authController.logoutAll);
router.get("/me", requireAuth, authController.getMe);

export default router;
