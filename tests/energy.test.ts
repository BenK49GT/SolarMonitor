import assert from "node:assert/strict";
import test from "node:test";

import { deriveEnergy, shouldKeepSample } from "../src/lib/energy.ts";

const now = new Date(2026, 9, 26, 22, 33, 0);

test("labels energy since the first sample when midnight was not recorded", () => {
  const started = new Date(2026, 9, 26, 22, 32, 0);
  const result = deriveEnergy(
    [{ at: started.toISOString(), lifetimeKwh: 56359.49 }],
    56359.49,
    now,
  );
  assert.equal(result.today.partial, true);
  assert.equal(result.month.partial, true);
  assert.equal(result.today.kwh, 0);
  assert.equal(result.month.kwh, 0);
  assert.match(result.today.label, /^since 10:32 PM$/);
  assert.match(result.month.label, /^since 10:32 PM$/);
  assert.match(result.today.detail, /Not a full day/);
  assert.match(result.month.detail, /Not a full month/);
});

test("uses the first sample after midnight once recording crossed midnight", () => {
  const before = new Date(2026, 9, 26, 23, 50, 0);
  const after = new Date(2026, 9, 27, 0, 1, 0);
  const morning = new Date(2026, 9, 27, 9, 0, 0);
  const result = deriveEnergy(
    [
      { at: before.toISOString(), lifetimeKwh: 100 },
      { at: after.toISOString(), lifetimeKwh: 100.2 },
    ],
    106.5,
    morning,
  );
  assert.equal(result.today.partial, false);
  assert.equal(result.today.label, "Today");
  assert.equal(result.today.kwh, 6.3);
  assert.equal(result.month.partial, true);
  assert.match(result.month.label, /^since /);
});

test("adds home use since the same midnight sample", () => {
  const before = new Date(2026, 9, 26, 23, 50, 0);
  const after = new Date(2026, 9, 27, 0, 1, 0);
  const morning = new Date(2026, 9, 27, 9, 0, 0);
  const result = deriveEnergy(
    [
      { at: before.toISOString(), lifetimeKwh: 100, importedKwh: 50, exportedKwh: 40 },
      { at: after.toISOString(), lifetimeKwh: 100.2, importedKwh: 50.1, exportedKwh: 40 },
    ],
    106.5,
    morning,
    { importedKwh: 52, exportedKwh: 41 },
  );
  assert.match(result.today.detail, /Used today 7\.2 kWh\./);
  assert.match(result.month.detail, /Used this month 7\.5 kWh\./);
});

test("starts used today at the first sample that has grid meters", () => {
  const midnight = new Date(2026, 9, 27, 0, 1, 0);
  const later = new Date(2026, 9, 27, 18, 0, 0);
  const result = deriveEnergy(
    [
      { at: midnight.toISOString(), lifetimeKwh: 100 },
      { at: later.toISOString(), lifetimeKwh: 110, importedKwh: 50, exportedKwh: 40 },
    ],
    110.4,
    new Date(2026, 9, 27, 18, 30, 0),
    { importedKwh: 50.6, exportedKwh: 40.1 },
  );
  assert.match(result.today.detail, /Used today 0\.9 kWh since 6:00 PM\./);
  assert.match(result.month.detail, /Used this month 0\.9 kWh since Oct 27, 6:00 PM\./);
});

test("keeps the first sample that records grid meters", () => {
  const previous = { at: "2026-10-27T22:00:00.000Z", lifetimeKwh: 100 };
  const next = { at: "2026-10-27T22:01:00.000Z", lifetimeKwh: 100, importedKwh: 50, exportedKwh: 40 };
  assert.equal(shouldKeepSample(previous, next), true);
});

test("uses a month-start sample for this month", () => {
  const monthStart = new Date(2026, 9, 1, 0, 2, 0);
  const later = new Date(2026, 9, 26, 22, 33, 0);
  const result = deriveEnergy(
    [{ at: monthStart.toISOString(), lifetimeKwh: 56000 }],
    56359.5,
    later,
  );
  assert.equal(result.month.partial, false);
  assert.equal(result.month.label, "This month");
  assert.equal(result.month.kwh, 359.5);
  assert.equal(result.today.partial, true);
});

test("skips an unchanged sample inside five minutes", () => {
  const first = { at: new Date(2026, 9, 26, 22, 32, 0).toISOString(), lifetimeKwh: 10 };
  const soon = { at: new Date(2026, 9, 26, 22, 33, 0).toISOString(), lifetimeKwh: 10 };
  assert.equal(shouldKeepSample(first, soon), false);
  const changed = { at: soon.at, lifetimeKwh: 10.01 };
  assert.equal(shouldKeepSample(first, changed), true);
});
