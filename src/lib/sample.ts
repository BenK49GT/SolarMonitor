import type { SolarSnapshot } from "@/lib/types";

export const INTERVAL_NOTE =
  "The gateway reports live power and lifetime energy only. Today and this month are the change in the production meter’s lifetime kWh since a local sample. Until that sample is from local midnight or the start of the month, the number is only the energy since recording started.";

export function sampleSnapshot(
  error: string,
  ip: string | null = null,
  mode: "auto" | "manual" = "auto",
): SolarSnapshot {
  return {
    ok: false,
    source: "sample",
    stale: false,
    error,
    fetchedAt: new Date().toISOString(),
    gateway: ip
      ? {
          ip,
          model: "Unknown",
          serialMasked: "",
          firmware: "",
          mode,
        }
      : null,
    production: {
      powerKw: 4.28,
      today: {
        kwh: 18.6,
        partial: false,
        label: "kWh · sample",
        detail: "Sample figure, not from the gateway.",
      },
      month: {
        kwh: 412.4,
        partial: false,
        label: "kWh · sample",
        detail: "Sample figure, not from the gateway.",
      },
      lifetimeKwh: 12000,
      intervalNote: "Sample figures, not read from a gateway.",
    },
    panels: [
      {
        id: "sample-1",
        serial: "SAMPLE00000001",
        model: "AC_Module_Type_G",
        panel: "SPR-A410-G-AC",
        state: "working",
        stateDescr: "Working",
        statInd: "0",
        health: "healthy",
        detail: "Sample panel",
        powerKw: 0.18,
        lifetimeKwh: 2100,
        temperatureC: 42,
        lastData: new Date().toISOString(),
        note: null,
      },
      {
        id: "sample-2",
        serial: "SAMPLE00000002",
        model: "AC_Module_Type_G",
        panel: "SPR-A410-G-AC",
        state: "error",
        stateDescr: "Error",
        statInd: "4",
        health: "warning",
        detail: "Sample warning",
        powerKw: 0.01,
        lifetimeKwh: 1900,
        temperatureC: 48,
        lastData: new Date().toISOString(),
        note: null,
      },
      {
        id: "sample-3",
        serial: "SAMPLE00000003",
        model: "AC_Module_Type_G",
        panel: "SPR-A410-G-AC",
        state: "error",
        stateDescr: "Not communicating",
        statInd: null,
        health: "offline",
        detail: "Sample offline panel",
        powerKw: null,
        lifetimeKwh: null,
        temperatureC: null,
        lastData: null,
        note: null,
      },
    ],
    summary: { total: 3, healthy: 1, warning: 1, offline: 1 },
    meter: null,
  };
}

export function emptySnapshot(ip: string): SolarSnapshot {
  return {
    ok: true,
    source: "live",
    stale: false,
    error: null,
    fetchedAt: new Date().toISOString(),
    gateway: {
      ip,
      model: "PVS6",
      serialMasked: "ZT•••••",
      firmware: "—",
      mode: "auto",
    },
    production: {
      powerKw: null,
      today: {
        kwh: null,
        partial: true,
        label: "Not reported",
        detail: "No production meter reading.",
      },
      month: {
        kwh: null,
        partial: true,
        label: "Not reported",
        detail: "No production meter reading.",
      },
      lifetimeKwh: null,
      intervalNote: INTERVAL_NOTE,
    },
    panels: [],
    summary: { total: 0, healthy: 0, warning: 0, offline: 0 },
    meter: null,
  };
}
