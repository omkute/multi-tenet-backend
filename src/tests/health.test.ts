import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import type { Application } from "express";

let app: Application;

beforeAll(async () => {
  const mod = await import("@/app.js");
  app = mod.default;
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma.js");
  await prisma.$disconnect();
});

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health").expect(200);

    expect(res.body).toMatchObject({
      status: "ok",
      database: "connected",
      redis: "connected",
    });
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.timestamp).toBeDefined();
  });
});
