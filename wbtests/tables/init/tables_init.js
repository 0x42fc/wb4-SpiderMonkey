load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 2);
mb.addElemSegment({ passive: true, indices: [0] });

const f = mb.addFunction("init_then_read", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['i32.const', 0],
  ['i32.const', 1],
  ['table.init', 0, 0],
  ['i32.const', 0],
  ['table.get', 0],
  ['ref.is_null'],
  ['end']
]);
f.exportAs("init_then_read");

const instance = mb.instantiate({});
const result = instance.exports.init_then_read();
