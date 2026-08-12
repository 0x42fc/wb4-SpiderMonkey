load("test/mjsunit/wasm/WasmBuilder.js");

const tag = new WebAssembly.Tag({ parameters: ['i32'] });

const mb = new WasmModuleBuilder();
mb.addImport('env', 't', {
  kind: 'tag',
  type: { params: ['i32'], results: [] }
});

const f = mb.addFunction("boom", { params: [], results: [] });
f.body([
  ['i32.const', 42],
  ['throw', 0],
  ['end']
]);
f.exportAs("boom");

const instance = mb.instantiate({ env: { t: tag } });
let caught = null;
try {
  instance.exports.boom();
} catch (e) {
  caught = e;
}
