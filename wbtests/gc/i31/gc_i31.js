load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const s = mb.addFunction("signed", { params: ['i32'], results: ['i32'] });
s.body([
  ['local.get', 0],
  ['i31.new'],
  ['i31.get_s'],
  ['end']
]);
s.exportAs("signed");

const u = mb.addFunction("unsigned", { params: ['i32'], results: ['i32'] });
u.body([
  ['local.get', 0],
  ['i31.new'],
  ['i31.get_u'],
  ['end']
]);
u.exportAs("unsigned");

const instance = mb.instantiate({});
const neg = instance.exports.signed(-1);
const big = instance.exports.unsigned(0x7fffffff);
