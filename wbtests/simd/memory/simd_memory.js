load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const f = mb.addFunction("store_load", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['v128.const', [4, 3, 2, 1, 8, 7, 6, 5, 12, 11, 10, 9, 16, 15, 14, 13]],
  ['v128.store', [0, 4]],
  ['i32.const', 0],
  ['v128.load', [0, 4]],
  ['i32x4.extract_lane', 0],
  ['end']
]);
f.exportAs("store_load");

const instance = mb.instantiate({});
const lane = instance.exports.store_load();
