import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import type { Application } from "express";
import { signupUser, createOrg, cleanup } from "./helpers.js";

let app: Application;
let adminToken: string;
let orgId: string;

const EMAILS = {
  admin: "inv-adm@test.com",
  create1: "inv-c1@test.com",
  create2: "inv-c2@test.com",
  accept1: "inv-a1@test.com",
  accept2: "inv-a2@test.com",
  accept3: "inv-a3@test.com",
};

beforeAll(async () => {
  const mod = await import("@/app.js");
  app = mod.default;

  const admin = await signupUser(app, EMAILS.admin, "pass123", "Invite Admin");
  adminToken = admin.accessToken;

  const org = await createOrg(app, adminToken, "Invite Org", "inv-org-2");
  orgId = org.orgId;
});

afterAll(async () => {
  await cleanup(app, Object.values(EMAILS));
});

function makeInvite(email: string) {
  return request(app)
    .post(`/api/orgs/${orgId}/invites`)
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Org-Id", orgId)
    .send({ email, role: "MEMBER" });
}

describe("POST /api/orgs/:orgId/invites", () => {
  it("creates an invite as admin", async () => {
    const res = await makeInvite(EMAILS.create1).expect(201);

    expect(res.body.token).toBeDefined();
    expect(res.body.invite.email).toBe(EMAILS.create1);
    expect(res.body.invite.role).toBe("MEMBER");
  });

  it("rejects duplicate active invite", async () => {
    const res = await makeInvite(EMAILS.create2).expect(201);
    expect(res.body.token).toBeDefined();

    const dup = await makeInvite(EMAILS.create2).expect(409);
    expect(dup.body.error).toBe("An active invite already exists for this email");
  });
});

describe("POST /api/invites/accept", () => {
  it("accepts invite and creates membership", async () => {
    const invitee = await signupUser(app, EMAILS.accept1, "pass123", "Accept 1");
    const inv = await makeInvite(EMAILS.accept1).expect(201);

    const res = await request(app)
      .post("/api/invites/accept")
      .set("Authorization", `Bearer ${invitee.accessToken}`)
      .send({ token: inv.body.token })
      .expect(201);

    expect(res.body.membership.role).toBe("MEMBER");
    expect(res.body.membership.orgId).toBe(orgId);
    expect(res.body.organization.name).toBe("Invite Org");
  });

  it("rejects already accepted invite", async () => {
    const invitee = await signupUser(app, EMAILS.accept2, "pass123", "Accept 2");
    const inv = await makeInvite(EMAILS.accept2).expect(201);

    await request(app)
      .post("/api/invites/accept")
      .set("Authorization", `Bearer ${invitee.accessToken}`)
      .send({ token: inv.body.token });

    const res = await request(app)
      .post("/api/invites/accept")
      .set("Authorization", `Bearer ${invitee.accessToken}`)
      .send({ token: inv.body.token })
      .expect(410);

    expect(res.body.error).toBe("Invite has already been accepted");
  });

  it("rejects invalid token", async () => {
    const invitee = await signupUser(app, EMAILS.accept3, "pass123", "Accept 3");

    const res = await request(app)
      .post("/api/invites/accept")
      .set("Authorization", `Bearer ${invitee.accessToken}`)
      .send({ token: "invalidtoken" })
      .expect(401);

    expect(res.body.error).toBe("Invalid invite token");
  });
});
