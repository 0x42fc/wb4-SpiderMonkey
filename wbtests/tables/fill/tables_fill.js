load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 4);

const fn = mb.addFunction("fn", { params: [], results: ['i32'] });
fn.body([
  ['i32.const', 7],
  ['end']
]);
fn.exportAs("fn");

const f = mb.addFunction("fill_then_read", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 1],
  ['ref.func', 'fn'],
  ['table.set', 0],
  ['i32.const', 0],
  ['ref.null', 'func'],
  ['i32.const', 4],
  ['table.fill', 0],
  ['i32.const', 1],
  ['table.get', 0],
  ['ref.is_null'],
  ['end']
]);
f.exportAs("fill_then_read");

const instance = mb.instantiate({});
const result = instance.exports.fill_then_read();
