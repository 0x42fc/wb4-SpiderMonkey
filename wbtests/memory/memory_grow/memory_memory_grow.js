load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1, 4);

const grow = mb.addFunction("grow_by", { params: ['i32'], results: ['i32'] });
grow.body([
  ['local.get', 0],
  ['memory.grow'],
  ['end']
]);
grow.exportAs("grow_by");

const pages = mb.addFunction("pages", { params: [], results: ['i32'] });
pages.body([
  ['memory.size'],
  ['end']
]);
pages.exportAs("pages");

const instance = mb.instantiate({});
const grew = instance.exports.grow_by(2);
const after = instance.exports.pages();
const grew0 = instance.exports.grow_by(0);
const grewTooFar = instance.exports.grow_by(100);
