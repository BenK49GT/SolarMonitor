import { discoverGateway, readConfig, saveConfig, type GatewayConfig } from "@/lib/discover";
import { recordLifetime } from "@/lib/energy-log";
import { classifyPanel, median, parsePvsTime } from "@/lib/health";
import { readDeviceList, readSupervisor } from "@/lib/pvs";
import { INTERVAL_NOTE, sampleSnapshot } from "@/lib/sample";
import type { EnergyFigure, GatewayIdentity, Panel, SolarSnapshot } from "@/lib/types";

type RawDevice = {
  DEVICE_TYPE?: string;
  SERIAL?: string;
  MODEL?: string;
  TYPE?: string;
  STATE?: string;
  STATEDESCR?: string;
  PANEL?: string;
  subtype?: string;
  p_3phsum_kw?: string;
  net_ltea_3phsum_kwh?: string;
  ltea_3phsum_kwh?: string;
  stat_ind?: string;
  t_htsnk_degc?: string;
  DATATIME?: string;
  CURTIME?: string;
};

const TTL_MS = 12_000;

let cache: { at: number; snapshot: SolarSnapshot } | null = null;
let inflight: Promise<SolarSnapshot> | null = null;

export function clearSolarCache() {
  cache = null;
}

export function getSolar(): Promise<SolarSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.snapshot);
  if (!inflight) {
    inflight = loadSolar()
      .then((snapshot) => {
        cache = { at: Date.now(), snapshot };
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The gateway could not be read";
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isProductionMeter(device: RawDevice): boolean {
  if (device.DEVICE_TYPE !== "Power Meter") return false;
  const type = device.TYPE ?? "";
  const serial = device.SERIAL ?? "";
  const subtype = device.subtype ?? "";
  return type.includes("METER-P") || serial.endsWith("p") || subtype.includes("PRODUCTION");
}

function missingEnergy(detail: string): EnergyFigure {
  return { kwh: null, partial: true, label: "Not reported", detail };
}

function summarize(panels: Panel[]): SolarSnapshot["summary"] {
  return {
    total: panels.length,
    healthy: panels.filter((panel) => panel.health === "healthy").length,
    warning: panels.filter((panel) => panel.health === "warning").length,
    offline: panels.filter((panel) => panel.health === "offline").length,
  };
}

function parseDevices(
  body: unknown,
): Pick<SolarSnapshot, "production" | "panels" | "summary" | "meter"> {
  const devices = (body as { devices?: RawDevice[]; result?: string }).devices;
  if (!Array.isArray(devices)) {
    throw new Error("Device list did not include any devices");
  }
  const result = (body as { result?: string }).result;
  if (result && result !== "succeed" && result !== "success") {
    throw new Error(`Device list result was ${result}`);
  }

  const meter = devices.find(isProductionMeter) ?? null;
  const gatewayNow =
    parsePvsTime(devices.find((device) => device.CURTIME)?.CURTIME) ?? new Date();
  const sitePowerKw = meter ? numberOrNull(meter.p_3phsum_kw) : null;

  const panels: Panel[] = devices
    .filter((device) => device.DEVICE_TYPE === "Inverter")
    .map((device) => {
      const serial = device.SERIAL ?? "unknown";
      const powerKw = numberOrNull(device.p_3phsum_kw);
      const last = parsePvsTime(device.DATATIME);
      const health = classifyPanel({
        state: device.STATE ?? "",
        stateDescr: device.STATEDESCR ?? "",
        statInd: device.stat_ind ?? null,
        powerKw,
        lastData: last,
        gatewayNow,
        sitePowerKw,
      });
      return {
        id: serial,
        serial,
        model: device.MODEL ?? "Inverter",
        panel: device.PANEL || null,
        state: device.STATE ?? "",
        stateDescr: device.STATEDESCR ?? "",
        statInd: device.stat_ind ?? null,
        health: health.health,
        detail: health.detail,
        powerKw,
        lifetimeKwh: numberOrNull(device.ltea_3phsum_kwh),
        temperatureC: numberOrNull(device.t_htsnk_degc),
        lastData: last ? last.toISOString() : null,
        note: null,
      };
    })
    .sort((a, b) => a.serial.localeCompare(b.serial));

  const lifetimes = panels
    .map((panel) => panel.lifetimeKwh)
    .filter((value): value is number => value != null && value > 0);
  const typical = median(lifetimes);
  if (typical != null && typical > 100) {
    for (const panel of panels) {
      if (panel.lifetimeKwh != null && panel.lifetimeKwh < typical * 0.55) {
        panel.note = `Lifetime output ${panel.lifetimeKwh.toFixed(0)} kWh is well below the other panels (typical ${typical.toFixed(0)} kWh).`;
      }
    }
  }

  return {
    production: {
      powerKw: sitePowerKw,
      today: missingEnergy("No production meter reading."),
      month: missingEnergy("No production meter reading."),
      lifetimeKwh: meter ? numberOrNull(meter.net_ltea_3phsum_kwh) : null,
      intervalNote: INTERVAL_NOTE,
    },
    panels,
    summary: summarize(panels),
    meter: meter
      ? {
          model: meter.MODEL ?? "",
          type: meter.TYPE ?? "",
          serial: meter.SERIAL ?? "",
        }
      : null,
  };
}

async function resolveIp(config: GatewayConfig): Promise<string> {
  if (config.mode === "manual") {
    if (!config.ip) throw new Error("No gateway address is saved");
    return config.ip;
  }
  if (config.ip) {
    try {
      await readSupervisor(config.ip, 4000);
      return config.ip;
    } catch {
      // Saved address is stale. Search the LAN.
    }
  }
  const ip = await discoverGateway();
  await saveConfig({ ip, mode: "auto" });
  return ip;
}

async function loadSolar(): Promise<SolarSnapshot> {
  const config = await readConfig();
  let ip: string | null = null;
  try {
    ip = await resolveIp(config);
    const supervisor = await readSupervisor(ip);
    const devices = await readDeviceList(ip, supervisor.serial);
    const gateway: GatewayIdentity = {
      ip,
      model: supervisor.model,
      serialMasked: supervisor.serialMasked,
      firmware: supervisor.firmware,
      mode: config.mode,
    };
    const parsed = parseDevices(devices);
    if (parsed.production.lifetimeKwh != null) {
      const periods = await recordLifetime(parsed.production.lifetimeKwh);
      parsed.production.today = periods.today;
      parsed.production.month = periods.month;
    }
    return {
      ok: true,
      source: "live",
      stale: false,
      error: null,
      fetchedAt: new Date().toISOString(),
      gateway,
      ...parsed,
    };
  } catch (error) {
    return sampleSnapshot(messageOf(error), ip ?? config.ip, config.mode);
  }
}
