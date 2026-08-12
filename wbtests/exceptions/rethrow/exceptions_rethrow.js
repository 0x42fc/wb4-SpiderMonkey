load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });
mb.addMemory(1);

const f = mb.addFunction("rethrow", { params: [], results: ['i32'] });
f.addLocal('i32', 'p');
f.body([
  ['block', 'i32'],
  ['try'],
  ['try'],
  ['i32.const', 42],
  ['throw', tag],
  ['catch', tag],
  ['drop'],
  ['rethrow', 0],
  ['end'],
  ['catch', tag],
  ['local.set', 'p'],
  ['i32.const', 0],
  ['local.get', 'p'],
  ['i32.store', [0, 2]],
  ['end'],
  ['i32.const', 7],
  ['end'],
  ['end']
]);
f.exportAs("rethrow");

const read = mb.addFunction("read", { params: [], results: ['i32'] });
read.body([
  ['i32.const', 0],
  ['i32.load', [0, 2]],
  ['end']
]);
read.exportAs("read");

const instance = mb.instantiate({});
const result = instance.exports.rethrow();
const payload = instance.exports.read();
