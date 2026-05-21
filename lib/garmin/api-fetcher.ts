import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const GARMIN_BASE = "https://connect.garmin.com";
const API_BASE = `${GARMIN_BASE}/gc-api`;
const DATA_DIR = path.join(process.cwd(), "data");

export interface SyncProgress {
  step: string;
  totalSteps: number;
  currentStep: number;
}

type OnProgress = (progress: SyncProgress) => void;

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

async function writeJson(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
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
      throw new Error("2FA required. Please log in manually on connect.garmin.com first.");
    }
    await page.waitForTimeout(20000);
    currentUrl = page.url();
  }

  if (!currentUrl.includes("connect.garmin.com/app/")) {
    await browser.close();
    throw new Error("Login failed. Check your Garmin credentials.");
  }

  return page;
}

interface ApiActivity {
  activityId: number;
  activityName: string;
  startTimeGMT?: string;
  startTimeLocal?: string;
  activityType?: { typeKey?: string; typeId?: number };
  sportType?: { typeKey?: string };
  distance?: number;
  duration?: number;
  elapsedDuration?: number;
  movingDuration?: number;
  avgSpeed?: number;
  avgHR?: number;
  maxHR?: number;
  avgPower?: number;
  maxPower?: number;
  calories?: number;
  activityTrainingLoad?: number;
  steps?: number;
  elevationGain?: number;
  elevationLoss?: number;
  avgDoubleCadence?: number;
  maxDoubleCadence?: number;
  avgStrideLength?: number;
  avgGroundContactTime?: number;
  avgVerticalRatio?: number;
  avgVerticalOscillation?: number;
  trainingEffect?: number;
  anaerobicTrainingEffect?: number;
  aerobicTrainingEffect?: number;
}

interface ApiSplit {
  startTimeGMT?: string;
  endTimeGMT?: string;
  distance?: number;
  duration?: number;
  avgHR?: number;
  avgSpeed?: number;
  avgPower?: number;
  avgCadence?: number;
  type?: number;
}

function transformActivityToExport(api: ApiActivity): Record<string, unknown> {
  const distanceM = api.distance ?? 0;
  const distanceCm = distanceM * 100;
  const durationS = api.movingDuration ?? api.elapsedDuration ?? api.duration ?? 0;
  const durationMs = durationS * 1000;
  const speedMs = api.avgSpeed ?? (distanceM > 0 && durationS > 0 ? distanceM / durationS : 0);
  const speedDms = speedMs * 10;

  return {
    activityId: api.activityId,
    name: api.activityName,
    startTimeGmt: toTimestamp(api.startTimeGMT ?? null),
    startTimeGMT: toTimestamp(api.startTimeGMT ?? null),
    activityType: api.activityType?.typeKey ?? api.sportType?.typeKey ?? "unknown",
    sportType: api.sportType?.typeKey ?? api.activityType?.typeKey ?? "unknown",
    distance: distanceCm,
    movingDuration: durationMs,
    elapsedDuration: durationMs,
    duration: durationMs,
    avgSpeed: speedDms,
    avgHr: api.avgHR ?? null,
    maxHr: api.maxHR ?? null,
    avgPower: api.avgPower ?? null,
    calories: api.calories ?? null,
    activityTrainingLoad: api.activityTrainingLoad ?? null,
    steps: api.steps ?? null,
    splits: [],
  };
}

function transformSplitToParserFormat(apiSplit: ApiSplit): Record<string, unknown> {
  const durationMs = (apiSplit.duration ?? 0) * 1000;
  const distanceCm = (apiSplit.distance ?? 0) * 100;
  const speedDms = apiSplit.avgSpeed ? apiSplit.avgSpeed * 10 : null;

  return {
    startTimeGMT: toTimestamp(apiSplit.startTimeGMT ?? null),
    endTimeGMT: toTimestamp(apiSplit.endTimeGMT ?? null),
    type: apiSplit.type ?? 17,
    measurements: [
      { fieldEnum: "SUM_DURATION", value: durationMs },
      { fieldEnum: "SUM_DISTANCE", value: distanceCm },
      ...(apiSplit.avgHR ? [{ fieldEnum: "WEIGHTED_MEAN_HEARTRATE", value: apiSplit.avgHR }] : []),
      ...(apiSplit.avgPower ? [{ fieldEnum: "WEIGHTED_MEAN_POWER", value: apiSplit.avgPower }] : []),
      ...(speedDms ? [{ fieldEnum: "WEIGHTED_MEAN_SPEED", value: speedDms }] : []),
      ...(apiSplit.avgCadence ? [{ fieldEnum: "WEIGHTED_MEAN_DOUBLE_CADENCE", value: apiSplit.avgCadence }] : []),
    ],
  };
}

export async function syncFromGarminApi(email: string, password: string, onProgress: OnProgress) {
  const page = await loginAndGetPage(email, password);

  try {
    onProgress({ step: "Fetching user profile...", totalSteps: 16, currentStep: 1 });
    const userProfile = await garminFetch<Record<string, unknown>>(page, `/userprofile-service/socialProfile`);
    const garminGUID = userProfile.displayName as string;
    if (!garminGUID) throw new Error("Could not get user profile GUID");

    const now = new Date();
    const startDateStr = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const endDateStr = now.toISOString().slice(0, 10);

    onProgress({ step: "Fetching activities...", totalSteps: 16, currentStep: 2 });
    const allActivities: ApiActivity[] = [];
    let start = 0;
    const limit = 100;
    while (true) {
      const data = await garminFetch<ApiActivity[]>(page, `/activitylist-service/activities/search/activities?limit=${limit}&start=${start}`);
      if (!Array.isArray(data) || data.length === 0) break;
      allActivities.push(...data);
      if (data.length < limit) break;
      start += limit;
    }

    onProgress({ step: `Fetching splits for ${allActivities.length} activities...`, totalSteps: 16, currentStep: 3 });
    const batchSize = 5;
    for (let i = 0; i < allActivities.length; i += batchSize) {
      const batch = allActivities.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (activity) => {
          try {
            const splitsData = await garminFetch<{ splits?: ApiSplit[] }>(page, `/activity-service/activity/${activity.activityId}/typedsplits`);
            if (splitsData.splits && splitsData.splits.length > 0) {
              (activity as unknown as Record<string, unknown>).splits = splitsData.splits.map(transformSplitToParserFormat);
            }
          } catch {
            // no splits for this activity
          }
        }),
      );
      onProgress({
        step: `Fetched splits ${Math.min(i + batchSize, allActivities.length)}/${allActivities.length}`,
        totalSteps: 16,
        currentStep: 3,
      });
    }

    const summarizedActivitiesExport = allActivities.map(transformActivityToExport);
    await writeJson(
      path.join(DATA_DIR, "DI-Connect-Fitness", "data_summarizedActivities.json"),
      [{ summarizedActivitiesExport }],
    );

    onProgress({ step: "Fetching user settings...", totalSteps: 16, currentStep: 4 });
    try {
      const userSettings = await garminFetch(page, `/userprofile-service/userprofile/user-settings/`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-User", "user-settings.json"), [userSettings]);
    } catch {
      // user settings unavailable
    }

    onProgress({ step: "Fetching personal info...", totalSteps: 16, currentStep: 5 });
    try {
      const personalInfo = await garminFetch(page, `/userprofile-service/userprofile/personal-information/${garminGUID}`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "personal-information.json"), [personalInfo]);
    } catch {
      // personal info unavailable
    }

    onProgress({ step: "Fetching HR zones...", totalSteps: 16, currentStep: 6 });
    try {
      const hrZones = await garminFetch(page, `/biometric-service/heartRateZones/`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "zones_heartRateZones.json"), hrZones);
    } catch {
      // HR zones unavailable
    }

    onProgress({ step: "Fetching power zones...", totalSteps: 16, currentStep: 6 });
    try {
      const powerZones = await garminFetch(page, `/biometric-service/powerZones/`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "zones_powerZones.json"), powerZones);
    } catch {
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "zones_powerZones.json"), []);
    }

    onProgress({ step: "Fetching VO2 Max history...", totalSteps: 16, currentStep: 7 });
    try {
      const vo2MaxDaily = await garminFetch<Array<Record<string, unknown>>>(page, `/metrics-service/metrics/maxmet/daily/${startDateStr}/${endDateStr}`);
      const vo2MaxFormatted = vo2MaxDaily.map((item) => {
        const generic = item.generic as Record<string, unknown> | null;
        return {
          calendarDate: generic?.calendarDate ?? item.calendarDate,
          vo2MaxValue: generic?.vo2MaxValue ?? generic?.vo2MaxPreciseValue,
          maxMet: generic?.vo2MaxValue ? (generic.vo2MaxValue as number) / 3.5 : null,
          updateTimestamp: generic?.calendarDate ? new Date(generic.calendarDate as string).getTime() : null,
        };
      });
      await writeJson(path.join(DATA_DIR, "DI-Connect-Metrics", "MetricsMaxMetData_vo2max.json"), vo2MaxFormatted);
    } catch {
      // VO2 max data unavailable
    }

    onProgress({ step: "Fetching training readiness...", totalSteps: 16, currentStep: 8 });
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
    await writeJson(path.join(DATA_DIR, "DI-Connect-Metrics", "TrainingReadinessDTO_readiness.json"), readinessData);

    onProgress({ step: "Fetching training status...", totalSteps: 16, currentStep: 9 });
    const trainingHistoryFormatted: unknown[] = [];
    try {
      const trainingStatusWeekly = await garminFetch<Record<string, unknown>>(page, `/metrics-service/metrics/trainingstatus/weekly/${garminGUID}`);
      if (trainingStatusWeekly.reportData) {
        for (const deviceData of Object.values(trainingStatusWeekly.reportData as Record<string, unknown[]>)) {
          if (Array.isArray(deviceData)) {
            for (const entry of deviceData) {
              const e = entry as Record<string, unknown>;
              trainingHistoryFormatted.push({
                calendarDate: e.calendarDate,
                trainingStatus: e.trainingStatus,
                fitnessLevelTrend: e.loadLevelTrend ?? "UNKNOWN",
                sport: e.sport ?? "RUNNING",
              });
            }
          }
        }
      }
    } catch {
      // weekly training status unavailable
    }
    try {
      const trainingStatusDaily = await garminFetch<Record<string, unknown>>(page, `/metrics-service/metrics/trainingstatus/daily/${endDateStr}`);
      if (trainingStatusDaily.latestTrainingStatusData) {
        for (const deviceData of Object.values(trainingStatusDaily.latestTrainingStatusData as Record<string, unknown>)) {
          const d = deviceData as Record<string, unknown>;
          trainingHistoryFormatted.push({
            calendarDate: d.calendarDate,
            trainingStatus: d.trainingStatus,
            fitnessLevelTrend: d.loadLevelTrend ?? "UNKNOWN",
            sport: d.sport ?? "RUNNING",
          });
        }
      }
    } catch {
      // daily training status unavailable
    }
    await writeJson(path.join(DATA_DIR, "DI-Connect-Metrics", "TrainingHistory_status.json"), trainingHistoryFormatted);

    onProgress({ step: "Fetching sleep data...", totalSteps: 16, currentStep: 10 });
    const sleepFormatted: unknown[] = [];
    try {
      const sleepStats = await garminFetch<Record<string, unknown>>(page, `/sleep-service/stats/sleep/daily/${startDateStr}/${endDateStr}`);
      if (sleepStats.sleepDailySummaries && Array.isArray(sleepStats.sleepDailySummaries)) {
        for (const s of sleepStats.sleepDailySummaries as Array<Record<string, unknown>>) {
          sleepFormatted.push({
            calendarDate: s.calendarDate,
            sleepStartTimestampGMT: s.sleepStartTimestampGMT,
            sleepEndTimestampGMT: s.sleepEndTimestampGMT,
            sleepTimeSeconds: s.sleepTimeSeconds ?? 0,
            deepSleepSeconds: s.deepSleepSeconds ?? 0,
            lightSleepSeconds: s.lightSleepSeconds ?? 0,
            remSleepSeconds: s.remSleepSeconds ?? 0,
            awakeSleepSeconds: s.awakeSleepSeconds ?? 0,
            sleepScores: { overallScore: s.sleepScore ?? 0 },
          });
        }
      }
    } catch {
      // sleep stats unavailable
    }
    try {
      const sleepDailyData = await garminFetch<Record<string, unknown>>(page, `/wellness-service/wellness/dailySleepData/${garminGUID}`);
      if (sleepDailyData.dailySleepDTO && sleepDailyData.sleepMovement && Array.isArray(sleepDailyData.sleepMovement)) {
        for (const s of sleepDailyData.sleepMovement as Array<Record<string, unknown>>) {
          const exists = sleepFormatted.some((f) => (f as Record<string, unknown>).calendarDate === s.calendarDate);
          if (!exists) {
            sleepFormatted.push({
              calendarDate: s.calendarDate,
              sleepStartTimestampGMT: s.sleepStartTimestampGMT,
              sleepEndTimestampGMT: s.sleepEndTimestampGMT,
              sleepTimeSeconds: s.sleepTimeSeconds ?? 0,
              deepSleepSeconds: s.deepSleepSeconds ?? 0,
              lightSleepSeconds: s.lightSleepSeconds ?? 0,
              remSleepSeconds: s.remSleepSeconds ?? 0,
              awakeSleepSeconds: s.awakeSleepSeconds ?? 0,
              sleepScores: { overallScore: s.sleepScore ?? 0 },
            });
          }
        }
      }
    } catch {
      // daily sleep data unavailable
    }
    await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "sleep_daily.json"), sleepFormatted);

    onProgress({ step: "Fetching personal records...", totalSteps: 16, currentStep: 11 });
    try {
      const prs = await garminFetch<Array<Record<string, unknown>>>(page, `/personalrecord-service/personalrecord/prs/${garminGUID}?includeHistory=true`);
      const prFormatted = prs.map((pr) => ({
        personalRecordType: pr.typeId,
        value: pr.value ?? pr.duration ?? 0,
        prStartTimeGMT: pr.prStartTimeGmt ?? pr.activityStartDateTimeInGMT,
        createdDate: pr.activityStartDateTimeInGMT,
        current: pr.status === "ACCEPTED",
        status: pr.status,
      }));
      await writeJson(path.join(DATA_DIR, "DI-Connect-Fitness", "records_personalRecord.json"), [{ personalRecords: prFormatted }]);
    } catch {
      // personal records unavailable
    }

    onProgress({ step: "Fetching race predictions...", totalSteps: 16, currentStep: 12 });
    try {
      const rpStart = new Date(now);
      rpStart.setFullYear(rpStart.getFullYear() - 1);
      const rpStartStr = rpStart.toISOString().slice(0, 10);
      const racePreds = await garminFetch<Array<Record<string, unknown>>>(
        page,
        `/metrics-service/metrics/racepredictions/daily/${garminGUID}?fromCalendarDate=${rpStartStr}&toCalendarDate=${endDateStr}`,
      );
      await writeJson(path.join(DATA_DIR, "DI-Connect-Metrics", "RunRacePredictions_daily.json"), Array.isArray(racePreds) ? racePreds : [racePreds]);
    } catch {
      // race predictions unavailable
    }

    onProgress({ step: "Fetching gear...", totalSteps: 16, currentStep: 13 });
    try {
      const gear = await garminFetch<Array<Record<string, unknown>>>(page, `/gear-service/gear/v2/list`);
      const gearFormatted = gear.map((g) => ({
        customMakeModel: g.brand ?? "Unnamed gear",
        gearTypeName: g.gearType ?? "Unknown",
        gearStatusName: g.status ?? "unknown",
        dateBegin: g.firstUseDate,
        maximumMeters: g.maxUsageDistanceMeters ?? 0,
      }));
      await writeJson(path.join(DATA_DIR, "DI-Connect-Fitness", "equipment_gear.json"), [{ gearDTOS: gearFormatted }]);
    } catch {
      // gear unavailable
    }

    onProgress({ step: "Fetching workout library...", totalSteps: 16, currentStep: 14 });
    try {
      const allWorkouts: unknown[] = [];
      let wStart = 0;
      const wLimit = 25;
      while (true) {
        const page_ = `/workout-service/workouts?start=${wStart}&limit=${wLimit}&myWorkoutsOnly=true&sharedWorkoutsOnly=false&includeAtp=false&orderBy=UPDATE_DATE&orderSeq=DESC`;
        const batch = await garminFetch<unknown[]>(page, page_);
        if (!Array.isArray(batch) || batch.length === 0) break;
        allWorkouts.push(...batch);
        if (batch.length < wLimit) break;
        wStart += wLimit;
      }
      await writeJson(path.join(DATA_DIR, "DI-Connect-Fitness", "plans_workout.json"), [{ workoutList: allWorkouts, workoutScheduleList: [] }]);
    } catch {
      await writeJson(path.join(DATA_DIR, "DI-Connect-Fitness", "plans_workout.json"), [{}]);
    }

    onProgress({ step: "Fetching running report...", totalSteps: 16, currentStep: 13 });
    try {
      const runMetrics = [
        "duration", "distance", "movingDuration", "calories", "elevationGain", "elevationLoss",
        "avgSpeed", "maxSpeed", "avgGradeAdjustedSpeed", "avgHr", "maxHr",
        "avgRunCadence", "maxRunCadence", "avgPower", "maxPower",
        "avgVerticalOscillation", "avgGroundContactTime", "avgStrideLength",
        "avgStress", "maxStress", "steps",
      ].map((m) => `metric=${m}`).join("&");
      const runReport = await garminFetch(
        page,
        `/fitnessstats-service/activity?aggregation=lifetime&groupByParentActivityType=true&groupByEventType=false&activityType=running&startDate=1970-01-01&endDate=${endDateStr}&${runMetrics}&standardizedUnits=false`,
      );
      await writeJson(path.join(DATA_DIR, "DI-Connect-Fitness", "running_report.json"), [runReport]);
    } catch {
      // running report may not be available
    }

    onProgress({ step: "Fetching HRV data...", totalSteps: 16, currentStep: 14 });
    try {
      const hrvData = await garminFetch(page, `/hrv-service/hrv/daily/${startDateStr}/${endDateStr}`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "hrv_daily.json"), [hrvData]);
    } catch {
      // HRV may not be available
    }

    onProgress({ step: "Fetching stress & load balance...", totalSteps: 16, currentStep: 16 });
    try {
      const stressData = await garminFetch(page, `/wellness-service/wellness/dailyStress/${endDateStr}`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Wellness", "stress_daily.json"), [stressData]);
    } catch {
      // stress may not be available
    }
    try {
      const loadBalance = await garminFetch(page, `/metrics-service/metrics/trainingloadbalance/latest/${endDateStr}`);
      await writeJson(path.join(DATA_DIR, "DI-Connect-Metrics", "TrainingLoadBalance.json"), [loadBalance]);
    } catch {
      // load balance may not be available
    }

    onProgress({ step: "Sync complete! Refresh the page to see updated data.", totalSteps: 16, currentStep: 16 });
  } finally {
    await page.context().close();
  }
}
