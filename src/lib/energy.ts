import type { EnergyFigure } from "@/lib/types";

export type EnergySample = {
  at: string;
  lifetimeKwh: number;
  importedKwh?: number;
  exportedKwh?: number;
};

export type GridMeters = {
  importedKwh: number;
  exportedKwh: number;
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

function hasGrid(sample: EnergySample): sample is EnergySample & GridMeters {
  return Number.isFinite(sample.importedKwh) && Number.isFinite(sample.exportedKwh);
}

function usedKwh(currentLifetime: number, grid: GridMeters, baseline: EnergySample & GridMeters): number {
  const produced = currentLifetime - baseline.lifetimeKwh;
  const imported = grid.importedKwh - baseline.importedKwh;
  const exported = grid.exportedKwh - baseline.exportedKwh;
  return Math.round(Math.max(0, produced + imported - exported) * 1000) / 1000;
}

function formatKwh1(kwh: number): string {
  return kwh.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function productionBaseline(samples: EnergySample[], boundary: Date): EnergySample | undefined {
  const parsed = samples
    .map((sample) => ({ ...sample, time: new Date(sample.at).getTime() }))
    .filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.lifetimeKwh))
    .sort((a, b) => a.time - b.time);
  if (parsed.length === 0) return undefined;
  const boundaryMs = boundary.getTime();
  const nearBoundary = parsed.find((sample) => Math.abs(sample.time - boundaryMs) <= BOUNDARY_WINDOW_MS);
  const before = parsed.some((sample) => sample.time < boundaryMs);
  const firstAfter = parsed.find((sample) => sample.time >= boundaryMs);
  return Boolean(nearBoundary) || (before && Boolean(firstAfter)) ? (firstAfter ?? nearBoundary) : parsed[0];
}

function usedSentence(
  samples: EnergySample[],
  currentKwh: number,
  grid: GridMeters,
  productionBaseline: EnergySample | undefined,
  title: "Used today" | "Used this month",
): string | null {
  if (!productionBaseline) return null;
  const baselineTime = new Date(productionBaseline.at).getTime();
  const withGrid = samples
    .filter(hasGrid)
    .map((sample) => ({ ...sample, time: new Date(sample.at).getTime() }))
    .filter((sample) => Number.isFinite(sample.time) && sample.time >= baselineTime)
    .sort((a, b) => a.time - b.time);
  const baseline = withGrid[0];
  if (!baseline) return null;
  const used = usedKwh(currentKwh, grid, baseline);
  const amount = `${title} ${formatKwh1(used)} kWh`;
  if (baseline.at === productionBaseline.at) return `${amount}.`;
  const when = new Date(baseline.at);
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (title === "Used today") return `${amount} since ${time}.`;
  const day = when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${amount} since ${day}, ${time}.`;
}

export function deriveEnergy(
  samples: EnergySample[],
  currentKwh: number,
  now = new Date(),
  grid?: GridMeters,
) {
  const today = periodFigure(
    samples,
    currentKwh,
    now,
    startOfLocalDay(now),
    "Today",
    "Change in lifetime energy since the first sample at local midnight.",
    "Not a full day. The log has no sample at local midnight.",
  );
  const month = periodFigure(
    samples,
    currentKwh,
    now,
    startOfLocalMonth(now),
    "This month",
    "Change in lifetime energy since the first sample at the start of the month.",
    "Not a full month. The log has no sample at the start of the month.",
  );
  if (grid) {
    const todaySentence = usedSentence(
      samples,
      currentKwh,
      grid,
      productionBaseline(samples, startOfLocalDay(now)),
      "Used today",
    );
    const monthSentence = usedSentence(
      samples,
      currentKwh,
      grid,
      productionBaseline(samples, startOfLocalMonth(now)),
      "Used this month",
    );
    if (todaySentence) today.detail = `${today.detail} ${todaySentence}`;
    if (monthSentence) month.detail = `${month.detail} ${monthSentence}`;
  }
  return { today, month };
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
  const nextHasGrid = Number.isFinite(next.importedKwh) && Number.isFinite(next.exportedKwh);
  const previousHasGrid = Number.isFinite(previous.importedKwh) && Number.isFinite(previous.exportedKwh);
  if (nextHasGrid && !previousHasGrid) return true;
  if (
    Number.isFinite(next.importedKwh) &&
    Number.isFinite(previous.importedKwh) &&
    Math.abs(next.importedKwh! - previous.importedKwh!) >= 0.001
  ) {
    return true;
  }
  if (
    Number.isFinite(next.exportedKwh) &&
    Number.isFinite(previous.exportedKwh) &&
    Math.abs(next.exportedKwh! - previous.exportedKwh!) >= 0.001
  ) {
    return true;
  }
  return nextTime - previousTime >= 5 * 60 * 1000;
}
