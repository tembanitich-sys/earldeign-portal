import "./env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  // Prefer the direct (unpooled) connection for schema changes; fall back to DATABASE_URL.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Connect a Postgres database to the project first.");
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migrations applied.");
}
main().catch((e) => { console.error(e); process.exit(1); });
