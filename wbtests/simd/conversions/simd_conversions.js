load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("to_f32", { params: [], results: ['f32'] });
f.body([
  ['i32.const', 3],
  ['i32x4.splat'],
  ['f32x4.convert_i32x4_s'],
  ['f32x4.extract_lane', 0],
  ['end']
]);
f.exportAs("to_f32");

const instance = mb.instantiate({});
const lane = instance.exports.to_f32();
