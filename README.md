## Usage of WasmModuleBuilder.

This 'README' demonstrates how a builder API can construct a valid Wasm module by simply importing WasmBuilder.js. It provides a straightforward way to define the structure of a WebAssembly module without manually constructing its binary representation.


First of all, load the builder before using any WebAssembly builder API:
```js
load("wbunit/wasm/WasmBuilder.js");
```
Once the builder has been loaded, the WasmModuleBuilder API can be used to construct the module and define its required components.

We can manually check whether it is imported or not. Simply use typeof WasmModuleBuilder. Note that you should use uppercase.
```js
print(typeof WasmModuleBuilder, "before?");

try {
  load("wbunit/wasm/WasmBuilder.js");
  print(typeof WasmModuleBuilder, "after!");
} catch (e) {
  print("load failed:", e);
}

/*

* cs@ExplNOit MINGW64 
* $ ./js test.js
* $ undefined before?
* $ function after!

*/
```

#### Error reporting

The builder validates every module before the engine sees it. When a module is
rejected, the builder prints a `CompilationFailed` report itself and stops
(in the shell it exits cleanly; in the browser it returns `undefined`)
instead of producing a module:

```text
CompilationFailed: function "pwn":
TypeError: bad instruction: expected '[op, args]' or an op name string, got 'undefined'

@Stack:
test.js:23:5
```

The report shows the compilation failure and the test file line that triggered
it, with paths relative to the current directory. The builder's own frames are
not shown, so no uncaught exception ever escapes to the host. After the report
the script stops (the shell exits cleanly), so nothing misleading runs after a
failed build. In the browser, where there is no `quit()`, the build simply
returns `undefined`.

User errors raised by any builder call — `AddFunction`, `Body`, `ExportAs`,
imports, exports, and so on — are collected and reported together at
`Encode()` / `Compile()` time, so even a mid-build failure never dies raw.

`CompilationFailed` is the error class. Unexpected builder errors are never
wrapped: the original exception and its real stack propagate unchanged, so no
error is manufactured around an existing one.


Before module creation, we must load it and provide the "Builder" API to the JS shell.

Create a module builder:
```js
const mb = new WasmModuleBuilder(); // imported.
```

The builder stores the **types, functions, memories, tables, globals, segments,
 imports, exports**, and other module data until `Encode()` is called.

 We are adding a function,
and added a function with a name and signature:

```js
const f = mb.AddFunction("add", {
  params: ['i32', 'i32'],
  results: ['i32']
});
```
The function name can be omitted,
a supplied name must be *unique*.
a function name can later be used by:

```text
call
ref.func
ExportFunction
```

If the same function type is declared more than once, the **existing** *type* index
is "reused".

##### Function signatures:  
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

##### Function locals

Add one local:

```js
const index = f.AddLocal('i32');
```

Add a named local:

```js
f.AddLocal('i32', 'value');
```

Parameters use the first local indices.
Additional locals follow the parameters.

A local can have a name:

```js
f.AddLocal('i32', 'value');
```

The name can then be *used* by local instructions.

##### Function bodies
Set the function body with `Body()`:

```js
f.Body([
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

`Body()` can only be called once.

The call returns the function builder, so calls can be chained.

Exporting a function,
export from the function builder:

```js
f.ExportAs("add");
```

The exported function can then be called from **JavaScript** :

```js
instance.exports.add(2, 3);
```

##### WebAssembly value types

- Numeric types:

```text
i32
i64
f32
f64
```

- SIMD:

```text
v128
```

- Reference types:

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

- Typed GC references use:

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

- Packed field types

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
mb.AddGlobal('i64', 0n, true);
```

Numeric i64 literals are accepted and converted with `BigInt`; prefer
BigInt for values that do not fit exactly in a double.

##### Control flow instructions

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

##### Block types

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

##### Branch tables

A `br_table` instruction has this form:

```js
['br_table', depths, defaultDepth]
```

The branch label values are pushed before the selector.

The selector is an i32 value.

##### Select

Basic select:

```js
['select']
```

Typed select:

```js
['select_t', ['f64']]
```

For `select_t`, the first value is selected when the condition is non-zero.

##### Constants

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

 ##### Local instructions

Local access can use an index or a registered local name.

```js
['local.get', 0]
['local.set', 0]
['local.tee', 0]
```

##### Global instructions

Global access can use an index imported globals can also be referenced
by their import field name. Defined globals created with `AddGlobal()`
cannot be named. The same applies to defined tables, memories, and tags
(only imports carry names).

```js
['global.get', 0]
['global.set', 0]
```

##### Direct calls

Call a function by index or name:

```js
['call', funcRef]
```

##### Indirect calls

Call through a table:

```js
['call_indirect', typeRef]
```

The default table is table zero.

An explicit table can be supplied:

```js
['call_indirect', typeRef, tableRef]
```

##### Tail calls

Return call:

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
const mi = mb.AddMemory(1);
```

Create memory with a maximum:

```js
const mi = mb.AddMemory(1, 2);
```

Use a descriptor:

```js
const mi = mb.AddMemory({
  initial: 1,
  maximum: 2
});
```

 #### Shared memory

Create shared memory:

```js
const mi = mb.AddMemory({
  initial: 1,
  shared: true
});
```

Shared memory is required for atomic instructions.

 #### Memory64

Create memory64:

```js
const mi = mb.AddMemory({
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
const ti = mb.AddTable('funcref', 1, 2);
```

Descriptor form:

```js
const ti = mb.AddTable({
  element: 'funcref',
  initial: 1,
  maximum: 2
});
```

Externref table:

```js
const ti = mb.AddTable({
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
const i = mb.AddImport(
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
const i = mb.AddImport(
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
const i = mb.AddImport(
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
mb.AddImport(
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
mb.AddImport(
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
mb.AddImport(
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
mb.AddImport(
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
mb.AddImport(
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
f.ExportAs("name");
```

Export by function name:

```js
mb.ExportFunction("funcName", "exportName");
```

Export by builder:

```js
mb.ExportFunction(f, "exportName");
```

Export by index:

```js
mb.ExportFunction(3, "exportName");
```

#### Other exports

Table:

```js
mb.ExportTable(0, "tbl");
```

Memory:

```js
mb.ExportMemory(0, "mem");
```

Global:

```js
mb.ExportGlobal(0, "g");
```

Tag:

```js
mb.ExportTag(0, "tag");
```

#### Creating globals

Immutable i32:

```js
const gi = mb.AddGlobal('i32', 0);
```

Mutable i32:

```js
const gi = mb.AddGlobal('i32', 5, true);
```

Mutable i64:

```js
const gi = mb.AddGlobal('i64', 0n, true);
```

funcref:

```js
const gi = mb.AddGlobal('funcref', null);
```

f64:

```js
const gi = mb.AddGlobal('f64', 1.5);
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
const t = mb.AddType({
  kind: 'struct',
  fields: ['i32', 'f64']
});
```

A field can include mutability:

```js
const t = mb.AddType({
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
const t = mb.AddType({
  kind: 'array',
  element: 'i32'
});
```

Create a mutable element array:

```js
const t = mb.AddType({
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
const tag = mb.AddTag({
  params: ['i32'],
  results: []
});
```

An existing type index can also be reused:

```js
const tag = mb.AddTag(t);
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
mb.AddDataSegment({
  offset: 0,
  data: [1, 2, 3, 4]
});
```

A `Uint8Array` can also be used:

```js
mb.AddDataSegment({
  offset: 0,
  data: new Uint8Array([1, 2, 3, 4])
});
```

#### Passive data segments

Create a passive segment:

```js
mb.AddDataSegment({
  passive: true,
  data: [9, 9]
});
```

#### Data segment shorthand

The shorthand form is:

```js
mb.AddDataSegment(0, [1, 2, 3, 4]);
```

#### Element segments

Active element segment:

```js
mb.AddElemSegment({
  table: 0,
  offset: 0,
  indices: [funcIndex]
});
```

Passive element segment:

```js
mb.AddElemSegment({
  passive: true,
  indices: [0, 1]
});
```

Declared element segment:

```js
mb.AddElemSegment({
  declared: true,
  indices: [0]
});
```

#### Expression element segments

Active expression segment:

```js
mb.AddElemSegment({
  table: 0,
  offset: 0,
  exprs: [['ref.func', 0]],
  element: 'funcref'
});
```

Passive expression segment:

```js
mb.AddElemSegment({
  passive: true,
  exprs: [['ref.null', 'func']],
  element: 'funcref'
});
```

#### Encoding

Encode the module:

```js
const bytes = mb.Encode(); 
```

The result is a Uint8Array containing the WebAssembly module bytes.

Compile and instantiate with the host engine:

```js
const module = mb.Compile();
const instance = mb.Instantiate({ imports });
```


#### Hex output

Get the module bytes as a lowercase hexadecimal string:

```js
const hex = mb.Hex();
```

#### Module summary

Get a summary:

```js
const sum = mb.Summary();
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

There is *an* example:
```js
load("wbunit/wasm/WasmBuilder.js");

const mb = new WasmModuleBuilder();

/*
 * Function type:
 * () -> i32
 */
const type = mb.AddType({
    params: [],
    results: ['i32']
});

/*
 * Function that returns 0x1337.
 */
const target = mb.AddFunction("target", type);

target.Body([
    ['i32.const', 0x4444444]
]);

/*
 * funcref table:
 *
 * index 0
 * index 1
 */
const table = mb.AddTable('funcref', 2, 2);

/*
 * Put target into table[0].
 */
mb.AddElemSegment({
    table: table,
    offset: 0,
    indices: [target]
});

/*
 * Test function:
 */
const run = mb.AddFunction("run", {
    params: [],
    results: ['i32']
});

run.Body([

    /*
     * table.set(table, index, ref)
     *
     * table[1] = target
     */
    ['i32.const', 1],
    ['ref.func', target],
    ['table.set', table],

    /*
     * table.get(table, index)
     *
     * Retrieve table[1].
     *
     * The returned `funcref` is dropped because the
     * next operation will independently use the table.
     */
    ['i32.const', 1],
    ['table.get', table],
    ['drop'],

    /*
     * table.fill(table, start, value, length)
     *
     * Fill:
     *
     * table[0] = target
     * table[1] = target
     */
    ['i32.const', 0],
    ['ref.func', target],
    ['i32.const', 2],
    ['table.fill', table],

    /*
     * call_indirect(type, table)
     *
     * index = 1
     *
     * table[1] now contains target.
     */
    ['i32.const', 1],
    ['call_indirect', type, table]
]);

run.ExportAs("run");


print("Summary();");
print(JSON.stringify(mb.Summary()));

print("Hex();");
const hex = mb.Hex();
print(hex);

const wasmModule = new WebAssembly.Module(mb.Encode());
const instance = new WebAssembly.Instance(wasmModule, {});

print("Expected!");
print(instance.exports.run());

/*
Summary();
{"types":1,
"funcImports":0,
"funcDefs":2,
"tableImports":0,
"tableDefs":1,
"memImports":0,
"memDefs":0,
"globalImports":0,
"globalDefs":0,
"tagImports":0,
"tagDefs":0,
"elems":1,
"datas":0,
"exports":1}

Hex();
0061736d010000000105016000017f0303020000040501700102020707010372756e00010907010041000b01000a2502070041c48891220b1b004101d2002600410125001a4100d2004102fc110041011100000b
Expected!
71582788
*/
```

#### Compiling a module

Compile encoded bytes with the WebAssembly JavaScript API:

```js
const module = new WebAssembly.Module(mb.Encode());
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
  new WebAssembly.Module(mb.Encode()),
  {}
);
```

#### Calling an export

Call an exported function:

```js
const result = instance.exports.someFunc(...);
```

#### Builder errors

Validation has one face: **CompilationFailed**.

Invalid builder input is rejected by the CompilationChecker before the module
ever reaches the engine, and it reports like this:

```text
CompilationFailed: function "bad":
TypeError: expected type i32, got f64.

@Stack:
test.js:23:5
```

Examples the checker rejects:

```text
duplicate names
out-of-range indexes
invalid memory alignment
stack type mismatch
wrong argument counts
invalid limits
other invalid builder input
```

Instruction argument counts are validated universally before encoding, every
op's immediate *arity* is checked up front by the checker (mirroring the
encoder), so malformed instructions like `['local.get']` are rejected with a
precise message and attribution, never silently encoded or left to crash.
This covers the opcodeonly families too (numeric, comparison and
conversion ops take zero immediates, so `['i32.add', 1]` is rejected rather
than silently encoded), as well as `table.size`/`grow`/`fill`.

There is no second validation category. `InternalError` exists only as a
bug detector, when the builder itself fails to validate something it should
have caught, the original error propagates unchanged with its real stack.

#### Builder and engine are separate

Engine errors are never wrapped. `Compile()` and `Instantiate()` call the
engine directly, so if the engine rejects a module its own error surfaces
raw, with its own message and stack. If a module passes the stack checker
and the engine still rejects it, that means there is a bug in the builder
or *maybe* in the engine.

So this *graph* simulates the test path:
```text 
Testcase:
└─ ModuleBuilder.js
  └─ Builds WebAssembly Module Definition
  └─ mb.Encode()
    └─ CompilationChecker rejects bad modules before the engine
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
load("..WasmBuilder.js..");
```

Create the module:

```js
const mb = new WasmModuleBuilder();
```

Add memory:

```js
mb.AddMemory({initial: 1});
mb.ExportMemory(0, "memory");
```

Add a mutable global:

```js
mb.AddGlobal('i32', 10, true);
```

Create an imported function type:

```js
const logType = mb.AddType({
  params: ['i32'],
  results: []
});
```

Add the import:

```js
mb.AddImport(
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
const f = mb.AddFunction("bump", {
  params: [],
  results: ['i32']
});
```

Set its body:

```js
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
```

Export it:

```js
f.ExportAs("bump");
```

Create the instance:

```js
const instance = new WebAssembly.Instance(
  new WebAssembly.Module(mb.Encode()),
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


# References:

Use the provided specification when checking instruction behavior, types, validation
rules, module sections, and binary encoding.

#### External WebAssembly reference

- https://webassembly.org/
- https://developer.mozilla.org/en-US/docs/WebAssembly
- https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface
- https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API
- https://firefox-source-docs.mozilla.org/js/
- https://wasi.dev/
- https://webassembly.github.io/spec/



*** *[END OF THE DOCUMENTATION]* ***    
*** *[ Author: **shujaqureshiii ( 0x42fc) ** ]* ***     
*** [ If you find any type of bug, please report! ]* ***      
