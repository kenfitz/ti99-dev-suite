/**
 * TMS9900 instruction table.
 *
 * Sources: TI Editor/Assembler manual, and the TMS9900 cheat sheet v1.0 by
 * Stefan "SteveB" Bauch. Cycle counts assume a stock TI-99/4A at 3 MHz with
 * the console's 8-bit multiplexed bus; xas99's own cycle counter (-L listing,
 * column 4) is authoritative when you need exact numbers.
 *
 * NOTE ON A KNOWN CHEAT-SHEET ERRATUM: that sheet lists SBO as "set cnt bits 0"
 * and SBZ as "set cnt bits 1". It is the other way round -- SBO sets a CRU bit
 * to one, SBZ sets it to zero. Encoded correctly below.
 */

export type Cpu = '9900' | '9995' | '99000' | 'f18a';

/** Status register bits an instruction affects. */
export type StatusFlag = 'L>' | 'A>' | '=' | 'C' | 'O' | 'P' | 'X';

export type OperandKind =
    | 'gas'      // general addressing: Rn, *Rn, *Rn+, @LABEL, @LABEL(Rn)
    | 'reg'      // register only
    | 'regPair'  // register that implies the following one too
    | 'imm'      // 16-bit immediate word
    | 'count'    // shift or CRU transfer count
    | 'jump'     // relative jump target
    | 'cru'      // signed CRU bit displacement from R12
    | 'xop';     // XOP number

export interface Operand {
    kind: OperandKind;
    name: string;
}

/** Extra cycles charged for each non-register addressing mode. */
export interface ModeCost {
    indirect: number;
    autoinc: number;
    symbolic: number;
    indexed: number;
}

export interface Instruction {
    mnemonic: string;
    /** TMS9900 instruction format, 1..9. */
    format: number;
    summary: string;
    description: string;
    operands: Operand[];
    cycles: number | string;
    flags: StatusFlag[];
    byteOp?: boolean;
    cpu: Cpu;
    modeCost?: ModeCost;
}

export interface Directive {
    name: string;
    summary: string;
    description: string;
    /** Operand pattern for the hover, '' when the directive takes none. */
    operands: string;
    /** True when xas99 accepts it but the TI Editor/Assembler does not. */
    extension: boolean;
}

const WORD_COST: ModeCost = { indirect: 4, autoinc: 8, symbolic: 8, indexed: 8 };
const BYTE_COST: ModeCost = { indirect: 4, autoinc: 6, symbolic: 8, indexed: 8 };

const gas = (name: string): Operand => ({ kind: 'gas', name });
const reg = (name: string): Operand => ({ kind: 'reg', name });

function dual(
    mnemonic: string,
    summary: string,
    description: string,
    cycles: number | string,
    flags: StatusFlag[],
    byteOp = false,
): Instruction {
    return {
        mnemonic, format: 1, summary, description,
        operands: [gas('source'), gas('destination')],
        cycles, flags, byteOp, cpu: '9900',
        modeCost: byteOp ? BYTE_COST : WORD_COST,
    };
}

function single(
    mnemonic: string,
    summary: string,
    description: string,
    cycles: number | string,
    flags: StatusFlag[],
): Instruction {
    return {
        mnemonic, format: 6, summary, description,
        operands: [gas('destination')],
        cycles, flags, cpu: '9900', modeCost: WORD_COST,
    };
}

function jump(mnemonic: string, summary: string, condition: string): Instruction {
    return {
        mnemonic, format: 2, summary,
        description: `${summary}. Taken when ${condition}. Relative displacement of -128..+127 words from the instruction following this one.`,
        operands: [{ kind: 'jump', name: 'offset' }],
        cycles: '8 taken / 10 not taken', flags: [], cpu: '9900',
    };
}

function immediate(
    mnemonic: string,
    summary: string,
    description: string,
    cycles: number | string,
    flags: StatusFlag[],
): Instruction {
    return {
        mnemonic, format: 8, summary, description,
        operands: [reg('register'), { kind: 'imm', name: 'value' }],
        cycles, flags, cpu: '9900',
    };
}

function shift(mnemonic: string, summary: string, flags: StatusFlag[]): Instruction {
    return {
        mnemonic, format: 5, summary,
        description: `${summary}. A count of 0 takes the shift count from the low nibble of R0; if that is also 0, the count is 16.`,
        operands: [reg('register'), { kind: 'count', name: 'count' }],
        cycles: '12 + 2 per bit', flags, cpu: '9900',
    };
}

export const INSTRUCTIONS: Instruction[] = [
    // ---- Format I: dual operand, general addressing --------------------------
    dual('A', 'Add words', 'Adds source to destination: s + d -> d.', 14, ['L>', 'A>', '=', 'C', 'O']),
    dual('AB', 'Add bytes', 'Adds source byte to destination byte.', 14, ['L>', 'A>', '=', 'C', 'O', 'P'], true),
    dual('S', 'Subtract words', 'Subtracts source from destination: d - s -> d.', 14, ['L>', 'A>', '=', 'C', 'O']),
    dual('SB', 'Subtract bytes', 'Subtracts source byte from destination byte.', 14, ['L>', 'A>', '=', 'C', 'O', 'P'], true),
    dual('C', 'Compare words', 'Compares source with destination and sets status. Neither operand is modified.', 14, ['L>', 'A>', '=']),
    dual('CB', 'Compare bytes', 'Compares source byte with destination byte.', 14, ['L>', 'A>', '=', 'P'], true),
    dual('MOV', 'Move word', 'Copies source to destination and sets status from the value moved.', 14, ['L>', 'A>', '=']),
    dual('MOVB', 'Move byte', 'Copies the most significant byte of source to destination.', 14, ['L>', 'A>', '=', 'P'], true),
    dual('SOC', 'Set ones corresponding', 'Logical OR: bits set in source are set in destination.', 14, ['L>', 'A>', '=']),
    dual('SOCB', 'Set ones corresponding, byte', 'Logical OR on bytes.', 14, ['L>', 'A>', '=', 'P'], true),
    dual('SZC', 'Set zeroes corresponding', 'Logical AND-NOT: bits set in source are cleared in destination.', 14, ['L>', 'A>', '=']),
    dual('SZCB', 'Set zeroes corresponding, byte', 'Logical AND-NOT on bytes.', 14, ['L>', 'A>', '=', 'P'], true),

    // ---- Format II: jumps ----------------------------------------------------
    jump('JMP', 'Jump unconditionally', 'always'),
    jump('JEQ', 'Jump if equal', 'the equal flag is set'),
    jump('JNE', 'Jump if not equal', 'the equal flag is clear'),
    jump('JGT', 'Jump if greater than (signed)', 'A> is set'),
    jump('JLT', 'Jump if less than (signed)', 'A> and = are both clear'),
    jump('JH', 'Jump if logically higher (unsigned)', 'L> is set and = is clear'),
    jump('JHE', 'Jump if logically higher or equal (unsigned)', 'L> or = is set'),
    jump('JL', 'Jump if logically lower (unsigned)', 'L> and = are both clear'),
    jump('JLE', 'Jump if logically lower or equal (unsigned)', 'L> is clear or = is set'),
    jump('JOC', 'Jump on carry', 'the carry flag is set'),
    jump('JNC', 'Jump if no carry', 'the carry flag is clear'),
    jump('JNO', 'Jump if no overflow', 'the overflow flag is clear'),
    jump('JOP', 'Jump on odd parity', 'the parity flag is set'),

    // ---- Format II: CRU single-bit ------------------------------------------
    { mnemonic: 'SBO', format: 2, summary: 'Set CRU bit to one',
        description: 'Sets the CRU bit at the signed displacement from the base address in R12 to 1.',
        operands: [{ kind: 'cru', name: 'displacement' }], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'SBZ', format: 2, summary: 'Set CRU bit to zero',
        description: 'Sets the CRU bit at the signed displacement from the base address in R12 to 0.',
        operands: [{ kind: 'cru', name: 'displacement' }], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'TB', format: 2, summary: 'Test CRU bit',
        description: 'Reads the CRU bit at the signed displacement from R12 into the equal flag.',
        operands: [{ kind: 'cru', name: 'displacement' }], cycles: 12, flags: ['='], cpu: '9900' },

    // ---- Format III: logical, register destination ---------------------------
    { mnemonic: 'COC', format: 3, summary: 'Compare ones corresponding',
        description: 'Sets equal if every bit set in source is also set in the destination register.',
        operands: [gas('source'), reg('register')], cycles: 14, flags: ['='], cpu: '9900', modeCost: WORD_COST },
    { mnemonic: 'CZC', format: 3, summary: 'Compare zeroes corresponding',
        description: 'Sets equal if every bit set in source is clear in the destination register.',
        operands: [gas('source'), reg('register')], cycles: 14, flags: ['='], cpu: '9900', modeCost: WORD_COST },
    { mnemonic: 'XOR', format: 3, summary: 'Exclusive OR',
        description: 'Exclusive-ORs source into the destination register. There is no immediate form.',
        operands: [gas('source'), reg('register')], cycles: 14, flags: ['L>', 'A>', '='], cpu: '9900', modeCost: WORD_COST },

    // ---- Format IV: CRU multi-bit -------------------------------------------
    { mnemonic: 'LDCR', format: 4, summary: 'Load CRU',
        description: 'Transfers count bits from source to the CRU at the base address in R12. A count of 0 means 16 bits.',
        operands: [gas('source'), { kind: 'count', name: 'count' }],
        cycles: '20 + 2 per bit', flags: ['L>', 'A>', '=', 'P'], cpu: '9900', modeCost: WORD_COST },
    { mnemonic: 'STCR', format: 4, summary: 'Store CRU',
        description: 'Transfers count bits from the CRU into destination. A count of 0 means 16 bits.',
        operands: [gas('destination'), { kind: 'count', name: 'count' }],
        cycles: '42-60', flags: ['L>', 'A>', '=', 'P'], cpu: '9900', modeCost: WORD_COST },

    // ---- Format V: shifts ----------------------------------------------------
    shift('SLA', 'Shift left arithmetic', ['L>', 'A>', '=', 'C', 'O']),
    shift('SRA', 'Shift right arithmetic (sign extending)', ['L>', 'A>', '=', 'C']),
    shift('SRL', 'Shift right logical (zero filling)', ['L>', 'A>', '=', 'C']),
    shift('SRC', 'Shift right circular', ['L>', 'A>', '=', 'C']),

    // ---- Format VI: single operand ------------------------------------------
    single('B', 'Branch', 'Loads the effective address into the program counter.', 8, []),
    single('BL', 'Branch and link', 'Saves the return address in R11, then branches. Return with RT (B *R11).', 12, []),
    single('BLWP', 'Branch and load workspace pointer', 'Context switch: the operand points to a two-word vector holding the new WP and PC. The old WP, PC and ST are saved in the new R13, R14 and R15. Return with RTWP.', 26, []),
    single('CLR', 'Clear', 'Writes >0000 to the destination.', 10, []),
    single('SETO', 'Set to ones', 'Writes >FFFF to the destination.', 10, []),
    single('INV', 'Invert', 'Ones complement of the destination.', 10, ['L>', 'A>', '=']),
    single('NEG', 'Negate', 'Twos complement of the destination.', 12, ['L>', 'A>', '=', 'C', 'O']),
    single('ABS', 'Absolute value', 'Replaces the destination with its absolute value.', '12 if positive / 14 if negative', ['L>', 'A>', '=', 'O']),
    single('INC', 'Increment', 'Adds 1 to the destination.', 10, ['L>', 'A>', '=', 'C', 'O']),
    single('INCT', 'Increment by two', 'Adds 2 to the destination. Use for stepping through words.', 10, ['L>', 'A>', '=', 'C', 'O']),
    single('DEC', 'Decrement', 'Subtracts 1 from the destination.', 10, ['L>', 'A>', '=', 'C', 'O']),
    single('DECT', 'Decrement by two', 'Subtracts 2 from the destination.', 10, ['L>', 'A>', '=', 'C', 'O']),
    single('SWPB', 'Swap bytes', 'Exchanges the high and low bytes of the destination.', 10, []),
    single('X', 'Execute', 'Executes the instruction at the destination address. Does not itself alter status, but the executed instruction may.', '8 plus the executed instruction', []),

    // ---- Format VII: control -------------------------------------------------
    { mnemonic: 'RTWP', format: 7, summary: 'Return with workspace pointer',
        description: 'Restores WP, PC and ST from R13, R14 and R15 of the current workspace. The return from BLWP.',
        operands: [], cycles: 14, flags: ['L>', 'A>', '=', 'C', 'O', 'P', 'X'], cpu: '9900' },
    { mnemonic: 'IDLE', format: 7, summary: 'Idle until interrupt', description: 'Not usable on a stock TI-99/4A.', operands: [], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'RSET', format: 7, summary: 'Reset', description: 'Not usable on a stock TI-99/4A.', operands: [], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'CKON', format: 7, summary: 'Clock on', description: 'Not usable on a stock TI-99/4A.', operands: [], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'CKOF', format: 7, summary: 'Clock off', description: 'Not usable on a stock TI-99/4A.', operands: [], cycles: 12, flags: [], cpu: '9900' },
    { mnemonic: 'LREX', format: 7, summary: 'Load or restart execution', description: 'Not usable on a stock TI-99/4A.', operands: [], cycles: 12, flags: [], cpu: '9900' },

    // ---- Format VIII: immediate ---------------------------------------------
    immediate('LI', 'Load immediate', 'Loads a 16-bit constant into a register.', 12, ['L>', 'A>', '=']),
    immediate('AI', 'Add immediate', 'Adds a 16-bit constant to a register.', 14, ['L>', 'A>', '=', 'C', 'O']),
    immediate('ANDI', 'AND immediate', 'Bitwise AND of a register with a constant.', 14, ['L>', 'A>', '=']),
    immediate('ORI', 'OR immediate', 'Bitwise OR of a register with a constant.', 14, ['L>', 'A>', '=']),
    immediate('CI', 'Compare immediate', 'Compares a register with a constant.', 14, ['L>', 'A>', '=']),
    { mnemonic: 'LIMI', format: 8, summary: 'Load interrupt mask immediate',
        description: 'Sets the interrupt mask. LIMI 0 disables interrupts; LIMI 2 enables the VDP interrupt on the TI-99/4A.',
        operands: [{ kind: 'imm', name: 'level' }], cycles: 16, flags: [], cpu: '9900' },
    { mnemonic: 'LWPI', format: 8, summary: 'Load workspace pointer immediate',
        description: 'Points the workspace at a new 32-byte block of RAM. Scratchpad >8300 is the fast choice on a TI-99/4A.',
        operands: [{ kind: 'imm', name: 'address' }], cycles: 10, flags: [], cpu: '9900' },
    { mnemonic: 'STST', format: 8, summary: 'Store status register',
        description: 'Copies the status register into a register.',
        operands: [reg('register')], cycles: 8, flags: [], cpu: '9900' },
    { mnemonic: 'STWP', format: 8, summary: 'Store workspace pointer',
        description: 'Copies the workspace pointer into a register.',
        operands: [reg('register')], cycles: 8, flags: [], cpu: '9900' },

    // ---- Format IX: multiply, divide, XOP ------------------------------------
    { mnemonic: 'MPY', format: 9, summary: 'Multiply (unsigned)',
        description: 'Multiplies source by the destination register; the 32-bit result goes into that register and the next one.',
        operands: [gas('source'), { kind: 'regPair', name: 'register' }], cycles: 52, flags: [], cpu: '9900', modeCost: WORD_COST },
    { mnemonic: 'DIV', format: 9, summary: 'Divide (unsigned)',
        description: 'Divides the 32-bit value in the register pair by source. Quotient into the first register, remainder into the second. Sets overflow and does nothing if the divisor is too small.',
        operands: [gas('source'), { kind: 'regPair', name: 'register' }], cycles: '16 to 124', flags: ['O'], cpu: '9900', modeCost: WORD_COST },
    { mnemonic: 'XOP', format: 9, summary: 'Extended operation',
        description: 'Software-triggered context switch through the XOP vector table, effectively an indexed BLWP.',
        operands: [gas('source'), { kind: 'xop', name: 'number' }], cycles: 36, flags: ['X'], cpu: '9900', modeCost: WORD_COST },

    // ---- Pseudo-instructions -------------------------------------------------
    { mnemonic: 'RT', format: 6, summary: 'Return from BL (alias for B *R11)',
        description: 'Assembles to B *R11. The standard return from a BL subroutine.',
        operands: [], cycles: 8, flags: [], cpu: '9900' },
    { mnemonic: 'NOP', format: 2, summary: 'No operation (alias for JMP $+2)',
        description: 'Assembles to a jump to the next instruction.',
        operands: [], cycles: 10, flags: [], cpu: '9900' },
];

// --------------------------------------------------------------------------
// Extended CPUs. Only offered when the project targets them (-5, -105, -18).
// --------------------------------------------------------------------------

export const EXTENDED_INSTRUCTIONS: Instruction[] = [
    { mnemonic: 'MPYS', format: 6, summary: 'Multiply signed', description: 'TMS9995 and later.', operands: [gas('source')], cycles: 56, flags: ['L>', 'A>', '='], cpu: '9995', modeCost: WORD_COST },
    { mnemonic: 'DIVS', format: 6, summary: 'Divide signed', description: 'TMS9995 and later.', operands: [gas('source')], cycles: 102, flags: ['L>', 'A>', '=', 'O'], cpu: '9995', modeCost: WORD_COST },
    { mnemonic: 'LST', format: 8, summary: 'Load status register', description: 'TMS9995 and later.', operands: [reg('register')], cycles: 22, flags: ['L>', 'A>', '=', 'C', 'O', 'P', 'X'], cpu: '9995' },
    { mnemonic: 'LWP', format: 8, summary: 'Load workspace pointer', description: 'TMS9995 and later.', operands: [reg('register')], cycles: 21, flags: [], cpu: '9995' },
    { mnemonic: 'BIND', format: 6, summary: 'Branch indirect', description: 'TMS99000/99105.', operands: [gas('source')], cycles: 16, flags: [], cpu: '99000', modeCost: WORD_COST },
    { mnemonic: 'BLSK', format: 8, summary: 'Branch and link, stack', description: 'TMS99000/99105.', operands: [reg('register'), { kind: 'imm', name: 'address' }], cycles: 18, flags: [], cpu: '99000' },
    { mnemonic: 'AM', format: 1, summary: 'Add multiple precision', description: 'TMS99000/99105.', operands: [gas('source'), gas('destination')], cycles: 54, flags: ['L>', 'A>', '=', 'C', 'O'], cpu: '99000', modeCost: WORD_COST },
    { mnemonic: 'SM', format: 1, summary: 'Subtract multiple precision', description: 'TMS99000/99105.', operands: [gas('source'), gas('destination')], cycles: 54, flags: ['L>', 'A>', '=', 'C', 'O'], cpu: '99000', modeCost: WORD_COST },
    { mnemonic: 'SLC', format: 1, summary: 'Shift left circular', description: 'F18A GPU only.', operands: [gas('source'), gas('destination')], cycles: 12, flags: ['L>', 'A>', '=', 'C'], cpu: 'f18a', modeCost: WORD_COST },
    { mnemonic: 'PIX', format: 1, summary: 'Pixel operation', description: 'F18A GPU only.', operands: [gas('source'), gas('destination')], cycles: 12, flags: ['='], cpu: 'f18a', modeCost: WORD_COST },
    { mnemonic: 'CALL', format: 6, summary: 'Call subroutine', description: 'F18A GPU only.', operands: [gas('destination')], cycles: 12, flags: [], cpu: 'f18a', modeCost: WORD_COST },
    { mnemonic: 'RET', format: 7, summary: 'Return from CALL', description: 'F18A GPU only.', operands: [], cycles: 8, flags: [], cpu: 'f18a' },
    { mnemonic: 'PUSH', format: 6, summary: 'Push to stack', description: 'F18A GPU only.', operands: [gas('source')], cycles: 12, flags: [], cpu: 'f18a', modeCost: WORD_COST },
    { mnemonic: 'POP', format: 6, summary: 'Pop from stack', description: 'F18A GPU only.', operands: [gas('destination')], cycles: 12, flags: [], cpu: 'f18a', modeCost: WORD_COST },
];

export const DIRECTIVES: Directive[] = [
    { name: 'AORG', summary: 'Absolute origin', description: 'Sets the absolute assembly address for the following code.', operands: 'address', extension: false },
    { name: 'RORG', summary: 'Relocatable origin', description: 'Returns to relocatable assembly, optionally offsetting the location counter.', operands: '[offset]', extension: false },
    { name: 'DORG', summary: 'Dummy origin', description: 'Defines symbols against an address without emitting code. Supported by xas99 although the TI assembler does not.', operands: 'address', extension: false },
    { name: 'DEF', summary: 'Define external symbol', description: 'Exports a symbol (1-6 characters in strict mode) for the linker.', operands: 'label[,label...]', extension: false },
    { name: 'REF', summary: 'Reference external symbol', description: 'Imports a symbol defined elsewhere or supplied by the Editor/Assembler environment.', operands: 'label[,label...]', extension: false },
    { name: 'EQU', summary: 'Equate', description: 'Assigns the value of an expression to the label on this line.', operands: 'expression', extension: false },
    { name: 'DATA', summary: 'Initialise words', description: 'Emits one or more 16-bit values. Forces word alignment.', operands: 'expression[,expression...]', extension: false },
    { name: 'BYTE', summary: 'Initialise bytes', description: 'Emits one or more 8-bit values.', operands: 'expression[,expression...]', extension: false },
    { name: 'TEXT', summary: 'Initialise text', description: "Emits characters with no length prefix and no terminator. Prefix with a minus sign to negate the last byte.", operands: "'string'", extension: false },
    { name: 'BSS', summary: 'Block starting with symbol', description: 'Reserves the given number of bytes. The label takes the address of the first byte.', operands: 'size', extension: false },
    { name: 'BES', summary: 'Block ending with symbol', description: 'Reserves the given number of bytes. The label takes the address just past the block.', operands: 'size', extension: false },
    { name: 'EVEN', summary: 'Word align', description: 'Emits a zero byte if the location counter is odd.', operands: '', extension: false },
    { name: 'COPY', summary: 'Include source file', description: 'Textually includes another source file. Accepts native paths or TI paths such as DSK1.SOUND.', operands: '"filename"', extension: false },
    { name: 'END', summary: 'End of source', description: 'Ends assembly. An operand names the program entry point.', operands: '[label]', extension: false },
    { name: 'IDT', summary: 'Program identifier', description: 'Sets the 8-character program name recorded in the object file.', operands: "'name'", extension: false },
    { name: 'DXOP', summary: 'Define XOP', description: 'Defines a mnemonic for an XOP number.', operands: 'name,number', extension: false },
    { name: 'WEQU', summary: 'Weak equate', description: 'Like EQU but does not complain if the symbol is redefined. xas99 extension.', operands: 'expression', extension: true },
    { name: 'REQU', summary: 'Register equate', description: 'Defines a register alias usable wherever a register is expected. xas99 extension.', operands: 'register', extension: true },
    { name: 'XORG', summary: 'Execution origin', description: 'Assembles for one address while loading at another, for code copied to RAM at run time. xas99 extension.', operands: 'address', extension: true },
    { name: 'BANK', summary: 'Select ROM bank', description: 'Directs following code into a cartridge bank. Use ALL for shared code. xas99 extension.', operands: 'n | ALL', extension: true },
    { name: 'SAVE', summary: 'Save memory range', description: 'Restricts binary or image output to the given address range. xas99 extension.', operands: 'from,to', extension: true },
    { name: 'STRI', summary: 'Length-prefixed string', description: 'Emits a string preceded by a one-byte length. xas99 extension.', operands: "'string'", extension: true },
    { name: 'BCOPY', summary: 'Include binary file', description: 'Embeds a binary file verbatim. xas99 extension.', operands: '"filename"', extension: true },
    { name: 'FLOA', summary: 'Floating point constant', description: 'Emits a radix-100 floating point constant. xas99 extension.', operands: 'number', extension: true },
    { name: 'TITL', summary: 'Listing title', description: 'Accepted and ignored by the E/A loader.', operands: "'text'", extension: true },
    { name: 'PAGE', summary: 'Listing page break', description: 'Accepted and ignored by the E/A loader.', operands: '', extension: true },
    { name: 'LIST', summary: 'Resume listing', description: 'Accepted and ignored by the E/A loader.', operands: '', extension: true },
    { name: 'UNL', summary: 'Suspend listing', description: 'Accepted and ignored by the E/A loader.', operands: '', extension: true },
];

const byMnemonic = new Map<string, Instruction>();
for (const i of [...INSTRUCTIONS, ...EXTENDED_INSTRUCTIONS]) byMnemonic.set(i.mnemonic, i);

const byDirective = new Map<string, Directive>();
for (const d of DIRECTIVES) byDirective.set(d.name, d);

export function lookupInstruction(name: string): Instruction | undefined {
    return byMnemonic.get(name.toUpperCase());
}

export function lookupDirective(name: string): Directive | undefined {
    return byDirective.get(name.toUpperCase());
}

export function isNoOperand(name: string): boolean {
    const i = lookupInstruction(name);
    if (i) return i.operands.length === 0;
    const d = lookupDirective(name);
    return !!d && d.operands === '';
}

/** Human-readable operand pattern, e.g. "MOV source,destination". */
export function signature(i: Instruction): string {
    if (i.operands.length === 0) return i.mnemonic;
    return `${i.mnemonic} ${i.operands.map(o => o.name).join(',')}`;
}

const FLAG_NAMES: Record<StatusFlag, string> = {
    'L>': 'logical greater than',
    'A>': 'arithmetic greater than',
    '=': 'equal',
    'C': 'carry',
    'O': 'overflow',
    'P': 'odd parity',
    'X': 'XOP',
};

/** Markdown hover body for an instruction. */
export function describe(i: Instruction): string {
    const lines: string[] = [];
    lines.push('```tms9900');
    lines.push(signature(i));
    lines.push('```');
    lines.push(`**${i.summary}** — format ${i.format}`);
    lines.push('');
    lines.push(i.description);
    lines.push('');
    lines.push(`*Cycles:* ${i.cycles}`);
    if (i.modeCost) {
        lines.push(
            `*Address mode penalty:* \`*R\` +${i.modeCost.indirect}, ` +
            `\`*R+\` +${i.modeCost.autoinc}, \`@LABEL\` +${i.modeCost.symbolic}, ` +
            `\`@LABEL(R)\` +${i.modeCost.indexed}`);
    }
    lines.push(i.flags.length
        ? `*Status flags:* ${i.flags.map(f => `${f} (${FLAG_NAMES[f]})`).join(', ')}`
        : '*Status flags:* none');
    if (i.cpu !== '9900') {
        const flag = ({ '9995': '-5', '99000': '-105', 'f18a': '-18' } as Record<Exclude<Cpu, '9900'>, string>)[i.cpu];
        lines.push('');
        lines.push(`> Requires \`${flag}\`. Not available on a stock TI-99/4A.`);
    }
    return lines.join('\n');
}
