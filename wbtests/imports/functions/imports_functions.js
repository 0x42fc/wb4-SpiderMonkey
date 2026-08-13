load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'double', {
  kind: 'function',
  type: { params: ['i32'], results: ['i32'] }
});

const f = mb.addFunction("call_import", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['call', 0],
  ['end']
]);
f.exportAs("call_import");

const instance = mb.instantiate({ env: { double: (x) => x * 2 } });
const result = instance.exports.call_import(21);
