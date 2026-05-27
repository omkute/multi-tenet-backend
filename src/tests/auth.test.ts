/* eslint-disable @typescript-eslint/no-unused-vars */
import { beforeAll, afterAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import type { Application } from "express";
import { signupUser, loginUser, cleanup } from "./helpers.js";

let app: Application;

beforeAll(async () => {
  const mod = await import("@/app.js");
  app = mod.default;
});

afterAll(async () => {
  await cleanup(app, ["auth-test@test.com"]);
});

describe("POST /api/auth/signup", () => {
  it("creates a new user and returns tokens", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "auth-test@test.com",
        password: "testpass123",
        name: "Auth Test",
      })
      .expect(201);

    expect(res.body.user).toMatchObject({
      email: "auth-test@test.com",
      name: "Auth Test",
    });
    expect(res.body.user.id).toBeDefined();
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        email: "auth-test@test.com",
        password: "testpass123",
        name: "Auth Test",
      })
      .expect(409);

    expect(res.body.error).toBe("Email already in use");
  });

  it("rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "incomplete@test.com" })
      .expect(400);

    expect(res.body.error).toBe("Missing required fields");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "auth-test@test.com", password: "testpass123" })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe("auth-test@test.com");
  });

  it("rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "auth-test@test.com", password: "wrongpassword" })
      .expect(401);

    expect(res.body.error).toBe("Invalid credentials");
  });

  it("rejects non-existent user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nonexistent@test.com", password: "testpass123" })
      .expect(401);

    expect(res.body.error).toBe("Invalid credentials");
  });
});

describe("POST /api/auth/refresh", () => {
  it("returns new tokens with valid refresh cookie", async () => {
    const cookies = await getRefreshCookie(app);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookies)
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects missing refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").expect(401);

    expect(res.body.error).toBe("No refresh token");
  });
});

describe("POST /api/auth/logout", () => {
  it("logs out successfully", async () => {
    const { accessToken } = await loginUser(app, "auth-test@test.com");

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.message).toBe("Logged out");
  });

  it("rejects unauthenticated request", async () => {
    const res = await request(app).post("/api/auth/logout").expect(401);

    expect(res.body.error).toBe("Missing or invalid authorization header");
  });
});

describe("GET /api/auth/me", () => {
  it("returns current user", async () => {
    const { accessToken } = await loginUser(app, "auth-test@test.com");

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.user.email).toBe("auth-test@test.com");
  });

  it("rejects unauthenticated request", async () => {
    const res = await request(app).get("/api/auth/me").expect(401);
  });
});

async function getRefreshCookie(app: Application): Promise<string> {
  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "auth-test@test.com", password: "testpass123" });

  const cookies = loginRes.headers["set-cookie"];
  const refreshCookie = Array.isArray(cookies)
    ? cookies.find((c: string) => c.startsWith("refreshToken="))
    : "";

  // Extract just the name=value part before the first semicolon
  return refreshCookie ? refreshCookie.split(";")[0]! : "";
}
