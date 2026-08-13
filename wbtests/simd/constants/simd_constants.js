load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("first_lane", { params: [], results: ['i32'] });
f.body([
  ['v128.const', [4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['i32x4.extract_lane', 0],
  ['end']
]);
f.exportAs("first_lane");

const instance = mb.instantiate({});
const lane = instance.exports.first_lane();
