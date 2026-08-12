load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("r", { params: [], results: ['i64'] });
f.body([
  ['i32.const', 0],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
