load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("i", { params: [], results: [] });
f.body([
  ['i32.const', 0],
  ['i32.const', 1],
  ['if', { params: ['i32'], results: ['i64'] }],
  ['end'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
