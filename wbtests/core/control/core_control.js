load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const f = mb.addFunction("sum_below", { params: ['i32'], results: ['i32'] });
f.addLocal('i32', 'i');
f.addLocal('i32', 'acc');
f.body([
  ['i32.const', 0],
  ['local.set', 'i'],
  ['i32.const', 0],
  ['local.set', 'acc'],
  ['block'],
  ['loop'],
  ['local.get', 'i'],
  ['local.get', 0],
  ['i32.ge_u'],
  ['br_if', 1],
  ['local.get', 'acc'],
  ['local.get', 'i'],
  ['i32.add'],
  ['local.set', 'acc'],
  ['local.get', 'i'],
  ['i32.const', 1],
  ['i32.add'],
  ['local.set', 'i'],
  ['br', 0],
  ['end'],
  ['end'],
  ['local.get', 'acc'],
  ['end']
]);

f.exportAs("sum_below");
const instance = mb.instantiate({});

const s5 = instance.exports.sum_below(5);

const s1 = instance.exports.sum_below(1);

const s0 = instance.exports.sum_below(0)
;
