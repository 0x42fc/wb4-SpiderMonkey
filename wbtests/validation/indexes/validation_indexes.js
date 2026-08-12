load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("bad_local", { params: [], results: ['i32'] });
f.body([
  ['local.get', 99],
  ['end']
]);
let e1 = null;
try {
  mb.encode();
} catch (err) {
  e1 = err;
}

const mb2 = new WasmModuleBuilder();
const g = mb2.addFunction("bad_call", { params: [], results: [] });
g.body([
  ['call', 'no_such_function'],
  ['end']
]);
let e2 = null;
try {
  mb2.encode();
} catch (err) {
  e2 = err;
}
