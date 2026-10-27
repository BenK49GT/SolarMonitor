import { connection } from "next/server";

import { isLocalIpv4, saveConfig } from "@/lib/discover";
import { readSupervisor } from "@/lib/pvs";
import { clearSolarCache } from "@/lib/solar";

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as { ip?: unknown } | null;
  const ip = typeof body?.ip === "string" ? body.ip.trim() : "";
  if (!isLocalIpv4(ip)) {
    return Response.json(
      { ok: false, error: "Enter a local IPv4 address, such as 192.168.1.15." },
      { status: 400 },
    );
  }
  try {
    const info = await readSupervisor(ip, 8000);
    await saveConfig({ ip, mode: "manual" });
    clearSolarCache();
    return Response.json({
      ok: true,
      ip,
      model: info.model,
      firmware: info.firmware,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That address did not respond";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE() {
  await connection();
  await saveConfig({ ip: null, mode: "auto" });
  clearSolarCache();
  return Response.json({ ok: true });
}
