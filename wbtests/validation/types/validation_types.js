load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("mismatch", { params: [], results: ['f32'] });

f.body([
  ['i32.const', 1],
  ['f32.neg'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
