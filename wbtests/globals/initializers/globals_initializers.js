load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addGlobal('i32', 10);
mb.addGlobal('i32', [['global.get', 0]]);

const f = mb.addFunction("read", { params: [], results: ['i32'] });
f.body([
  ['global.get', 1],
  ['end']
]);
f.exportAs("read");

const instance = mb.instantiate({});
const value = instance.exports.read();
