load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });
mb.exportTag(tag, "t");

const instance = mb.instantiate({});
const exported = instance.exports.t;
