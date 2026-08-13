load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const f = mb.addFunction("v", { params: [], results: [] });
f.body([
  ['i8x16.extract_lane_u', 25],
  ['drop'],
  ['end']
]);

const e = expectError('stack-check', function () { mb.encode(); });
