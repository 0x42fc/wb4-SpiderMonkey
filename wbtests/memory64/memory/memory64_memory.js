load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory({ initial: 1, addressType: 'i64' });

const f = mb.addFunction("pages", { params: [], results: ['i64'] });
f.body([
  ['memory.size'],
  ['end']
]);
f.exportAs("pages");

const instance = mb.instantiate({});
const pages = instance.exports.pages();
