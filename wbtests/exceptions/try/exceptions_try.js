load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("plain", { params: [], results: ['i32'] });
f.body([
  ['try', 'i32'],
  ['i32.const', 5],
  ['end'],
  ['end']
]);
f.exportAs("plain");

const instance = mb.instantiate({});
const value = instance.exports.plain();
