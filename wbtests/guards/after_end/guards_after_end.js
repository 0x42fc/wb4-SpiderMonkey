load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 1],
  ['end'],
  ['i32.const', 2]
]);
const e = expectError('stack-check', () => mb.encode());

const mb2 = new WasmModuleBuilder();
mb2.setStackTypeChecking(false);
const f2 = mb2.addFunction("bad2", { params: [], results: ['i32'] });
f2.body([
  ['i32.const', 1],
  ['end'],
  ['i32.const', 2]
]);
const e2 = expectError('encode', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
mb3.setStackTypeChecking(false);
const f3 = mb3.addFunction("bad3", { params: [], results: [] });
f3.body([
  ['end'],
  ['end']
]);
const e3 = expectError('encode', () => mb3.encode());
