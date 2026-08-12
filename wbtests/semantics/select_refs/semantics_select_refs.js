load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("s", { params: [], results: [] });
f.body([
  ['ref.null', 'func'],
  ['ref.null', 'func'],
  ['i32.const', 1],
  ['select'],
  ['drop'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
