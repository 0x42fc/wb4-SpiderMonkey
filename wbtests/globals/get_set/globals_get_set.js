load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addGlobal('i32', 0, true);

const f = mb.addFunction("inc", { params: [], results: ['i32'] });
f.body([
  ['global.get', 0],
  ['i32.const', 1],
  ['i32.add'],
  ['global.set', 0],
  ['global.get', 0],
  ['end']
]);
f.exportAs("inc");

const instance = mb.instantiate({});
const first = instance.exports.inc();
const second = instance.exports.inc();
const third = instance.exports.inc();
