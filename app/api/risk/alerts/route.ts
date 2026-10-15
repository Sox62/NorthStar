import { NextResponse } from "next/server";
import { z } from "zod";
import { getStopAlertStatus, saveStopAlertSettings } from "@/lib/risk/stop-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({ recipient: z.string().trim().email().max(254), enabled: z.boolean() });

export async function GET() {
  try { return NextResponse.json(await getStopAlertStatus()); }
  catch { return NextResponse.json({ error: "Unable to load email alert settings." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    return NextResponse.json(await saveStopAlertSettings(input.recipient, input.enabled));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save email alerts." }, { status: 400 });
  }
}
