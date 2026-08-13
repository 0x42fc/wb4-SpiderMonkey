load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });

const f = mb.addFunction("catch_it", { params: [], results: ['i32'] });
f.body([
  ['try', 'i32'],
  ['i32.const', 42],
  ['throw', tag],
  ['catch', tag],
  ['i32.const', 100],
  ['i32.add'],
  ['end'],
  ['end']
]);
f.exportAs("catch_it");

const instance = mb.instantiate({});
const value = instance.exports.catch_it();
