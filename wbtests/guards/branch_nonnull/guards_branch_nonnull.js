load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tgt = mb.addFunction("tgt", { params: [], results: [] });
tgt.body([['end']]);
tgt.exportAs("tgt");
const f = mb.addFunction("f", { params: [], results: ['funcref'] });
f.body([
  ['block', 'funcref'],
  ['ref.func', 0],
  ['ref.func', 0],
  ['br_on_non_null', 0],
  ['end'],
  ['end']
]);
f.exportAs("f");
const inst = mb.instantiate({});

const mb2 = new WasmModuleBuilder();
const t2 = mb2.addFunction("tgt", { params: [], results: [] });
t2.body([['end']]);
t2.exportAs("tgt");
const f2 = mb2.addFunction("bad", { params: [], results: ['funcref'] });
f2.body([
  ['block', 'funcref'],
  ['ref.func', 0],
  ['br_on_non_null', 0],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
const f3 = mb3.addFunction("bad2", { params: [], results: [] });
f3.body([
  ['block', null],
  ['ref.null', 'func'],
  ['br_on_non_null', 0],
  ['drop'],
  ['end'],
  ['end']
]);
const e3 = expectError('stack-check', () => mb3.encode());
