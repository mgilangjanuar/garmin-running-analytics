import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import JSZip from "jszip";

import { encodeWorkoutToFit, type LongTermPlan } from "@/lib/garmin/fit-encoder";

const PLANS_DIR = path.join(process.cwd(), "data", "plans");

export interface SavedPlanMeta {
  id: string;
  title: string;
  prompt: string;
  totalWeeks: number;
  startDate: string;
  endDate: string;
  phaseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPlan extends SavedPlanMeta {
  plan: LongTermPlan;
  zipBase64: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(PLANS_DIR, { recursive: true });
}

function planPath(id: string): string {
  return path.join(PLANS_DIR, `${id}.json`);
}

export async function listPlans(): Promise<SavedPlanMeta[]> {
  await ensureDir();
  const files = (await fs.readdir(PLANS_DIR)).filter((f) => f.endsWith(".json"));
  const metas = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(PLANS_DIR, file), "utf8");
      const saved = JSON.parse(raw) as SavedPlan;
      const { plan: _p, zipBase64: _f, ...meta } = saved;
      void _p;
      void _f;
      return meta as SavedPlanMeta;
    }),
  );
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlan(id: string): Promise<SavedPlan | null> {
  await ensureDir();
  try {
    const raw = await fs.readFile(planPath(id), "utf8");
    return JSON.parse(raw) as SavedPlan;
  } catch {
    return null;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function pad(n: number, total: number): string {
  const digits = String(total).length;
  return String(n).padStart(Math.max(digits, 2), "0");
}

export async function savePlan(
  plan: LongTermPlan,
  prompt: string,
  title: string,
): Promise<SavedPlan> {
  await ensureDir();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const zip = new JSZip();
  const totalPhases = plan.phases.length;
  for (const [pi, phase] of plan.phases.entries()) {
    const phasePrefix = `p${pad(pi + 1, totalPhases)}-${slug(phase.phase)}`;
    const totalSessions = phase.weekTemplate.length;
    for (const [wi, workout] of phase.weekTemplate.entries()) {
      const sessionPrefix = `w${pad(wi + 1, totalSessions)}-${slug(workout.name)}`;
      zip.file(`${phasePrefix}__${sessionPrefix}.fit`, encodeWorkoutToFit(workout));
    }
  }
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const saved: SavedPlan = {
    id,
    title: title.trim() || plan.summary.slice(0, 60),
    prompt,
    totalWeeks: plan.totalWeeks,
    startDate: plan.startDate,
    endDate: plan.endDate,
    phaseCount: plan.phases.length,
    createdAt: now,
    updatedAt: now,
    plan,
    zipBase64: zipBuffer.toString("base64"),
  };
  await fs.writeFile(planPath(id), JSON.stringify(saved, null, 2), "utf8");
  return saved;
}

export async function updatePlan(id: string, title: string): Promise<SavedPlan | null> {
  const existing = await getPlan(id);
  if (!existing) return null;
  const updated: SavedPlan = { ...existing, title: title.trim(), updatedAt: new Date().toISOString() };
  await fs.writeFile(planPath(id), JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export async function deletePlan(id: string): Promise<boolean> {
  try {
    await fs.unlink(planPath(id));
    return true;
  } catch {
    return false;
  }
}
