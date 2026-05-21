import { makeSessionToken, sessionCookieOptions } from "@/lib/auth";
import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { password?: string; from?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const masterPassword = process.env.MASTER_PASSWORD;
  if (!masterPassword) {
    return Response.json({ error: "Auth not configured." }, { status: 500 });
  }

  const provided = body.password ?? "";
  let valid = false;
  try {
    valid = timingSafeEqual(Buffer.from(provided), Buffer.from(masterPassword));
  } catch {
    valid = false;
  }

  if (!valid) {
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = makeSessionToken();
  const jar = await cookies();
  jar.set(sessionCookieOptions(token));

  return Response.json({ ok: true });
}
