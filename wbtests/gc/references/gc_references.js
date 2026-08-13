load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const eq = mb.addFunction("eq", { params: ['i32', 'i32'], results: ['i32'] });
eq.body([
  ['local.get', 0],
  ['i31.new'],
  ['local.get', 1],
  ['i31.new'],
  ['ref.eq'],
  ['end']
]);
eq.exportAs("eq");

const instance = mb.instantiate({});
const same = instance.exports.eq(7, 7);
const diff = instance.exports.eq(7, 8);
