import { listPlans, savePlan } from "@/lib/plans/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const plans = await listPlans();
  return Response.json(plans);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { plan, prompt, title } = body;

    if (!plan || !plan.phases) {
      return Response.json({ error: "Invalid plan data." }, { status: 400 });
    }

    const saved = await savePlan(plan, prompt ?? "", title ?? "");
    return Response.json(saved, { status: 201 });
  } catch (error) {
    console.error("Save plan error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to save plan." },
      { status: 500 },
    );
  }
}
