load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
const helper = mb.addFunction("double", { params: ['i32'], results: ['i32'] });
helper.body([
  ['local.get', 0],
  ['i32.const', 2],
  ['i32.mul'],
  ['end']
]);

const main = mb.addFunction("quad", { params: ['i32'], results: ['i32'] });
main.body([
  ['local.get', 0],
  ['call', 'double'],
  ['call', 'double'],
  ['end']
]);
main.exportAs("quad");

const instance = mb.instantiate({});
const result = instance.exports.quad(5);
