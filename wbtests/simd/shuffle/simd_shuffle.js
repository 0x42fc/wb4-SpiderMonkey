load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("all_first_byte", { params: [], results: ['i32'] });
f.body([
  ['v128.const', [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  ['v128.const', [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
  ['i8x16.shuffle', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['i32x4.extract_lane', 0],
  ['end']
]);
f.exportAs("all_first_byte");

const instance = mb.instantiate({});
const lane = instance.exports.all_first_byte();
