load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("lane_two", { params: [], results: ['i32'] });
f.body([
  ['v128.const', [1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]],
  ['i32x4.extract_lane', 2],
  ['end']
]);
f.exportAs("lane_two");

const instance = mb.instantiate({});
const lane = instance.exports.lane_two();
