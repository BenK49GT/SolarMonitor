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
