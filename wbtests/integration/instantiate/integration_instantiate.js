load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'add_one', {
  kind: 'function',
  type: { params: ['i32'], results: ['i32'] }
});
mb.addImport('env', 'mem', { kind: 'memory', initial: 1 });
mb.addImport('env', 'base', { kind: 'global', type: 'i32', mutable: false });

const f = mb.addFunction("combo", { params: [], results: ['i32'] });
f.body([
  ['i32.const', 0],
  ['i32.const', 41],
  ['i32.store', [0, 2]],
  ['i32.const', 0],
  ['i32.load', [0, 2]],
  ['call', 0],
  ['global.get', 0],
  ['i32.add'],
  ['end']
]);
f.exportAs("combo");

const instance = mb.instantiate({
  env: {
    add_one: (x) => x + 1,
    mem: new WebAssembly.Memory({ initial: 1 }),
    base: new WebAssembly.Global({ value: 'i32', mutable: false }, 100)
  }
});
const result = instance.exports.combo();
