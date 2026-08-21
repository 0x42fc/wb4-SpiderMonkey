## WasmBuilder: How to Use It

WasmBuilder lets you build a **WebAssembly** module from JavaScript. You define the types, functions, memory, tables, globals, and exports. When you call `Encode()`, you get the raw module bytes. No need to deal with binary encoding by hand.

### Load the builder

```js
load("WasmBuilder.js");
```

Check it loaded:

```js
print(typeof WasmModuleBuilder); // "function"
```

### Create a module

```js
const mb = new WasmModuleBuilder();
```

The builder holds everything (types, functions, memory, tables, globals, imports, exports, segments) until you call `Encode()`.

---

### Error reporting

If something is wrong, the builder prints a `CompilationFailed` message and stops:

```text
CompilationFailed: function "bad":
TypeError: expected type i32, got f64.

@Stack:
test.js:23:5
```

The `@Stack:` line points to the code that created the bad instruction.

Builder bugs (things the builder should have caught but didn't) show up as a different error type. Those are not wrapped. You see the real error and the real stack.

---

### Functions

#### Creating a function

```js
const f = mb.AddFunction("add", {
  params: ['i32', 'i32'],
  results: ['i32']
});
```

The name is optional. If you give one, it must be unique. You can use the name later with `call`, `ref.func`, and `ExportFunction`.

If you add the same function type twice, the builder reuses the first type index.

#### Function signatures

A signature has `params` (inputs) and `results` (outputs).

```js
// Two i32 in, one i32 out
{ params: ['i32', 'i32'], results: ['i32'] }

// No inputs, no outputs
{ params: [], results: [] }

// One f64 in, one f64 out
{ params: ['f64'], results: ['f64'] }
```

#### Adding locals

```js
f.AddLocal('i32');           // unnamed
f.AddLocal('i32', 'value');  // named, you can use 'value' in instructions
```

Parameters use the first local indices. Extra locals come after the parameters.

#### Setting the body

```js
f.Body([
  ['local.get', 0],
  ['local.get', 1],
  ['i32.add'],
  ['end'],
]);
```

Each instruction is `[name, ...args]`. The body must end with `'end'`. You can only call `Body()` once. It returns the function builder, so you can chain calls.

#### Exporting a function

```js
f.ExportAs("add");
```

Now you can call it from JavaScript:

```js
instance.exports.add(2, 3); // 5
```

---

### Value types

#### Numeric types

```text
i32    i64    f32    f64
```

#### SIMD type

```text
v128
```

#### Half-precision float (FP16, experimental)

```text
f16
```

The `f16` type is added to the type table. You can use it in struct fields and function signatures. SpiderMonkey may not support `f16` instructions yet. The builder will encode them, but the engine decides if they run.

#### Reference types

```text
funcref    externref    anyref    eqref
i31ref     structref    arrayref  exnref
```

#### Typed GC references

```js
{ ref: typeRef, nullable: true }
{ ref: typeRef, nullable: false }
```

#### Packed field types

```text
i8    i16
```

These work inside struct and array fields. On the stack they act as `i32`.

#### i64 values

Use BigInt for i64 constants:

```js
['i64.const', 42n]
```

For globals:

```js
mb.AddGlobal('i64', 0n, true);
```

---

### Control flow

#### Block

```js
['block', <blocktype>]
  ...
['end']
```

#### Loop

```js
['loop', <blocktype>]
  ...
['end']
```

#### If / else

```js
['if', <blocktype>]
  ...
['else']
  ...
['end']
```

#### Try / catch

```js
['try', <blocktype>]
  ...
['catch', tagRef]
  ...
['end']
```

#### Catch all

```js
['try', <blocktype>]
  ...
['catch_all']
  ...
['end']]
```

#### Catch ref (exnref binding)

```js
['try', <blocktype>]
  ...
['catch_ref', tagRef]
  ...
['end']
```

Pushes the tag payload values plus an `exnref` onto the stack.

#### Catch all ref

```js
['try', <blocktype>]
  ...
['catch_all_ref']
  ...
['end']
```

Pushes just the `exnref` onto the stack.

#### Delegate

```js
['try', <blocktype>]
  ...
['delegate', <depth>]
```

#### Try table

```js
['try_table', <blocktype>, catches]
```

Each catch entry:

```text
[tagRef | 'all', depth, captureExnRef?]
```

Example:

```js
['try_table',
  { params: [], results: ['i32'] },
  [
    [tagIndex, 0],         // catch
    ['all', 0],            // catch_all
    [tagIndex, 0, true]    // catch_ref
  ]
]
```

#### Branches

```js
['br', <depth>]
['br_if', <depth>]
['br_table', <depths>, <defaultDepth>]
```

#### Other control

```js
['return']
['unreachable']
['nop']
['select']
['select_t', [<types>]]
```

---

### Block types

Empty block:

```js
['block']       // or ['block', null]
```

Single result:

```js
['block', 'i32']
```

Multiple results:

```js
['block', { params: [], results: ['i32', 'f64'] }]
```

Reuse a type index:

```js
['block', typeIndex]
```

Do NOT use an array:

```js
// wrong:
['block', ['i32', 'f64']]

// right:
['block', { params: [], results: ['i32', 'f64'] }]
```

---

### Constants

```js
['i32.const', 42]
['i64.const', 42n]
['f32.const', 1.5]
['f64.const', 3.25]
['v128.const', <16 bytes>]
['f16.const', 1.5]        // experimental
['ref.null', 'func']
```

---

### Local instructions

```js
['local.get', 0]
['local.set', 0]
['local.tee', 0]
```

You can use a name if you added one with `AddLocal`:

```js
['local.get', 'value']
```

---

### Global instructions

```js
['global.get', 0]
['global.set', 0]
```

Imported globals can be referenced by their import name. Defined globals (from `AddGlobal`) use indices.

---

### Calls

#### Direct call

```js
['call', funcRef]
```

#### Indirect call (through a table)

```js
['call_indirect', typeRef]
['call_indirect', typeRef, tableRef]  // explicit table
```

#### Call a reference

```js
['call_ref', typeRef]
```

#### Tail calls

```js
['return_call', funcRef]
['return_call_ref', typeRef]
```

---

### Memory

#### Creating memory

```js
mb.AddMemory(1);              // 1 page initial
mb.AddMemory(1, 2);           // 1 page initial, 2 pages max

mb.AddMemory({                // descriptor form
  initial: 1,
  maximum: 2
});
```

#### Shared memory

```js
mb.AddMemory({
  initial: 1,
  shared: true
});
```

Shared memory is needed for atomic instructions.

#### Memory64

```js
mb.AddMemory({
  initial: 1,
  addressType: 'i64'
});
```

With Memory64, addresses are `i64` instead of `i32`.

#### Custom page sizes

```js
mb.AddMemory({
  initial: 1,
  pageSize: 256     // 256 bytes per page instead of 65536
});
```

Page size must be a power of 2, at most 65536. If you don't set it, the default 65536 is used.

#### Memory indexes

Imported memories come first. Defined memories come after. The index returned by `AddMemory` follows this order.

---

### Memory loads

```js
['i32.load', memarg]
['i64.load', memarg]
['f32.load', memarg]
['f64.load', memarg]
```

Narrow loads:

```js
['i32.load8_s', memarg]
['i32.load8_u', memarg]
['i32.load16_s', memarg]
['i32.load16_u', memarg]
['i64.load8_s', memarg]
['i64.load8_u', memarg]
['i64.load16_s', memarg]
['i64.load16_u', memarg]
['i64.load32_s', memarg]
['i64.load32_u', memarg]
```

---

### Memory stores

```js
['i32.store', memarg]
['i64.store', memarg]
['f32.store', memarg]
['f64.store', memarg]
```

Narrow stores:

```js
['i32.store8', memarg]
['i32.store16', memarg]
['i64.store8', memarg]
['i64.store16', memarg]
['i64.store32', memarg]
```

---

### Memory arguments (memarg)

Just an offset:

```js
['i32.load', 0]
```

Offset and alignment:

```js
['i32.load', 0, 4]
```

Array form:

```js
['i32.load', [0, 4]]
```

With an explicit memory index:

```js
['i32.load', 0, 4, memIndex]
['i32.load', [0, 4, memIndex]]
```

Alignment must be a power of 2. The encoder stores it as log2(alignment).

---

### Bulk memory operations

```js
['memory.size']
['memory.grow']
['memory.copy']
['memory.fill']
['memory.init', dataRef]
['data.drop', dataRef]
['memory.discard']    // see note below
```

**Note on memory.discard:** The builder encodes `memory.discard` correctly (opcode `0xfc 0x12`). But the engine must support it too. If SpiderMonkey rejects your module, it means the engine build does not include this feature yet.

---

### Tables

#### Creating tables

```js
mb.AddTable('funcref', 1, 2);    // type, initial, max

mb.AddTable({                      // descriptor form
  element: 'funcref',
  initial: 1,
  maximum: 2
});

mb.AddTable({
  element: 'externref',
  initial: 1
});
```

#### Table instructions

```js
['table.get', tableRef]
['table.set', tableRef]
['table.size', tableRef]
['table.grow', tableRef]
['table.fill', tableRef]
['table.copy']
['table.init', elemRef, tableRef]
['elem.drop', elemRef]
```

---

### Imports

#### Function imports

```js
mb.AddImport('env', 'log', {
  kind: 'function',
  type: { params: ['i32'], results: [] }
});
```

Short form with `func`:

```js
mb.AddImport('env', 'log', {
  kind: 'func',
  type: { params: ['i32'], results: [] }
});
```

Alternate form:

```js
mb.AddImport('env', 'log', 'function', {
  params: ['i32'],
  results: []
});
```

#### Table imports

```js
mb.AddImport('env', 'tbl', {
  kind: 'table',
  element: 'funcref',
  initial: 1
});
```

#### Memory imports

```js
mb.AddImport('env', 'mem', {
  kind: 'memory',
  initial: 1,
  maximum: 2
});
```

Shared:

```js
mb.AddImport('env', 'mem', {
  kind: 'memory',
  initial: 1,
  shared: true
});
```

#### Global imports

```js
mb.AddImport('env', 'g', {
  kind: 'global',
  type: 'i32',
  mutable: false
});
```

#### Tag imports

```js
mb.AddImport('env', 'tag', {
  kind: 'tag',
  type: { params: ['i32'], results: [] }
});
```

#### Import indexes

Imports come first in each index space (functions, tables, memories, globals, tags). Defined items follow the imports.

---

### Exports

#### Function exports

```js
f.ExportAs("name");                       // from function builder
mb.ExportFunction("funcName", "export");  // by function name
mb.ExportFunction(f, "export");           // by builder
mb.ExportFunction(3, "export");           // by index
```

#### Other exports

```js
mb.ExportTable(0, "tbl");
mb.ExportMemory(0, "mem");
mb.ExportGlobal(0, "g");
mb.ExportTag(0, "tag");
```

---

### Globals

```js
mb.AddGlobal('i32', 0);              // immutable i32
mb.AddGlobal('i32', 5, true);        // mutable i32
mb.AddGlobal('i64', 0n, true);       // mutable i64
mb.AddGlobal('funcref', null);       // null funcref
mb.AddGlobal('f64', 1.5);            // f64
```

#### Initializer forms

```text
number          for i32, f32, f64
bigint          for i64
null            null reference using the global's type
string          null reference using the given heap type
{ref: funcRef}  function reference
[instructions]  constant expression
```

---

### GC types

#### Structs

```js
const t = mb.AddType({
  kind: 'struct',
  fields: ['i32', 'f64']
});
```

With mutability:

```js
const t = mb.AddType({
  kind: 'struct',
  fields: [
    { type: 'i32', mutable: true },
    { type: 'i8' }
  ]
});
```

#### Arrays

```js
const t = mb.AddType({
  kind: 'array',
  element: 'i32'
});

const t = mb.AddType({
  kind: 'array',
  element: { type: 'i32', mutable: true }
});
```

#### Subtyping

The base type must be declared first and must not be final:

```js
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
```

---

### GC instructions

#### Struct instructions

```js
['struct.new', typeRef]
['struct.new_default', typeRef]
['struct.get', typeRef, fieldIndex]
['struct.get_s', typeRef, fieldIndex]
['struct.get_u', typeRef, fieldIndex]
['struct.set', typeRef, fieldIndex]
```

For `struct.set`, push the reference first, then the value.

#### Array instructions

```js
['array.new', typeRef]
['array.new_default', typeRef]
['array.new_fixed', typeRef, count]
['array.new_data', typeRef, dataRef]
['array.new_elem', typeRef, elemRef]
['array.get', typeRef]
['array.get_s', typeRef]
['array.get_u', typeRef]
['array.set', typeRef]
['array.len']
['array.fill', typeRef]
['array.copy', typeRef, typeRef]
['array.init_data', typeRef, dataRef]
['array.init_elem', typeRef, elemRef]
```

For `array.get`, push the reference first, then the index.

#### i31 instructions

```js
['i31.new']
['i31.get_s']
['i31.get_u']
```

#### Reference conversions

```js
['any.convert_extern']
['extern.convert_any']
```

#### Reference instructions

```js
['ref.is_null']
['ref.as_non_null']
['ref.eq']
['ref.func', funcRef]
['ref.test', typeRef]
['ref.cast', typeRef]
['ref.test_null', typeRef]
['ref.cast_null', typeRef]
['ref.null', heapType]
```

#### Branch on reference

```js
['br_on_null', depth]
['br_on_non_null', depth]
['br_on_cast', flags, depth, srcTypeRef, dstTypeRef]
['br_on_cast_fail', flags, depth, srcTypeRef, dstTypeRef]
```

The `flags` byte (0..3) selects nullability of source and destination types.

---

### SIMD

#### v128 constants

16 bytes:

```js
['v128.const', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]
```

Hex string (32 characters):

```js
['v128.const', '00000000000000000000000000000000']
```

Lane form:

```js
['v128.const', ['i32x4', [1, 2, 3, 4]]]
```

Lane shapes:

```text
i8x16    i16x8    i32x4    i64x2    f32x4    f64x2
```

#### Splat

```js
['i8x16.splat']
['i16x8.splat']
['i32x4.splat']
['i64x2.splat']
['f32x4.splat']
['f64x2.splat']
```

#### Lane extraction

```js
['i8x16.extract_lane_s', lane]
['i8x16.extract_lane_u', lane]
['i32x4.extract_lane', lane]
['f32x4.extract_lane', lane]
// etc.
```

#### Lane replacement

```js
['i8x16.replace_lane', lane]
['i32x4.replace_lane', lane]
// etc.
```

#### Shuffle

```js
['i8x16.shuffle', <16 lane bytes>]
```

#### Bitselect

```js
['v128.bitselect']
```

Stack order: `a`, `b`, `mask` (mask is on top).

#### SIMD loads and stores

```js
['v128.load', memarg]
['v128.store', memarg]
```

Lane loads:

```js
['v128.load8_lane', memarg, lane]
['v128.load16_lane', memarg, lane]
['v128.load32_lane', memarg, lane]
['v128.load64_lane', memarg, lane]
```

Lane stores:

```js
['v128.store8_lane', memarg, lane]
['v128.store16_lane', memarg, lane]
['v128.store32_lane', memarg, lane]
['v128.store64_lane', memarg, lane]
```

#### SIMD arithmetic

All standard SIMD names work:

```text
i8x16.add    i8x16.sub    i16x8.mul
f32x4.add    f32x4.sub    f32x4.mul
i32x4.dot_i16x8_s
v128.and     v128.or      v128.xor
```

#### Lane bounds

```text
i8x16   0..15
i16x8   0..7
i32x4   0..3
i64x2   0..1
f32x4   0..3
f64x2   0..1
```

#### Relaxed SIMD (experimental)

These instructions are added to the builder. The engine may not support them yet.

```text
f32x4.relaxed_min              f32x4.relaxed_max
f64x2.relaxed_min              f64x2.relaxed_max
i32x4.relaxed_trunc_f32x4_s    i32x4.relaxed_trunc_f32x4_u
i32x4.relaxed_trunc_f64x2_s_zero   i32x4.relaxed_trunc_f64x2_u_zero
i16x8.relaxed_dot_i8x16_i7x16_s    i16x8.relaxed_dot_i8x16_u7x16_u
i16x8.relaxed_dot_add_i32_i16x8_s  i16x8.relaxed_dot_add_i32_i16x8_u
i32x4.relaxed_madd            i32x4.relaxed_nmadd
f32x4.relaxed_madd            f32x4.relaxed_nmadd
f64x2.relaxed_madd            f64x2.relaxed_nmadd
```

---

### Integer arithmetic

#### i32

```text
i32.add    i32.sub    i32.mul
i32.div_s  i32.div_u
i32.rem_s  i32.rem_u
i32.and    i32.or     i32.xor
i32.shl    i32.shr_s  i32.shr_u
i32.rotl   i32.rotr
i32.eqz    i32.clz    i32.ctz    i32.popcnt
```

#### i32 comparisons

```text
i32.eq     i32.ne
i32.lt_s   i32.lt_u
i32.gt_s   i32.gt_u
i32.le_s   i32.le_u
i32.ge_s   i32.ge_u
```

The same families exist for `i64`.

---

### Floating point

```text
f32.abs    f32.neg    f32.ceil
f32.floor  f32.trunc  f32.nearest
f32.sqrt   f32.min    f32.max
f32.copysign
```

Same for `f64`.

---

### Conversions

```text
f64.demote_f32       f32.convert_i32_s
i32.trunc_f64_s      i64.extend_i32_u
i32.wrap_i64         i64.trunc_f64_s
i32.reinterpret_f32  f64.reinterpret_i64
```

---

### Atomic instructions

Atomic instructions need shared memory.

#### Atomic loads

```text
i32.atomic.load      i64.atomic.load
i32.atomic.load8_u   i32.atomic.load16_u
i64.atomic.load8_u   i64.atomic.load16_u   i64.atomic.load32_u
```

#### Atomic stores

```text
i32.atomic.store     i64.atomic.store
i32.atomic.store8_u  i32.atomic.store16_u
i64.atomic.store8_u  i64.atomic.store16_u  i64.atomic.store32_u
```

#### Atomic read-modify-write

```text
i32.atomic.add      i32.atomic.sub
i32.atomic.and      i32.atomic.or       i32.atomic.xor
i32.atomic.xchg     i32.atomic.cmpxchg
```

Same for `i64`.

#### Other atomics

```text
memory.atomic.notify
memory.atomic.wait32
memory.atomic.wait64
memory.atomic.fence
```

#### Acquire-release atomics (experimental)

These use the same opcodes as regular atomics. The builder encodes them, but the engine may not support them yet.

```text
i32.atomic.load.acquire       i32.atomic.store.release
i64.atomic.load.acquire       i64.atomic.store.release
i32.atomic.load8_u.acquire    i32.atomic.store8_u.release
i32.atomic.load16_u.acquire   i32.atomic.store16_u.release
i64.atomic.load8_u.acquire    i64.atomic.store8_u.release
i64.atomic.load16_u.acquire   i64.atomic.store16_u.release
i64.atomic.load32_u.acquire   i64.atomic.store32_u.release
```

---

### Exception handling

#### Tags

```js
const tag = mb.AddTag({
  params: ['i32'],
  results: []
});
```

Or reuse an existing type:

```js
const tag = mb.AddTag(typeIndex);
```

#### Throw

```js
['throw', tagRef]
```

The tag's parameters are consumed from the stack.

#### Throw reference

```js
['throw_ref']
```

#### Try / catch / catch_all

```js
['try', <blocktype>]
  ...
['catch', tagRef]
  ...
['end']
```

```js
['try', <blocktype>]
  ...
['catch_all']
  ...
['end']
```

#### Catch ref / catch all ref

`catch_ref` pushes the tag payload plus an `exnref`:

```js
['try', <blocktype>]
  ...
['catch_ref', tagRef]
  ...
['end']
```

`catch_all_ref` pushes just the `exnref`:

```js
['try', <blocktype>]
  ...
['catch_all_ref']
  ...
['end']
```

#### Delegate

```js
['try', <blocktype>]
  ...
['delegate', <depth>]
```

#### Rethrow

```js
['rethrow', <depth>]
```

The depth counts enclosing try/catch frames.

#### Try table

```js
['try_table', <blocktype>, catches]
```

Each catch entry:

```text
[tagRef | 'all', depth, captureExnRef?]
```

Example with all catch types:

```js
['try_table',
  { params: [], results: ['i32'] },
  [
    [tagIndex, 0],         // catch
    ['all', 0],            // catch_all
    [tagIndex, 0, true]    // catch_ref
  ]
]
```

---

### Wide arithmetic (experimental)

These instructions give you wider integer operations. The builder encodes them, but SpiderMonkey may not support them yet.

```js
['i32.wide_mul_s']    // signed i32 x i32 -> i64
['i32.wide_mul_u']    // unsigned i32 x i32 -> i64
['i64.wide_mul_s']    // signed i64 x i64 -> i64:i64 (hi, lo)
['i64.wide_mul_u']    // unsigned i64 x i64 -> i64:i64 (hi, lo)
['i64.wide_add_s']    // signed i64 + i64 + carry -> carry:sum
['i64.wide_add_u']    // unsigned i64 + i64 + carry -> carry:sum
['i64.wide_sub_s']    // signed i64 - i64 - borrow -> borrow:diff
['i64.wide_sub_u']    // unsigned i64 - i64 - borrow -> borrow:diff
```

---

### Start section

Set a function to run when the module loads:

```js
mb.AddStart(funcRef);
```

The start function must take no arguments and return nothing.

---

### Custom sections

Add any named section to the binary:

```js
mb.AddCustomSection('my.section', [0x01, 0x02, 0x03]);
```

You can add multiple custom sections. They go at the end of the binary, after the name section.

---

### Name section (debug names)

Give functions, locals, globals, tables, memories, and tags readable names:

```js
mb.SetFunctionName('myfunc', 'TheRealName');
mb.SetLocalName('myfunc', 0, 'input');
mb.SetLocalName('myfunc', 1, 'temp');
mb.SetGlobalName(0, 'counter');
mb.SetTableName(0, 'myTable');
mb.SetMemoryName(0, 'mainMem');
mb.SetTagName(0, 'overflow');
mb.SetLabelName('myfunc', 0, 'outer_block');
```

These names go into a standard "name" custom section. Tools like `wasm-objdump` and browser DevTools can read them.

---

### Compilation hints (experimental)

Store a per-function compilation hint in a custom section:

```js
mb.SetCompilationHint('myFunc', 'tier-up');
```

---

### Relaxed dead code

The builder skips instructions that appear after the outermost `end`. The old behavior was to reject them. Now they are silently ignored.

```js
f.Body([
  ['i32.const', 42],
  ['end'],   // these are ignored, no error
  ['nop'],
  ['drop'],
]);
```

---

### Data segments

Active:

```js
mb.AddDataSegment({ offset: 0, data: [1, 2, 3, 4] });
mb.AddDataSegment({ offset: 0, data: new Uint8Array([1, 2, 3, 4]) });
```

Passive:

```js
mb.AddDataSegment({ passive: true, data: [9, 9] });
```

Shorthand:

```js
mb.AddDataSegment(0, [1, 2, 3, 4]);
```

---

### Element segments

Active:

```js
mb.AddElemSegment({
  table: 0,
  offset: 0,
  indices: [funcIndex]
});
```

Passive:

```js
mb.AddElemSegment({
  passive: true,
  indices: [0, 1]
});
```

Declared:

```js
mb.AddElemSegment({
  declared: true,
  indices: [0]
});
```

With expressions:

```js
mb.AddElemSegment({
  table: 0,
  offset: 0,
  exprs: [['ref.func', 0]],
  element: 'funcref'
});

mb.AddElemSegment({
  passive: true,
  exprs: [['ref.null', 'func']],
  element: 'funcref'
});
```

---

### Encoding and compiling

```js
const bytes = mb.Encode();     // Uint8Array
const hex = mb.Hex();          // lowercase hex string
const mod = mb.Compile();      // WebAssembly.Module
const inst = mb.Instantiate(); // WebAssembly.Instance
```

---

### Module summary

```js
const sum = mb.Summary();
```

Returns counts for: types, funcImports, funcDefs, tableImports, tableDefs, memImports, memDefs, globalImports, globalDefs, tagImports, tagDefs, elems, datas, exports.

---

### How validation works

The builder checks your module before the engine ever sees it. If anything is wrong, you get a `CompilationFailed` error with a clear message and the line of code that caused it.

The builder checks:

```text
duplicate names
out-of-range indexes
wrong argument counts
stack type mismatches
invalid memory alignment
invalid limits
bad block types
missing end markers
```

If the builder accepts your module but the engine rejects it, there is a bug in the builder or the engine.

---

### Full example

```js
load("WasmBuilder.js");

const mb = new WasmModuleBuilder();

// Add memory
mb.AddMemory({ initial: 1 });
mb.ExportMemory(0, "memory");

// Add a mutable global
mb.AddGlobal('i32', 10, true);

// Import a function
const logType = mb.AddType({
  params: ['i32'],
  results: []
});
mb.AddImport('env', 'log', {
  kind: 'function',
  type: logType
});

// Create a function
const f = mb.AddFunction("bump", {
  params: [],
  results: ['i32']
});

f.Body([
  ['global.get', 0],
  ['i32.const', 1],
  ['i32.add'],
  ['global.set', 0],
  ['i32.const', 0],
  ['global.get', 0],
  ['i32.store', 0],
  ['global.get', 0],
  ['end'],
]);

f.ExportAs("bump");

const instance = new WebAssembly.Instance(
  new WebAssembly.Module(mb.Encode()),
  {
    env: {
      log: function (x) {
        // host function
      }
    }
  }
);

print(instance.exports.bump()); // 11
```

---

### Error flow

```text
Testcase
└─ WasmBuilder.js
  └─ Builds module definition
  └─ mb.Encode()
    └─ CompilationChecker rejects bad modules before the engine
    └─ Encodes to WebAssembly bytes
      └─ WebAssembly.Module
        └─ SpiderMonkey validates
          └─ Compilation
            └─ Creates executable module
              └─ Instance
                └─ Runs your exports
```

---

### References

- https://webassembly.org/
- https://developer.mozilla.org/en-US/docs/WebAssembly
- https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface
- https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API
- https://firefox-source-docs.mozilla.org/js/
- https://wasi.dev/
- https://webassembly.github.io/spec/

---

***END OF DOCUMENTATION***
***Author: shujaqureshiii (0x42fc)***
