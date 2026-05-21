export type SportBucket = {
  sport: string;
  activities: number;
  distanceKm: number;
  durationHours: number;
};

export type TrendPoint = {
  date: string;
};

export type ActivitySplitPoint = {
  index: number;
  startTime: string;
  durationSec: number;
  elapsedSec: number;
  distanceKm: number;
  cumulativeDistanceKm: number;
  paceMinPerKm: number | null;
  avgHr: number | null;
  avgPower: number | null;
};

export type NormalizedActivity = {
  id: number;
  name: string;
  sport: string;
  startTime: string;
  durationHours: number;
  distanceKm: number;
  avgSpeedMps: number | null;
  paceMinPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  calories: number | null;
  trainingLoad: number | null;
  steps: number | null;
  splits: ActivitySplitPoint[];
};

export type WorkoutPlanItem = {
  id: number;
  name: string;
  sport: string;
  calendarDate: string;
  description: string;
  steps: number;
};

export type WorkoutAnalytics = {
  generatedAt: string;
  period: {
    start: string;
    end: string;
    totalDays: number;
  };
  totals: {
    activities: number;
    distanceKm: number;
    durationHours: number;
    calories: number;
    trainingLoad: number;
    averageDistancePerActivityKm: number;
  };
  trends: {
    weeklyVolume: Array<
      TrendPoint & {
        activities: number;
        distanceKm: number;
        durationHours: number;
        trainingLoad: number;
      }
    >;
    monthlyVolume: Array<
      TrendPoint & {
        activities: number;
        distanceKm: number;
        durationHours: number;
      }
    >;
    readiness: Array<
      TrendPoint & {
        score: number;
        level: string;
        recoveryTimeHours: number;
        acuteLoad: number;
      }
    >;
    acuteLoad: Array<
      TrendPoint & {
        acwrPercent: number;
        ratio: number;
        status: string;
        acute: number;
        chronic: number;
      }
    >;
    vo2Max: Array<
      TrendPoint & {
        vo2Max: number;
        maxMet: number;
      }
    >;
    racePrediction: Array<
      TrendPoint & {
        raceTime5KMin: number;
        raceTime10KMin: number;
        raceTimeHalfMin: number;
        raceTimeMarathonMin: number;
      }
    >;
    sleep: Array<
      TrendPoint & {
        score: number;
        durationHours: number;
        deepHours: number;
        remHours: number;
        awakeMinutes: number;
      }
    >;
    health: Array<
      TrendPoint & {
        hrv: number | null;
        hrvStatus: string | null;
        stress: number | null;
        stressStatus: string | null;
      }
    >;
    trainingStatus: Array<
      TrendPoint & {
        status: string;
        fitnessLevelTrend: string;
        sport: string;
      }
    >;
  };
  sportDistribution: SportBucket[];
  activities: {
    latest: NormalizedActivity[];
    all: NormalizedActivity[];
  };
  workouts: {
    libraryCount: number;
    scheduled: WorkoutPlanItem[];
  };
  zones: {
    heartRate: {
      method: string | null;
      zone1Floor: number | null;
      zone2Floor: number | null;
      zone3Floor: number | null;
      zone4Floor: number | null;
      zone5Floor: number | null;
      maxHrUsed: number | null;
      restingHrUsed: number | null;
    } | null;
    power: Array<{
      sport: string;
      ftp: number | null;
      zone1Floor: number | null;
      zone2Floor: number | null;
      zone3Floor: number | null;
      zone4Floor: number | null;
      zone5Floor: number | null;
    }>;
  };
  thresholds: {
    lactateThresholdHeartRate: number | null;
    functionalThresholdPower: number | null;
  };
  personalRecords: Array<{
    type: string;
    unit: "time_s" | "distance_m" | "count";
    value: number;
    date: string;
    isCurrent: boolean;
  }>;
  gear: Array<{
    name: string;
    type: string;
    status: string;
    startedAt: string | null;
    maxKm: number | null;
  }>;
  insights: string[];
};
