load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad_br", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['br', 5],
  ['end']
]);
const e1 = expectError('stack-check', function () { mb.encode(); });

const mb2 = new WasmModuleBuilder();
const g = mb2.addFunction("unclosed", { params: [], results: [] });
g.body([
  ['block']
]);
const e2 = expectError('stack-check', function () { mb2.encode(); });
