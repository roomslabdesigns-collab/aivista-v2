import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { addedColumns, bootstrapSql } from "./schema.js";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL || "file:data/aivista.db";
if (url.startsWith("file:")) mkdirSync("data", { recursive: true });

const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });

export const db = drizzle(client, { schema });

export async function initDb() {
  for (const sql of bootstrapSql) await client.execute(sql);
  for (const c of addedColumns) {
    const cols = await client.execute(`PRAGMA table_info(${c.table})`);
    if (!cols.rows.some((r) => r.name === c.column)) await client.execute(c.ddl);
  }
  await client.execute("CREATE INDEX IF NOT EXISTS analyses_workspace ON analyses(workspace_id)");
}
