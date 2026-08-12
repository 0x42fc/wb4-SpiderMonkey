Usage of `WasmModuleBuilder`.



Load the builder before using any WebAssembly builder API:

```js
load("relative/path");
```

After loading it in JS atomsphere, these globals are available:

```js
WasmModuleBuilder
WasmFunctionBuilder
WasmBuilderError
```

We can check manually whether it is imported or *not*, simply you can use `typeof (WasmModuleBuilder);`, note that, use uppercase. 

```js
print(typeof WasmModuleBuilder, "before?");

try {
    load("test/mjsunit/wasm/WasmBuilder.js");
    print(typeof WasmModuleBuilder, "after!");
} catch (e) {
    print("load can't failed:", e);
}

/*

* cs@ExplNOit MINGW64 /d/path?
* $ ./js [case].js
* $ undefined before?
* $ function after

*/
```

Before module creation, we *must* load it, and provide "Builde"r **API** to **JS shell**.

Create a module builder:

```js
const mb = new WasmModuleBuilder(); // imported.
```

The builder stores the **types, functions, memories, tables, globals, segments,
 imports, exports**, and other module data until `encode()` *is* called.

 We are adding a function,
and added a function with a name and signature:

```js
const f = mb.addFunction("add", {
  params: ['i32', 'i32'],
  results: ['i32']
});
```
The function name can be omitted,
a supplied name must be *unique*.
a function name can later be used by:

```00/asm
call
ref.func
exportFunction
addStart
```

If the same function type is declared more than once, the **existing** *type* index
is "reused".

Function signatures:
A function signature contains `params` and `results`.

Two `i32` parameters and one `i32` result:

```js
{
  params: ['i32', 'i32'],
  results: ['i32']
}
```

Two `f64` parameters and one `f64` result:

```js
{
  params: ['f64', 'f64'],
  results: ['f64']
}
```

No parameters and no results:

```js
{
  params: [],
  results: []
}
```

One parameter and no result:

```js
{
  params: ['i32'],
  results: []
}
```

Function locals

Add one local:

```js
const index = f.addLocal('i32');
```

Add several locals:

```js
const first = f.addLocals('i32', 4);
```

Parameters use the first local indices.
Additional locals follow the parameters.

A local can have a name:

```js
f.addLocal('i32', 'value');
```

The name can then be *used* by local instructions.

Function bodies
Set the function body with `body()`:

```js
f.body([
  ['local.get', 0],
  ['local.get', 1],
  ['i32.add'],
  ['end'],
]);
```

The body is an array of instruction tuples.
Each instruction has this form:

```text
[name, ...arguments]
```

The body must end with:

```js
['end']
```

`body()` can only be called once.

The call returns the function builder, so calls can be chained.

Exporting a function,
export from the function builder:

```js
f.exportAs("add");
```

The exported function can then be called from **JavaScript** :

```js
instance.exports.add(2, 3);
```

Function start
Mark a function as the module start function:

```js
f.start();
```

The start function must have this type:

```text
[] -> []
```

The module can have one start function,
the module builder can also set the start function directly:

```js
mb.addStart(funcRef);
```

WebAssembly value types

Numeric types:

```text
i32
i64
f32
f64
```

SIMD:

```text
v128
```

Reference types:

```text
funcref
externref
anyref
eqref
i31ref
structref
arrayref
exnref
```

Typed GC references use:

```js
{
  ref: typeRef,
  nullable: true
}
```

or:

```js
{
  ref: typeRef,
  nullable: false
}
```

Packed field types

The builder accepts:

```text
i8
i16
```

for packed struct and array fields.

These fields are stored as packed `i8` or `i16` fields and are treated as `i32`,
values on the WebAssembly stack.

`i64` values:
Use BigInt for i64 constants.

```js
['i64.const', 4n]
```

For globals:

```js
mb.addGlobal('i64', 0n, true);
```

Numeric i64 literals are accepted and converted with `BigInt`; prefer
BigInt for values that do not fit exactly in a double.

Control flow instructions

Block:

```js
['block', <blocktype>]
...
['end']
```

Loop:

```js
['loop', <blocktype>]
...
['end']
```

If:

```js
['if', <blocktype>]
...
['else']
...
['end']
```

Try/catch:

```js
['try', <blocktype>]
...
['catch', <tagRef>]
...
['end']
```

Catch all:

```js
['try', <blocktype>]
...
['catch_all']
...
['end']
```

Delegate:

```js
['try', <blocktype>]
...
['delegate', <depth>]
```

Try table:

```js
['try_table', <blocktype>, <catches>]
```

Branches:

```js
['br', <depth>]
['br_if', <depth>]
['br_table', <depths>, <defaultDepth>]
```

Other control instructions:

```js
['return']
['unreachable']
['nop']
['select']
['select_t', [<types>]]
```

Block types

An empty block can use:

```js
['block']
```

or:

```js
['block', null]
```

A block with one result can use:

```js
['block', 'i32']
```

A multi value block uses an object:

```js
['block', {
  params: [],
  results: ['i32', 'f64']
}]
```

A previously declared function type index can also be used:

```js
['block', typeIndex]
```

Array block types are not supported.

Don't use:

```js
['block', ['i32', 'f64']]
```

Use:

```js
['block', {
  params: [],
  results: ['i32', 'f64']
}]
```

For an `if` block with parameters, push the block parameters before the
condition.

 Branch tables

A `br_table` instruction has this form:

```js
['br_table', depths, defaultDepth]
```

The branch label values are pushed before the selector.

The selector is an i32 value.

Select

Basic select:

```js
['select']
```

Typed select:

```js
['select_t', ['f64']]
```

For `select_t`, the first value is selected when the condition is non-zero.

Constants

i32:

```js
['i32.const', 42]
```

i64:

```js
['i64.const', 42n]
```

f32:

```js
['f32.const', 1.5]
```

f64:

```js
['f64.const', 3.25]
```

v128:

```js
['v128.const', <16-byte payload>]
```

Reference null:

```js
['ref.null', 'func']
```

 Local instructions

Local access can use an index or a registered local name.

```js
['local.get', 0]
['local.set', 0]
['local.tee', 0]
```

Global instructions

Global access can use an index; imported globals can also be referenced
by their import field name. Defined globals created with `addGlobal()`
cannot be named. The same applies to defined tables, memories, and tags
(only imports carry names).

```js
['global.get', 0]
['global.set', 0]
```

Direct calls

Call a function by index or name:

```js
['call', funcRef]
```

Indirect calls

Call through a table:

```js
['call_indirect', typeRef]
```

The default table is table zero.

An explicit table can be supplied:

```js
['call_indirect', typeRef, tableRef]
```

Tail calls

Return-call:

```js
['return_call', funcRef]
```

Return-call-ref:

```js
['return_call_ref', typeRef]
```

`return_call_ref` depends on support in the current build.

 call_ref

Call a reference:

```js
['call_ref', typeRef]
```

The callee is taken from the top of the stack.

 Memory creation

Create memory with an initial page count:

```js
const mi = mb.addMemory(1);
```

Create memory with a maximum:

```js
const mi = mb.addMemory(1, 2);
```

Use a descriptor:

```js
const mi = mb.addMemory({
  initial: 1,
  maximum: 2
});
```

 #### Shared memory

Create shared memory:

```js
const mi = mb.addMemory({
  initial: 1,
  shared: true
});
```

Shared memory is required for atomic instructions.

 #### Memory64

Create memory64:

```js
const mi = mb.addMemory({
  initial: 1,
  addressType: 'i64'
});
```

With `memory64`, memory addresses use `i64`.

Memory64 affects load, store, grow, and size addressing.

Bulk memory operations use `i64` addresses for destination, source, and length.

The value operand remains i32.

#### Memory indexes

The returned memory index follows the memory index space.

Imported memories come before defined memories.

#### Memory loads

Examples:

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
```

i64 narrow loads:

```js
['i64.load8_s', memarg]
['i64.load8_u', memarg]
['i64.load16_s', memarg]
['i64.load16_u', memarg]
['i64.load32_s', memarg]
['i64.load32_u', memarg]
```

#### Memory stores

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

#### Memory arguments

A load or store can use an offset:

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

Explicit memory index:

```js
['i32.load', 0, 4, memIndex]
```

or:

```js
['i32.load', [0, 4, memIndex]]
```

Alignment must be a power of two.

The *encoder* stores the alignment as log2(alignment).

#### Memory bulk operations

Memory size:

```js
['memory.size']
```

Memory grow:

```js
['memory.grow']
```

Copy:

```js
['memory.copy']
```

Fill:

```js
['memory.fill']
```

Initialize from a data segment:

```js
['memory.init', dataRef]
```

Drop a data segment:

```js
['data.drop', dataRef]
```

#### Tables

Create a funcref table:

```js
const ti = mb.addTable('funcref', 1, 2);
```

Descriptor form:

```js
const ti = mb.addTable({
  element: 'funcref',
  initial: 1,
  maximum: 2
});
```

Externref table:

```js
const ti = mb.addTable({
  element: 'externref',
  initial: 1
});
```

#### Table element types

The builder accepts:

```text
funcref
externref
```

and other reference types supported by the builder.

#### Table instructions

Read:

```js
['table.get', tableRef]
```

Write:

```js
['table.set', tableRef]
```

Size:

```js
['table.size', tableRef]
```

Grow:

```js
['table.grow', tableRef]
```

Fill:

```js
['table.fill', tableRef]
```

Copy:

```js
['table.copy']
```

Initialize:

```js
['table.init', elemRef, tableRef]
```

Drop:

```js
['elem.drop', elemRef]
```

#### Function imports

Import a function:

```js
const i = mb.addImport(
  'env',
  'log',
  {
    kind: 'function',
    type: {
      params: ['i32'],
      results: []
    }
  }
);
```
*Hmmm, Nice architecture?*   
so `func` is also accepted:

```js
const i = mb.addImport(
  'env',
  'log',
  {
    kind: 'func',
    type: {
      params: ['i32'],
      results: []
    }
  }
);
```

An alternate form is:

```js
const i = mb.addImport(
  'env',
  'log',
  'function',
  {
    params: ['i32'],
    results: []
  }
);
```

#### Table imports

```js
mb.addImport(
  'env',
  'tbl',
  {
    kind: 'table',
    element: 'funcref',
    initial: 1
  }
);
```

#### Memory imports

```js
mb.addImport(
  'env',
  'mem',
  {
    kind: 'memory',
    initial: 1,
    maximum: 2
  }
);
```

Shared memory:

```js
mb.addImport(
  'env',
  'mem',
  {
    kind: 'memory',
    initial: 1,
    shared: true
  }
);
```

#### Global imports

```js
mb.addImport(
  'env',
  'g',
  {
    kind: 'global',
    type: 'i32',
    mutable: false
  }
);
```

#### Tag imports

```js
mb.addImport(
  'env',
  'tag',
  {
    kind: 'tag',
    type: {
      params: ['i32'],
      results: []
    }
  }
);
```

#### Import indexes

Imports are placed before definitions in each index space.

This applies to:

```text
functions
tables
memories
globals
tags
```

For example, imported function index 0 is function index 0.

Defined functions follow the imported functions.

#### Function exports

Export from the function builder:

```js
f.exportAs("name");
```

Export by function name:

```js
mb.exportFunction("funcName", "exportName");
```

Export by builder:

```js
mb.exportFunction(f, "exportName");
```

Export by index:

```js
mb.exportFunction(3, "exportName");
```

#### Other exports

Table:

```js
mb.exportTable(0, "tbl");
```

Memory:

```js
mb.exportMemory(0, "mem");
```

Global:

```js
mb.exportGlobal(0, "g");
```

Tag:

```js
mb.exportTag(0, "tag");
```

#### Creating globals

Immutable i32:

```js
const gi = mb.addGlobal('i32', 0);
```

Mutable i32:

```js
const gi = mb.addGlobal('i32', 5, true);
```

Mutable i64:

```js
const gi = mb.addGlobal('i64', 0n, true);
```

funcref:

```js
const gi = mb.addGlobal('funcref', null);
```

f64:

```js
const gi = mb.addGlobal('f64', 1.5);
```

#### Global initializers

The builder accepts these initializer forms:

```text
number
bigint
null
string
{ref: funcRef}
[instructions]
```

Numbers are used for `i32`, `f32`, and `f64`.

`i64` uses BigInt.

`null` creates a null reference using the global type.

A string creates a *null* reference using the supplied heap type.

A function reference can be created with:

```js
{ref: funcRef}
```

An instruction list can be used for a constant initializer:

```js
[
  ['global.get', 0]
]
```

#### Struct types

Create a struct:

```js
const t = mb.addType({
  kind: 'struct',
  fields: ['i32', 'f64']
});
```

A field can include mutability:

```js
const t = mb.addType({
  kind: 'struct',
  fields: [
    {type: 'i32', mutable: true},
    {type: 'i8'}
  ]
});
```

A string field is immutable shorthand.

#### Array types

Create an immutable element array:

```js
const t = mb.addType({
  kind: 'array',
  element: 'i32'
});
```

Create a mutable element array:

```js
const t = mb.addType({
  kind: 'array',
  element: {
    type: 'i32',
    mutable: true
  }
});
```

#### GC subtyping

The base type must be declared before its subtype.

The base type must not be final.

Example:

```js
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
```

#### Struct instructions

Create a struct:

```js
['struct.new', typeRef]
```

Create a struct with default values:

```js
['struct.new_default', typeRef]
```

Read a field:

```js
['struct.get', typeRef, fieldIndex]
```

Signed packed read:

```js
['struct.get_s', typeRef, fieldIndex]
```

Unsigned packed read:

```js
['struct.get_u', typeRef, fieldIndex]
```

Write a field:

```js
['struct.set', typeRef, fieldIndex]
```

The field index is an immediate value.

It is not taken from the stack.

#### Struct stack order

For `struct.set`, push the reference first and the value second.

The stack order is:

```text
ref
value
```

#### Array instructions

Create an array:

```js
['array.new', typeRef]
```

Create an array with default values:

```js
['array.new_default', typeRef]
```

Create a fixed array:

```js
['array.new_fixed', typeRef, count]
```

Create from a data segment:

```js
['array.new_data', typeRef, dataRef]
```

Create from an element segment:

```js
['array.new_elem', typeRef, elemRef]
```

Read an array element:

```js
['array.get', typeRef]
```

Signed read:

```js
['array.get_s', typeRef]
```

Unsigned read:

```js
['array.get_u', typeRef]
```

Write an array element:

```js
['array.set', typeRef]
```

Get length:

```js
['array.len']
```

Fill:

```js
['array.fill', typeRef]
```

Copy:

```js
['array.copy', typeRef, typeRef]
```

Initialize from data:

```js
['array.init_data', typeRef, dataRef]
```

Initialize from elements:

```js
['array.init_elem', typeRef, elemRef]
```

#### Array stack order

For `array.get`, push:

```text
ref
index
```

The reference is pushed first.

For `array.set`, push:

```text
ref
index
value
```

The reference is pushed first.

#### i31 instructions

Create an i31 reference:

```js
['i31.new']
```

Signed extraction:

```js
['i31.get_s']
```

Unsigned extraction:

```js
['i31.get_u']
```

#### Reference conversion instructions

```js
['any.convert_extern']
['extern.convert_any']
```

#### Reference instructions

Null check:

```js
['ref.is_null']
```

Non null assertion:

```js
['ref.as_non_null']
```

Reference equality:

```js
['ref.eq']
```

Function reference:

```js
['ref.func', funcRef]
```

Type test:

```js
['ref.test', typeRef]
```

Type cast:

```js
['ref.cast', typeRef]
```

Nullable type test:

```js
['ref.test_null', typeRef]
```

Nullable type cast:

```js
['ref.cast_null', typeRef]
```

Branch on null:

```js
['br_on_null', depth]
```

Branch on non-null:

```js
['br_on_non_null', depth]
```

Branch on cast:

The first argument is a flags byte (0..3) selecting the nullability of
the source and destination types:

```js
['br_on_cast', flags, depth, srcTypeRef, dstTypeRef]
```

`br_on_cast_fail` uses the same form.

#### SIMD constants

A v128 constant can be given as **16** *byte* values:

```js
['v128.const', [
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0
]]
```

It can also use a 32 character hexadecimal string:

```js
[
  'v128.const',
  '00000000000000000000000000000000'
]
```

A BigInt can also represent the 128 bit value.

Lane form:

```js
[
  'v128.const',
  ['i32x4', [1, 2, 3, 4]]
]
```

Supported lane shapes:

```text
i8x16
i16x8
i32x4
i64x2
f32x4
f64x2
```

#### SIMD splat instructions

Supported splat forms include:

```text
i8x16.splat
i16x8.splat
i32x4.splat
i64x2.splat
f32x4.splat
f64x2.splat
```

#### SIMD lane extraction

Examples:

```js
['i8x16.extract_lane_s', lane]
['i8x16.extract_lane_u', lane]

['i16x8.extract_lane_s', lane]
['i16x8.extract_lane_u', lane]

['i32x4.extract_lane', lane]
['i64x2.extract_lane', lane]

['f32x4.extract_lane', lane]
['f64x2.extract_lane', lane]
```

#### SIMD lane replacement

Lane replacement is available for the supported SIMD shapes:

```text
i8x16.replace_lane
i16x8.replace_lane
i32x4.replace_lane
i64x2.replace_lane
f32x4.replace_lane
f64x2.replace_lane
```

#### SIMD shuffle

Shuffle uses 16 immediate lane values:

```js
['i8x16.shuffle', <16 lane bytes>]
```

#### SIMD bitselect

```js
['v128.bitselect']
```

The stack order is:

```text
a
b
mask
```

The mask is the top operand.

#### SIMD memory operations

Load:

```js
['v128.load', memarg]
```

Store:

```js
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

Splat loads include:

```text
v128.load8_splat
v128.load16_splat
v128.load32_splat
v128.load64_splat
```

Extension loads include:

```text
v128.load8x8_s
...
```

#### SIMD lane bounds

Lane indices are immediate arguments.

Example:

```js
['v128.load8_lane', memarg, 3]
```

The lane is not a stack value.

The valid lane ranges are:

```text
i8x16   0..15
i16x8   0..7
i32x4   0..3
i64x2   0..1
f32x4   0..3
f64x2   0..1
```

#### SIMD arithmetic

Standard **SIMD** instruction names are supported, including:

```text
i8x16.add
i8x16.sub
i16x8.mul
f32x4.add
i32x4.dot_i16x8_s
```

The complete supported set depends on the instruction names implemented by
the builder and the WebAssembly features enabled by the build.

#### Integer arithmetic

Common `i32` operations include:

```text
i32.add
i32.sub
i32.mul

i32.div_s
i32.div_u

i32.rem_s
i32.rem_u

i32.and
i32.or
i32.xor

i32.shl
i32.shr_s
i32.shr_u

i32.rotl
i32.rotr

i32.eqz
i32.clz
i32.ctz
i32.popcnt
```

#### Integer comparisons

i32 comparisons include:

```text
i32.eq
i32.ne
i32.lt_s
i32.lt_u
i32.gt_s
i32.gt_u
i32.le_s
i32.le_u
i32.ge_s
i32.ge_u
```

Equivalent instruction families exist for supported i64 operations.

#### Floating point operations

Examples:

```text
f32.abs
f32.neg
f32.ceil
f32.floor
f32.trunc
f32.nearest
f32.sqrt
f32.min
f32.max
f32.copysign
```

#### Numeric conversions

Examples:

```text
f64.demote_f32
f32.convert_i32_s
i32.trunc_f64_s
i64.extend_i32_u
i32.wrap_i64
```

#### Numeric reinterpretation

Examples:

```text
i64.reinterpret_f64
f64.reinterpret_i64
```

#### Atomic instructions

Atomic instructions require shared memory.

Atomic loads include:

```text
i32.atomic.load
i64.atomic.load
i32.atomic.load8_u
...
```

Atomic stores include:

```text
i32.atomic.store
i64.atomic.store
...
```

Atomic read-modify-write operations include:

```text
i32.atomic.add
i32.atomic.sub
i32.atomic.and
i32.atomic.or
i32.atomic.xor
i32.atomic.xchg
i32.atomic.cmpxchg
```

Other atomic instructions include:

```text
memory.atomic.notify
memory.atomic.wait32
memory.atomic.wait64
atomic.fence
```

#### Atomic instruction names

The builder uses names such as:

```text
i32.atomic.add
i32.atomic.cmpxchg
```

It does not use an `.rmw.` part in these names.

#### Atomic memory ordering

This builder does not encode *memory* order arguments.

Atomic operations are emitted as sequentially consistent.

The encoder also checks natural alignment for atomic operations.

#### Exception tags

Create a tag from a signature:

```js
const tag = mb.addTag({
  params: ['i32'],
  results: []
});
```

An existing type index can also be reused:

```js
const tag = mb.addTag(t);
```

#### Throw

Throw a tag:

```js
['throw', tagRef]
```

The tag payload parameters are consumed from the stack.

#### Throw reference

Throw an exception reference:

```js
['throw_ref']
```

#### Try and catch

Basic form:

```js
[
  ['try', <blocktype>],
  ...
  ['catch', tagRef],
  ...
  ['end']
]
```

Catch all:

```js
[
  ['try', <blocktype>],
  ...
  ['catch_all'],
  ...
  ['end']
]
```

#### Delegate

Delegate from a try block:

```js
[
  ['try', <blocktype>],
  ...
  ['delegate', <depth>]
]
```

#### Rethrow

```js
['rethrow', <depth>]
```

The depth counts enclosing try/catch frames.

#### Try table

A try table is one instruction:

```js
[
  'try_table',
  <blocktype>,
  catches
]
```

Each catch entry has this form:

```text
[tagRef | 'all', depth, captureExnRef?]
```

Example:

```js
[
  'try_table',
  {
    params: [],
    results: ['i32']
  },
  [
    [tagIndex, 0],
    ['all', 0],
    [tagIndex, 0, true]
  ]
]
```

#### Try table catch depth

Catch depth is relative to frames outside the try table.

Depth zero refers to the frame immediately outside the try table.

The catch payload must match the target label types.

#### Try and delegate restrictions

The builder verifies that `delegate` appears inside a try block, and
`catch` pushes the tag payload values onto the stack.

An outer try with results is not rejected by the builder; that validation
is left to the WebAssembly engine.

#### Data segments

Create an active data segment:

```js
mb.addDataSegment({
  offset: 0,
  data: [1, 2, 3, 4]
});
```

A `Uint8Array` can also be used:

```js
mb.addDataSegment({
  offset: 0,
  data: new Uint8Array([1, 2, 3, 4])
});
```

#### Passive data segments

Create a passive segment:

```js
mb.addDataSegment({
  passive: true,
  data: [9, 9]
});
```

#### Data segment shorthand

The shorthand form is:

```js
mb.addDataSegment(0, [1, 2, 3, 4]);
```

#### Element segments

Active element segment:

```js
mb.addElemSegment({
  table: 0,
  offset: 0,
  indices: [funcIndex]
});
```

Passive element segment:

```js
mb.addElemSegment({
  passive: true,
  indices: [0, 1]
});
```

Declared element segment:

```js
mb.addElemSegment({
  declared: true,
  indices: [0]
});
```

#### Expression element segments

Active expression segment:

```js
mb.addElemSegment({
  table: 0,
  offset: 0,
  exprs: [['ref.func', 0]],
  element: 'funcref'
});
```

Passive expression segment:

```js
mb.addElemSegment({
  passive: true,
  exprs: [['ref.null', 'func']],
  element: 'funcref'
});
```

#### Start function

Set the start function:

```js
mb.addStart(funcRef);
```

The reference can be an index or name.

The function must satisfy the required start function type.

#### Encoding

Encode the module:

```js
const bytes = mb.encode(); 
```

The result is a Uint8Array containing the WebAssembly module bytes.

Compile and instantiate with the host engine:

```js
const module = mb.compile();
const instance = mb.instantiate({ imports });
```

`compile()` runs the engine's authoritative validation and `instantiate()`
performs compilation plus instantiation (with an import object). Engine
rejection throws `WasmEngineError`; the bytes are never silently altered.

#### Hex output

Get the module bytes as a lowercase hexadecimal string:

```js
const hex = mb.hex();
```

#### Module summary

Get a summary:

```js
const sum = mb.summary();
```

The summary contains counts for:

```text
types
funcImports
funcDefs
tableImports
tableDefs
memImports
memDefs
globalImports
globalDefs
tagImports
tagDefs
elems
datas
exports
```

#### Compiling a module

Compile encoded bytes with the WebAssembly JavaScript API:

```js
const module = new WebAssembly.Module(mb.encode());
```

#### Instantiating a module

Create an instance:

```js
const instance = new WebAssembly.Instance(
  module,
  imports
);
```

For a module without imports:

```js
const instance = new WebAssembly.Instance(
  new WebAssembly.Module(mb.encode()),
  {}
);
```

#### Calling an export

Call an exported function:

```js
const result = instance.exports.someFunc(...);
```

#### Builder errors

Invalid builder input throws `WasmBuilderError`.

Examples include:

```text
duplicate names
out-of-range indexes
invalid memory alignment
stack type mismatch
other invalid builder input
```

Errors carry structured fields:

```text
code     machine readable category, e.g. 'stack-check', 'encode',
         'engine-compile', 'engine-instantiate', 'internal'
cause    the underlying error when this error wraps another one
         (the engine's CompileError/LinkError, or a raw JS exception)
context  extra diagnostic data (module summary, byte count, hex preview)
```

The printed error name is a semantic category: `CompilationError`,
`CompileError`, `InstantiateError`, or `InternalError` (an `internal`
failure prints `*** WasmBuilder: an error occurred!` and the stack).
The class (`WasmBuilderError` / `WasmEngineError`) and the `code` field
remain available for programmatic checks.

Function body failures also carry:

```text
definitionFrame  where body() was called (file, line, col)
instruction      the failing instruction
instructionIndex its 0-based position in the body
instructionOccurrence how many identical instructions precede it
```

The printed report shows the category and message (including the
instruction position, e.g. `(instruction 2 of 4)`), then the source
line that declares the failing instruction with a caret under it.

Engine rejection during `compile()`/`instantiate()` throws `WasmEngineError`
(a `WasmBuilderError` subclass) chaining the engine's message as `cause`.
There is no fallback that retries or alters the encoded bytes.

#### Builder validation

The builder performs its own validation when encoding.

This includes a stack "type checker".

A module that passes builder validation can still be rejected by the WebAssembly
engine.

This makes 'builder' *versus* 'engine' testing useful when checking for differences
between the builder and the engine.

#### Builder and engine are separate

So this *graph* simulate the test path:
```text 
Testcase:
└─ ModuleBuilder.js
  └─ Builds WebAssembly Module Definition
  └─ mb.encode()
    └─ Encodes Module Definition Into WebAssembly bytecode 
      └─ WebAssembly.Module
        └─ SpiderMonkey Validates WebAssembly bytecode 
          └─Validation
            └─ JS Engine bytecode Level Validation
              └─ Compilation
               └─ Creates Executable Module Instance
                 └─ Instantiation
                   └─ Invokes Exported Functions / Runs WebAssembly
                     └─ Execution
                                      
```



#### Complete module example

Load the builder:

```js
load("relative/path");
```

Create the module:

```js
const mb = new WasmModuleBuilder();
```

Add memory:

```js
mb.addMemory({initial: 1});
mb.exportMemory(0, "memory");
```

Add a mutable global:

```js
mb.addGlobal('i32', 10, true);
```

Create an imported function type:

```js
const logType = mb.addType({
  params: ['i32'],
  results: []
});
```

Add the import:

```js
mb.addImport(
  'env',
  'log',
  {
    kind: 'function',
    type: logType
  }
);
```

Create the function:

```js
const f = mb.addFunction("bump", {
  params: [],
  results: ['i32']
});
```

Set its body:

```js
f.body([
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
```

Export it:

```js
f.exportAs("bump");
```

Create the instance:

```js
const instance = new WebAssembly.Instance(
  new WebAssembly.Module(mb.encode()),
  {
    env: {
      log: function (x) {
        /* host import */
      }
    }
  }
);
```

Call it:

```js
print(instance.exports.bump());
```

The function returns:

```text
11
```

#### Exported memory inspection

The exported memory can be inspected from JavaScript:

```js
const view = new DataView(
  instance.exports.memory.buffer
);

print(view.getUint32(0, true));
```

The example stores the global value at memory address zero.

#### CommonJS loading

The builder can also be loaded through `module.exports` when the environment
provides CommonJS support.

The SpiderMonkey shell examples use:

```js
load("relative/path");
```

#### Memory64 host values

Use BigInt when working with i64 values.

Examples:

```js
0n
123456789n
```

Memory64 is selected with:

```js
addressType: 'i64'
```

The supplied test notes state that memory64 modules can address up to 4 GiB
in this build.

#### Unsupported memory.discard

The supplied SpiderMonkey build rejects `memory.discard`.

we would *not* use it in tests that must be accepted by this build.
The builder contains a code path for it, but the engine *rejects* the module.


# Refereces:
#### External WebAssembly reference

Used the official WebAssembly documentation for the core WebAssembly language
and its specifications.

```text
[https://webassembly.org/]
```

#### WebAssembly JavaScript API reference

The JavaScript API used by the examples is documented by MDN.

```text
 [https://developer.mozilla.org/en-US/docs/WebAssembly]
```

The WebAssembly JavaScript API reference covers modules, instances, memory,
tables, globals, validation, compilation, and instantiation.

```text
 [https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface]
```

#### WebAssembly JavaScript API usage

For examples of compiling and instantiating WebAssembly from JavaScript:

```text
[https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API]
```

#### SpiderMonkey documentation

For SpiderMonkey engine documentation:

```text
 [https://firefox-source-docs.mozilla.org/js/]
```

#### SpiderMonkey source documentation

Firefox Source Docs provide documentation for the SpiderMonkey engine and its
JavaScript and WebAssembly implementation.

```text
[https://firefox-source-docs.mozilla.org/js/]
```

#### Firefox WebAssembly documentation

Firefox Source Docs also provide documentation for WebAssembly-related engine
components.

```text
 [https://firefox-source-docs.mozilla.org/]
```

#### WASI documentation

WASI is separate from the core WebAssembly instruction set.

For official WASI documentation:

```text
[https://wasi.dev/]
```


#### WebAssembly specification reference

For the core WebAssembly specification:

```text
https://webassembly.github.io/spec/
```

Use the specification when checking instruction behavior, types, validation
rules, module sections, and binary encoding.

#### Builder source

The authoritative source for this document is the `ModuleBuilder.js` file in
the SpiderMonkey tree.

When behavior in this guide differs from another WebAssembly implementation,
the builder source should be checked first for builder-specific behavior.

#### Flow

A complete SpiderMonkey WebAssembly test can follow this simple pattern:

```js
load("ModuleBuilder.js");

const mb = new WasmModuleBuilder();

const f = mb.addFunction("test", {
  params: [],
  results: ['i32']
});

f.body([
  ['i32.const', 42],
  ['end']
]);

f.exportAs("test");

const bytes = mb.encode();
const module = new WebAssembly.Module(bytes);
const instance = new WebAssembly.Instance(module, {});

assertEq(instance.exports.test(), 42);
```



*[END OF THE DOCUMENTATION]*  
*[ Author: **ExploiNot@** from !csLAB| **ShujaQureshi** ]*