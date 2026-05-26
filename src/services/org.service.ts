import { prismaWithAudit as prisma } from "@/lib/prisma.js";
import { AppError } from "@/utils/app-error.js";
import { withOrg, getOrgId } from "@/utils/prisma-with-org.js";

interface CreateOrgInput {
  name: string;
  slug: string;
}

interface UpdateOrgInput {
  name?: string;
  slug?: string;
}

export async function listUserOrgs(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, deletedAt: null },
    include: { organization: true },
  });
  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}

export async function createOrg(userId: string, input: CreateOrgInput) {
  const existing = await prisma.organization.findUnique({
    where: { slug: input.slug },
  });
  if (existing) {
    throw new AppError("Organization slug already taken", 409);
  }

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.name, slug: input.slug },
    });

    await tx.membership.create({
      data: {
        userId,
        orgId: org.id,
        role: "OWNER",
      },
    });

    return org;
  });
}

export async function getOrg(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });
  if (!org) {
    throw new AppError("Organization not found", 404);
  }
  return org;
}

export async function updateOrg(orgId: string, input: UpdateOrgInput) {
  const ctxOrgId = getOrgId();
  if (ctxOrgId !== orgId) {
    throw new AppError("Organization mismatch", 403);
  }

  if (input.slug) {
    const existing = await prisma.organization.findUnique({
      where: { slug: input.slug },
    });
    if (existing && existing.id !== orgId) {
      throw new AppError("Organization slug already taken", 409);
    }
  }

  return withOrg(async (tx) => {
    return tx.organization.update({
      where: { id: orgId },
      data: input,
    });
  });
}

export async function listMembers(orgId: string) {
  const memberships = await prisma.membership.findMany({
    where: { orgId, deletedAt: null },
    include: {
      user: {
        select: { id: true, email: true, name: true, avatarUrl: true },
      },
    },
  });
  return memberships.map((m) => ({
    id: m.id,
    role: m.role,
    user: m.user,
    createdAt: m.createdAt,
  }));
}

export async function getMyMembership(userId: string, orgId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) {
    throw new AppError("Not a member of this organization", 403);
  }
  return membership;
}
