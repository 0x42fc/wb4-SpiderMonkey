# Browser Usage

WasmBuilder works in the browser too. You can use it to build and test WebAssembly modules.

### Loading

In the browser, add the builder before your code:

```html
<script src="path/to/WasmBuilder.js"></script>
```

In the SpiderMonkey shell:

```js
load("path/to/WasmBuilder.js");
```

### WasmGC HTML Demo

This example builds a module with GC structs, arrays, memory, tables, imports, and exports. It runs in the browser console.

```html
<script>
// In the shell, use load("WasmBuilder.js") instead of a script tag.
// Use console.log instead of print for browser output.

const mb = new WasmModuleBuilder();

const Point2D = mb.AddType({
  kind: 'struct',
  fields: [
    { type: 'i32', mutable: false },
    { type: 'i32', mutable: false },
  ],
  final: false,
});

const Point3D = mb.AddType({
  kind: 'struct',
  fields: [
    { type: 'i32', mutable: false },
    { type: 'i32', mutable: false },
    { type: 'i32', mutable: false },
  ],
  supertype: Point2D,
  final: false,
});

const MutableBox = mb.AddType({
  kind: 'struct',
  fields: [
    { type: 'i32', mutable: true },
  ],
  final: true,
});

const IntArray = mb.AddType({
  kind: 'array',
  element: {
    type: 'i32',
    mutable: true,
  },
  final: true,
});


const t_main = mb.AddType({
  params: [],
  results: ['i32'],
});

const t_log = mb.AddType({
  params: ['i32'],
  results: [],
});

const t_ctor2d = mb.AddType({
  params: ['i32', 'i32'],
  results: [{ ref: Point2D, nullable: true }],
});

const t_sum2d = mb.AddType({
  params: [{ ref: Point2D, nullable: true }],
  results: ['i32'],
});

const t_tag = mb.AddType({
  params: ['i32'],
  results: [],
});

const t_arrayCtor = mb.AddType({
  params: ['i32', 'i32'],
  results: [{ ref: IntArray, nullable: true }],
});


mb.AddImport('env', 'log', {
  kind: 'function',
  type: t_log,
});

mb.AddImport('env', 'tbl1', {
  kind: 'table',
  element: 'funcref',
  initial: 1,
});

mb.AddImport('env', 'tbl2', {
  kind: 'table',
  element: 'funcref',
  initial: 1,
});

mb.AddImport('env', 'hostRef', {
  kind: 'global',
  type: 'externref',
  mutable: false,
});

mb.AddImport('env', 'tag0', {
  kind: 'tag',
  type: t_tag,
});


mb.AddTable({
  element: 'funcref',
  initial: 2,
  maximum: 2,
});

// One memory only (no duplicate with imported memory).
mb.AddMemory({ initial: 1 });

const g_anyref = mb.AddGlobal('anyref', null, true);
const g_counter = mb.AddGlobal('i64', 0n, true);

mb.AddTag(t_tag);

// Data segment with plain byte values.
mb.AddDataSegment({
  offset: 0,
  data: [0x44, 0x44, 0x42, 0x42, 0x11, 0x11, 0x41, 0x41],
});

const f_createPoint2D = mb.AddFunction('createPoint2D', t_ctor2d);

f_createPoint2D.Body([
  ['local.get', 0],
  ['local.get', 1],
  ['struct.new', Point2D],
  ['end'],
]);

const f_pointSum = mb.AddFunction('pointSum', t_sum2d);

f_pointSum.Body([
  ['local.get', 0],
  ['struct.get', Point2D, 0],
  ['local.get', 0],
  ['struct.get', Point2D, 1],
  ['i32.add'],
  ['end'],
]);

const f_makeIntArray = mb.AddFunction('makeIntArray', t_arrayCtor);

f_makeIntArray.Body([
  ['local.get', 0],
  ['local.get', 1],
  ['array.new', IntArray],
  ['end'],
]);

const f_boxDemo = mb.AddFunction('boxDemo', t_main);

f_boxDemo.Body([
  ['i32.const', 42],
  ['struct.new', MutableBox],
  ['struct.get', MutableBox, 0],
  ['end'],
]);


const f_main = mb.AddFunction('main', t_main);

f_main.Body([
  // Point2D(3,4) sum = 7
  ['i32.const', 3],
  ['i32.const', 4],
  ['call', f_createPoint2D],
  ['call', f_pointSum],

  // Point3D(1,2,3) as Point2D sum = 3
  ['i32.const', 1],
  ['i32.const', 2],
  ['i32.const', 3],
  ['struct.new', Point3D],
  ['call', f_pointSum],
  ['i32.add'],

  // Box(42) = 42
  ['call', f_boxDemo],
  ['i32.add'],

  // IntArray(5,10) length = 5
  ['i32.const', 5],
  ['i32.const', 10],
  ['call', f_makeIntArray],
  ['array.len'],
  ['i32.add'],

  // memory store 1 at offset 0, load it back
  ['i32.const', 0],
  ['i32.const', 1],
  ['i32.store', 0],
  ['i32.const', 0],
  ['i32.load', 0],
  ['i32.add'],

  // + 92
  ['i32.const', 92],
  ['i32.add'],

  // save, log, return
  ['local.set', 'result'],
  ['local.get', 'result'],
  ['call', 'log'],
  ['local.get', 'result'],
  ['end'],
]);

f_main.AddLocal('i32', 'result');


mb.ExportMemory(0, 'memory');
mb.ExportGlobal(g_anyref, 'anyrefGlobal');
f_main.ExportAs('main');

try {
  const bytes = mb.Encode();

  if (bytes === undefined) {
    console.error("Encoding returned undefined. Check builder errors above.");
  } else {
    console.log("Encoded size:", bytes.length, "bytes");

    // Import object for the browser
    const imports = {
      env: {
        log: function (x) {
          console.log("[host log]", x);
        },

        tbl1: new WebAssembly.Table({
          element: 'funcref',
          initial: 1,
        }),

        tbl2: new WebAssembly.Table({
          element: 'funcref',
          initial: 1,
        }),

        hostRef: {
          value: { some: 'object' },
        },

        tag0: new WebAssembly.Tag({
          parameters: ['i32'],
        }),
      },
    };

    const wasmModule = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(wasmModule, imports);

    console.log("Summary:");
    console.log(JSON.stringify(mb.Summary(), null, 2));
    console.log("");
    console.log("Calling main()...");

    const result = instance.exports.main();

    console.log("Result:", result);
    console.log("");
    console.log("anyrefGlobal:", instance.exports.anyrefGlobal);
    console.log("Worked!");
  }
} catch (e) {
  console.error("Error:", e.message || e);
  if (e instanceof CompilationFailed) {
    console.error("Builder error. Check the error message above.");
  }
}
</script>
```

Save the file as `demo.html` and open it in the browser. Open the Developer Tools console to see the output.

### What this demo does

1. Creates 4 GC types: Point2D, Point3D, MutableBox, IntArray
2. Defines 5 functions: createPoint2D, pointSum, makeIntArray, boxDemo, main
3. Imports a log function, 2 tables, a host reference, and an exception tag
4. Exports memory, the anyref global, and the main function
5. main() computes: 7 + 3 + 42 + 5 + 1 + 92 = 150

*END OF THE EXPlANATION*
