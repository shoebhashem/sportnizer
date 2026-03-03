import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  // Increase timeout — emulator calls can be slow on first run
  testTimeout: 30000,
  // Run tests sequentially (shared emulator state)
  maxWorkers: 1,
  // Setup file that initializes Firebase Admin before all tests
  globalSetup: "<rootDir>/test/global-setup.ts",
  globalTeardown: "<rootDir>/test/global-teardown.ts",
  // ts-jest configuration
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          strict: true,
          target: "es2017",
          skipLibCheck: true,
          noUnusedLocals: false,
          noImplicitReturns: false,
        },
      },
    ],
  },
};

export default config;
