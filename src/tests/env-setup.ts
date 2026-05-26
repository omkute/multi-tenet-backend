import { readFileSync } from "node:fs";

const CONFIG_PATH = "/tmp/test-containers.json";

try {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  process.env.DATABASE_URL = config.DATABASE_URL;
  process.env.REDIS_URL = config.REDIS_URL;
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-access-secret-min-32-chars-long!!";
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-min-32-chars-long!";
  process.env.NODE_ENV = "test";
} catch {
  throw new Error(
    "Test container config not found. Run tests with --globalSetup=src/tests/global-setup.mjs",
  );
}
