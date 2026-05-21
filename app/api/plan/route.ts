import { anthropic } from "@ai-sdk/anthropic"
import { generateText, Output } from "ai"
import { z } from "zod"

import { buildAiWorkoutContext } from "@/lib/garmin/ai-context"
import { getWorkoutAnalytics } from "@/lib/garmin/parser"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanRequest = {
  prompt?: string;
};

const WorkoutStepSchema = z.object({
  name: z.string().max(16),
  notes: z.string().max(254).optional(),
  intensity: z.enum(["warmup", "active", "cooldown", "recovery", "interval", "rest"]),
  durationType: z.enum(["time", "distance", "open"]),
  durationValue: z.number().min(0),
  targetType: z.enum(["open", "heartRate", "cadence", "power"]).optional(),
  targetLow: z.number().optional(),
  targetHigh: z.number().optional(),
});

const RepeatBlockSchema = z.object({
  repeatCount: z.number().int().min(1).max(30),
  steps: z.array(WorkoutStepSchema).min(1).max(8),
});

const WorkoutItemSchema = z.union([WorkoutStepSchema, RepeatBlockSchema]);

const WorkoutDefinitionSchema = z.object({
  name: z.string().max(16),
  sport: z.enum(["running", "cycling", "swimming", "walking", "generic"]),
  description: z.string().max(254).optional(),
  items: z.array(WorkoutItemSchema).min(1).max(12),
});

const TrainingPhaseSchema = z.object({
  phase: z.string().max(64),
  weeks: z.number().int().min(1),
  startWeek: z.number().int().min(1),
  endWeek: z.number().int().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal: z.string().max(300),
  keyFocus: z.string().max(200),
  race: z.string().nullable().optional(),
  weekTemplate: z.array(WorkoutDefinitionSchema).min(1).max(6),
});

const LongTermPlanSchema = z.object({
  summary: z.string().max(800),
  totalWeeks: z.number().int().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phases: z.array(TrainingPhaseSchema).min(1).max(16),
});

export async function POST(request: Request) {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return Response.json(
      { error: "Missing ANTHROPIC_API_KEY. Add it to your environment and restart the app." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as PlanRequest;
  const promptText = body.prompt?.trim() ?? "";

  if (!promptText) {
    return Response.json({ error: "Prompt is required." }, { status: 400 });
  }

  const analytics = await getWorkoutAnalytics();
  const context = buildAiWorkoutContext(analytics);
  const today = new Date().toISOString().slice(0, 10);

  const { output: plan } = await generateText({
    model: anthropic("claude-sonnet-4-5"),
    output: Output.object({
      schema: LongTermPlanSchema
    }),
    maxRetries: 3,
    system: `You are an expert endurance coach. Today is ${today}.

Build a periodized long-term training plan with these rules:
- weekTemplate has 4 sessions: Mon (strength/generic), Tue (easy/interval run), Thu (tempo/interval run), Sat (long run)
- Strength sessions use sport "generic"
- All names max 16 chars
- durationType "time" = seconds, "distance" = meters
- targetLow/targetHigh only when targetType is heartRate/cadence/power (not "open")
- Race weeks: taper sessions (shorter, easier), set race field to event name
- Progress each phase: longer distances, higher intensity, lower HR ceilings as fitness improves
- For intervals use repeatBlock objects with repeatCount and steps array
- Null race field for non-race phases
- Cover every week from today through the end date in the prompt`,
    prompt: `Athlete request: ${promptText}

Athlete context:
${JSON.stringify(context, null, 2)}`,
    // maxOutputTokens: 16000,
    temperature: 0.2,
  });

  return Response.json(plan);
}
