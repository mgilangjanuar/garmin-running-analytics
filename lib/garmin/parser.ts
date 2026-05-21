import { promises as fs } from "node:fs";
import path from "node:path";

import type { ActivitySplitPoint, NormalizedActivity, WorkoutAnalytics } from "@/lib/garmin/types";

const DATA_DIR = path.join(process.cwd(), "data");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const numericDate = new Date(numeric);
      if (!Number.isNaN(numericDate.getTime())) return numericDate;
    }

    const textDate = new Date(value);
    if (!Number.isNaN(textDate.getTime())) return textDate;
  }

  return null;
}

function toIsoDate(value: unknown): string | null {
  const date = toDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function startOfWeekIso(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - day);
  return utc.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonFile(absolutePath: string): Promise<Json> {
  const raw = await fs.readFile(absolutePath, "utf8");
  return JSON.parse(raw) as Json;
}

async function readJsonFilesByPrefix(relativeDirectory: string, prefix: string) {
  const absoluteDirectory = path.join(DATA_DIR, relativeDirectory);
  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(absoluteDirectory))
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  if (fileNames.length === 0) return [];
  return Promise.all(
    fileNames.map(async (fileName) => readJsonFile(path.join(absoluteDirectory, fileName))),
  );
}

async function readSingleJsonBySuffix(relativeDirectory: string, suffix: string) {
  const absoluteDirectory = path.join(DATA_DIR, relativeDirectory);
  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(absoluteDirectory))
      .filter((name) => name.endsWith(suffix))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
  if (fileNames.length === 0) return null;
  return readJsonFile(path.join(absoluteDirectory, fileNames[0]));
}

async function readJsonFilesBySuffix(relativeDirectory: string, suffix: string) {
  const absoluteDirectory = path.join(DATA_DIR, relativeDirectory);
  let fileNames: string[] = [];
  try {
    fileNames = (await fs.readdir(absoluteDirectory))
      .filter((name) => name.endsWith(suffix))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  if (fileNames.length === 0) return [];
  return Promise.all(
    fileNames.map(async (fileName) => readJsonFile(path.join(absoluteDirectory, fileName))),
  );
}

function toArray(value: Json): Json[] {
  return Array.isArray(value) ? value : [];
}

function measurementValue(
  measurements: Json[] | undefined,
  fieldEnum: string,
): number | null {
  if (!measurements) return null;
  const measurement = measurements.find(
    (item) => isRecord(item) && item.fieldEnum === fieldEnum,
  );
  if (!measurement || !isRecord(measurement)) return null;
  return toNumber(measurement.value);
}

function parseActivitySplits(
  rawSplits: Json,
  activityStartIso: string,
  activityDistanceCm: number,
): ActivitySplitPoint[] {
  const splitObjects = toArray(rawSplits).filter(isRecord);
  const primarySplitObjects = splitObjects.filter((split) =>
    [17, 18, 22].includes(toNumber(split.type) ?? -1),
  );
  const sourceSplits = primarySplitObjects.length > 0 ? primarySplitObjects : splitObjects;
  const parsed: ActivitySplitPoint[] = [];

  let cumulativeDistanceKm = 0;
  let elapsedSec = 0;
  const activityStartDate = new Date(activityStartIso);

  sourceSplits.forEach((split, index) => {
    const measurements = Array.isArray(split.measurements) ? split.measurements : undefined;

    const durationFromMeasurement = measurementValue(measurements, "SUM_DURATION");
    const durationSecFromMeasurement =
      durationFromMeasurement !== null ? durationFromMeasurement / 1000 : null;

    const splitStart = toDate(split.startTimeGMT) ?? null;
    const splitEnd = toDate(split.endTimeGMT) ?? null;
    const durationSecFromTimestamp =
      splitStart && splitEnd
        ? Math.max(0, (splitEnd.getTime() - splitStart.getTime()) / 1000)
        : null;

    const durationSec = durationSecFromMeasurement ?? durationSecFromTimestamp ?? 0;
    const distanceCm = measurementValue(measurements, "SUM_DISTANCE");
    const distanceKm = distanceCm !== null ? distanceCm / 100000 : 0;
    if (durationSec <= 0 || distanceKm <= 0) return;

    cumulativeDistanceKm += distanceKm;
    elapsedSec += durationSec;

    const speedMpsRaw = measurementValue(measurements, "WEIGHTED_MEAN_SPEED");
    const speedMps = speedMpsRaw !== null ? speedMpsRaw * 10 : null;
    const paceFromDistance = durationSec / (distanceKm * 60);
    const paceFromSpeed =
      speedMps !== null && speedMps > 0 ? 1000 / (speedMps * 60) : null;
    const paceMinPerKm = round(
      paceFromDistance > 0 ? paceFromDistance : paceFromSpeed ?? 0,
      2,
    );

    const relativeStartSec = splitStart
      ? Math.max(0, (splitStart.getTime() - activityStartDate.getTime()) / 1000)
      : elapsedSec - durationSec;
    const startTime = new Date(activityStartDate.getTime() + relativeStartSec * 1000).toISOString();

    parsed.push({
      index: index + 1,
      startTime,
      durationSec: round(durationSec, 1),
      elapsedSec: round(elapsedSec, 1),
      distanceKm: round(distanceKm, 3),
      cumulativeDistanceKm: round(cumulativeDistanceKm, 3),
      paceMinPerKm: Number.isFinite(paceMinPerKm) && paceMinPerKm > 0 ? paceMinPerKm : null,
      avgHr: measurementValue(measurements, "WEIGHTED_MEAN_HEARTRATE"),
      avgPower: measurementValue(measurements, "WEIGHTED_MEAN_POWER"),
    });
  });

  const totalSplitDistanceKm = parsed.reduce((sum, split) => sum + split.distanceKm, 0);
  const activityDistanceKm = activityDistanceCm > 0 ? activityDistanceCm / 100000 : 0;
  if (parsed.length > 0 && totalSplitDistanceKm > 0 && activityDistanceKm > 0) {
    const scale = activityDistanceKm / totalSplitDistanceKm;
    if (Math.abs(1 - scale) > 0.01 && scale > 0.5 && scale < 1.5) {
      let adjustedCumulative = 0;
      for (const split of parsed) {
        split.distanceKm = round(split.distanceKm * scale, 3);
        adjustedCumulative += split.distanceKm;
        split.cumulativeDistanceKm = round(adjustedCumulative, 3);
        split.paceMinPerKm =
          split.durationSec > 0 && split.distanceKm > 0
            ? round(split.durationSec / (split.distanceKm * 60), 2)
            : split.paceMinPerKm;
      }
    }
  }

  return parsed;
}

function extractSummarizedActivities(rawFiles: Json[]): JsonObject[] {
  const activities: JsonObject[] = [];
  for (const raw of rawFiles) {
    const container = toArray(raw)[0];
    if (!isRecord(container)) continue;
    const exportData = container.summarizedActivitiesExport;
    if (!Array.isArray(exportData)) continue;
    for (const entry of exportData) {
      if (isRecord(entry)) activities.push(entry);
    }
  }
  return activities;
}

function normalizeActivities(rawActivities: JsonObject[]): NormalizedActivity[] {
  const normalized = rawActivities
    .map((activity) => {
      const start = toDate(activity.startTimeGmt ?? activity.startTimeGMT ?? activity.beginTimestamp);
      if (!start) return null;

      // Garmin summarized export stores distance in centimeters and durations in milliseconds.
      const distanceCm = toNumber(activity.distance) ?? 0;
      const durationMs =
        toNumber(activity.movingDuration) ?? toNumber(activity.elapsedDuration) ?? toNumber(activity.duration) ?? 0;
      const distanceM = distanceCm / 100;
      const durationSec = durationMs / 1000;
      const avgSpeedMps = distanceM > 0 && durationSec > 0 ? distanceM / durationSec : null;
      const paceMinPerKm =
        avgSpeedMps && avgSpeedMps > 0 ? round(1000 / (avgSpeedMps * 60), 2) : null;

      return {
        id: toNumber(activity.activityId) ?? 0,
        name: typeof activity.name === "string" ? activity.name : "Untitled activity",
        sport:
          typeof activity.activityType === "string"
            ? activity.activityType
            : typeof activity.sportType === "string"
              ? activity.sportType
              : "unknown",
        startTime: start.toISOString(),
        distanceKm: round(distanceCm / 100000, 2),
        durationHours: round(durationMs / 3600000, 2),
        avgSpeedMps: avgSpeedMps ? round(avgSpeedMps, 2) : null,
        paceMinPerKm,
        avgHr: toNumber(activity.avgHr),
        maxHr: toNumber(activity.maxHr),
        avgPower: toNumber(activity.avgPower),
        calories: toNumber(activity.calories),
        trainingLoad: toNumber(activity.activityTrainingLoad),
        steps: toNumber(activity.steps),
        splits: parseActivitySplits(activity.splits, start.toISOString(), distanceCm),
      } satisfies NormalizedActivity;
    })
    .filter((item): item is NormalizedActivity => item !== null)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const deduped = new Map<string, NormalizedActivity>();
  for (const activity of normalized) {
    deduped.set(`${activity.id}-${activity.startTime}`, activity);
  }

  return [...deduped.values()].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

function aggregateByTimeBucket(
  activities: NormalizedActivity[],
  getKey: (date: Date) => string,
) {
  const buckets = new Map<
    string,
    { activities: number; distanceKm: number; durationHours: number; trainingLoad: number }
  >();

  for (const activity of activities) {
    const key = getKey(new Date(activity.startTime));
    const current = buckets.get(key) ?? {
      activities: 0,
      distanceKm: 0,
      durationHours: 0,
      trainingLoad: 0,
    };

    current.activities += 1;
    current.distanceKm += activity.distanceKm;
    current.durationHours += activity.durationHours;
    current.trainingLoad += activity.trainingLoad ?? 0;

    buckets.set(key, current);
  }

  return [...buckets.entries()]
    .map(([date, item]) => ({
      date,
      activities: item.activities,
      distanceKm: round(item.distanceKm),
      durationHours: round(item.durationHours),
      trainingLoad: round(item.trainingLoad, 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseTrainingHistory(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => ({
      date: toIsoDate(item.calendarDate ?? item.timestamp),
      status: typeof item.trainingStatus === "string" ? item.trainingStatus : "UNKNOWN",
      fitnessLevelTrend: typeof item.fitnessLevelTrend === "string" ? item.fitnessLevelTrend : "UNKNOWN",
      sport: typeof item.sport === "string" ? item.sport : "UNKNOWN",
    }))
    .filter((item): item is { date: string; status: string; fitnessLevelTrend: string; sport: string } =>
      Boolean(item.date),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseAcuteLoad(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate ?? item.timestamp);
      if (!date) return null;

      return {
        date,
        acwrPercent: toNumber(item.acwrPercent) ?? 0,
        ratio: round(toNumber(item.dailyAcuteChronicWorkloadRatio) ?? 0, 2),
        status: typeof item.acwrStatus === "string" ? item.acwrStatus : "UNKNOWN",
        acute: toNumber(item.dailyTrainingLoadAcute) ?? 0,
        chronic: toNumber(item.dailyTrainingLoadChronic) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseReadiness(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate ?? item.timestamp);
      if (!date) return null;

      return {
        date,
        score: toNumber(item.score) ?? 0,
        level: typeof item.level === "string" ? item.level : "UNKNOWN",
        recoveryTimeHours: round((toNumber(item.recoveryTime) ?? 0) / 60, 1),
        acuteLoad: toNumber(item.acuteLoad) ?? 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseVo2(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate ?? item.updateTimestamp);
      const vo2Max = toNumber(item.vo2MaxValue);
      const maxMet = toNumber(item.maxMet);

      if (!date || vo2Max === null || maxMet === null) return null;

      return {
        date,
        vo2Max: round(vo2Max, 1),
        maxMet: round(maxMet, 2),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseRacePredictions(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate ?? item.timestamp);
      if (!date) return null;
      // Support both old export field names and new API field names
      const t5k = toNumber(item.raceTime5K ?? item.time5K) ?? 0;
      const t10k = toNumber(item.raceTime10K ?? item.time10K) ?? 0;
      const thalf = toNumber(item.raceTimeHalf ?? item.timeHalfMarathon) ?? 0;
      const tmarathon = toNumber(item.raceTimeMarathon ?? item.timeMarathon) ?? 0;
      if (t5k === 0 && t10k === 0) return null;
      return {
        date,
        raceTime5KMin: round(t5k / 60, 1),
        raceTime10KMin: round(t10k / 60, 1),
        raceTimeHalfMin: round(thalf / 60, 1),
        raceTimeMarathonMin: round(tmarathon / 60, 1),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseSleep(rows: Json[]) {
  return rows
    .flatMap((fileData) => toArray(fileData))
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate);
      if (!date) return null;
      const sleepScores = isRecord(item.sleepScores) ? item.sleepScores : null;
      return {
        date,
        score: toNumber(sleepScores?.overallScore) ?? 0,
        durationHours: round(
          ((toNumber(item.deepSleepSeconds) ?? 0) +
            (toNumber(item.lightSleepSeconds) ?? 0) +
            (toNumber(item.remSleepSeconds) ?? 0)) /
            3600,
          2,
        ),
        deepHours: round((toNumber(item.deepSleepSeconds) ?? 0) / 3600, 2),
        remHours: round((toNumber(item.remSleepSeconds) ?? 0) / 3600, 2),
        awakeMinutes: round((toNumber(item.awakeSleepSeconds) ?? 0) / 60, 1),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseHealthStatus(raw: Json) {
  return toArray(raw)
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => {
      const date = toIsoDate(item.calendarDate);
      if (!date) return null;
      const metrics = Array.isArray(item.metrics)
        ? item.metrics.filter((metric): metric is JsonObject => isRecord(metric))
        : [];
      const hrvMetric = metrics.find((metric) => metric.type === "HRV");
      const stressMetric = metrics.find((metric) => metric.type === "STRESS");

      return {
        date,
        hrv: hrvMetric ? toNumber(hrvMetric.value) : null,
        hrvStatus: hrvMetric && typeof hrvMetric.status === "string" ? hrvMetric.status : null,
        stress: stressMetric ? toNumber(stressMetric.value) : null,
        stressStatus: stressMetric && typeof stressMetric.status === "string" ? stressMetric.status : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseWorkoutData(raw: Json) {
  const root = toArray(raw)[0];
  if (!isRecord(root)) {
    return {
      libraryCount: 0,
      scheduled: [],
    };
  }

  const workoutList = Array.isArray(root.workoutList)
    ? root.workoutList.filter((item): item is JsonObject => isRecord(item))
    : [];
  const workoutSchedule = Array.isArray(root.workoutScheduleList)
    ? root.workoutScheduleList.filter((item): item is JsonObject => isRecord(item))
    : [];

  const scheduled = workoutSchedule
    .map((item) => ({
      id: toNumber(item.workoutScheduleId) ?? 0,
      name: typeof item.workoutName === "string" ? item.workoutName : "Untitled workout",
      sport: typeof item.sportType === "string" ? item.sportType : "GENERIC",
      calendarDate: toIsoDate(item.calendarDate) ?? "",
      description: "",
      steps: 0,
      workoutId: toNumber(item.workoutId),
    }))
    .map((scheduleItem) => {
      const workout = workoutList.find(
        (item) => toNumber(item.workoutId) === scheduleItem.workoutId,
      );
      const steps = Array.isArray(workout?.workoutSteps) ? workout.workoutSteps.length : 0;
      return {
        id: scheduleItem.id,
        name: scheduleItem.name,
        sport:
          typeof workout?.sportType === "string"
            ? workout.sportType
            : scheduleItem.sport,
        calendarDate: scheduleItem.calendarDate,
        description:
          typeof workout?.description === "string" && workout.description.length > 0
            ? workout.description
            : "",
        steps,
      };
    })
    .filter((item) => item.calendarDate.length > 0)
    .sort((a, b) => b.calendarDate.localeCompare(a.calendarDate));

  return {
    libraryCount: workoutList.length,
    scheduled,
  };
}

function parseThresholds(raw: Json) {
  const first = toArray(raw)[0];
  if (!isRecord(first)) {
    return {
      lactateThresholdHeartRate: null,
      functionalThresholdPower: null,
    };
  }
  return {
    lactateThresholdHeartRate: toNumber(first.lactateThresholdHeartRate),
    functionalThresholdPower: toNumber(first.functionalThresholdPower),
  };
}

function parseHeartRateZones(raw: Json) {
  const first = toArray(raw)[0];
  if (!isRecord(first)) return null;
  return {
    method: typeof first.trainingMethod === "string" ? first.trainingMethod : null,
    zone1Floor: toNumber(first.zone1Floor),
    zone2Floor: toNumber(first.zone2Floor),
    zone3Floor: toNumber(first.zone3Floor),
    zone4Floor: toNumber(first.zone4Floor),
    zone5Floor: toNumber(first.zone5Floor),
    maxHrUsed: toNumber(first.maxHeartRateUsed),
    restingHrUsed: toNumber(first.restingHeartRateUsed),
  };
}

function parsePowerZones(raw: Json) {
  return toArray(raw)
    .filter((item): item is JsonObject => isRecord(item))
    .map((item) => ({
      sport: typeof item.sport === "string" ? item.sport : "UNKNOWN",
      ftp: toNumber(item.functionalThresholdPower),
      zone1Floor: toNumber(item.zone1Floor),
      zone2Floor: toNumber(item.zone2Floor),
      zone3Floor: toNumber(item.zone3Floor),
      zone4Floor: toNumber(item.zone4Floor),
      zone5Floor: toNumber(item.zone5Floor),
    }));
}

const PR_TYPE_MAP: Record<number, { name: string; unit: "time_s" | "distance_m" | "count" }> = {
  1: { name: "Fastest 1K", unit: "time_s" },
  2: { name: "Fastest 1 Mile", unit: "time_s" },
  3: { name: "Fastest 5K", unit: "time_s" },
  4: { name: "Fastest 10K", unit: "time_s" },
  5: { name: "Fastest Half Marathon", unit: "time_s" },
  6: { name: "Marathon", unit: "time_s" },
  7: { name: "Longest Run", unit: "distance_m" },
};

function parsePersonalRecords(raw: Json) {
  const first = toArray(raw)[0];
  if (!isRecord(first)) return [];
  const personalRecords = Array.isArray(first.personalRecords)
    ? first.personalRecords.filter(
        (item): item is JsonObject => isRecord(item),
      )
    : [];
  return personalRecords
    .filter((item) => item.status === "ACCEPTED")
    .map((item) => {
      const numericId = toNumber(item.personalRecordType);
      const meta = numericId !== null ? PR_TYPE_MAP[numericId] : undefined;
      const rawType = typeof item.personalRecordType === "string"
        ? item.personalRecordType
        : numericId !== null ? String(numericId) : "Unknown";
      return {
        type: meta?.name ?? rawType,
        unit: meta?.unit ?? "count" as "time_s" | "distance_m" | "count",
        value: toNumber(item.value) ?? 0,
        date: toIsoDate(item.prStartTimeGMT) ?? toIsoDate(item.createdDate) ?? "",
        isCurrent: true,
      };
    })
    .filter((item) => item.date.length > 0 && item.type !== "Unknown")
    .sort((a, b) => {
      const nameOrder = Object.values(PR_TYPE_MAP).map((m) => m.name);
      const ai = nameOrder.indexOf(a.type);
      const bi = nameOrder.indexOf(b.type);
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return b.date.localeCompare(a.date);
    });
}

function parseGear(raw: Json) {
  const first = toArray(raw)[0];
  if (!isRecord(first)) return [];
  const gears = Array.isArray(first.gearDTOS)
    ? first.gearDTOS.filter((item): item is JsonObject => isRecord(item))
    : [];
  return gears
    .map((item) => ({
      name:
        typeof item.customMakeModel === "string" && item.customMakeModel.length > 0
          ? item.customMakeModel
          : "Unnamed gear",
      type: typeof item.gearTypeName === "string" ? item.gearTypeName : "Unknown",
      status: typeof item.gearStatusName === "string" ? item.gearStatusName : "unknown",
      startedAt: toIsoDate(item.dateBegin),
      maxKm: round((toNumber(item.maximumMeters) ?? 0) / 1000, 1),
    }))
    .sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
}

function createInsights(analytics: WorkoutAnalytics) {
  const insights: string[] = [];
  const activities = analytics.activities.all;

  const earliestActivities = activities.slice(0, Math.min(10, activities.length));
  const latestActivities = activities.slice(Math.max(activities.length - 10, 0));

  const earlyAvgDistance = avg(earliestActivities.map((item) => item.distanceKm));
  const latestAvgDistance = avg(latestActivities.map((item) => item.distanceKm));
  const distanceDelta = latestAvgDistance - earlyAvgDistance;

  if (activities.length > 0) {
    insights.push(
      `You logged ${analytics.totals.activities} sessions since ${analytics.period.start}, covering ${round(
        analytics.totals.distanceKm,
        1,
      )} km total.`,
    );
  }

  if (distanceDelta > 0.2) {
    insights.push(
      `Average distance per session has increased by ${round(distanceDelta, 2)} km comparing your latest block vs your first block.`,
    );
  } else if (distanceDelta < -0.2) {
    insights.push(
      `Recent average distance is ${round(Math.abs(distanceDelta), 2)} km lower than your early period; consider if this was intentional recovery or reduced volume.`,
    );
  }

  const vo2 = analytics.trends.vo2Max;
  if (vo2.length > 1) {
    const vo2Delta = vo2[vo2.length - 1].vo2Max - vo2[0].vo2Max;
    insights.push(
      `VO2 max changed by ${round(vo2Delta, 1)} (${vo2[0].vo2Max} → ${vo2[vo2.length - 1].vo2Max}) over the recorded period.`,
    );
  }

  const readiness = analytics.trends.readiness;
  if (readiness.length > 0) {
    const recentReadiness = readiness.slice(-14).map((item) => item.score);
    insights.push(
      `Your latest 14-day readiness average is ${round(avg(recentReadiness), 0)} / 100.`,
    );
  }

  const sleep = analytics.trends.sleep;
  if (sleep.length > 0) {
    const recentSleepHours = sleep.slice(-14).map((item) => item.durationHours);
    insights.push(
      `Recent 14-day average sleep duration is ${round(avg(recentSleepHours), 1)} hours.`,
    );
  }

  return insights;
}

export async function getWorkoutAnalytics(): Promise<WorkoutAnalytics> {
  const [
    summarizedActivitiesRaw,
    workoutRaw,
    trainingHistoryRaw,
    acuteLoadRaw,
    readinessRaw,
    vo2Raw,
    racePredictionRaw,
    sleepRaw,
    healthRaw,
    thresholdsRaw,
    heartRateZonesRaw,
    powerZonesRaw,
    personalRecordsRaw,
    gearRaw,
  ] = await Promise.all([
    readJsonFilesBySuffix("DI-Connect-Fitness", "_summarizedActivities.json"),
    readSingleJsonBySuffix("DI-Connect-Fitness", "_workout.json"),
    readJsonFilesByPrefix("DI-Connect-Metrics", "TrainingHistory_"),
    readJsonFilesByPrefix("DI-Connect-Metrics", "MetricsAcuteTrainingLoad_"),
    readJsonFilesByPrefix("DI-Connect-Metrics", "TrainingReadinessDTO_"),
    readJsonFilesByPrefix("DI-Connect-Metrics", "MetricsMaxMetData_"),
    readJsonFilesByPrefix("DI-Connect-Metrics", "RunRacePredictions_"),
    readJsonFilesByPrefix("DI-Connect-Wellness", ""),
    readSingleJsonBySuffix("DI-Connect-Wellness", "healthStatusData.json"),
    readSingleJsonBySuffix("DI-Connect-Wellness", "_bioMetrics_latest.json"),
    readSingleJsonBySuffix("DI-Connect-Wellness", "_heartRateZones.json"),
    readSingleJsonBySuffix("DI-Connect-Wellness", "_powerZones.json"),
    readSingleJsonBySuffix("DI-Connect-Fitness", "_personalRecord.json"),
    readSingleJsonBySuffix("DI-Connect-Fitness", "_gear.json"),
  ]);

  const activities = normalizeActivities(extractSummarizedActivities(summarizedActivitiesRaw));

  const weeklyVolume = aggregateByTimeBucket(activities, startOfWeekIso);
  const monthlyVolume = aggregateByTimeBucket(activities, (date) =>
    date.toISOString().slice(0, 7),
  );
  const sportBuckets = new Map<string, { activities: number; distanceKm: number; durationHours: number }>();
  for (const activity of activities) {
    const key = activity.sport;
    const current = sportBuckets.get(key) ?? { activities: 0, distanceKm: 0, durationHours: 0 };
    current.activities += 1;
    current.distanceKm += activity.distanceKm;
    current.durationHours += activity.durationHours;
    sportBuckets.set(key, current);
  }

  const totals = activities.reduce(
    (acc, item) => {
      acc.distanceKm += item.distanceKm;
      acc.durationHours += item.durationHours;
      acc.calories += item.calories ?? 0;
      acc.trainingLoad += item.trainingLoad ?? 0;
      return acc;
    },
    {
      activities: activities.length,
      distanceKm: 0,
      durationHours: 0,
      calories: 0,
      trainingLoad: 0,
    },
  );

  const sleep = parseSleep(
    sleepRaw.filter(
      (fileData, index) =>
        Array.isArray(fileData) &&
        index >= 0 &&
        // sleep files always include this marker in file payload
        toArray(fileData).some((entry) => isRecord(entry) && "sleepStartTimestampGMT" in entry),
    ),
  );

  const periodStart = activities[0]?.startTime ?? new Date().toISOString();
  const periodEnd = activities.at(-1)?.startTime ?? new Date().toISOString();
  const periodDays = Math.max(
    1,
    Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86_400_000),
  );

  const analytics: WorkoutAnalytics = {
    generatedAt: new Date().toISOString(),
    period: {
      start: periodStart.slice(0, 10),
      end: periodEnd.slice(0, 10),
      totalDays: periodDays,
    },
    totals: {
      activities: totals.activities,
      distanceKm: round(totals.distanceKm, 1),
      durationHours: round(totals.durationHours, 1),
      calories: round(totals.calories, 0),
      trainingLoad: round(totals.trainingLoad, 0),
      averageDistancePerActivityKm:
        totals.activities > 0 ? round(totals.distanceKm / totals.activities, 2) : 0,
    },
    trends: {
      weeklyVolume,
      monthlyVolume,
      readiness: parseReadiness(readinessRaw),
      acuteLoad: parseAcuteLoad(acuteLoadRaw),
      vo2Max: parseVo2(vo2Raw),
      racePrediction: parseRacePredictions(racePredictionRaw),
      sleep,
      health: parseHealthStatus(healthRaw),
      trainingStatus: parseTrainingHistory(trainingHistoryRaw),
    },
    sportDistribution: [...sportBuckets.entries()]
      .map(([sport, item]) => ({
        sport,
        activities: item.activities,
        distanceKm: round(item.distanceKm, 1),
        durationHours: round(item.durationHours, 1),
      }))
      .sort((a, b) => b.durationHours - a.durationHours),
    activities: {
      latest: [...activities].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 15),
      all: activities,
    },
    workouts: parseWorkoutData(workoutRaw),
    zones: {
      heartRate: parseHeartRateZones(heartRateZonesRaw),
      power: parsePowerZones(powerZonesRaw),
    },
    thresholds: parseThresholds(thresholdsRaw),
    personalRecords: parsePersonalRecords(personalRecordsRaw),
    gear: parseGear(gearRaw),
    insights: [],
  };

  analytics.insights = createInsights(analytics);
  return analytics;
}
