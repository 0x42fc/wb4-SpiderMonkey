load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
const dataRef = mb.addDataSegment({ passive: true, data: [5, 6, 7, 8] });

const init = mb.addFunction("init", { params: ['i32'], results: [] });
init.body([
  ['local.get', 0],
  ['i32.const', 0],
  ['i32.const', 4],
  ['memory.init', dataRef],
  ['end']
]);
init.exportAs("init");

const read = mb.addFunction("byte_at", { params: ['i32'], results: ['i32'] });
read.body([
  ['local.get', 0],
  ['i32.load8_u', [0, 1]],
  ['end']
]);
read.exportAs("byte_at");

const instance = mb.instantiate({});
instance.exports.init(0);
