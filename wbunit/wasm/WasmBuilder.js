'use strict';

(function (global) {


  // "(instruction 2 of 4)" for 0-based index 1, or "" when unknown.
  function instructionPos_(index, total) {
    if (index === undefined || index < 0) return '';
    const n = Number(total);
    return ' (instruction ' + (Number(index) + 1) + ' of ' +
      (Number.isInteger(n) && n > 0 ? n : '?') + ')';
  }

  // Re throw a builder error, keeping the message and attaching the
  // declaration site frame (globals, element and data segments).
  function attributeFrame_(e, frame) {
    if (e instanceof WasmBuilderError) {
      return new WasmBuilderError(e.message, {
        code: e.code || 'encode',
        cause: e,
        context: e.context,
        definitionFrame: frame || e.definitionFrame,
      });
    }
    return e;
  }

  const CATEGORY = {
    'stack-check':
     'CompilationError',
     'encode': 
     'CompilationError',
     'engine-unavailable':
     'CompilationError',
     'engine-compile':
     'CompileError',
     'engine-instantiate': 
     'InstantiateError',
     'internal': 
     'InternalError',
  };

  // Verbose reports keep the full WasmBuilder.js stack.
  let verboseErrors = false;

  function setWasmVerbose(v) {
    verboseErrors = !!v;
  }

  class WasmBuilderError extends Error {
    constructor(msg, options) {
      super(msg);
      this.name = CATEGORY[options && options.code] || 'CompilationError';
      if (options) {
        if (options.code !== undefined) this.code = options.code;
        if (options.cause !== undefined) this.cause = options.cause;
        if (options.context !== undefined) this.context = options.context;
        if (options.definitionFrame !== undefined) this.definitionFrame = options.definitionFrame;
        if (options.instruction !== undefined) this.instruction = options.instruction;
        if (options.instructionIndex !== undefined) this.instructionIndex = options.instructionIndex;
        if (options.instructionOccurrence !== undefined) this.instructionOccurrence = options.instructionOccurrence;
      }
      // Full trace at creation time the default report filters it.
      this.internalStack = this.stack;
    }
  }

  // The engine rejected the module (compile or instantiate).
  // The engine error is kept in `cause`.
  class WasmEngineError extends WasmBuilderError {
    constructor(msg, options) {
      super(msg, options);
      this.name = CATEGORY[options && options.code] || 'CompileError';
    }
  }

  function assert(cond, msg) {
    if (!cond) {
      throw new WasmBuilderError(msg);
    }
  }

  // Best effort, return the text of one source line for the stack report.
  function sourceLine_(file, lineNo) {
    if (typeof read !== 'function' || !file || file === '-e') return null;
    try {
      const lines = String(read(file)).split('\n');
      const i = Number(lineNo) - 1;
      return (i >= 0 && i < lines.length) ? lines[i] : null;
    } catch (ex) {
      return null;
    }
  }

  // Innermost frame of a captured stack that is not inside this file.
  function firstTestFrame_(stack) {
    for (const line of String(stack).split('\n')) {
      const loc = line.trim();
      if (loc.length === 0 || loc.indexOf('WasmBuilder.js') >= 0) continue;
      const at = loc.lastIndexOf('@');
      const rest = (at >= 0) ? loc.slice(at + 1) : loc;
      const m = /^(.*):(\d+):(\d+)$/.exec(rest);
      if (m) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };
    }
    return null;
  }

  // Loose textual form of an instruction, for matching against source lines.
  function instrKey_(instr) {
    let s;
    if (Array.isArray(instr)) {
      const parts = instr.map((a) => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch (ex) { return String(a); }
        }
        return String(a);
      });
      s = '[' + parts.join(',') + ']';
    } else {
      s = String(instr);
    }
    return s.replace(/["']/g, '').replace(/\s+/g, '');
  }

  // How many instructions before `index` look identical to `instr`.
  function countPriorIdentical_(instrs, index, instr) {
    const key = instrKey_(instr);
    let n = 0;
    for (let j = 0; j < index; j++) {
      if (instrKey_(instrs[j]) === key) n++;
    }
    return n;
  }

  // Find the source line that declares the failing instruction, scanning
  // forward from the body() call site. Returns null when not found.
  function locateInstruction_(file, frameLine, instr, occurrence) {
    if (typeof read !== 'function' || !file || file === '-e' || instr === undefined) {
      return null;
    }
    try {
      const lines = String(read(file)).split('\n');
      const key = instrKey_(instr);
      const opStr = String(Array.isArray(instr) ? instr[0] : instr);
      if (key.length < 2 || opStr.length === 0) return null;
      const limit = Math.min(lines.length, frameLine + 99);
      let wanted = Number(occurrence) || 0;
      for (let i = frameLine - 1; i < limit; i++) {
        if (instrKey_(lines[i]).indexOf(key) >= 0) {
          if (wanted > 0) {
            wanted--;
            continue;
          }
          return { file, line: i + 1, col: caretCol_(lines[i], instr) };
        }
      }
      // Fallback: first line with the op name after the body() call.
      for (let i = frameLine - 1; i < limit; i++) {
        const c = lines[i].indexOf(opStr);
        if (c >= 0) return { file, line: i + 1, col: c + 1 };
      }
    } catch (ex) {}
    return null;
  }

  // Column (1 based) for the caret: under the first argument when present,
  // otherwise under the op name.
  function caretCol_(line, instr) {
    const opStr = String(Array.isArray(instr) ? instr[0] : instr);
    const opAt = line.indexOf(opStr);
    if (opAt < 0) return 1;
    if (Array.isArray(instr) && instr.length > 1) {
      let arg = instr[1];
      if (typeof arg === 'object' && arg !== null) {
        try { arg = JSON.stringify(arg); } catch (ex) { arg = null; }
      }
      if (arg !== null && arg !== undefined) {
        const at = line.indexOf(String(arg), opAt + opStr.length);
        if (at >= 0) return at + 1;
      }
    }
    return opAt + 1;
  }

  // One frame with its source line and caret, skips gracefully when the
  // source is unreadable
  function pushSourceFrame_(frames, file, line, col) {
    const src = sourceLine_(file, line);
    if (src === null) {
      frames.push('  ' + file + ':' + line);
      return;
    }
    const prefix = '  ' + file + ':' + line + '  ';
    const c = Math.max(1, Number(col) || 1);
    const start = Math.min(Math.max(prefix.length + c - 1, prefix.length),
      prefix.length + src.length);
    frames.push(prefix + src);
    frames.push(' '.repeat(start) + '^^^^');
  }

  // Test facing report, one clean line, then only the caller's frames.
  // Each frame shows the source line with a caret at the failure column.
  // Non verbose drops WasmBuilder.js frames, verbose keeps everything.
  function formatWasmError(e) {
    let out;
    if (e && e.code === 'internal') {
      out = '*** WB: An error occurred!';
    } else {
      const name = (e && e.name) ? String(e.name) : 'Error';
      const message = (e && e.message !== undefined) ? String(e.message) : String(e);
      out = name + ': ' + message;
    }
    const verbose = verboseErrors ||
      (typeof global !== 'undefined' && global.WB_VERBOSE === true);
    const frames = [];
    if (e && e.definitionFrame) {
      // Builder side failure, point at the line that declared the bad body.
      const df = e.definitionFrame;
      const hit = locateInstruction_(df.file, df.line, e.instruction, e.instructionOccurrence);
      pushSourceFrame_(frames, hit ? hit.file : df.file,
        hit ? hit.line : df.line, hit ? hit.col : df.col);
      if (verbose) {
        const raw = (e && (e.internalStack || e.stack)) || '';
        for (const line of String(raw).split('\n')) {
          const loc = line.trim();
          if (loc.length > 0) frames.push(loc);
        }
      }
    } else {
      const raw = (e && (e.internalStack || e.stack)) || '';
      for (const line of String(raw).split('\n')) {
        const loc = line.trim();
        if (loc.length === 0) continue;
        if (!verbose && frames.length > 0) break;  // only the innermost frame
        if (!verbose && loc.indexOf('WasmBuilder.js') >= 0) {
          continue;
        }
        // Frame shape, [funcname@]file:line:col
        const at = loc.lastIndexOf('@');
        const rest = (at >= 0) ? loc.slice(at + 1) : loc;
        const m = /^(.*):(\d+):(\d+)$/.exec(rest);
        if (!m) {
          frames.push(loc);
          continue;
        }
        pushSourceFrame_(frames, m[1], Number(m[2]), Number(m[3]));
      }
    }
    if (verbose && e && e.cause !== undefined && e.cause !== null) {
      const cm = (e.cause && e.cause.message !== undefined) ? e.cause.message : String(e.cause);
      frames.push('cause: ' + cm);
    }
    if (frames.length > 0) {
      out += '\n\n@Stack:\n' + frames.join('\n');
    }
    return out;
  }

  // -------------------------------------------------------------------
  // Test harness (formerly test/wbtests/wbtester.js). The seeds only load
  // WasmBuilder.js, so the harness helpers live here and are exported as
  // plain globals.
  // -------------------------------------------------------------------

  let failures = 0;

  function fail(label) {
    failures++;
    print('failed: ' + label);
  }

  function check(cond, label) {
    if (!cond) {
      fail(label + checkSource_());
      return false;
    }
    return true;
  }

  // Best-effort: the test-file line of the failing check, with a caret.
  function checkSource_() {
    try {
      const st = new Error().stack;
      for (const line of String(st).split('\n')) {
        const loc = line.trim();
        if (loc.length === 0 || loc.indexOf('WasmBuilder.js') >= 0) continue;
        const at = loc.lastIndexOf('@');
        const rest = (at >= 0) ? loc.slice(at + 1) : loc;
        const m = /^(.*):(\d+):(\d+)$/.exec(rest);
        if (!m || typeof read !== 'function') return '';
        const src = String(read(m[1])).split('\n')[Number(m[2]) - 1];
        if (src === undefined) return '';
        const prefix = '  ' + m[1] + ':' + m[2] + '  ';
        const col = Math.max(1, Number(m[3]));
        const start = Math.min(Math.max(prefix.length + col - 1, prefix.length),
          prefix.length + src.length);
        return '\n' + prefix + src + '\n' + ' '.repeat(start) + '^^^^';
      }
    } catch (e) {}
    return '';
  }

  function checkThrows(fn, label) {
    try {
      fn();
    } catch (e) {
      return e;
    }
    fail(label + ': no exception thrown');
    return null;
  }

  function errorName(e) {
    if (e === null) return 'null';
    if (e === undefined) return 'undefined';
    if (typeof e === 'object' || typeof e === 'function') {
      if (e.code !== undefined) return String(e.code);
      if (e.name !== undefined) return String(e.name);
      if (e.constructor && e.constructor.name) {
        return String(e.constructor.name);
      }
    }
    return String(e);
  }

  function expectError(code, fn) {
    let error;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    if (error === undefined) {
      fail('expected error ' + code + ', none thrown');
      return null;
    }
    const got = errorName(error);
    if (got !== String(code)) {
      fail('expected error ' + code + ', got ' + got);
      return error;
    }
    return error;
  }

  function expectInstanceOf(type, fn, label) {
    let error;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    if (error === undefined) {
      fail(label + ': no exception thrown');
      return null;
    }
    if (!(error instanceof type)) {
      fail(
        label +
        ': expected ' +
        type.name +
        ', got ' +
        errorName(error)
      );
      return error;
    }
    return error;
  }

  // Runs the test body. A clean error report is printed and the process
  // exits non-zero on failure; failed checks are reported the same way, so
  // seeds end with a goal print instead of a completion call.
  function runTest(fn) {
    try {
      fn();
    } catch (e) {
      print(formatWasmError(e));
      quit(1);
    }
    if (failures !== 0) {
      print('failed: ' + failures + ' check(s)');
      quit(1);
    }
  }

  // Section ids (SectionId enum).
  const SECT = {
    CUSTOM: 0,
    TYPE: 1,
    IMPORT: 2,
    FUNCTION: 3,
    TABLE: 4,
    MEMORY: 5,
    GLOBAL: 6,
    EXPORT: 7,
    START: 8,
    ELEM: 9,
    CODE: 10,
    DATA: 11,
    DATACOUNT: 12,
    TAG: 13,
  };

  // External kind bytes (DefinitionKind).
  const KIND = {
    FUNCTION: 0x00,
    TABLE: 0x01,
    MEMORY: 0x02,
    GLOBAL: 0x03,
    TAG: 0x04,
  };

  // Value types (TypeCode enum, single byte negative SLEB128s).
  const TYPE = {
    i32: 0x7f,
    i64: 0x7e,
    f32: 0x7d,
    f64: 0x7c,
    v128: 0x7b,
    funcref: 0x70,
    externref: 0x6f,
    anyref: 0x6e,
    eqref: 0x6d,
    i31ref: 0x6c,
    structref: 0x6b,
    arrayref: 0x6a,
    exnref: 0x69,
    nullfuncref: 0x73,
    nullexternref: 0x72,
    nullanyref: 0x71,
    nullexnref: 0x74,
    // GC packed field types (only valid inside struct/array field lists).
    i8: 0x78,
    i16: 0x77,
  };

  // Packed fields (i8/i16) are stored as bytes but used as i32 on the stack.
  function fieldStackType(t) {
    return (t === 'i8' || t === 'i16') ? 'i32' : t;
  }

  // Abstract heap types used by ref.null and typed-ref constructors.
  const HEAP = {
    func: 0x70,
    extern: 0x6f,
    any: 0x6e,
    eq: 0x6d,
    i31: 0x6c,
    struct: 0x6b,
    array: 0x6a,
    exn: 0x69,
    none: 0x78,
  };
  HEAP.funcref = HEAP.func;
  HEAP.externref = HEAP.extern;
  HEAP.anyref = HEAP.any;
  HEAP.eqref = HEAP.eq;
  HEAP.i31ref = HEAP.i31;
  HEAP.structref = HEAP.struct;
  HEAP.arrayref = HEAP.array;
  HEAP.exnref = HEAP.exn;

  const BLOCK_VOID = 0x40;   // TypeCode::BlockVoid (empty block type)
  const FUNC_FORM = 0x60;    // type constructor for function types
  const STRUCT_FORM = 0x5f;  // GC: struct type constructor (unused until GC)
  const ARRAY_FORM = 0x5e;   // GC: array type constructor
  const REC_GROUP = 0x4e;    // GC: rec group prefix
  const SUB_NO_FINAL = 0x50; // GC: 'sub' prefix (extensible, may have supers)
  const SUB_FINAL = 0x4f;    // GC: 'sub final' prefix
  const REF_NULLABLE = 0x63; // TypeCode::NullableRef constructor
  const REF_NONNULL = 0x64;  // TypeCode::Ref constructor

  // Core opcodes (Op enum).
  const OP = {
    Unreachable: 0x00,
    Nop: 0x01,
    Block: 0x02,
    Loop: 0x03,
    If: 0x04,
    Else: 0x05,
    Try: 0x06,
    Catch: 0x07,
    Throw: 0x08,
    Rethrow: 0x09,
    ThrowRef: 0x0a,
    End: 0x0b,
    Br: 0x0c,
    BrIf: 0x0d,
    BrTable: 0x0e,
    Return: 0x0f,
    Call: 0x10,
    CallIndirect: 0x11,
    ReturnCall: 0x12,
    ReturnCallIndirect: 0x13,
    CallRef: 0x14,
    ReturnCallRef: 0x15,
    Delegate: 0x18,
    CatchAll: 0x19,
    Drop: 0x1a,
    SelectNumeric: 0x1b,
    SelectTyped: 0x1c,
    TryTable: 0x1f,
    LocalGet: 0x20,
    LocalSet: 0x21,
    LocalTee: 0x22,
    GlobalGet: 0x23,
    GlobalSet: 0x24,
    TableGet: 0x25,
    TableSet: 0x26,
    I32Load: 0x28,
    I64Load: 0x29,
    F32Load: 0x2a,
    F64Load: 0x2b,
    I32Load8S: 0x2c,
    I32Load8U: 0x2d,
    I32Load16S: 0x2e,
    I32Load16U: 0x2f,
    I64Load8S: 0x30,
    I64Load8U: 0x31,
    I64Load16S: 0x32,
    I64Load16U: 0x33,
    I64Load32S: 0x34,
    I64Load32U: 0x35,
    I32Store: 0x36,
    I64Store: 0x37,
    F32Store: 0x38,
    F64Store: 0x39,
    I32Store8: 0x3a,
    I32Store16: 0x3b,
    I64Store8: 0x3c,
    I64Store16: 0x3d,
    I64Store32: 0x3e,
    MemorySize: 0x3f,
    MemoryGrow: 0x40,
    I32Const: 0x41,
    I64Const: 0x42,
    F32Const: 0x43,
    F64Const: 0x44,
    RefNull: 0xd0,
    RefIsNull: 0xd1,
    RefFunc: 0xd2,
    RefEq: 0xd3,
    RefAsNonNull: 0xd4,
    BrOnNull: 0xd5,
    BrOnNonNull: 0xd6,
    GcPrefix: 0xfb,
    MiscPrefix: 0xfc,
    SimdPrefix: 0xfd,
    ThreadPrefix: 0xfe,
  };

  // Single-byte numeric ops (Op enum, 0x45..0xc4).
  const UNARY_BYTE = {
    'i32.eqz': 0x45,
    'i32.eq': 0x46,
    'i32.ne': 0x47,
    'i32.lt_s': 0x48,
    'i32.lt_u': 0x49,
    'i32.gt_s': 0x4a,
    'i32.gt_u': 0x4b,
    'i32.le_s': 0x4c,
    'i32.le_u': 0x4d,
    'i32.ge_s': 0x4e,
    'i32.ge_u': 0x4f,
    'i64.eqz': 0x50,
    'i64.eq': 0x51,
    'i64.ne': 0x52,
    'i64.lt_s': 0x53,
    'i64.lt_u': 0x54,
    'i64.gt_s': 0x55,
    'i64.gt_u': 0x56,
    'i64.le_s': 0x57,
    'i64.le_u': 0x58,
    'i64.ge_s': 0x59,
    'i64.ge_u': 0x5a,
    'f32.eq': 0x5b,
    'f32.ne': 0x5c,
    'f32.lt': 0x5d,
    'f32.gt': 0x5e,
    'f32.le': 0x5f,
    'f32.ge': 0x60,
    'f64.eq': 0x61,
    'f64.ne': 0x62,
    'f64.lt': 0x63,
    'f64.gt': 0x64,
    'f64.le': 0x65,
    'f64.ge': 0x66,
    'i32.clz': 0x67,
    'i32.ctz': 0x68,
    'i32.popcnt': 0x69,
    'i32.add': 0x6a,
    'i32.sub': 0x6b,
    'i32.mul': 0x6c,
    'i32.div_s': 0x6d,
    'i32.div_u': 0x6e,
    'i32.rem_s': 0x6f,
    'i32.rem_u': 0x70,
    'i32.and': 0x71,
    'i32.or': 0x72,
    'i32.xor': 0x73,
    'i32.shl': 0x74,
    'i32.shr_s': 0x75,
    'i32.shr_u': 0x76,
    'i32.rotl': 0x77,
    'i32.rotr': 0x78,
    'i64.clz': 0x79,
    'i64.ctz': 0x7a,
    'i64.popcnt': 0x7b,
    'i64.add': 0x7c,
    'i64.sub': 0x7d,
    'i64.mul': 0x7e,
    'i64.div_s': 0x7f,
    'i64.div_u': 0x80,
    'i64.rem_s': 0x81,
    'i64.rem_u': 0x82,
    'i64.and': 0x83,
    'i64.or': 0x84,
    'i64.xor': 0x85,
    'i64.shl': 0x86,
    'i64.shr_s': 0x87,
    'i64.shr_u': 0x88,
    'i64.rotl': 0x89,
    'i64.rotr': 0x8a,
    'f32.abs': 0x8b,
    'f32.neg': 0x8c,
    'f32.ceil': 0x8d,
    'f32.floor': 0x8e,
    'f32.trunc': 0x8f,
    'f32.nearest': 0x90,
    'f32.sqrt': 0x91,
    'f32.add': 0x92,
    'f32.sub': 0x93,
    'f32.mul': 0x94,
    'f32.div': 0x95,
    'f32.min': 0x96,
    'f32.max': 0x97,
    'f32.copysign': 0x98,
    'f64.abs': 0x99,
    'f64.neg': 0x9a,
    'f64.ceil': 0x9b,
    'f64.floor': 0x9c,
    'f64.trunc': 0x9d,
    'f64.nearest': 0x9e,
    'f64.sqrt': 0x9f,
    'f64.add': 0xa0,
    'f64.sub': 0xa1,
    'f64.mul': 0xa2,
    'f64.div': 0xa3,
    'f64.min': 0xa4,
    'f64.max': 0xa5,
    'f64.copysign': 0xa6,
    'i32.wrap_i64': 0xa7,
    'i32.trunc_f32_s': 0xa8,
    'i32.trunc_f32_u': 0xa9,
    'i32.trunc_f64_s': 0xaa,
    'i32.trunc_f64_u': 0xab,
    'i64.extend_i32_s': 0xac,
    'i64.extend_i32_u': 0xad,
    'i64.trunc_f32_s': 0xae,
    'i64.trunc_f32_u': 0xaf,
    'i64.trunc_f64_s': 0xb0,
    'i64.trunc_f64_u': 0xb1,
    'f32.convert_i32_s': 0xb2,
    'f32.convert_i32_u': 0xb3,
    'f32.convert_i64_s': 0xb4,
    'f32.convert_i64_u': 0xb5,
    'f32.demote_f64': 0xb6,
    'f64.convert_i32_s': 0xb7,
    'f64.convert_i32_u': 0xb8,
    'f64.convert_i64_s': 0xb9,
    'f64.convert_i64_u': 0xba,
    'f64.promote_f32': 0xbb,
    'i32.reinterpret_f32': 0xbc,
    'i64.reinterpret_f64': 0xbd,
    'f32.reinterpret_i32': 0xbe,
    'f64.reinterpret_i64': 0xbf,
    'i32.extend8_s': 0xc0,
    'i32.extend16_s': 0xc1,
    'i64.extend8_s': 0xc2,
    'i64.extend16_s': 0xc3,
    'i64.extend32_s': 0xc4,
  };

  // Misc-prefix ops (MiscOp enum, prefixed by 0xfc).
  const MISC = {
    'i32.trunc_sat_f32_s': 0x00,
    'i32.trunc_sat_f32_u': 0x01,
    'i32.trunc_sat_f64_s': 0x02,
    'i32.trunc_sat_f64_u': 0x03,
    'i64.trunc_sat_f32_s': 0x04,
    'i64.trunc_sat_f32_u': 0x05,
    'i64.trunc_sat_f64_s': 0x06,
    'i64.trunc_sat_f64_u': 0x07,
    'memory.init': 0x08,
    'data.drop': 0x09,
    'memory.copy': 0x0a,
    'memory.fill': 0x0b,
    'table.init': 0x0c,
    'elem.drop': 0x0d,
    'table.copy': 0x0e,
    'table.grow': 0x0f,
    'table.size': 0x10,
    'table.fill': 0x11,
    'memory.discard': 0x12,
  };

  // Load/store ops: {op, sizeBytes} (Op enum).
  const LOAD_STORE = {
    'i32.load': { op: 0x28, size: 4 },
    'i64.load': { op: 0x29, size: 8 },
    'f32.load': { op: 0x2a, size: 4 },
    'f64.load': { op: 0x2b, size: 8 },
    'i32.load8_s': { op: 0x2c, size: 1 },
    'i32.load8_u': { op: 0x2d, size: 1 },
    'i32.load16_s': { op: 0x2e, size: 2 },
    'i32.load16_u': { op: 0x2f, size: 2 },
    'i64.load8_s': { op: 0x30, size: 1 },
    'i64.load8_u': { op: 0x31, size: 1 },
    'i64.load16_s': { op: 0x32, size: 2 },
    'i64.load16_u': { op: 0x33, size: 2 },
    'i64.load32_s': { op: 0x34, size: 4 },
    'i64.load32_u': { op: 0x35, size: 4 },
    'i32.store': { op: 0x36, size: 4 },
    'i64.store': { op: 0x37, size: 8 },
    'f32.store': { op: 0x38, size: 4 },
    'f64.store': { op: 0x39, size: 8 },
    'i32.store8': { op: 0x3a, size: 1 },
    'i32.store16': { op: 0x3b, size: 2 },
    'i64.store8': { op: 0x3c, size: 1 },
    'i64.store16': { op: 0x3d, size: 2 },
    'i64.store32': { op: 0x3e, size: 4 },
  };

  // Thread-prefix ops (ThreadOp enum, prefixed by 0xfe).
  const THREAD_LOAD = {
    'i32.atomic.load': 0x10,
    'i64.atomic.load': 0x11,
    'i32.atomic.load8_u': 0x12,
    'i32.atomic.load16_u': 0x13,
    'i64.atomic.load8_u': 0x14,
    'i64.atomic.load16_u': 0x15,
    'i64.atomic.load32_u': 0x16,
  };

  const THREAD_STORE = {
    'i32.atomic.store': 0x17,
    'i64.atomic.store': 0x18,
    'i32.atomic.store8_u': 0x19,
    'i32.atomic.store16_u': 0x1a,
    'i64.atomic.store8_u': 0x1b,
    'i64.atomic.store16_u': 0x1c,
    'i64.atomic.store32_u': 0x1d,
  };

  // base + 0..6 selects the width variant.
  const THREAD_RMW = [
    { name: 'add', base: 0x1e },
    { name: 'sub', base: 0x25 },
    { name: 'and', base: 0x2c },
    { name: 'or', base: 0x33 },
    { name: 'xor', base: 0x3a },
    { name: 'xchg', base: 0x41 },
    { name: 'cmpxchg', base: 0x48 },
  ];

  const THREAD_RMW_WIDTHS = [
    'i32',
    'i64',
    'i32_8u',
    'i32_16u',
    'i64_8u',
    'i64_16u',
    'i64_32u',
  ];

  const THREAD_RMW_ATOMICITY = {
    'i32': 4,
    'i64': 8,
    'i32_8u': 1,
    'i32_16u': 2,
    'i64_8u': 1,
    'i64_16u': 2,
    'i64_32u': 4,
  };

  // SIMD ops (0xfd prefix). Shape: how the encoder writes immediates and
  // the checker types the operands:
  //   L    load:  pop addr, push v128
  //   S    store: pop addr, pop v128
  //   LL   lane load:  pop addr, pop v128, push v128
  //   LS   lane store: pop addr, pop v128
  //   C    16 bytes (v128.const)
  //   SH   16 lane indices (i8x16.shuffle)
  //   SW   two v128 -> v128 (swizzle)
  //   SP   scalar -> v128 (splat)
  //   EX   v128 -> scalar lane (extract_lane)
  //   RP   v128 + scalar lane -> v128 (replace_lane)
  //   CMP  two v128 -> v128 (comparisons)
  //   UN   v128 -> v128 (unary)
  //   BI   v128, v128 -> v128 (binary)
  //   TER  three v128 -> v128 (bitselect)
  //   AT   v128 -> i32 (all_true / any_true)
  //   BM   v128 -> i32 (bitmask)
  //   SHF  v128 + i32 -> v128 (shift)
  const SIMD = {
    'v128.load': [0x00, 'L', 16],
    'v128.load8x8_s': [0x01, 'L', 8],
    'v128.load8x8_u': [0x02, 'L', 8],
    'v128.load16x4_s': [0x03, 'L', 8],
    'v128.load16x4_u': [0x04, 'L', 8],
    'v128.load32x2_s': [0x05, 'L', 8],
    'v128.load32x2_u': [0x06, 'L', 8],
    'v128.load8_splat': [0x07, 'L', 1],
    'v128.load16_splat': [0x08, 'L', 2],
    'v128.load32_splat': [0x09, 'L', 4],
    'v128.load64_splat': [0x0a, 'L', 8],
    'v128.store': [0x0b, 'S', 16],
    'v128.const': [0x0c, 'C'],
    'i8x16.shuffle': [0x0d, 'SH'],
    'i8x16.swizzle': [0x0e, 'SW'],
    'i8x16.splat': [0x0f, 'SP', 'i32'],
    'i16x8.splat': [0x10, 'SP', 'i32'],
    'i32x4.splat': [0x11, 'SP', 'i32'],
    'i64x2.splat': [0x12, 'SP', 'i64'],
    'f32x4.splat': [0x13, 'SP', 'f32'],
    'f64x2.splat': [0x14, 'SP', 'f64'],
    'i8x16.extract_lane_s': [0x15, 'EX', 'i32'],
    'i8x16.extract_lane_u': [0x16, 'EX', 'i32'],
    'i8x16.replace_lane': [0x17, 'RP', 'i32'],
    'i16x8.extract_lane_s': [0x18, 'EX', 'i32'],
    'i16x8.extract_lane_u': [0x19, 'EX', 'i32'],
    'i16x8.replace_lane': [0x1a, 'RP', 'i32'],
    'i32x4.extract_lane': [0x1b, 'EX', 'i32'],
    'i32x4.replace_lane': [0x1c, 'RP', 'i32'],
    'i64x2.extract_lane': [0x1d, 'EX', 'i64'],
    'i64x2.replace_lane': [0x1e, 'RP', 'i64'],
    'f32x4.extract_lane': [0x1f, 'EX', 'f32'],
    'f32x4.replace_lane': [0x20, 'RP', 'f32'],
    'f64x2.extract_lane': [0x21, 'EX', 'f64'],
    'f64x2.replace_lane': [0x22, 'RP', 'f64'],
    'i8x16.eq': [0x23, 'CMP'],
    'i8x16.ne': [0x24, 'CMP'],
    'i8x16.lt_s': [0x25, 'CMP'],
    'i8x16.lt_u': [0x26, 'CMP'],
    'i8x16.gt_s': [0x27, 'CMP'],
    'i8x16.gt_u': [0x28, 'CMP'],
    'i8x16.le_s': [0x29, 'CMP'],
    'i8x16.le_u': [0x2a, 'CMP'],
    'i8x16.ge_s': [0x2b, 'CMP'],
    'i8x16.ge_u': [0x2c, 'CMP'],
    'i16x8.eq': [0x2d, 'CMP'],
    'i16x8.ne': [0x2e, 'CMP'],
    'i16x8.lt_s': [0x2f, 'CMP'],
    'i16x8.lt_u': [0x30, 'CMP'],
    'i16x8.gt_s': [0x31, 'CMP'],
    'i16x8.gt_u': [0x32, 'CMP'],
    'i16x8.le_s': [0x33, 'CMP'],
    'i16x8.le_u': [0x34, 'CMP'],
    'i16x8.ge_s': [0x35, 'CMP'],
    'i16x8.ge_u': [0x36, 'CMP'],
    'i32x4.eq': [0x37, 'CMP'],
    'i32x4.ne': [0x38, 'CMP'],
    'i32x4.lt_s': [0x39, 'CMP'],
    'i32x4.lt_u': [0x3a, 'CMP'],
    'i32x4.gt_s': [0x3b, 'CMP'],
    'i32x4.gt_u': [0x3c, 'CMP'],
    'i32x4.le_s': [0x3d, 'CMP'],
    'i32x4.le_u': [0x3e, 'CMP'],
    'i32x4.ge_s': [0x3f, 'CMP'],
    'i32x4.ge_u': [0x40, 'CMP'],
    'f32x4.eq': [0x41, 'CMP'],
    'f32x4.ne': [0x42, 'CMP'],
    'f32x4.lt': [0x43, 'CMP'],
    'f32x4.gt': [0x44, 'CMP'],
    'f32x4.le': [0x45, 'CMP'],
    'f32x4.ge': [0x46, 'CMP'],
    'f64x2.eq': [0x47, 'CMP'],
    'f64x2.ne': [0x48, 'CMP'],
    'f64x2.lt': [0x49, 'CMP'],
    'f64x2.gt': [0x4a, 'CMP'],
    'f64x2.le': [0x4b, 'CMP'],
    'f64x2.ge': [0x4c, 'CMP'],
    'v128.not': [0x4d, 'UN'],
    'v128.and': [0x4e, 'BI'],
    'v128.andnot': [0x4f, 'BI'],
    'v128.or': [0x50, 'BI'],
    'v128.xor': [0x51, 'BI'],
    'v128.bitselect': [0x52, 'TER'],
    'v128.any_true': [0x53, 'AT'],
    'v128.load8_lane': [0x54, 'LL', 1],
    'v128.load16_lane': [0x55, 'LL', 2],
    'v128.load32_lane': [0x56, 'LL', 4],
    'v128.load64_lane': [0x57, 'LL', 8],
    'v128.store8_lane': [0x58, 'LS', 1],
    'v128.store16_lane': [0x59, 'LS', 2],
    'v128.store32_lane': [0x5a, 'LS', 4],
    'v128.store64_lane': [0x5b, 'LS', 8],
    'v128.load32_zero': [0x5c, 'L', 4],
    'v128.load64_zero': [0x5d, 'L', 8],
    'f32x4.demote_f64x2_zero': [0x5e, 'UN'],
    'f64x2.promote_low_f32x4': [0x5f, 'UN'],
    'i8x16.abs': [0x60, 'UN'],
    'i8x16.neg': [0x61, 'UN'],
    'i8x16.popcnt': [0x62, 'UN'],
    'i8x16.all_true': [0x63, 'AT'],
    'i8x16.bitmask': [0x64, 'BM'],
    'i8x16.narrow_i16x8_s': [0x65, 'BI'],
    'i8x16.narrow_i16x8_u': [0x66, 'BI'],
    'f32x4.ceil': [0x67, 'UN'],
    'f32x4.floor': [0x68, 'UN'],
    'f32x4.trunc': [0x69, 'UN'],
    'f32x4.nearest': [0x6a, 'UN'],
    'i8x16.shl': [0x6b, 'SHF'],
    'i8x16.shr_s': [0x6c, 'SHF'],
    'i8x16.shr_u': [0x6d, 'SHF'],
    'i8x16.add': [0x6e, 'BI'],
    'i8x16.add_sat_s': [0x6f, 'BI'],
    'i8x16.add_sat_u': [0x70, 'BI'],
    'i8x16.sub': [0x71, 'BI'],
    'i8x16.sub_sat_s': [0x72, 'BI'],
    'i8x16.sub_sat_u': [0x73, 'BI'],
    'f64x2.ceil': [0x74, 'UN'],
    'f64x2.floor': [0x75, 'UN'],
    'i8x16.min_s': [0x76, 'BI'],
    'i8x16.min_u': [0x77, 'BI'],
    'i8x16.max_s': [0x78, 'BI'],
    'i8x16.max_u': [0x79, 'BI'],
    'f64x2.trunc': [0x7a, 'UN'],
    'i8x16.avgr_u': [0x7b, 'BI'],
    'i16x8.extadd_pairwise_i8x16_s': [0x7c, 'UN'],
    'i16x8.extadd_pairwise_i8x16_u': [0x7d, 'UN'],
    'i32x4.extadd_pairwise_i16x8_s': [0x7e, 'UN'],
    'i32x4.extadd_pairwise_i16x8_u': [0x7f, 'UN'],
    'i16x8.abs': [0x80, 'UN'],
    'i16x8.neg': [0x81, 'UN'],
    'i16x8.q15mulr_sat_s': [0x82, 'BI'],
    'i16x8.all_true': [0x83, 'AT'],
    'i16x8.bitmask': [0x84, 'BM'],
    'i16x8.narrow_i32x4_s': [0x85, 'BI'],
    'i16x8.narrow_i32x4_u': [0x86, 'BI'],
    'i16x8.extend_low_i8x16_s': [0x87, 'UN'],
    'i16x8.extend_high_i8x16_s': [0x88, 'UN'],
    'i16x8.extend_low_i8x16_u': [0x89, 'UN'],
    'i16x8.extend_high_i8x16_u': [0x8a, 'UN'],
    'i16x8.shl': [0x8b, 'SHF'],
    'i16x8.shr_s': [0x8c, 'SHF'],
    'i16x8.shr_u': [0x8d, 'SHF'],
    'i16x8.add': [0x8e, 'BI'],
    'i16x8.add_sat_s': [0x8f, 'BI'],
    'i16x8.add_sat_u': [0x90, 'BI'],
    'i16x8.sub': [0x91, 'BI'],
    'i16x8.sub_sat_s': [0x92, 'BI'],
    'i16x8.sub_sat_u': [0x93, 'BI'],
    'f64x2.nearest': [0x94, 'UN'],
    'i16x8.mul': [0x95, 'BI'],
    'i16x8.min_s': [0x96, 'BI'],
    'i16x8.min_u': [0x97, 'BI'],
    'i16x8.max_s': [0x98, 'BI'],
    'i16x8.max_u': [0x99, 'BI'],
    'i16x8.avgr_u': [0x9b, 'BI'],
    'i16x8.extmul_low_i8x16_s': [0x9c, 'BI'],
    'i16x8.extmul_high_i8x16_s': [0x9d, 'BI'],
    'i16x8.extmul_low_i8x16_u': [0x9e, 'BI'],
    'i16x8.extmul_high_i8x16_u': [0x9f, 'BI'],
    'i32x4.abs': [0xa0, 'UN'],
    'i32x4.neg': [0xa1, 'UN'],
    'i32x4.all_true': [0xa3, 'AT'],
    'i32x4.bitmask': [0xa4, 'BM'],
    'i32x4.extend_low_i16x8_s': [0xa7, 'UN'],
    'i32x4.extend_high_i16x8_s': [0xa8, 'UN'],
    'i32x4.extend_low_i16x8_u': [0xa9, 'UN'],
    'i32x4.extend_high_i16x8_u': [0xaa, 'UN'],
    'i32x4.shl': [0xab, 'SHF'],
    'i32x4.shr_s': [0xac, 'SHF'],
    'i32x4.shr_u': [0xad, 'SHF'],
    'i32x4.add': [0xae, 'BI'],
    'i32x4.sub': [0xb1, 'BI'],
    'i32x4.mul': [0xb5, 'BI'],
    'i32x4.min_s': [0xb6, 'BI'],
    'i32x4.min_u': [0xb7, 'BI'],
    'i32x4.max_s': [0xb8, 'BI'],
    'i32x4.max_u': [0xb9, 'BI'],
    'i32x4.dot_i16x8_s': [0xba, 'BI'],
    'i32x4.extmul_low_i16x8_s': [0xbc, 'BI'],
    'i32x4.extmul_high_i16x8_s': [0xbd, 'BI'],
    'i32x4.extmul_low_i16x8_u': [0xbe, 'BI'],
    'i32x4.extmul_high_i16x8_u': [0xbf, 'BI'],
    'i64x2.abs': [0xc0, 'UN'],
    'i64x2.neg': [0xc1, 'UN'],
    'i64x2.all_true': [0xc3, 'AT'],
    'i64x2.bitmask': [0xc4, 'BM'],
    'i64x2.extend_low_i32x4_s': [0xc7, 'UN'],
    'i64x2.extend_high_i32x4_s': [0xc8, 'UN'],
    'i64x2.extend_low_i32x4_u': [0xc9, 'UN'],
    'i64x2.extend_high_i32x4_u': [0xca, 'UN'],
    'i64x2.shl': [0xcb, 'SHF'],
    'i64x2.shr_s': [0xcc, 'SHF'],
    'i64x2.shr_u': [0xcd, 'SHF'],
    'i64x2.add': [0xce, 'BI'],
    'i64x2.sub': [0xd1, 'BI'],
    'i64x2.mul': [0xd5, 'BI'],
    'i64x2.eq': [0xd6, 'CMP'],
    'i64x2.ne': [0xd7, 'CMP'],
    'i64x2.lt_s': [0xd8, 'CMP'],
    'i64x2.gt_s': [0xd9, 'CMP'],
    'i64x2.le_s': [0xda, 'CMP'],
    'i64x2.ge_s': [0xdb, 'CMP'],
    'i64x2.extmul_low_i32x4_s': [0xdc, 'BI'],
    'i64x2.extmul_high_i32x4_s': [0xdd, 'BI'],
    'i64x2.extmul_low_i32x4_u': [0xde, 'BI'],
    'i64x2.extmul_high_i32x4_u': [0xdf, 'BI'],
    'f32x4.abs': [0xe0, 'UN'],
    'f32x4.neg': [0xe1, 'UN'],
    'f32x4.sqrt': [0xe3, 'UN'],
    'f32x4.add': [0xe4, 'BI'],
    'f32x4.sub': [0xe5, 'BI'],
    'f32x4.mul': [0xe6, 'BI'],
    'f32x4.div': [0xe7, 'BI'],
    'f32x4.min': [0xe8, 'BI'],
    'f32x4.max': [0xe9, 'BI'],
    'f32x4.pmin': [0xea, 'BI'],
    'f32x4.pmax': [0xeb, 'BI'],
    'f64x2.abs': [0xec, 'UN'],
    'f64x2.neg': [0xed, 'UN'],
    'f64x2.sqrt': [0xef, 'UN'],
    'f64x2.add': [0xf0, 'BI'],
    'f64x2.sub': [0xf1, 'BI'],
    'f64x2.mul': [0xf2, 'BI'],
    'f64x2.div': [0xf3, 'BI'],
    'f64x2.min': [0xf4, 'BI'],
    'f64x2.max': [0xf5, 'BI'],
    'f64x2.pmin': [0xf6, 'BI'],
    'f64x2.pmax': [0xf7, 'BI'],
    'i32x4.trunc_sat_f32x4_s': [0xf8, 'UN'],
    'i32x4.trunc_sat_f32x4_u': [0xf9, 'UN'],
    'f32x4.convert_i32x4_s': [0xfa, 'UN'],
    'f32x4.convert_i32x4_u': [0xfb, 'UN'],
    'i32x4.trunc_sat_f64x2_s_zero': [0xfc, 'UN'],
    'i32x4.trunc_sat_f64x2_u_zero': [0xfd, 'UN'],
    'f64x2.convert_low_i32x4_s': [0xfe, 'UN'],
    'f64x2.convert_low_i32x4_u': [0xff, 'UN'],
  };

  // GC ops (0xfb prefix). Shape: immediate encoding + stack effect.
  //   snew       struct.new: pop fields, push ref
  //   snewdef    struct.new_default: push ref
  //   sget       struct.get: pop ref, push field type
  //   sget_su    struct.get_s/u: pop ref, push i32
  //   sset       struct.set: pop ref, pop value
  //   anew       array.new: pop init, pop len, push ref
  //   anewdef    array.new_default: pop len, push ref
  //   anewfixed  array.new_fixed: pop n values, push ref
  //   anewseg    array.new_data/elem: pop offset, pop len, push ref
  //   aget       array.get: pop ref, pop index, push element type
  //   aget_su    array.get_s/u: pop ref, pop index, push i32
  //   aset       array.set: pop ref, pop index, pop value
  //   alen       array.len: pop ref, push i32
  //   afill      array.fill: pop ref, pop index, pop value, pop len
  //   acopy      array.copy: pop dst ref, dst idx, src ref, src idx, len
  //   aseginit   array.init_data/elem: pop ref, index, offset, len
  //   rtest      ref.test/test_null: pop ref, push i32
  //   rcast      ref.cast/cast_null: pop ref, push ref
  //   rbrancast  br_on_cast / br_on_cast_fail: depth + two ref types
  //   rconvert   any/extern convert: pop one ref, push the other
  //   ri31       ref.i31: pop i32, push i31 ref
  //   i31get     i31.get_s/u: pop i31 ref, push i32
  const GC = {
    'struct.new': [0x00, 'snew'],
    'struct.new_default': [0x01, 'snewdef'],
    'struct.get': [0x02, 'sget'],
    'struct.get_s': [0x03, 'sget_su'],
    'struct.get_u': [0x04, 'sget_su'],
    'struct.set': [0x05, 'sset'],
    'array.new': [0x06, 'anew'],
    'array.new_default': [0x07, 'anewdef'],
    'array.new_fixed': [0x08, 'anewfixed'],
    'array.new_data': [0x09, 'anewseg'],
    'array.new_elem': [0x0a, 'anewseg'],
    'array.get': [0x0b, 'aget'],
    'array.get_s': [0x0c, 'aget_su'],
    'array.get_u': [0x0d, 'aget_su'],
    'array.set': [0x0e, 'aset'],
    'array.len': [0x0f, 'alen'],
    'array.fill': [0x10, 'afill'],
    'array.copy': [0x11, 'acopy'],
    'array.init_data': [0x12, 'aseginit'],
    'array.init_elem': [0x13, 'aseginit'],
    'ref.test': [0x14, 'rtest'],
    'ref.test_null': [0x15, 'rtest'],
    'ref.cast': [0x16, 'rcast'],
    'ref.cast_null': [0x17, 'rcast'],
    'br_on_cast': [0x18, 'rbrancast'],
    'br_on_cast_fail': [0x19, 'rbrancast'],
    'any.convert_extern': [0x1a, 'rconvert'],
    'extern.convert_any': [0x1b, 'rconvert'],
    'ref.i31': [0x1c, 'ri31'],
    'i31.new': [0x1c, 'ri31'],
    'i31.get_s': [0x1d, 'i31get'],
    'i31.get_u': [0x1e, 'i31get'],
  };

  // Exact operand/result types of the numeric conversions.
  const CONV = {
    'i32.wrap_i64': ['i64', 'i32'],
    'i32.trunc_f32_s': ['f32', 'i32'],
    'i32.trunc_f32_u': ['f32', 'i32'],
    'i32.trunc_f64_s': ['f64', 'i32'],
    'i32.trunc_f64_u': ['f64', 'i32'],
    'i32.trunc_sat_f32_s': ['f32', 'i32'],
    'i32.trunc_sat_f32_u': ['f32', 'i32'],
    'i32.trunc_sat_f64_s': ['f64', 'i32'],
    'i32.trunc_sat_f64_u': ['f64', 'i32'],
    'i64.extend_i32_s': ['i32', 'i64'],
    'i64.extend_i32_u': ['i32', 'i64'],
    'i64.trunc_f32_s': ['f32', 'i64'],
    'i64.trunc_f32_u': ['f32', 'i64'],
    'i64.trunc_f64_s': ['f64', 'i64'],
    'i64.trunc_f64_u': ['f64', 'i64'],
    'i64.trunc_sat_f32_s': ['f32', 'i64'],
    'i64.trunc_sat_f32_u': ['f32', 'i64'],
    'i64.trunc_sat_f64_s': ['f64', 'i64'],
    'i64.trunc_sat_f64_u': ['f64', 'i64'],
    'f32.convert_i32_s': ['i32', 'f32'],
    'f32.convert_i32_u': ['i32', 'f32'],
    'f32.convert_i64_s': ['i64', 'f32'],
    'f32.convert_i64_u': ['i64', 'f32'],
    'f32.demote_f64': ['f64', 'f32'],
    'f64.convert_i32_s': ['i32', 'f64'],
    'f64.convert_i32_u': ['i32', 'f64'],
    'f64.convert_i64_s': ['i64', 'f64'],
    'f64.convert_i64_u': ['i64', 'f64'],
    'f64.promote_f32': ['f32', 'f64'],
    'i32.reinterpret_f32': ['f32', 'i32'],
    'i64.reinterpret_f64': ['f64', 'i64'],
    'f32.reinterpret_i32': ['i32', 'f32'],
    'f64.reinterpret_i64': ['i64', 'f64'],
    'i32.extend8_s': ['i32', 'i32'],
    'i32.extend16_s': ['i32', 'i32'],
    'i64.extend8_s': ['i64', 'i64'],
    'i64.extend16_s': ['i64', 'i64'],
    'i64.extend32_s': ['i64', 'i64'],
  };

  // Byte writer with LEB128 primitives
  const f32View = new DataView(new ArrayBuffer(4));
  const f64View = new DataView(new ArrayBuffer(8));

  class Writer {
    constructor() {
      this.bytes_ = [];
    }

    get length() {
      return this.bytes_.length;
    }

    result() {
      return new Uint8Array(this.bytes_);
    }

    writeU8(v) {
      assert(Number.isInteger(v) && v >= 0 && v <= 0xff,
        'writeU8: value out of range: ' + v);
      this.bytes_.push(v);
      return this;
    }

    // Unsigned LEB128. Accepts numbers (uint32 range) and BigInt.
    writeU32LEB(v) {
      assert((typeof v === 'bigint') ||
        (Number.isInteger(v) && v >= 0), 'writeU32LEB: bad value ' + v);
      let big = (typeof v === 'bigint') ? v : BigInt(v);
      assert(big <= 0xffffffffn, 'writeU32LEB: value too large: ' + v);
      do {
        let b = Number(big & 0x7fn);
        big >>= 7n;
        if (big !== 0n) {
          b |= 0x80;
        }
        this.writeU8(b);
      } while (big !== 0n);
      return this;
    }

    // Unsigned LEB128, no 32-bit limit (memory / table limits).
    writeU64LEB(v) {
      assert((typeof v === 'bigint') ||
        (Number.isInteger(v) && v >= 0), 'writeU64LEB: bad value ' + v);
      let big = (typeof v === 'bigint') ? v : BigInt(v);
      assert(big >= 0n, 'writeU64LEB: negative value ' + v);
      do {
        let b = Number(big & 0x7fn);
        big >>= 7n;
        if (big !== 0n) {
          b |= 0x80;
        }
        this.writeU8(b);
      } while (big !== 0n);
      return this;
    }

    // Signed LEB128 (32-bit value, range -2^31..2^31-1).
    writeS32LEB(v) {
      assert(Number.isInteger(v), 'writeS32LEB: not an integer: ' + v);
      assert(v >= -0x80000000 && v <= 0x7fffffff,
        'writeS32LEB: out of int32 range: ' + v);
      let val = v | 0;
      let more = true;
      while (more) {
        let b = val & 0x7f;
        val >>= 7;
        if ((val === 0 && (b & 0x40) === 0) ||
          (val === -1 && (b & 0x40) !== 0)) {
          more = false;
        } else {
          b |= 0x80;
        }
        this.writeU8(b);
      }
      return this;
    }

    // Signed LEB128 64-bit, accepts number or BigInt.
    writeS64LEB(v) {
      let big = (typeof v === 'bigint') ? v : BigInt(v);
      // i64.const holds a signed 64-bit value; reject anything outside it.
      assert(big >= -(1n << 63n) && big <= (1n << 63n) - 1n,
        'i64 value out of signed range: ' + v);
      let more = true;
      while (more) {
        let b = Number(big & 0x7fn);
        big >>= 7n;
        if ((big === 0n && (b & 0x40) === 0) ||
          (big === -1n && (b & 0x40) !== 0)) {
          more = false;
        } else {
          b |= 0x80;
        }
        this.writeU8(b);
      }
      return this;
    }

    writeBytes(arr) {
      if (typeof arr === 'string') {
        return this.writeString(arr);
      }
      for (let i = 0; i < arr.length; i++) {
        this.writeU8(arr[i]);
      }
      return this;
    }

    writeString(s) {
      let enc;
      if (typeof TextEncoder !== 'undefined') {
        enc = new TextEncoder().encode(String(s));
      } else {
        const u = unescape(encodeURIComponent(String(s)));
        enc = new Uint8Array(u.length);
        for (let i = 0; i < u.length; i++) {
          enc[i] = u.charCodeAt(i);
        }
      }
      this.writeU32LEB(enc.length);
      for (let i = 0; i < enc.length; i++) {
        this.writeU8(enc[i]);
      }
      return this;
    }

    writeVector(n, itemWriter) {
      assert(Number.isInteger(n) && n >= 0, 'writeVector: bad count ' + n);
      this.writeU32LEB(n);
      for (let i = 0; i < n; i++) {
        itemWriter(this, i);
      }
      return this;
    }

    // Write section id + size + content.
    writeSection(id, contentWriter) {
      const tmp = new Writer();
      contentWriter(tmp);
      this.writeU8(id);
      this.writeU32LEB(tmp.length);
      this.bytes_.push.apply(this.bytes_, tmp.bytes_);
      return this;
    }

    // Encode a value type: a name, a raw byte, or a typed-ref descriptor.
    writeValueType(t) {
      if (typeof t === 'number') {
        this.writeU8(t);
        return this;
      }
      if (typeof t === 'string') {
        assert(Object.prototype.hasOwnProperty.call(TYPE, t),
          'unknown value type "' + t + '"');
        this.writeU8(TYPE[t]);
        return this;
      }
      if (typeof t === 'object' && t !== null && t.ref !== undefined) {
        // Typed ref: 0x63 nullable / 0x64 non null plus heap type.
        this.writeU8(t.nullable === false ? REF_NONNULL : REF_NULLABLE);
        this.writeHeapType(t.ref);
        return this;
      }
      throw new WasmBuilderError('cannot encode value type: ' + JSON.stringify(t));
    }

    // Encode a heap type: a type index or an abstract heap type name.
    writeHeapType(ht) {
      if (typeof ht === 'number') {
        assert(Number.isInteger(ht) && ht >= 0,
          'heap type index must be >= 0');
        // Heap type indices are signed LEB128 (s33) in the binary format.
        this.writeS32LEB(ht);
        return this;
      }
      if (typeof ht === 'string') {
        const normalized = (ht === 'funcref') ? 'func' :
          (ht === 'externref') ? 'extern' :
            (ht === 'anyref') ? 'any' :
              (ht === 'eqref') ? 'eq' :
                (ht === 'i31ref') ? 'i31' :
                  (ht === 'structref') ? 'struct' :
                    (ht === 'arrayref') ? 'array' :
                      (ht === 'exnref') ? 'exn' : ht;
        assert(Object.prototype.hasOwnProperty.call(HEAP, normalized),
          'unknown heap type "' + ht + '"');
        // Abstract heap types are single byte SLEB128 (e.g.... funcref 0x70).
        this.writeU8(HEAP[normalized]);
        return this;
      }
      throw new WasmBuilderError('cannot encode heap type: ' + JSON.stringify(ht));
    }

    // Encode a block type: void, a value type, a type index, or {params, results}.
    writeBlockType(bt, typeIndexForObject) {
      if (bt === null || bt === undefined) {
        this.writeU8(BLOCK_VOID);
        return this;
      }
      if (typeof bt === 'string') {
        this.writeValueType(bt);
        return this;
      }
      if (typeof bt === 'number') {
        assert(Number.isInteger(bt) && bt >= 0,
          'block type index must be >= 0');
        // Block type indices are signed LEB128 (s33) in the binary format.
        this.writeS32LEB(bt);
        return this;
      }
      if (typeof bt === 'object' && typeof typeIndexForObject === 'number') {
        this.writeS32LEB(typeIndexForObject);
        return this;
      }
      throw new WasmBuilderError('cannot encode block type: ' + JSON.stringify(bt));
    }

    // Encode a limits block: {initial, maximum, shared, addressType}.
    writeLimits(limits, forMemory) {
      let flags = 0;
      if (limits.maximum !== undefined && limits.maximum !== null) {
        flags |= 0x01;
      }
      if (limits.shared) {
        assert(forMemory, 'tables cannot be shared');
        flags |= 0x02;
      }
      if (limits.addressType === 'i64' || limits.addressType === 'I64') {
        flags |= 0x04;
      }
      this.writeU8(flags);
      this.writeU64LEB(limits.initial);
      if (flags & 0x01) {
        this.writeU64LEB(limits.maximum);
      }
      return this;
    }

    writeF32(v) {
      f32View.setFloat32(0, v, true);
      for (let i = 0; i < 4; i++) {
        this.writeU8(f32View.getUint8(i));
      }
      return this;
    }

    writeF64(v) {
      f64View.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) {
        this.writeU8(f64View.getUint8(i));
      }
      return this;
    }
  }

  // Helpers

  // Handles double loading, `instanceof` breaks on redefinition, name still works.
  function isFunctionBuilder(v) {
    return v instanceof WasmFunctionBuilder ||
      (v !== null && typeof v === 'object' &&
        typeof v.constructor === 'function' &&
        v.constructor.name === 'WasmFunctionBuilder');
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
      !isFunctionBuilder(v);
  }

  // Turn a string/array of bytes into a Uint8Array.
  function toBytes(data) {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (typeof data === 'string') {
      const enc = (typeof TextEncoder !== 'undefined')
        ? new TextEncoder()
        : null;
      if (enc) {
        return enc.encode(data);
      }
      const u = unescape(encodeURIComponent(data));
      const out = new Uint8Array(u.length);
      for (let i = 0; i < u.length; i++) {
        out[i] = u.charCodeAt(i);
      }
      return out;
    }
    if (Array.isArray(data)) {
      return new Uint8Array(data);
    }
    throw new WasmBuilderError('cannot interpret data as bytes');
  }

  function isRefTypeName(t) {
    return typeof t === 'string' &&
      (Object.prototype.hasOwnProperty.call(TYPE, t) &&
        TYPE[t] >= 0x60 && TYPE[t] <= 0x7a &&
        t !== 'i8' && t !== 'i16') ||  // packed field types are not refs
      (t === 'nullfuncref' || t === 'nullexternref' ||
        t === 'nullanyref' || t === 'nullexnref');
  }

  // Lane count from the name (i8x16 -> 16) or from the byte size.
  function simdLaneCount(name, byteSize) {
    const m = /^v?[fi](\d+)x(\d+)/.exec(name);
    if (m) return Number(m[2]);
    if (byteSize) return 16 / byteSize;
    return 0;
  }

  // Instruction encoder. finalEnd appends the closing 0x0b if left out.
  // Reject wrong argument counts before encoding writes bad immediates.
  function expectArgCount_(name, args, min, max) {
    const want = (min === max)
      ? min + ' argument' + (min === 1 ? '' : 's')
      : min + '..' + max + ' arguments';
    assert(args.length >= min && args.length <= max,
      name + ': expected ' + want + ', got ' + args.length);
  }

  class InstrEncoder {
    constructor(builder) {
      this.builder_ = builder;
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      this.instrs_ = null;
    }

    errorInstruction_() {
      return this.curIndex_ >= 0 ? this.curInstr_ : undefined;
    }

    errorInstructionIndex_() {
      return this.curIndex_ >= 0 ? this.curIndex_ : undefined;
    }

    errorOccurrence_() {
      if (this.curIndex_ < 0 || !this.instrs_) return 0;
      return countPriorIdentical_(this.instrs_, this.curIndex_, this.curInstr_);
    }

    encode(instrs, ctx, options) {
      options = options || {};
      this.instrs_ = instrs;
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      const initialDepth = options.initialDepth === undefined ? 1 : options.initialDepth;
      const finalEnd = options.finalEnd === undefined ? true : options.finalEnd;
      const w = new Writer();
      const control = [];
      for (let i = 0; i < initialDepth; i++) {
        control.push('body');  // outermost frame
      }
      let terminated = false;

      for (let i = 0; i < instrs.length; i++) {
        const instr = instrs[i];
        const name = Array.isArray(instr) ? instr[0] : instr;
        const args = Array.isArray(instr) ? instr.slice(1) : [];
        this.curInstr_ = instr;
        this.curIndex_ = i;

        // Nothing may follow the outermost end.
        if (terminated) {
          throw new WasmBuilderError(
            'instruction appears after the outermost end');
        }

        // Track control flow structure.
        switch (name) {
          case 'block':
          case 'loop':
          case 'if':
          case 'try':
            control.push(name);
            break;
          case 'try_table':
            control.push('try_table');
            break;
          case 'else':
            assert(control.length > initialDepth && control[control.length - 1] === 'if',
              'else outside of an if block');
            break;
          case 'catch':
            assert(control.length > initialDepth &&
              (control[control.length - 1] === 'try' ||
                control[control.length - 1] === 'catch'),
              'catch outside of a try block');
            control[control.length - 1] = 'catch';
            break;
          case 'catch_all':
            assert(control.length > initialDepth &&
              (control[control.length - 1] === 'try' ||
                control[control.length - 1] === 'catch'),
              'catch_all outside of a try block');
            control[control.length - 1] = 'catch_all';
            break;
          case 'delegate':
            assert(control.length > initialDepth &&
              control[control.length - 1] === 'try',
              'delegate outside of a try block');
            // delegate terminates the inner try, like 'end'.
            control.pop();
            break;
          case 'end':
            if (control.length === initialDepth) {
            // This end closes the outermost frame.
            terminated = true;
              control.pop();
            } else {
              control.pop();
            }
            break;
          case 'br':
          case 'br_if':
          case 'br_on_null':
          case 'br_on_non_null': {
            const depth = args[0];
            assert(Number.isInteger(depth) && depth >= 0 &&
              depth < control.length,
              name + ' depth ' + depth + ' out of range (nesting ' +
              control.length + ')');
            break;
          }
          case 'rethrow': {
            const depth = args[0];
            assert(Number.isInteger(depth) && depth >= 0 &&
              depth < control.length,
              name + ' depth ' + depth + ' out of range (nesting ' +
              control.length + ')');
            // rethrow must target a catch handler, not an arbitrary label.
            const target = control[control.length - 1 - depth];
            assert(target === 'catch' || target === 'catch_all',
              name + ' depth ' + depth + ' does not target a catch block');
            break;
          }
          case 'br_table': {
            const depths = args[0];
            const def = args[1];
            assert(Array.isArray(depths), 'br_table: expected depths array');
            for (const d of depths) {
              assert(Number.isInteger(d) && d >= 0 && d < control.length,
                'br_table depth ' + d + ' out of range');
            }
            assert(Number.isInteger(def) && def >= 0 && def < control.length,
              'br_table default depth ' + def + ' out of range');
            break;
          }
          default:
            break;
        }

        this.encodeOne(name, args, ctx, w, control.length);
      }

      if (terminated) {
        assert(control.length === initialDepth - 1,
          'unbalanced end in instruction list');
      } else {
        assert(control.length === initialDepth,
          'unbalanced blocks: ' + (control.length - initialDepth) +
          ' unclosed block(s)');
        if (finalEnd) {
          w.writeU8(OP.End);
        }
      }
      return w;
    }

    encodeOne(name, args, ctx, w, controlDepth) {
      // control flow
      if (name === 'unreachable') {
        w.writeU8(OP.Unreachable);
        return;
      }
      if (name === 'nop') {
        w.writeU8(OP.Nop);
        return;
      }
      if (name === 'block' || name === 'loop' || name === 'if') {
        w.writeU8(name === 'block' ? OP.Block : name === 'loop' ? OP.Loop : OP.If);
        this.writeBlockTypeArg(args, ctx, w);
        return;
      }
      if (name === 'try') {
        w.writeU8(OP.Try);
        this.writeBlockTypeArg(args, ctx, w);
        return;
      }
      if (name === 'try_table') {
        w.writeU8(OP.TryTable);
        this.writeBlockTypeArg([args[0]], ctx, w);
        const catches = args[1];
        assert(Array.isArray(catches), 'try_table: expected catches array');
        w.writeVector(catches.length, (ww, i) => {
          const c = catches[i];
          assert(Array.isArray(c) && c.length >= 2,
            'try_table: malformed catch clause');
          // c = [tagRef | "all", depth, captureExnRef?]
          const isAll = (c[0] === 'all' || c[0] === 'catch_all');
          const capture = c[2] === true;
          let flags = 0;
          if (capture) {
            flags |= 0x01;
          }
          if (isAll) {
            flags |= 0x02;
          }
          ww.writeU8(flags);
          if (!isAll) {
            assert(c[0] !== undefined && c[0] !== null,
              'try_table: missing tag reference');
            ww.writeU32LEB(ctx.resolveTag(c[0]));
          }
          // Catch depths count frames outside the try_table itself.
          assert(Number.isInteger(c[1]) && c[1] >= 0 &&
            c[1] < controlDepth - 1,
            'try_table: catch depth ' + c[1] + ' exceeds nesting ' +
            (controlDepth - 1));
          ww.writeU32LEB(c[1]);
        });
        return;
      }
      if (name === 'else') {
        w.writeU8(OP.Else);
        return;
      }
      if (name === 'end') {
        w.writeU8(OP.End);
        return;
      }
      if (name === 'br') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.Br);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'br_if') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.BrIf);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'br_table') {
        w.writeU8(OP.BrTable);
        const depths = args[0];
        w.writeU32LEB(depths.length);
        for (const d of depths) {
          w.writeU32LEB(d);
        }
        w.writeU32LEB(args[1]);
        return;
      }
      if (name === 'return') {
        w.writeU8(OP.Return);
        return;
      }

      // exceptions
      if (name === 'throw') {
        w.writeU8(OP.Throw);
        w.writeU32LEB(ctx.resolveTag(args[0]));
        return;
      }
      if (name === 'rethrow') {
        w.writeU8(OP.Rethrow);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'throw_ref') {
        w.writeU8(OP.ThrowRef);
        return;
      }
      if (name === 'catch') {
        w.writeU8(OP.Catch);
        w.writeU32LEB(ctx.resolveTag(args[0]));
        return;
      }
      if (name === 'catch_all') {
        w.writeU8(OP.CatchAll);
        return;
      }
      if (name === 'delegate') {
        w.writeU8(OP.Delegate);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'drop') {
        w.writeU8(OP.Drop);
        return;
      }
      if (name === 'select') {
        if (args.length > 0 && Array.isArray(args[0])) {
          // Typed form: ["select", [types...]], same as select_t.
          w.writeU8(OP.SelectTyped);
          const types = args[0];
          assert(Array.isArray(types) && types.length > 0, 'select: expected type list');
          w.writeVector(types.length, (ww, i) => ww.writeValueType(types[i]));
        } else {
          w.writeU8(OP.SelectNumeric);
        }
        return;
      }
      if (name === 'select_t' || name === 'select.typed' || name === 'select_t_') {
        w.writeU8(OP.SelectTyped);
        const types = args[0];
        assert(Array.isArray(types) && types.length > 0, 'select: expected type list');
        w.writeVector(types.length, (ww, i) => ww.writeValueType(types[i]));
        return;
      }

      // locals
      if (name === 'local.get') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.LocalGet);
        w.writeU32LEB(ctx.resolveLocal(args[0]));
        return;
      }
      if (name === 'local.set') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.LocalSet);
        w.writeU32LEB(ctx.resolveLocal(args[0]));
        return;
      }
      if (name === 'local.tee') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.LocalTee);
        w.writeU32LEB(ctx.resolveLocal(args[0]));
        return;
      }

      // globals
      if (name === 'global.get') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.GlobalGet);
        w.writeU32LEB(ctx.resolveGlobal(args[0]));
        return;
      }
      if (name === 'global.set') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.GlobalSet);
        w.writeU32LEB(ctx.resolveGlobal(args[0]));
        return;
      }

      // constants
      if (name === 'i32.const') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.I32Const);
        w.writeS32LEB(args[0]);
        return;
      }
      if (name === 'i64.const') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.I64Const);
        w.writeS64LEB(args[0]);
        return;
      }
      if (name === 'f32.const') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.F32Const);
        w.writeF32(args[0]);
        return;
      }
      if (name === 'f64.const') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.F64Const);
        w.writeF64(args[0]);
        return;
      }

      // reference ops
      if (name === 'ref.null') {
        w.writeU8(OP.RefNull);
        w.writeHeapType(args[0]);
        return;
      }
      if (name === 'ref.is_null') {
        w.writeU8(OP.RefIsNull);
        return;
      }
      if (name === 'ref.func') {
        w.writeU8(OP.RefFunc);
        w.writeU32LEB(ctx.resolveFunc(args[0]));
        return;
      }
      if (name === 'ref.as_non_null') {
        w.writeU8(OP.RefAsNonNull);
        return;
      }
      if (name === 'br_on_null') {
        w.writeU8(OP.BrOnNull);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'br_on_non_null') {
        w.writeU8(OP.BrOnNonNull);
        w.writeU32LEB(args[0]);
        return;
      }
      if (name === 'ref.eq') {
        w.writeU8(OP.RefEq);
        return;
      }

      // calls
      if (name === 'call') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.Call);
        w.writeU32LEB(ctx.resolveFunc(args[0]));
        return;
      }
      if (name === 'call_indirect') {
        w.writeU8(OP.CallIndirect);
        w.writeU32LEB(ctx.resolveType(args[0]));
        w.writeU32LEB(args.length > 1 ? ctx.resolveTable(args[1]) : 0);
        return;
      }
      if (name === 'return_call') {
        expectArgCount_(name, args, 1, 1);
        w.writeU8(OP.ReturnCall);
        w.writeU32LEB(ctx.resolveFunc(args[0]));
        return;
      }
      if (name === 'return_call_indirect') {
        w.writeU8(OP.ReturnCallIndirect);
        w.writeU32LEB(ctx.resolveType(args[0]));
        w.writeU32LEB(args.length > 1 ? ctx.resolveTable(args[1]) : 0);
        return;
      }
      if (name === 'call_ref') {
        w.writeU8(OP.CallRef);
        w.writeU32LEB(ctx.resolveType(args[0]));
        return;
      }
      if (name === 'return_call_ref') {
        w.writeU8(OP.ReturnCallRef);
        w.writeU32LEB(ctx.resolveType(args[0]));
        return;
      }

      // memory load/store
      if (Object.prototype.hasOwnProperty.call(LOAD_STORE, name)) {
        ctx.requireMemory();
        const info = LOAD_STORE[name];
        w.writeU8(info.op);
        const memIndex = this.memArgIndex_(args);
        this.writeMemArg(args, info.size, w, false,
          ctx.memoryAddressType(memIndex));
        return;
      }

      // memory size/grow
      if (name === 'memory.size') {
        ctx.requireMemory();
        w.writeU8(OP.MemorySize);
        w.writeU32LEB(args.length > 0 ? ctx.resolveMemory(args[0]) : 0);
        return;
      }
      if (name === 'memory.grow') {
        ctx.requireMemory();
        w.writeU8(OP.MemoryGrow);
        w.writeU32LEB(args.length > 0 ? ctx.resolveMemory(args[0]) : 0);
        return;
      }

      // misc prefix (0xfc)
      if (Object.prototype.hasOwnProperty.call(MISC, name)) {
        const op = MISC[name];
        w.writeU8(OP.MiscPrefix);
        w.writeU32LEB(op);
        switch (name) {
          case 'memory.init':
            ctx.requireMemory();
            w.writeU32LEB(ctx.resolveData(args[0]));
            w.writeU32LEB(args.length > 1 ? ctx.resolveMemory(args[1]) : 0);
            break;
          case 'data.drop':
            w.writeU32LEB(ctx.resolveData(args[0]));
            break;
          case 'memory.copy':
            ctx.requireMemory();
            w.writeU32LEB(args.length > 0 ? ctx.resolveMemory(args[0]) : 0);
            w.writeU32LEB(args.length > 1 ? ctx.resolveMemory(args[1]) : 0);
            break;
          case 'memory.fill':
            ctx.requireMemory();
            w.writeU32LEB(args.length > 0 ? ctx.resolveMemory(args[0]) : 0);
            break;
          case 'memory.discard':
            ctx.requireMemory();
            w.writeU32LEB(args.length > 0 ? ctx.resolveMemory(args[0]) : 0);
            break;
          case 'table.init':
            ctx.requireTable();
            w.writeU32LEB(ctx.resolveElem(args[0]));
            w.writeU32LEB(args.length > 1 ? ctx.resolveTable(args[1]) : 0);
            break;
          case 'elem.drop':
            w.writeU32LEB(ctx.resolveElem(args[0]));
            break;
          case 'table.copy':
            ctx.requireTable();
            w.writeU32LEB(args.length > 0 ? ctx.resolveTable(args[0]) : 0);
            w.writeU32LEB(args.length > 1 ? ctx.resolveTable(args[1]) : 0);
            break;
          case 'table.grow':
          case 'table.size':
          case 'table.fill':
            ctx.requireTable();
            w.writeU32LEB(ctx.resolveTable(args[0]));
            break;
          default:
            // Saturating truncations take no operands.
            break;
        }
        return;
      }

      // table.get / table.set
      if (name === 'table.get') {
        ctx.requireTable();
        w.writeU8(OP.TableGet);
        w.writeU32LEB(ctx.resolveTable(args[0]));
        return;
      }
      if (name === 'table.set') {
        ctx.requireTable();
        w.writeU8(OP.TableSet);
        w.writeU32LEB(ctx.resolveTable(args[0]));
        return;
      }

      // atomics (0xfe)
      if (name === 'memory.atomic.notify') {
        ctx.requireMemory();
        w.writeU8(OP.ThreadPrefix);
        w.writeU32LEB(0x00);
        const mi = this.memArgIndex_(args);
        this.writeMemArg(args, 4, w, true, ctx.memoryAddressType(mi));
        return;
      }
      if (name === 'memory.atomic.wait32' || name === 'memory.atomic.wait64') {
        ctx.requireMemory();
        w.writeU8(OP.ThreadPrefix);
        w.writeU32LEB(name === 'memory.atomic.wait32' ? 0x01 : 0x02);
        const mi = this.memArgIndex_(args);
        this.writeMemArg(args, name === 'memory.atomic.wait32' ? 4 : 8, w, true,
          ctx.memoryAddressType(mi));
        return;
      }
      if (name === 'memory.atomic.fence') {
        w.writeU8(OP.ThreadPrefix);
        w.writeU32LEB(0x03);
        w.writeU8(0x00);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(THREAD_LOAD, name)) {
        ctx.requireMemory();
        w.writeU8(OP.ThreadPrefix);
        w.writeU32LEB(THREAD_LOAD[name]);
        const size = name.includes('8') ? 1 : name.includes('16') ? 2 :
          name.includes('32') ? 4 : (name.includes('i64') ? 8 : 4);
        const mi = this.memArgIndex_(args);
        this.writeMemArg(args, size, w, true, ctx.memoryAddressType(mi));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(THREAD_STORE, name)) {
        ctx.requireMemory();
        w.writeU8(OP.ThreadPrefix);
        w.writeU32LEB(THREAD_STORE[name]);
        const size = name.includes('8') ? 1 : name.includes('16') ? 2 :
          name.includes('32') ? 4 : (name.includes('i64') ? 8 : 4);
        const mi = this.memArgIndex_(args);
        this.writeMemArg(args, size, w, true, ctx.memoryAddressType(mi));
        return;
      }
      for (const rmw of THREAD_RMW) {
        const prefix = 'i32.atomic.' + rmw.name;
        const i64prefix = 'i64.atomic.' + rmw.name;
        if (name === prefix || name.startsWith(prefix + '8') ||
          name.startsWith(prefix + '16') || name === i64prefix ||
          name.startsWith(i64prefix + '8') || name.startsWith(i64prefix + '16') ||
          name.startsWith(i64prefix + '32')) {
          ctx.requireMemory();
          // Determine which width variant this is.
          let variant = -1;
          for (let i = 0; i < THREAD_RMW_WIDTHS.length; i++) {
            const canon = rmw.name + '_' + THREAD_RMW_WIDTHS[i];
            const canonicalNames = [];
            const widths = THREAD_RMW_WIDTHS[i];
            if (widths === 'i32') {
              canonicalNames.push('i32.atomic.' + rmw.name);
            } else if (widths === 'i64') {
              canonicalNames.push('i64.atomic.' + rmw.name);
            } else if (widths === 'i32_8u') {
              canonicalNames.push('i32.atomic.' + rmw.name + '8_u');
            } else if (widths === 'i32_16u') {
              canonicalNames.push('i32.atomic.' + rmw.name + '16_u');
            } else if (widths === 'i64_8u') {
              canonicalNames.push('i64.atomic.' + rmw.name + '8_u');
            } else if (widths === 'i64_16u') {
              canonicalNames.push('i64.atomic.' + rmw.name + '16_u');
            } else if (widths === 'i64_32u') {
              canonicalNames.push('i64.atomic.' + rmw.name + '32_u');
            }
            if (canonicalNames.includes(name)) {
              variant = i;
              break;
            }
          }
          if (variant < 0) {
            continue;  // not an atomic rmw we handle
          }
          w.writeU8(OP.ThreadPrefix);
          w.writeU32LEB(rmw.base + variant);
          const size = THREAD_RMW_ATOMICITY[THREAD_RMW_WIDTHS[variant]];
          const mi = this.memArgIndex_(args);
          this.writeMemArg(args, size, w, true, ctx.memoryAddressType(mi));
          return;
        }
      }

      // single-byte numeric ops
      if (Object.prototype.hasOwnProperty.call(UNARY_BYTE, name)) {
        w.writeU8(UNARY_BYTE[name]);
        return;
      }

      // SIMD (0xfd prefix)
      if (Object.prototype.hasOwnProperty.call(SIMD, name)) {
        const [op, shape, spec] = SIMD[name];
        w.writeU8(OP.SimdPrefix);
        w.writeU32LEB(op);
        switch (shape) {
          case 'L':
          case 'S': {
            ctx.requireMemory();
            const size = spec;
            const memIndex = this.memArgIndex_(args);
            this.writeMemArg(args, size, w, false,
              ctx.memoryAddressType(memIndex));
            break;
          }
          case 'LL':
          case 'LS': {
            ctx.requireMemory();
            const size = spec;
            // Lane mem ops: ["v128.load8_lane", [offset, align], lane].
            const lane = args[args.length - 1];
            const memArgs = args.slice(0, -1);
            const memIndex = this.memArgIndex_(memArgs);
            this.writeMemArg(memArgs, size, w, false,
              ctx.memoryAddressType(memIndex));
            assert(Number.isInteger(lane) && lane >= 0 && lane < 16 / size,
              name + ': lane index ' + lane + ' out of range (0..' +
              (16 / size - 1) + ')');
            w.writeU8(lane);
            break;
          }
          case 'C':
            // v128.const: raw payload or [laneType, laneValues].
            if (args.length >= 2 && typeof args[0] === 'string' &&
              Array.isArray(args[1])) {
              this.writeV128Bytes_(args, w);
            } else {
              this.writeV128Bytes_(args[0], w);
            }
            break;
          case 'SH':
            this.writeLaneIndices_(args[0], w, 16);
            break;
          case 'EX':
          case 'RP': {
            // Extract/replace lane: write lane index as a U8.
            assert(args.length >= 1, 'extract_lane/replace_lane needs a lane index');
            const lanes = simdLaneCount(name, undefined);
            assert(lanes === 0 || (Number.isInteger(args[0]) &&
              args[0] >= 0 && args[0] < lanes),
              name + ': lane index ' + args[0] + ' out of range (0..' +
              (lanes - 1) + ')');
            w.writeU8(args[0]);
            break;
          }
          default:
            // No immediates for splat/unary/binary/etc.
            break;
        }
        return;
      }

      // GC (0xfb prefix)
      if (Object.prototype.hasOwnProperty.call(GC, name)) {
        const [op, shape] = GC[name];
        w.writeU8(OP.GcPrefix);
        w.writeU32LEB(op);
        switch (shape) {
          case 'snew':
          case 'snewdef':
          case 'anew':
          case 'anewdef':
            w.writeU32LEB(ctx.resolveType(args[0]));
            break;
          case 'alen':
            // array.len has no immediate.
            break;
          case 'sget':
          case 'sget_su':
          case 'sset':
            w.writeU32LEB(ctx.resolveType(args[0]));
            w.writeU32LEB(args[1]);
            break;
          case 'anewfixed':
            w.writeU32LEB(ctx.resolveType(args[0]));
            w.writeU32LEB(args[1]);
            break;
          case 'anewseg':
          case 'aseginit': {
            w.writeU32LEB(ctx.resolveType(args[0]));
            const segRef = args[1];
            if (shape === 'anewseg') {
              w.writeU32LEB(segRef);
            } else {
              w.writeU32LEB(segRef);
            }
            break;
          }
          case 'aget':
          case 'aget_su':
          case 'aset':
          case 'afill':
            w.writeU32LEB(ctx.resolveType(args[0]));
            break;
          case 'acopy':
            w.writeU32LEB(ctx.resolveType(args[0]));
            w.writeU32LEB(ctx.resolveType(args[1]));
            break;
          case 'rtest':
          case 'rcast':
            this.writeHeapTypeArg_(args[0], w);
            break;
          case 'rbrancast':
            this.writeBrOnCast_(args, w, ctx);
            break;
          default:
            // rconvert / ri31 / i31get carry no immediates.
            break;
        }
        return;
      }

      throw new WasmBuilderError('unknown instruction "' + name + '"');
    }

    // Write the 16 bytes of a v128.const lane payload. Accepts:
    //   a lane-type name + array of lane values, e.g. ['i32x4', [1,2,3,4]]
    //   a 32-hex-digit string
    //   a BigInt (little-endian)
    //   an array of 16 byte values
    writeV128Bytes_(v, w) {
      // Lane type form: [laneType, laneValues].
      if (Array.isArray(v) && v.length === 2 &&
        typeof v[0] === 'string' && Array.isArray(v[1])) {
        const laneType = v[0];
        const vals = v[1];
        const writeLE = (n, bytes) => {
          for (let i = 0; i < bytes; i++) {
            w.writeU8(Number(BigInt.asUintN(bytes * 8, BigInt(n)) >> BigInt(i * 8)) & 0xff);
          }
        };
        switch (laneType) {
          case 'i8x16':
            assert(vals.length === 16, 'i8x16.const expects 16 lanes');
            for (const x of vals) writeLE(x, 1);
            break;
          case 'i16x8':
            assert(vals.length === 8, 'i16x8.const expects 8 lanes');
            for (const x of vals) writeLE(x, 2);
            break;
          case 'i32x4':
            assert(vals.length === 4, 'i32x4.const expects 4 lanes');
            for (const x of vals) writeLE(x, 4);
            break;
          case 'i64x2':
            assert(vals.length === 2, 'i64x2.const expects 2 lanes');
            for (const x of vals) writeLE(x, 8);
            break;
          case 'f32x4':
            assert(vals.length === 4, 'f32x4.const expects 4 lanes');
            for (const x of vals) {
              f32View.setFloat32(0, x, true);
              for (let i = 0; i < 4; i++) w.writeU8(f32View.getUint8(i));
            }
            break;
          case 'f64x2':
            assert(vals.length === 2, 'f64x2.const expects 2 lanes');
            for (const x of vals) {
              f64View.setFloat64(0, x, true);
              for (let i = 0; i < 8; i++) w.writeU8(f64View.getUint8(i));
            }
            break;
          default:
            throw new WasmBuilderError('unknown v128 lane type "' + laneType + '"');
        }
        return;
      }
      if (typeof v === 'bigint') {
        let x = v;
        for (let i = 0; i < 16; i++) {
          w.writeU8(Number(x & 0xffn));
          x >>= 8n;
        }
        return;
      }
      if (typeof v === 'string') {
        assert(/^[0-9a-fA-F]{32}$/.test(v),
          'v128.const expects a 32-hex-digit string, got "' + v + '"');
        for (let i = 0; i < 32; i += 2) {
          w.writeU8(parseInt(v.substr(i, 2), 16));
        }
        return;
      }
      assert(Array.isArray(v) && v.length === 16, 'v128.const expects 16 bytes');
      for (let i = 0; i < 16; i++) {
        assert(Number.isInteger(v[i]) && v[i] >= 0 && v[i] < 256, 'bad v128 byte');
        w.writeU8(v[i]);
      }
    }

    // Write the lane indices of i8x16.shuffle (16 bytes, each 0..31).
    writeLaneIndices_(v, w, count) {
      assert(Array.isArray(v) && v.length === count, 'shuffle expects ' + count + ' lanes');
      for (let i = 0; i < count; i++) {
        assert(Number.isInteger(v[i]) && v[i] >= 0 && v[i] < 32, 'bad shuffle lane');
        w.writeU8(v[i]);
      }
    }

    // Heap type immediate for ref.test / ref.cast / br_on_cast.
    // Type indices are SLEB128; names are single-byte (writeHeapType).
    writeHeapTypeArg_(ht, w) {
      if (typeof ht === 'number') {
        assert(Number.isInteger(ht) && ht >= 0, 'heap type index must be >= 0');
        w.writeS32LEB(ht);
        return;
      }
      if (typeof ht === 'string') {
        w.writeHeapType(ht);
        return;
      }
      if (isPlainObject(ht) && ht.ref !== undefined) {
        w.writeHeapType(ht.ref);
        return;
      }
      throw new WasmBuilderError('cannot encode heap type immediate: ' + JSON.stringify(ht));
    }

    // br_on_cast: [flags, depth, srcType, dstType].
    writeBrOnCast_(args, w, ctx) {
      const flags = args[0];
      assert(Number.isInteger(flags) && flags >= 0 && flags <= 3,
        'br_on_cast flags must be 0..3');
      w.writeU8(flags);
      w.writeU32LEB(ctx.resolveDepth ? ctx.resolveDepth(args[1]) : args[1]);
      this.writeHeapTypeArg_(args[2], w);
      this.writeHeapTypeArg_(args[3], w);
    }

    // Memory index from memarg args: [offset], [offset, align], ... , memIndex.
    memArgIndex_(args) {
      if (args.length === 0) {
        return 0;
      }
      if (Array.isArray(args[0])) {
        return args[0].length > 2 ? args[0][2] : 0;
      }
      return args.length > 2 ? args[2] : 0;
    }

    // Memarg: flags (align log2, bit 6 = memory index), index, offset.
    // Atomic ops must use natural alignment.
    writeMemArg(args, size, w, atomic, addrType) {
      let offset = 0;
      let align = size;
      addrType = addrType === 'i64' ? 'i64' : 'i32';
      if (args.length > 0 && args[0] !== undefined) {
        if (Array.isArray(args[0])) {
          offset = args[0][0];
          align = args[0].length > 1 ? args[0][1] : size;
        } else if (typeof args[0] === 'number' || typeof args[0] === 'bigint') {
          offset = args[0];
        }
      }
      if (args.length > 1 && typeof args[1] === 'number' && !Array.isArray(args[0])) {
        align = args[1];
      }
      if (addrType === 'i64') {
        assert((typeof offset === 'bigint' && offset >= 0n) ||
          (Number.isSafeInteger(offset) && offset >= 0),
          'memarg: bad i64 offset');
      } else {
        assert(Number.isInteger(offset) && offset >= 0 &&
          offset <= 0xffffffff, 'memarg: bad i32 offset');
      }
      assert(Number.isInteger(align) && align > 0 &&
        (align & (align - 1)) === 0, 'memarg: align must be a power of two');
      if (atomic) {
        assert(align === size,
          'atomic memarg align must equal access size (' + size + '), got ' + align);
      } else {
        assert(align <= size,
          'memarg align ' + align + ' exceeds natural alignment ' + size);
      }
      const memIndex = this.builder_.resolveMemory(this.memArgIndex_(args));
      let flags = Math.log2(align);
      if (memIndex !== 0 || this.builder_.numMemories() > 1) {
        flags |= 0x40;
      }
      w.writeU32LEB(flags);
      if (flags & 0x40) {
        w.writeU32LEB(memIndex);
      }
      if (addrType === 'i64') {
        w.writeU64LEB(offset);
      } else {
        w.writeU32LEB(offset);
      }
    }

    writeBlockTypeArg(args, ctx, w) {
      const bt = args[0];
      if (bt !== null && bt !== undefined && typeof bt === 'object') {
        const idx = ctx.ensureFuncType(bt);
        w.writeBlockType(bt, idx);
      } else {
        w.writeBlockType(bt, undefined);
      }
    }
  }

  // Stack type checker. Checks operand stack types before the engine does.
  // Strict on scalars, lenient on refs (accepts subtypes).
  const BOTTOM = 'bottom';

  function typesMatch(actual, expected, builder) {
    if (actual === BOTTOM || expected === BOTTOM) return true;
    if (actual === expected) return true;

    // Ref subtype checks.
    const a = typeof actual === 'string' ? actual : null;
    const e = typeof expected === 'string' ? expected : null;
    if (a && e && a.startsWith('null') && !e.startsWith('null')) {
      // nullfuncref <: funcref, etc.
      return e === a.slice(4) || e === a.slice(4).replace('null', '') ||
        e === a.slice(4, -4) + 'ref';
    }
    if (a && e) {
      // ref hierarchy: structref/arrayref/i31ref <: eqref <: anyref.
      const base = a.replace('null', '');
      const refBase = (base.endsWith('ref') ? base : base + 'ref');
      if (refBase === 'structref' || refBase === 'arrayref' || refBase === 'i31ref') {
        if (e === 'eqref' || e === 'anyref' || e === refBase) return true;
      }
      if (refBase === 'eqref' && e === 'anyref') return true;
      if (refBase === 'nullanyref' && e === 'anyref') return true;
      if (a === 'nulleqref' && (e === 'eqref' || e === 'anyref')) return true;
      if (a === 'nullstructref' && (e === 'structref' || e === 'eqref' || e === 'anyref')) return true;
      if (a === 'nullarrayref' && (e === 'arrayref' || e === 'eqref' || e === 'anyref')) return true;
      if (a === 'nulli31ref' && (e === 'i31ref' || e === 'eqref' || e === 'anyref')) return true;
    }

    // Typed ref {ref, nullable} <: abstract ref.
    if (isPlainObject(actual) && typeof expected === 'string') {
      const heap = actual.ref;
      if (typeof heap === 'string') {
        if (heap === 'any' && expected === 'anyref') return true;
        if (heap === 'eq' && (expected === 'eqref' || expected === 'anyref')) return true;
        // funcref/externref/exnref are top types, not subtypes of anyref.
        if (heap === 'func' && expected === 'funcref') return true;
        if (heap === 'extern' && expected === 'externref') return true;
        if (heap === 'exn' && expected === 'exnref') return true;
        if ((heap === 'struct' || heap === 'i31' || heap === 'array') &&
          (expected === 'eqref' || expected === 'anyref' || expected === heap + 'ref')) return true;
      }
      if (typeof heap === 'number') {
        // The referenced type's kind decides which abstract refs it matches.
        const t = builder ? builder.types_[heap] : null;
        if (t && t.kind === 'func') {
          if (expected === 'funcref') return true;
        } else if (t && (t.kind === 'struct' || t.kind === 'array')) {
          if (expected === 'anyref' || expected === 'eqref' ||
            expected === 'structref' || expected === 'arrayref') return true;
        } else if (expected === 'anyref') {
          return true;  // Unknown kind: only the top type matches.
        }
      }
    }
    if (isPlainObject(actual) && isPlainObject(expected)) {
      // Same heap target, or actual is a subtype via the supertype chain.
      // Nullable refs do not match non-nullable slots.
      if (actual.ref === expected.ref) {
        // Omitted nullable means nullable (matches writeValueType).
        const expectedNullable = expected.nullable !== false;
        const actualNullable = actual.nullable !== false;
        return expectedNullable || !actualNullable;
      }
      if (builder && typeof actual.ref === 'number' &&
        typeof expected.ref === 'number') {
        let t = builder.types_[actual.ref];
        while (t && t.supertype !== undefined && t.supertype !== null) {
          const st = (typeof t.supertype === 'number') ? t.supertype : null;
          if (st === expected.ref) {
            const expectedNullable = expected.nullable !== false;
            const actualNullable = actual.nullable !== false;
            return expectedNullable || !actualNullable;
          }
          t = st !== null ? builder.types_[st] : null;
        }
      }
      return false;
    }
    return false;
  }

  class StackTypeChecker {
    constructor(builder) {
      this.builder_ = builder;
      this.err_ = null;
    }

    check(fnBuilder, instrs) {
      this.fn_ = fnBuilder;
      this.err_ = null;
      this.errInstr_ = undefined;
      this.errIndex_ = -1;
      this.errOccurrence_ = 0;
      this.terminated_ = false;
      // Value stack: array of types or BOTTOM markers.
      this.stack_ = [];
      // Control stack: {kind, labelTypes, endTypes, blockParams, hasElse,
      // height, unreachable}. The function frame's label types are
      // the function's result types, so an explicit terminating 'end'
      // verifies them like any other block.
      const funcType = this.builder_.funcType_(this.fn_ ? this.fn_.typeIndex_ : 0);
      const results = funcType ? funcType.results.slice() : [];
      this.control_ = [{
        kind: 'func',
        labelTypes: results,
        endTypes: results,
        blockParams: [],
        hasElse: false,
        height: 0,
        unreachable: false,
      }];
      // Load local types: params first, then declared locals.
      this.localTypes_ = [];
      const params = this.fn_ ? this.builder_.funcTypeParams_(this.fn_) : [];
      for (const p of params) this.localTypes_.push(p);
      if (this.fn_) {
        for (const loc of this.fn_.locals_) this.localTypes_.push(loc.type);
      }

      this.instrs_ = instrs;
      for (let i = 0; i < instrs.length; i++) {
        if (this.err_) break;
        const instr = instrs[i];
        const name = Array.isArray(instr) ? instr[0] : instr;
        const args = Array.isArray(instr) ? instr.slice(1) : [];
        this.curInstr_ = instr;
        this.curIndex_ = i;
        this.checkOne_(name, args);
      }
      // End-of-function checks are not tied to one instruction.
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      if (!this.err_) {
        const funcType = this.builder_.funcType_(this.fn_ ? this.fn_.typeIndex_ : 0);
        const results = funcType ? funcType.results : [];
        if (this.control_.length <= 1) {
          // Verify the function's results and that nothing is left over.
          for (let i = results.length - 1; i >= 0; i--) {
            this.popExpected_(results[i]);
          }
          if (this.stack_.length !== 0) {
            this.error_(this.stack_.length + ' value(s) left on the stack at end of function');
          }
        } else {
          this.error_((this.control_.length - 1) + ' unclosed block(s)');
        }
      }
      return this.err_ === null;
    }

    errorMessage() {
      return this.err_ ? this.err_.message : null;
    }

    error_(msg) {
      if (!this.err_) {
        this.err_ = new WasmBuilderError('type error: ' + msg);
        // Remember the instruction being checked when the error fired.
        if (this.curIndex_ !== undefined && this.curIndex_ >= 0) {
          this.errInstr_ = this.curInstr_;
          this.errIndex_ = this.curIndex_;
          this.errOccurrence_ =
            countPriorIdentical_(this.instrs_, this.curIndex_, this.curInstr_);
        }
      }
    }

    errorInstruction_() {
      return this.errInstr_;
    }

    errorInstructionIndex_() {
      return this.errIndex_ >= 0 ? this.errIndex_ : undefined;
    }

    errorOccurrence_() {
      return this.errOccurrence_ || 0;
    }

    push_(t) {
      this.stack_.push(t);
    }

    pop_() {
      if (this.stack_.length > 0) {
        return this.stack_.pop();
      }
      // Check if the current frame is polymorphic (unreachable).
      const frame = this.control_[this.control_.length - 1];
      if (frame.unreachable) {
        return BOTTOM;
      }
      this.error_('not enough values on the stack');
      return BOTTOM;
    }

    popExpected_(expected) {
      const actual = this.pop_();
      if (!typesMatch(actual, expected, this.builder_)) {
        this.error_('expected type ' + this.typeName_(expected) +
          ', got ' + this.typeName_(actual));
      }
      return actual;
    }

    // Human-readable name of a checker type for error messages.
    typeName_(t) {
      if (typeof t === 'string') return t;
      if (t === BOTTOM) return 'bottom';
      return JSON.stringify(t);
    }

    popN_(types) {
      const result = [];
      for (let i = types.length - 1; i >= 0; i--) {
        result.unshift(this.popExpected_(types[i]));
      }
      return result;
    }

    // Resolve a block type (the first arg of block/loop/if).
    resolveBlockType_(bt) {
      if (bt === null || bt === undefined) return { params: [], results: [] };
      if (typeof bt === 'string') return { params: [], results: [bt] };
      if (typeof bt === 'number') {
        const tt = this.builder_.types_[bt];
        if (tt) return { params: tt.params || [], results: tt.results || [] };
        this.error_('block type index ' + bt + ' out of range (' +
          this.builder_.types_.length + ' types)');
        return { params: [], results: [] };
      }
      if (isPlainObject(bt) && bt.params) {
        return { params: bt.params, results: bt.results };
      }
      this.error_('cannot resolve block type ' + JSON.stringify(bt));
      return { params: [], results: [] };
    }

    // Check if we are in an unreachable (polymorphic) stack state.
    isUnreachable_() {
      for (let i = this.control_.length - 1; i >= 0; i--) {
        if (this.control_[i].unreachable) return true;
      }
      return false;
    }

    checkOne_(name, args) {
      // Nothing may follow the function's terminating end.
      if (this.terminated_) {
        this.error_('instruction appears after the outermost end');
        return;
      }
      // Fixed-arity immediates: reject wrong argument counts up front so
      // bad inputs fail here with attribution, not in the encoder.
      const fixedOne = ['local.get', 'local.set', 'local.tee',
        'global.get', 'global.set',
        'i32.const', 'i64.const', 'f32.const', 'f64.const',
        'br', 'br_if', 'call', 'return_call', 'ref.func',
        'throw', 'rethrow', 'delegate'];
      if (fixedOne.indexOf(name) >= 0 && args.length !== 1) {
        this.error_(name + ': expected 1 argument, got ' + args.length);
        return;
      }
      // control flow
      if (name === 'unreachable') {
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'nop') return;
      if (name === 'block' || name === 'loop' || name === 'if') {
        const bt = this.resolveBlockType_(args[0]);
        if (name === 'if') {
          // The condition sits on top of any block parameters.
          this.popExpected_('i32');
        }
        // Consume the block's parameters; frame height is the stack below them.
        this.popN_(bt.params);
        this.control_.push({
          kind: name,
          // Branches target results; loops target their parameters.
          labelTypes: name === 'loop' ? bt.params : bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        // Re-push the parameters as the block body's initial stack.
        for (const p of bt.params) this.push_(p);
        return;
      }
      if (name === 'else') {
        const frame = this.control_[this.control_.length - 1];
        if (frame.kind !== 'if') {
          this.error_('else outside of if');
          return;
        }
        frame.hasElse = true;
        if (!frame.unreachable) {
          // The then-branch must leave the if's results on the stack.
          for (let i = frame.endTypes.length - 1; i >= 0; i--) {
            this.popExpected_(frame.endTypes[i]);
          }
          if (this.stack_.length !== frame.height) {
            this.error_((this.stack_.length - frame.height) +
              ' value(s) left on the stack at end of then-branch');
          }
        }
        // Restore entry stack, re-push params for the false branch.
        this.stack_.length = frame.height;
        for (const p of frame.blockParams) this.push_(p);
        frame.unreachable = false;
        return;
      }
      if (name === 'end') {
        if (this.control_.length === 0) {
          this.error_('unbalanced end');
          return;
        }
        const frame = this.control_.pop();
        // An if without else: params must match results (the false branch
        // leaves the params).
        if (frame.kind === 'if' && !frame.hasElse) {
          const p = frame.blockParams;
          const r = frame.endTypes;
          if (p.length !== r.length) {
            this.error_('if without else requires params to match results (' +
              p.length + ' vs ' + r.length + ')');
          } else {
            for (let i = 0; i < p.length; i++) {
              if (!(typesMatch(p[i], r[i], this.builder_) &&
                typesMatch(r[i], p[i], this.builder_))) {
                this.error_('if without else: parameter and result types differ');
                break;
              }
            }
          }
        }
        if (!frame.unreachable) {
          // Pop results, restore height, then push results.
          for (let i = frame.endTypes.length - 1; i >= 0; i--) {
            this.popExpected_(frame.endTypes[i]);
          }
          if (this.stack_.length !== frame.height) {
            this.error_((this.stack_.length - frame.height) +
              ' value(s) left on the stack at end of block');
          }
        } else if (this.stack_.length - frame.height > frame.endTypes.length) {
          // Dead code still pushes results; reject an over-full stack.
          this.error_('unused values not explicitly dropped by end of block');
        }
        this.stack_.length = frame.height;
        for (const r of frame.endTypes) this.push_(r);
        if (frame.kind === 'func') {
          this.terminated_ = true;
        }
        return;
      }
      if (name === 'br') {
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.error_('br: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        // Pop the label values (BOTTOM in unreachable code).
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.popExpected_(target.labelTypes[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'br_if') {
        this.popExpected_('i32');
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.error_('br_if: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.popExpected_(target.labelTypes[i]);
        }
        // Push them back for the fallthrough.
        for (const t of target.labelTypes) this.push_(t);
        return;
      }
      if (name === 'br_table') {
        this.popExpected_('i32');  // selector
        const depths = args[0];
        const def = args[1];
        const inRange = (d) => Number.isInteger(d) && d >= 0 && d < this.control_.length;
        if (!Array.isArray(depths)) {
          this.error_('br_table: expected a depths array');
          return;
        }
        if (!inRange(def)) {
          this.error_('br_table: default depth ' + def + ' out of range');
          return;
        }
        for (const d of depths) {
          if (!inRange(d)) {
            this.error_('br_table: depth ' + d + ' out of range');
            return;
          }
        }
        // All targets must accept the same label values, popped once.
        const targets = depths.map((d) => this.control_[this.control_.length - 1 - d]);
        targets.push(this.control_[this.control_.length - 1 - def]);
        const labelTypes = targets[0].labelTypes;
        for (const t of targets) {
          if (t.labelTypes.length !== labelTypes.length) {
            this.error_('br_table: target label arities differ');
            return;
          }
          for (let i = 0; i < labelTypes.length; i++) {
            if (!(typesMatch(t.labelTypes[i], labelTypes[i], this.builder_) &&
              typesMatch(labelTypes[i], t.labelTypes[i], this.builder_))) {
              this.error_('br_table: target label types differ');
              return;
            }
          }
        }
        if (!this.isUnreachable_()) {
          for (let i = labelTypes.length - 1; i >= 0; i--) {
            this.popExpected_(labelTypes[i]);
          }
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return') {
        const funcType = this.builder_.funcType_(this.fn_ ? this.fn_.typeIndex_ : 0);
        for (let i = funcType.results.length - 1; i >= 0; i--) {
          this.popExpected_(funcType.results[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }

      // locals
      if (name === 'local.get') {
        const idx = this.fn_ ? this.fn_.resolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.push_(this.localTypes_[idx]);
        } else {
          this.error_('local.get: index ' + idx + ' out of range (' +
            this.localTypes_.length + ' locals)');
        }
        return;
      }
      if (name === 'local.set') {
        const idx = this.fn_ ? this.fn_.resolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.popExpected_(this.localTypes_[idx]);
        } else {
          this.error_('local.set: index ' + idx + ' out of range (' +
            this.localTypes_.length + ' locals)');
        }
        return;
      }
      if (name === 'local.tee') {
        const idx = this.fn_ ? this.fn_.resolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.popExpected_(this.localTypes_[idx]);
          this.push_(this.localTypes_[idx]);
        } else {
          this.error_('local.tee: index ' + idx + ' out of range (' +
            this.localTypes_.length + ' locals)');
        }
        return;
      }

      // globals
      if (name === 'global.get') {
        const idx = this.builder_.resolveGlobal(args[0]);
        const entry = this.builder_.globalAt(idx);
        assert(entry !== null, 'global index ' + idx + ' out of range');
        this.push_(entry.type);
        return;
      }
      if (name === 'global.set') {
        const idx = this.builder_.resolveGlobal(args[0]);
        const entry = this.builder_.globalAt(idx);
        assert(entry !== null, 'global index ' + idx + ' out of range');
        if (!entry.mutable) {
          this.error_('global.set: global ' + idx + ' is immutable');
          return;
        }
        this.popExpected_(entry.type);
        return;
      }

      // table ops: the value type is the table's element type.
      if (name === 'table.get') {
        const elem = this.tableElemType_(args[0]);
        this.popExpected_('i32');
        this.push_(elem);
        return;
      }
      if (name === 'table.set') {
        const elem = this.tableElemType_(args[0]);
        this.popExpected_(elem);
        this.popExpected_('i32');
        return;
      }
      if (name === 'table.size') {
        this.push_('i32');
        return;
      }
      if (name === 'table.grow') {
        // Operand stack: [t value, i32 delta] with delta on top.
        const elem = this.tableElemType_(args[0]);
        this.popExpected_('i32');  // delta
        this.popExpected_(elem);   // init value
        this.push_('i32');
        return;
      }
      if (name === 'table.fill') {
        // Operand stack: [i32 start, t value, i32 len].
        const elem = this.tableElemType_(args[0]);
        this.popExpected_('i32');  // len
        this.popExpected_(elem);   // value
        this.popExpected_('i32');  // start index
        return;
      }

      // constants
      if (name === 'i32.const') { this.push_('i32'); return; }
      if (name === 'i64.const') { this.push_('i64'); return; }
      if (name === 'f32.const') { this.push_('f32'); return; }
      if (name === 'f64.const') { this.push_('f64'); return; }

      // drop
      if (name === 'drop') { this.pop_(); return; }

      // select
      const typedSelect = args.length > 0 && Array.isArray(args[0]);
      if (name === 'select' && !typedSelect) {
        this.popExpected_('i32');
        const t2 = this.pop_();
        const t1 = this.pop_();
        // Untyped select is numeric-only; refs need select_t.
        if ((t1 !== BOTTOM && this.isRefLike_(t1)) ||
          (t2 !== BOTTOM && this.isRefLike_(t2))) {
          this.error_('select on reference types requires select_t');
          return;
        }
        if (t1 !== BOTTOM && t2 !== BOTTOM &&
          !(typesMatch(t1, t2, this.builder_) && typesMatch(t2, t1, this.builder_))) {
          this.error_('select requires matching types, got ' + this.typeName_(t1) +
            ' and ' + this.typeName_(t2));
        }
        this.push_(t1 !== BOTTOM ? t1 : t2);
        return;
      }
      if (name === 'select_t' || name === 'select.typed' || name === 'select_t_' ||
        (name === 'select' && typedSelect)) {
        const types = args[0];
        if (!Array.isArray(types) || types.length === 0) {
          this.error_('select_t: expected a non-empty type list');
          return;
        }
        // Consumes [t*, t*, i32], produces [t*].
        this.popExpected_('i32');
        for (let round = 0; round < 2; round++) {
          for (let i = types.length - 1; i >= 0; i--) {
            this.popExpected_(types[i]);
          }
        }
        for (const t of types) this.push_(t);
        return;
      }

      // memory
      if (name === 'memory.size') {
        const mi = args.length > 0 ? this.builder_.resolveMemory(args[0]) : 0;
        this.push_(this.builder_.memoryAddressType(mi));
        return;
      }
      if (name === 'memory.grow') {
        const mi = args.length > 0 ? this.builder_.resolveMemory(args[0]) : 0;
        this.popExpected_(this.builder_.memoryAddressType(mi));
        this.push_(this.builder_.memoryAddressType(mi));
        return;
      }

      // calls
      if (name === 'call') {
        const funcIdx = this.builder_.resolveFunc(args[0]);
        const tt = this.builder_.funcType_(this.builder_.funcTypeIdxForIndex_(funcIdx));
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
          for (const r of tt.results) this.push_(r);
        }
        return;
      }
      if (name === 'call_indirect') {
        const typeIdx = this.builder_.resolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.checkIndirectCall_(tt, typeIdx, args)) {
          return;
        }
        this.popExpected_('i32');
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
          for (const r of tt.results) this.push_(r);
        }
        return;
      }
      if (name === 'call_ref') {
        const typeIdx = this.builder_.resolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.checkFuncTypeRef_(tt, typeIdx, 'call_ref')) {
          return;
        }
        // Callee is a (ref null $type) on top of the stack.
        this.popExpected_({ ref: typeIdx, nullable: true });
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
          for (const r of tt.results) this.push_(r);
        }
        return;
      }
      if (name === 'return_call') {
        const funcIdx = this.builder_.resolveFunc(args[0]);
        const tt = this.builder_.funcType_(this.builder_.funcTypeIdxForIndex_(funcIdx));
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return_call_indirect') {
        const typeIdx = this.builder_.resolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.checkIndirectCall_(tt, typeIdx, args)) {
          return;
        }
        if (tt) {
          this.popExpected_('i32');
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return_call_ref') {
        const typeIdx = this.builder_.resolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.checkFuncTypeRef_(tt, typeIdx, 'return_call_ref')) {
          return;
        }
        if (tt) {
          this.popExpected_({ ref: typeIdx, nullable: true });
          for (let i = tt.params.length - 1; i >= 0; i--) this.popExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }

      // ref ops
      if (name === 'ref.null') {
        const ht = args[0];
        if (typeof ht === 'number') {
          // A nullable typed ref; validate the index up front.
          this.builder_.resolveTypeRef(ht);
          this.push_({ ref: ht, nullable: true });
          return;
        }
        if (typeof ht === 'string') {
          const nullType = ht === 'func' ? 'nullfuncref' :
            ht === 'extern' ? 'nullexternref' :
              ht === 'any' ? 'nullanyref' :
                ht === 'eq' ? 'nulleqref' :
                  ht === 'i31' ? 'nulli31ref' :
                    ht === 'struct' ? 'nullstructref' :
                      ht === 'array' ? 'nullarrayref' :
                        ht === 'exn' ? 'nullexnref' :
                          ht === 'none' ? 'nullanyref' : null;
          if (nullType === null) {
            this.error_('ref.null: unknown heap type "' + ht + '"');
            return;
          }
          this.push_(nullType);
          return;
        }
        this.error_('ref.null: cannot resolve heap type ' + JSON.stringify(ht));
        return;
      }
      if (name === 'ref.is_null') {
        const t = this.pop_();
        if (!this.isRefLike_(t)) {
          this.error_('ref.is_null: expected a reference, got ' + this.typeName_(t));
          return;
        }
        this.push_('i32');
        return;
      }
      if (name === 'ref.func') {
        // The target must be declared (exported or in an elem segment).
        const funcIdx = this.builder_.resolveFunc(args[0]);
        if (!this.builder_.isFuncDeclared(funcIdx)) {
          this.error_('ref.func: function ' + funcIdx +
            ' is not declared (export it or reference it in an elem segment)');
          return;
        }
        const tt = this.builder_.funcTypeIdxForIndex_(funcIdx);
        this.push_({ ref: tt, nullable: false });
        return;
      }
      if (name === 'ref.eq') {
        // [eqref eqref] -> [i32]; funcref/externref/anyref are not eqref.
        const t2 = this.pop_();
        const t1 = this.pop_();
        const eqOk = (t) => {
          if (t === BOTTOM) return true;
          if (isPlainObject(t) && t.ref !== undefined) {
            // Struct/array refs are eqref; function refs are not.
            const tt = this.builder_.types_[t.ref];
            return tt && (tt.kind === 'struct' || tt.kind === 'array');
          }
          if (typeof t !== 'string') return false;
          return t === 'eqref' || t === 'i31ref' || t === 'structref' ||
            t === 'arrayref' || t === 'nulleqref' || t === 'nulli31ref' ||
            t === 'nullstructref' || t === 'nullarrayref';
        };
        if (!eqOk(t1) || !eqOk(t2)) {
          this.error_('ref.eq: expected eqref-compatible operands, got ' +
            this.typeName_(t1) + ' and ' + this.typeName_(t2));
          return;
        }
        this.push_('i32');
        return;
      }
      if (name === 'ref.as_non_null') {
        // (ref null ht) -> (ref ht): strip nullability.
        const t = this.pop_();
        if (!this.isRefLike_(t)) {
          this.error_('ref.as_non_null: expected a reference, got ' + this.typeName_(t));
          return;
        }
        this.push_(this.nonNullRef_(t));
        return;
      }
      if (name === 'br_on_null') {
        // Branch takes the ref; fallthrough carries t* plus a non-null ref.
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.error_('br_on_null: depth ' + depth + ' out of range');
          return;
        }
        const t = this.pop_();
        if (!this.isRefLike_(t)) {
          this.error_('br_on_null: expected a reference, got ' + this.typeName_(t));
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.popExpected_(target.labelTypes[i]);
        }
        for (const v of target.labelTypes) this.push_(v);
        this.push_(this.nonNullRef_(t));
        return;
      }
      if (name === 'br_on_non_null') {
        // The branch takes the ref; fallthrough keeps only t* below it.
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.error_('br_on_non_null: depth ' + depth + ' out of range');
          return;
        }
        const t = this.pop_();
        if (!this.isRefLike_(t)) {
          this.error_('br_on_non_null: expected a reference, got ' + this.typeName_(t));
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        const lt = target.labelTypes;
        if (lt.length === 0 || !this.isRefLike_(lt[lt.length - 1])) {
          this.error_('br_on_non_null: target label must end with a reference type');
          return;
        }
        // The branch value must fit the label's final reference type.
        if (!typesMatch(t, lt[lt.length - 1], this.builder_)) {
          this.error_('br_on_non_null: value type ' + this.typeName_(t) +
            ' does not match target label type ' + this.typeName_(lt[lt.length - 1]));
          return;
        }
        // The engine consumes the label values AND the ref (arity + 1);
        // the fallthrough keeps t* (the label minus its last value) plus
        // the non-null ref.
        for (let i = lt.length - 1; i >= 0; i--) {
          this.popExpected_(lt[i]);
        }
        for (let i = lt.length - 2; i >= 0; i--) {
          this.push_(lt[i]);
        }
        // Fallthrough keeps the non-null reference on the stack.
        this.push_(this.nonNullRef_(t));
        return;
      }

      // memory load/store
      if (this.builder_.isLoadStoreName_(name)) {
        const unreachable = this.isUnreachable_();
        const isStore = name.includes('.store');
        const base = isStore ? name.split('.store')[0] : name.split('.load')[0];
        const valType = base === 'i64' ? 'i64' : base === 'f64' ? 'f64' :
          base === 'f32' ? 'f32' : 'i32';
        const memIdx = this.builder_.memargMemIndex(args);
        const addrType = this.builder_.memoryAddressType(memIdx);
        if (isStore) {
          if (!unreachable) this.popExpected_(valType);
          if (!unreachable) this.popExpected_(addrType);
        } else {
          if (!unreachable) this.popExpected_(addrType);
          this.push_(valType);
        }
        return;
      }

      // atomics (0xfe prefix) -- before numeric ops, or they'd be misread.
      if (name.startsWith('i32.atomic.') || name.startsWith('i64.atomic.')) {
        const valType = name.startsWith('i64.atomic.') ? 'i64' : 'i32';
        const addrType = this.memAddrType_(args);
        if (name.includes('.load')) {
          this.popExpected_(addrType);
          this.push_(valType);
        } else if (name.includes('.store')) {
          this.popExpected_(valType);
          this.popExpected_(addrType);
        } else if (name.includes('.cmpxchg')) {
          this.popExpected_(valType);   // replacement
          this.popExpected_(valType);   // expected
          this.popExpected_(addrType);
          this.push_(valType);
        } else {
          // atomic rmw (add/sub/and/or/xor/xchg, incl. width variants).
          this.popExpected_(valType);
          this.popExpected_(addrType);
          this.push_(valType);
        }
        return;
      }
      if (name === 'memory.atomic.notify') {
        this.popExpected_('i32');       // count
        this.popExpected_(this.memAddrType_(args));
        this.push_('i32');
        return;
      }
      if (name === 'memory.atomic.wait32' || name === 'memory.atomic.wait64') {
        const valType = name === 'memory.atomic.wait32' ? 'i32' : 'i64';
        this.popExpected_('i64');       // timeout
        this.popExpected_(valType);     // expected
        this.popExpected_(this.memAddrType_(args));
        this.push_('i32');
        return;
      }
      if (name === 'memory.atomic.fence') return;

      // conversions: exact types from the CONV table.
      if (Object.prototype.hasOwnProperty.call(CONV, name)) {
        const [src, dst] = CONV[name];
        this.popExpected_(src);
        this.push_(dst);
        return;
      }

      // single-byte numeric ops.
      if (name.startsWith('i32.') || name === 'i32.eqz') {
        if (this.isBinary_(name)) {
          this.popExpected_('i32'); this.popExpected_('i32'); this.push_('i32');
        } else {
          this.popExpected_('i32'); this.push_('i32');
        }
        return;
      }
      if (name.startsWith('i64.')) {
        if (this.isBinary_(name)) {
          this.popExpected_('i64'); this.popExpected_('i64');
          this.push_(this.isComparison_(name) ? 'i32' : 'i64');
        } else {
          this.popExpected_('i64'); this.push_('i64');
        }
        return;
      }
      if (name.startsWith('f32.')) {
        if (this.isBinary_(name)) {
          this.popExpected_('f32'); this.popExpected_('f32');
          this.push_(this.isComparison_(name) ? 'i32' : 'f32');
        } else {
          this.popExpected_('f32'); this.push_('f32');
        }
        return;
      }
      if (name.startsWith('f64.')) {
        if (this.isBinary_(name)) {
          this.popExpected_('f64'); this.popExpected_('f64');
          this.push_(this.isComparison_(name) ? 'i32' : 'f64');
        } else {
          this.popExpected_('f64'); this.push_('f64');
        }
        return;
      }

      // SIMD
      if (Object.prototype.hasOwnProperty.call(SIMD, name)) {
        const [op, shape, spec] = SIMD[name];
        this.checkSimd_(name, shape, spec, args);
        return;
      }

      // GC
      if (Object.prototype.hasOwnProperty.call(GC, name)) {
        const [op, shape] = GC[name];
        this.checkGc_(name, shape, args);
        return;
      }

      // exceptions
      if (name === 'throw') {
        // Pop the tag's params off the stack.
        const tagIdx = this.builder_.resolveTag(args[0]);
        const tagType = tagIdx >= 0 ? this.builder_.tagTypeAt(tagIdx) : null;
        if (tagType) {
          for (let i = tagType.params.length - 1; i >= 0; i--) {
            this.popExpected_(tagType.params[i]);
          }
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'rethrow') {
        // Consumes nothing; the target must be a catch handler.
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 &&
          depth < this.control_.length)) {
          this.error_('rethrow: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const frame = this.control_[this.control_.length - 1 - depth];
        if (!frame.inCatch) {
          this.error_('rethrow: depth ' + depth + ' does not target a catch block');
          return;
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'throw_ref') {
        this.popExpected_('exnref');
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'try') {
        const bt = this.resolveBlockType_(args[0]);
        // Consume the try block's parameters.
        this.popN_(bt.params);
        this.control_.push({
          kind: name,
          labelTypes: bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        for (const p of bt.params) this.push_(p);
        return;
      }
      if (name === 'try_table') {
        const bt = this.resolveBlockType_(args[0]);
        this.popN_(bt.params);
        this.control_.push({
          kind: 'try_table',
          labelTypes: bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        for (const p of bt.params) this.push_(p);
        // Validate the catches: [tagRef|'all', depth, captureExnRef?].
        // A catch depth targets the frame d levels outside the try_table;
        // the payload (tag params + exnref when capturing) must be a
        // subtype of the target label's types.
        const catches = args[1];
        if (!Array.isArray(catches)) {
          this.error_('try_table: expected catches array');
          return;
        }
        for (const c of catches) {
          if (!Array.isArray(c) || c.length < 2) {
            this.error_('try_table: malformed catch clause');
            continue;
          }
          const isAll = (c[0] === 'all' || c[0] === 'catch_all');
          const depth = c[1];
          if (!(Number.isInteger(depth) && depth >= 0 &&
            depth < this.control_.length - 1)) {
            this.error_('try_table: catch depth ' + depth + ' out of range');
            continue;
          }
          const target = this.control_[this.control_.length - 2 - depth];
          let branchTypes = [];
          if (!isAll) {
            let tagIdx;
            try {
              tagIdx = this.builder_.resolveTag(c[0]);
            } catch (e) {
              this.error_('try_table: invalid tag reference ' +
                JSON.stringify(c[0]));
              continue;
            }
            const tagType = this.builder_.tagTypeAt(tagIdx);
            if (!tagType) {
              this.error_('try_table: invalid tag reference ' +
                JSON.stringify(c[0]));
              continue;
            }
            branchTypes = tagType.params.slice();
          }
          if (c[2] === true) {
            branchTypes.push({ ref: 'exn', nullable: false });
          }
          const labelTypes = target.labelTypes;
          if (branchTypes.length !== labelTypes.length) {
            this.error_('try_table: catch payload (' + branchTypes.length +
              ' values) does not match target label (' +
              labelTypes.length + ' values)');
            continue;
          }
          for (let i = 0; i < branchTypes.length; i++) {
            if (!typesMatch(branchTypes[i], labelTypes[i], this.builder_)) {
              this.error_('try_table: catch payload type ' +
                this.typeName_(branchTypes[i]) + ' is not a subtype of ' +
                this.typeName_(labelTypes[i]));
              break;
            }
          }
        }
        return;
      }
      if (name === 'catch') {
        const frame = this.control_[this.control_.length - 1];
        if (!frame || (frame.kind !== 'try' && frame.kind !== 'catch')) {
          this.error_('catch outside of try');
          return;
        }
        frame.inCatch = true;
        this.stack_.length = frame.height;
        // Restore the params, then push the caught exception's fields.
        for (const p of frame.blockParams) this.push_(p);
        const tagIdx = this.builder_.resolveTag(args[0]);
        const tagType = tagIdx >= 0 ? this.builder_.tagTypeAt(tagIdx) : null;
        if (tagType) {
          for (const p of tagType.params) this.push_(p);
        }
        frame.unreachable = false;
        return;
      }
      if (name === 'catch_all') {
        const frame = this.control_[this.control_.length - 1];
        if (!frame || (frame.kind !== 'try' && frame.kind !== 'catch')) {
          this.error_('catch outside of try');
          return;
        }
        frame.inCatch = true;
        this.stack_.length = frame.height;
        // Restore the params; catch_all pushes no exception values.
        for (const p of frame.blockParams) this.push_(p);
        frame.unreachable = false;
        return;
      }
      if (name === 'delegate') {
        this.control_.pop();
        return;
      }

      // bulk memory (table.init, table.copy)
      if (name === 'table.init') {
        this.popExpected_('i32'); this.popExpected_('i32'); this.popExpected_('i32');
        return;
      }
      if (name === 'table.copy') {
        this.popExpected_('i32'); this.popExpected_('i32'); this.popExpected_('i32');
        return;
      }
      if (name === 'memory.init') {
        // [addr, offset, length] -> [].
        const addr = this.bulkMemAddrType_(args[1]);
        this.popExpected_('i32');  // length
        this.popExpected_('i32');  // offset
        this.popExpected_(addr);
        return;
      }
      if (name === 'memory.copy') {
        // [dstAddr, srcAddr, length] -> []; all use the address type.
        const dst = this.bulkMemAddrType_(args[0]);
        const src = this.bulkMemAddrType_(args[1]);
        this.popExpected_(dst);  // length (same address type in practice)
        this.popExpected_(src);
        this.popExpected_(dst);
        return;
      }
      if (name === 'memory.fill') {
        // [addr, value, length] -> []; the value stays i32 for memory64.
        const addr = this.bulkMemAddrType_(args[0]);
        this.popExpected_(addr);  // length
        this.popExpected_('i32');  // value
        this.popExpected_(addr);
        return;
      }
      if (name === 'memory.discard') {
        // [addr, length] -> [].
        const addr = this.bulkMemAddrType_(args[0]);
        this.popExpected_(addr);  // length
        this.popExpected_(addr);
        return;
      }
      if (name === 'data.drop' || name === 'elem.drop') {
        return;
      }

      // Unknown instructions are rejected, never silently skipped
      this.error_('unknown instruction "' + name + '"');
    }

    checkSimd_(name, shape, spec, args) {
      const isMemShape = (shape === 'L' || shape === 'S' ||
        shape === 'LL' || shape === 'LS');
      const addrType = isMemShape ? this.memAddrType_(args) : null;
      switch (shape) {
        case 'L':
          this.popExpected_(addrType);  // address
          this.push_('v128');
          break;
        case 'S':
          this.popExpected_('v128');  // value
          this.popExpected_(addrType);  // address
          break;
        case 'LL':
          // The lane index is an immediate, not a stack operand.
          this.checkLaneIndex_(name, spec, args[args.length - 1]);
          this.popExpected_('v128');
          this.popExpected_(addrType);  // address
          this.push_('v128');
          break;
        case 'LS':
          this.checkLaneIndex_(name, spec, args[args.length - 1]);
          this.popExpected_('v128');
          this.popExpected_(addrType);  // address
          break;
        case 'C':
          this.push_('v128');
          break;
        case 'SH':
        case 'SW':
          this.popExpected_('v128');
          this.popExpected_('v128');
          this.push_('v128');
          break;
        case 'SP':
          this.popExpected_(spec || 'i32');
          this.push_('v128');
          break;
        case 'EX':
          this.checkLaneIndex_(name, undefined, args[0]);
          this.popExpected_('v128');
          this.push_(spec || 'i32');
          break;
        case 'RP':
          this.checkLaneIndex_(name, undefined, args[0]);
          this.popExpected_(spec || 'i32');
          this.popExpected_('v128');
          this.push_('v128');
          break;
        case 'CMP':
        case 'BI':
          this.popExpected_('v128');
          this.popExpected_('v128');
          this.push_('v128');
          break;
        case 'UN':
          this.popExpected_('v128');
          this.push_('v128');
          break;
        case 'TER':
          this.popExpected_('v128');
          this.popExpected_('v128');
          this.popExpected_('v128');
          this.push_('v128');
          break;
        case 'AT':
        case 'BM':
          this.popExpected_('v128');
          this.push_('i32');
          break;
        case 'SHF':
          this.popExpected_('i32');  // shift count
          this.popExpected_('v128');
          this.push_('v128');
          break;
        default:
          this.error_('stack checker does not model SIMD shape ' + shape);
          this.pop_();
          this.push_('v128');
      }
    }

    checkGc_(name, shape, args) {
      switch (shape) {
        case 'snew': {
          // Pop field values, push the struct ref.
          const t = this.gcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.error_('struct.new: type ' + args[0] + ' is not a struct type');
            return;
          }
          const fields = t ? t.fields : [];
          this.popN_(fields.map((f) => fieldStackType(f.type)));
          this.push_(this.typedRef_(args[0]));
          break;
        }
        case 'snewdef':
          this.push_(this.typedRef_(args[0]));
          break;
        case 'sget':
        case 'sget_su': {
          const t = this.gcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.error_('struct.get: type ' + args[0] + ' is not a struct type');
            return;
          }
          const f = t ? t.fields[args[1]] : null;
          if (!f) {
            this.error_('struct.get: unknown field index ' + args[1]);
            this.push_('i32');
            return;
          }
          this.popExpected_(this.typedRef_(args[0]));
          // get_s/u produce i32; get produces the field type (packed as i32).
          this.push_(shape === 'sget' ? fieldStackType(f.type) : 'i32');
          break;
        }
        case 'sset': {
          const t = this.gcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.error_('struct.set: type ' + args[0] + ' is not a struct type');
            return;
          }
          const f = t ? t.fields[args[1]] : null;
          if (!f) {
            this.error_('struct.set: unknown field index ' + args[1]);
            return;
          }
          if (!f.mutable) {
            this.error_('struct.set: field ' + args[1] + ' is immutable');
            return;
          }
          this.popExpected_(fieldStackType(f.type));
          this.popExpected_(this.typedRef_(args[0]));
          break;
        }
        case 'anew': {
          const t = this.gcType_(args[0]);
          this.popExpected_('i32');  // length
          this.popExpected_(t && t.element ? fieldStackType(t.element.type) : 'i32');
          this.push_(this.typedRef_(args[0]));
          break;
        }
        case 'anewdef':
          this.popExpected_('i32');  // length
          this.push_(this.typedRef_(args[0]));
          break;
        case 'anewfixed': {
          const t = this.gcType_(args[0]);
          const n = args[1] || 0;
          for (let i = 0; i < n; i++) {
            this.popExpected_(t && t.element ? fieldStackType(t.element.type) : 'i32');
          }
          this.push_(this.typedRef_(args[0]));
          break;
        }
        case 'anewseg':
          this.popExpected_('i32');  // length
          this.popExpected_('i32');  // offset
          this.push_(this.typedRef_(args[0]));
          break;
        case 'aget':
        case 'aget_su': {
          const t = this.gcType_(args[0]);
          this.popExpected_('i32');  // index
          this.popExpected_(this.typedRef_(args[0]));
          // get_s/u produce i32; get produces the element type (packed as i32).
          this.push_(shape === 'aget' && t && t.element ? fieldStackType(t.element.type) : 'i32');
          break;
        }
        case 'aset': {
          const t = this.gcType_(args[0]);
          this.popExpected_(t && t.element ? fieldStackType(t.element.type) : 'i32');
          this.popExpected_('i32');  // index
          this.popExpected_(this.typedRef_(args[0]));
          break;
        }
        case 'alen':
          this.popExpected_('arrayref');
          this.push_('i32');
          break;
        case 'afill': {
          const t = this.gcType_(args[0]);
          this.popExpected_('i32');  // length
          this.popExpected_(t && t.element ? fieldStackType(t.element.type) : 'i32');  // value
          this.popExpected_('i32');  // index
          this.popExpected_(this.typedRef_(args[0]));
          break;
        }
        case 'acopy': {
          // [dstRef, dstIdx, srcRef, srcIdx, len]; element types must match.
          const dstT = this.gcType_(args[0]);
          const srcT = this.gcType_(args[1]);
          if (dstT && srcT && dstT.element && srcT.element &&
            !(typesMatch(dstT.element.type, srcT.element.type, this.builder_) &&
              typesMatch(srcT.element.type, dstT.element.type, this.builder_))) {
            this.error_('array.copy: destination and source element types differ');
            return;
          }
          this.popExpected_('i32');  // length
          this.popExpected_('i32');  // src index
          this.popExpected_(this.typedRef_(args[1]));
          this.popExpected_('i32');  // dst index
          this.popExpected_(this.typedRef_(args[0]));
          break;
        }
        case 'aseginit': {
          this.gcType_(args[0]);
          this.popExpected_('i32');  // length
          this.popExpected_('i32');  // offset
          this.popExpected_('i32');  // index
          this.popExpected_(this.typedRef_(args[0]));
          break;
        }
        case 'rtest':
        case 'rcast': {
          // The operand must belong to the target's category: a funcref
          // operand is only valid for a func target, and so on.
          const target = args[0];
          const cat = (target === 'func' || target === 'funcref') ? 'funcref' :
            (target === 'extern' || target === 'externref') ? 'externref' :
              (target === 'exn' || target === 'exnref') ? 'exnref' : 'anyref';
          this.popExpected_(cat);
          if (shape === 'rcast') {
            this.push_(this.typedRef_(args[0], false));
          } else {
            this.push_('i32');
          }
          break;
        }
        case 'rbrancast': {
          // [flags, depth, srcHeapType, dstHeapType]. The flags byte selects
          // nullability (bit 0 = source nullable, bit 1 = dest nullable).
          const flags = args[0];
          if (!(Number.isInteger(flags) && flags >= 0 && flags <= 3)) {
            this.error_('br_on_cast: flags must be 0..3');
            break;
          }
          const depth = args[1];
          if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
            this.error_('br_on_cast: depth ' + depth + ' out of range (nesting ' +
              this.control_.length + ')');
            break;
          }
          const srcType = args[2] !== undefined ? args[2] : 'any';
          const dstType = args[3] !== undefined ? args[3] : srcType;
          // Numeric heap types must reference existing types.
          if (typeof srcType === 'number' && !this.builder_.types_[srcType]) {
            this.error_('br_on_cast: unknown source heap type ' + srcType);
            break;
          }
          if (typeof dstType === 'number' && !this.builder_.types_[dstType]) {
            this.error_('br_on_cast: unknown destination heap type ' + dstType);
            break;
          }
          const srcRef = this.makeRef_(srcType);
          const dstRef = this.makeRef_(dstType);
          const operand = this.pop_();
          if (!typesMatch(operand, srcRef, this.builder_)) {
            this.error_('br_on_cast: operand type ' + this.typeName_(operand) +
              ' does not match source type ' + this.typeName_(srcRef));
            break;
          }
          // Flags bit 0: source is nullable. A non-null source must not
          // receive a possibly-null operand (the engine enforces this).
          if ((flags & 1) === 0 && operand !== BOTTOM &&
            this.isNullableRef_(operand)) {
            this.error_('br_on_cast: source type is non-null but the operand ' +
              'may be null');
            break;
          }
          // The branch value must fit the target label's final type.
          const target = this.control_[this.control_.length - 1 - depth];
          const lt = target.labelTypes;
          const branchValue = name === 'br_on_cast_fail' ? srcRef : dstRef;
          const last = lt[lt.length - 1];
          const labelOk = last !== undefined && this.isRefLike_(last) &&
            (typesMatch(branchValue, last, this.builder_) ||
              typesMatch(last, branchValue, this.builder_));
          if (!labelOk) {
            this.error_('br_on_cast: target label must accept the branch value');
          }
          // Fallthrough carries the source type (br_on_cast) or the
          // destination type (_fail).
          this.push_(name === 'br_on_cast_fail' ? dstRef : srcRef);
          break;
        }
        case 'rconvert':
          // any.convert_extern: externref -> anyref.
          // extern.convert_any: anyref -> externref.
          if (name === 'any.convert_extern') {
            this.popExpected_('externref');
            this.push_('anyref');
          } else {
            this.popExpected_('anyref');
            this.push_('externref');
          }
          break;
        case 'ri31':
          this.popExpected_('i32');
          this.push_('i31ref');
          break;
        case 'i31get':
          this.popExpected_('i31ref');
          this.push_('i32');
          break;
        default:
          this.error_('stack checker does not model GC op ' + name);
          this.pop_();
          this.push_('i32');
      }
    }

    // Validate a SIMD lane index the engine rejects out-of-range ones.
    checkLaneIndex_(name, byteSize, lane) {
      const lanes = simdLaneCount(name, byteSize);
      if (lanes > 0 && !(Number.isInteger(lane) && lane >= 0 && lane < lanes)) {
        this.error_(name + ': lane index ' + lane + ' out of range (0..' +
          (lanes - 1) + ')');
      }
    }

    // Type descriptor of a GC instruction's type argument.
    gcType_(ref) {
      const idx = this.builder_.resolveTypeRef(ref);
      return this.builder_.types_[idx];
    }

    // call_indirect: type must be a function type and the table funcref.
    checkIndirectCall_(tt, typeIdx, args) {
      if (!tt || tt.kind !== 'func') {
        this.error_('call_indirect: type ' + typeIdx + ' is not a function type');
        return false;
      }
      const tblIdx = args.length > 1 ? args[1] : 0;
      const elem = this.tableElemType_(tblIdx);
      const typedFunc = isPlainObject(elem) && typeof elem.ref === 'number' &&
        (this.builder_.types_[elem.ref] || {}).kind === 'func';
      if (elem !== 'funcref' && !typedFunc) {
        this.error_('call_indirect: table ' + tblIdx + ' is not a funcref table');
        return false;
      }
      return true;
    }

    // call_ref: the referenced type must be a function type.
    checkFuncTypeRef_(tt, typeIdx, name) {
      if (!tt || tt.kind !== 'func') {
        this.error_(name + ': type ' + typeIdx + ' is not a function type');
        return false;
      }
      return true;
    }

    // Type reference -> checker type name.
    makeRef_(typeRef) {
      if (typeof typeRef === 'number') {
        const t = this.builder_.types_[typeRef];
        if (!t) return 'anyref';
        if (t.kind === 'struct') return 'structref';
        if (t.kind === 'array') return 'arrayref';
        return 'anyref';
      }
      if (typeof typeRef === 'string') {
        // Abstract heap type name or a ref-type name.
        const map = {
          any: 'anyref',
          eq: 'eqref',
          i31: 'i31ref',
          struct: 'structref',
          array: 'arrayref',
          func: 'funcref',
          extern: 'externref',
        };
        if (map[typeRef]) return map[typeRef];
        if (typeRef.endsWith('ref')) return typeRef;
        return 'anyref';
      }
      if (isPlainObject(typeRef) && typeRef.ref !== undefined) {
        return this.makeRef_(typeRef.ref);
      }
      return 'anyref';
    }

    // Strip nullability (ref null ht) -> (ref ht).
    nonNullRef_(t) {
      if (t === BOTTOM) return BOTTOM;
      if (isPlainObject(t) && t.ref !== undefined) {
        return { ref: t.ref, nullable: false };
      }
      if (typeof t === 'string' && t.startsWith('null')) {
        return t.slice(4);  // nullfuncref -> funcref, nullanyref -> anyref, ...
      }
      return t;
    }

    // True if the checker type looks like a reference type.
    isRefLike_(t) {
      if (t === BOTTOM) return true;
      if (isPlainObject(t) && t.ref !== undefined) return true;
      if (typeof t === 'string') {
        return t.startsWith('null') || isRefTypeName(t) || t.endsWith('ref');
      }
      return false;
    }

    // True if a checker type is definitely a nullable reference.
    isNullableRef_(t) {
      if (isPlainObject(t) && t.ref !== undefined) {
        return t.nullable !== false;
      }
      if (typeof t === 'string') {
        return t.startsWith('null') || t.endsWith('ref');
      }
      return false;
    }

    // Table element type by resolved index, or null if out of range.
    tableElemAt_(idx) {
      const imports = this.builder_.tableImports_;
      const defs = this.builder_.tableDefs_;
      const entry = idx < imports.length ? imports[idx] :
        (idx - imports.length < defs.length ? defs[idx - imports.length] : null);
      return entry ? entry.element : null;
    }

    // Element type as a checker type; typed elements stay concrete for call_ref.
    tableElemType_(ref) {
      const idx = this.builder_.resolveTable(ref);
      const elem = this.tableElemAt_(idx);
      if (elem === null || elem === undefined) return 'funcref';
      if (typeof elem === 'number') return { ref: elem, nullable: true };
      if (isPlainObject(elem) && elem.ref !== undefined) {
        return { ref: elem.ref, nullable: elem.nullable !== false };
      }
      return this.makeRef_(elem);
    }

    // The nullable typed ref that struct.new / array.new / ref.null produce.
    typedRef_(typeRef, nullable) {
      if (typeof typeRef === 'number') {
        this.builder_.resolveTypeRef(typeRef);  // validate the index
        return { ref: typeRef, nullable: nullable === false ? false : true };
      }
      return this.makeRef_(typeRef);
    }

    // Address type of the memory referenced by a memarg-style args list.
    memAddrType_(args) {
      if (!this.builder_.hasMemory()) return 'i32';
      return this.builder_.memoryAddressType(this.builder_.memargMemIndex(args));
    }

    // Address type for bulk memory instructions, defaulting to memory 0.
    bulkMemAddrType_(memRef) {
      if (!this.builder_.hasMemory()) return 'i32';
      if (memRef === undefined) return this.builder_.memoryAddressType(0);
      return this.builder_.memoryAddressType(memRef);
    }

    isComparison_(name) {
      const parts = name.split('.');
      const op = parts[parts.length - 1];
      return ['eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u',
        'le_s', 'le_u', 'ge_s', 'ge_u', 'lt', 'gt', 'le', 'ge'].includes(op);
    }

    isBinary_(name) {
      const parts = name.split('.');
      const op = parts[parts.length - 1];
      return ['add', 'sub', 'mul', 'div_s', 'div_u', 'rem_s', 'rem_u', 'and', 'or', 'xor',
        'shl', 'shr_s', 'shr_u', 'rotl', 'rotr', 'min', 'max', 'copysign',
        'eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u',
        'lt', 'gt', 'le', 'ge'].includes(op);
    }
  }

  // Function builder
  class WasmFunctionBuilder {
    constructor(builder, name, typeIndex, typeDescriptor) {
      this.builder_ = builder;
      this.name_ = name;
      this.typeIndex_ = typeIndex;      // number: index into type list
      this.typeDescriptor_ = typeDescriptor;  // may be null
      this.locals_ = [];                // {type, name}
      this.localNames_ = new Map();     // name -> local index
      this.bodyInstrs_ = null;
      this.exportName_ = null;
      this.isStart_ = false;
    }

    // Declare a local; params occupy indices 0..nparams-1 first.
    addLocal(type, name) {
      const index = this.builder_.funcTypeParams_(this).length + this.locals_.length;
      if (name !== undefined) {
        assert(!this.localNames_.has(name), 'duplicate local name "' + name + '"');
        this.localNames_.set(name, index);
      }
      this.locals_.push({ type, name });
      return index;
    }

    addLocals(type, count) {
      let first = -1;
      for (let i = 0; i < count; i++) {
        const idx = this.addLocal(type);
        if (first < 0) {
          first = idx;
        }
      }
      return first;
    }

    body(instrs) {
      assert(Array.isArray(instrs), 'body() expects an array of instructions');
      assert(this.bodyInstrs_ === null, 'body() may only be called once');
      this.bodyInstrs_ = instrs;
      // Remember where this body was declared so errors can point at it.
      this.definitionStack_ = new Error().stack;
      this.definitionFrame_ = firstTestFrame_(this.definitionStack_);
      return this;
    }

    exportAs(exportName) {
      assert(typeof exportName === 'string' && exportName.length > 0,
        'exportAs: export name must be a non-empty string');
      this.exportName_ = exportName;
      return this;
    }

    start() {
      const tt = this.builder_.funcType_(this.typeIndex_);
      assert(tt && (tt.params || []).length === 0 && (tt.results || []).length === 0,
        'start function must have type [] -> []');
      this.isStart_ = true;
      this.builder_.start_ = this;
      return this;
    }

    // Resolve a local reference (number = raw index, string = name).
    resolveLocal(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0,
          'bad local index ' + ref);
        return ref;
      }
      if (typeof ref === 'string') {
        assert(this.localNames_.has(ref),
          'unknown local "' + ref + '" in function "' +
          (this.name_ || '?') + '"');
        return this.localNames_.get(ref);
      }
      throw new WasmBuilderError('cannot resolve local: ' + String(ref));
    }

    numParams() {
      return this.builder_.funcTypeParams_(this).length;
    }

    exportName() {
      return this.exportName_;
    }
  }

  // Module builder
  class WasmModuleBuilder {
    constructor() {
      this.types_ = [];         // {params: [...], results: [...]}
      this.typeKeys_ = new Map();
      this.funcImports_ = [];   // {module, name, type}  type = index
      this.funcDefs_ = [];      // WasmFunctionBuilder
      this.funcNames_ = new Map();     // name -> {isImport, indexInSpace}
      this.tableImports_ = [];  // {module, name, element, initial, maximum, addressType}
      this.tableDefs_ = [];
      this.memImports_ = [];    // {module, name, initial, maximum, shared, addressType}
      this.memDefs_ = [];
      this.globalImports_ = []; // {module, name, type, mutable}
      this.globalDefs_ = [];    // {type, mutable, init}
      this.tagImports_ = [];    // {module, name, type}
      this.tagDefs_ = [];       // {type}
      this.elems_ = [];         // elem segment descriptions
      this.datas_ = [];         // data segment descriptions
      this.exports_ = [];       // {name, kind, ref}  ref resolved at encode
      this.start_ = null;       // function reference
      this.usesDataOps_ = false;
      this.useStackCheck_ = true;  // run the stack type checker by default
    }

    // Types
    // Dedup key for type descriptors, kind is folded in so func and struct
    // types never collide even with similar JSON shapes.
    typeKey_(desc) {
      if (desc.kind === 'struct' || desc.kind === 'array') {
        return JSON.stringify([desc.kind, desc.fields || desc.element,
          desc.supertype, desc.final]);
      }
      return 'func:' + JSON.stringify([desc.params, desc.results,
        desc.supertype, desc.final]);
    }

    // Register a type descriptor and return its index. Forms:
    //   {params, results}                     function type
    //   {kind: 'struct', fields: [...]}       struct type
    //   {kind: 'array', element: {...}}       array type
    // All accept {supertype} and {final: false}. Bare types are implicitly
    // final: a type is only extensible with the 'sub' prefix.
    addType(desc) {
      assert(isPlainObject(desc), 'addType: expected a type descriptor');
      const norm = this.normalizeTypeDesc_(desc);
      const key = this.typeKey_(norm);
      if (this.typeKeys_.has(key)) {
        return this.typeKeys_.get(key);
      }
      const index = this.types_.length;
      this.types_.push(norm);
      this.typeKeys_.set(key, index);
      return index;
    }

    normalizeTypeDesc_(desc) {
      if (desc.kind === 'struct') {
        assert(Array.isArray(desc.fields), 'struct type: fields required');
        return {
          kind: 'struct',
          fields: desc.fields.map((f) => ({
            type: typeof f === 'string' ? f : f.type,
            mutable: typeof f === 'string' ? false : !!f.mutable,
          })),
          supertype: desc.supertype,
          final: desc.final,
        };
      }
      if (desc.kind === 'array') {
        let elem;
        if (desc.element) {
          elem = isPlainObject(desc.element) ? desc.element : { type: desc.element, mutable: !!desc.mutable };
        } else if (desc.fields && desc.fields.length > 0) {
          const f = desc.fields[0];
          elem = typeof f === 'string' ? { type: f, mutable: false } : { type: f.type, mutable: !!f.mutable };
        } else {
          elem = { type: 'i32', mutable: false };
        }
        return {
          kind: 'array',
          element: { type: elem.type, mutable: !!elem.mutable },
          supertype: desc.supertype,
          final: desc.final,
        };
      }
      assert(Array.isArray(desc.params) && Array.isArray(desc.results),
        'function type: params and results must be arrays');
      return {
        kind: 'func',
        params: desc.params.slice(),
        results: desc.results.slice(),
        supertype: desc.supertype,
        final: desc.final,
      };
    }

    // Resolve a type reference: index, or auto-add a descriptor.
    resolveTypeRef(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.types_.length,
          'type index ' + ref + ' out of range');
        return ref;
      }
      if (isPlainObject(ref) &&
        Array.isArray(ref.params) && Array.isArray(ref.results)) {
        return this.addType(ref);
      }
      throw new WasmBuilderError('cannot resolve type: ' + String(ref));
    }

    // Ensure a function type exists and return its index.
    ensureFuncType(desc) {
      return this.addType(desc);
    }

    funcType_(typeIndex) {
      return this.types_[typeIndex];
    }

    funcTypeParams_(fnBuilder) {
      return this.funcType_(fnBuilder.typeIndex_).params;
    }

    funcTypeResults_(fnBuilder) {
      return this.funcType_(fnBuilder.typeIndex_).results;
    }

    // Functions
    // name: optional, unique. type: index or {params, results}.
    addFunction(name, type) {
      const typeIndex = this.resolveTypeRef(type);
      assert(name === undefined || typeof name === 'string',
        'addFunction: name must be a string');
      if (name !== undefined) {
        assert(!this.funcNames_.has(name),
          'duplicate function name "' + name + '"');
        this.funcNames_.set(name, { isImport: false });
      }
      const fn = new WasmFunctionBuilder(this, name, typeIndex, null);
      this.funcDefs_.push(fn);
      return fn;
    }

    addImport(moduleName, fieldName, kindOrDesc, desc) {
      let kind;
      if (typeof kindOrDesc === 'string') {
        kind = kindOrDesc;
      } else if (isPlainObject(kindOrDesc)) {
        desc = kindOrDesc;
        kind = kindOrDesc.kind;
      } else {
        throw new WasmBuilderError('addImport: bad kind argument');
      }
      assert(typeof moduleName === 'string' && typeof fieldName === 'string',
        'addImport: module and field must be strings');
      switch (kind) {
        case 'function':
        case 'func': {
          const typeIndex = this.resolveTypeRef(desc.type);
          this.funcImports_.push({ module: moduleName, name: fieldName, type: typeIndex });
          this.funcNames_.set(fieldName, { isImport: true });
          return this.funcImports_.length - 1;  // import relative index
        }
        case 'table': {
          const entry = {
            module: moduleName,
            name: fieldName,
            element: desc.element || 'funcref',
            initial: desc.initial !== undefined ? desc.initial : desc.min,
            maximum: desc.maximum !== undefined ? desc.maximum : desc.max,
            addressType: desc.addressType || 'i32',
          };
          this.tableImports_.push(entry);
          return this.tableImports_.length - 1;
        }
        case 'memory': {
          const entry = {
            module: moduleName,
            name: fieldName,
            initial: desc.initial !== undefined ? desc.initial : desc.min,
            maximum: desc.maximum !== undefined ? desc.maximum : desc.max,
            shared: !!desc.shared,
            addressType: desc.addressType || 'i32',
          };
          this.memImports_.push(entry);
          return this.memImports_.length - 1;
        }
        case 'global': {
          const entry = {
            module: moduleName,
            name: fieldName,
            type: desc.type,
            mutable: !!desc.mutable,
          };
          this.globalImports_.push(entry);
          return this.globalImports_.length - 1;
        }
        case 'tag': {
          const entry = {
            module: moduleName,
            name: fieldName,
            type: this.resolveTypeRef(desc.type),
          };
          this.tagImports_.push(entry);
          return this.tagImports_.length - 1;
        }
        default:
          throw new WasmBuilderError('unknown import kind "' + kind + '"');
      }
    }

    // Tables
    addTable(descOrElement, initial, maximum) {
      let desc;
      if (typeof descOrElement === 'string') {
        desc = { element: descOrElement, initial, maximum };
      } else {
        desc = descOrElement;
      }
      assert(isPlainObject(desc), 'addTable: expected descriptor');
      assert(desc.initial !== undefined, 'addTable: initial size required');
      const entry = {
        element: desc.element || 'funcref',
        initial: desc.initial,
        maximum: desc.maximum,
        addressType: desc.addressType || 'i32',
      };
      this.tableDefs_.push(entry);
      return this.tableImports_.length + this.tableDefs_.length - 1;
    }

    // Memories
    addMemory(descOrInitial, maximum) {
      let desc;
      if (typeof descOrInitial === 'number') {
        desc = { initial: descOrInitial, maximum };
      } else {
        desc = descOrInitial;
      }
      assert(isPlainObject(desc), 'addMemory: expected descriptor');
      assert(desc.initial !== undefined, 'addMemory: initial size (pages) required');
      const entry = {
        initial: desc.initial,
        maximum: desc.maximum !== undefined ? desc.maximum : desc.max,
        shared: !!desc.shared,
        addressType: desc.addressType || 'i32',
      };
      this.memDefs_.push(entry);
      return this.memImports_.length + this.memDefs_.length - 1;
    }

    // Globals
    addGlobal(type, initValue, mutable) {
      assert(type !== undefined, 'addGlobal: type required');
      const entry = { type, mutable: !!mutable, init: initValue };
      entry.definitionFrame = firstTestFrame_(new Error().stack);
      this.globalDefs_.push(entry);
      return this.globalImports_.length + this.globalDefs_.length - 1;
    }

    // Tags (exception handling)
    addTag(type) {
      const typeIndex = this.resolveTypeRef(type);
      this.tagDefs_.push({ type: typeIndex });
      return this.tagImports_.length + this.tagDefs_.length - 1;
    }

    // Element segments (indices or exprs form; active/passive/declared).
    addElemSegment(desc) {
      assert(isPlainObject(desc), 'addElemSegment: expected descriptor');
      assert(desc.indices !== undefined || desc.exprs !== undefined,
        'addElemSegment: indices or exprs required');
      desc.definitionFrame = firstTestFrame_(new Error().stack);
      this.elems_.push(desc);
      return this.elems_.length - 1;
    }

    // Data segments
    addDataSegment(descOrOffset, data) {
      let desc;
      if (typeof descOrOffset === 'number' || Array.isArray(descOrOffset) ||
        descOrOffset instanceof Uint8Array) {
        desc = { offset: descOrOffset, data };
      } else {
        desc = descOrOffset;
      }
      assert(isPlainObject(desc), 'addDataSegment: expected descriptor');
      assert(desc.data !== undefined, 'addDataSegment: data required');
      desc.definitionFrame = firstTestFrame_(new Error().stack);
      this.datas_.push(desc);
      return this.datas_.length - 1;
    }

    // Exports
    // Export a function by name, builder, or explicit index.
    exportFunction(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      if (typeof refOrName === 'string') {
        assert(this.funcNames_.has(refOrName),
          'exportFunction: unknown function "' + refOrName + '"');
        ref = refOrName;
      } else if (isFunctionBuilder(refOrName)) {
        ref = refOrName;
        assert(exportName !== undefined, 'exportFunction: export name required for builder');
      } else if (typeof refOrName === 'number') {
        assert(exportName !== undefined, 'exportFunction: export name required for index');
        ref = refOrName;
      }
      this.addExport_(exportName, KIND.FUNCTION, ref);
      return this;
    }

    exportTable(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.addExport_(exportName, KIND.TABLE, ref);
      return this;
    }

    exportMemory(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.addExport_(exportName, KIND.MEMORY, ref);
      return this;
    }

    exportGlobal(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.addExport_(exportName, KIND.GLOBAL, ref);
      return this;
    }

    exportTag(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.addExport_(exportName, KIND.TAG, ref);
      return this;
    }

    addExport_(name, kind, ref) {
      assert(typeof name === 'string' && name.length > 0,
        'export name must be a non-empty string');
      for (const e of this.exports_) {
        assert(e.name !== name, 'duplicate export name "' + name + '"');
      }
      this.exports_.push({ name, kind, ref });
    }

    addStart(funcRef) {
      assert(this.start_ === null, 'only one start function allowed');
      const funcIdx = this.resolveFunc(funcRef);
      const tt = this.funcType_(this.funcTypeIdxForIndex_(funcIdx));
      assert(tt && (tt.params || []).length === 0 && (tt.results || []).length === 0,
        'start function must have type [] -> []');
      this.start_ = funcRef;
      return this;
    }

    // Encoding
    // Resolve a reference in an index space.
    resolveIndex_(imports, defs, ref, spaceName, isFuncSpace) {
      // imports: array of entries; defs: array of entries or builders.
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 &&
          ref < imports.length + defs.length,
          spaceName + ' index ' + ref + ' out of range');
        return ref;
      }
      if (typeof ref === 'string') {
        // Imports by field name in every space; function defs by declared name.
        for (let i = 0; i < imports.length; i++) {
          if (imports[i].name === ref) {
            return i;
          }
        }
        if (isFuncSpace) {
          for (let i = 0; i < defs.length; i++) {
            if (defs[i].name_ === ref) {
              return imports.length + i;
            }
          }
        }
        throw new WasmBuilderError('unknown ' + spaceName + ' "' + ref + '"');
      }
      if (isFunctionBuilder(ref)) {
        const i = defs.indexOf(ref);
        assert(i >= 0, 'function builder not part of this module');
        return imports.length + i;
      }
      throw new WasmBuilderError('cannot resolve ' + spaceName + ' reference');
    }

    resolveFunc(ref) {
      return this.resolveIndex_(this.funcImports_, this.funcDefs_, ref, 'function', true);
    }

    // Valid ref.func targets: every exported function and every function in
    // an element segment. The start function is not a valid target.
    declaredFuncIndices_() {
      const set = new Set();
      const add = (ref) => {
        try {
          set.add(this.resolveFunc(ref));
        } catch (e) {
          // Unresolvable refs are reported elsewhere during encoding.
        }
      };
      const exportList = this.exports_.slice();
      for (const fn of this.funcDefs_) {
        if (fn.exportName_ !== null) {
          exportList.push({ kind: KIND.FUNCTION, ref: fn });
        }
      }
      for (const e of exportList) {
        if (e.kind === KIND.FUNCTION) add(e.ref);
      }
      for (const seg of this.elems_) {
        if (seg.indices !== undefined) {
          for (const idx of seg.indices) add(idx);
        } else if (seg.exprs !== undefined) {
          for (const ex of seg.exprs) {
            if (isPlainObject(ex) && ex.ref !== undefined) add(ex.ref);
          }
        }
      }
      return set;
    }

    // Whether a function index is a valid ref.func target.
    isFuncDeclared(funcIdx) {
      return this.declaredFuncIndices_().has(funcIdx);
    }

    resolveTable(ref) {
      return this.resolveIndex_(this.tableImports_, this.tableDefs_, ref, 'table', false);
    }

    resolveMemory(ref) {
      return this.resolveIndex_(this.memImports_, this.memDefs_, ref, 'memory', false);
    }

    resolveGlobal(ref) {
      return this.resolveIndex_(this.globalImports_, this.globalDefs_, ref, 'global', false);
    }

    resolveTag(ref) {
      return this.resolveIndex_(this.tagImports_, this.tagDefs_, ref, 'tag', false);
    }

    // Tag type descriptor by resolved index.
    tagTypeAt(idx) {
      const imports = this.tagImports_;
      const defs = this.tagDefs_;
      if (idx < imports.length) {
        return this.types_[imports[idx].type];
      }
      if (idx - imports.length < defs.length) {
        return this.types_[defs[idx - imports.length].type];
      }
      return null;
    }

    // True if any memory is memory64.
    hasMemory64_() {
      for (const m of this.memImports_) {
        if (m.addressType === 'i64') return true;
      }
      for (const m of this.memDefs_) {
        if (m.addressType === 'i64') return true;
      }
      return false;
    }

    resolveElem(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.elems_.length,
          'elem segment index ' + ref + ' out of range');
        return ref;
      }
      throw new WasmBuilderError('cannot resolve elem segment reference');
    }

    // Table element type by resolved index, or undefined.
    tableEntryElement_(idx) {
      if (idx < this.tableImports_.length) {
        return this.tableImports_[idx].element;
      }
      if (idx - this.tableImports_.length < this.tableDefs_.length) {
        return this.tableDefs_[idx - this.tableImports_.length].element;
      }
      return undefined;
    }

    // True if a table holds typed funcrefs ((ref null? $t), $t a func type).
    // Such tables need the explicit reftype (flag 6), not flag 4.
    isTypedFuncrefTable_(idx) {
      const elem = this.tableEntryElement_(idx);
      if (!isPlainObject(elem)) return false;
      if (typeof elem.ref !== 'number') return false;
      const t = this.types_[elem.ref];
      return !!t && t.kind === 'func';
    }

    resolveData(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.datas_.length,
          'data segment index ' + ref + ' out of range');
        return ref;
      }
      throw new WasmBuilderError('cannot resolve data segment reference');
    }

    hasMemory() {
      return this.memImports_.length + this.memDefs_.length > 0;
    }

    hasTable() {
      return this.tableImports_.length + this.tableDefs_.length > 0;
    }

    numMemories() {
      return this.memImports_.length + this.memDefs_.length;
    }

    // Memory index from a load/store instruction's args, default 0.
    memargMemIndex(args) {
      if (args.length === 0) return 0;
      if (Array.isArray(args[0])) {
        return args[0].length > 2 ? args[0][2] : 0;
      }
      return args.length > 2 ? args[2] : 0;
    }

    // Address type ('i32' or 'i64') of a memory reference.
    memoryAddressType(ref) {
      const idx = this.resolveMemory(ref);
      const imports = this.memImports_;
      const defs = this.memDefs_;
      const entry = idx < imports.length ? imports[idx] : defs[idx - imports.length];
      return entry.addressType || 'i32';
    }

    // Global entry by resolved index (for the stack checker).
    globalAt(idx) {
      const imports = this.globalImports_;
      const defs = this.globalDefs_;
      if (idx < imports.length) return imports[idx];
      if (idx - imports.length < defs.length) return defs[idx - imports.length];
      return null;
    }

    // Type index of a function by its resolved index.
    funcTypeIdxForIndex_(funcIdx) {
      const imports = this.funcImports_;
      const defs = this.funcDefs_;
      if (funcIdx < imports.length) return imports[funcIdx].type;
      if (funcIdx - imports.length < defs.length) return defs[funcIdx - imports.length].typeIndex_;
      return 0;
    }

    // Check if a name is one of the LOAD_STORE memory ops.
    isLoadStoreName_(name) {
      return Object.prototype.hasOwnProperty.call(LOAD_STORE, name);
    }

    // Return the LOAD_STORE entry for a name, or null.
    loadStoreInfo_(name) {
      return LOAD_STORE[name] || null;
    }

    // Turn the stack type checker on/off (on by default).
    setStackTypeChecking(on) {
      this.useStackCheck_ = on;
    }

    makeCtx_(fnBuilder) {
      const self = this;
      return {
        resolveLocal: (ref) => {
          if (fnBuilder) {
            return fnBuilder.resolveLocal(ref);
          }
          throw new WasmBuilderError('local reference outside of a function');
        },
        resolveGlobal: (ref) => self.resolveGlobal(ref),
        resolveFunc: (ref) => self.resolveFunc(ref),
        resolveTable: (ref) => self.resolveTable(ref),
        resolveMemory: (ref) => self.resolveMemory(ref),
        resolveTag: (ref) => self.resolveTag(ref),
        resolveType: (ref) => self.resolveTypeRef(ref),
        resolveElem: (ref) => self.resolveElem(ref),
        resolveData: (ref) => self.resolveData(ref),
        ensureFuncType: (desc) => self.ensureFuncType(desc),
        requireMemory: () => {
          assert(self.hasMemory(), 'memory instruction but no memory declared');
        },
        requireTable: () => {
          assert(self.hasTable(), 'table instruction but no table declared');
        },
        numMemories: () => self.numMemories(),
        memoryAddressType: (ref) => self.memoryAddressType(ref),
      };
    }

    // Encode a constant expression (literal, ref.null, ref.func, or instrs).
    // The terminating 'end' is always appended.
    encodeInitExpr_(init, type, ctx) {
      const w = new Writer();
      const tmp = new Writer();
      if (typeof init === 'number' || typeof init === 'bigint') {
        assert(type !== undefined, 'init expression: type required for a literal');
        if (type === 'i32') {
          assert(typeof init === 'number', 'i32 literal init must be a number');
          tmp.writeU8(OP.I32Const);
          tmp.writeS32LEB(init);
        } else if (type === 'i64') {
          tmp.writeU8(OP.I64Const);
          tmp.writeS64LEB(init);
        } else if (type === 'f32') {
          assert(typeof init === 'number', 'f32 literal init must be a number');
          tmp.writeU8(OP.F32Const);
          tmp.writeF32(init);
        } else if (type === 'f64') {
          assert(typeof init === 'number', 'f64 literal init must be a number');
          tmp.writeU8(OP.F64Const);
          tmp.writeF64(init);
        } else {
          throw new WasmBuilderError('cannot build literal init for type ' + type);
        }
      } else if (init === null || typeof init === 'string') {
        // ref.null of the given/derived heap type.
        const heap = (typeof init === 'string')
          ? init
          : this.heapTypeForType_(type);
        tmp.writeU8(OP.RefNull);
        tmp.writeHeapType(heap);
      } else if (isPlainObject(init) && init.ref !== undefined) {
        tmp.writeU8(OP.RefFunc);
        tmp.writeU32LEB(this.resolveFunc(init.ref));
      } else if (Array.isArray(init)) {
        // Instruction list (e.g. [["global.get", 0]]).
        const enc = new InstrEncoder(this);
        const ew = enc.encode(init, ctx, { initialDepth: 0, finalEnd: false });
        tmp.bytes_.push.apply(tmp.bytes_, ew.bytes_);
      } else {
        throw new WasmBuilderError('cannot encode init expression: ' + String(init));
      }
      // Terminating 'end' for the constant expression.
      tmp.writeU8(OP.End);
      w.bytes_.push.apply(w.bytes_, tmp.bytes_);
      return w;
    }

    heapTypeForType_(type) {
      if (typeof type === 'string') {
        const norm = (type === 'funcref') ? 'func' :
          (type === 'externref') ? 'extern' :
            (type === 'anyref') ? 'any' :
              (type === 'eqref') ? 'eq' :
                (type === 'i31ref') ? 'i31' :
                  (type === 'structref') ? 'struct' :
                    (type === 'arrayref') ? 'array' :
                      (type === 'exnref') ? 'exn' : type;
        return norm;
      }
      if (isPlainObject(type) && type.ref !== undefined) {
        return type.ref;
      }
      return 'any';
    }

    encodeLimits_(desc, forMemory) {
      const limits = {
        initial: desc.initial,
        maximum: desc.maximum,
        shared: desc.shared,
        addressType: desc.addressType || 'i32',
      };
      if (limits.initial === undefined) {
        limits.initial = 0;
      }
      if (limits.addressType === 'i64' && limits.maximum === undefined) {
        limits.maximum = undefined;
      }
      const w = new Writer();
      w.writeLimits(limits, forMemory);
      return w;
    }

    // Write one type def: optional sub prefix + supertype list, then the
    // concrete form. A bare type is implicitly final (no sub prefix).
    writeTypeDef_(www, t) {
      const hasSub = (t.supertype !== undefined && t.supertype !== null) ||
        t.final === false;
      if (hasSub) {
        www.writeU8(t.final === true ? SUB_FINAL : SUB_NO_FINAL);
        const supers = [];
        if (t.supertype !== undefined && t.supertype !== null) {
          supers.push(this.resolveTypeRef(t.supertype));
        }
        www.writeVector(supers.length, (x, j) => x.writeU32LEB(supers[j]));
      }
      if (t.kind === 'struct') {
        www.writeU8(STRUCT_FORM);
        www.writeVector(t.fields.length, (x, j) => {
          x.writeValueType(t.fields[j].type);
          x.writeU8(t.fields[j].mutable ? 0x01 : 0x00);
        });
        return;
      }
      if (t.kind === 'array') {
        www.writeU8(ARRAY_FORM);
        // An array type holds exactly one field (no field count).
        const elem = t.element || (t.fields && t.fields[0]) || { type: 'i32', mutable: false };
        www.writeValueType(elem.type);
        www.writeU8(elem.mutable ? 0x01 : 0x00);
        return;
      }
      www.writeU8(FUNC_FORM);
      www.writeVector(t.params.length, (x, j) => x.writeValueType(t.params[j]));
      www.writeVector(t.results.length, (x, j) => x.writeValueType(t.results[j]));
    }

    collectImplicitTypes_() {
      const self = this;
      const walk = (instrs) => {
        if (!Array.isArray(instrs)) {
          return;
        }
        for (const instr of instrs) {
          if (!Array.isArray(instr)) {
            continue;
          }
          const name = instr[0];
          const args = instr.slice(1);
          if ((name === 'block' || name === 'loop' || name === 'if' ||
            name === 'try' || name === 'try_table') &&
            isPlainObject(args[0]) &&
            Array.isArray(args[0].params) && Array.isArray(args[0].results)) {
            self.ensureFuncType(args[0]);
          }
          if ((name === 'call_indirect' || name === 'return_call_indirect') &&
            isPlainObject(args[0]) &&
            Array.isArray(args[0].params) && Array.isArray(args[0].results)) {
            self.ensureFuncType(args[0]);
          }
        }
      };
      for (const fn of this.funcDefs_) {
        if (fn.bodyInstrs_) {
          walk(fn.bodyInstrs_);
        }
      }
    }

    encode() {
      // All failures leave as WasmBuilderError; other errors are wrapped
      // with the original as `cause`.
      try {
        return this.encodeInternal_();
      } catch (e) {
        if (e instanceof WasmBuilderError) {
          if (e.context === undefined) {
            e.context = this.summary();
          }
          throw e;
        }
        throw new WasmBuilderError('internal error while encoding: ' + e.message, {
          code: 'internal',
          cause: e,
          context: this.summary(),
        });
      }
    }

    encodeInternal_() {
      // 1. Pre-pass: materialize implicitly-referenced function types.
      this.collectImplicitTypes_();

      // 2. Resolved index maps (imports first, then definitions).
      const funcIndex = (ref) => this.resolveFunc(ref);
      const tableIndex = (ref) => this.resolveTable(ref);
      const memIndex = (ref) => this.resolveMemory(ref);
      const globalIndex = (ref) => this.resolveGlobal(ref);
      const tagIndex = (ref) => this.resolveTag(ref);

      const w = new Writer();
      w.writeBytes([0x00, 0x61, 0x73, 0x6d]);  // magic: \0asm
      w.writeBytes([0x01, 0x00, 0x00, 0x00]);  // version 1

      const enc = new InstrEncoder(this);

      // Type Section
      // Each type entry is a rectype: a bare subtype (implicit rec group of
      // one) or a 0x4e rec group spanning consecutive rec subtypes. The outer
      // vec count is the number of rectypes, not subtypes.
      if (this.types_.length > 0) {
        w.writeSection(SECT.TYPE, (ww) => {
          // First pass: count rectypes so we can write the outer vec count.
          let rectypeCount = 0;
          let i = 0;
          while (i < this.types_.length) {
            rectypeCount++;
            if (this.types_[i].rec) {
              while (i < this.types_.length && this.types_[i].rec) {
                i++;
              }
            } else {
              i++;
            }
          }
          ww.writeU32LEB(rectypeCount);
          // Second pass: write each rectype.
          i = 0;
          while (i < this.types_.length) {
            if (this.types_[i].rec) {
              const start = i;
              while (i < this.types_.length && this.types_[i].rec) {
                i++;
              }
              ww.writeU8(REC_GROUP);
              ww.writeU32LEB(i - start);
              for (let k = start; k < i; k++) {
                this.writeTypeDef_(ww, this.types_[k]);
              }
            } else {
              this.writeTypeDef_(ww, this.types_[i]);
              i++;
            }
          }
        });
      }

      // Import section
      const numImports = this.funcImports_.length + this.tableImports_.length +
        this.memImports_.length + this.globalImports_.length +
        this.tagImports_.length;
      if (numImports > 0) {
        w.writeSection(SECT.IMPORT, (ww) => {
          // Count and entries are written once, in a single loop.
          ww.writeU32LEB(numImports);
          // Order: functions, tables, memories, globals, tags (matches the
          // index space ordering used by resolve*()).
          const writeEntry = (imp, kindByte, descWriter) => {
            ww.writeString(imp.module);
            ww.writeString(imp.name);
            ww.writeU8(kindByte);
            descWriter(ww);
          };
          for (const imp of this.funcImports_) {
            writeEntry(imp, KIND.FUNCTION, (x) => x.writeU32LEB(imp.type));
          }
          for (const imp of this.tableImports_) {
            writeEntry(imp, KIND.TABLE, (x) => {
              x.writeValueType(imp.element);
              x.writeLimits({
                initial: imp.initial,
                maximum: imp.maximum,
                shared: false,
                addressType: imp.addressType,
              }, false);
            });
          }
          for (const imp of this.memImports_) {
            writeEntry(imp, KIND.MEMORY, (x) => {
              x.writeLimits({
                initial: imp.initial,
                maximum: imp.maximum,
                shared: imp.shared,
                addressType: imp.addressType,
              }, true);
            });
          }
          for (const imp of this.globalImports_) {
            writeEntry(imp, KIND.GLOBAL, (x) => {
              x.writeValueType(imp.type);
              x.writeU8(imp.mutable ? 1 : 0);
            });
          }
          for (const imp of this.tagImports_) {
            writeEntry(imp, KIND.TAG, (x) => {
              x.writeU8(0x00);  // tag attribute: exception
              x.writeU32LEB(imp.type);
            });
          }
        });
      }

      // Function section
      if (this.funcDefs_.length > 0) {
        w.writeSection(SECT.FUNCTION, (ww) => {
          ww.writeVector(this.funcDefs_.length, (www, i) => {
            www.writeU32LEB(this.funcDefs_[i].typeIndex_);
          });
        });
      }

      // Table section
      if (this.tableDefs_.length > 0) {
        w.writeSection(SECT.TABLE, (ww) => {
          ww.writeVector(this.tableDefs_.length, (www, i) => {
            const t = this.tableDefs_[i];
            www.writeValueType(t.element);
            www.writeLimits({
              initial: t.initial,
              maximum: t.maximum,
              shared: false,
              addressType: t.addressType,
            }, false);
          });
        });
      }

      // Memory section
      if (this.memDefs_.length > 0) {
        w.writeSection(SECT.MEMORY, (ww) => {
          ww.writeVector(this.memDefs_.length, (www, i) => {
            const m = this.memDefs_[i];
            www.writeLimits({
              initial: m.initial,
              maximum: m.maximum,
              shared: m.shared,
              addressType: m.addressType,
            }, true);
          });
        });
      }

      // Global section
      if (this.globalDefs_.length > 0) {
        const globalCtx = this.makeCtx_(null);
        w.writeSection(SECT.GLOBAL, (ww) => {
          ww.writeVector(this.globalDefs_.length, (www, i) => {
            const g = this.globalDefs_[i];
            try {
              www.writeValueType(g.type);
              www.writeU8(g.mutable ? 1 : 0);
              const ew = this.encodeInitExpr_(g.init, g.type, globalCtx);
              for (const b of ew.bytes_) {
                www.writeU8(b);
              }
            } catch (e) {
              throw attributeFrame_(e, g.definitionFrame);
            }
          });
        });
      }

      // Tag section
      if (this.tagDefs_.length > 0) {
        w.writeSection(SECT.TAG, (ww) => {
          ww.writeVector(this.tagDefs_.length, (www, i) => {
            www.writeU8(0x00);  // tag attribute: exception
            www.writeU32LEB(this.tagDefs_[i].type);
          });
        });
      }

      // Export section
      // Merge explicit exports with per-function exportAs() declarations.
      const exportList = this.exports_.slice();
      for (const fn of this.funcDefs_) {
        if (fn.exportName_ !== null) {
          assert(!exportList.some((e) => e.name === fn.exportName_),
            'duplicate export name "' + fn.exportName_ + '"');
          exportList.push({ name: fn.exportName_, kind: KIND.FUNCTION, ref: fn });
        }
      }
      if (exportList.length > 0) {
        w.writeSection(SECT.EXPORT, (ww) => {
          ww.writeVector(exportList.length, (www, i) => {
            const e = exportList[i];
            www.writeString(e.name);
            www.writeU8(e.kind);
            let idx;
            switch (e.kind) {
              case KIND.FUNCTION: idx = funcIndex(e.ref); break;
              case KIND.TABLE: idx = tableIndex(e.ref); break;
              case KIND.MEMORY: idx = memIndex(e.ref); break;
              case KIND.GLOBAL: idx = globalIndex(e.ref); break;
              case KIND.TAG: idx = tagIndex(e.ref); break;
              default: throw new WasmBuilderError('bad export kind');
            }
            www.writeU32LEB(idx);
          });
        });
      }

      // Start section
      if (this.start_ !== null) {
        w.writeSection(SECT.START, (ww) => {
          ww.writeU32LEB(funcIndex(this.start_));
        });
      }

      // Elem section
      if (this.elems_.length > 0) {
        const elemCtx = this.makeCtx_(null);
        w.writeSection(SECT.ELEM, (ww) => {
          ww.writeVector(this.elems_.length, (www, i) => {
            const e = this.elems_[i];
            const isExpr = e.exprs !== undefined;
            const active = !e.passive && !e.declared;
            const tableIdx = active ? (e.table === undefined ? 0 : tableIndex(e.table)) : 0;
            // Derive the element type from the target table when not given;
            // an explicit mismatch would fail at engine decode time.
            let elementType = e.element;
            if (elementType === undefined || elementType === null) {
              elementType = this.tableEntryElement_(tableIdx);
            }
            if (elementType === undefined || elementType === null) {
              elementType = 'funcref';
            }
            if (active) {
              const tableElem = this.tableEntryElement_(tableIdx);
              if (isExpr) {
                if (tableElem !== undefined && tableElem !== null &&
                  JSON.stringify(elementType) !== JSON.stringify(tableElem)) {
                  throw new WasmBuilderError(
                    'elem segment element type ' + JSON.stringify(elementType) +
                    ' does not match table ' + tableIdx + ' (' +
                    JSON.stringify(tableElem) + ')', { definitionFrame: e.definitionFrame });
                }
              } else if (tableElem !== undefined && tableElem !== null &&
                tableElem !== 'funcref') {
                throw new WasmBuilderError(
                  'elem segment with function indices requires a funcref table',
                  { definitionFrame: e.definitionFrame });
              }
            }
            let flags;
            if (isExpr) {
              // Flag 4 carries no reftype (implicitly (ref null func));
              // flags 5/6/7 carry an explicit reftype. Flag 6 layout is
              // tableidx, offset expr, reftype, exprs.
              const typedTable = active && this.isTypedFuncrefTable_(tableIdx);
              if (e.passive) {
                flags = 5;
              } else if (e.declared) {
                flags = 7;
              } else if (typedTable || (e.table !== undefined && e.table !== 0 && e.table !== '0')) {
                flags = 6;
              } else {
                flags = 4;
              }
            } else {
              flags = e.passive ? 1 : e.declared ? 3 : (e.table !== undefined && e.table !== 0 && e.table !== '0') ? 2 : 0;
            }
            www.writeU8(flags);
            if (flags === 2 || flags === 6) {
              www.writeU32LEB(tableIdx);
            }
            if (isExpr) {
              if (flags === 4 || flags === 6) {
                const ow = this.encodeInitExpr_(e.offset, 'i32', elemCtx);
                for (const b of ow.bytes_) {
                  www.writeU8(b);
                }
              }
              if (flags !== 4) {
                www.writeValueType(elementType);
              }
              www.writeVector(e.exprs.length, (x, j) => {
                const ew = this.encodeInitExpr_(e.exprs[j], elementType, elemCtx);
                for (const b of ew.bytes_) {
                  x.writeU8(b);
                }
              });
            } else {
              if (flags === 1 || flags === 3) {
                www.writeU8(0x00);  // elemkind: func
              }
              if (flags === 0 || flags === 2) {
                const ow = this.encodeInitExpr_(e.offset, 'i32', elemCtx);
                for (const b of ow.bytes_) {
                  www.writeU8(b);
                }
              }
              www.writeVector(e.indices.length, (x, j) => {
                x.writeU32LEB(funcIndex(e.indices[j]));
              });
            }
          });
        });
      }

      // DataCount section
      const usesDataCount = this.datas_.length > 0 || this.usesDataOps_;
      if (usesDataCount) {
        w.writeSection(SECT.DATACOUNT, (ww) => {
          ww.writeU32LEB(this.datas_.length);
        });
      }

      // Code section
      if (this.funcDefs_.length > 0) {
        w.writeSection(SECT.CODE, (ww) => {
          ww.writeVector(this.funcDefs_.length, (www, i) => {
            const fn = this.funcDefs_[i];
            assert(fn.bodyInstrs_ !== null,
              'function "' + (fn.name_ || i) + '" has no body; call body() first');
            const bodyWriter = new Writer();

            // Locals: group consecutive same typed locals.
            const localGroups = [];
            for (const loc of fn.locals_) {
              const last = localGroups[localGroups.length - 1];
              if (last && last.type === loc.type) {
                last.count++;
              } else {
                localGroups.push({ type: loc.type, count: 1 });
              }
            }
            bodyWriter.writeVector(localGroups.length, (x, j) => {
              x.writeU32LEB(localGroups[j].count);
              x.writeValueType(localGroups[j].type);
            });

            // Stack type check (if enabled).
            if (this.useStackCheck_) {
              const checker = new StackTypeChecker(this);
              if (!checker.check(fn, fn.bodyInstrs_)) {
                const msg = checker.errorMessage();
                const pos = instructionPos_(checker.errorInstructionIndex_(), fn.bodyInstrs_.length);
                throw new WasmBuilderError('function "' + (fn.name_ || i) + '": ' + msg + pos, {
                  code: 'stack-check',
                  definitionFrame: fn.definitionFrame_,
                  instruction: checker.errorInstruction_(),
                  instructionIndex: checker.errorInstructionIndex_(),
                  instructionOccurrence: checker.errorOccurrence_(),
                });
              }
            }

            // Body instructions.
            const ctx = this.makeCtx_(fn);
            let ew;
            try {
              ew = enc.encode(fn.bodyInstrs_, ctx, { initialDepth: 1, finalEnd: true });
            } catch (e) {
              if (e instanceof WasmBuilderError) {
                // Attribute the error to the function being encoded.
                const pos = instructionPos_(enc.errorInstructionIndex_(), fn.bodyInstrs_.length);
                throw new WasmBuilderError(
                  'function "' + (fn.name_ || i) + '": ' + e.message + pos, {
                    code: e.code || 'encode',
                    cause: e,
                    context: e.context,
                    definitionFrame: fn.definitionFrame_,
                    instruction: enc.errorInstruction_(),
                    instructionIndex: enc.errorInstructionIndex_(),
                    instructionOccurrence: enc.errorOccurrence_(),
                  });
              }
              throw e;
            }
            for (const b of ew.bytes_) {
              bodyWriter.writeU8(b);
            }

            www.writeU32LEB(bodyWriter.length);
            for (const b of bodyWriter.bytes_) {
              www.writeU8(b);
            }
          });
        });
      }

      // Data section
      if (this.datas_.length > 0) {
        const dataCtx = this.makeCtx_(null);
        w.writeSection(SECT.DATA, (ww) => {
          ww.writeVector(this.datas_.length, (www, i) => {
            const d = this.datas_[i];
            try {
              const passive = d.passive === true;
              const memIdx = passive ? 0 : (d.memory === undefined ? 0 : memIndex(d.memory));
              const addressType = passive ? 'i32' : this.memoryAddressType(memIdx);
              const bytes = toBytes(d.data);
              if (passive) {
                www.writeU8(0x01);
              } else if (d.memory !== undefined && memIdx !== 0) {
                www.writeU8(0x02);
                www.writeU32LEB(memIdx);
              } else {
                www.writeU8(0x00);
              }
              if (!passive) {
                const ow = this.encodeInitExpr_(d.offset, addressType, dataCtx);
                for (const b of ow.bytes_) {
                  www.writeU8(b);
                }
              }
              www.writeU32LEB(bytes.length);
              for (let j = 0; j < bytes.length; j++) {
                www.writeU8(bytes[j]);
              }
            } catch (e) {
              throw attributeFrame_(e, d.definitionFrame);
            }
          });
        });
      }

      return w.result();
    }

    // Inspection helpers
    hex() {
      const bytes = this.encode();
      let out = '';
      for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
      }
      return out;
    }

    // Run the encoded bytes through the engine (the final validator).
    compile() {
      if (typeof WebAssembly === 'undefined') {
        throw new WasmBuilderError('WebAssembly is not available in this environment', {
          code: 'engine-unavailable',
        });
      }
      const bytes = this.encode();
      try {
        return new WebAssembly.Module(bytes);
      } catch (e) {
        throw new WasmEngineError(
          'Rejected the module during compilation: ' + e.message, {
            code: 'engine-compile',
            cause: e,
            context: {
              byteLength: bytes.length,
              hexPreview: this.hexPreview_(bytes),
            },
          });
      }
    }

    // Compile, then instantiate with the import object.
    instantiate(imports) {
      const module = this.compile();
      try {
        return new WebAssembly.Instance(module, imports || {});
      } catch (e) {
        throw new WasmEngineError(
          'Rejected the module during instantiation: ' + e.message, {
            code: 'engine-instantiate',
            cause: e,
            context: this.summary(),
          });
      }
    }

    // Hex preview of the first `max` bytes (for error context).
    hexPreview_(bytes, max) {
      const n = (max === undefined) ? 64 : max;
      const limit = Math.min(bytes.length, n);
      let out = '';
      for (let i = 0; i < limit; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
      }
      return bytes.length > limit ? out + '...' : out;
    }

    summary() {
      return {
        types: this.types_.length,
        funcImports: this.funcImports_.length,
        funcDefs: this.funcDefs_.length,
        tableImports: this.tableImports_.length,
        tableDefs: this.tableDefs_.length,
        memImports: this.memImports_.length,
        memDefs: this.memDefs_.length,
        globalImports: this.globalImports_.length,
        globalDefs: this.globalDefs_.length,
        tagImports: this.tagImports_.length,
        tagDefs: this.tagDefs_.length,
        elems: this.elems_.length,
        datas: this.datas_.length,
        exports: this.exports_.length,
      };
    }
  }

  // Module export
  const api = {
    WasmModuleBuilder,
    WasmFunctionBuilder,
    WasmBuilderError,
    WasmEngineError,
    formatWasmError,
    setWasmVerbose,
    OP,
    TYPE,
    SECT,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  global.WasmModuleBuilder = WasmModuleBuilder;
  global.WasmFunctionBuilder = WasmFunctionBuilder;
  global.WasmBuilderError = WasmBuilderError;
  global.WasmEngineError = WasmEngineError;
  global.formatWasmError = formatWasmError;
  global.setWasmVerbose = setWasmVerbose;
  global.fail = fail;
  global.check = check;
  global.checkThrows = checkThrows;
  global.expectError = expectError;
  global.expectInstanceOf = expectInstanceOf;
  global.runTest = runTest;
})(typeof globalThis !== 'undefined' ? globalThis :
  typeof self !== 'undefined' ? self :
    typeof window !== 'undefined' ? window : this);

/* 

*[END OF THE BUILDER]* 

*/