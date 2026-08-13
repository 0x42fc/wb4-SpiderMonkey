load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const st = mb.addType({ kind: 'struct', fields: ['i8'] });

const s = mb.addFunction("signed", { params: ['i32'], results: ['i32'] });
s.body([
  ['local.get', 0],
  ['struct.new', st],
  ['struct.get_s', st, 0],
  ['end']
]);
s.exportAs("signed");

const u = mb.addFunction("unsigned", { params: ['i32'], results: ['i32'] });
u.body([
  ['local.get', 0],
  ['struct.new', st],
  ['struct.get_u', st, 0],
  ['end']
]);
u.exportAs("unsigned");

const instance = mb.instantiate({});
const neg = instance.exports.signed(0xff);
const pos = instance.exports.unsigned(0xff);
