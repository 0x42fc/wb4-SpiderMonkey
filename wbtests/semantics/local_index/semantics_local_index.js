load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("l", { params: [], results: [] });
f.body([
  ['local.get', 5],
  ['drop'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
