import type { Request, Response } from "express";
import * as inviteService from "@/services/invite.service.js";

export const createInvite = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { userId } = req.user!;
  const { email, role = "MEMBER" } = req.body;

  const result = await inviteService.createInvite(userId, email, role);
  res.status(201).json({
    token: result.token,
    invite: result.invite,
  });
};

export const acceptInvite = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { userId } = req.user!;
  const { token } = req.body;

  const result = await inviteService.acceptInvite(token, userId);
  res.status(201).json({
    membership: result.membership,
    organization: result.organization,
  });
};
