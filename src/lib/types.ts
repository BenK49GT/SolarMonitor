export type Health = "healthy" | "warning" | "offline";

export type Panel = {
  id: string;
  serial: string;
  model: string;
  panel: string | null;
  state: string;
  stateDescr: string;
  statInd: string | null;
  health: Health;
  detail: string;
  powerKw: number | null;
  lifetimeKwh: number | null;
  temperatureC: number | null;
  lastData: string | null;
  note: string | null;
};

export type EnergyFigure = {
  kwh: number | null;
  partial: boolean;
  label: string;
  detail: string;
};

export type Production = {
  powerKw: number | null;
  today: EnergyFigure;
  month: EnergyFigure;
  lifetimeKwh: number | null;
  intervalNote: string;
};

export type GatewayIdentity = {
  ip: string;
  model: string;
  serialMasked: string;
  firmware: string;
  mode: "auto" | "manual";
};

export type SolarSnapshot = {
  ok: boolean;
  source: "live" | "sample";
  stale: boolean;
  error: string | null;
  fetchedAt: string;
  gateway: GatewayIdentity | null;
  production: Production;
  panels: Panel[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    offline: number;
  };
  meter: {
    model: string;
    type: string;
    serial: string;
  } | null;
};
