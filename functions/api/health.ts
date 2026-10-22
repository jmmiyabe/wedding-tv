import type { Env } from "../../server/env";
import { json, methodNotAllowed } from "../../server/http";

type DatabaseStatus = "connected" | "unavailable";

async function checkDatabase(db: D1Database | undefined) {
  if (!db) return { database: "unavailable" as DatabaseStatus, schemaVersion: null };

  try {
    const row = await db
      .prepare("SELECT MAX(version) AS version FROM schema_migrations")
      .first<{ version: number | null }>();
    return { database: "connected" as DatabaseStatus, schemaVersion: row?.version ?? null };
  } catch (error) {
    // Logged server-side only (visible in Cloudflare logs); never returned to the client.
    console.error("Health check: database query failed", error);
    return { database: "unavailable" as DatabaseStatus, schemaVersion: null };
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(["GET", "HEAD"]);
  }

  const { database, schemaVersion } = await checkDatabase(env.DB);
  const healthy = database === "connected";

  return json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      schemaVersion,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
};
