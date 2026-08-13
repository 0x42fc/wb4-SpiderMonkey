load("wbunit/wasm/WasmBuilder.js");

const mem = new WebAssembly.Memory({ initial: 1 });
const mb = new WasmModuleBuilder();
mb.addImport('env', 'mem', { kind: 'memory', initial: 1 });

const f = mb.addFunction("load", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['i32.load', [0, 4, 'mem']],
  ['end']
]);
f.exportAs("load");

const g = mb.addFunction("store", { params: ['i32', 'i32'], results: [] });
g.body([
  ['local.get', 0],
  ['local.get', 1],
  ['i32.store', [0, 4, 'mem']],
  ['end']
]);
g.exportAs("store");

const inst = mb.instantiate({ env: { mem: mem } });
new Uint32Array(mem.buffer)[0] = 42;

inst.exports.store(4, 99);
