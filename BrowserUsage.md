# Browser Usage

`WasmBuilder.js` can be used to create **WebAssembly** modules for *browser* testing and fuzzing.

### Basic HTML

```html
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <title>Wasm Test</title>
</head>
<body>
<script>
// WasmBuilder.js code here
//
// 
//
// End of the builder code.

// Start creating modules.
const mb = new WasmModuleBuilder();

const base = mb.addType({
    kind: 'struct',
    fields: ['i32'],
    final: false
});

const sub = mb.addType({
    kind: 'struct',
    fields: ['i32', 'i64'],
    supertype: base
});

const mk = mb.addFunction("mk", {
    params: ['i32', 'i64'],
    results: [{ ref: sub, nullable: true }]
});

mk.body([
    ['local.get', 0],
    ['local.get', 1],
    ['struct.new', sub],
    ['end']
]);

mk.exportAs("mk");

const rd = mb.addFunction("rd_base", {
    params: [{ ref: base, nullable: true }],
    results: ['i32']
});

rd.body([
    ['local.get', 0],
    ['struct.get', base, 0],
    ['end']
]);

rd.exportAs("rd_base");

const instance = mb.instantiate({});
const obj = instance.exports.mk(5, 9n);
const field = instance.exports.rd_base(obj);

console.log(instance, "reached?");
</script>
</body>
</html>
```

Save the file as `test.html` and open it directly in the browser. No local server is required for this example.
Open the *browser* **Developer Tools** and *check* the Console.

### Expected Output

```text
WebAssembly.Instance {  }
reached test.html:5448:9
```

Depending on the browser, the console may also display a warning such as:

```text
This page is in Quirks Mode. Page layout may be impacted.
For Standards Mode use "<!DOCTYPE html>".
```

Using `<!doctype html>` at the beginning of the document prevents the page from being placed in Quirks Mode.  
