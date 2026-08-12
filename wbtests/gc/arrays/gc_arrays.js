load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const at = mb.addType({ kind: 'array', element: { type: 'i32', mutable: true } });

const mk = mb.addFunction("mk", { params: ['i32', 'i32'], results: [{ ref: at, nullable: true }] });
mk.body([
  ['local.get', 0],
  ['local.get', 1],
  ['array.new', at],
  ['end']
]);
mk.exportAs("mk");

const len = mb.addFunction("len", { params: [{ ref: at, nullable: true }], results: ['i32'] });
len.body([
  ['local.get', 0],
  ['array.len'],
  ['end']
]);
len.exportAs("len");

const set_get = mb.addFunction("set_get", {
  params: [{ ref: at, nullable: true }, 'i32'],
  results: ['i32']
});
set_get.body([
  ['local.get', 0],
  ['local.get', 1],
  ['i32.const', 77],
  ['array.set', at],
  ['local.get', 0],
  ['local.get', 1],
  ['array.get', at],
  ['end']
]);
set_get.exportAs("set_get");

const instance = mb.instantiate({});
const arr = instance.exports.mk(0, 3);
const written = instance.exports.set_get(arr, 1);
