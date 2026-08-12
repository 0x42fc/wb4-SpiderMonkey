load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addMemory(1);
mb.addDataSegment({ offset: 0, data: [10, 20, 30, 40] });

const f = mb.addFunction("byte_at", { params: ['i32'], results: ['i32'] });
f.body([
  ['local.get', 0],
  ['i32.load8_u', [0, 1]],
  ['end']
]);
f.exportAs("byte_at");

const instance = mb.instantiate({});
