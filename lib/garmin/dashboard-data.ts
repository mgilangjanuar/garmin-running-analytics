import { chromium } from "playwright-core";
import type { WorkoutAnalytics, NormalizedActivity, TrendPoint } from "@/lib/garmin/types";

const GARMIN_BASE = "https://connect.garmin.com";
const API_BASE = `${GARMIN_BASE}/gc-api`;

async function garminFetch<T = unknown>(page: import("playwright-core").Page, urlPath: string): Promise<T> {
  return page.evaluate(async ([fullUrl]) => {
    const csrfMeta = document.querySelector<HTMLMetaElement>("meta[name='csrf-token'], meta[name='_csrf']");
    const csrf = csrfMeta?.content ?? "";
    const res = await fetch(fullUrl, {
      credentials: "include",
      headers: {
        "accept": "application/json",
        ...(csrf ? { "connect-csrf-token": csrf } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [`${API_BASE}${urlPath}`]) as Promise<T>;
}

function toTimestamp(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function toIsoDate(dateStr: string | number | null): string | null {
  if (!dateStr) return null;
  const ts = typeof dateStr === "number" ? dateStr : toTimestamp(dateStr);
  if (!ts) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

async function loginAndGetPage(email: string, password: string): Promise<import("playwright-core").Page> {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : { channel: "chrome" }),
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    delete (Object.getPrototypeOf(navigator) as Record<string, unknown>).webdriver;
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    (window as unknown as Record<string, unknown>).chrome = {
      app: { isInstalled: false },
      runtime: {},
      csi: () => ({}),
      loadTimes: () => ({}),
    };
  });

  const page = await context.newPage();

  await page.goto(`${GARMIN_BASE}/signin`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  const emailField = await page.$("#email");
  if (emailField) {
    await emailField.fill(email);
    await page.waitForTimeout(600);
  }

  const passwordField = await page.$("#password");
  if (passwordField) {
    await passwordField.fill(password);
    await page.waitForTimeout(600);
  }

  const submitBtn = await page.$('button[type="submit"]');
  if (submitBtn) await submitBtn.click();

  await page.waitForTimeout(15000);

  let currentUrl = page.url();

  if (!currentUrl.includes("connect.garmin.com/app/")) {
    const has2FA = await page.$("#mfa-pin, #mfa-code");
    if (has2FA) {
      await browser.close();
      throw new Error("2FA required.");
    }
    await page.waitForTimeout(20000);
    currentUrl = page.url();
  }

  if (!currentUrl.includes("connect.garmin.com/app/")) {
    await browser.close();
    throw new Error("Login failed. Check credentials.");
  }

  return page;
}

export async function fetchGarminDashboardData(): Promise<WorkoutAnalytics> {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("GARMIN_EMAIL and GARMIN_PASSWORD must be set.");
  }

  let page: import("playwright-core").Page | null = null;

  try {
    page = await loginAndGetPage(email, password);

    const now = new Date();
    const startDateStr = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const endDateStr = now.toISOString().slice(0, 10);

    const userProfile = await garminFetch<Record<string, unknown>>(page, `/userprofile-service/socialProfile`);
    const garminGUID = userProfile.displayName as string;

    const [
      activities,
      personalInfo,
      hrZones,
      vo2MaxDaily,
      sleepStats,
      prs,
      gear,
    ] = await Promise.all([
      garminFetch<Array<Record<string, unknown>>>(page, `/activitylist-service/activities/search/activities?limit=100&start=0`),
      garminFetch(page, `/userprofile-service/userprofile/personal-information/${garminGUID}`),
      garminFetch<Array<Record<string, unknown>>>(page, `/biometric-service/heartRateZones/`),
      garminFetch<Array<Record<string, unknown>>>(page, `/metrics-service/metrics/maxmet/daily/${startDateStr}/${endDateStr}`),
      garminFetch<Record<string, unknown>>(page, `/sleep-service/stats/sleep/daily/${startDateStr}/${endDateStr}`),
      garminFetch<Array<Record<string, unknown>>>(page, `/personalrecord-service/personalrecord/prs/${garminGUID}`),
      garminFetch<Array<Record<string, unknown>>>(page, `/gear-service/gear/v2/list`),
    ]);

    const readinessData: unknown[] = [];
    const readStart = new Date(now);
    readStart.setDate(readStart.getDate() - 90);
    for (let d = new Date(readStart); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      try {
        const data = await garminFetch(page, `/metrics-service/metrics/trainingreadiness/${dateStr}`);
        if (Array.isArray(data) && data.length > 0) readinessData.push(...(data as unknown[]));
      } catch {
        // skip
      }
    }

    const normalizedActivities: NormalizedActivity[] = activities.map((a) => {
      const distanceM = (a.distance as number) ?? 0;
      const durationS = (a.movingDuration ?? a.elapsedDuration ?? a.duration) as number ?? 0;
      const speedMs = (a.avgSpeed as number) ?? (distanceM > 0 && durationS > 0 ? distanceM / durationS : 0);

      return {
        id: a.activityId as number,
        name: (a.activityName as string) ?? "Untitled",
        sport: ((a.activityType as Record<string, unknown>)?.typeKey ?? (a.sportType as Record<string, unknown>)?.typeKey ?? "unknown") as string,
        startTime: toIsoDate(a.startTimeGMT as string | null) ?? now.toISOString(),
        distanceKm: round(distanceM / 1000, 2),
        durationHours: round(durationS / 3600, 2),
        avgSpeedMps: speedMs > 0 ? round(speedMs, 2) : null,
        paceMinPerKm: speedMs > 0 ? round(1000 / (speedMs * 60), 2) : null,
        avgHr: (a.avgHR as number) ?? null,
        maxHr: (a.maxHR as number) ?? null,
        avgPower: (a.avgPower as number) ?? null,
        calories: (a.calories as number) ?? null,
        trainingLoad: (a.activityTrainingLoad as number) ?? null,
        steps: (a.steps as number) ?? null,
        splits: [],
      };
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    const totals = normalizedActivities.reduce(
      (acc, item) => {
        acc.distanceKm += item.distanceKm;
        acc.durationHours += item.durationHours;
        acc.calories += item.calories ?? 0;
        acc.trainingLoad += item.trainingLoad ?? 0;
        return acc;
      },
      { activities: normalizedActivities.length, distanceKm: 0, durationHours: 0, calories: 0, trainingLoad: 0 },
    );

    const periodStart = normalizedActivities[0]?.startTime ?? now.toISOString();
    const periodEnd = normalizedActivities.at(-1)?.startTime ?? now.toISOString();
    const periodDays = Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86_400_000));

    const vo2MaxTrend: Array<TrendPoint & { vo2Max: number; maxMet: number }> = vo2MaxDaily.map((item) => {
      const generic = item.generic as Record<string, unknown> | null;
      const calDate = generic?.calendarDate ?? item.calendarDate;
      return {
        date: toIsoDate(calDate as string | number | null) ?? "",
        vo2Max: round((generic?.vo2MaxValue ?? generic?.vo2MaxPreciseValue) as number ?? 0, 1),
        maxMet: round(((generic?.vo2MaxValue as number) ?? 0) / 3.5, 2),
      };
    }).filter((v) => v.date);

    const readinessTrend: Array<TrendPoint & { score: number; level: string; recoveryTimeHours: number; acuteLoad: number }> = (readinessData as Array<Record<string, unknown>>).map((item) => ({
      date: toIsoDate(item.calendarDate as string | number | null) ?? "",
      score: (item.score as number) ?? 0,
      level: (item.level as string) ?? "UNKNOWN",
      recoveryTimeHours: round(((item.recoveryTime as number) ?? 0) / 60, 1),
      acuteLoad: (item.acuteLoad as number) ?? 0,
    })).filter((r) => r.date);

    const sleepTrend: Array<TrendPoint & { score: number; durationHours: number; deepHours: number; remHours: number; awakeMinutes: number }> = (sleepStats.sleepDailySummaries as Array<Record<string, unknown>> ?? []).map((s) => ({
      date: toIsoDate(s.calendarDate as string | number | null) ?? "",
      score: (s.sleepScore as number) ?? 0,
      durationHours: round(((s.sleepTimeSeconds as number) ?? 0) / 3600, 2),
      deepHours: round(((s.deepSleepSeconds as number) ?? 0) / 3600, 2),
      remHours: round(((s.remSleepSeconds as number) ?? 0) / 3600, 2),
      awakeMinutes: round(((s.awakeSleepSeconds as number) ?? 0) / 60, 1),
    })).filter((s) => s.date);

    const insights: string[] = [];
    if (normalizedActivities.length > 0) {
      insights.push(`You logged ${totals.activities} sessions since ${periodStart.slice(0, 10)}, covering ${round(totals.distanceKm, 1)} km total.`);
    }
    if (vo2MaxTrend.length > 1) {
      const vo2Delta = vo2MaxTrend[vo2MaxTrend.length - 1].vo2Max - vo2MaxTrend[0].vo2Max;
      insights.push(`VO2 max changed by ${round(vo2Delta, 1)} (${vo2MaxTrend[0].vo2Max} → ${vo2MaxTrend[vo2MaxTrend.length - 1].vo2Max}) over the recorded period.`);
    }
    if (readinessTrend.length > 0) {
      const recentReadiness = readinessTrend.slice(-14).map((item) => item.score);
      const avgReadiness = recentReadiness.reduce((a, b) => a + b, 0) / recentReadiness.length;
      insights.push(`Your latest 14-day readiness average is ${round(avgReadiness, 0)} / 100.`);
    }
    if (sleepTrend.length > 0) {
      const recentSleepHours = sleepTrend.slice(-14).map((item) => item.durationHours);
      const avgSleep = recentSleepHours.reduce((a, b) => a + b, 0) / recentSleepHours.length;
      insights.push(`Recent 14-day average sleep duration is ${round(avgSleep, 1)} hours.`);
    }

    const hrZoneData = hrZones[0] as Record<string, unknown> | null;

    return {
      generatedAt: now.toISOString(),
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
        averageDistancePerActivityKm: totals.activities > 0 ? round(totals.distanceKm / totals.activities, 2) : 0,
      },
      trends: {
        weeklyVolume: [],
        monthlyVolume: [],
        readiness: readinessTrend,
        acuteLoad: [],
        vo2Max: vo2MaxTrend,
        racePrediction: [],
        sleep: sleepTrend,
        health: [],
        trainingStatus: [],
      },
      sportDistribution: [],
      activities: {
        latest: [...normalizedActivities].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, 15),
        all: normalizedActivities,
      },
      workouts: { libraryCount: 0, scheduled: [] },
      zones: {
        heartRate: hrZoneData ? {
          method: (hrZoneData.trainingMethod as string) ?? null,
          zone1Floor: (hrZoneData.zone1Floor as number) ?? null,
          zone2Floor: (hrZoneData.zone2Floor as number) ?? null,
          zone3Floor: (hrZoneData.zone3Floor as number) ?? null,
          zone4Floor: (hrZoneData.zone4Floor as number) ?? null,
          zone5Floor: (hrZoneData.zone5Floor as number) ?? null,
          maxHrUsed: (hrZoneData.maxHeartRateUsed as number) ?? null,
          restingHrUsed: (hrZoneData.restingHeartRateUsed as number) ?? null,
        } : null,
        power: [],
      },
      thresholds: {
        lactateThresholdHeartRate: ((personalInfo as Record<string, unknown>)?.biometricProfile as Record<string, unknown>)?.lactateThresholdHeartRate as number ?? null,
        functionalThresholdPower: ((personalInfo as Record<string, unknown>)?.biometricProfile as Record<string, unknown>)?.functionalThresholdPower as number ?? null,
      },
      personalRecords: prs.map((pr) => {
        const numericId = typeof pr.typeId === "number" ? pr.typeId : null;
        const PR_TYPE_MAP: Record<number, { name: string; unit: "time_s" | "distance_m" | "count" }> = {
          1: { name: "Fastest 1K", unit: "time_s" },
          2: { name: "Fastest 1 Mile", unit: "time_s" },
          3: { name: "Fastest 5K", unit: "time_s" },
          4: { name: "Fastest 10K", unit: "time_s" },
          5: { name: "Fastest Half Marathon", unit: "time_s" },
          6: { name: "Fastest Marathon", unit: "time_s" },
          7: { name: "Longest Run", unit: "distance_m" },
        };
        const meta = numericId !== null ? PR_TYPE_MAP[numericId] : undefined;
        return {
          type: meta?.name ?? (pr.typeId as string) ?? "Unknown",
          unit: meta?.unit ?? ("count" as "time_s" | "distance_m" | "count"),
          value: (pr.value ?? pr.duration) as number ?? 0,
          date: toIsoDate(pr.activityStartDateTimeInGMT as string | null) ?? "",
          isCurrent: (pr.status as string) === "ACCEPTED",
        };
      }).filter((pr) => pr.type !== "Unknown"),
      gear: gear.map((g) => ({
        name: (g.brand as string) ?? "Unnamed gear",
        type: (g.gearType as string) ?? "Unknown",
        status: (g.status as string) ?? "unknown",
        startedAt: toIsoDate(g.firstUseDate as string | null),
        maxKm: round(((g.maxUsageDistanceMeters as number) ?? 0) / 1000, 1),
      })),
      insights,
    };
  } finally {
    if (page) await page.context().close();
  }
}
