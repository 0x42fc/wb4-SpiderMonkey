load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("m", { params: [], results: [] });
f.body([
  ['i32.const', 0],
  ['i32.const', 1],
  ['f32.add'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
