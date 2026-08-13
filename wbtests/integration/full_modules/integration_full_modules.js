load("wbunit/wasm/WasmBuilder.js");

const sig = { params: ['i32'], results: ['i32'] };

const mb = new WasmModuleBuilder();
mb.addImport('env', 'mem', { kind: 'memory', initial: 1 });
mb.addGlobal('i32', 0, true);
mb.addTable('funcref', 1);
mb.addDataSegment({ offset: 100, data: [10, 20, 30] });

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

const inc = mb.addFunction("inc", { params: [], results: ['i32'] });
inc.body([
  ['global.get', 0],
  ['i32.const', 1],
  ['i32.add'],
  ['global.set', 0],
  ['global.get', 0],
  ['end']
]);
inc.exportAs("inc");

const dispatch = mb.addFunction("dispatch", { params: ['i32', 'i32'], results: ['i32'] });
dispatch.body([
  ['local.get', 0],
  ['local.get', 1],
  ['call_indirect', sig, 0],
  ['end']
]);
dispatch.exportAs("dispatch");

const byte_at = mb.addFunction("byte_at", { params: ['i32'], results: ['i32'] });
byte_at.body([
  ['local.get', 0],
  ['i32.load8_u', [0, 1]],
  ['end']
]);
byte_at.exportAs("byte_at");

mb.exportMemory(0, "mem");
mb.exportTable(0, "tbl");
mb.exportGlobal(0, "counter");

const instance = mb.instantiate({ env: { mem: new WebAssembly.Memory({ initial: 1 }) } });
const c1 = instance.exports.inc();

const dispatched = instance.exports.dispatch(5, 0);
