load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("u", { params: [], results: [] });
f.body([
  ['i32.add'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });

const ec = expectError('stack-check', function () { mb.compile(); });
