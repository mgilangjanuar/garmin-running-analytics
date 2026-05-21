import { chromium } from "playwright-core";

const CONNECT_BASE = "https://connect.garmin.com";
const WORKOUT_API = `${CONNECT_BASE}/gc-api/workout-service/workout`;

export interface GarminWorkoutResult {
  name: string;
  success: boolean;
  workoutId?: number;
  detail?: string;
}

export async function uploadWorkoutsViaPlaywright(
  email: string,
  password: string,
  workloads: { name: string; payload: Record<string, unknown> }[],
): Promise<GarminWorkoutResult[]> {
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

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
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

    await page.goto(`${CONNECT_BASE}/signin`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    await page.fill("#email", email);
    await page.waitForTimeout(600);
    await page.fill("#password", password);
    await page.waitForTimeout(600);

    let csrfToken = "";
    page.on("request", (req) => {
      const ct = req.headers()["connect-csrf-token"];
      if (ct) csrfToken = ct;
    });

    await page.click('button[type="submit"]');
    await page.waitForTimeout(15000);

    if (!page.url().includes("connect.garmin.com/app/")) {
      await page.waitForTimeout(20000);
    }

    if (!page.url().includes("connect.garmin.com/app/")) {
      throw new Error("Login failed. Check your Garmin credentials.");
    }

    if (!csrfToken) {
      const meta = await page.$eval(
        "meta[name='csrf-token'],meta[name='_csrf']",
        (el) => (el as HTMLMetaElement).content,
      ).catch(() => "");
      csrfToken = meta;
    }

    if (!csrfToken) {
      throw new Error(
        "Could not capture connect-csrf-token. " +
          "Verify GARMIN_EMAIL and GARMIN_PASSWORD are correct.",
      );
    }

    await page.waitForTimeout(1000);

    // Upload in reverse order so Garmin's default "Edited ▼" sort (newest first)
    // displays them in correct ascending prefix order (w01, w02, w03 … top→bottom).
    const reversed = [...workloads].reverse();

    const results = await page.evaluate(
      async ({ apiUrl, csrf, items }) => {
        const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
        const out: { name: string; success: boolean; workoutId?: number; detail?: string }[] = [];
        for (const item of items) {
          try {
            const r = await fetch(apiUrl, {
              method: "POST",
              credentials: "include",
              headers: {
                "content-type": "application/json",
                "connect-csrf-token": csrf,
                "nk": "NT",
                "x-requested-with": "XMLHttpRequest",
              },
              body: JSON.stringify(item.payload),
            });
            if (r.ok) {
              const json = await r.json() as { workoutId?: number };
              out.push({ name: item.name, success: true, workoutId: json.workoutId });
            } else {
              const text = await r.text();
              out.push({ name: item.name, success: false, detail: `HTTP ${r.status}: ${text.slice(0, 200)}` });
            }
          } catch (e) {
            out.push({ name: item.name, success: false, detail: String(e) });
          }
          await sleep(1100);
        }
        return out;
      },
      { apiUrl: WORKOUT_API, csrf: csrfToken, items: reversed },
    );

    return results;
  } finally {
    await browser.close();
  }
}
