load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const f = mb.addFunction("prod_plus", { params: ['i32', 'i32'], results: ['i32'] });

f.addLocal('i32', 'keep');

f.body([
  ['local.get', 0],
  ['local.tee', 'keep'],
  ['local.get', 1],
  ['i32.mul'],
  ['local.get', 'keep'],
  ['i32.add'],
  ['end']
]);

f.exportAs("prod_plus");

const instance = mb.instantiate({});
const result = instance.exports.prod_plus(3, 4);
