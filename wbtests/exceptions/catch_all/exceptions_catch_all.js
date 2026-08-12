load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });

const f = mb.addFunction("catch_any", { params: [], results: ['i32'] });
f.body([
  ['try', 'i32'],
  ['i32.const', 42],
  ['throw', tag],
  ['catch_all'],
  ['i32.const', 7],
  ['end'],
  ['end']
]);
f.exportAs("catch_any");

const instance = mb.instantiate({});
const value = instance.exports.catch_any();
