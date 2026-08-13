load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 1, 3);

const grow = mb.addFunction("grow", { params: [], results: ['i32'] });
grow.body([
  ['ref.null', 'func'],
  ['i32.const', 1],
  ['table.grow', 0],
  ['end']
]);
grow.exportAs("grow");

const growBig = mb.addFunction("grow_big", { params: [], results: ['i32'] });
growBig.body([
  ['ref.null', 'func'],
  ['i32.const', 100],
  ['table.grow', 0],
  ['end']
]);
growBig.exportAs("grow_big");

const size = mb.addFunction("size", { params: [], results: ['i32'] });
size.body([
  ['table.size', 0],
  ['end']
]);
size.exportAs("size");

const instance = mb.instantiate({});
const g1 = instance.exports.grow();
const s1 = instance.exports.size();
const g2 = instance.exports.grow();
const g3 = instance.exports.grow_big();
const s2 = instance.exports.size();
