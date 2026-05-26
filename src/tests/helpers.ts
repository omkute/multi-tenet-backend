import request from "supertest";
import type { Application } from "express";

export async function signupUser(
  app: Application,
  email: string,
  password = "testpass123",
  name = "Test User",
): Promise<{
  accessToken: string;
  refreshToken: string;
  userId: string;
}> {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email, password, name })
    .expect(201);

  const cookies = res.headers["set-cookie"];
  const refreshCookie = Array.isArray(cookies)
    ? cookies.find((c: string) => c.startsWith("refreshToken="))
    : undefined;

  return {
    accessToken: res.body.accessToken,
    refreshToken: refreshCookie ?? "",
    userId: res.body.user.id,
  };
}

export async function loginUser(
  app: Application,
  email: string,
  password = "testpass123",
): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);

  const cookies = res.headers["set-cookie"];
  const refreshCookie = Array.isArray(cookies)
    ? cookies.find((c: string) => c.startsWith("refreshToken="))
    : undefined;

  return {
    accessToken: res.body.accessToken,
    refreshToken: refreshCookie ?? "",
  };
}

export async function createOrg(
  app: Application,
  accessToken: string,
  name: string,
  slug: string,
): Promise<{ orgId: string }> {
  const res = await request(app)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name, slug })
    .expect(201);

  return { orgId: res.body.organization.id };
}

export async function createInvite(
  app: Application,
  accessToken: string,
  orgId: string,
  email: string,
  role = "MEMBER",
): Promise<{ token: string }> {
  const res = await request(app)
    .post(`/api/orgs/${orgId}/invites`)
    .set("Authorization", `Bearer ${accessToken}`)
    .set("X-Org-Id", orgId)
    .send({ email, role })
    .expect(201);

  return { token: res.body.token };
}

export async function cleanup(
  app: Application,
  emails: string[],
): Promise<void> {
  const { prisma } = await import("@/lib/prisma.js");
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.membership.deleteMany({ where: { userId: user.id } });
      await prisma.invite.deleteMany({ where: { createdById: user.id } });
    }
    await prisma.user.deleteMany({ where: { email } });
  }
  await prisma.auditLog.deleteMany({});
  await prisma.$disconnect();
}
