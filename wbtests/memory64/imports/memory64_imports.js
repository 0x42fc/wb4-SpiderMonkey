load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addImport('env', 'mem', {
  kind: 'memory',
  initial: 1,
  addressType: 'i64'
});

const f = mb.addFunction("pages", { params: [], results: ['i64'] });
f.body([
  ['memory.size'],
  ['end']
]);
f.exportAs("pages");

const compiled = mb.compile();

const e = expectError('engine-instantiate', function () {
  mb.instantiate({
    env: { mem: new WebAssembly.Memory({ initial: 1, index: 'i64' }) }
  });
});
