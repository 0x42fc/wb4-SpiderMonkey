# Browser Usage

`WasmBuilder.js` can be used to create **WebAssembly** modules for *browser* testing and fuzzing.

### Loading

In the browser, load the builder before your code, either by pasting its
contents inline or with a script tag:

```html
<script src="path/to/.js"></script>
```

In the SpiderMonkey shell, load it with `load("path/to/.js")`.


### WasmGC Proposal HTML Demo. 

```js
<script>
/*Note: Use "c-log" for `print`, it would work in both environment (a) shell (b) browser. */
/* For shell: load(""); */
/* For browser: <script src=""></script> */

const mb = new WasmModuleBuilder();
/* GC AGGREGATE TYPES */
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

/* 6 FUNCTION TYPES */

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
  results: [
    {
      ref: Point2D,
      nullable: true,
    },
  ],
});

const t_sum2d = mb.AddType({
  params: [
    {
      ref: Point2D,
      nullable: true,
    },
  ],
  results: ['i32'],
});

const t_tag = mb.AddType({
  params: ['i32'],
  results: [],
});

const t_arrayCtor = mb.AddType({
  params: ['i32', 'i32'],
  results: [
    {
      ref: IntArray,
      nullable: true,
    },
  ],
});

/* IMPORTS */
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

mb.AddImport('env', 'mem0', {
  kind: 'memory',
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

/* DEFINITIONS */
mb.AddTable({
  element: 'funcref',
  initial: 2,
  maximum: 2,
});

mb.AddMemory({
  initial: 1,
});

const g_anyref = mb.AddGlobal(
  'anyref',
  null,
  true
);

const g_counter = mb.AddGlobal(
  'i64',
  0n,
  true
);

mb.AddTag(t_tag);

mb.AddElemSegment({
  table: 0,
  offset: 0,
  indices: ['log'],
});

mb.AddDataSegment({
  offset: 0,
  data: [
    0x4444,
    0x424242,
    0x111111,
    0x41414141,
  ],
});

/* FUNC 0: createPoint2D */
const f_createPoint2D =
  mb.AddFunction('createPoint2D', t_ctor2d);

f_createPoint2D.Body([
  ['local.get', 0],
  ['local.get', 1],
  ['struct.new', Point2D],
  ['end'],
]);

/* FUNC 1: pointSum */
const f_pointSum =
  mb.AddFunction('pointSum', t_sum2d);

f_pointSum.Body([
  ['local.get', 0],
  ['struct.get', Point2D, 0],

  ['local.get', 0],
  ['struct.get', Point2D, 1],

  ['i32.add'],
  ['end'],
]);

/* FUNC 2: makeIntArray */
const f_makeIntArray =
  mb.AddFunction('makeIntArray', t_arrayCtor);

f_makeIntArray.Body([
  ['local.get', 0],
  ['local.get', 1],
  ['array.new', IntArray],
  ['end'],
]);

/* FUNC 3: boxDemo */
const f_boxDemo =
  mb.AddFunction('boxDemo', t_main);

f_boxDemo.Body([
  ['i32.const', 42],
  ['struct.new', MutableBox],
  ['struct.get', MutableBox, 0],
  ['end'],
]);

/* FUNC 4: main */
const f_main =
  mb.AddFunction('main', t_main);

f_main.Body([

  /* Point2D(3,4) = 7 */
  ['i32.const', 3],
  ['i32.const', 4],
  ['call', f_createPoint2D],
  ['call', f_pointSum],

  /* Point3D(1,2,3) -> Point2D = 3 */
  ['i32.const', 1],
  ['i32.const', 2],
  ['i32.const', 3],
  ['struct.new', Point3D],
  ['call', f_pointSum],
  ['i32.add'],

  /* Box = 42 */
  ['call', f_boxDemo],
  ['i32.add'],

  /* IntArray(5,10) = length 5 */
  ['i32.const', 5],
  ['i32.const', 10],
  ['call', f_makeIntArray],
  ['array.len'],
  ['i32.add'],

  /* Memory store / load = 1 */
  ['i32.const', 0],
  ['i32.const', 1],
  ['i32.store', 0],

  ['i32.const', 0],
  ['i32.load', 0],
  ['i32.add'],

  /* +92 */
  ['i32.const', 92],
  ['i32.add'],

  /* Save, log and return */
  ['local.set', 'result'],
  ['local.get', 'result'],
  ['call', 'log'],
  ['local.get', 'result'],
  ['end'],
]);

f_main.AddLocal('i32', 'result');

/* EXPORTS */
mb.ExportMemory(0, 'memory');
mb.ExportGlobal(g_anyref, 'anyrefGlobal');
f_main.ExportAs('main');

/* ENCODE */
const bytes = mb.Encode();

if (bytes === undefined) {
  throw new Error('Encoding failed');
}

/* IMPORT OBJECT */
const imports = {
  env: {
    log: function (x) {
      console.log('[host log]', x);
    },

    tbl1: new WebAssembly.Table({
      element: 'funcref',
      initial: 1,
    }),

    tbl2: new WebAssembly.Table({
      element: 'funcref',
      initial: 1,
    }),

    mem0: new WebAssembly.Memory({
      initial: 1,
    }),

    hostRef: {
      value: {
        some: 'object',
      },
    },

    tag0: new WebAssembly.Tag({
      parameters: ['i32'],
    }),
  },
};

/* COMPILE */
const wasmModule =
  new WebAssembly.Module(bytes);

const instance =
  new WebAssembly.Instance(
    wasmModule,
    imports
  );

/* RUN */
console.log("Summary:");
console.log(JSON.stringify(mb.Summary(), null, 2));

console.log("Encoded size:", bytes.length, "bytes");

console.log("");
console.log("Calling main()...");

const result = instance.exports.main();

console.log("Result:", result);

console.log("");
console.log("anyrefGlobal:", instance.exports.anyrefGlobal);
console.log("Worked!");
</script>
```

Save the file as `[.getAddrof].html` and open it directly in the browser.
Open the *browser* **Developer Tools** and *check* the Console.


