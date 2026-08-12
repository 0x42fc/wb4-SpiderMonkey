load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'g', { kind: 'global', type: 'i32', mutable: true });

const f = mb.addFunction("bump", { params: [], results: ['i32'] });
f.body([
  ['global.get', 0],
  ['i32.const', 1],
  ['i32.add'],
  ['global.set', 0],
  ['global.get', 0],
  ['end']
]);
f.exportAs("bump");

const g = new WebAssembly.Global({ value: 'i32', mutable: true }, 10);
const instance = mb.instantiate({ env: { g } });
const result = instance.exports.bump();
