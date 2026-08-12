load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const f = mb.addFunction("fill_copy", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['i32.const', 42],
  ['i32.const', 4],
  ['memory.fill'],
  ['i32.const', 8],
  ['i32.const', 0],
  ['i32.const', 4],
  ['memory.copy'],
  ['i32.const', 8],
  ['i32.load8_u', [0, 1]],
  ['end']
]);
f.exportAs("fill_copy");

const instance = mb.instantiate({});
const copied = instance.exports.fill_copy();
