load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();
mb.addTable('funcref', 2);
mb.exportTable(0, "tbl");

const instance = mb.instantiate({});
