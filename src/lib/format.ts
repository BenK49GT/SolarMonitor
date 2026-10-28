export function formatPower(kw: number | null): { primary: string; unit: string } {
  if (kw == null || Number.isNaN(kw)) return { primary: "—", unit: "" };
  const watts = kw * 1000;
  if (Math.abs(kw) < 1) {
    const digits = Math.abs(watts) < 10 ? 1 : 0;
    return { primary: watts.toFixed(digits), unit: "W" };
  }
  return { primary: kw.toFixed(2), unit: "kW" };
}

export function homeLoadKw(productionKw: number | null, gridKw: number | null): number | null {
  if (productionKw == null || gridKw == null) return null;
  return Math.round((productionKw + gridKw) * 1000) / 1000;
}

export function gridFlowDetail(gridKw: number | null): string {
  if (gridKw == null || Number.isNaN(gridKw)) return "No load meter reading.";
  const magnitude = formatPower(Math.abs(gridKw));
  const amount = `${magnitude.primary} ${magnitude.unit}`.trim();
  if (gridKw <= -0.05) return `Exporting ${amount}`;
  if (gridKw >= 0.05) return `Importing ${amount}`;
  return "Grid is about even";
}

export function formatKwDetail(kw: number | null): string | null {
  if (kw == null || Number.isNaN(kw) || Math.abs(kw) >= 1) return null;
  return `${kw.toFixed(3)} kW`;
}

export function formatKwh(kwh: number | null): string {
  if (kwh == null || Number.isNaN(kwh)) return "—";
  return `${kwh.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kWh`;
}

export function formatAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "No report";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown time";
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
