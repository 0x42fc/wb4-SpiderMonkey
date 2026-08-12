load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const st = mb.addType({ kind: 'struct', fields: ['i32', 'f64'] });

const mk = mb.addFunction("mk", { params: ['i32', 'f64'], results: [{ ref: st, nullable: true }] });
mk.body([
  ['local.get', 0],
  ['local.get', 1],
  ['struct.new', st],
  ['end']
]);
mk.exportAs("mk");

const rd = mb.addFunction("rd", { params: [{ ref: st, nullable: true }], results: ['f64'] });
rd.body([
  ['local.get', 0],
  ['struct.get', st, 1],
  ['end']
]);
rd.exportAs("rd");

const instance = mb.instantiate({});
const obj = instance.exports.mk(3, 2.5);
const field = instance.exports.rd(obj);
