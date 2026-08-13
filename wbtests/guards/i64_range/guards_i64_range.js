load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("min", { params: [], results: ['i64'] });
f.body([['i64.const', -(1n << 63n)], ['end']]);
f.exportAs("min");

const mb1b = new WasmModuleBuilder();
const fb = mb1b.addFunction("max", { params: [], results: ['i64'] });
fb.body([['i64.const', (1n << 63n) - 1n], ['end']]);
fb.exportAs("max");

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad", { params: [], results: ['i64'] });
f2.body([['i64.const', 1n << 63n], ['end']]);
const e2 = expectError('encode', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
const f3 = mb3.addFunction("bad2", { params: [], results: ['i64'] });
f3.body([['i64.const', -(1n << 63n) - 1n], ['end']]);
const e3 = expectError('encode', () => mb3.encode());

const minInstance = mb.instantiate({});
const maxInstance = mb1b.instantiate({});
