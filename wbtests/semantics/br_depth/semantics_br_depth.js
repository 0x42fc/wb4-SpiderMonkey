load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("b", { params: [], results: [] });
f.body([
  ['br', 5],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
