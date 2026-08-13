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

const is_base = mb.addFunction("is_base", { params: [{ ref: sub, nullable: true }], results: ['i32'] });
is_base.body([
  ['local.get', 0],
  ['ref.test', base],
  ['end']
]);
is_base.exportAs("is_base");

const as_base = mb.addFunction("as_base", { params: [{ ref: sub, nullable: true }], results: ['i32'] });
as_base.body([
  ['local.get', 0],
  ['ref.cast', base],
  ['struct.get', base, 0],
  ['end']
]);
as_base.exportAs("as_base");

const instance = mb.instantiate({});
const obj = instance.exports.mk(5, 9n);
const field = instance.exports.as_base(obj);
