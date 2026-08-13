load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });

const f = mb.addFunction("tt", { params: [], results: ['i32'] });
f.body([
  ['block', 'i32'],
  ['try_table', null, [[tag, 0]]],
  ['i32.const', 42],
  ['throw', tag],
  ['end'],
  ['i32.const', 5],
  ['end'],
  ['end']
]);
f.exportAs("tt");

const instance = mb.instantiate({});
const value = instance.exports.tt();
