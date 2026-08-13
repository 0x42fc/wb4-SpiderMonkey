load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const f = mb.addFunction("a", { params: [], results: [] });
f.body([
  ['i32.const', 0],
  ['i32.load', [0, 8]],
  ['drop'],
  ['end']
]);

const e = expectError('encode', function () { mb.encode(); });

const ec = expectError('encode', function () { mb.compile(); });
