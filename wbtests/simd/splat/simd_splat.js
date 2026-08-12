load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("splat_third", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 7],
  ['i32x4.splat'],
  ['i32x4.extract_lane', 3],
  ['end']
]);
f.exportAs("splat_third");

const instance = mb.instantiate({});
const lane = instance.exports.splat_third();
