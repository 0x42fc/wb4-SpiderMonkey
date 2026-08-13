load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("ok1", { params: [], results: [] });
f.body([
  ['unreachable'],
  ['i32.const', 1],
  ['drop'],
  ['end']
]);
mb.compile();

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad", { params: [], results: [] });
f2.body([
  ['unreachable'],
  ['block', null],
  ['i32.add'],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
const f3 = mb3.addFunction("ok2", { params: [], results: [] });
f3.body([
  ['block', null],
  ['unreachable'],
  ['i32.add'],
  ['drop'],
  ['end'],
  ['end']
]);
mb3.compile();

const mb4 = new WasmModuleBuilder();
const f4 = mb4.addFunction("ok3", { params: [], results: [] });
f4.body([
  ['unreachable'],
  ['block', null],
  ['end'],
  ['end']
]);
mb4.compile();
