import { getPool } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (process.env.DATABASE_URL) await getPool().query("SELECT 1");
    return Response.json({
      ok: true,
      service: "north-star",
      storage: process.env.DATABASE_URL ? "postgresql" : "local",
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json({ ok: false, service: "north-star" }, { status: 503 });
  }
}
