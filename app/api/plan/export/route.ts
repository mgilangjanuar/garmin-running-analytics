import JSZip from "jszip";

import {
  encodeWorkoutToFit,
  encodeWorkoutsToFit,
  type LongTermPlan,
  type TrainingPhase,
  type WorkoutDefinition,
} from "@/lib/garmin/fit-encoder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportRequest =
  | { mode: "single"; workout: WorkoutDefinition }
  | { mode: "phase"; phase: TrainingPhase }
  | { mode: "full"; plan: LongTermPlan };

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function pad(n: number, total: number): string {
  const digits = String(total).length;
  return String(n).padStart(Math.max(digits, 2), "0");
}

async function zipFiles(files: { name: string; data: Uint8Array }[], zipName: string): Promise<Response> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(`${file.name}.fit`, file.data);
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(zipBuffer.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}.zip"`,
      "Content-Length": zipBuffer.length.toString(),
    },
  });
}

function singleFitResponse(data: Uint8Array, fileName: string): Response {
  return new Response(data.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}.fit"`,
      "Content-Length": data.length.toString(),
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportRequest;

    if (body.mode === "full") {
      const { phases } = body.plan;
      if (phases.length === 0) {
        return Response.json({ error: "No workouts in plan." }, { status: 400 });
      }
      const totalPhases = phases.length;
      const files: { name: string; data: Uint8Array }[] = [];
      for (const [pi, phase] of phases.entries()) {
        const phasePrefix = `p${pad(pi + 1, totalPhases)}-${slug(phase.phase)}`;
        const totalSessions = phase.weekTemplate.length;
        for (const [wi, workout] of phase.weekTemplate.entries()) {
          const sessionPrefix = `w${pad(wi + 1, totalSessions)}-${slug(workout.name)}`;
          files.push({ name: `${phasePrefix}__${sessionPrefix}`, data: encodeWorkoutToFit(workout) });
        }
      }
      return zipFiles(files, "long-term-training-plan");
    }

    if (body.mode === "phase") {
      const { weekTemplate, phase } = body.phase;
      if (!weekTemplate || weekTemplate.length === 0) {
        return Response.json({ error: "No workouts in phase." }, { status: 400 });
      }
      const total = weekTemplate.length;
      const files = weekTemplate.map((workout, i) => ({
        name: `w${pad(i + 1, total)}-${slug(workout.name)}`,
        data: encodeWorkoutToFit(workout),
      }));
      const zipName = slug(phase).slice(0, 50);
      return zipFiles(files, zipName);
    }

    const w = body.workout;
    if (!w?.name || !w.items || w.items.length === 0) {
      return Response.json({ error: "Workout name and items are required." }, { status: 400 });
    }
    const data = encodeWorkoutToFit(w);
    const fileName = w.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    return singleFitResponse(data, fileName);

  } catch (error) {
    console.error("FIT export error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to generate FIT file." },
      { status: 500 },
    );
  }
}
