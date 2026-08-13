load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad_throw", { params: [], results: [] });
f.body([
  ['i32.const', 1],
  ['throw_ref'],
  ['end']
]);
const e = expectError('stack-check', () => mb.encode());

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad_isnull", { params: [], results: ['i32'] });
f2.body([
  ['i32.const', 1],
  ['ref.is_null'],
  ['end']
]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
const f3 = mb3.addFunction("bad_len", { params: [], results: ['i32'] });
f3.body([
  ['ref.null', 'func'],
  ['array.len'],
  ['end']
]);
const e3 = expectError('stack-check', () => mb3.encode());

const mb4 = new WasmModuleBuilder();
const f4 = mb4.addFunction("ok", { params: ['externref'], results: ['i32'] });
f4.body([
  ['local.get', 0],
  ['ref.is_null'],
  ['end']
]);
f4.exportAs("ok");

const mb5 = new WasmModuleBuilder();
const at = mb5.addType({ kind: 'array', element: 'i32' });
const f5 = mb5.addFunction("len", { params: [], results: ['i32'] });
f5.body([
  ['i32.const', 0],
  ['i32.const', 5],
  ['array.new', at],
  ['array.len'],
  ['end']
]);
f5.exportAs("len");

const okInstance = mb4.instantiate({});
const lenInstance = mb5.instantiate({});
