import { Encoder, Profile } from "@garmin/fitsdk";

export type DurationType = "time" | "distance" | "open";
export type IntensityType = "warmup" | "active" | "cooldown" | "recovery" | "interval" | "rest";
export type TargetType = "open" | "heartRate" | "cadence" | "power" | "speed";

export interface WorkoutStep {
  name: string;
  notes?: string;
  intensity: IntensityType;
  durationType: DurationType;
  durationValue: number;
  targetType?: TargetType;
  targetLow?: number;
  targetHigh?: number;
}

export interface RepeatBlock {
  repeatCount: number;
  steps: WorkoutStep[];
}

export type WorkoutItem = WorkoutStep | RepeatBlock;

export interface WorkoutDefinition {
  name: string;
  sport: "running" | "cycling" | "swimming" | "walking" | "generic";
  description?: string;
  items: WorkoutItem[];
}

export interface WeeklyPlan {
  summary: string;
  workouts: WorkoutDefinition[];
}

export interface TrainingPhase {
  phase: string;
  weeks: number;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
  goal: string;
  keyFocus: string;
  race?: string;
  weekTemplate: WorkoutDefinition[];
}

export interface LongTermPlan {
  summary: string;
  totalWeeks: number;
  startDate: string;
  endDate: string;
  phases: TrainingPhase[];
}

const SPORT_NUM: Record<string, number> = {
  running: 1,
  cycling: 2,
  swimming: 5,
  walking: 11,
  generic: 0,
};

const INTENSITY_NUM: Record<IntensityType, number> = {
  active: 0,
  rest: 1,
  warmup: 2,
  cooldown: 3,
  recovery: 4,
  interval: 5,
};

const DURATION_NUM: Record<DurationType, number> = {
  time: 0,
  distance: 1,
  open: 5,
};

const TARGET_NUM: Record<TargetType, number> = {
  speed: 0,
  heartRate: 1,
  open: 2,
  cadence: 3,
  power: 4,
};

export function isRepeatBlock(item: WorkoutItem): item is RepeatBlock {
  return "repeatCount" in item;
}

function countSteps(items: WorkoutItem[]): number {
  let n = 0;
  for (const item of items) {
    if (isRepeatBlock(item)) {
      n += item.steps.length + 2; // lap-press dummy + child steps + repeat step
    } else {
      n += 1;
    }
  }
  return n;
}

function durationValueToFit(step: WorkoutStep): number {
  if (step.durationType === "time") return step.durationValue * 1000; // seconds → ms
  if (step.durationType === "distance") return step.durationValue * 100; // meters → cm
  return 0; // open
}

function writeWorkoutSteps(encoder: Encoder, items: WorkoutItem[]): void {
  let idx = 0;

  for (const item of items) {
    if (isRepeatBlock(item)) {
      // Dummy "open" step — athlete presses Lap when at their sprint start position
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: idx,
        wktStepName: "Press Lap",
        notes: "Move to start position, then press Lap to begin repeats",
        durationType: DURATION_NUM.open,
        durationValue: 0,
        targetType: TARGET_NUM.open,
        intensity: INTENSITY_NUM.active,
      });
      idx += 1;

      const blockStartIdx = idx;

      for (const step of item.steps) {
        encoder.writeMesg({
          mesgNum: Profile.MesgNum.WORKOUT_STEP,
          messageIndex: idx,
          wktStepName: step.name.slice(0, 16),
          notes: step.notes?.slice(0, 254),
          durationType: DURATION_NUM[step.durationType],
          durationValue: durationValueToFit(step),
          targetType: TARGET_NUM[step.targetType ?? "open"],
          ...(step.targetLow !== undefined ? { customTargetValueLow: step.targetLow } : {}),
          ...(step.targetHigh !== undefined ? { customTargetValueHigh: step.targetHigh } : {}),
          intensity: INTENSITY_NUM[step.intensity],
        });
        idx += 1;
      }

      // Repeat control step: durationType=6 (repeatUntilStepsCmplt), durationValue=reps,
      // customTargetValueLow=index of first step in the block to loop back to
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: idx,
        wktStepName: `Repeat x${item.repeatCount}`,
        durationType: 6,
        durationValue: item.repeatCount,
        targetType: TARGET_NUM.open,
        customTargetValueLow: blockStartIdx,
        intensity: INTENSITY_NUM.active,
      });
      idx += 1;
    } else {
      encoder.writeMesg({
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: idx,
        wktStepName: item.name.slice(0, 16),
        notes: item.notes?.slice(0, 254),
        durationType: DURATION_NUM[item.durationType],
        durationValue: durationValueToFit(item),
        targetType: TARGET_NUM[item.targetType ?? "open"],
        ...(item.targetLow !== undefined ? { customTargetValueLow: item.targetLow } : {}),
        ...(item.targetHigh !== undefined ? { customTargetValueHigh: item.targetHigh } : {}),
        intensity: INTENSITY_NUM[item.intensity],
      });
      idx += 1;
    }
  }
}

const FILE_CREATOR_MESG_NUM = 49;

function writeFileHeader(encoder: Encoder): void {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 5, // workout
    manufacturer: 255,
    product: 0,
    serialNumber: 1,
    timeCreated: new Date(),
  });
  encoder.writeMesg({
    mesgNum: FILE_CREATOR_MESG_NUM,
    softwareVersion: 100,
    hardwareVersion: 0,
  });
}

function writeWorkout(encoder: Encoder, workout: WorkoutDefinition): void {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    sport: SPORT_NUM[workout.sport] ?? 0,
    numValidSteps: countSteps(workout.items),
    wktName: workout.name.slice(0, 16),
    ...(workout.description ? { wktDescription: workout.description.slice(0, 254) } : {}),
  });
  writeWorkoutSteps(encoder, workout.items);
}

export function encodeWorkoutToFit(workout: WorkoutDefinition): Uint8Array {
  const encoder = new Encoder();
  writeFileHeader(encoder);
  writeWorkout(encoder, workout);
  return encoder.close();
}

export interface EncodedWorkoutFile {
  name: string;
  data: Uint8Array;
}

export function encodeWorkoutsToFit(workouts: WorkoutDefinition[]): EncodedWorkoutFile[] {
  return workouts.map((workout) => ({
    name: workout.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50),
    data: encodeWorkoutToFit(workout),
  }));
}

export function encodeWeeklyPlanToFit(plan: WeeklyPlan): EncodedWorkoutFile[] {
  return encodeWorkoutsToFit(plan.workouts);
}
