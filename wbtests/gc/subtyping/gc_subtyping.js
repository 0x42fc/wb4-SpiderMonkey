load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const base = mb.addType({ kind: 'struct', fields: ['i32'], final: false });
const sub = mb.addType({ kind: 'struct', fields: ['i32', 'i64'], supertype: base });

const mk = mb.addFunction("mk", { params: ['i32', 'i64'], results: [{ ref: sub, nullable: true }] });
mk.body([
  ['local.get', 0],
  ['local.get', 1],
  ['struct.new', sub],
  ['end']
]);
mk.exportAs("mk");

const rd = mb.addFunction("rd_base", { params: [{ ref: base, nullable: true }], results: ['i32'] });
rd.body([
  ['local.get', 0],
  ['struct.get', base, 0],
  ['end']
]);
rd.exportAs("rd_base");

const instance = mb.instantiate({});
const obj = instance.exports.mk(5, 9n);
const field = instance.exports.rd_base(obj);
