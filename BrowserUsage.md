# Browser Usage

`WasmBuilder.js` can be used to create **WebAssembly** modules for *browser* testing and fuzzing.

### Loading

In the browser, load the builder before your code, either by pasting its
contents inline or with a script tag:

```html
<script src="wbunit/wasm/WasmBuilder.js"></script>
```

In the SpiderMonkey shell, load it with `load("wbunit/wasm/WasmBuilder.js")`.

When the builder rejects a module, `Encode()` throws a `StackCheckError`.
Report it in the browser with `console.log(FormatError(e))`; in the shell,
`print(FormatError(e))`.

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

const base = mb.AddType({
    kind: 'struct',
    fields: ['i32'],
    final: false
});

const sub = mb.AddType({
    kind: 'struct',
    fields: ['i32', 'i64'],
    supertype: base
});

const mk = mb.AddFunction("mk", {
    params: ['i32', 'i64'],
    results: [{ ref: sub, nullable: true }]
});

mk.Body([
    ['local.get', 0],
    ['local.get', 1],
    ['struct.new', sub],
    ['end']
]);

mk.ExportAs("mk");

const rd = mb.AddFunction("rd_base", {
    params: [{ ref: base, nullable: true }],
    results: ['i32']
});

rd.Body([
    ['local.get', 0],
    ['struct.get', base, 0],
    ['end']
]);

rd.ExportAs("rd_base");

const instance = mb.Instantiate({});
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
reached <page>:<line>:<col>
```

The exact file name and line numbers depend on how the page is saved; the
point is that `instance.exports.mk(5, 9n)` returns a struct and
`instance.exports.rd_base(obj)` reads its first field.

Depending on the browser, the console may also display a warning such as:

```text
This page is in Quirks Mode. Page layout may be impacted.
For Standards Mode use "<!DOCTYPE html>".
```

Using `<!doctype html>` at the beginning of the document prevents the page from being placed in Quirks Mode.  
