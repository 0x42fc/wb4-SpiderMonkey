load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });
mb.exportTag(tag, "t");

const f = mb.addFunction("boom", { params: [], results: [] });
f.body([
  ['i32.const', 7],
  ['throw', tag],
  ['end']
]);
f.exportAs("boom");

const instance = mb.instantiate({});
const exported = instance.exports.t;
let caught = null;
try {
  instance.exports.boom();
} catch (e) {
  caught = e;
}
