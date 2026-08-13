load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

const f = mb.addFunction("mix", {
  params: ['i32', 'i64', 'f32', 'f64'],
  results: ['f64']
});

f.body([
  ['local.get', 0],
  ['f64.convert_i32_s'],
  ['local.get', 1],
  ['f64.convert_i64_s'],
  ['f64.add'],
  ['local.get', 2],
  ['f64.promote_f32'],
  ['f64.add'],
  ['local.get', 3],
  ['f64.add'],
  ['end']
]);

f.exportAs("mix");
const instance = mb.instantiate({});

const result = instance.exports.mix(2, 4n, 0.5, 0.25);
