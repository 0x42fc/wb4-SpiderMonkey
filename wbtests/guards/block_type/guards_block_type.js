load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const bt = mb.addType({ params: ['i32'], results: ['i32'] });
const f = mb.addFunction("f", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 5],
  ['block', bt],
  ['end'],
  ['end']
]);
f.exportAs("f");

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad", { params: [], results: ['i32'] });
f2.body([
  ['i32.const', 0],
  ['block', -1],
  ['end'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const instance = mb.instantiate({});
