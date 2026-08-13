load("wbunit/wasm/WasmBuilder.js");

const sig = { params: ['i32'], results: ['i32'] };

const mb = new WasmModuleBuilder();
const ft = mb.addType(sig);

const inc = mb.addFunction("inc", ft);
inc.body([
  ['local.get', 0],
  ['i32.const', 1],
  ['i32.add'],
  ['end']
]);
inc.exportAs("inc");

const get = mb.addFunction("get_inc", { params: [], results: [{ ref: ft, nullable: false }] });
get.body([
  ['ref.func', 'inc'],
  ['end']
]);
get.exportAs("get_inc");

const call = mb.addFunction("call_inc", {
  params: [{ ref: ft, nullable: true }, 'i32'],
  results: ['i32']
});
call.body([
  ['local.get', 1],
  ['local.get', 0],
  ['call_ref', ft],
  ['end']
]);
call.exportAs("call_inc");

const instance = mb.instantiate({});
const fn = instance.exports.get_inc();
const result = instance.exports.call_inc(fn, 5);
