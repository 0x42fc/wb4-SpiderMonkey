load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tgt = mb.addFunction("tgt", { params: [], results: [] });
tgt.body([['end']]);
tgt.exportAs("tgt");
const f = mb.addFunction("f", { params: [], results: ['funcref'] });
f.body([
  ['block', 'funcref'],
  ['ref.func', 0],
  ['br_on_cast', 0, 0, 'func', 'func'],
  ['end'],
  ['end']
]);
f.exportAs("f");
const inst = mb.instantiate({});

const mb2 = new WasmModuleBuilder();
mb2.addType({ kind: 'struct', fields: [] });
const f2 = mb2.addFunction("bad", { params: [], results: ['funcref'] });
f2.body([
  ['block', 'funcref'],
  ['ref.null', 'func'],
  ['br_on_cast', 0, 9, 'func', 'func'],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
mb3.addType({ kind: 'struct', fields: [] });
const f3 = mb3.addFunction("bad2", { params: [], results: ['funcref'] });
f3.body([
  ['block', 'funcref'],
  ['ref.null', 'func'],
  ['br_on_cast', 0, 0, 'func', 'func'],
  ['end'],
  ['end']
]);
const e3 = expectError('stack-check', () => mb3.encode());

const mb4 = new WasmModuleBuilder();
const t4 = mb4.addFunction("tgt", { params: [], results: [] });
t4.body([['end']]);
t4.exportAs("tgt");
const f4 = mb4.addFunction("bad3", { params: [], results: ['funcref'] });
f4.body([
  ['block', null],
  ['ref.func', 0],
  ['br_on_cast', 0, 0, 'func', 'func'],
  ['end'],
  ['end']
]);
const e4 = expectError('stack-check', () => mb4.encode());
