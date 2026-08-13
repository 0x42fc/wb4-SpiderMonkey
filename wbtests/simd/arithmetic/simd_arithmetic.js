load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction
("add_splats",
 { params: [],
 results: ['i32']
});

f.body([
  ['i32.const', 1],
  ['i32x4.splat'],
  ['i32.const', 2],
  ['i32x4.splat'],
  ['i32x4.add'],
  ['i32x4.extract_lane', 2],
  ['end']
]);

f.exportAs("add_splats");

const instance = mb.instantiate({});
const lane = instance.exports.add_splats();
