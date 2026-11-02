// Runs `prisma migrate deploy` over Neon's direct connection. Prisma takes a
// session-level advisory lock while migrating, and those don't work through
// Neon's PgBouncer pooler (the `-pooler` host): a lock can stay held on a
// pooled connection and every later build times out with P1002. The direct
// host is the same URL without `-pooler`; other URLs are used unchanged.
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const direct = url.replace(/(@[^/?#]*?)-pooler\./, "$1.");
if (direct !== url) console.log("Running migrations over the direct (non-pooled) connection");

const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: direct },
});
process.exit(result.status ?? 1);
