import { createServer, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { databaseReachable } from "./reachable";
import { databaseUrl } from "./url";

describe("databaseReachable", () => {
  it("authenticates and executes a query against the configured test database", async () => {
    expect(await databaseReachable(databaseUrl())).toBe(true);
  });

  it("rejects invalid credentials even when Postgres is listening", async () => {
    const url = new URL(databaseUrl());
    url.password = "deliberately-wrong-test-password";
    expect(await databaseReachable(url.toString())).toBe(false);
  });

  it("rejects a missing database on a reachable server", async () => {
    const url = new URL(databaseUrl());
    url.pathname = "/missing_startup_test_database";
    expect(await databaseReachable(url.toString())).toBe(false);
  });

  it("returns false for a malformed URL without exposing its contents", async () => {
    expect(await databaseReachable("postgres://private-user:private-password@[bad-url")).toBe(false);
  });

  it("bounds an unresponsive server and closes the attempted connection", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => { sockets.add(socket); socket.on("data", () => {}); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const started = performance.now();
    try {
      expect(await databaseReachable(`postgres://app:app@127.0.0.1:${address.port}/test`, 100)).toBe(false);
      expect(performance.now() - started).toBeLessThan(1000);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
