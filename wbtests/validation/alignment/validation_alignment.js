load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const f = mb.addFunction("bad_align", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['i32.load', [0, 3]],
  ['end']
]);
const e = expectError('encode', function () { mb.encode(); });
