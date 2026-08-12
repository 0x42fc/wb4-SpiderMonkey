load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 2, 2);

const f = mb.addFunction("size", { params: [], results: ['i32'] });
f.body([
  ['table.size', 0],
  ['end']
]);
f.exportAs("size");

const instance = mb.instantiate({});
const size = instance.exports.size();
