load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const f = mb.addFunction("pages", { params: [], results: ['i32'] });
f.body([
  ['memory.size'],
  ['end']
]);
f.exportAs("pages");

const instance = mb.instantiate({});
const pages = instance.exports.pages();
