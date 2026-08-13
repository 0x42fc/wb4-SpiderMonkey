load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad", { params: [], results: ['i32'] });
f.body([['i32.const', 1, 2], ['end']]);
const e = expectError('stack-check', () => mb.encode());

const mb2 = new WasmModuleBuilder();
const f2 = mb2.addFunction("bad2", { params: [], results: ['i32'] });
f2.body([['call'], ['end']]);
const e2 = expectError('stack-check', () => mb2.encode());

const mb3 = new WasmModuleBuilder();
const f3 = mb3.addFunction("bad3", { params: [], results: ['i32'] });
f3.body([
  ['i32.const', 0],
  ['br', 0, 99],
  ['end']
]);
const e3 = expectError('stack-check', () => mb3.encode());

const mb4 = new WasmModuleBuilder();
const f4 = mb4.addFunction("bad4", { params: [], results: ['i32'] });
f4.body([['local.get'], ['end']]);
const e4 = expectError('stack-check', () => mb4.encode());

const mb5 = new WasmModuleBuilder();
mb5.setStackTypeChecking(false);
const f5 = mb5.addFunction("bad5", { params: [], results: ['i32'] });
f5.body([['i32.const', 1, 2], ['end']]);
const e5 = expectError('encode', () => mb5.encode());
