import type { EnergyFigure } from "@/lib/types";

export type EnergySample = {
  at: string;
  lifetimeKwh: number;
};

const BOUNDARY_WINDOW_MS = 15 * 60 * 1000;

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function formatSince(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `since ${time}`;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `since ${day}, ${time}`;
}

function figureFromBaseline(
  currentKwh: number,
  baselineKwh: number,
  partial: boolean,
  label: string,
  detail: string,
): EnergyFigure {
  const delta = currentKwh - baselineKwh;
  return {
    kwh: Math.round(Math.max(0, delta) * 1000) / 1000,
    partial,
    label,
    detail,
  };
}

function periodFigure(
  samples: EnergySample[],
  currentKwh: number,
  now: Date,
  boundary: Date,
  completeLabel: string,
  completeDetail: string,
  partialDetail: string,
): EnergyFigure {
  const parsed = samples
    .map((sample) => ({ ...sample, time: new Date(sample.at).getTime() }))
    .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.lifetimeKwh))
    .sort((a, b) => a.time - b.time);

  if (parsed.length === 0) {
    return {
      kwh: null,
      partial: true,
      label: "since recording started",
      detail: "No lifetime sample has been saved yet.",
    };
  }

  const boundaryMs = boundary.getTime();
  const nearBoundary = parsed.find((sample) => Math.abs(sample.time - boundaryMs) <= BOUNDARY_WINDOW_MS);
  const before = parsed.some((sample) => sample.time < boundaryMs);
  const firstAfter = parsed.find((sample) => sample.time >= boundaryMs);
  const baselineReady = Boolean(nearBoundary) || (before && Boolean(firstAfter));

  if (baselineReady) {
    const baseline = firstAfter ?? nearBoundary;
    if (!baseline) {
      return {
        kwh: null,
        partial: true,
        label: "since recording started",
        detail: partialDetail,
      };
    }
    return figureFromBaseline(currentKwh, baseline.lifetimeKwh, false, completeLabel, completeDetail);
  }

  const first = parsed[0];
  return figureFromBaseline(
    currentKwh,
    first.lifetimeKwh,
    true,
    formatSince(new Date(first.at), now),
    partialDetail,
  );
}

export function deriveEnergy(samples: EnergySample[], currentKwh: number, now = new Date()) {
  return {
    today: periodFigure(
      samples,
      currentKwh,
      now,
      startOfLocalDay(now),
      "Today",
      "Change in lifetime energy since the first sample at local midnight.",
      "Not a full day. The log has no sample at local midnight.",
    ),
    month: periodFigure(
      samples,
      currentKwh,
      now,
      startOfLocalMonth(now),
      "This month",
      "Change in lifetime energy since the first sample at the start of the month.",
      "Not a full month. The log has no sample at the start of the month.",
    ),
  };
}

export function shouldKeepSample(previous: EnergySample | undefined, next: EnergySample): boolean {
  if (!previous) return true;
  const previousTime = new Date(previous.at).getTime();
  const nextTime = new Date(next.at).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return true;
  if (startOfLocalDay(new Date(previous.at)).getTime() !== startOfLocalDay(new Date(next.at)).getTime()) {
    return true;
  }
  if (Math.abs(next.lifetimeKwh - previous.lifetimeKwh) >= 0.001) return true;
  return nextTime - previousTime >= 5 * 60 * 1000;
}
