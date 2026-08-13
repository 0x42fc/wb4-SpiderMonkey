load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const st = mb.addType({ kind: 'struct', fields: [{ type: 'i32', mutable: true }, 'f64'] });

const f = mb.addFunction("set_get", { params: [], results: ['i32'] });
f.addLocal({ ref: st, nullable: true });
f.body([
  ['i32.const', 0],
  ['f64.const', 0.0],
  ['struct.new', st],
  ['local.set', 0],
  ['local.get', 0],
  ['i32.const', 42],
  ['struct.set', st, 0],
  ['local.get', 0],
  ['struct.get', st, 0],
  ['end']
]);
f.exportAs("set_get");

const instance = mb.instantiate({});
const value = instance.exports.set_get();
