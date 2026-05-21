export function formatNumber(value: number, maxFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function formatDistanceKm(value: number) {
  return `${formatNumber(value, 1)} km`;
}

export function formatDurationHours(value: number) {
  return `${formatNumber(value, 1)} h`;
}

export function formatDuration(hours: number): string {
  const totalSec = Math.round(hours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(value: number) {
  const totalMin = Math.round(value);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:00` : `${m}:00`;
}

export function formatPace(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "N/A";
  const totalSeconds = Math.round(value * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

export function formatDateLabel(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatSport(sport: string) {
  return sport
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
