load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addType({ kind: 'struct', fields: [{ type: 'i32', mutable: false }] });
const f = mb.addFunction("s", { params: [], results: [] });
f.body([
  ['i32.const', 1],
  ['struct.new', 0],
  ['i32.const', 2],
  ['struct.set', 0, 0],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
