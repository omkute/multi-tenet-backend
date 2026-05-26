import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const CONFIG_PATH = "/tmp/test-containers.json";

export default async function globalSetup() {
  const postgresContainer = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("multitenant_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const redisContainer = await new RedisContainer("redis:7-alpine").start();

  const DATABASE_URL = postgresContainer.getConnectionUri();
  const REDIS_URL = redisContainer.getConnectionUrl();

  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ DATABASE_URL, REDIS_URL }),
    "utf-8",
  );

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.REDIS_URL = REDIS_URL;

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL },
    stdio: "pipe",
  });
}
