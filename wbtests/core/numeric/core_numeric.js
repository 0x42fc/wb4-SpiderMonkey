load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("pick", { params: ['i32', 'i32'], results: ['i32'] });

f.body([
  ['local.get', 0],
  ['i32.const', 3],
  ['i32.mul'],
  ['local.get', 1],
  ['i32.add'],
  ['local.get', 0],
  ['local.get', 0],
  ['local.get', 1],
  ['i32.gt_u'],
  ['select'],
  ['end']
]);

f.exportAs("pick");

const instance = mb.instantiate({});
const gt = instance.exports.pick(4, 2);
const lt = instance.exports.pick(2, 9);
