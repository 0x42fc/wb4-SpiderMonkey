load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory({ initial: 1, addressType: 'i64' });
mb.exportMemory(0, "memory");

const f = mb.addFunction("load", { params: ['i64'], results: ['i64'] });
f.body([
  ['local.get', 0],
  ['i64.load', [0n, 8]],
  ['end']
]);
f.exportAs("load");

const g = mb.addFunction("load2", { params: ['i64'], results: ['i64'] });
g.body([
  ['local.get', 0],
  ['i64.load', 0],
  ['end']
]);
g.exportAs("load2");

const inst = mb.instantiate({});
const mem = inst.exports.memory;
new BigInt64Array(mem.buffer)[0] = 123n;

const mb2 = new WasmModuleBuilder();
mb2.addMemory({ initial: 1, addressType: 'i64' });
const h = mb2.addFunction("bad", { params: ['i64'], results: ['i64'] });
h.body([
  ['local.get', 0],
  ['i64.load', [-1n, 8]],
  ['end']
]);
const e2 = expectError('encode', () => mb2.encode());
