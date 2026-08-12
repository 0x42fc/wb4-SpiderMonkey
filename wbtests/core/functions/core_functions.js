load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const f = mb.addFunction("accum", { params: ['i32', 'i32'], results: ['i32'] });
f.addLocal('i32');
f.body([
  ['local.get', 0],
  ['local.get', 1],
  ['i32.add'],
  ['local.set', 2],
  ['local.get', 2],
  ['i32.const', 10],
  ['i32.mul'],
  ['end']
]);
f.exportAs("accum");

const instance = mb.instantiate({});
const result = instance.exports.accum(3, 4);
