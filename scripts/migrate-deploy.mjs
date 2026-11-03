// Runs `prisma migrate deploy` over Neon's direct connection. Prisma takes a
// session-level advisory lock while migrating, and those don't work through
// Neon's PgBouncer pooler (the `-pooler` host): the unlock can land on a
// different server connection, so the lock stays held and every later build
// times out with P1002. The direct host is the same URL without `-pooler`;
// other URLs are used unchanged.
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Prisma's fixed advisory lock key for migrations.
const MIGRATE_LOCK_KEY = 72707369;

const url = process.env.DATABASE_URL ?? "";
const direct = url.replace(/(@[^/?#]*?)-pooler\./, "$1.");
if (direct !== url) console.log("Running migrations over the direct (non-pooled) connection");

await releaseStaleMigrateLock(direct);

// A lock leaked by an earlier pooled build can outlive the cleanup above, and
// it blocks every deploy. Only this app's builds migrate this database, so
// skip Prisma's lock rather than let a leaked one wedge deploys.
const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: direct, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
});
process.exit(result.status ?? 1);

// A lock leaked through the pooler sits on a connection that has done nothing
// for a long time. A migration that is really running keeps issuing queries,
// so only holders idle for over two minutes are ended.
async function releaseStaleMigrateLock(datasourceUrl) {
  if (!datasourceUrl) return;
  const prisma = new PrismaClient({ datasourceUrl });
  try {
    const ended = await prisma.$queryRawUnsafe(
      `SELECT a.pid, pg_terminate_backend(a.pid) AS terminated
         FROM pg_locks l
         JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory'
          AND l.granted
          AND ((l.classid::bigint << 32) | l.objid::bigint) = $1
          AND a.pid <> pg_backend_pid()
          AND a.state = 'idle'
          AND a.state_change < now() - interval '2 minutes'`,
      MIGRATE_LOCK_KEY
    );
    for (const row of ended) console.log(`Released a stale migration lock held by backend ${row.pid}`);
    const holders = await prisma.$queryRawUnsafe(
      `SELECT l.pid, l.granted, a.state, extract(epoch FROM now() - a.state_change)::int AS idle_seconds, left(a.query, 60) AS query
         FROM pg_locks l LEFT JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND ((l.classid::bigint << 32) | l.objid::bigint) = $1`,
      MIGRATE_LOCK_KEY
    );
    for (const h of holders) console.log("Migration lock session:", JSON.stringify(h));
  } catch (err) {
    // Cleanup is best effort; migrate deploy reports any real problem itself.
    console.warn("Could not check for a stale migration lock:", err instanceof Error ? err.message : err);
  } finally {
    await prisma.$disconnect();
  }
}
