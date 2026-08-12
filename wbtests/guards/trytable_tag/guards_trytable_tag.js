load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad", { params: [], results: [] });
f.body([
  ['try_table', null, [[999, 0]]],
  ['end'],
  ['end']
]);
const e = expectError('stack-check', () => mb.encode());

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad2", { params: [], results: [] });
f2.body([
  ['try_table', null, [[undefined, 0]]],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
mb3.setStackTypeChecking(false);
const f3 = mb3.addFunction("bad3", { params: [], results: [] });
f3.body([
  ['try_table', null, [[undefined, 0]]],
  ['end'],
  ['end']
]);
const e3 = expectError('encode', () => mb3.encode());

const mb4 = new WasmModuleBuilder();
const tag = mb4.addTag({ params: ['i32'], results: [] });
const f4 = mb4.addFunction("ok", { params: [], results: ['i32'] });
f4.body([
  ['try_table', { params: [], results: ['i32'] }, [[tag, 0]]],
  ['i32.const', 7],
  ['end'],
  ['end']
]);
f4.exportAs("ok");

const instance = mb4.instantiate({});
