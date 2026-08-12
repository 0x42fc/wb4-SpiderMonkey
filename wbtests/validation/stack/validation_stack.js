load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const underflow = mb.addFunction("underflow", { params: [], results: ['i32'] });
underflow.body([
  ['i32.add'],
  ['end']
]);
const e1 = expectError('stack-check', function () { mb.encode(); });

const mb2 = new WasmModuleBuilder();
const leftover = mb2.addFunction("leftover", { params: [], results: [] });
leftover.body([
  ['i32.const', 0],
  ['i32.const', 1],
  ['end']
]);
const e2 = expectError('stack-check', function () { mb2.encode(); });
