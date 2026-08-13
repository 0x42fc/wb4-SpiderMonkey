load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable({ element: 'externref', initial: 1 });
const f = mb.addFunction("c", { params: [], results: [] });
f.body([
  ['call_indirect', { params: [], results: [] }],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
