load("test/mjsunit/wasm/WasmBuilder.js");

const sig = { params: ['i32'], results: ['i32'] };

const mb = new WasmModuleBuilder();
mb.addImport('env', 'tbl', { kind: 'table', element: 'funcref', initial: 1 });

const triple = mb.addFunction("triple", sig);
triple.body([
  ['local.get', 0],
  ['i32.const', 3],
  ['i32.mul'],
  ['end']
]);
triple.exportAs("triple");

const dispatch = mb.addFunction("dispatch", { params: ['i32', 'i32'], results: ['i32'] });
dispatch.body([
  ['local.get', 0],
  ['local.get', 1],
  ['call_indirect', sig, 0],
  ['end']
]);
dispatch.exportAs("dispatch");

const tbl = new WebAssembly.Table({ element: 'funcref', initial: 1 });
const instance = mb.instantiate({ env: { tbl } });
tbl.set(0, instance.exports.triple);
const result = instance.exports.dispatch(5, 0);
