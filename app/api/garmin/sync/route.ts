import { syncFromGarminApi } from "@/lib/garmin/api-fetcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST() {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    return Response.json(
      { ok: false, message: "GARMIN_EMAIL and GARMIN_PASSWORD must be set in .env.local." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        await syncFromGarminApi(email, password, (progress) => {
          send({ type: "progress", ...progress });
        });
        send({ type: "done", ok: true, message: "Sync complete. Refresh the page to see updated data." });
      } catch (err) {
        send({
          type: "error",
          ok: false,
          message: "Sync failed",
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
