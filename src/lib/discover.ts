import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { readSupervisor } from "@/lib/pvs";

export type GatewayConfig = {
  ip: string | null;
  mode: "auto" | "manual";
};

const CONFIG_PATH = path.join(process.cwd(), "data", "gateway.json");

export function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export function isLocalIpv4(value: string): boolean {
  if (!isIpv4(value)) return false;
  const [a, b] = value.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export async function readConfig(): Promise<GatewayConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<GatewayConfig>;
    const ip = typeof parsed.ip === "string" && isIpv4(parsed.ip) ? parsed.ip : null;
    return { ip, mode: parsed.mode === "manual" ? "manual" : "auto" };
  } catch {
    return { ip: null, mode: "auto" };
  }
}

export async function saveConfig(config: GatewayConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function prefixLength(netmask: string): number {
  const value = ipv4ToInt(netmask);
  let bits = 0;
  let seenZero = false;
  for (let shift = 31; shift >= 0; shift -= 1) {
    const bit = (value >>> shift) & 1;
    if (bit === 1 && seenZero) return -1;
    if (bit === 1) bits += 1;
    else seenZero = true;
  }
  return bits;
}

function localHosts(): string[] {
  const hosts = new Set<string>();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (!isLocalIpv4(entry.address)) continue;
      const bits = prefixLength(entry.netmask);
      if (bits < 23 || bits > 30) continue;
      const ip = ipv4ToInt(entry.address);
      const mask = ipv4ToInt(entry.netmask);
      const network = (ip & mask) >>> 0;
      const broadcast = (network | (~mask >>> 0)) >>> 0;
      const count = broadcast - network - 1;
      if (count < 1 || count > 1022) continue;
      for (let host = network + 1; host < broadcast; host += 1) {
        const address = intToIpv4(host >>> 0);
        if (address !== entry.address) hosts.add(address);
      }
    }
  }
  return [...hosts];
}

function tcpOpen(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: ip, port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export async function discoverGateway(): Promise<string> {
  const hosts = localHosts();
  if (hosts.length === 0) {
    throw new Error("No local IPv4 network was found to search");
  }
  const openFlags = await mapPool(hosts, 48, (ip) => tcpOpen(ip, 443, 500));
  const candidates = hosts.filter((_, index) => openFlags[index]);
  for (const ip of candidates) {
    try {
      const info = await readSupervisor(ip, 2500);
      if (/pvs|sunpower|equinox/i.test(info.model) || info.serial) return ip;
    } catch {
      // Not this host.
    }
  }
  throw new Error("No SunPower gateway responded on this local network");
}
