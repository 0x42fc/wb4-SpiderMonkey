load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'g', {
  kind: 'global',
  type: 'i32',
  mutable: false
});

const f = mb.addFunction("read", { params: [], results: ['i32'] });
f.body([
  ['global.get', 0],
  ['end']
]);
f.exportAs("read");

const instance = mb.instantiate({
  env: { g: new WebAssembly.Global({ value: 'i32', mutable: false }, 42) }
});
const value = instance.exports.read();
