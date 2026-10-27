import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { getSolar } from "../src/lib/solar";

const GATEWAY_IP = "192.168.1.15";
const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Solar Monitor</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 16px/1.45 system-ui, sans-serif; background: #12140f; color: #f4f1e6; }
    main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { font-size: 2.4rem; margin: 0.2rem 0; }
    .eyebrow { letter-spacing: 0.18em; text-transform: uppercase; color: #d7b15e; font-size: 0.75rem; }
    .muted { color: #b7b2a4; }
    .grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
    @media (min-width: 800px) { .grid { grid-template-columns: 1.2fr 1fr 1fr; } }
    .card { background: #1c1f18; border: 1px solid #34382d; border-radius: 16px; padding: 16px; }
    .value { font-size: 3rem; margin: 8px 0; }
    .value span { font-size: 1.3rem; margin-left: 0.35rem; color: #ddd6c4; }
    .panels { display: grid; gap: 10px; grid-template-columns: 1fr; }
    @media (min-width: 700px) { .panels { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 1000px) { .panels { grid-template-columns: 1fr 1fr 1fr; } }
    .badge { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 0.75rem; }
    .healthy { background: #1e3a2a; color: #b7f0c8; }
    .warning { background: #3d3214; color: #f3dd9a; }
    .offline { background: #3d1c1c; color: #f3b4b4; }
    .alert { border: 1px solid #8a6a2f; background: #2a2416; padding: 12px 14px; border-radius: 12px; }
    .mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Home solar</p>
    <h1>Solar Monitor</h1>
    <p class="muted" id="status">Reading the gateway…</p>
    <div id="alert"></div>
    <section class="grid" id="figures"></section>
    <h2>Panel health</h2>
    <p class="muted" id="summary"></p>
    <section class="panels" id="panels"></section>
  </main>
  <script>
    const power = (kw) => {
      if (kw == null || Number.isNaN(kw)) return { n: "—", u: "" };
      const watts = kw * 1000;
      if (Math.abs(kw) < 1) return { n: watts.toFixed(Math.abs(watts) < 10 ? 1 : 0), u: "W" };
      return { n: kw.toFixed(2), u: "kW" };
    };
    const kwh = (value) => value == null || Number.isNaN(value) ? "—" : value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " kWh";
    const ago = (iso) => {
      if (!iso) return "No report";
      const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (minutes < 1) return "Just now";
      if (minutes < 60) return minutes + " min ago";
      const hours = Math.round(minutes / 60);
      if (hours < 48) return hours + " hr ago";
      return Math.round(hours / 24) + " days ago";
    };
    const reportLine = (panel) => {
      const when = ago(panel.lastData);
      const state = (panel.state || "").trim().toLowerCase();
      const noFault = panel.statInd == null || panel.statInd === "" || panel.statInd === "0";
      if (noFault && state === "error") return "Last report · " + when;
      return "Gateway: " + (panel.stateDescr || panel.state || "unknown") + " · " + when;
    };
    const figure = (label, body, note) => '<article class="card"><p class="muted">' + label + '</p><p class="value">' + body + '</p><p class="muted">' + note + '</p></article>';
    async function tick() {
      const response = await fetch("/api/solar", { cache: "no-store" });
      const snap = await response.json();
      const gateway = snap.gateway;
      document.getElementById("status").textContent = gateway
        ? (gateway.model || "Gateway") + " · " + gateway.ip + (gateway.firmware ? " · " + gateway.firmware : "") + " · Updated " + new Date(snap.fetchedAt).toLocaleTimeString()
        : "No gateway";
      document.getElementById("alert").innerHTML = snap.source !== "live" && snap.error
        ? '<p class="alert">' + snap.error + '</p>' : "";
      const now = power(snap.production.powerKw);
      const today = snap.production.today;
      const month = snap.production.month;
      document.getElementById("figures").innerHTML = [
        figure("Current production", now.n + ' <span>' + now.u + '</span>', snap.production.lifetimeKwh != null ? "Lifetime " + kwh(snap.production.lifetimeKwh) : "Production meter"),
        figure("Today", today.kwh == null ? today.label : kwh(today.kwh).replace(" kWh", "") + ' <span>kWh</span>', today.kwh == null ? today.detail : today.label + ". " + today.detail),
        figure("This month", month.kwh == null ? month.label : kwh(month.kwh).replace(" kWh", "") + ' <span>kWh</span>', month.kwh == null ? month.detail : month.label + ". " + month.detail),
      ].join("");
      document.getElementById("summary").textContent = snap.summary.total + " panels · " + snap.summary.healthy + " healthy · " + snap.summary.warning + " warning · " + snap.summary.offline + " offline";
      document.getElementById("panels").innerHTML = snap.panels.map((panel) => {
        const watts = power(panel.powerKw);
        return '<article class="card"><span class="badge ' + panel.health + '">' + panel.health + '</span> <span class="mono">' + panel.serial + '</span><p class="value" style="font-size:1.8rem">' + watts.n + ' <span>' + watts.u + '</span></p><p class="muted">' + panel.detail + '</p><p class="muted">' + reportLine(panel) + '</p><p class="muted">Lifetime ' + kwh(panel.lifetimeKwh) + '</p>' + (panel.note ? '<p>' + panel.note + '</p>' : '') + '</article>';
      }).join("");
    }
    tick().catch((error) => { document.getElementById("status").textContent = String(error); });
    setInterval(() => { tick().catch(() => {}); }, 20000);
  </script>
</body>
</html>`;

function ensureGatewayConfig(): void {
  const dataDir = path.join(process.cwd(), "data");
  const configPath = path.join(dataDir, "gateway.json");
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ip: GATEWAY_IP, mode: "manual" }, null, 2),
    "utf8",
  );
}

ensureGatewayConfig();

const port = Number(process.env.PORT || 80);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname === "/api/solar") {
    getSolar()
      .then((snapshot) => {
        const body = JSON.stringify(snapshot);
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "The monitor failed";
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(message);
      });
    return;
  }
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(PAGE);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Solar Monitor listening on port ${port}`);
});

function poll(): void {
  getSolar().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
  });
}

poll();
setInterval(poll, 60_000);
