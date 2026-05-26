import crypto from "node:crypto";
import { prismaWithAudit as prisma } from "@/lib/prisma.js";
import { AppError } from "@/utils/app-error.js";
import { withOrg, getOrgId } from "@/utils/prisma-with-org.js";
import type { Role } from "@/types/index.js";

const INVITE_EXPIRY_DAYS = 7;

function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export async function createInvite(
  invitedByUserId: string,
  email: string,
  role: Role,
) {
  const orgId = getOrgId();

  const existingMember = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: invitedByUserId, orgId } },
  });
  if (!existingMember) {
    throw new AppError("Not a member of this organization", 403);
  }

  const alreadyMember = await prisma.membership.findFirst({
    where: { orgId, user: { email }, deletedAt: null },
  });
  if (alreadyMember) {
    throw new AppError("User is already a member of this organization", 409);
  }

  const existingInvite = await prisma.invite.findFirst({
    where: { orgId, email, acceptedAt: null, revokedAt: null },
  });
  if (existingInvite && existingInvite.expiresAt > new Date()) {
    throw new AppError("An active invite already exists for this email", 409);
  }

  const { raw, hash } = generateInviteToken();

  return withOrg(async (tx) => {
    if (existingInvite) {
      await tx.invite.update({
        where: { id: existingInvite.id },
        data: { revokedAt: new Date() },
      });
    }

    const invite = await tx.invite.create({
      data: {
        orgId,
        email,
        tokenHash: hash,
        role,
        expiresAt: new Date(
          Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
        ),
        createdById: invitedByUserId,
      },
    });

    return { token: raw, invite };
  });
}

export async function acceptInvite(token: string, userId: string) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hash },
    include: { organization: true },
  });

  if (!invite) {
    throw new AppError("Invalid invite token", 401);
  }
  if (invite.acceptedAt) {
    throw new AppError("Invite has already been accepted", 410);
  }
  if (invite.revokedAt) {
    throw new AppError("Invite has been revoked", 410);
  }
  if (invite.expiresAt < new Date()) {
    throw new AppError("Invite has expired", 410);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404);
  }
  if (user.email !== invite.email) {
    throw new AppError(
      "This invite was sent to a different email address",
      403,
    );
  }

  const existingMembership = await prisma.membership.findFirst({
    where: { userId, orgId: invite.orgId, deletedAt: null },
  });
  if (existingMembership) {
    throw new AppError("Already a member of this organization", 409);
  }

  return prisma.$transaction(async (tx) => {
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    const membership = await tx.membership.create({
      data: {
        userId,
        orgId: invite.orgId,
        role: invite.role,
      },
      include: { organization: true },
    });

    return { membership, organization: invite.organization };
  });
}
