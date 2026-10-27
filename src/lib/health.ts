import type { Health } from "@/lib/types";

export type PanelHealthInput = {
  state: string;
  stateDescr: string;
  statInd: string | null;
  powerKw: number | null;
  lastData: Date | null;
  gatewayNow: Date | null;
  sitePowerKw: number | null;
};

export type PanelHealth = {
  health: Health;
  detail: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_PRODUCING_KW = 0.05;
const PANEL_IDLE_KW = 0.01;

export function parsePvsTime(value: string | undefined | null): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}),(\d{2}),(\d{2}),(\d{2}),(\d{2}),(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function classifyPanel(input: PanelHealthInput): PanelHealth {
  const state = input.state.trim().toLowerCase();
  const descr = input.stateDescr.trim().toLowerCase();
  const notTalking =
    /not\s*comm|offline|missing|unavail|no\s*comm/.test(state) ||
    /not\s*comm|offline|missing|unavail/.test(descr);
  const ageMs =
    input.lastData && input.gatewayNow
      ? input.gatewayNow.getTime() - input.lastData.getTime()
      : null;
  const stale = ageMs != null && ageMs > DAY_MS;

  if (!input.lastData || notTalking || stale) {
    return {
      health: "offline",
      detail: stale
        ? "No report for more than 24 hours"
        : "Not communicating",
    };
  }

  if (state === "working") {
    return {
      health: "healthy",
      detail: "Gateway state is Working",
    };
  }

  const fault =
    input.statInd != null && input.statInd !== "" && input.statInd !== "0";
  if (fault) {
    return {
      health: "warning",
      detail: `Fault indicator ${input.statInd}`,
    };
  }

  const siteProducing = (input.sitePowerKw ?? 0) >= SITE_PRODUCING_KW;
  const panelIdle = (input.powerKw ?? 0) < PANEL_IDLE_KW;
  if (siteProducing && panelIdle) {
    return {
      health: "warning",
      detail: "Not producing while the rest of the system is",
    };
  }

  if (state === "error" || state === "idle" || state === "sleeping" || state === "") {
    const reporting =
      input.powerKw != null && input.powerKw > 0
        ? ` Reporting ${livePowerLabel(input.powerKw)}.`
        : "";
    if (state === "error") {
      return {
        health: "healthy",
        detail: `Idle.${reporting} No fault bits.`,
      };
    }
    const gatewayState = input.stateDescr || input.state || "Idle";
    return {
      health: "healthy",
      detail: reporting
        ? `Idle. Gateway state is ${gatewayState}.${reporting}`
        : `Idle. Gateway state is ${gatewayState}`,
    };
  }

  return {
    health: "warning",
    detail: `Gateway state is ${input.stateDescr || input.state}`,
  };
}

function livePowerLabel(powerKw: number): string {
  const watts = powerKw * 1000;
  if (Math.abs(powerKw) < 1) {
    const digits = Math.abs(watts) < 10 ? 1 : 0;
    return `${watts.toFixed(digits)} W`;
  }
  return `${powerKw.toFixed(2)} kW`;
}

export function maskSerial(serial: string): string {
  if (serial.length <= 5) return "•".repeat(Math.max(serial.length, 1));
  return `${serial.slice(0, -5)}${"•".repeat(5)}`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
