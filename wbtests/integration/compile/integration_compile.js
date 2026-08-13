load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'fn', {
  kind: 'function',
  type: { params: [], results: [] }
});
const f = mb.addFunction("id", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['end']
]);
f.exportAs("id");

const compiled = mb.compile();
