import type { IncomingHttpHeaders } from "node:http";
import https from "node:https";

import { maskSerial } from "@/lib/health";

export type SupervisorInfo = {
  model: string;
  serial: string;
  serialMasked: string;
  firmware: string;
};

type HttpResult = {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
};

const sessions = new Map<string, string>();

function request(
  ip: string,
  path: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path,
        method: "GET",
        rejectUnauthorized: false,
        headers: { Accept: "application/json", ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Timed out talking to ${ip}`));
    });
    req.on("error", (error) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    req.end();
  });
}

function cookieHeader(headers: IncomingHttpHeaders): string {
  const raw = headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((value) => value.split(";")[0]?.trim())
    .filter((value): value is string => Boolean(value))
    .join("; ");
}

export async function readSupervisor(
  ip: string,
  timeoutMs = 8000,
): Promise<SupervisorInfo> {
  let result: HttpResult;
  try {
    result = await request(ip, "/cgi-bin/dl_cgi/supervisor/info", timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "connection failed";
    throw new Error(`Cannot reach ${ip} (${message})`);
  }
  if (result.status !== 200) {
    throw new Error(`${ip} answered HTTP ${result.status} for supervisor info`);
  }
  let json: { supervisor?: { MODEL?: string; SERIAL?: string; SWVER?: string } };
  try {
    json = JSON.parse(result.body) as typeof json;
  } catch {
    throw new Error(`${ip} is not a SunPower supervisor`);
  }
  const supervisor = json.supervisor;
  if (!supervisor?.MODEL || !supervisor.SERIAL) {
    throw new Error(`${ip} is not a SunPower supervisor`);
  }
  return {
    model: String(supervisor.MODEL),
    serial: String(supervisor.SERIAL),
    serialMasked: maskSerial(String(supervisor.SERIAL)),
    firmware: String(supervisor.SWVER ?? ""),
  };
}

async function login(ip: string, serial: string): Promise<string> {
  const password = serial.slice(-5);
  const token = Buffer.from(`ssm_owner:${password}`, "utf8").toString("base64");
  const result = await request(ip, "/auth?login", 8000, {
    Authorization: `Basic ${token}`,
  });
  if (result.status !== 200) {
    throw new Error(`Local login on ${ip} was refused (HTTP ${result.status})`);
  }
  const cookie = cookieHeader(result.headers);
  if (!cookie) throw new Error(`Local login on ${ip} did not return a session`);
  sessions.set(ip, cookie);
  return cookie;
}

async function sessionFor(ip: string, serial: string): Promise<string> {
  return sessions.get(ip) ?? login(ip, serial);
}

export async function readDeviceList(ip: string, serial: string): Promise<unknown> {
  const load = async (cookie: string) =>
    request(ip, "/cgi-bin/dl_cgi/devices/list", 25000, { Cookie: cookie });

  let cookie = await sessionFor(ip, serial);
  let result = await load(cookie);
  if (result.status === 401 || result.status === 403) {
    sessions.delete(ip);
    cookie = await login(ip, serial);
    result = await load(cookie);
  }
  if (result.status !== 200) {
    throw new Error(`Device list on ${ip} returned HTTP ${result.status}`);
  }
  try {
    return JSON.parse(result.body) as unknown;
  } catch {
    throw new Error(`Device list on ${ip} was not valid JSON`);
  }
}

export function dropSession(ip: string) {
  sessions.delete(ip);
}
