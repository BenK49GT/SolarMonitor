import fs from "node:fs/promises";
import path from "node:path";

import { deriveEnergy, shouldKeepSample, type EnergySample } from "@/lib/energy";
import type { EnergyFigure } from "@/lib/types";

const LOG_PATH = path.join(process.cwd(), "data", "energy-log.json");

type EnergyLog = {
  samples: EnergySample[];
};

let writeChain: Promise<unknown> = Promise.resolve();

async function readLog(): Promise<EnergyLog> {
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<EnergyLog>;
    const samples = Array.isArray(parsed.samples) ? parsed.samples : [];
    return {
      samples: samples.filter(
        (sample): sample is EnergySample =>
          typeof sample?.at === "string" && typeof sample?.lifetimeKwh === "number",
      ),
    };
  } catch {
    return { samples: [] };
  }
}

function prune(samples: EnergySample[], now: Date): EnergySample[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 45);
  const cutoffMs = cutoff.getTime();
  const kept: EnergySample[] = [];
  let lastDay = "";
  for (const sample of samples) {
    const time = new Date(sample.at).getTime();
    if (!Number.isFinite(time)) continue;
    if (time >= cutoffMs || kept.length === 0) {
      kept.push(sample);
      continue;
    }
    const day = new Date(sample.at).toDateString();
    if (day !== lastDay) {
      kept.push(sample);
      lastDay = day;
    }
  }
  return kept.slice(-8000);
}

async function writeLog(log: EnergyLog): Promise<void> {
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  const temp = `${LOG_PATH}.tmp`;
  await fs.writeFile(temp, JSON.stringify(log, null, 2), "utf8");
  await fs.rm(LOG_PATH, { force: true });
  await fs.rename(temp, LOG_PATH);
}

async function recordUnlocked(lifetimeKwh: number, now: Date): Promise<{ today: EnergyFigure; month: EnergyFigure }> {
  const log = await readLog();
  const next: EnergySample = { at: now.toISOString(), lifetimeKwh };
  const previous = log.samples[log.samples.length - 1];
  if (shouldKeepSample(previous, next)) {
    log.samples.push(next);
    log.samples = prune(log.samples, now);
    await writeLog(log);
  }
  return deriveEnergy(log.samples, lifetimeKwh, now);
}

export function recordLifetime(
  lifetimeKwh: number,
  now = new Date(),
): Promise<{ today: EnergyFigure; month: EnergyFigure }> {
  const run = writeChain.then(() => recordUnlocked(lifetimeKwh, now));
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
