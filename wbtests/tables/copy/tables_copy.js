load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 4);

const fn = mb.addFunction("fn", { params: [], results: ['i32'] });
fn.body([
  ['i32.const', 7],
  ['end']
]);
fn.exportAs("fn");

const f = mb.addFunction("copy_then_read", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['ref.func', 'fn'],
  ['table.set', 0],
  ['i32.const', 2],
  ['i32.const', 0],
  ['i32.const', 1],
  ['table.copy', 0],
  ['i32.const', 2],
  ['table.get', 0],
  ['ref.is_null'],
  ['end']
]);
f.exportAs("copy_then_read");

const instance = mb.instantiate({});
const result = instance.exports.copy_then_read();
