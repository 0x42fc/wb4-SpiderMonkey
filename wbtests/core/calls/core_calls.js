load("wbunit/wasm/WasmBuilder.js");

// imported in JS shell or env.
const mb = new WasmModuleBuilder();

// helper
const helper = mb.addFunction("double", { params: ['i32'], results: ['i32'] });
helper.body([
  ['local.get', 0],
  ['i32.const', 2],
  ['i32.mul'],
  ['end']
]);

// main
// quad, single param..
const main = mb.addFunction("quad", { 
  params: ['i32'], 
  results: ['i32'] });

// body
main.body([
  ['local.get', 0],
  ['call', 'double'],
  ['call', 'double'],
  ['end']
]);

// exported 
main.exportAs("quad");

const instance = mb.instantiate({}); // instantiation
const result = instance.exports.quad(5); // exported via JS
// console.log(instance, "Expected!");
print(instance, "Expected!");
