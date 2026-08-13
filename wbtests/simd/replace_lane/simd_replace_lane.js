load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("replace_one", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 7],
  ['i32x4.splat'],
  ['i32.const', 9],
  ['i32x4.replace_lane', 1],
  ['i32x4.extract_lane', 1],
  ['end']
]);
f.exportAs("replace_one");

const instance = mb.instantiate({});
const lane = instance.exports.replace_one();
