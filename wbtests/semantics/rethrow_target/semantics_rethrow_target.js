load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("t", { params: [], results: [] });
f.body([
  ['rethrow', 0],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
