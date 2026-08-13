load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: [], results: [] });
const f = mb.addFunction("bad", { params: [], results: [] });
f.body([
  ['try_table', null, [['all', 0]]],
  ['catch', tag],
  ['end'],
  ['end']
]);
const e = expectError('stack-check', () => mb.encode());

const mb2 = new WasmModuleBuilder();
const tag2 = mb2.addTag({ params: [], results: [] });
const f2 = mb2.addFunction("bad2", { params: [], results: [] });
f2.body([
  ['try_table', null, [['all', 0]]],
  ['catch_all'],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
mb3.setStackTypeChecking(false);
const f3 = mb3.addFunction("bad3", { params: [], results: [] });
f3.body([
  ['try_table', null, [['all', 0]]],
  ['catch_all'],
  ['end'],
  ['end']
]);
const e3 = expectError('encode', () => mb3.encode());
