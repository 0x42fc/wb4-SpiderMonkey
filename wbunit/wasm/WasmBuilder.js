'use strict';

(function (global) {
  function AttributeFrame_(e, frame) {
    if (e instanceof CompilationFailed) {
      return new CompilationFailed(e.message, {
        code: e.code || 'compilation-failed',
        cause: e,
        context: e.context,
        definitionFrame: frame || e.definitionFrame,
      });
    }
    return e;
  }

  /* --- error categories --- */
  /* --- compilation failed means validation error --- */
  /* --- internal means builder bug --- */
  const CATEGORY = {
    'compilation-failed': 'CompilationFailed',
    'internal': 'InternalError',
  };

  class CompilationFailed extends Error {
    constructor(msg, options) {
      super(msg);
      this.name = CATEGORY[options && options.code] || 'CompilationFailed';
      if (options) {
        if (options.code !== undefined) this.code = options.code;
        if (options.cause !== undefined) this.cause = options.cause;
        if (options.context !== undefined) this.context = options.context;
        if (options.definitionFrame !== undefined) this.definitionFrame = options.definitionFrame;
        if (options.instruction !== undefined) this.instruction = options.instruction;
        if (options.instructionIndex !== undefined) this.instructionIndex = options.instructionIndex;
        if (options.instructionOccurrence !== undefined) this.instructionOccurrence = options.instructionOccurrence;
      }
      /* --- keep full stack trace --- */
      this.internalStack = this.stack;
    }
  }

  function assert(cond, msg) {
    if (!cond) {
      /* --- validation failure stops here --- */
      throw new CompilationFailed(msg, { code: 'compilation-failed' });
    }
  }

  /* --- bad index is validation error --- */
  class CHECK_EQ extends CompilationFailed {
    constructor(msg) {
      super(msg, { code: 'compilation-failed' });
    }
  }

  /* --- turn value into text for error messages --- */
  function Inspect_(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return "'" + v + "'";
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch (ex) { return String(v); }
    }
    return String(v);
  }

  /* --- run public builder call safely --- */
  /* --- user errors are recorded not thrown --- */
  /* --- builder bugs still propagate --- */
  function GuardPublic_(module, fn, fallback) {
    try {
      return fn();
    } catch (e) {
      if (e instanceof CompilationFailed && e.code !== 'internal') {
        module.RecordError_(e);
        return fallback;
      }
      throw e;
    }
  }

  /* --- read one stack line into file line col fn --- */
  /* --- supports fn@file:line:col and file:line:col --- */
  function FrameLocation_(loc) {
    const s = String(loc).trim();
    if (s.length === 0) return null;
    const at = s.lastIndexOf('@');
    const rest = (at >= 0) ? s.slice(at + 1) : s;
    const m = /^(.*):(\d+):(\d+)$/.exec(rest);
    if (m) {
      return {
        file: m[1],
        line: Number(m[2]),
        col: Number(m[3]),
        fn: (at >= 0) ? s.slice(0, at) : null,
      };
    }
    return null;
  }

  /* --- check if frame is inside builder code --- */
  function IsInternalFrame_(fr) {
    if (!fr) return false;
    if (fr.file && String(fr.file).indexOf('WasmBuilder.js') >= 0) return true;
    if (BUILDER_LOC_ && fr.file === BUILDER_LOC_.file &&
      fr.line <= BUILDER_LOC_.line) return true;
    if (!fr.fn) return false;
    const name = String(fr.fn).replace(/^.*\./, '');
    return name === 'FirstTestFrame_';
  }

  /* --- first stack frame outside builder --- */
  function FirstTestFrame_(stack) {
    for (const line of String(stack).split('\n')) {
      const loc = line.trim();
      if (loc.length === 0) continue;
      const fr = FrameLocation_(loc);
      if (fr && !IsInternalFrame_(fr)) return fr;
    }
    return null;
  }

  /* --- text form of one instruction --- */
  function InstrKey_(instr) {
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

  /* --- count earlier same looking instructions --- */
  function CountPriorIdentical_(instrs, index, instr) {
    const key = InstrKey_(instr);
    let n = 0;
    for (let j = 0; j < index; j++) {
      if (InstrKey_(instrs[j]) === key) n++;
    }
    return n;
  }

  /* --- make path relative to current folder --- */
  function RelativePath_(p) {
    const s = String(p).replace(/\\/g, '/');
    const base = (BUILDER_LOC_ && BUILDER_LOC_.file) ?
      String(BUILDER_LOC_.file).replace(/\\/g, '/') : '';
    if (base === '') return s;
    const a = s.split('/');
    const b = base.split('/');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return (i === 0) ? s : a.slice(i).join('/');
  }

  /* --- print one report line --- */
  /* --- use console in browser and print in shell --- */
  function Print_(s) {
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(s);
      }
      return;
    }
    if (typeof print === 'function') {
      print(s);
      return;
    }
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(s);
    }
  }

  /* --- stop script after failure --- */
  function StopAfterFailure_() {
    if (typeof quit === 'function') {
      quit(0);
    }
  }

  /* --- print clean report for rejected module --- */
  function ReportCompilationFailed_(e) {
    const name = (e && e.name) ? String(e.name) : 'CompilationFailed';
    const message = (e && e.message !== undefined) ? String(e.message) : String(e);
    let out = name + ': ' + message;
    const frames = [];
    const raw = (e && (e.internalStack || e.stack)) || '';
    for (const line of String(raw).split('\n')) {
      const loc = line.trim();
      if (loc.length === 0) continue;
      const fr = FrameLocation_(loc);
      if (!fr || IsInternalFrame_(fr)) continue;
      frames.push(RelativePath_(fr.file) + ':' + fr.line + ':' + fr.col);
      break;
    }
    if (frames.length > 0) {
      out += '\n\n@Stack:\n' + frames.join('\n');
    }
    Print_(out);
  }

  /* --- section ids --- */
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

  /* --- external kind bytes --- */
  const KIND = {
    FUNCTION: 0x00,
    TABLE: 0x01,
    MEMORY: 0x02,
    GLOBAL: 0x03,
    TAG: 0x04,
  };

  /* --- value types --- */
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
    /* --- packed field types --- */
    /* --- only valid inside struct or array fields --- */
    i8: 0x78,
    i16: 0x77,
  };

  /* --- i8 and i16 fields act as i32 on stack --- */
  function FieldStackType(t) {
    return (t === 'i8' || t === 'i16') ? 'i32' : t;
  }

  /* --- heap types for ref null and typed refs --- */
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

  const BLOCK_VOID = 0x40;
  const FUNC_FORM = 0x60;
  const STRUCT_FORM = 0x5f;
  const ARRAY_FORM = 0x5e;
  const REC_GROUP = 0x4e;
  const SUB_NO_FINAL = 0x50;
  const SUB_FINAL = 0x4f;
  const REF_NULLABLE = 0x63;
  const REF_NONNULL = 0x64;

  /* --- core opcodes --- */
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

  /* --- single byte numeric ops --- */
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

  /* --- misc prefix ops after 0xfc --- */
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

  /* --- load and store ops with size --- */
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

  /* --- thread prefix ops after 0xfe --- */
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

  /* --- rmw base opcode plus width variant --- */
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

  /* --- simd ops after 0xfd prefix --- */
  /* --- shape tells encoder and checker how to handle each op --- */
  /* --- shapes: L load S store LL lane load LS lane store --- */
  /* --- C const SH shuffle SW swizzle SP splat --- */
  /* --- EX extract RP replace CMP compare UN unary --- */
  /* --- BI binary TER bitselect AT any all true --- */
  /* --- BM bitmask SHF shift --- */
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

  /* --- gc ops after 0xfb prefix --- */
  /* --- shape tells stack effect --- */
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

  /* --- operand and result types for conversions --- */
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

  /* --- byte writer with leb128 --- */
  const f32View = new DataView(new ArrayBuffer(4));
  const f64View = new DataView(new ArrayBuffer(8));

  class Writer {
    constructor() {
      this.bytes_ = [];
    }

    get Length() {
      return this.bytes_.length;
    }

    Result() {
      return new Uint8Array(this.bytes_);
    }

    WriteU8(v) {
      assert(Number.isInteger(v) && v >= 0 && v <= 0xff,
        'WriteU8: value out of range: ' + v);
      this.bytes_.push(v);
      return this;
    }

    /* --- unsigned leb128 for up to 32 bits --- */
    WriteU32LEB(v) {
      assert((typeof v === 'bigint') ||
        (Number.isInteger(v) && v >= 0), 'WriteU32LEB: bad value ' + v);
      let big = (typeof v === 'bigint') ? v : BigInt(v);
      assert(big >= 0n, 'WriteU32LEB: negative value ' + v);
      assert(big <= 0xffffffffn, 'WriteU32LEB: value too large: ' + v);
      do {
        let b = Number(big & 0x7fn);
        big >>= 7n;
        if (big !== 0n) {
          b |= 0x80;
        }
        this.WriteU8(b);
      } while (big !== 0n);
      return this;
    }

    /* --- unsigned leb128 without 32 bit limit --- */
    WriteU64LEB(v) {
      assert((typeof v === 'bigint') ||
        (Number.isInteger(v) && v >= 0), 'WriteU64LEB: bad value ' + v);
      let big = (typeof v === 'bigint') ? v : BigInt(v);
      assert(big >= 0n, 'WriteU64LEB: negative value ' + v);
      do {
        let b = Number(big & 0x7fn);
        big >>= 7n;
        if (big !== 0n) {
          b |= 0x80;
        }
        this.WriteU8(b);
      } while (big !== 0n);
      return this;
    }

    /* --- signed leb128 for 32 bit value --- */
    WriteS32LEB(v) {
      assert(Number.isInteger(v), 'WriteS32LEB: not an integer: ' + v);
      assert(v >= -0x80000000 && v <= 0x7fffffff,
        'WriteS32LEB: out of int32 range: ' + v);
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
        this.WriteU8(b);
      }
      return this;
    }

    /* --- signed leb128 for 64 bit value --- */
    WriteS64LEB(v) {
      let big = (typeof v === 'bigint') ? v : BigInt(v);
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
        this.WriteU8(b);
      }
      return this;
    }

    WriteBytes(arr) {
      if (typeof arr === 'string') {
        return this.WriteString(arr);
      }
      for (let i = 0; i < arr.length; i++) {
        this.WriteU8(arr[i]);
      }
      return this;
    }

    WriteString(s) {
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
      this.WriteU32LEB(enc.length);
      for (let i = 0; i < enc.length; i++) {
        this.WriteU8(enc[i]);
      }
      return this;
    }

    WriteVector(n, itemWriter) {
      assert(Number.isInteger(n) && n >= 0, 'WriteVector: bad count ' + n);
      this.WriteU32LEB(n);
      for (let i = 0; i < n; i++) {
        itemWriter(this, i);
      }
      return this;
    }

    /* --- write section id size and content --- */
    WriteSection(id, contentWriter) {
      const tmp = new Writer();
      contentWriter(tmp);
      this.WriteU8(id);
      this.WriteU32LEB(tmp.Length);
      this.bytes_.push.apply(this.bytes_, tmp.bytes_);
      return this;
    }

    /* --- write value type name byte or typed ref --- */
    WriteValueType(t) {
      if (typeof t === 'number') {
        this.WriteU8(t);
        return this;
      }
      if (typeof t === 'string') {
        assert(Object.prototype.hasOwnProperty.call(TYPE, t),
          'unknown value type "' + t + '"');
        this.WriteU8(TYPE[t]);
        return this;
      }
      if (typeof t === 'object' && t !== null && t.ref !== undefined) {
        this.WriteU8(t.nullable === false ? REF_NONNULL : REF_NULLABLE);
        this.WriteHeapType(t.ref);
        return this;
      }
      throw new CompilationFailed('cannot encode value type: ' + JSON.stringify(t));
    }

    /* --- write heap type index or abstract name --- */
    WriteHeapType(ht) {
      if (typeof ht === 'number') {
        assert(Number.isInteger(ht) && ht >= 0,
          'heap type index must be >= 0');
        this.WriteS32LEB(ht);
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
        this.WriteU8(HEAP[normalized]);
        return this;
      }
      throw new CompilationFailed('cannot encode heap type: ' + JSON.stringify(ht));
    }

    /* --- write block type void value type or index --- */
    WriteBlockType(bt, typeIndexForObject) {
      if (bt === null || bt === undefined) {
        this.WriteU8(BLOCK_VOID);
        return this;
      }
      if (typeof bt === 'string') {
        this.WriteValueType(bt);
        return this;
      }
      if (typeof bt === 'number') {
        assert(Number.isInteger(bt) && bt >= 0,
          'block type index must be >= 0');
        this.WriteS32LEB(bt);
        return this;
      }
      if (typeof bt === 'object' && typeof typeIndexForObject === 'number') {
        this.WriteS32LEB(typeIndexForObject);
        return this;
      }
      throw new CompilationFailed('cannot encode block type: ' + JSON.stringify(bt));
    }

    /* --- write limits block --- */
    WriteLimits(limits, forMemory) {
      let flags = 0;
      if (limits.maximum !== undefined && limits.maximum !== null) {
        flags |= 0x01;
      }
      if (limits.shared) {
        assert(forMemory, 'tables cannot be shared');
        flags |= 0x02;
      }
      const is64 = limits.addressType === 'i64' || limits.addressType === 'I64';
      if (is64) {
        flags |= 0x04;
      }
      const validInt = (v) => (typeof v === 'bigint') || (Number.isInteger(v) && v >= 0);
      if (!is64 && validInt(limits.initial) && BigInt(limits.initial) > 0xffffffffn) {
        assert(false, 'limits: initial ' + limits.initial + ' exceeds 32 bit range');
      }
      if ((flags & 0x01) && validInt(limits.maximum) &&
        BigInt(limits.maximum) > 0xffffffffn) {
        assert(false, 'limits: maximum ' + limits.maximum + ' exceeds 32 bit range');
      }
      if ((flags & 0x01) && validInt(limits.initial) && validInt(limits.maximum) &&
        BigInt(limits.maximum) < BigInt(limits.initial)) {
        assert(false, 'limits: maximum ' + limits.maximum +
          ' is below initial ' + limits.initial);
      }
      this.WriteU8(flags);
      this.WriteU64LEB(limits.initial);
      if (flags & 0x01) {
        this.WriteU64LEB(limits.maximum);
      }
      return this;
    }

    WriteF32(v) {
      f32View.setFloat32(0, v, true);
      for (let i = 0; i < 4; i++) {
        this.WriteU8(f32View.getUint8(i));
      }
      return this;
    }

    WriteF64(v) {
      f64View.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) {
        this.WriteU8(f64View.getUint8(i));
      }
      return this;
    }
  }

  /* --- helpers --- */
  function IsFunctionBuilder(v) {
    return v instanceof WasmFunctionBuilder ||
      (v !== null && typeof v === 'object' &&
        typeof v.constructor === 'function' &&
        v.constructor.name === 'WasmFunctionBuilder');
  }

  function IsPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v) &&
      !IsFunctionBuilder(v);
  }

  /* --- turn string or array into uint8array --- */
  function ToBytes(data) {
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
    throw new CompilationFailed('cannot interpret data as bytes');
  }

  function IsRefTypeName(t) {
    return typeof t === 'string' &&
      (Object.prototype.hasOwnProperty.call(TYPE, t) &&
        TYPE[t] >= 0x60 && TYPE[t] <= 0x7a &&
        t !== 'i8' && t !== 'i16') ||
      (t === 'nullfuncref' || t === 'nullexternref' ||
        t === 'nullanyref' || t === 'nullexnref');
  }

  /* --- lane count from op name --- */
  function SimdLaneCount(name, byteSize) {
    const m = /^v?[fi](\d+)x(\d+)/.exec(name);
    if (m) return Number(m[2]);
    if (byteSize) return 16 / byteSize;
    return 0;
  }

  /* --- check instruction argument count --- */
  function ExpectArgCount_(name, args, min, max) {
    const want = (min === max)
      ? min + ' argument' + (min === 1 ? '' : 's')
      : min + '..' + max + ' arguments';
    assert(args.length >= min && args.length <= max,
      name + ': expected ' + want + ', got ' + args.length);
  }

  /* --- only i32 and i64 address types allowed --- */
  function CheckAddressType_(desc, what) {
    assert(desc.addressType === undefined || desc.addressType === 'i32' ||
      desc.addressType === 'i64',
      what + ': addressType must be i32 or i64, got ' + desc.addressType);
  }

  class InstrEncoder {
    constructor(builder) {
      this.builder_ = builder;
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      this.instrs_ = null;
    }

    ErrorInstruction_() {
      return this.curIndex_ >= 0 ? this.curInstr_ : undefined;
    }

    ErrorInstructionIndex_() {
      return this.curIndex_ >= 0 ? this.curIndex_ : undefined;
    }

    ErrorOccurrence_() {
      if (this.curIndex_ < 0 || !this.instrs_) return 0;
      return CountPriorIdentical_(this.instrs_, this.curIndex_, this.curInstr_);
    }

    /* --- encode instruction list --- */
    Encode(instrs, ctx, options) {
      options = options || {};
      this.instrs_ = instrs;
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      const initialDepth = options.initialDepth === undefined ? 1 : options.initialDepth;
      const finalEnd = options.finalEnd === undefined ? true : options.finalEnd;
      const w = new Writer();
      const control = [];
      for (let i = 0; i < initialDepth; i++) {
        control.push('body');
      }
      let terminated = false;

      for (let i = 0; i < instrs.length; i++) {
        const instr = instrs[i];
        const name = Array.isArray(instr) ? instr[0] : instr;
        if (typeof name !== 'string') {
          throw new CompilationFailed('bad instruction: expected \'[op, args]\' or an op name string, got \'' +
            InstrKey_(instr) + '\'');
        }
        const args = Array.isArray(instr) ? instr.slice(1) : [];
        this.curInstr_ = instr;
        this.curIndex_ = i;

        /* --- nothing allowed after outermost end --- */
        if (terminated) {
          throw new CompilationFailed(
            'instruction appears after the outermost end');
        }

        /* --- track control flow structure --- */
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
            assert(Number.isInteger(args[0]) && args[0] >= 0 &&
              args[0] < control.length - 1,
              'delegate depth ' + args[0] + ' out of range (nesting ' +
              (control.length - 1) + ')');
            control.pop();
            break;
          case 'end':
            if (control.length === initialDepth) {
              terminated = true;
            }
            control.pop();
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

        this.EncodeOne(name, args, ctx, w, control.length);
      }

      if (terminated) {
        assert(control.length === initialDepth - 1,
          'unbalanced end in instruction list');
      } else {
        assert(control.length === initialDepth,
          'unbalanced blocks: ' + (control.length - initialDepth) +
          ' unclosed block(s)');
        if (finalEnd) {
          w.WriteU8(OP.End);
        }
      }
      return w;
    }

    EncodeOne(name, args, ctx, w, controlDepth) {
      /* --- control flow --- */
      if (name === 'unreachable') {
        w.WriteU8(OP.Unreachable);
        return;
      }
      if (name === 'nop') {
        w.WriteU8(OP.Nop);
        return;
      }
      if (name === 'block' || name === 'loop' || name === 'if') {
        w.WriteU8(name === 'block' ? OP.Block : name === 'loop' ? OP.Loop : OP.If);
        this.WriteBlockTypeArg(args, ctx, w);
        return;
      }
      if (name === 'try') {
        w.WriteU8(OP.Try);
        this.WriteBlockTypeArg(args, ctx, w);
        return;
      }
      if (name === 'try_table') {
        w.WriteU8(OP.TryTable);
        this.WriteBlockTypeArg([args[0]], ctx, w);
        const catches = args[1];
        assert(Array.isArray(catches), 'try_table: expected catches array');
        w.WriteVector(catches.length, (ww, i) => {
          const c = catches[i];
          assert(Array.isArray(c) && c.length >= 2,
            'try_table: malformed catch clause');
          const isAll = (c[0] === 'all' || c[0] === 'catch_all');
          const capture = c[2] === true;
          let flags = 0;
          if (capture) {
            flags |= 0x01;
          }
          if (isAll) {
            flags |= 0x02;
          }
          ww.WriteU8(flags);
          if (!isAll) {
            assert(c[0] !== undefined && c[0] !== null,
              'try_table: missing tag reference');
            if (typeof c[0] === 'number') {
              this.CheckIndex_(c[0], 'tag', this.builder_.NumTags());
            }
            ww.WriteU32LEB(ctx.ResolveTag(c[0]));
          }
          assert(Number.isInteger(c[1]) && c[1] >= 0 &&
            c[1] < controlDepth - 1,
            'try_table: catch depth ' + c[1] + ' exceeds nesting ' +
            (controlDepth - 1));
          ww.WriteU32LEB(c[1]);
        });
        return;
      }
      if (name === 'else') {
        w.WriteU8(OP.Else);
        return;
      }
      if (name === 'end') {
        w.WriteU8(OP.End);
        return;
      }
      if (name === 'br') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.Br);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'br_if') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.BrIf);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'br_table') {
        w.WriteU8(OP.BrTable);
        const depths = args[0];
        assert(Array.isArray(depths), 'br_table: expected depths array');
        w.WriteU32LEB(depths.length);
        for (const d of depths) {
          assert(Number.isInteger(d) && d >= 0, 'br_table: bad depth ' + d);
          w.WriteU32LEB(d);
        }
        assert(Number.isInteger(args[1]) && args[1] >= 0,
          'br_table: bad default depth ' + args[1]);
        w.WriteU32LEB(args[1]);
        return;
      }
      if (name === 'return') {
        w.WriteU8(OP.Return);
        return;
      }

      /* --- exceptions --- */
      if (name === 'throw') {
        w.WriteU8(OP.Throw);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'tag', this.builder_.NumTags());
        }
        w.WriteU32LEB(ctx.ResolveTag(args[0]));
        return;
      }
      if (name === 'rethrow') {
        w.WriteU8(OP.Rethrow);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'throw_ref') {
        w.WriteU8(OP.ThrowRef);
        return;
      }
      if (name === 'catch') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.Catch);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'tag', this.builder_.NumTags());
        }
        w.WriteU32LEB(ctx.ResolveTag(args[0]));
        return;
      }
      if (name === 'catch_all') {
        w.WriteU8(OP.CatchAll);
        return;
      }
      if (name === 'delegate') {
        w.WriteU8(OP.Delegate);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'drop') {
        w.WriteU8(OP.Drop);
        return;
      }
      if (name === 'select') {
        if (args.length > 0 && Array.isArray(args[0])) {
          w.WriteU8(OP.SelectTyped);
          const types = args[0];
          assert(Array.isArray(types) && types.length > 0, 'select: expected type list');
          w.WriteVector(types.length, (ww, i) => ww.WriteValueType(types[i]));
        } else {
          w.WriteU8(OP.SelectNumeric);
        }
        return;
      }
      if (name === 'select_t' || name === 'select.typed' || name === 'select_t_') {
        w.WriteU8(OP.SelectTyped);
        const types = args[0];
        assert(Array.isArray(types) && types.length > 0, 'select: expected type list');
        w.WriteVector(types.length, (ww, i) => ww.WriteValueType(types[i]));
        return;
      }

      /* --- locals --- */
      if (name === 'local.get') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'local', ctx.NumLocals());
        }
        w.WriteU8(OP.LocalGet);
        w.WriteU32LEB(ctx.ResolveLocal(args[0]));
        return;
      }
      if (name === 'local.set') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'local', ctx.NumLocals());
        }
        w.WriteU8(OP.LocalSet);
        w.WriteU32LEB(ctx.ResolveLocal(args[0]));
        return;
      }
      if (name === 'local.tee') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'local', ctx.NumLocals());
        }
        w.WriteU8(OP.LocalTee);
        w.WriteU32LEB(ctx.ResolveLocal(args[0]));
        return;
      }

      /* --- globals --- */
      if (name === 'global.get') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'global', this.builder_.NumGlobals());
        }
        w.WriteU8(OP.GlobalGet);
        w.WriteU32LEB(ctx.ResolveGlobal(args[0]));
        return;
      }
      if (name === 'global.set') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'global', this.builder_.NumGlobals());
        }
        w.WriteU8(OP.GlobalSet);
        w.WriteU32LEB(ctx.ResolveGlobal(args[0]));
        return;
      }

      /* --- constants --- */
      if (name === 'i32.const') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.I32Const);
        w.WriteS32LEB(args[0]);
        return;
      }
      if (name === 'i64.const') {
        ExpectArgCount_(name, args, 1, 1);
        assert(typeof args[0] === 'bigint' || Number.isInteger(args[0]),
          'i64.const: expected an integer or BigInt, got ' + args[0]);
        w.WriteU8(OP.I64Const);
        w.WriteS64LEB(args[0]);
        return;
      }
      if (name === 'f32.const') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.F32Const);
        w.WriteF32(args[0]);
        return;
      }
      if (name === 'f64.const') {
        ExpectArgCount_(name, args, 1, 1);
        w.WriteU8(OP.F64Const);
        w.WriteF64(args[0]);
        return;
      }

      /* --- reference ops --- */
      if (name === 'ref.null') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
        }
        w.WriteU8(OP.RefNull);
        w.WriteHeapType(args[0]);
        return;
      }
      if (name === 'ref.is_null') {
        w.WriteU8(OP.RefIsNull);
        return;
      }
      if (name === 'ref.func') {
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'function', this.builder_.NumFuncs());
        }
        w.WriteU8(OP.RefFunc);
        w.WriteU32LEB(ctx.ResolveFunc(args[0]));
        return;
      }
      if (name === 'ref.as_non_null') {
        w.WriteU8(OP.RefAsNonNull);
        return;
      }
      if (name === 'br_on_null') {
        w.WriteU8(OP.BrOnNull);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'br_on_non_null') {
        w.WriteU8(OP.BrOnNonNull);
        w.WriteU32LEB(args[0]);
        return;
      }
      if (name === 'ref.eq') {
        w.WriteU8(OP.RefEq);
        return;
      }

      /* --- calls --- */
      if (name === 'call') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'function', this.builder_.NumFuncs());
        }
        w.WriteU8(OP.Call);
        w.WriteU32LEB(ctx.ResolveFunc(args[0]));
        return;
      }
      if (name === 'call_indirect') {
        w.WriteU8(OP.CallIndirect);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
        }
        if (args.length > 1 && typeof args[1] === 'number') {
          this.CheckIndex_(args[1], 'table', this.builder_.NumTables());
        }
        w.WriteU32LEB(ctx.ResolveType(args[0]));
        w.WriteU32LEB(args.length > 1 ? ctx.ResolveTable(args[1]) : 0);
        return;
      }
      if (name === 'return_call') {
        ExpectArgCount_(name, args, 1, 1);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'function', this.builder_.NumFuncs());
        }
        w.WriteU8(OP.ReturnCall);
        w.WriteU32LEB(ctx.ResolveFunc(args[0]));
        return;
      }
      if (name === 'return_call_indirect') {
        w.WriteU8(OP.ReturnCallIndirect);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
        }
        if (args.length > 1 && typeof args[1] === 'number') {
          this.CheckIndex_(args[1], 'table', this.builder_.NumTables());
        }
        w.WriteU32LEB(ctx.ResolveType(args[0]));
        w.WriteU32LEB(args.length > 1 ? ctx.ResolveTable(args[1]) : 0);
        return;
      }
      if (name === 'call_ref') {
        w.WriteU8(OP.CallRef);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
        }
        w.WriteU32LEB(ctx.ResolveType(args[0]));
        return;
      }
      if (name === 'return_call_ref') {
        w.WriteU8(OP.ReturnCallRef);
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
        }
        w.WriteU32LEB(ctx.ResolveType(args[0]));
        return;
      }

      /* --- memory load and store --- */
      if (Object.prototype.hasOwnProperty.call(LOAD_STORE, name)) {
        ctx.RequireMemory();
        const info = LOAD_STORE[name];
        w.WriteU8(info.op);
        const memIndex = this.MemIndexChecked_(args);
        this.WriteMemArg(args, info.size, w, false,
          ctx.MemoryAddressType(memIndex));
        return;
      }

      /* --- memory size and grow --- */
      if (name === 'memory.size') {
        ctx.RequireMemory();
        if (args.length > 0 && typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'memory', this.builder_.NumMemories());
        }
        w.WriteU8(OP.MemorySize);
        w.WriteU32LEB(args.length > 0 ? ctx.ResolveMemory(args[0]) : 0);
        return;
      }
      if (name === 'memory.grow') {
        ctx.RequireMemory();
        if (args.length > 0 && typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'memory', this.builder_.NumMemories());
        }
        w.WriteU8(OP.MemoryGrow);
        w.WriteU32LEB(args.length > 0 ? ctx.ResolveMemory(args[0]) : 0);
        return;
      }

      /* --- misc prefix 0xfc --- */
      if (Object.prototype.hasOwnProperty.call(MISC, name)) {
        const op = MISC[name];
        w.WriteU8(OP.MiscPrefix);
        w.WriteU32LEB(op);
        switch (name) {
          case 'memory.init':
            ctx.RequireMemory();
            this.CheckIndex_(args[0], 'data', this.builder_.NumData());
            if (args.length > 1 && typeof args[1] === 'number') {
              this.CheckIndex_(args[1], 'memory', this.builder_.NumMemories());
            }
            w.WriteU32LEB(ctx.ResolveData(args[0]));
            w.WriteU32LEB(args.length > 1 ? ctx.ResolveMemory(args[1]) : 0);
            break;
          case 'data.drop':
            this.CheckIndex_(args[0], 'data', this.builder_.NumData());
            w.WriteU32LEB(ctx.ResolveData(args[0]));
            break;
          case 'memory.copy':
            ctx.RequireMemory();
            if (args.length > 0 && typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'memory', this.builder_.NumMemories());
            }
            if (args.length > 1 && typeof args[1] === 'number') {
              this.CheckIndex_(args[1], 'memory', this.builder_.NumMemories());
            }
            w.WriteU32LEB(args.length > 0 ? ctx.ResolveMemory(args[0]) : 0);
            w.WriteU32LEB(args.length > 1 ? ctx.ResolveMemory(args[1]) : 0);
            break;
          case 'memory.fill':
            ctx.RequireMemory();
            if (args.length > 0 && typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'memory', this.builder_.NumMemories());
            }
            w.WriteU32LEB(args.length > 0 ? ctx.ResolveMemory(args[0]) : 0);
            break;
          case 'memory.discard':
            ctx.RequireMemory();
            if (args.length > 0 && typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'memory', this.builder_.NumMemories());
            }
            w.WriteU32LEB(args.length > 0 ? ctx.ResolveMemory(args[0]) : 0);
            break;
          case 'table.init':
            ctx.RequireTable();
            this.CheckIndex_(args[0], 'elem', this.builder_.NumElems());
            if (args.length > 1 && typeof args[1] === 'number') {
              this.CheckIndex_(args[1], 'table', this.builder_.NumTables());
            }
            w.WriteU32LEB(ctx.ResolveElem(args[0]));
            w.WriteU32LEB(args.length > 1 ? ctx.ResolveTable(args[1]) : 0);
            break;
          case 'elem.drop':
            this.CheckIndex_(args[0], 'elem', this.builder_.NumElems());
            w.WriteU32LEB(ctx.ResolveElem(args[0]));
            break;
          case 'table.copy':
            ctx.RequireTable();
            if (args.length > 0 && typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'table', this.builder_.NumTables());
            }
            if (args.length > 1 && typeof args[1] === 'number') {
              this.CheckIndex_(args[1], 'table', this.builder_.NumTables());
            }
            w.WriteU32LEB(args.length > 0 ? ctx.ResolveTable(args[0]) : 0);
            w.WriteU32LEB(args.length > 1 ? ctx.ResolveTable(args[1]) : 0);
            break;
          case 'table.grow':
          case 'table.size':
          case 'table.fill':
            ctx.RequireTable();
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'table', this.builder_.NumTables());
            }
            w.WriteU32LEB(ctx.ResolveTable(args[0]));
            break;
          default:
            break;
        }
        return;
      }

      /* --- table get and set --- */
      if (name === 'table.get') {
        ctx.RequireTable();
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'table', this.builder_.NumTables());
        }
        w.WriteU8(OP.TableGet);
        w.WriteU32LEB(ctx.ResolveTable(args[0]));
        return;
      }
      if (name === 'table.set') {
        ctx.RequireTable();
        if (typeof args[0] === 'number') {
          this.CheckIndex_(args[0], 'table', this.builder_.NumTables());
        }
        w.WriteU8(OP.TableSet);
        w.WriteU32LEB(ctx.ResolveTable(args[0]));
        return;
      }

      /* --- atomics 0xfe --- */
      if (name === 'memory.atomic.notify') {
        ctx.RequireMemory();
        w.WriteU8(OP.ThreadPrefix);
        w.WriteU32LEB(0x00);
        const mi = this.MemIndexChecked_(args);
        this.WriteMemArg(args, 4, w, true, ctx.MemoryAddressType(mi));
        return;
      }
      if (name === 'memory.atomic.wait32' || name === 'memory.atomic.wait64') {
        ctx.RequireMemory();
        w.WriteU8(OP.ThreadPrefix);
        w.WriteU32LEB(name === 'memory.atomic.wait32' ? 0x01 : 0x02);
        const mi = this.MemIndexChecked_(args);
        this.WriteMemArg(args, name === 'memory.atomic.wait32' ? 4 : 8, w, true,
          ctx.MemoryAddressType(mi));
        return;
      }
      if (name === 'memory.atomic.fence') {
        w.WriteU8(OP.ThreadPrefix);
        w.WriteU32LEB(0x03);
        w.WriteU8(0x00);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(THREAD_LOAD, name)) {
        ctx.RequireMemory();
        w.WriteU8(OP.ThreadPrefix);
        w.WriteU32LEB(THREAD_LOAD[name]);
        const size = name.includes('8') ? 1 : name.includes('16') ? 2 :
          name.includes('32') ? 4 : (name.includes('i64') ? 8 : 4);
        const mi = this.MemIndexChecked_(args);
        this.WriteMemArg(args, size, w, true, ctx.MemoryAddressType(mi));
        return;
      }
      if (Object.prototype.hasOwnProperty.call(THREAD_STORE, name)) {
        ctx.RequireMemory();
        w.WriteU8(OP.ThreadPrefix);
        w.WriteU32LEB(THREAD_STORE[name]);
        const size = name.includes('8') ? 1 : name.includes('16') ? 2 :
          name.includes('32') ? 4 : (name.includes('i64') ? 8 : 4);
        const mi = this.MemIndexChecked_(args);
        this.WriteMemArg(args, size, w, true, ctx.MemoryAddressType(mi));
        return;
      }
      for (const rmw of THREAD_RMW) {
        const prefix = 'i32.atomic.' + rmw.name;
        const i64prefix = 'i64.atomic.' + rmw.name;
        if (name === prefix || name.startsWith(prefix + '8') ||
          name.startsWith(prefix + '16') || name === i64prefix ||
          name.startsWith(i64prefix + '8') || name.startsWith(i64prefix + '16') ||
          name.startsWith(i64prefix + '32')) {
          ctx.RequireMemory();
          let variant = -1;
          for (let i = 0; i < THREAD_RMW_WIDTHS.length; i++) {
            const width = THREAD_RMW_WIDTHS[i];
            let canonical;
            if (width === 'i32') {
              canonical = 'i32.atomic.' + rmw.name;
            } else if (width === 'i64') {
              canonical = 'i64.atomic.' + rmw.name;
            } else {
              const bits = width.split('_')[0];
              const suffix = width.split('_')[1];
              canonical = bits + '.atomic.' + rmw.name +
                suffix.slice(0, -1) + '_u';
            }
            if (canonical === name) {
              variant = i;
              break;
            }
          }
          if (variant < 0) {
            continue;
          }
          w.WriteU8(OP.ThreadPrefix);
          w.WriteU32LEB(rmw.base + variant);
          const size = THREAD_RMW_ATOMICITY[THREAD_RMW_WIDTHS[variant]];
          const mi = this.MemIndexChecked_(args);
          this.WriteMemArg(args, size, w, true, ctx.MemoryAddressType(mi));
          return;
        }
      }

      /* --- single byte numeric ops --- */
      if (Object.prototype.hasOwnProperty.call(UNARY_BYTE, name)) {
        w.WriteU8(UNARY_BYTE[name]);
        return;
      }

      /* --- simd 0xfd --- */
      if (Object.prototype.hasOwnProperty.call(SIMD, name)) {
        const [op, shape, spec] = SIMD[name];
        w.WriteU8(OP.SimdPrefix);
        w.WriteU32LEB(op);
        switch (shape) {
          case 'L':
          case 'S': {
            ctx.RequireMemory();
            const size = spec;
            const memIndex = this.MemIndexChecked_(args);
            this.WriteMemArg(args, size, w, false,
              ctx.MemoryAddressType(memIndex));
            break;
          }
          case 'LL':
          case 'LS': {
            ctx.RequireMemory();
            const size = spec;
            const lane = args[args.length - 1];
            const memArgs = args.slice(0, -1);
            const memIndex = this.MemIndexChecked_(memArgs);
            this.WriteMemArg(memArgs, size, w, false,
              ctx.MemoryAddressType(memIndex));
            assert(Number.isInteger(lane) && lane >= 0 && lane < 16 / size,
              name + ': lane index ' + lane + ' out of range (0..' +
              (16 / size - 1) + ')');
            w.WriteU8(lane);
            break;
          }
          case 'C':
            if (args.length >= 2 && typeof args[0] === 'string' &&
              Array.isArray(args[1])) {
              this.WriteV128Bytes_(args, w);
            } else {
              this.WriteV128Bytes_(args[0], w);
            }
            break;
          case 'SH':
            this.WriteLaneIndices_(args[0], w, 16);
            break;
          case 'EX':
          case 'RP': {
            assert(args.length >= 1, 'extract_lane/replace_lane needs a lane index');
            const lanes = SimdLaneCount(name, undefined);
            assert(lanes === 0 || (Number.isInteger(args[0]) &&
              args[0] >= 0 && args[0] < lanes),
              name + ': lane index ' + args[0] + ' out of range (0..' +
              (lanes - 1) + ')');
            w.WriteU8(args[0]);
            break;
          }
          default:
            break;
        }
        return;
      }

      /* --- gc 0xfb --- */
      if (Object.prototype.hasOwnProperty.call(GC, name)) {
        const [op, shape] = GC[name];
        w.WriteU8(OP.GcPrefix);
        w.WriteU32LEB(op);
        switch (shape) {
          case 'snew':
          case 'snewdef':
          case 'anew':
          case 'anewdef':
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            w.WriteU32LEB(ctx.ResolveType(args[0]));
            break;
          case 'alen':
            break;
          case 'sget':
          case 'sget_su':
          case 'sset': {
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            const stIdx = ctx.ResolveType(args[0]);
            const st = this.builder_.types_[stIdx];
            this.CheckIndex_(args[1], 'field',
              st && Array.isArray(st.fields) ? st.fields.length : 0);
            w.WriteU32LEB(stIdx);
            w.WriteU32LEB(args[1]);
            break;
          }
          case 'anewfixed':
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            w.WriteU32LEB(ctx.ResolveType(args[0]));
            w.WriteU32LEB(args[1]);
            break;
          case 'anewseg':
          case 'aseginit': {
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            w.WriteU32LEB(ctx.ResolveType(args[0]));
            const isData = name === 'array.new_data' || name === 'array.init_data';
            w.WriteU32LEB(isData ? ctx.ResolveData(args[1]) : ctx.ResolveElem(args[1]));
            break;
          }
          case 'aget':
          case 'aget_su':
          case 'aset':
          case 'afill':
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            w.WriteU32LEB(ctx.ResolveType(args[0]));
            break;
          case 'acopy':
            if (typeof args[0] === 'number') {
              this.CheckIndex_(args[0], 'type', this.builder_.NumTypes());
            }
            if (typeof args[1] === 'number') {
              this.CheckIndex_(args[1], 'type', this.builder_.NumTypes());
            }
            w.WriteU32LEB(ctx.ResolveType(args[0]));
            w.WriteU32LEB(ctx.ResolveType(args[1]));
            break;
          case 'rtest':
          case 'rcast':
            this.WriteHeapTypeArg_(args[0], w);
            break;
          case 'rbrancast':
            this.WriteBrOnCast_(args, w, ctx, controlDepth);
            break;
          default:
            break;
        }
        return;
      }

      throw new CompilationFailed('unknown instruction "' + name + '"');
    }

    /* --- write 16 bytes of v128 const --- */
    WriteV128Bytes_(v, w) {
      if (Array.isArray(v) && v.length === 2 &&
        typeof v[0] === 'string' && Array.isArray(v[1])) {
        const laneType = v[0];
        const vals = v[1];
        const WriteLE = (n, bytes) => {
          for (let i = 0; i < bytes; i++) {
            w.WriteU8(Number(BigInt.asUintN(bytes * 8, BigInt(n)) >> BigInt(i * 8)) & 0xff);
          }
        };
        switch (laneType) {
          case 'i8x16':
            assert(vals.length === 16, 'i8x16.const expects 16 lanes');
            for (const x of vals) WriteLE(x, 1);
            break;
          case 'i16x8':
            assert(vals.length === 8, 'i16x8.const expects 8 lanes');
            for (const x of vals) WriteLE(x, 2);
            break;
          case 'i32x4':
            assert(vals.length === 4, 'i32x4.const expects 4 lanes');
            for (const x of vals) WriteLE(x, 4);
            break;
          case 'i64x2':
            assert(vals.length === 2, 'i64x2.const expects 2 lanes');
            for (const x of vals) WriteLE(x, 8);
            break;
          case 'f32x4':
            assert(vals.length === 4, 'f32x4.const expects 4 lanes');
            for (const x of vals) {
              f32View.setFloat32(0, x, true);
              for (let i = 0; i < 4; i++) w.WriteU8(f32View.getUint8(i));
            }
            break;
          case 'f64x2':
            assert(vals.length === 2, 'f64x2.const expects 2 lanes');
            for (const x of vals) {
              f64View.setFloat64(0, x, true);
              for (let i = 0; i < 8; i++) w.WriteU8(f64View.getUint8(i));
            }
            break;
          default:
            throw new CompilationFailed('unknown v128 lane type "' + laneType + '"');
        }
        return;
      }
      if (typeof v === 'bigint') {
        let x = v;
        for (let i = 0; i < 16; i++) {
          w.WriteU8(Number(x & 0xffn));
          x >>= 8n;
        }
        return;
      }
      if (typeof v === 'string') {
        assert(/^[0-9a-fA-F]{32}$/.test(v),
          'v128.const expects a 32-hex-digit string, got "' + v + '"');
        for (let i = 0; i < 32; i += 2) {
          w.WriteU8(parseInt(v.substr(i, 2), 16));
        }
        return;
      }
      assert(Array.isArray(v) && v.length === 16, 'v128.const expects 16 bytes');
      for (let i = 0; i < 16; i++) {
        assert(Number.isInteger(v[i]) && v[i] >= 0 && v[i] < 256, 'bad v128 byte');
        w.WriteU8(v[i]);
      }
    }

    /* --- write i8x16 shuffle lane indices --- */
    WriteLaneIndices_(v, w, count) {
      assert(Array.isArray(v) && v.length === count, 'shuffle expects ' + count + ' lanes');
      for (let i = 0; i < count; i++) {
        assert(Number.isInteger(v[i]) && v[i] >= 0 && v[i] < 32, 'bad shuffle lane');
        w.WriteU8(v[i]);
      }
    }

    /* --- heap type immediate for ref test cast br on cast --- */
    WriteHeapTypeArg_(ht, w) {
      if (typeof ht === 'number') {
        assert(Number.isInteger(ht) && ht >= 0, 'heap type index must be >= 0');
        this.CheckIndex_(ht, 'type', this.builder_.NumTypes());
        w.WriteS32LEB(ht);
        return;
      }
      if (typeof ht === 'string') {
        w.WriteHeapType(ht);
        return;
      }
      if (IsPlainObject(ht) && ht.ref !== undefined) {
        w.WriteHeapType(ht.ref);
        return;
      }
      throw new CompilationFailed('cannot encode heap type immediate: ' + JSON.stringify(ht));
    }

    /* --- br_on_cast flags depth src dst --- */
    WriteBrOnCast_(args, w, ctx, controlDepth) {
      const flags = args[0];
      assert(Number.isInteger(flags) && flags >= 0 && flags <= 3,
        'br_on_cast flags must be 0..3');
      w.WriteU8(flags);
      const depth = args[1];
      assert(Number.isInteger(depth) && depth >= 0 && depth < controlDepth,
        'br_on_cast depth ' + depth + ' out of range (nesting ' +
        controlDepth + ')');
      w.WriteU32LEB(depth);
      this.WriteHeapTypeArg_(args[2], w);
      this.WriteHeapTypeArg_(args[3], w);
    }

    /* --- memory index from memarg args --- */
    MemArgIndex_(args) {
      if (args.length === 0) {
        return 0;
      }
      if (Array.isArray(args[0])) {
        return args[0].length > 2 ? args[0][2] : 0;
      }
      return args.length > 2 ? args[2] : 0;
    }

    /* --- bounds check numeric index --- */
    CheckIndex_(idx, space, size) {
      if (!(Number.isSafeInteger(idx) && idx >= 0 && idx < size)) {
        throw new CHECK_EQ('invalid ' + space + ' index ' + idx +
          ' (module has ' + size + ')');
      }
    }

    /* --- bounds check memory index in memarg --- */
    MemIndexChecked_(args) {
      const mi = this.MemArgIndex_(args);
      if (typeof mi === 'number') {
        this.CheckIndex_(mi, 'memory', this.builder_.NumMemories());
      }
      return mi;
    }

    /* --- write memarg flags align index offset --- */
    /* --- atomic ops must use natural alignment --- */
    WriteMemArg(args, size, w, atomic, addrType) {
      assert(addrType === 'i32' || addrType === 'i64',
        'memarg: bad address type ' + addrType);
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
      const memIndex = this.builder_.ResolveMemory(this.MemArgIndex_(args));
      let flags = Math.log2(align);
      if (memIndex !== 0 || this.builder_.NumMemories() > 1) {
        flags |= 0x40;
      }
      w.WriteU32LEB(flags);
      if (flags & 0x40) {
        w.WriteU32LEB(memIndex);
      }
      if (addrType === 'i64') {
        w.WriteU64LEB(offset);
      } else {
        w.WriteU32LEB(offset);
      }
    }

    WriteBlockTypeArg(args, ctx, w) {
      const bt = args[0];
      if (typeof bt === 'number') {
        this.CheckIndex_(bt, 'type', this.builder_.NumTypes());
      }
      if (bt !== null && bt !== undefined && typeof bt === 'object') {
        const idx = ctx.EnsureFuncType(bt);
        w.WriteBlockType(bt, idx);
      } else {
        w.WriteBlockType(bt, undefined);
      }
    }
  }

  /* --- stack type checker --- */
  const BOTTOM = 'bottom';

  function TypesMatch(actual, expected, builder) {
    if (actual === BOTTOM || expected === BOTTOM) return true;
    if (actual === expected) return true;

    const a = typeof actual === 'string' ? actual : null;
    const e = typeof expected === 'string' ? expected : null;
    if (a && e && a.startsWith('null') && !e.startsWith('null')) {
      return e === a.slice(4) || e === a.slice(4).replace('null', '') ||
        e === a.slice(4, -4) + 'ref';
    }
    if (a && e) {
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

    if (IsPlainObject(actual) && typeof expected === 'string') {
      const heap = actual.ref;
      if (typeof heap === 'string') {
        if (heap === 'any' && expected === 'anyref') return true;
        if (heap === 'eq' && (expected === 'eqref' || expected === 'anyref')) return true;
        if (heap === 'func' && expected === 'funcref') return true;
        if (heap === 'extern' && expected === 'externref') return true;
        if (heap === 'exn' && expected === 'exnref') return true;
        if ((heap === 'struct' || heap === 'i31' || heap === 'array') &&
          (expected === 'eqref' || expected === 'anyref' || expected === heap + 'ref')) return true;
      }
      if (typeof heap === 'number') {
        const t = builder ? builder.types_[heap] : null;
        if (t && t.kind === 'func') {
          if (expected === 'funcref') return true;
        } else if (t && (t.kind === 'struct' || t.kind === 'array')) {
          if (expected === 'anyref' || expected === 'eqref' ||
            expected === 'structref' || expected === 'arrayref') return true;
        } else if (expected === 'anyref') {
          return true;
        }
      }
    }
    if (IsPlainObject(actual) && IsPlainObject(expected)) {
      if (actual.ref === expected.ref) {
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

  /* --- instruction arity table --- */
  /* --- wrong count is validation finding --- */
  const INSTR_ARITY = {
    unreachable: [0, 0], nop: [0, 0], end: [0, 0], else: [0, 0],
    return: [0, 0], drop: [0, 0], catch_all: [0, 0], throw_ref: [0, 0],
    'ref.is_null': [0, 0], 'ref.eq': [0, 0], 'ref.as_non_null': [0, 0],
    'ref.i31': [0, 0], 'i31.new': [0, 0], 'i31.get_s': [0, 0], 'i31.get_u': [0, 0],
    'memory.atomic.fence': [0, 0],
    block: [0, 1], loop: [0, 1], if: [0, 1], try: [0, 1],
    select: [0, 1],
    'memory.size': [0, 1], 'memory.grow': [0, 1],
    br: [1, 1], br_if: [1, 1], br_on_null: [1, 1], br_on_non_null: [1, 1],
    call: [1, 1], return_call: [1, 1],
    call_ref: [1, 1], return_call_ref: [1, 1],
    throw: [1, 1], rethrow: [1, 1], catch: [1, 1], delegate: [1, 1],
    try_table: [1, 1],
    'local.get': [1, 1], 'local.set': [1, 1], 'local.tee': [1, 1],
    'global.get': [1, 1], 'global.set': [1, 1],
    'i32.const': [1, 1], 'i64.const': [1, 1], 'f32.const': [1, 1], 'f64.const': [1, 1],
    'ref.null': [1, 1], 'ref.func': [1, 1],
    'table.get': [1, 1], 'table.set': [1, 1],
    'call_indirect': [1, 2], 'return_call_indirect': [1, 2],
    br_table: [2, 2],
  };
  for (const n of Object.keys(UNARY_BYTE)) INSTR_ARITY[n] = [0, 0];
  for (const n of Object.keys(CONV)) INSTR_ARITY[n] = [0, 0];
  INSTR_ARITY['table.size'] = [1, 1];
  INSTR_ARITY['table.grow'] = [1, 1];
  INSTR_ARITY['table.fill'] = [1, 1];

  class CompilationChecker {
    constructor(builder) {
      this.builder_ = builder;
      this.err_ = null;
    }

    Check(fnBuilder, instrs) {
      this.fn_ = fnBuilder;
      this.err_ = null;
      this.errInstr_ = undefined;
      this.errIndex_ = -1;
      this.errOccurrence_ = 0;
      this.terminated_ = false;
      this.stack_ = [];
      const funcType = this.builder_.FuncType_(this.fn_ ? this.fn_.typeIndex_ : 0);
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
      this.localTypes_ = [];
      const params = this.fn_ ? this.builder_.FuncTypeParams_(this.fn_) : [];
      for (const p of params) this.localTypes_.push(p);
      if (this.fn_) {
        for (const loc of this.fn_.locals_) this.localTypes_.push(loc.type);
      }

      this.instrs_ = instrs;
      for (let i = 0; i < instrs.length; i++) {
        if (this.err_) break;
        const instr = instrs[i];
        const name = Array.isArray(instr) ? instr[0] : instr;
        if (typeof name !== 'string') {
          this.curInstr_ = instr;
          this.curIndex_ = i;
          this.Error_('bad instruction: expected \'[op, args]\' or an op name string, got \'' +
            InstrKey_(instr) + '\'');
          break;
        }
        const args = Array.isArray(instr) ? instr.slice(1) : [];
        this.curInstr_ = instr;
        this.curIndex_ = i;
        this.CheckOne_(name, args);
      }
      this.curInstr_ = undefined;
      this.curIndex_ = -1;
      if (!this.err_) {
        const funcType = this.builder_.FuncType_(this.fn_ ? this.fn_.typeIndex_ : 0);
        const results = funcType ? funcType.results : [];
        if (this.control_.length <= 1) {
          for (let i = results.length - 1; i >= 0; i--) {
            this.PopExpected_(results[i]);
          }
          if (this.stack_.length !== 0) {
            this.Error_(this.stack_.length + ' value(s) left on the stack at end of function');
          }
        } else {
          this.Error_((this.control_.length - 1) + ' unclosed block(s)');
        }
      }
      return this.err_ === null;
    }

    ErrorMessage() {
      return this.err_ ? this.err_.message : null;
    }

    Error_(msg) {
      if (!this.err_) {
        this.err_ = new CompilationFailed('TypeError: ' + msg);
        if (this.curIndex_ !== undefined && this.curIndex_ >= 0) {
          this.errInstr_ = this.curInstr_;
          this.errIndex_ = this.curIndex_;
          this.errOccurrence_ =
            CountPriorIdentical_(this.instrs_, this.curIndex_, this.curInstr_);
        }
      }
    }

    ErrorInstruction_() {
      return this.errInstr_;
    }

    ErrorInstructionIndex_() {
      return this.errIndex_ >= 0 ? this.errIndex_ : undefined;
    }

    ErrorOccurrence_() {
      return this.errOccurrence_ || 0;
    }

    Push_(t) {
      this.stack_.push(t);
    }

    Pop_() {
      if (this.stack_.length > 0) {
        return this.stack_.pop();
      }
      const frame = this.control_[this.control_.length - 1];
      if (frame && frame.unreachable) {
        return BOTTOM;
      }
      this.Error_('not enough values on the stack');
      return BOTTOM;
    }

    PopExpected_(expected) {
      const actual = this.Pop_();
      if (!TypesMatch(actual, expected, this.builder_)) {
        this.Error_('expected type ' + this.TypeName_(expected) +
          ', got ' + this.TypeName_(actual) + '.');
      }
      return actual;
    }

    TypeName_(t) {
      if (typeof t === 'string') return t;
      if (t === BOTTOM) return 'bottom';
      return JSON.stringify(t);
    }

    PopN_(types) {
      const result = [];
      for (let i = types.length - 1; i >= 0; i--) {
        result.unshift(this.PopExpected_(types[i]));
      }
      return result;
    }

    /* --- resolve block type to params and results --- */
    ResolveBlockType_(bt) {
      if (bt === null || bt === undefined) return { params: [], results: [] };
      if (typeof bt === 'string') return { params: [], results: [bt] };
      if (typeof bt === 'number') {
        const tt = this.builder_.types_[bt];
        if (tt) return { params: tt.params || [], results: tt.results || [] };
        this.Error_('block type index ' + bt + ' out of range (' +
          this.builder_.types_.length + ' types)');
        return { params: [], results: [] };
      }
      if (IsPlainObject(bt) && bt.params) {
        return { params: bt.params, results: bt.results };
      }
      this.Error_('cannot resolve block type ' + JSON.stringify(bt));
      return { params: [], results: [] };
    }

    /* --- true if in unreachable polymorphic state --- */
    IsUnreachable_() {
      for (let i = this.control_.length - 1; i >= 0; i--) {
        if (this.control_[i].unreachable) return true;
      }
      return false;
    }

    CheckOne_(name, args) {
      if (this.terminated_) {
        this.Error_('instruction appears after the outermost end');
        return;
      }
      const arity = INSTR_ARITY[name];
      if (arity !== undefined &&
        (args.length < arity[0] || args.length > arity[1])) {
        const want = (arity[0] === arity[1])
          ? arity[0] + ' argument' + (arity[0] === 1 ? '' : 's')
          : arity[0] + '..' + arity[1] + ' arguments';
        this.Error_(name + ': expected ' + want + ', got ' + args.length);
        return;
      }
      /* --- control flow --- */
      if (name === 'unreachable') {
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'nop') return;
      if (name === 'block' || name === 'loop' || name === 'if') {
        const bt = this.ResolveBlockType_(args[0]);
        if (name === 'if') {
          this.PopExpected_('i32');
        }
        this.PopN_(bt.params);
        this.control_.push({
          kind: name,
          labelTypes: name === 'loop' ? bt.params : bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        for (const p of bt.params) this.Push_(p);
        return;
      }
      if (name === 'else') {
        const frame = this.control_[this.control_.length - 1];
        if (frame.kind !== 'if') {
          this.Error_('else outside of if');
          return;
        }
        frame.hasElse = true;
        if (!frame.unreachable) {
          for (let i = frame.endTypes.length - 1; i >= 0; i--) {
            this.PopExpected_(frame.endTypes[i]);
          }
          if (this.stack_.length !== frame.height) {
            this.Error_((this.stack_.length - frame.height) +
              ' value(s) left on the stack at end of then-branch');
          }
        }
        this.stack_.length = frame.height;
        for (const p of frame.blockParams) this.Push_(p);
        frame.unreachable = false;
        return;
      }
      if (name === 'end') {
        if (this.control_.length === 0) {
          this.Error_('unbalanced end');
          return;
        }
        const frame = this.control_.pop();
        if (frame.kind === 'if' && !frame.hasElse) {
          const p = frame.blockParams;
          const r = frame.endTypes;
          if (p.length !== r.length) {
            this.Error_('if without else requires params to match results (' +
              p.length + ' vs ' + r.length + ')');
          } else {
            for (let i = 0; i < p.length; i++) {
              if (!(TypesMatch(p[i], r[i], this.builder_) &&
                TypesMatch(r[i], p[i], this.builder_))) {
                this.Error_('if without else: parameter and result types differ');
                break;
              }
            }
          }
        }
        if (!frame.unreachable) {
          for (let i = frame.endTypes.length - 1; i >= 0; i--) {
            this.PopExpected_(frame.endTypes[i]);
          }
          if (this.stack_.length !== frame.height) {
            this.Error_((this.stack_.length - frame.height) +
              ' value(s) left on the stack at end of block');
          }
        } else if (this.stack_.length - frame.height > frame.endTypes.length) {
          this.Error_('unused values not explicitly dropped by end of block');
        }
        this.stack_.length = frame.height;
        for (const r of frame.endTypes) this.Push_(r);
        if (frame.kind === 'func') {
          this.terminated_ = true;
        }
        return;
      }
      if (name === 'br') {
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.Error_('br: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.PopExpected_(target.labelTypes[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'br_if') {
        this.PopExpected_('i32');
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.Error_('br_if: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.PopExpected_(target.labelTypes[i]);
        }
        for (const t of target.labelTypes) this.Push_(t);
        return;
      }
      if (name === 'br_table') {
        this.PopExpected_('i32');
        const depths = args[0];
        const def = args[1];
        const InRange = (d) => Number.isInteger(d) && d >= 0 && d < this.control_.length;
        if (!Array.isArray(depths)) {
          this.Error_('br_table: expected a depths array');
          return;
        }
        if (!InRange(def)) {
          this.Error_('br_table: default depth ' + def + ' out of range');
          return;
        }
        for (const d of depths) {
          if (!InRange(d)) {
            this.Error_('br_table: depth ' + d + ' out of range');
            return;
          }
        }
        const targets = depths.map((d) => this.control_[this.control_.length - 1 - d]);
        targets.push(this.control_[this.control_.length - 1 - def]);
        const labelTypes = targets[0].labelTypes;
        for (const t of targets) {
          if (t.labelTypes.length !== labelTypes.length) {
            this.Error_('br_table: target label arities differ');
            return;
          }
          for (let i = 0; i < labelTypes.length; i++) {
            if (!(TypesMatch(t.labelTypes[i], labelTypes[i], this.builder_) &&
              TypesMatch(labelTypes[i], t.labelTypes[i], this.builder_))) {
              this.Error_('br_table: target label types differ');
              return;
            }
          }
        }
        if (!this.IsUnreachable_()) {
          for (let i = labelTypes.length - 1; i >= 0; i--) {
            this.PopExpected_(labelTypes[i]);
          }
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return') {
        const funcType = this.builder_.FuncType_(this.fn_ ? this.fn_.typeIndex_ : 0);
        for (let i = funcType.results.length - 1; i >= 0; i--) {
          this.PopExpected_(funcType.results[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }

      /* --- locals --- */
      if (name === 'local.get') {
        const idx = this.fn_ ? this.fn_.ResolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.Push_(this.localTypes_[idx]);
        } else {
          this.Error_('local.get: index ' + idx + ' out of range');
        }
        return;
      }
      if (name === 'local.set') {
        const idx = this.fn_ ? this.fn_.ResolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.PopExpected_(this.localTypes_[idx]);
        } else {
          this.Error_('local.set: index ' + idx + ' out of range');
        }
        return;
      }
      if (name === 'local.tee') {
        const idx = this.fn_ ? this.fn_.ResolveLocal(args[0]) : 0;
        if (idx >= 0 && idx < this.localTypes_.length) {
          this.PopExpected_(this.localTypes_[idx]);
          this.Push_(this.localTypes_[idx]);
        } else {
          this.Error_('local.tee: index ' + idx + ' out of range');
        }
        return;
      }

      /* --- globals --- */
      if (name === 'global.get') {
        const idx = this.builder_.ResolveGlobal(args[0]);
        const entry = this.builder_.GlobalAt(idx);
        assert(entry !== null, 'global index ' + idx + ' out of range');
        this.Push_(entry.type);
        return;
      }
      if (name === 'global.set') {
        const idx = this.builder_.ResolveGlobal(args[0]);
        const entry = this.builder_.GlobalAt(idx);
        assert(entry !== null, 'global index ' + idx + ' out of range');
        if (!entry.mutable) {
          this.Error_('global.set: global ' + idx + ' is immutable');
          return;
        }
        this.PopExpected_(entry.type);
        return;
      }

      /* --- table ops --- */
      if (name === 'table.get') {
        const elem = this.TableElemType_(args[0]);
        this.PopExpected_('i32');
        this.Push_(elem);
        return;
      }
      if (name === 'table.set') {
        const elem = this.TableElemType_(args[0]);
        this.PopExpected_(elem);
        this.PopExpected_('i32');
        return;
      }
      if (name === 'table.size') {
        this.Push_('i32');
        return;
      }
      if (name === 'table.grow') {
        const elem = this.TableElemType_(args[0]);
        this.PopExpected_('i32');
        this.PopExpected_(elem);
        this.Push_('i32');
        return;
      }
      if (name === 'table.fill') {
        const elem = this.TableElemType_(args[0]);
        this.PopExpected_('i32');
        this.PopExpected_(elem);
        this.PopExpected_('i32');
        return;
      }

      /* --- constants --- */
      if (name === 'i32.const') { this.Push_('i32'); return; }
      if (name === 'i64.const') { this.Push_('i64'); return; }
      if (name === 'f32.const') { this.Push_('f32'); return; }
      if (name === 'f64.const') { this.Push_('f64'); return; }

      /* --- drop --- */
      if (name === 'drop') { this.Pop_(); return; }

      /* --- select --- */
      const typedSelect = args.length > 0 && Array.isArray(args[0]);
      if (name === 'select' && !typedSelect) {
        this.PopExpected_('i32');
        const t2 = this.Pop_();
        const t1 = this.Pop_();
        if ((t1 !== BOTTOM && this.IsRefLike_(t1)) ||
          (t2 !== BOTTOM && this.IsRefLike_(t2))) {
          this.Error_('select on reference types requires select_t');
          return;
        }
        if (t1 !== BOTTOM && t2 !== BOTTOM &&
          !(TypesMatch(t1, t2, this.builder_) && TypesMatch(t2, t1, this.builder_))) {
          this.Error_('select requires matching types, got ' + this.TypeName_(t1) +
            ' and ' + this.TypeName_(t2));
        }
        this.Push_(t1 !== BOTTOM ? t1 : t2);
        return;
      }
      if (name === 'select_t' || name === 'select.typed' || name === 'select_t_' ||
        (name === 'select' && typedSelect)) {
        const types = args[0];
        if (!Array.isArray(types) || types.length === 0) {
          this.Error_('select_t: expected a non-empty type list');
          return;
        }
        this.PopExpected_('i32');
        for (let round = 0; round < 2; round++) {
          for (let i = types.length - 1; i >= 0; i--) {
            this.PopExpected_(types[i]);
          }
        }
        for (const t of types) this.Push_(t);
        return;
      }

      /* --- memory --- */
      if (name === 'memory.size') {
        if (!this.builder_.HasMemory()) {
          this.Error_('memory.size: no memory declared');
          return;
        }
        const mi = args.length > 0 ? this.builder_.ResolveMemory(args[0]) : 0;
        this.Push_(this.builder_.MemoryAddressType(mi));
        return;
      }
      if (name === 'memory.grow') {
        if (!this.builder_.HasMemory()) {
          this.Error_('memory.grow: no memory declared');
          return;
        }
        const mi = args.length > 0 ? this.builder_.ResolveMemory(args[0]) : 0;
        this.PopExpected_(this.builder_.MemoryAddressType(mi));
        this.Push_(this.builder_.MemoryAddressType(mi));
        return;
      }

      /* --- calls --- */
      if (name === 'call') {
        const funcIdx = this.builder_.ResolveFunc(args[0]);
        const tt = this.builder_.FuncType_(this.builder_.FuncTypeIdxForIndex_(funcIdx));
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
          for (const r of tt.results) this.Push_(r);
        }
        return;
      }
      if (name === 'call_indirect') {
        const typeIdx = this.builder_.ResolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.CheckIndirectCall_(tt, typeIdx, args)) {
          return;
        }
        this.PopExpected_('i32');
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
          for (const r of tt.results) this.Push_(r);
        }
        return;
      }
      if (name === 'call_ref') {
        const typeIdx = this.builder_.ResolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.CheckFuncTypeRef_(tt, typeIdx, 'call_ref')) {
          return;
        }
        this.PopExpected_({ ref: typeIdx, nullable: true });
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
          for (const r of tt.results) this.Push_(r);
        }
        return;
      }
      if (name === 'return_call') {
        const funcIdx = this.builder_.ResolveFunc(args[0]);
        const tt = this.builder_.FuncType_(this.builder_.FuncTypeIdxForIndex_(funcIdx));
        if (tt) {
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return_call_indirect') {
        const typeIdx = this.builder_.ResolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.CheckIndirectCall_(tt, typeIdx, args)) {
          return;
        }
        if (tt) {
          this.PopExpected_('i32');
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'return_call_ref') {
        const typeIdx = this.builder_.ResolveTypeRef(args[0]);
        const tt = this.builder_.types_[typeIdx];
        if (!this.CheckFuncTypeRef_(tt, typeIdx, 'return_call_ref')) {
          return;
        }
        if (tt) {
          this.PopExpected_({ ref: typeIdx, nullable: true });
          for (let i = tt.params.length - 1; i >= 0; i--) this.PopExpected_(tt.params[i]);
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }

      /* --- ref ops --- */
      if (name === 'ref.null') {
        const ht = args[0];
        if (typeof ht === 'number') {
          this.builder_.ResolveTypeRef(ht);
          this.Push_({ ref: ht, nullable: true });
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
            this.Error_('ref.null: unknown heap type "' + ht + '"');
            return;
          }
          this.Push_(nullType);
          return;
        }
        this.Error_('ref.null: cannot resolve heap type ' + JSON.stringify(ht));
        return;
      }
      if (name === 'ref.is_null') {
        const t = this.Pop_();
        if (!this.IsRefLike_(t)) {
          this.Error_('ref.is_null: expected a reference, got ' + this.TypeName_(t));
          return;
        }
        this.Push_('i32');
        return;
      }
      if (name === 'ref.func') {
        const funcIdx = this.builder_.ResolveFunc(args[0]);
        if (!this.builder_.IsFuncDeclared(funcIdx)) {
          this.Error_('ref.func: function ' + funcIdx +
            ' is not declared (export it or reference it in an elem segment)');
          return;
        }
        const tt = this.builder_.FuncTypeIdxForIndex_(funcIdx);
        this.Push_({ ref: tt, nullable: false });
        return;
      }
      if (name === 'ref.eq') {
        const t2 = this.Pop_();
        const t1 = this.Pop_();
        const EqOk = (t) => {
          if (t === BOTTOM) return true;
          if (IsPlainObject(t) && t.ref !== undefined) {
            const tt = this.builder_.types_[t.ref];
            return tt && (tt.kind === 'struct' || tt.kind === 'array');
          }
          if (typeof t !== 'string') return false;
          return t === 'eqref' || t === 'i31ref' || t === 'structref' ||
            t === 'arrayref' || t === 'nulleqref' || t === 'nulli31ref' ||
            t === 'nullstructref' || t === 'nullarrayref';
        };
        if (!EqOk(t1) || !EqOk(t2)) {
          this.Error_('ref.eq: expected eqref-compatible operands, got ' +
            this.TypeName_(t1) + ' and ' + this.TypeName_(t2));
          return;
        }
        this.Push_('i32');
        return;
      }
      if (name === 'ref.as_non_null') {
        const t = this.Pop_();
        if (!this.IsRefLike_(t)) {
          this.Error_('ref.as_non_null: expected a reference, got ' + this.TypeName_(t));
          return;
        }
        this.Push_(this.NonNullRef_(t));
        return;
      }
      if (name === 'br_on_null') {
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.Error_('br_on_null: depth ' + depth + ' out of range');
          return;
        }
        const t = this.Pop_();
        if (!this.IsRefLike_(t)) {
          this.Error_('br_on_null: expected a reference, got ' + this.TypeName_(t));
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        for (let i = target.labelTypes.length - 1; i >= 0; i--) {
          this.PopExpected_(target.labelTypes[i]);
        }
        for (const v of target.labelTypes) this.Push_(v);
        this.Push_(this.NonNullRef_(t));
        return;
      }
      if (name === 'br_on_non_null') {
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
          this.Error_('br_on_non_null: depth ' + depth + ' out of range');
          return;
        }
        const t = this.Pop_();
        if (!this.IsRefLike_(t)) {
          this.Error_('br_on_non_null: expected a reference, got ' + this.TypeName_(t));
          return;
        }
        const target = this.control_[this.control_.length - 1 - depth];
        const lt = target.labelTypes;
        if (lt.length === 0 || !this.IsRefLike_(lt[lt.length - 1])) {
          this.Error_('br_on_non_null: target label must end with a reference type');
          return;
        }
        if (!TypesMatch(t, lt[lt.length - 1], this.builder_)) {
          this.Error_('br_on_non_null: value type ' + this.TypeName_(t) +
            ' does not match target label type ' + this.TypeName_(lt[lt.length - 1]));
          return;
        }
        for (let i = lt.length - 1; i >= 0; i--) {
          this.PopExpected_(lt[i]);
        }
        for (let i = lt.length - 2; i >= 0; i--) {
          this.Push_(lt[i]);
        }
        this.Push_(this.NonNullRef_(t));
        return;
      }

      /* --- memory load store --- */
      if (this.builder_.IsLoadStoreName_(name)) {
        const unreachable = this.IsUnreachable_();
        const isStore = name.includes('.store');
        const base = isStore ? name.split('.store')[0] : name.split('.load')[0];
        const valType = base === 'i64' ? 'i64' : base === 'f64' ? 'f64' :
          base === 'f32' ? 'f32' : 'i32';
        const memIdx = this.builder_.MemargMemIndex(args);
        const addrType = this.builder_.MemoryAddressType(memIdx);
        if (isStore) {
          if (!unreachable) this.PopExpected_(valType);
          if (!unreachable) this.PopExpected_(addrType);
        } else {
          if (!unreachable) this.PopExpected_(addrType);
          this.Push_(valType);
        }
        return;
      }

      /* --- atomics --- */
      if (name.startsWith('i32.atomic.') || name.startsWith('i64.atomic.')) {
        const valType = name.startsWith('i64.atomic.') ? 'i64' : 'i32';
        const addrType = this.MemAddrType_(args);
        if (name.includes('.load')) {
          this.PopExpected_(addrType);
          this.Push_(valType);
        } else if (name.includes('.store')) {
          this.PopExpected_(valType);
          this.PopExpected_(addrType);
        } else if (name.includes('.cmpxchg')) {
          this.PopExpected_(valType);
          this.PopExpected_(valType);
          this.PopExpected_(addrType);
          this.Push_(valType);
        } else {
          this.PopExpected_(valType);
          this.PopExpected_(addrType);
          this.Push_(valType);
        }
        return;
      }
      if (name === 'memory.atomic.notify') {
        this.PopExpected_('i32');
        this.PopExpected_(this.MemAddrType_(args));
        this.Push_('i32');
        return;
      }
      if (name === 'memory.atomic.wait32' || name === 'memory.atomic.wait64') {
        const valType = name === 'memory.atomic.wait32' ? 'i32' : 'i64';
        this.PopExpected_('i64');
        this.PopExpected_(valType);
        this.PopExpected_(this.MemAddrType_(args));
        this.Push_('i32');
        return;
      }
      if (name === 'memory.atomic.fence') return;

      /* --- conversions --- */
      if (Object.prototype.hasOwnProperty.call(CONV, name)) {
        const [src, dst] = CONV[name];
        this.PopExpected_(src);
        this.Push_(dst);
        return;
      }

      /* --- single byte numeric ops --- */
      if (name.startsWith('i32.')) {
        if (this.IsBinary_(name)) {
          this.PopExpected_('i32'); this.PopExpected_('i32'); this.Push_('i32');
        } else {
          this.PopExpected_('i32'); this.Push_('i32');
        }
        return;
      }
      if (name.startsWith('i64.')) {
        if (this.IsBinary_(name)) {
          this.PopExpected_('i64'); this.PopExpected_('i64');
          this.Push_(this.IsComparison_(name) ? 'i32' : 'i64');
        } else {
          this.PopExpected_('i64'); this.Push_('i64');
        }
        return;
      }
      if (name.startsWith('f32.')) {
        if (this.IsBinary_(name)) {
          this.PopExpected_('f32'); this.PopExpected_('f32');
          this.Push_(this.IsComparison_(name) ? 'i32' : 'f32');
        } else {
          this.PopExpected_('f32'); this.Push_('f32');
        }
        return;
      }
      if (name.startsWith('f64.')) {
        if (this.IsBinary_(name)) {
          this.PopExpected_('f64'); this.PopExpected_('f64');
          this.Push_(this.IsComparison_(name) ? 'i32' : 'f64');
        } else {
          this.PopExpected_('f64'); this.Push_('f64');
        }
        return;
      }

      /* --- simd --- */
      if (Object.prototype.hasOwnProperty.call(SIMD, name)) {
        const [op, shape, spec] = SIMD[name];
        this.CheckSimd_(name, shape, spec, args);
        return;
      }

      /* --- gc --- */
      if (Object.prototype.hasOwnProperty.call(GC, name)) {
        const [op, shape] = GC[name];
        this.CheckGc_(name, shape, args);
        return;
      }

      /* --- exceptions --- */
      if (name === 'throw') {
        const tagIdx = this.builder_.ResolveTag(args[0]);
        const tagType = tagIdx >= 0 ? this.builder_.TagTypeAt(tagIdx) : null;
        if (tagType) {
          for (let i = tagType.params.length - 1; i >= 0; i--) {
            this.PopExpected_(tagType.params[i]);
          }
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'rethrow') {
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 &&
          depth < this.control_.length)) {
          this.Error_('rethrow: depth ' + depth + ' out of range (nesting ' +
            this.control_.length + ')');
          return;
        }
        const frame = this.control_[this.control_.length - 1 - depth];
        if (!frame.inCatch) {
          this.Error_('rethrow: depth ' + depth + ' does not target a catch block');
          return;
        }
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'throw_ref') {
        this.PopExpected_('exnref');
        this.control_[this.control_.length - 1].unreachable = true;
        return;
      }
      if (name === 'try') {
        const bt = this.ResolveBlockType_(args[0]);
        this.PopN_(bt.params);
        this.control_.push({
          kind: name,
          labelTypes: bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        for (const p of bt.params) this.Push_(p);
        return;
      }
      if (name === 'try_table') {
        const bt = this.ResolveBlockType_(args[0]);
        this.PopN_(bt.params);
        this.control_.push({
          kind: 'try_table',
          labelTypes: bt.results,
          endTypes: bt.results,
          blockParams: bt.params,
          hasElse: false,
          height: this.stack_.length,
          unreachable: false,
        });
        for (const p of bt.params) this.Push_(p);
        const catches = args[1];
        if (!Array.isArray(catches)) {
          this.Error_('try_table: expected catches array');
          return;
        }
        for (const c of catches) {
          if (!Array.isArray(c) || c.length < 2) {
            this.Error_('try_table: malformed catch clause');
            continue;
          }
          const isAll = (c[0] === 'all' || c[0] === 'catch_all');
          const depth = c[1];
          if (!(Number.isInteger(depth) && depth >= 0 &&
            depth < this.control_.length - 1)) {
            this.Error_('try_table: catch depth ' + depth + ' out of range');
            continue;
          }
          const target = this.control_[this.control_.length - 2 - depth];
          let branchTypes = [];
          if (!isAll) {
            let tagIdx;
            try {
              tagIdx = this.builder_.ResolveTag(c[0]);
            } catch (e) {
              this.Error_('try_table: invalid tag reference ' +
                JSON.stringify(c[0]));
              continue;
            }
            const tagType = this.builder_.TagTypeAt(tagIdx);
            if (!tagType) {
              this.Error_('try_table: invalid tag reference ' +
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
            this.Error_('try_table: catch payload (' + branchTypes.length +
              ' values) does not match target label (' +
              labelTypes.length + ' values)');
            continue;
          }
          for (let i = 0; i < branchTypes.length; i++) {
            if (!TypesMatch(branchTypes[i], labelTypes[i], this.builder_)) {
              this.Error_('try_table: catch payload type ' +
                this.TypeName_(branchTypes[i]) + ' is not a subtype of ' +
                this.TypeName_(labelTypes[i]));
              break;
            }
          }
        }
        return;
      }
      if (name === 'catch') {
        const frame = this.control_[this.control_.length - 1];
        if (!frame || (frame.kind !== 'try' && frame.kind !== 'catch')) {
          this.Error_('catch outside of try');
          return;
        }
        frame.inCatch = true;
        this.stack_.length = frame.height;
        for (const p of frame.blockParams) this.Push_(p);
        const tagIdx = this.builder_.ResolveTag(args[0]);
        const tagType = tagIdx >= 0 ? this.builder_.TagTypeAt(tagIdx) : null;
        if (tagType) {
          for (const p of tagType.params) this.Push_(p);
        }
        frame.unreachable = false;
        return;
      }
      if (name === 'catch_all') {
        const frame = this.control_[this.control_.length - 1];
        if (!frame || (frame.kind !== 'try' && frame.kind !== 'catch')) {
          this.Error_('catch outside of try');
          return;
        }
        frame.inCatch = true;
        this.stack_.length = frame.height;
        for (const p of frame.blockParams) this.Push_(p);
        frame.unreachable = false;
        return;
      }
      if (name === 'delegate') {
        const frame = this.control_[this.control_.length - 1];
        if (!frame || frame.kind !== 'try') {
          this.Error_('delegate outside of a try block');
          return;
        }
        const depth = args[0];
        if (!(Number.isInteger(depth) && depth >= 0 &&
          depth < this.control_.length - 1)) {
          this.Error_('delegate: depth ' + depth + ' out of range (nesting ' +
            (this.control_.length - 1) + ')');
          return;
        }
        if (!frame.unreachable) {
          for (let i = frame.endTypes.length - 1; i >= 0; i--) {
            this.PopExpected_(frame.endTypes[i]);
          }
          if (this.stack_.length !== frame.height) {
            this.Error_((this.stack_.length - frame.height) +
              ' value(s) left on the stack at end of try (delegate)');
            return;
          }
        }
        this.control_.pop();
        this.stack_.length = frame.height;
        for (const r of frame.endTypes) this.Push_(r);
        return;
      }

      /* --- bulk memory --- */
      if (name === 'table.init') {
        this.PopExpected_('i32'); this.PopExpected_('i32'); this.PopExpected_('i32');
        return;
      }
      if (name === 'table.copy') {
        this.PopExpected_('i32'); this.PopExpected_('i32'); this.PopExpected_('i32');
        return;
      }
      if (name === 'memory.init') {
        const addr = this.BulkMemAddrType_(args[1]);
        this.PopExpected_('i32');
        this.PopExpected_('i32');
        this.PopExpected_(addr);
        return;
      }
      if (name === 'memory.copy') {
        const dst = this.BulkMemAddrType_(args[0]);
        const src = this.BulkMemAddrType_(args[1]);
        this.PopExpected_(dst);
        this.PopExpected_(src);
        this.PopExpected_(dst);
        return;
      }
      if (name === 'memory.fill') {
        const addr = this.BulkMemAddrType_(args[0]);
        this.PopExpected_(addr);
        this.PopExpected_('i32');
        this.PopExpected_(addr);
        return;
      }
      if (name === 'memory.discard') {
        const addr = this.BulkMemAddrType_(args[0]);
        this.PopExpected_(addr);
        this.PopExpected_(addr);
        return;
      }
      if (name === 'data.drop' || name === 'elem.drop') {
        return;
      }

      /* --- unknown instruction --- */
      this.Error_('unknown instruction "' + name + '"');
    }

    CheckSimd_(name, shape, spec, args) {
      const isMemShape = (shape === 'L' || shape === 'S' ||
        shape === 'LL' || shape === 'LS');
      const addrType = isMemShape ? this.MemAddrType_(args) : null;
      switch (shape) {
        case 'L':
          this.PopExpected_(addrType);
          this.Push_('v128');
          break;
        case 'S':
          this.PopExpected_('v128');
          this.PopExpected_(addrType);
          break;
        case 'LL':
          this.CheckLaneIndex_(name, spec, args[args.length - 1]);
          this.PopExpected_('v128');
          this.PopExpected_(addrType);
          this.Push_('v128');
          break;
        case 'LS':
          this.CheckLaneIndex_(name, spec, args[args.length - 1]);
          this.PopExpected_('v128');
          this.PopExpected_(addrType);
          break;
        case 'C':
          this.Push_('v128');
          break;
        case 'SH':
        case 'SW':
          this.PopExpected_('v128');
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        case 'SP':
          this.PopExpected_(spec || 'i32');
          this.Push_('v128');
          break;
        case 'EX':
          this.CheckLaneIndex_(name, undefined, args[0]);
          this.PopExpected_('v128');
          this.Push_(spec || 'i32');
          break;
        case 'RP':
          this.CheckLaneIndex_(name, undefined, args[0]);
          this.PopExpected_(spec || 'i32');
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        case 'CMP':
        case 'BI':
          this.PopExpected_('v128');
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        case 'UN':
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        case 'TER':
          this.PopExpected_('v128');
          this.PopExpected_('v128');
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        case 'AT':
        case 'BM':
          this.PopExpected_('v128');
          this.Push_('i32');
          break;
        case 'SHF':
          this.PopExpected_('i32');
          this.PopExpected_('v128');
          this.Push_('v128');
          break;
        default:
          this.Error_('stack checker does not model SIMD shape ' + shape);
          this.Pop_();
          this.Push_('v128');
      }
    }

    CheckGc_(name, shape, args) {
      switch (shape) {
        case 'snew': {
          const t = this.GcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.Error_('struct.new: type ' + args[0] + ' is not a struct type');
            return;
          }
          const fields = t ? t.fields : [];
          this.PopN_(fields.map((f) => FieldStackType(f.type)));
          this.Push_(this.TypedRef_(args[0]));
          break;
        }
        case 'snewdef':
          this.Push_(this.TypedRef_(args[0]));
          break;
        case 'sget':
        case 'sget_su': {
          const t = this.GcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.Error_('struct.get: type ' + args[0] + ' is not a struct type');
            return;
          }
          const f = t ? t.fields[args[1]] : null;
          if (!f) {
            this.Error_('struct.get: unknown field index ' + args[1]);
            this.Push_('i32');
            return;
          }
          this.PopExpected_(this.TypedRef_(args[0]));
          this.Push_(shape === 'sget' ? FieldStackType(f.type) : 'i32');
          break;
        }
        case 'sset': {
          const t = this.GcType_(args[0]);
          if (t && t.kind !== 'struct') {
            this.Error_('struct.set: type ' + args[0] + ' is not a struct type');
            return;
          }
          const f = t ? t.fields[args[1]] : null;
          if (!f) {
            this.Error_('struct.set: unknown field index ' + args[1]);
            return;
          }
          if (!f.mutable) {
            this.Error_('struct.set: field ' + args[1] + ' is immutable');
            return;
          }
          this.PopExpected_(FieldStackType(f.type));
          this.PopExpected_(this.TypedRef_(args[0]));
          break;
        }
        case 'anew': {
          const t = this.GcType_(args[0]);
          this.PopExpected_('i32');
          this.PopExpected_(t && t.element ? FieldStackType(t.element.type) : 'i32');
          this.Push_(this.TypedRef_(args[0]));
          break;
        }
        case 'anewdef':
          this.PopExpected_('i32');
          this.Push_(this.TypedRef_(args[0]));
          break;
        case 'anewfixed': {
          const t = this.GcType_(args[0]);
          const n = args[1];
          if (!(Number.isInteger(n) && n >= 0)) {
            this.Error_('array.new_fixed: expected a non-negative count, got ' + n);
            break;
          }
          for (let i = 0; i < n; i++) {
            this.PopExpected_(t && t.element ? FieldStackType(t.element.type) : 'i32');
          }
          this.Push_(this.TypedRef_(args[0]));
          break;
        }
        case 'anewseg': {
          this.ResolveSegRef_(name, args[1]);
          this.PopExpected_('i32');
          this.PopExpected_('i32');
          this.Push_(this.TypedRef_(args[0]));
          break;
        }
        case 'aseginit': {
          this.ResolveSegRef_(name, args[1]);
          this.GcType_(args[0]);
          this.PopExpected_('i32');
          this.PopExpected_('i32');
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[0]));
          break;
        }
        case 'aget':
        case 'aget_su': {
          const t = this.GcType_(args[0]);
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[0]));
          this.Push_(shape === 'aget' && t && t.element ? FieldStackType(t.element.type) : 'i32');
          break;
        }
        case 'aset': {
          const t = this.GcType_(args[0]);
          this.PopExpected_(t && t.element ? FieldStackType(t.element.type) : 'i32');
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[0]));
          break;
        }
        case 'alen':
          this.PopExpected_('arrayref');
          this.Push_('i32');
          break;
        case 'afill': {
          const t = this.GcType_(args[0]);
          this.PopExpected_('i32');
          this.PopExpected_(t && t.element ? FieldStackType(t.element.type) : 'i32');
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[0]));
          break;
        }
        case 'acopy': {
          const dstT = this.GcType_(args[0]);
          const srcT = this.GcType_(args[1]);
          if (dstT && srcT && dstT.element && srcT.element &&
            !(TypesMatch(dstT.element.type, srcT.element.type, this.builder_) &&
              TypesMatch(srcT.element.type, dstT.element.type, this.builder_))) {
            this.Error_('array.copy: destination and source element types differ');
            return;
          }
          this.PopExpected_('i32');
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[1]));
          this.PopExpected_('i32');
          this.PopExpected_(this.TypedRef_(args[0]));
          break;
        }

        case 'rtest':
        case 'rcast': {
          const target = args[0];
          const cat = (target === 'func' || target === 'funcref') ? 'funcref' :
            (target === 'extern' || target === 'externref') ? 'externref' :
              (target === 'exn' || target === 'exnref') ? 'exnref' : 'anyref';
          this.PopExpected_(cat);
          if (shape === 'rcast') {
            this.Push_(this.TypedRef_(args[0], false));
          } else {
            this.Push_('i32');
          }
          break;
        }
        case 'rbrancast': {
          const flags = args[0];
          if (!(Number.isInteger(flags) && flags >= 0 && flags <= 3)) {
            this.Error_('br_on_cast: flags must be 0..3');
            break;
          }
          const depth = args[1];
          if (!(Number.isInteger(depth) && depth >= 0 && depth < this.control_.length)) {
            this.Error_('br_on_cast: depth ' + depth + ' out of range (nesting ' +
              this.control_.length + ')');
            break;
          }
          const srcType = args[2] !== undefined ? args[2] : 'any';
          const dstType = args[3] !== undefined ? args[3] : srcType;
          if (typeof srcType === 'number' && !this.builder_.types_[srcType]) {
            this.Error_('br_on_cast: unknown source heap type ' + srcType);
            break;
          }
          if (typeof dstType === 'number' && !this.builder_.types_[dstType]) {
            this.Error_('br_on_cast: unknown destination heap type ' + dstType);
            break;
          }
          const srcRef = this.MakeRef_(srcType);
          const dstRef = this.MakeRef_(dstType);
          const operand = this.Pop_();
          if (!TypesMatch(operand, srcRef, this.builder_)) {
            this.Error_('br_on_cast: operand type ' + this.TypeName_(operand) +
              ' does not match source type ' + this.TypeName_(srcRef));
            break;
          }
          if ((flags & 1) === 0 && operand !== BOTTOM &&
            this.IsNullableRef_(operand)) {
            this.Error_('br_on_cast: source type is non-null but the operand ' +
              'may be null');
            break;
          }
          const target = this.control_[this.control_.length - 1 - depth];
          const lt = target.labelTypes;
          const branchValue = name === 'br_on_cast_fail' ? srcRef : dstRef;
          const last = lt[lt.length - 1];
          const labelOk = last !== undefined && this.IsRefLike_(last) &&
            (TypesMatch(branchValue, last, this.builder_) ||
              TypesMatch(last, branchValue, this.builder_));
          if (!labelOk) {
            this.Error_('br_on_cast: target label must accept the branch value');
          }
          this.Push_(name === 'br_on_cast_fail' ? dstRef : srcRef);
          break;
        }
        case 'rconvert':
          if (name === 'any.convert_extern') {
            this.PopExpected_('externref');
            this.Push_('anyref');
          } else {
            this.PopExpected_('anyref');
            this.Push_('externref');
          }
          break;
        case 'ri31':
          this.PopExpected_('i32');
          this.Push_('i31ref');
          break;
        case 'i31get':
          this.PopExpected_('i31ref');
          this.Push_('i32');
          break;
        default:
          this.Error_('stack checker does not model GC op ' + name);
          this.Pop_();
          this.Push_('i32');
      }
    }

    /* --- check simd lane index --- */
    CheckLaneIndex_(name, byteSize, lane) {
      const lanes = SimdLaneCount(name, byteSize);
      if (lanes > 0 && !(Number.isInteger(lane) && lane >= 0 && lane < lanes)) {
        this.Error_(name + ': lane index ' + lane + ' out of range (0..' +
          (lanes - 1) + ')');
      }
    }

    /* --- gc type from type ref --- */
    GcType_(ref) {
      const idx = this.builder_.ResolveTypeRef(ref);
      return this.builder_.types_[idx];
    }

    /* --- check segment ref for array new or init --- */
    ResolveSegRef_(name, ref) {
      const isData = name === 'array.new_data' || name === 'array.init_data';
      try {
        if (isData) {
          this.builder_.ResolveData(ref);
        } else {
          this.builder_.ResolveElem(ref);
        }
      } catch (e) {
        this.Error_('segment reference ' + (isData ? 'data' : 'elem') +
          ': ' + String(ref));
      }
    }

    /* --- call_indirect checks --- */
    CheckIndirectCall_(tt, typeIdx, args) {
      if (!tt || tt.kind !== 'func') {
        this.Error_('call_indirect: type ' + typeIdx + ' is not a function type');
        return false;
      }
      const tblIdx = args.length > 1 ? args[1] : 0;
      const elem = this.TableElemType_(tblIdx);
      const typedFunc = IsPlainObject(elem) && typeof elem.ref === 'number' &&
        (this.builder_.types_[elem.ref] || {}).kind === 'func';
      if (elem !== 'funcref' && !typedFunc) {
        this.Error_('call_indirect: table ' + tblIdx + ' is not a funcref table');
        return false;
      }
      return true;
    }

    /* --- call_ref type must be function type --- */
    CheckFuncTypeRef_(tt, typeIdx, name) {
      if (!tt || tt.kind !== 'func') {
        this.Error_(name + ': type ' + typeIdx + ' is not a function type');
        return false;
      }
      return true;
    }

    /* --- type ref to checker type --- */
    MakeRef_(typeRef) {
      if (typeof typeRef === 'number') {
        const t = this.builder_.types_[typeRef];
        if (!t) return 'anyref';
        if (t.kind === 'struct') return 'structref';
        if (t.kind === 'array') return 'arrayref';
        return 'anyref';
      }
      if (typeof typeRef === 'string') {
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
      if (IsPlainObject(typeRef) && typeRef.ref !== undefined) {
        return this.MakeRef_(typeRef.ref);
      }
      return 'anyref';
    }

    /* --- remove nullability from ref type --- */
    NonNullRef_(t) {
      if (t === BOTTOM) return BOTTOM;
      if (IsPlainObject(t) && t.ref !== undefined) {
        return { ref: t.ref, nullable: false };
      }
      if (typeof t === 'string' && t.startsWith('null')) {
        return t.slice(4);
      }
      return t;
    }

    /* --- true if type is ref like --- */
    IsRefLike_(t) {
      if (t === BOTTOM) return true;
      if (IsPlainObject(t) && t.ref !== undefined) return true;
      if (typeof t === 'string') {
        return t.startsWith('null') || IsRefTypeName(t) || t.endsWith('ref');
      }
      return false;
    }

    /* --- true if type is nullable ref --- */
    IsNullableRef_(t) {
      if (IsPlainObject(t) && t.ref !== undefined) {
        return t.nullable !== false;
      }
      if (typeof t === 'string') {
        return t.startsWith('null') || t.endsWith('ref');
      }
      return false;
    }

    /* --- table element at index --- */
    TableElemAt_(idx) {
      const imports = this.builder_.tableImports_;
      const defs = this.builder_.tableDefs_;
      const entry = idx < imports.length ? imports[idx] :
        (idx - imports.length < defs.length ? defs[idx - imports.length] : null);
      return entry ? entry.element : null;
    }

    /* --- table element as checker type --- */
    TableElemType_(ref) {
      const idx = this.builder_.ResolveTable(ref);
      const elem = this.TableElemAt_(idx);
      if (elem === null || elem === undefined) {
        throw new CompilationFailed('table ' + idx + ' has no element type');
      }
      if (typeof elem === 'number') return { ref: elem, nullable: true };
      if (IsPlainObject(elem) && elem.ref !== undefined) {
        return { ref: elem.ref, nullable: elem.nullable !== false };
      }
      return this.MakeRef_(elem);
    }

    /* --- nullable typed ref --- */
    TypedRef_(typeRef, nullable) {
      if (typeof typeRef === 'number') {
        this.builder_.ResolveTypeRef(typeRef);
        return { ref: typeRef, nullable: nullable === false ? false : true };
      }
      return this.MakeRef_(typeRef);
    }

    /* --- address type of memory in memarg --- */
    MemAddrType_(args) {
      if (!this.builder_.HasMemory()) return 'i32';
      return this.builder_.MemoryAddressType(this.builder_.MemargMemIndex(args));
    }

    /* --- address type for bulk memory --- */
    BulkMemAddrType_(memRef) {
      if (!this.builder_.HasMemory()) return 'i32';
      if (memRef === undefined) return this.builder_.MemoryAddressType(0);
      return this.builder_.MemoryAddressType(memRef);
    }

    IsComparison_(name) {
      const parts = name.split('.');
      const op = parts[parts.length - 1];
      return ['eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u',
        'le_s', 'le_u', 'ge_s', 'ge_u', 'lt', 'gt', 'le', 'ge'].includes(op);
    }

    IsBinary_(name) {
      const parts = name.split('.');
      const op = parts[parts.length - 1];
      return ['add', 'sub', 'mul', 'div', 'div_s', 'div_u', 'rem_s', 'rem_u',
        'and', 'or', 'xor', 'shl', 'shr_s', 'shr_u', 'rotl', 'rotr',
        'min', 'max', 'copysign',
        'eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u',
        'lt', 'gt', 'le', 'ge'].includes(op);
    }
  }

  /* --- function builder --- */
  class WasmFunctionBuilder {
    constructor(builder, name, typeIndex, typeDescriptor) {
      this.builder_ = builder;
      this.name_ = name;
      this.typeIndex_ = typeIndex;
      this.typeDescriptor_ = typeDescriptor;
      this.locals_ = [];
      this.localNames_ = new Map();
      this.bodyInstrs_ = null;
      this.exportName_ = null;
    }

    /* --- add local after params --- */
    AddLocal(type, name) {
      return GuardPublic_(this.builder_, () => this.AddLocal_(type, name), this);
    }
    AddLocal_(type, name) {
      const index = this.builder_.FuncTypeParams_(this).length + this.locals_.length;
      if (name !== undefined) {
        assert(!this.localNames_.has(name), 'duplicate local name "' + name + '"');
        this.localNames_.set(name, index);
      }
      this.locals_.push({ type, name });
      return index;
    }

    /* --- set function body --- */
    Body(instrs) {
      return GuardPublic_(this.builder_, () => this.Body_(instrs), this);
    }
    Body_(instrs) {
      assert(Array.isArray(instrs), 'Body() expects an array of instructions, got ' + Inspect_(instrs));
      assert(this.bodyInstrs_ === null, 'Body() may only be called once');
      this.bodyInstrs_ = instrs;
      this.definitionStack_ = new Error().stack;
      this.definitionFrame_ = FirstTestFrame_(this.definitionStack_);
      return this;
    }

    /* --- export this function --- */
    ExportAs(exportName) {
      return GuardPublic_(this.builder_, () => this.ExportAs_(exportName), this);
    }
    ExportAs_(exportName) {
      assert(typeof exportName === 'string' && exportName.length > 0,
        'ExportAs: export name must be a non-empty string, expected a non-empty string, got ' +
        Inspect_(exportName));
      this.exportName_ = exportName;
      return this;
    }

    /* --- resolve local by index or name --- */
    ResolveLocal(ref) {
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
      throw new CompilationFailed('cannot resolve local: ' + String(ref));
    }

  }

  /* --- module builder --- */
  class WasmModuleBuilder {
    constructor() {
      this.types_ = [];
      this.typeKeys_ = new Map();
      this.funcImports_ = [];
      this.funcDefs_ = [];
      this.funcNames_ = new Map();
      this.tableImports_ = [];
      this.tableDefs_ = [];
      this.memImports_ = [];
      this.memDefs_ = [];
      this.globalImports_ = [];
      this.globalDefs_ = [];
      this.tagImports_ = [];
      this.tagDefs_ = [];
      this.elems_ = [];
      this.datas_ = [];
      this.exports_ = [];
      this.firstError_ = null;
      this.failFn_ = undefined;
    }

    /* --- type dedup key --- */
    TypeKey_(desc) {
      if (desc.kind === 'struct' || desc.kind === 'array') {
        return JSON.stringify([desc.kind, desc.fields || desc.element,
          desc.supertype, desc.final]);
      }
      return 'func:' + JSON.stringify([desc.params, desc.results,
        desc.supertype, desc.final]);
    }

    /* --- add type descriptor and return index --- */
    AddType(desc) {
      return GuardPublic_(this, () => this.AddType_(desc), 0);
    }
    AddType_(desc) {
      assert(IsPlainObject(desc), 'AddType: expected a type descriptor');
      const norm = this.NormalizeTypeDesc_(desc);
      const key = this.TypeKey_(norm);
      if (this.typeKeys_.has(key)) {
        return this.typeKeys_.get(key);
      }
      const index = this.types_.length;
      this.types_.push(norm);
      this.typeKeys_.set(key, index);
      return index;
    }

    NormalizeTypeDesc_(desc) {
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
          elem = IsPlainObject(desc.element) ? desc.element : { type: desc.element, mutable: !!desc.mutable };
        } else if (desc.fields && desc.fields.length > 0) {
          const f = desc.fields[0];
          elem = typeof f === 'string' ? { type: f, mutable: false } : { type: f.type, mutable: !!f.mutable };
        } else {
          assert(false, 'array type: element or fields required');
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

    /* --- resolve type ref number or descriptor --- */
    ResolveTypeRef(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.types_.length,
          'type index ' + ref + ' out of range');
        return ref;
      }
      if (IsPlainObject(ref) &&
        Array.isArray(ref.params) && Array.isArray(ref.results)) {
        return this.AddType_(ref);
      }
      throw new CompilationFailed('cannot resolve type: ' + String(ref));
    }

    EnsureFuncType(desc) {
      return this.AddType_(desc);
    }

    FuncType_(typeIndex) {
      return this.types_[typeIndex];
    }

    FuncTypeParams_(fnBuilder) {
      return this.FuncType_(fnBuilder.typeIndex_).params;
    }

    /* --- add function --- */
    AddFunction(name, type) {
      return GuardPublic_(this, () => this.AddFunction_(name, type), this.FailFunctionBuilder_());
    }
    AddFunction_(name, type) {
      const typeIndex = this.ResolveTypeRef(type);
      assert(name === undefined || typeof name === 'string',
        'AddFunction: name must be a string');
      if (name !== undefined) {
        assert(!this.funcNames_.has(name),
          'duplicate function name "' + name + '"');
        this.funcNames_.set(name, { isImport: false });
      }
      const fn = new WasmFunctionBuilder(this, name, typeIndex, null);
      this.funcDefs_.push(fn);
      return fn;
    }

    /* --- add import --- */
    AddImport(moduleName, fieldName, kindOrDesc, desc) {
      return GuardPublic_(this, () => this.AddImport_(moduleName, fieldName, kindOrDesc, desc), 0);
    }
    AddImport_(moduleName, fieldName, kindOrDesc, desc) {
      let kind;
      if (typeof kindOrDesc === 'string') {
        kind = kindOrDesc;
      } else if (IsPlainObject(kindOrDesc)) {
        desc = kindOrDesc;
        kind = kindOrDesc.kind;
      } else {
        throw new CompilationFailed('AddImport: bad kind argument');
      }
      assert(typeof moduleName === 'string' && typeof fieldName === 'string',
        'AddImport: module and field must be strings');
      switch (kind) {
        case 'function':
        case 'func': {
          const typeIndex = this.ResolveTypeRef(desc.type);
          this.funcImports_.push({ module: moduleName, name: fieldName, type: typeIndex });
          this.funcNames_.set(fieldName, { isImport: true });
          return this.funcImports_.length - 1;
        }
        case 'table': {
          CheckAddressType_(desc, 'table import');
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
          CheckAddressType_(desc, 'memory import');
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
            type: this.ResolveTypeRef(desc.type),
          };
          this.tagImports_.push(entry);
          return this.tagImports_.length - 1;
        }
        default:
          throw new CompilationFailed('unknown import kind "' + kind + '"');
      }
    }

    /* --- add table --- */
    AddTable(descOrElement, initial, maximum) {
      return GuardPublic_(this, () => this.AddTable_(descOrElement, initial, maximum), 0);
    }
    AddTable_(descOrElement, initial, maximum) {
      let desc;
      if (typeof descOrElement === 'string') {
        desc = { element: descOrElement, initial, maximum };
      } else {
        desc = descOrElement;
      }
      assert(IsPlainObject(desc), 'AddTable: expected descriptor');
      assert(desc.initial !== undefined, 'AddTable: initial size required');
      CheckAddressType_(desc, 'AddTable');
      const entry = {
        element: desc.element || 'funcref',
        initial: desc.initial,
        maximum: desc.maximum,
        addressType: desc.addressType || 'i32',
      };
      this.tableDefs_.push(entry);
      return this.tableImports_.length + this.tableDefs_.length - 1;
    }

    /* --- add memory --- */
    AddMemory(descOrInitial, maximum) {
      return GuardPublic_(this, () => this.AddMemory_(descOrInitial, maximum), 0);
    }
    AddMemory_(descOrInitial, maximum) {
      let desc;
      if (typeof descOrInitial === 'number') {
        desc = { initial: descOrInitial, maximum };
      } else {
        desc = descOrInitial;
      }
      assert(IsPlainObject(desc), 'AddMemory: expected descriptor');
      assert(desc.initial !== undefined, 'AddMemory: initial size (pages) required');
      CheckAddressType_(desc, 'AddMemory');
      const entry = {
        initial: desc.initial,
        maximum: desc.maximum !== undefined ? desc.maximum : desc.max,
        shared: !!desc.shared,
        addressType: desc.addressType || 'i32',
      };
      this.memDefs_.push(entry);
      return this.memImports_.length + this.memDefs_.length - 1;
    }

    /* --- add global --- */
    AddGlobal(type, initValue, mutable) {
      return GuardPublic_(this, () => this.AddGlobal_(type, initValue, mutable), 0);
    }
    AddGlobal_(type, initValue, mutable) {
      assert(type !== undefined, 'AddGlobal: type required');
      const entry = { type, mutable: !!mutable, init: initValue };
      entry.definitionFrame = FirstTestFrame_(new Error().stack);
      this.globalDefs_.push(entry);
      return this.globalImports_.length + this.globalDefs_.length - 1;
    }

    /* --- add tag --- */
    AddTag(type) {
      return GuardPublic_(this, () => this.AddTag_(type), 0);
    }
    AddTag_(type) {
      const typeIndex = this.ResolveTypeRef(type);
      this.tagDefs_.push({ type: typeIndex });
      return this.tagImports_.length + this.tagDefs_.length - 1;
    }

    /* --- add element segment --- */
    AddElemSegment(desc) {
      return GuardPublic_(this, () => this.AddElemSegment_(desc), 0);
    }
    AddElemSegment_(desc) {
      assert(IsPlainObject(desc), 'AddElemSegment: expected descriptor');
      assert(desc.indices !== undefined || desc.exprs !== undefined,
        'AddElemSegment: indices or exprs required');
      assert(desc.indices === undefined || Array.isArray(desc.indices),
        'AddElemSegment: indices must be an array');
      assert(desc.exprs === undefined || Array.isArray(desc.exprs),
        'AddElemSegment: exprs must be an array');
      desc.definitionFrame = FirstTestFrame_(new Error().stack);
      this.elems_.push(desc);
      return this.elems_.length - 1;
    }

    /* --- add data segment --- */
    AddDataSegment(descOrOffset, data) {
      return GuardPublic_(this, () => this.AddDataSegment_(descOrOffset, data), 0);
    }
    AddDataSegment_(descOrOffset, data) {
      let desc;
      if (typeof descOrOffset === 'number' || Array.isArray(descOrOffset) ||
        descOrOffset instanceof Uint8Array) {
        desc = { offset: descOrOffset, data };
      } else {
        desc = descOrOffset;
      }
      assert(IsPlainObject(desc), 'AddDataSegment: expected descriptor');
      assert(desc.data !== undefined, 'AddDataSegment: data required');
      desc.definitionFrame = FirstTestFrame_(new Error().stack);
      this.datas_.push(desc);
      return this.datas_.length - 1;
    }

    /* --- export functions --- */
    ExportFunction(refOrName, exportName) {
      return GuardPublic_(this, () => this.ExportFunction_(refOrName, exportName), this);
    }
    ExportFunction_(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      if (typeof refOrName === 'string') {
        assert(this.funcNames_.has(refOrName),
          'ExportFunction: unknown function "' + refOrName + '"');
        ref = refOrName;
      } else if (IsFunctionBuilder(refOrName)) {
        ref = refOrName;
        assert(exportName !== undefined, 'ExportFunction: export name required for builder');
      } else if (typeof refOrName === 'number') {
        assert(exportName !== undefined, 'ExportFunction: export name required for index');
        ref = refOrName;
      }
      this.AddExport_(exportName, KIND.FUNCTION, ref);
      return this;
    }

    /* --- export table --- */
    ExportTable(refOrName, exportName) {
      return GuardPublic_(this, () => this.ExportTable_(refOrName, exportName), this);
    }
    ExportTable_(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.AddExport_(exportName, KIND.TABLE, ref);
      return this;
    }

    /* --- export memory --- */
    ExportMemory(refOrName, exportName) {
      return GuardPublic_(this, () => this.ExportMemory_(refOrName, exportName), this);
    }
    ExportMemory_(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.AddExport_(exportName, KIND.MEMORY, ref);
      return this;
    }

    /* --- export global --- */
    ExportGlobal(refOrName, exportName) {
      return GuardPublic_(this, () => this.ExportGlobal_(refOrName, exportName), this);
    }
    ExportGlobal_(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.AddExport_(exportName, KIND.GLOBAL, ref);
      return this;
    }

    /* --- export tag --- */
    ExportTag(refOrName, exportName) {
      return GuardPublic_(this, () => this.ExportTag_(refOrName, exportName), this);
    }
    ExportTag_(refOrName, exportName) {
      let ref = refOrName;
      if (typeof refOrName === 'string' && exportName === undefined) {
        exportName = refOrName;
      }
      this.AddExport_(exportName, KIND.TAG, ref);
      return this;
    }

    /* --- remember first user error --- */
    RecordError_(e) {
      if (this.firstError_ === null) {
        this.firstError_ = e;
      }
    }

    /* --- placeholder builder after add function fails --- */
    FailFunctionBuilder_() {
      if (this.failFn_ === undefined) {
        this.failFn_ = {
          AddLocal: function () { return this; },
          Body: function () { return this; },
          ExportAs: function () { return this; },
          ResolveLocal: function () { return 0; },
        };
      }
      return this.failFn_;
    }

    AddExport_(name, kind, ref) {
      assert(typeof name === 'string' && name.length > 0,
        'export name must be a non-empty string');
      for (const e of this.exports_) {
        assert(e.name !== name, 'duplicate export name "' + name + '"');
      }
      this.exports_.push({ name, kind, ref });
    }

    /* --- resolve ref in index space --- */
    ResolveIndex_(imports, defs, ref, spaceName, isFuncSpace) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 &&
          ref < imports.length + defs.length,
          spaceName + ' index ' + ref + ' out of range');
        return ref;
      }
      if (typeof ref === 'string') {
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
        throw new CompilationFailed('unknown ' + spaceName + ' "' + ref + '"');
      }
      if (IsFunctionBuilder(ref)) {
        const i = defs.indexOf(ref);
        assert(i >= 0, 'function builder not part of this module');
        return imports.length + i;
      }
      throw new CompilationFailed('cannot resolve ' + spaceName + ' reference');
    }

    ResolveFunc(ref) {
      return this.ResolveIndex_(this.funcImports_, this.funcDefs_, ref, 'function', true);
    }

    /* --- functions usable with ref.func --- */
    DeclaredFuncIndices_() {
      const set = new Set();
      const Add = (ref) => {
        try {
          set.add(this.ResolveFunc(ref));
        } catch (e) {
        }
      };
      const exportList = this.exports_.slice();
      for (const fn of this.funcDefs_) {
        if (fn.exportName_ !== null) {
          exportList.push({ kind: KIND.FUNCTION, ref: fn });
        }
      }
      for (const e of exportList) {
        if (e.kind === KIND.FUNCTION) Add(e.ref);
      }
      for (const seg of this.elems_) {
        if (seg.indices !== undefined) {
          for (const idx of seg.indices) Add(idx);
        } else if (seg.exprs !== undefined) {
          for (const ex of seg.exprs) {
            if (IsPlainObject(ex) && ex.ref !== undefined) Add(ex.ref);
          }
        }
      }
      return set;
    }

    IsFuncDeclared(funcIdx) {
      return this.DeclaredFuncIndices_().has(funcIdx);
    }

    ResolveTable(ref) {
      return this.ResolveIndex_(this.tableImports_, this.tableDefs_, ref, 'table', false);
    }

    ResolveMemory(ref) {
      return this.ResolveIndex_(this.memImports_, this.memDefs_, ref, 'memory', false);
    }

    ResolveGlobal(ref) {
      return this.ResolveIndex_(this.globalImports_, this.globalDefs_, ref, 'global', false);
    }

    ResolveTag(ref) {
      return this.ResolveIndex_(this.tagImports_, this.tagDefs_, ref, 'tag', false);
    }

    /* --- tag type by index --- */
    TagTypeAt(idx) {
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

    ResolveElem(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.elems_.length,
          'elem segment index ' + ref + ' out of range');
        return ref;
      }
      throw new CompilationFailed('cannot resolve elem segment reference');
    }

    /* --- table element type by index --- */
    TableEntryElement_(idx) {
      if (idx < this.tableImports_.length) {
        return this.tableImports_[idx].element;
      }
      if (idx - this.tableImports_.length < this.tableDefs_.length) {
        return this.tableDefs_[idx - this.tableImports_.length].element;
      }
      return undefined;
    }

    /* --- true if table holds typed funcrefs --- */
    IsTypedFuncrefTable_(idx) {
      const elem = this.TableEntryElement_(idx);
      if (!IsPlainObject(elem)) return false;
      if (typeof elem.ref !== 'number') return false;
      const t = this.types_[elem.ref];
      return !!t && t.kind === 'func';
    }

    ResolveData(ref) {
      if (typeof ref === 'number') {
        assert(Number.isInteger(ref) && ref >= 0 && ref < this.datas_.length,
          'data segment index ' + ref + ' out of range');
        return ref;
      }
      throw new CompilationFailed('cannot resolve data segment reference');
    }

    HasMemory() {
      return this.memImports_.length + this.memDefs_.length > 0;
    }

    HasTable() {
      return this.tableImports_.length + this.tableDefs_.length > 0;
    }

    NumMemories() {
      return this.memImports_.length + this.memDefs_.length;
    }

    NumTables() {
      return this.tableImports_.length + this.tableDefs_.length;
    }

    NumFuncs() {
      return this.funcImports_.length + this.funcDefs_.length;
    }

    NumGlobals() {
      return this.globalImports_.length + this.globalDefs_.length;
    }

    NumTags() {
      return this.tagImports_.length + this.tagDefs_.length;
    }

    NumTypes() {
      return this.types_.length;
    }

    NumData() {
      return this.datas_.length;
    }

    NumElems() {
      return this.elems_.length;
    }

    /* --- memory index from memarg args --- */
    MemargMemIndex(args) {
      if (args.length === 0) return 0;
      if (Array.isArray(args[0])) {
        return args[0].length > 2 ? args[0][2] : 0;
      }
      return args.length > 2 ? args[2] : 0;
    }

    /* --- address type of memory --- */
    MemoryAddressType(ref) {
      const idx = this.ResolveMemory(ref);
      const imports = this.memImports_;
      const defs = this.memDefs_;
      const entry = idx < imports.length ? imports[idx] : defs[idx - imports.length];
      return entry.addressType || 'i32';
    }

    /* --- global entry by index --- */
    GlobalAt(idx) {
      const imports = this.globalImports_;
      const defs = this.globalDefs_;
      if (idx < imports.length) return imports[idx];
      if (idx - imports.length < defs.length) return defs[idx - imports.length];
      return null;
    }

    /* --- type index of function by index --- */
    FuncTypeIdxForIndex_(funcIdx) {
      const imports = this.funcImports_;
      const defs = this.funcDefs_;
      if (funcIdx < imports.length) return imports[funcIdx].type;
      if (funcIdx - imports.length < defs.length) {
        return defs[funcIdx - imports.length].typeIndex_;
      }
      assert(false, 'function index ' + funcIdx + ' out of range');
    }

    IsLoadStoreName_(name) {
      return Object.prototype.hasOwnProperty.call(LOAD_STORE, name);
    }

    /* --- make encoding context --- */
    MakeCtx_(fnBuilder) {
      const self = this;
      return {
        ResolveLocal: (ref) => {
          if (fnBuilder) {
            return fnBuilder.ResolveLocal(ref);
          }
          throw new CompilationFailed('local reference outside of a function');
        },
        ResolveGlobal: (ref) => self.ResolveGlobal(ref),
        ResolveFunc: (ref) => self.ResolveFunc(ref),
        ResolveTable: (ref) => self.ResolveTable(ref),
        ResolveMemory: (ref) => self.ResolveMemory(ref),
        ResolveTag: (ref) => self.ResolveTag(ref),
        ResolveType: (ref) => self.ResolveTypeRef(ref),
        ResolveElem: (ref) => self.ResolveElem(ref),
        ResolveData: (ref) => self.ResolveData(ref),
        EnsureFuncType: (desc) => self.EnsureFuncType(desc),
        RequireMemory: () => {
          assert(self.HasMemory(), 'memory instruction but no memory declared');
        },
        RequireTable: () => {
          assert(self.HasTable(), 'table instruction but no table declared');
        },
        NumMemories: () => self.NumMemories(),
        NumLocals: () => {
          if (!fnBuilder) return 0;
          return self.FuncTypeParams_(fnBuilder).length + fnBuilder.locals_.length;
        },
        MemoryAddressType: (ref) => self.MemoryAddressType(ref),
      };
    }

    /* --- encode constant expression --- */
    EncodeInitExpr_(init, type, ctx) {
      const w = new Writer();
      const tmp = new Writer();
      if (typeof init === 'number' || typeof init === 'bigint') {
        assert(type !== undefined, 'init expression: type required for a literal');
        if (type === 'i32') {
          assert(typeof init === 'number', 'i32 literal init must be a number');
          tmp.WriteU8(OP.I32Const);
          tmp.WriteS32LEB(init);
        } else if (type === 'i64') {
          assert(typeof init === 'bigint' || Number.isInteger(init),
            'i64 literal init must be an integer or BigInt');
          tmp.WriteU8(OP.I64Const);
          tmp.WriteS64LEB(init);
        } else if (type === 'f32') {
          assert(typeof init === 'number', 'f32 literal init must be a number');
          tmp.WriteU8(OP.F32Const);
          tmp.WriteF32(init);
        } else if (type === 'f64') {
          assert(typeof init === 'number', 'f64 literal init must be a number');
          tmp.WriteU8(OP.F64Const);
          tmp.WriteF64(init);
        } else {
          throw new CompilationFailed('cannot build literal init for type ' + type);
        }
      } else if (init === null || typeof init === 'string') {
        const heap = (typeof init === 'string')
          ? init
          : this.HeapTypeForType_(type);
        tmp.WriteU8(OP.RefNull);
        tmp.WriteHeapType(heap);
      } else if (IsPlainObject(init) && init.ref !== undefined) {
        tmp.WriteU8(OP.RefFunc);
        tmp.WriteU32LEB(this.ResolveFunc(init.ref));
      } else if (Array.isArray(init)) {
        const enc = new InstrEncoder(this);
        const ew = enc.Encode(init, ctx, { initialDepth: 0, finalEnd: false });
        tmp.bytes_.push.apply(tmp.bytes_, ew.bytes_);
      } else {
        throw new CompilationFailed('cannot encode init expression: ' + String(init));
      }
      tmp.WriteU8(OP.End);
      w.bytes_.push.apply(w.bytes_, tmp.bytes_);
      return w;
    }

    /* --- heap type from value type --- */
    HeapTypeForType_(type) {
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
      if (IsPlainObject(type) && type.ref !== undefined) {
        return type.ref;
      }
      return 'any';
    }

    /* --- write one type definition --- */
    WriteTypeDef_(www, t) {
      const hasSub = (t.supertype !== undefined && t.supertype !== null) ||
        t.final === false;
      if (hasSub) {
        www.WriteU8(t.final === true ? SUB_FINAL : SUB_NO_FINAL);
        const supers = [];
        if (t.supertype !== undefined && t.supertype !== null) {
          supers.push(this.ResolveTypeRef(t.supertype));
        }
        www.WriteVector(supers.length, (x, j) => x.WriteU32LEB(supers[j]));
      }
      if (t.kind === 'struct') {
        www.WriteU8(STRUCT_FORM);
        www.WriteVector(t.fields.length, (x, j) => {
          x.WriteValueType(t.fields[j].type);
          x.WriteU8(t.fields[j].mutable ? 0x01 : 0x00);
        });
        return;
      }
      if (t.kind === 'array') {
        www.WriteU8(ARRAY_FORM);
        assert(t.element && t.element.type !== undefined,
          'array type: missing element');
        www.WriteValueType(t.element.type);
        www.WriteU8(t.element.mutable ? 0x01 : 0x00);
        return;
      }
      www.WriteU8(FUNC_FORM);
      www.WriteVector(t.params.length, (x, j) => x.WriteValueType(t.params[j]));
      www.WriteVector(t.results.length, (x, j) => x.WriteValueType(t.results[j]));
    }

    /* --- collect implicit types from bodies --- */
    CollectImplicitTypes_() {
      const self = this;
      const Walk = (instrs) => {
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
            IsPlainObject(args[0]) &&
            Array.isArray(args[0].params) && Array.isArray(args[0].results)) {
            self.EnsureFuncType(args[0]);
          }
          if ((name === 'call_indirect' || name === 'return_call_indirect' ||
            name === 'call_ref' || name === 'return_call_ref') &&
            IsPlainObject(args[0]) &&
            Array.isArray(args[0].params) && Array.isArray(args[0].results)) {
            self.EnsureFuncType(args[0]);
          }
        }
      };
      for (const fn of this.funcDefs_) {
        if (fn.bodyInstrs_) {
          Walk(fn.bodyInstrs_);
        }
      }
    }

    /* --- encode whole module --- */
    Encode() {
      if (this.firstError_ !== null) {
        ReportCompilationFailed_(this.firstError_);
        StopAfterFailure_();
        return undefined;
      }
      try {
        return this.EncodeInternal_();
      } catch (e) {
        if (e instanceof CompilationFailed) {
          if (e.context === undefined) {
            e.context = this.Summary();
          }
          if (e.code === 'internal') {
            throw e;
          }
          ReportCompilationFailed_(e);
          StopAfterFailure_();
          return undefined;
        }
        throw e;
      }
    }

    /* --- internal encoding --- */
    EncodeInternal_() {
      this.CollectImplicitTypes_();

      const funcIndex = (ref) => this.ResolveFunc(ref);
      const tableIndex = (ref) => this.ResolveTable(ref);
      const memIndex = (ref) => this.ResolveMemory(ref);
      const globalIndex = (ref) => this.ResolveGlobal(ref);
      const tagIndex = (ref) => this.ResolveTag(ref);

      const w = new Writer();
      w.WriteBytes([0x00, 0x61, 0x73, 0x6d]);
      w.WriteBytes([0x01, 0x00, 0x00, 0x00]);

      const enc = new InstrEncoder(this);

      /* --- type section --- */
      if (this.types_.length > 0) {
        w.WriteSection(SECT.TYPE, (ww) => {
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
          ww.WriteU32LEB(rectypeCount);
          i = 0;
          while (i < this.types_.length) {
            if (this.types_[i].rec) {
              const start = i;
              while (i < this.types_.length && this.types_[i].rec) {
                i++;
              }
              ww.WriteU8(REC_GROUP);
              ww.WriteU32LEB(i - start);
              for (let k = start; k < i; k++) {
                this.WriteTypeDef_(ww, this.types_[k]);
              }
            } else {
              this.WriteTypeDef_(ww, this.types_[i]);
              i++;
            }
          }
        });
      }

      /* --- import section --- */
      const numImports = this.funcImports_.length + this.tableImports_.length +
        this.memImports_.length + this.globalImports_.length +
        this.tagImports_.length;
      if (numImports > 0) {
        w.WriteSection(SECT.IMPORT, (ww) => {
          ww.WriteU32LEB(numImports);
          const writeEntry = (imp, kindByte, descWriter) => {
            ww.WriteString(imp.module);
            ww.WriteString(imp.name);
            ww.WriteU8(kindByte);
            descWriter(ww);
          };
          for (const imp of this.funcImports_) {
            writeEntry(imp, KIND.FUNCTION, (x) => x.WriteU32LEB(imp.type));
          }
          for (const imp of this.tableImports_) {
            writeEntry(imp, KIND.TABLE, (x) => {
              x.WriteValueType(imp.element);
              x.WriteLimits({
                initial: imp.initial,
                maximum: imp.maximum,
                shared: false,
                addressType: imp.addressType,
              }, false);
            });
          }
          for (const imp of this.memImports_) {
            writeEntry(imp, KIND.MEMORY, (x) => {
              x.WriteLimits({
                initial: imp.initial,
                maximum: imp.maximum,
                shared: imp.shared,
                addressType: imp.addressType,
              }, true);
            });
          }
          for (const imp of this.globalImports_) {
            writeEntry(imp, KIND.GLOBAL, (x) => {
              x.WriteValueType(imp.type);
              x.WriteU8(imp.mutable ? 1 : 0);
            });
          }
          for (const imp of this.tagImports_) {
            writeEntry(imp, KIND.TAG, (x) => {
              x.WriteU8(0x00);
              x.WriteU32LEB(imp.type);
            });
          }
        });
      }

      /* --- function section --- */
      if (this.funcDefs_.length > 0) {
        w.WriteSection(SECT.FUNCTION, (ww) => {
          ww.WriteVector(this.funcDefs_.length, (www, i) => {
            www.WriteU32LEB(this.funcDefs_[i].typeIndex_);
          });
        });
      }

      /* --- table section --- */
      if (this.tableDefs_.length > 0) {
        w.WriteSection(SECT.TABLE, (ww) => {
          ww.WriteVector(this.tableDefs_.length, (www, i) => {
            const t = this.tableDefs_[i];
            www.WriteValueType(t.element);
            www.WriteLimits({
              initial: t.initial,
              maximum: t.maximum,
              shared: false,
              addressType: t.addressType,
            }, false);
          });
        });
      }

      /* --- memory section --- */
      if (this.memDefs_.length > 0) {
        w.WriteSection(SECT.MEMORY, (ww) => {
          ww.WriteVector(this.memDefs_.length, (www, i) => {
            const m = this.memDefs_[i];
            www.WriteLimits({
              initial: m.initial,
              maximum: m.maximum,
              shared: m.shared,
              addressType: m.addressType,
            }, true);
          });
        });
      }

      /* --- tag section --- */
      if (this.tagDefs_.length > 0) {
        w.WriteSection(SECT.TAG, (ww) => {
          ww.WriteVector(this.tagDefs_.length, (www, i) => {
            www.WriteU8(0x00);
            www.WriteU32LEB(this.tagDefs_[i].type);
          });
        });
      }

      /* --- global section --- */
      if (this.globalDefs_.length > 0) {
        const globalCtx = this.MakeCtx_(null);
        w.WriteSection(SECT.GLOBAL, (ww) => {
          ww.WriteVector(this.globalDefs_.length, (www, i) => {
            const g = this.globalDefs_[i];
            try {
              www.WriteValueType(g.type);
              www.WriteU8(g.mutable ? 1 : 0);
              const ew = this.EncodeInitExpr_(g.init, g.type, globalCtx);
              for (const b of ew.bytes_) {
                www.WriteU8(b);
              }
            } catch (e) {
              throw AttributeFrame_(e, g.definitionFrame);
            }
          });
        });
      }

      /* --- export section --- */
      const exportList = this.exports_.slice();
      for (const fn of this.funcDefs_) {
        if (fn.exportName_ !== null) {
          assert(!exportList.some((e) => e.name === fn.exportName_),
            'duplicate export name "' + fn.exportName_ + '"');
          exportList.push({ name: fn.exportName_, kind: KIND.FUNCTION, ref: fn });
        }
      }
      if (exportList.length > 0) {
        w.WriteSection(SECT.EXPORT, (ww) => {
          ww.WriteVector(exportList.length, (www, i) => {
            const e = exportList[i];
            www.WriteString(e.name);
            www.WriteU8(e.kind);
            let idx;
            switch (e.kind) {
              case KIND.FUNCTION: idx = funcIndex(e.ref); break;
              case KIND.TABLE: idx = tableIndex(e.ref); break;
              case KIND.MEMORY: idx = memIndex(e.ref); break;
              case KIND.GLOBAL: idx = globalIndex(e.ref); break;
              case KIND.TAG: idx = tagIndex(e.ref); break;
              default: throw new CompilationFailed('bad export kind');
            }
            www.WriteU32LEB(idx);
          });
        });
      }

      /* --- elem section --- */
      if (this.elems_.length > 0) {
        const elemCtx = this.MakeCtx_(null);
        w.WriteSection(SECT.ELEM, (ww) => {
          ww.WriteVector(this.elems_.length, (www, i) => {
            const e = this.elems_[i];
            const isExpr = e.exprs !== undefined;
            const active = !e.passive && !e.declared;
            const tableIdx = active ? (e.table === undefined ? 0 : tableIndex(e.table)) : 0;
            let elementType = e.element;
            if (elementType === undefined || elementType === null) {
              elementType = this.TableEntryElement_(tableIdx);
            }
            if (elementType === undefined || elementType === null) {
              elementType = 'funcref';
            }
            if (active) {
              const tableElem = this.TableEntryElement_(tableIdx);
              if (isExpr) {
                if (tableElem !== undefined && tableElem !== null &&
                  JSON.stringify(elementType) !== JSON.stringify(tableElem)) {
                  throw new CompilationFailed(
                    'elem segment element type ' + JSON.stringify(elementType) +
                    ' does not match table ' + tableIdx + ' (' +
                    JSON.stringify(tableElem) + ')', { definitionFrame: e.definitionFrame });
                }
              } else if (tableElem !== undefined && tableElem !== null &&
                tableElem !== 'funcref') {
                throw new CompilationFailed(
                  'elem segment with function indices requires a funcref table',
                  { definitionFrame: e.definitionFrame });
              }
            }
            let flags;
            if (isExpr) {
              const typedTable = active && this.IsTypedFuncrefTable_(tableIdx);
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
            www.WriteU8(flags);
            if (flags === 2 || flags === 6) {
              www.WriteU32LEB(tableIdx);
            }
            if (isExpr) {
              if (flags === 4 || flags === 6) {
                const ow = this.EncodeInitExpr_(e.offset, 'i32', elemCtx);
                for (const b of ow.bytes_) {
                  www.WriteU8(b);
                }
              }
              if (flags !== 4) {
                www.WriteValueType(elementType);
              }
              www.WriteVector(e.exprs.length, (x, j) => {
                const ew = this.EncodeInitExpr_(e.exprs[j], elementType, elemCtx);
                for (const b of ew.bytes_) {
                  x.WriteU8(b);
                }
              });
            } else {
              if (flags === 1 || flags === 3) {
                www.WriteU8(0x00);
              }
              if (flags === 0 || flags === 2) {
                const ow = this.EncodeInitExpr_(e.offset, 'i32', elemCtx);
                for (const b of ow.bytes_) {
                  www.WriteU8(b);
                }
              }
              www.WriteVector(e.indices.length, (x, j) => {
                x.WriteU32LEB(funcIndex(e.indices[j]));
              });
            }
          });
        });
      }

      /* --- datacount section --- */
      const usesDataCount = this.datas_.length > 0;
      if (usesDataCount) {
        w.WriteSection(SECT.DATACOUNT, (ww) => {
          ww.WriteU32LEB(this.datas_.length);
        });
      }

      /* --- code section --- */
      if (this.funcDefs_.length > 0) {
        w.WriteSection(SECT.CODE, (ww) => {
          ww.WriteVector(this.funcDefs_.length, (www, i) => {
            const fn = this.funcDefs_[i];
            assert(fn.bodyInstrs_ !== null,
              'function "' + (fn.name_ || i) + '" has no body; call Body() first');
            const bodyWriter = new Writer();

            /* --- group locals by type --- */
            const localGroups = [];
            for (const loc of fn.locals_) {
              const last = localGroups[localGroups.length - 1];
              if (last && last.type === loc.type) {
                last.count++;
              } else {
                localGroups.push({ type: loc.type, count: 1 });
              }
            }
            bodyWriter.WriteVector(localGroups.length, (x, j) => {
              x.WriteU32LEB(localGroups[j].count);
              x.WriteValueType(localGroups[j].type);
            });

            /* --- stack type check --- */
            const checker = new CompilationChecker(this);
            if (!checker.Check(fn, fn.bodyInstrs_)) {
              const msg = checker.ErrorMessage();
              throw new CompilationFailed('function "' + (fn.name_ || i) + '":\n' + msg, {
                code: 'compilation-failed',
                definitionFrame: fn.definitionFrame_,
                instruction: checker.ErrorInstruction_(),
                instructionIndex: checker.ErrorInstructionIndex_(),
                instructionOccurrence: checker.ErrorOccurrence_(),
              });
            }

            /* --- encode body --- */
            const ctx = this.MakeCtx_(fn);
            let ew;
            try {
              ew = enc.Encode(fn.bodyInstrs_, ctx, { initialDepth: 1, finalEnd: true });
            } catch (e) {
              if (e instanceof CompilationFailed) {
                throw new CompilationFailed(
                  'function "' + (fn.name_ || i) + '":\n' + e.message, {
                    code: e.code || 'compilation-failed',
                    cause: e,
                    context: e.context,
                    definitionFrame: fn.definitionFrame_,
                    instruction: enc.ErrorInstruction_(),
                    instructionIndex: enc.ErrorInstructionIndex_(),
                    instructionOccurrence: enc.ErrorOccurrence_(),
                  });
              }
              throw e;
            }
            for (const b of ew.bytes_) {
              bodyWriter.WriteU8(b);
            }

            www.WriteU32LEB(bodyWriter.Length);
            for (const b of bodyWriter.bytes_) {
              www.WriteU8(b);
            }
          });
        });
      }

      /* --- data section --- */
      if (this.datas_.length > 0) {
        const dataCtx = this.MakeCtx_(null);
        w.WriteSection(SECT.DATA, (ww) => {
          ww.WriteVector(this.datas_.length, (www, i) => {
            const d = this.datas_[i];
            try {
              const passive = d.passive === true;
              const memIdx = passive ? 0 : (d.memory === undefined ? 0 : memIndex(d.memory));
              const addressType = passive ? 'i32' : this.MemoryAddressType(memIdx);
              const bytes = ToBytes(d.data);
              if (passive) {
                www.WriteU8(0x01);
              } else if (d.memory !== undefined && memIdx !== 0) {
                www.WriteU8(0x02);
                www.WriteU32LEB(memIdx);
              } else {
                www.WriteU8(0x00);
              }
              if (!passive) {
                const ow = this.EncodeInitExpr_(d.offset, addressType, dataCtx);
                for (const b of ow.bytes_) {
                  www.WriteU8(b);
                }
              }
              www.WriteU32LEB(bytes.length);
              for (let j = 0; j < bytes.length; j++) {
                www.WriteU8(bytes[j]);
              }
            } catch (e) {
              throw AttributeFrame_(e, d.definitionFrame);
            }
          });
        });
      }

      return w.Result();
    }

    /* --- hex dump of encoded module --- */
    Hex() {
      const bytes = this.Encode();
      if (bytes === undefined) return null;
      let out = '';
      for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, '0');
      }
      return out;
    }

    /* --- compile with webassembly module --- */
    Compile() {
      if (typeof WebAssembly === 'undefined' ||
        typeof WebAssembly.Module !== 'function') {
        throw new Error('WebAssembly.Module is not available');
      }
      const bytes = this.Encode();
      if (bytes === undefined) return undefined;
      if (!(bytes instanceof Uint8Array)) {
        throw new TypeError('Encode() did not return Uint8Array');
      }
      return new WebAssembly.Module(bytes);
    }

    /* --- compile and instantiate --- */
    Instantiate(imports) {
      const mod = this.Compile();
      if (mod === undefined) return undefined;
      return new WebAssembly.Instance(mod, imports || {});
    }

    /* --- module summary --- */
    Summary() {
      let funcExports = 0;
      for (const fn of this.funcDefs_) {
        if (fn.exportName_ !== null) funcExports++;
      }
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
        exports: this.exports_.length + funcExports,
      };
    }
  }

  global.WasmModuleBuilder = WasmModuleBuilder;
  global.CompilationFailed = CompilationFailed;

  /* --- builder location for stack filtering --- */
  const BUILDER_LOC_ = (function () {
    try {
      const fr = FrameLocation_(String(new Error().stack).split('\n')[1] || '');
      return fr ? { file: fr.file, line: fr.line } : null;
    } catch (ex) {
      return null;
    }
  })();
})(typeof globalThis !== 'undefined' ? globalThis :
  typeof self !== 'undefined' ? self :
    typeof window !== 'undefined' ? window : this);
