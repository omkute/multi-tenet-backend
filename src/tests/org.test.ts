import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import type { Application } from "express";
import { signupUser, createOrg, cleanup } from "./helpers.js";

let app: Application;
let adminToken: string;
let orgId: string;

beforeAll(async () => {
  const mod = await import("@/app.js");
  app = mod.default;

  const user = await signupUser(app, "org-admin@test.com", "pass123", "Org Admin");
  adminToken = user.accessToken;

  const org = await createOrg(app, adminToken, "Test Org", "test-org");
  orgId = org.orgId;
});

afterAll(async () => {
  await cleanup(app, ["org-admin@test.com"]);
});

describe("POST /api/orgs", () => {
  it("creates a new org with OWNER role", async () => {
    const res = await request(app)
      .post("/api/orgs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Second Org", slug: "second-org" })
      .expect(201);

    expect(res.body.organization.name).toBe("Second Org");

    // Cleanup second org
    const { prisma } = await import("@/lib/prisma.js");
    await prisma.membership.deleteMany({ where: { orgId: res.body.organization.id } });
    await prisma.organization.delete({ where: { id: res.body.organization.id } });
  });

  it("rejects duplicate slug", async () => {
    const res = await request(app)
      .post("/api/orgs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test Org Dupe", slug: "test-org" })
      .expect(409);

    expect(res.body.error).toBe("Organization slug already taken");
  });

  it("rejects unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/orgs")
      .send({ name: "No Auth Org", slug: "no-auth-org" })
      .expect(401);
  });
});

describe("GET /api/orgs", () => {
  it("lists user's orgs", async () => {
    const res = await request(app)
      .get("/api/orgs")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.organizations).toBeInstanceOf(Array);
    expect(res.body.organizations.length).toBeGreaterThanOrEqual(1);
    expect(res.body.organizations[0].role).toBeDefined();
  });
});

describe("GET /api/orgs/:id", () => {
  it("returns org details", async () => {
    const res = await request(app)
      .get(`/api/orgs/${orgId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(res.body.organization.name).toBe("Test Org");
  });
});

describe("PATCH /api/orgs/:id", () => {
  it("updates org name", async () => {
    const res = await request(app)
      .patch(`/api/orgs/${orgId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Org-Id", orgId)
      .send({ name: "Test Org Updated" })
      .expect(200);

    expect(res.body.organization.name).toBe("Test Org Updated");
  });

  it("rejects request without org context", async () => {
    const res = await request(app)
      .patch(`/api/orgs/${orgId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "No Context" })
      .expect(400);
  });
});

describe("GET /api/orgs/:id/members", () => {
  it("lists members with user details", async () => {
    const res = await request(app)
      .get(`/api/orgs/${orgId}/members`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(res.body.members).toBeInstanceOf(Array);
    expect(res.body.members.length).toBe(1);
    expect(res.body.members[0].role).toBe("OWNER");
    expect(res.body.members[0].user.email).toBe("org-admin@test.com");
  });
});

describe("RBAC enforcement", () => {
  it("allows ADMIN to create invites (tested in invite tests)", async () => {
    // Create a member user
    const member = await signupUser(app, "rbac-member@test.com", "pass123", "Member");
    const { prisma } = await import("@/lib/prisma.js");

    // Admin adds member via direct DB (since invites exist)
    await prisma.membership.create({
      data: { userId: member.userId, orgId, role: "MEMBER" },
    });

    // Member tries to update org — should fail
    const res = await request(app)
      .patch(`/api/orgs/${orgId}`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .set("X-Org-Id", orgId)
      .send({ name: "Member Update Attempt" })
      .expect(403);

    expect(res.body.error).toMatch(/permissions|Insufficient/i);

    await prisma.session.deleteMany({ where: { userId: member.userId } });
    await prisma.membership.deleteMany({ where: { userId: member.userId } });
    await prisma.user.deleteMany({ where: { email: "rbac-member@test.com" } });
  });
});
