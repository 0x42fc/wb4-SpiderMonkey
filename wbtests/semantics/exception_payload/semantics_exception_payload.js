load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTag({ params: ['i32', 'i64'], results: [] });
const f = mb.addFunction("e", { params: [], results: [] });
f.body([
  ['i32.const', 0],
  ['throw', 0],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
