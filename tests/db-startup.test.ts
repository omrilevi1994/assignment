import { describe, expect, it, vi } from "vitest";
import { ensureDatabase } from "../scripts/db-startup";
import { DEFAULT_DATABASE_URL } from "@/db/url";

describe("ensureDatabase", () => {
  it.each([DEFAULT_DATABASE_URL, "postgres://app:secret@db.example:6543/custom"])(
    "reuses a reachable configured database without starting Compose", async (url) => {
      const reachable = vi.fn().mockResolvedValue(true);
      const start = vi.fn();
      expect(await ensureDatabase(url, { reachable, start })).toBe("reused");
      expect(reachable).toHaveBeenCalledExactlyOnceWith(url);
      expect(start).not.toHaveBeenCalled();
    },
  );

  it("starts Compose for an unavailable default database and confirms connectivity afterward", async () => {
    const order: string[] = [];
    const reachable = vi.fn().mockImplementationOnce(async () => { order.push("check"); return false; })
      .mockImplementationOnce(async () => { order.push("confirm"); return true; });
    const start = vi.fn(async () => { order.push("compose"); });
    expect(await ensureDatabase(DEFAULT_DATABASE_URL, { reachable, start })).toBe("started");
    expect(order).toEqual(["check", "compose", "confirm"]);
    expect(reachable).toHaveBeenNthCalledWith(2, DEFAULT_DATABASE_URL);
  });

  it("fails safely without Compose when a custom database is unavailable", async () => {
    const reachable = vi.fn().mockResolvedValue(false);
    const start = vi.fn();
    const attempt = ensureDatabase("postgres://private-user:private-password@db.example/custom", { reachable, start });
    await expect(attempt).rejects.toThrow("Configured database is unavailable. Check DATABASE_URL and network access.");
    expect(start).not.toHaveBeenCalled();
    expect(reachable).toHaveBeenCalledTimes(1);
  });

  it("does not report success when Compose completes but the database still cannot be queried", async () => {
    const reachable = vi.fn().mockResolvedValue(false);
    const start = vi.fn().mockResolvedValue(undefined);
    await expect(ensureDatabase(DEFAULT_DATABASE_URL, { reachable, start })).rejects.toThrow(
      "Local database is still unavailable after Compose startup.",
    );
    expect(start).toHaveBeenCalledOnce();
  });

  it("returns a safe startup error when Compose fails", async () => {
    const reachable = vi.fn().mockResolvedValue(false);
    const start = vi.fn().mockRejectedValue(new Error("private docker details"));
    await expect(ensureDatabase(DEFAULT_DATABASE_URL, { reachable, start })).rejects.toThrow(
      "Could not start the local database. Check that Docker is running.",
    );
    expect(reachable).toHaveBeenCalledTimes(1);
  });
});
