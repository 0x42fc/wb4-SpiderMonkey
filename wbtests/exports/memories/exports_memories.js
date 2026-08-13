load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
mb.exportMemory(0, "mem");

const f = mb.addFunction("read", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['i32.load', [0, 2]],
  ['end']
]);
f.exportAs("read");

const instance = mb.instantiate({});
new DataView(instance.exports.mem.buffer).setInt32(16, 1234, true);
const read = instance.exports.read(16);
