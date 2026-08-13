load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("is_null", { params: ['externref'], results: ['i32'] });

f.body([
  ['local.get', 0],
  ['ref.is_null'],
  ['end']
]);

f.exportAs("is_null");
const instance = mb.instantiate({});
