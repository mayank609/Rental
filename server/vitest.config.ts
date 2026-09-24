import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    fileParallelism: false, // integration tests share one database
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://rental:rental@localhost:5432/rental_test",
      REDIS_DISABLED: "true",
      GEOCODER: "offline",
      PAYMENT_PROVIDER: "mock",
      RUN_WORKERS_IN_API: "false",
      LOG_LEVEL: "silent",
      LOCAL_UPLOAD_DIR: "/tmp/rentnest-test-uploads",
      CORS_ORIGINS: "http://localhost:5173",
    },
  },
});
