load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory({ initial: 1, addressType: 'i64' });

const f = mb.addFunction("fill_copy", { params: [], results: ['i32'] });
f.body([
  ['i64.const', 0n],
  ['i32.const', 42],
  ['i64.const', 4n],
  ['memory.fill'],
  ['i64.const', 8n],
  ['i64.const', 0n],
  ['i64.const', 4n],
  ['memory.copy'],
  ['i64.const', 8n],
  ['i32.load8_u', [0, 1]],
  ['end']
]);
f.exportAs("fill_copy");

const instance = mb.instantiate({});
const copied = instance.exports.fill_copy();
