import postgres from "postgres";

/** Keeps server notices out of startup logs. */
function ignoreNotice(): void {}

/** Authenticates and runs a query within a deadline, closing the one-use connection afterward. */
export async function databaseReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  let client: postgres.Sql | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    client = postgres(url, {
      max: 1, prepare: false, fetch_types: false, connect_timeout: timeoutMs / 1000, onnotice: ignoreNotice,
    });
    const deadline = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
    const query = client`select 1 as ready`.then((rows) => rows[0]?.ready === 1, () => false);
    return await Promise.race([query, deadline]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    await client?.end({ timeout: 0 });
  }
}
