load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const helper = mb.addFunction("helper", { params: [], results: [] });
helper.body([['nop'], ['end']]);
const f = mb.addFunction("u", { params: [], results: [] });
f.body([
  ['ref.func', 'helper'],
  ['drop'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
