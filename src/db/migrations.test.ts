import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { databaseUrl } from "./url";

/** Connection string for another database on the same server as DATABASE_URL. */
function urlFor(database: string): string {
  const url = new URL(databaseUrl());
  url.pathname = `/${database}`;
  return url.toString();
}

describe("migrations", () => {
  const admin = postgres(databaseUrl(), { max: 1, onnotice: () => {} });
  let database: string;
  let target: postgres.Sql;

  beforeEach(async () => {
    database = `migrate_test_${randomUUID().replaceAll("-", "")}`;
    await admin.unsafe(`create database "${database}"`);
    target = postgres(urlFor(database), { max: 1 });
  });

  afterEach(async () => {
    await target.end();
    await admin.unsafe(`drop database if exists "${database}"`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("creates conversation, turn, trace and feedback tables on an empty database", async () => {
    await runMigrations(urlFor(database));

    const rows = await target`
      select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`;
    expect(rows.map((row) => row.table_name)).toEqual(["conversations", "feedback", "traces", "turns"]);
  });

  it("applies each migration once when run again", async () => {
    await runMigrations(urlFor(database));
    await runMigrations(urlFor(database));

    const [{ applied }] = await target`select count(*)::int as applied from drizzle.__drizzle_migrations`;
    expect(applied).toBe(2);
  });
});
