/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.+)\\.js$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.+)\\.js$": "$1",
  },
  moduleFileExtensions: ["ts", "js", "json", "node"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.json",
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  globalSetup: "<rootDir>/src/tests/global-setup.mjs",
  globalTeardown: "<rootDir>/src/tests/global-teardown.mjs",
  setupFiles: ["<rootDir>/src/tests/env-setup.ts"],
  verbose: true,
  testTimeout: 120_000,
  detectOpenHandles: true,
};

export default config;
