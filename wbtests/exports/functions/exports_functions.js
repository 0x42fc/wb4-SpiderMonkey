load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("triple", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['i32.const', 3],
  ['i32.mul'],
  ['end']
]);
mb.exportFunction("triple", "times3");

const instance = mb.instantiate({});
const result = instance.exports.times3(7);
