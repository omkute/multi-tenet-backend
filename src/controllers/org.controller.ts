import type { Request, Response } from "express";
import * as orgService from "@/services/org.service.js";

export const listMyOrgs = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { userId } = req.user!;
  const orgs = await orgService.listUserOrgs(userId);
  res.json({ organizations: orgs });
};

export const createOrg = async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const { name, slug } = req.body;
  const org = await orgService.createOrg(userId, { name, slug });
  res.status(201).json({ organization: org });
};

export const getOrg = async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params.orgId as string;
  const org = await orgService.getOrg(orgId);
  res.json({ organization: org });
};

export const updateOrg = async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params.orgId as string;
  const org = await orgService.updateOrg(orgId, req.body);
  res.json({ organization: org });
};

export const listMembers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const orgId = req.params.orgId as string;
  const members = await orgService.listMembers(orgId);
  res.json({ members });
};
