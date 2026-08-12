load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const st = mb.addType({ kind: 'struct', fields: ['i32'] });

const mk = mb.addFunction("mk", { params: ['i32'], results: [{ ref: st, nullable: true }] });
mk.body([
  ['local.get', 0],
  ['struct.new', st],
  ['end']
]);
mk.exportAs("mk");

const rd = mb.addFunction("rd", { params: [{ ref: st, nullable: true }], results: ['i32'] });
rd.body([
  ['local.get', 0],
  ['struct.get', st, 0],
  ['end']
]);
rd.exportAs("rd");

const inst = mb.instantiate({});

const mb2 = new WasmModuleBuilder();
mb2.addType({ kind: 'struct', fields: ['i32'] });
const bad = mb2.addFunction("bad", { params: [], results: [{ ref: -1, nullable: true }] });
bad.body([['end']]);
const e2 = expectInstanceOf(WasmBuilderError, () => mb2.encode(),
  "negative heap type index rejected");
