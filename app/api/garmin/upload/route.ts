import {
  isRepeatBlock,
  type LongTermPlan,
  type TrainingPhase,
  type WorkoutDefinition,
  type WorkoutItem,
  type WorkoutStep,
  type IntensityType,
  type DurationType,
  type TargetType,
} from "@/lib/garmin/fit-encoder";
import { uploadWorkoutsViaPlaywright } from "@/lib/garmin/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GARMIN_CONNECT_BASE = "https://connect.garmin.com";
const WORKOUT_API = `${GARMIN_CONNECT_BASE}/gc-api/workout-service/workout`;

type UploadPayload =
  | { mode: "single"; workout: WorkoutDefinition }
  | { mode: "phase"; phase: TrainingPhase }
  | { mode: "full"; plan: LongTermPlan };

type UploadRequest = UploadPayload & { csrfToken?: string; cookies?: string };

export interface UploadResult {
  name: string;
  success: boolean;
  workoutId?: number;
  detail?: string;
}

// ─── Sport mapping ────────────────────────────────────────────────────────────

const SPORT_MAP: Record<string, { sportTypeId: number; sportTypeKey: string; displayOrder: number }> = {
  running:  { sportTypeId: 1,  sportTypeKey: "running",  displayOrder: 1 },
  cycling:  { sportTypeId: 2,  sportTypeKey: "cycling",  displayOrder: 2 },
  swimming: { sportTypeId: 5,  sportTypeKey: "swimming", displayOrder: 5 },
  walking:  { sportTypeId: 11, sportTypeKey: "walking",  displayOrder: 11 },
  generic:  { sportTypeId: 0,  sportTypeKey: "other",    displayOrder: 0 },
};

// ─── Step-type mapping ────────────────────────────────────────────────────────

const STEP_TYPE_MAP: Record<IntensityType, { stepTypeId: number; stepTypeKey: string; displayOrder: number }> = {
  warmup:   { stepTypeId: 1, stepTypeKey: "warmup",   displayOrder: 1 },
  cooldown: { stepTypeId: 2, stepTypeKey: "cooldown", displayOrder: 2 },
  interval: { stepTypeId: 3, stepTypeKey: "interval", displayOrder: 3 },
  active:   { stepTypeId: 3, stepTypeKey: "interval", displayOrder: 3 },
  recovery: { stepTypeId: 4, stepTypeKey: "recovery", displayOrder: 4 },
  rest:     { stepTypeId: 5, stepTypeKey: "rest",     displayOrder: 5 },
};

// ─── End-condition (duration) mapping ─────────────────────────────────────────

type GarminEndCondition = { conditionTypeId: number; conditionTypeKey: string; displayOrder: number; displayable: boolean };

const END_COND_LAP: GarminEndCondition  = { conditionTypeId: 1, conditionTypeKey: "lap.button", displayOrder: 1, displayable: true };
const END_COND_TIME: GarminEndCondition = { conditionTypeId: 2, conditionTypeKey: "time",       displayOrder: 2, displayable: true };
const END_COND_DIST: GarminEndCondition = { conditionTypeId: 3, conditionTypeKey: "distance",   displayOrder: 3, displayable: true };

function endConditionForStep(step: WorkoutStep): { endCondition: GarminEndCondition; endConditionValue: number | null } {
  if (step.durationType === "open") return { endCondition: END_COND_LAP,  endConditionValue: null };
  if (step.durationType === "time") return { endCondition: END_COND_TIME, endConditionValue: step.durationValue };
  return                                   { endCondition: END_COND_DIST, endConditionValue: step.durationValue };
}

// ─── Target mapping ───────────────────────────────────────────────────────────

const TARGET_NO: { workoutTargetTypeId: number; workoutTargetTypeKey: string; displayOrder: number } =
  { workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target", displayOrder: 1 };

const TARGET_HR_ZONE: { workoutTargetTypeId: number; workoutTargetTypeKey: string; displayOrder: number } =
  { workoutTargetTypeId: 4, workoutTargetTypeKey: "heart.rate.zone", displayOrder: 4 };

const TARGET_POWER: { workoutTargetTypeId: number; workoutTargetTypeKey: string; displayOrder: number } =
  { workoutTargetTypeId: 6, workoutTargetTypeKey: "power.zone", displayOrder: 6 };

const TARGET_PACE: { workoutTargetTypeId: number; workoutTargetTypeKey: string; displayOrder: number } =
  { workoutTargetTypeId: 2, workoutTargetTypeKey: "pace.zone", displayOrder: 2 };

const TARGET_CADENCE: { workoutTargetTypeId: number; workoutTargetTypeKey: string; displayOrder: number } =
  { workoutTargetTypeId: 3, workoutTargetTypeKey: "cadence.zone", displayOrder: 3 };

function targetForStep(step: WorkoutStep): {
  targetType: typeof TARGET_NO;
  targetValueOne?: number;
  targetValueTwo?: number;
} {
  const t = step.targetType as TargetType | undefined;
  if (!t || t === "open") return { targetType: TARGET_NO };
  if (t === "heartRate") return {
    targetType: TARGET_HR_ZONE,
    ...(step.targetLow  !== undefined ? { targetValueOne: step.targetLow }  : {}),
    ...(step.targetHigh !== undefined ? { targetValueTwo: step.targetHigh } : {}),
  };
  if (t === "power") return {
    targetType: TARGET_POWER,
    ...(step.targetLow  !== undefined ? { targetValueOne: step.targetLow }  : {}),
    ...(step.targetHigh !== undefined ? { targetValueTwo: step.targetHigh } : {}),
  };
  if (t === "speed") return {
    targetType: TARGET_PACE,
    ...(step.targetLow  !== undefined ? { targetValueOne: step.targetLow }  : {}),
    ...(step.targetHigh !== undefined ? { targetValueTwo: step.targetHigh } : {}),
  };
  if (t === "cadence") return {
    targetType: TARGET_CADENCE,
    ...(step.targetLow  !== undefined ? { targetValueOne: step.targetLow }  : {}),
    ...(step.targetHigh !== undefined ? { targetValueTwo: step.targetHigh } : {}),
  };
  return { targetType: TARGET_NO };
}

// ─── Step & repeat block serialisers ─────────────────────────────────────────

let _stepIdCounter = 0;
function nextStepId() { return ++_stepIdCounter; }

function serializeStep(step: WorkoutStep, stepOrder: number): Record<string, unknown> {
  const stepId = nextStepId();
  const { endCondition, endConditionValue } = endConditionForStep(step);
  const { targetType, targetValueOne, targetValueTwo } = targetForStep(step);
  return {
    stepId,
    stepOrder,
    stepType: STEP_TYPE_MAP[step.intensity] ?? STEP_TYPE_MAP.active,
    type: "ExecutableStepDTO",
    endCondition,
    endConditionValue,
    targetType,
    ...(targetValueOne !== undefined ? { targetValueOne } : {}),
    ...(targetValueTwo !== undefined ? { targetValueTwo } : {}),
    ...(step.notes ? { description: step.notes } : {}),
    category: null,
    exerciseName: null,
  };
}

function serializeRepeatBlock(block: { repeatCount: number; steps: WorkoutStep[] }, stepOrder: number): Record<string, unknown> {
  const groupId = nextStepId();
  const childSteps = block.steps.map((s, i) => serializeStep(s, i + 1));
  return {
    stepId: groupId,
    stepOrder,
    type: "RepeatGroupDTO",
    numberOfIterations: block.repeatCount,
    smartRepeat: false,
    workoutSteps: childSteps,
  };
}

function serializeItems(items: WorkoutItem[]): Record<string, unknown>[] {
  return items.map((item, i) => {
    if (isRepeatBlock(item)) return serializeRepeatBlock(item, i + 1);
    return serializeStep(item, i + 1);
  });
}

// ─── Full workout payload ─────────────────────────────────────────────────────

function buildGarminPayload(workout: WorkoutDefinition): Record<string, unknown> {
  _stepIdCounter = 0;
  const sportType = SPORT_MAP[workout.sport] ?? SPORT_MAP.generic;
  const steps = serializeItems(workout.items);

  return {
    sportType,
    subSportType: null,
    workoutName: workout.name,
    estimatedDistanceUnit: { unitKey: null },
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType,
        workoutSteps: steps,
      },
    ],
    avgTrainingSpeed: 0,
    estimatedDurationInSecs: 0,
    estimatedDistanceInMeters: 0,
    estimateType: null,
    description: workout.description ?? "",
    isWheelchair: false,
  };
}

// ─── Collect all workouts with ordered prefixes ───────────────────────────────

function pad(n: number, total: number): string {
  const digits = String(total).length;
  return String(n).padStart(Math.max(digits, 2), "0");
}

function collectWorkouts(body: UploadPayload): { name: string; workout: WorkoutDefinition }[] {
  if (body.mode === "single") {
    return [{ name: body.workout.name, workout: body.workout }];
  }

  if (body.mode === "phase") {
    const { weekTemplate } = body.phase;
    const total = weekTemplate.length;
    return weekTemplate.map((workout, i) => ({
      name: `${pad(i + 1, total)}: ${workout.name}`,
      workout,
    }));
  }

  const { phases } = body.plan;
  const totalPhases = phases.length;
  const result: { name: string; workout: WorkoutDefinition }[] = [];
  for (const [pi, phase] of phases.entries()) {
    const phaseNum = pad(pi + 1, totalPhases);
    const totalSessions = phase.weekTemplate.length;
    for (const [wi, workout] of phase.weekTemplate.entries()) {
      const sessionNum = pad(wi + 1, totalSessions);
      result.push({ name: `p${phaseNum}-${sessionNum}: ${workout.name}`, workout });
    }
  }
  return result;
}

// ─── Upload a single workout via the Connect JSON API ─────────────────────────

async function uploadWorkout(
  name: string,
  workout: WorkoutDefinition,
  csrfToken: string,
  cookies: string,
): Promise<UploadResult> {
  const namedWorkout: WorkoutDefinition = { ...workout, name };
  const payload = buildGarminPayload(namedWorkout);

  const res = await fetch(WORKOUT_API, {
    method: "POST",
    headers: {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json",
      "connect-csrf-token": csrfToken,
      "cookie": cookies,
      "dnt": "1",
      "origin": GARMIN_CONNECT_BASE,
      "referer": `${GARMIN_CONNECT_BASE}/modern/training/workouts`,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return { name, success: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }

  const json = await res.json() as Record<string, unknown>;
  const workoutId = json.workoutId as number | undefined;
  return { name, success: true, workoutId };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: UploadRequest;
  try {
    body = await request.json() as UploadRequest;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!["single", "phase", "full"].includes(body.mode)) {
    return Response.json({ error: "mode must be single, phase, or full." }, { status: 400 });
  }

  const workouts = collectWorkouts(body);
  if (workouts.length === 0) {
    return Response.json({ error: "No workouts to upload." }, { status: 400 });
  }

  const csrfToken = body.csrfToken?.trim() ?? "";
  const cookies = body.cookies?.trim() ?? "";

  if (csrfToken && cookies) {
    const results: UploadResult[] = [];
    for (const { name, workout } of workouts) {
      const result = await uploadWorkout(name, workout, csrfToken, cookies);
      results.push(result);
    }
    return Response.json({
      ok: results.some((r) => r.success),
      allSuccess: results.every((r) => r.success),
      uploaded: results.filter((r) => r.success).length,
      total: results.length,
      results,
    });
  }

  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    return Response.json(
      { error: "GARMIN_EMAIL and GARMIN_PASSWORD must be set in .env.local." },
      { status: 400 },
    );
  }

  const workloads = workouts.map(({ name, workout }) => ({
    name,
    payload: buildGarminPayload({ ...workout, name }),
  }));

  try {
    const results = await uploadWorkoutsViaPlaywright(email, password, workloads);
    return Response.json({
      ok: results.some((r) => r.success),
      allSuccess: results.every((r) => r.success),
      uploaded: results.filter((r) => r.success).length,
      total: results.length,
      results,
    });
  } catch (err) {
    return Response.json(
      { error: `Garmin login failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
