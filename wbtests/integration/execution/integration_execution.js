load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const fac = mb.addFunction("fac", { params: ['i32'], results: ['i32'] });
fac.body([
  ['local.get', 0],
  ['i32.const', 1],
  ['i32.le_s'],
  ['if', 'i32'],
  ['i32.const', 1],
  ['else'],
  ['local.get', 0],
  ['local.get', 0],
  ['i32.const', 1],
  ['i32.sub'],
  ['call', 'fac'],
  ['i32.mul'],
  ['end'],
  ['end']
]);
fac.exportAs("fac");

const instance = mb.instantiate({});
