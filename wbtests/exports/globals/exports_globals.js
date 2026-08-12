load("test/mjsunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addGlobal('i32', 5);
mb.addGlobal('i32', 0, true);
mb.exportGlobal(0, "g");
mb.exportGlobal(1, "m");

const instance = mb.instantiate({});
instance.exports.m.value = 9;
