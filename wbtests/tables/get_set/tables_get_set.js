load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 1);

const fn = mb.addFunction("fn", { params: [], results: ['i32'] });
fn.body([
  ['i32.const', 7],
  ['end']
]);
fn.exportAs("fn");

const f = mb.addFunction("stored_is_null", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['ref.func', 'fn'],
  ['table.set', 0],
  ['i32.const', 0],
  ['table.get', 0],
  ['ref.is_null'],
  ['end']
]);
f.exportAs("stored_is_null");

const instance = mb.instantiate({});
const result = instance.exports.stored_is_null();
