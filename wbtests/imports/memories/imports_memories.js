load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'mem', { kind: 'memory', initial: 1 });

const f = mb.addFunction("roundtrip", { params: ['i32', 'i32'], results: ['i32'] });
f.body([
  ['local.get', 1],
  ['local.get', 0],
  ['i32.store', [0, 2]],
  ['local.get', 1],
  ['i32.load', [0, 2]],
  ['end']
]);
f.exportAs("roundtrip");

const mem = new WebAssembly.Memory({ initial: 1 });
const instance = mb.instantiate({ env: { mem } });
const view = new DataView(mem.buffer);
