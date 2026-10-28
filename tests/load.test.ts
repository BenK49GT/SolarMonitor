import assert from "node:assert/strict";
import test from "node:test";

import { gridFlowDetail, homeLoadKw } from "../src/lib/format.ts";

test("home load is production plus grid import", () => {
  assert.equal(homeLoadKw(4.526, -3.744), 0.782);
  assert.equal(homeLoadKw(1.2, 0.8), 2);
  assert.equal(homeLoadKw(null, -1), null);
});

test("describes grid flow from the load meter sign", () => {
  assert.match(gridFlowDetail(-3.744), /^Exporting /);
  assert.match(gridFlowDetail(1.25), /^Importing /);
  assert.equal(gridFlowDetail(0.01), "Grid is about even");
  assert.equal(gridFlowDetail(null), "No load meter reading.");
});
