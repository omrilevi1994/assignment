import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DATABASE_URL, databaseUrl } from "./url";

describe("databaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses DATABASE_URL when it is set", () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:p@db.example:6543/postgres");
    expect(databaseUrl()).toBe("postgres://u:p@db.example:6543/postgres");
  });

  it("falls back to the Compose database when DATABASE_URL is unset or empty", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(databaseUrl()).toBe(DEFAULT_DATABASE_URL);
    vi.stubEnv("DATABASE_URL", "");
    expect(databaseUrl()).toBe(DEFAULT_DATABASE_URL);
  });

  it("points the default at the Compose service", () => {
    expect(DEFAULT_DATABASE_URL).toBe("postgres://app:app@localhost:5432/event_intel");
  });
});
