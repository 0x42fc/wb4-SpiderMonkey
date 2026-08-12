load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("eq_against_five", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 5],
  ['i32x4.splat'],
  ['v128.const', [5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0]],
  ['i32x4.eq'],
  ['i32x4.extract_lane', 0],
  ['end']
]);
f.exportAs("eq_lane_zero");

const g = mb.addFunction("eq_lane_three", { params: [], results: ['i32'] });
g.body([
  ['i32.const', 5],
  ['i32x4.splat'],
  ['v128.const', [5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0]],
  ['i32x4.eq'],
  ['i32x4.extract_lane', 3],
  ['end']
]);
g.exportAs("eq_lane_three");

const instance = mb.instantiate({});
const equal = instance.exports.eq_lane_zero();
const unequal = instance.exports.eq_lane_three();
