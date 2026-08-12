load("test/mjsunit/wasm/WasmBuilder.js");

const sig = { params: ['i32'], results: ['i32'] };

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 2);

const add10 = mb.addFunction("add10", sig);
add10.body([
  ['local.get', 0],
  ['i32.const', 10],
  ['i32.add'],
  ['end']
]);

const mul2 = mb.addFunction("mul2", sig);
mul2.body([
  ['local.get', 0],
  ['i32.const', 2],
  ['i32.mul'],
  ['end']
]);

mb.addElemSegment({
  table: 0,
  offset: 0,
  exprs: [[['ref.func', 'add10']], [['ref.func', 'mul2']]],
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
const via10 = instance.exports.dispatch(5, 0);
const viaMul = instance.exports.dispatch(5, 1);
