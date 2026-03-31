import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DIRECT_URL for migrations (bypasses PgBouncer).
    // Fall back to DATABASE_URL for local dev.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"] ?? "postgresql://postgres@localhost:5432/focus",
  },
});
