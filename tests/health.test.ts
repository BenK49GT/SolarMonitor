import assert from "node:assert/strict";
import test from "node:test";

import { classifyPanel, maskSerial, parsePvsTime } from "../src/lib/health.ts";

test("parses PVS timestamps as UTC", () => {
  const date = parsePvsTime("2026,10,26,21,55,00");
  assert.equal(date?.toISOString(), "2026-10-26T21:55:00.000Z");
});

test("treats a night-time error with no fault bits as healthy", () => {
  const result = classifyPanel({
    state: "error",
    stateDescr: "Error",
    statInd: "0",
    powerKw: 0,
    lastData: new Date("2026-10-26T21:55:00Z"),
    gatewayNow: new Date("2026-10-27T02:16:00Z"),
    sitePowerKw: 0.007,
  });
  assert.equal(result.health, "healthy");
  assert.equal(result.detail, "Idle. No fault bits.");
});

test("names the live watts when a no-fault error state is still reporting power", () => {
  const result = classifyPanel({
    state: "error",
    stateDescr: "Error",
    statInd: "0",
    powerKw: 0.0002,
    lastData: new Date("2026-10-26T21:55:40Z"),
    gatewayNow: new Date("2026-10-27T03:03:22Z"),
    sitePowerKw: 0,
  });
  assert.equal(result.health, "healthy");
  assert.equal(result.detail, "Idle. Reporting 0.2 W. No fault bits.");
});

test("warns when a panel is idle while the system is producing", () => {
  const result = classifyPanel({
    state: "error",
    stateDescr: "Error",
    statInd: "0",
    powerKw: 0,
    lastData: new Date("2026-10-26T18:00:00Z"),
    gatewayNow: new Date("2026-10-26T18:05:00Z"),
    sitePowerKw: 3.2,
  });
  assert.equal(result.health, "warning");
});

test("marks a stale panel offline", () => {
  const result = classifyPanel({
    state: "working",
    stateDescr: "Working",
    statInd: "0",
    powerKw: 0.2,
    lastData: new Date("2026-10-20T18:00:00Z"),
    gatewayNow: new Date("2026-10-26T18:00:00Z"),
    sitePowerKw: 3,
  });
  assert.equal(result.health, "offline");
});

test("masks the last five characters of a supervisor serial", () => {
  assert.equal(maskSerial("ZT000000000000A0001"), "ZT000000000000•••••");
});
