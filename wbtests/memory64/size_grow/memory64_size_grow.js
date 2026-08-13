load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory({ initial: 1, maximum: 4, addressType: 'i64' });

const grow = mb.addFunction("grow_by", { params: ['i64'], results: ['i64'] });
grow.body([
  ['local.get', 0],
  ['memory.grow'],
  ['end']
]);
grow.exportAs("grow_by");

const pages = mb.addFunction("pages", { params: [], results: ['i64'] });
pages.body([
  ['memory.size'],
  ['end']
]);
pages.exportAs("pages");

const instance = mb.instantiate({});
const grew = instance.exports.grow_by(2n);
const after = instance.exports.pages();
const grew0 = instance.exports.grow_by(0n);
const grewTooFar = instance.exports.grow_by(100n);
