load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const tag = mb.addTag({ params: ['i32'], results: [] });
mb.exportTag(tag, "t");

const exnType = mb.addType({ params: [], results: [{ ref: 'exn', nullable: false }] });

const f = mb.addFunction("rethrow", { params: [], results: [] });
f.body([
  ['block', exnType],
  ['try_table', null, [['all', 0, true]]],
  ['i32.const', 42],
  ['throw', tag],
  ['end'],
  ['unreachable'],
  ['end'],
  ['throw_ref'],
  ['end']
]);
f.exportAs("rethrow");

const instance = mb.instantiate({});
const exportedTag = instance.exports.t;
let caught = null;
try {
  instance.exports.rethrow();
} catch (e) {
  caught = e;
}
