load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addGlobal('i32', 0, false);
const f = mb.addFunction("g", { params: [], results: [] });
f.body([
  ['i32.const', 0],
  ['global.set', 0],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
