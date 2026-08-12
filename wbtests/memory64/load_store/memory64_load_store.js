load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory({ initial: 1, addressType: 'i64' });

const f = mb.addFunction("roundtrip", { params: ['i32', 'i64'], results: ['i32'] });
f.body([
  ['local.get', 1],
  ['local.get', 0],
  ['i32.store', [0, 2]],
  ['local.get', 1],
  ['i32.load', [0, 2]],
  ['end']
]);
f.exportAs("roundtrip");

const instance = mb.instantiate({});
const r1 = instance.exports.roundtrip(42, 0n);
const r2 = instance.exports.roundtrip(-7, 8n);
