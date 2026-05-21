import { deletePlan, getPlan, updatePlan } from "@/lib/plans/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = await getPlan(id);
  if (!saved) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(saved);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { title } = body;
  if (!title?.trim()) return Response.json({ error: "Title is required." }, { status: 400 });
  const updated = await updatePlan(id, title);
  if (!updated) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deletePlan(id);
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
