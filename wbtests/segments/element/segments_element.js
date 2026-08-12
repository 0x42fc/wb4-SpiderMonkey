load("test/mjsunit/wasm/WasmBuilder.js");

const sig = { params: ['i32'], results: ['i32'] };

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 1);

const add10 = mb.addFunction("add10", sig);
add10.body([
  ['local.get', 0],
  ['i32.const', 10],
  ['i32.add'],
  ['end']
]);

mb.addElemSegment({
  table: 0,
  offset: 0,
  exprs: [[['ref.func', 'add10']]],
  element: 'funcref'
});

const dispatch = mb.addFunction("dispatch", { params: ['i32', 'i32'], results: ['i32'] });
dispatch.body([
  ['local.get', 0],
  ['local.get', 1],
  ['call_indirect', sig],
  ['end']
]);
dispatch.exportAs("dispatch");

const instance = mb.instantiate({});
const result = instance.exports.dispatch(5, 0);
