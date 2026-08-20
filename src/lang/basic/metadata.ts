/**
 * The built-in vocabulary of TI BASIC and TI Extended BASIC.
 *
 * This table is the single source of truth. Validation, completion, hover,
 * signature help and the tests all read it; nothing keeps a second list.
 *
 * Sources are named per entry. Where a value could not be confirmed against
 * documentation it is marked `confirm: true` rather than guessed, so an
 * unverified claim cannot quietly reach a user through a hover.
 */

/** Which interpreter accepts a construct. */
export type Dialect = 'ti-basic' | 'ti-extended-basic';

/** Everything a program can name. */
export type BuiltinKind =
    | 'statement'     // PRINT, FOR, OPEN
    | 'function'      // SEG$, RND, POS
    | 'subprogram'    // the name after CALL
    | 'operator'      // AND, XOR
    | 'keyword'       // TO, STEP, THEN - only legal inside another construct
    | 'command';      // NEW, LIST, SAVE - legal only at the prompt

export type ValueType = 'numeric' | 'string' | 'either' | 'none';

/**
 * One documented range for a numeric argument.
 *
 * Some arguments accept disjoint ranges rather than one span. CALL SOUND takes
 * a tone of 110 to 44733 or a noise of -8 to -1, and nothing between, so a
 * single min and max would either reject valid input or accept invalid input.
 */
export interface NumericRange {
    min: number;
    max: number;
    /** What this range means, e.g. "tone" or "noise". Shown in diagnostics. */
    label?: string;
}

export interface Param {
    name: string;
    type: ValueType;
    /** Omitted parameters are legal for some subprograms, e.g. CALL SOUND. */
    optional?: boolean;
    /** The parameter may repeat, e.g. the tone/volume pairs of CALL SOUND. */
    repeating?: boolean;
    /** Inclusive documented range for a numeric parameter. */
    min?: number;
    max?: number;
    /** Disjoint documented ranges, when one span cannot express the argument. */
    ranges?: NumericRange[];
    /** A sprite parameter is written #n. */
    spriteNumber?: boolean;
    /** The interpreter writes a result back into this variable. */
    output?: boolean;
    /** Documented length limits for a string argument, in characters. */
    minLength?: number;
    maxLength?: number;
    /** The string must be hexadecimal digits. */
    hexString?: boolean;
    description?: string;
}

export interface Builtin {
    name: string;
    kind: BuiltinKind;
    dialects: Dialect[];
    category: string;
    /** One-line form as the manuals write it. */
    syntax: string;
    params?: Param[];
    returns?: ValueType;
    /** Documented restrictions worth surfacing, in the manual's own terms. */
    restrictions?: string[];
    /**
     * The statement takes a line number, so the binder must resolve it and
     * renumbering must rewrite it. Marking it here keeps the list of
     * line-taking statements in one place rather than in the renumberer.
     */
    lineReference?: boolean;
    description: string;
    /** Where the claim came from. */
    reference: string;
    /**
     * Set when a detail here has not been confirmed against primary
     * documentation. Hover and signature help say so; tests count them.
     */
    confirm?: boolean;
}

/**
 * The colour table.
 *
 * Editor/Assembler manual page 332 gives the VDP hardware codes >0 to >F.
 * BASIC and Extended BASIC number the same colours 1 to 16, one higher.
 * Both are kept because a hover over CALL SCREEN wants the BASIC number and
 * anything touching VDP registers wants the hardware code.
 *
 * Confirmed against observed behaviour as well: CALL SCREEN(2) produces a
 * black screen, and the hardware code for black is >1.
 */
export interface TiColor {
    /** As written in BASIC: CALL SCREEN(n), CALL COLOR(set, fg, bg). */
    basic: number;
    /** As written to a VDP register or colour table. */
    vdp: number;
    name: string;
}

export const COLORS: readonly TiColor[] = [
    { basic: 1,  vdp: 0x0, name: 'Transparent' },
    { basic: 2,  vdp: 0x1, name: 'Black' },
    { basic: 3,  vdp: 0x2, name: 'Medium green' },
    { basic: 4,  vdp: 0x3, name: 'Light green' },
    { basic: 5,  vdp: 0x4, name: 'Dark blue' },
    { basic: 6,  vdp: 0x5, name: 'Light blue' },
    { basic: 7,  vdp: 0x6, name: 'Dark red' },
    { basic: 8,  vdp: 0x7, name: 'Cyan' },
    { basic: 9,  vdp: 0x8, name: 'Medium red' },
    { basic: 10, vdp: 0x9, name: 'Light red' },
    { basic: 11, vdp: 0xA, name: 'Dark yellow' },
    { basic: 12, vdp: 0xB, name: 'Light yellow' },
    { basic: 13, vdp: 0xC, name: 'Dark green' },
    { basic: 14, vdp: 0xD, name: 'Magenta' },
    { basic: 15, vdp: 0xE, name: 'Gray' },
    { basic: 16, vdp: 0xF, name: 'White' },
];

export function colorByBasicNumber(n: number): TiColor | undefined {
    return COLORS.find(c => c.basic === n);
}

const BOTH: Dialect[] = ['ti-basic', 'ti-extended-basic'];
const XB_ONLY: Dialect[] = ['ti-extended-basic'];

export const EA = 'Editor/Assembler manual';
const URG = "TI-99/4A User's Reference Guide";
const XBM = 'TI Extended BASIC manual';

/**
 * CALL subprograms.
 *
 * The dialect split is the most useful thing this table knows. TI BASIC has
 * ten subprograms; Extended BASIC adds the sprite set, the assembly-support
 * set and several others. Getting it wrong produces a program that tokenizes,
 * loads, and then fails at RUN with no explanation, which is the failure the
 * parser exists to prevent.
 */
export const SUBPROGRAMS: readonly Builtin[] = [
    {
        name: 'CLEAR', kind: 'subprogram', dialects: BOTH, category: 'Screen',
        syntax: 'CALL CLEAR',
        description: 'Fills the screen with spaces.',
        reference: URG,
    },
    {
        name: 'SCREEN', kind: 'subprogram', dialects: BOTH, category: 'Screen',
        syntax: 'CALL SCREEN(colour)',
        params: [{ name: 'colour', type: 'numeric', min: 1, max: 16,
                   description: 'Screen colour, 1 to 16' }],
        description: 'Sets the screen background colour.',
        reference: URG,
    },
    {
        name: 'COLOR', kind: 'subprogram', dialects: BOTH, category: 'Screen',
        syntax: 'CALL COLOR(set, foreground, background)',
        params: [
            { name: 'set', type: 'numeric', min: 1, max: 16,
              description: 'Character set, 1 to 16' },
            { name: 'foreground', type: 'numeric', min: 1, max: 16 },
            { name: 'background', type: 'numeric', min: 1, max: 16 },
        ],
        restrictions: [
            'In Extended BASIC a sprite number written #n may be given instead of a set.',
        ],
        description: 'Sets the foreground and background colours of a character set.',
        reference: URG,
    },
    {
        name: 'CHAR', kind: 'subprogram', dialects: BOTH, category: 'Graphics',
        syntax: 'CALL CHAR(character-code, pattern-identifier [, ...])',
        params: [
            // The manual documents 32 to 143 as the standard set. Real
            // Extended BASIC programs define higher codes: two independent
            // published listings in the regression corpus use 144 to 155 and
            // both are provably Extended BASIC. Validating at the documented
            // 143 makes working programs show errors, so the check uses the
            // character-set limit of 159 and the documented range is stated in
            // the restrictions instead. Flagged for PM research.
            { name: 'character-code', type: 'numeric', min: 32, max: 159,
              repeating: true,
              description: 'Character to redefine. The manual documents 32 to ' +
                  '143 for the standard set; codes to 159 are used in practice' },
            { name: 'pattern-identifier', type: 'string', hexString: true,
              repeating: true, minLength: 0, maxLength: 64,
              description: 'Zero to 64 hexadecimal characters. Sixteen describe ' +
                  'one character as eight rows of eight pixels; a longer string ' +
                  'continues into the following characters, and a shorter one is ' +
                  'padded with zeros' },
        ],
        restrictions: [
            'Extended BASIC may define as many as four consecutive characters ' +
                'in one CALL CHAR, which is why the pattern may run to 64 ' +
                'hexadecimal characters.',
            'Code and pattern may repeat as further pairs in the same call.',
            'The manual documents character codes 32 to 143. Codes 144 to 159 ' +
                'appear in published Extended BASIC programs and are accepted ' +
                'here rather than reported as errors.',
        ],
        description: 'Redefines the pattern of one or more characters.',
        reference: URG + ' and ' + XBM,
    },
    {
        name: 'HCHAR', kind: 'subprogram', dialects: BOTH, category: 'Graphics',
        syntax: 'CALL HCHAR(row, column, code [, repetitions])',
        params: [
            { name: 'row', type: 'numeric', min: 1, max: 24 },
            { name: 'column', type: 'numeric', min: 1, max: 32 },
            { name: 'code', type: 'numeric' },
            { name: 'repetitions', type: 'numeric', optional: true },
        ],
        description: 'Places a character and optionally repeats it horizontally.',
        reference: URG,
    },
    {
        name: 'VCHAR', kind: 'subprogram', dialects: BOTH, category: 'Graphics',
        syntax: 'CALL VCHAR(row, column, code [, repetitions])',
        params: [
            { name: 'row', type: 'numeric', min: 1, max: 24 },
            { name: 'column', type: 'numeric', min: 1, max: 32 },
            { name: 'code', type: 'numeric' },
            { name: 'repetitions', type: 'numeric', optional: true },
        ],
        description: 'Places a character and optionally repeats it vertically.',
        reference: URG,
    },
    {
        name: 'GCHAR', kind: 'subprogram', dialects: BOTH, category: 'Graphics',
        syntax: 'CALL GCHAR(row, column, variable)',
        params: [
            { name: 'row', type: 'numeric', min: 1, max: 24 },
            { name: 'column', type: 'numeric', min: 1, max: 32 },
            { name: 'variable', type: 'numeric',
              description: 'Receives the character code found there' },
        ],
        description: 'Reads the character at a screen position.',
        reference: URG,
    },
    {
        name: 'KEY', kind: 'subprogram', dialects: BOTH, category: 'Input',
        syntax: 'CALL KEY(unit, key, status)',
        params: [
            { name: 'unit', type: 'numeric', description: 'Keyboard unit' },
            { name: 'key', type: 'numeric', description: 'Receives the key code' },
            { name: 'status', type: 'numeric',
              description: 'Receives -1 for a new key, 1 for the same key, 0 for none' },
        ],
        description: 'Reads the keyboard without waiting.',
        reference: URG,
    },
    {
        name: 'JOYST', kind: 'subprogram', dialects: BOTH, category: 'Input',
        syntax: 'CALL JOYST(unit, x, y)',
        params: [
            { name: 'unit', type: 'numeric', min: 1, max: 2 },
            { name: 'x', type: 'numeric', description: 'Receives -4, 0 or 4' },
            { name: 'y', type: 'numeric', description: 'Receives -4, 0 or 4' },
        ],
        description: 'Reads a joystick.',
        reference: URG,
    },
    {
        name: 'SOUND', kind: 'subprogram', dialects: BOTH, category: 'Sound',
        syntax: 'CALL SOUND(duration, frequency1, volume1 [, ..., frequency4, volume4])',
        params: [
            { name: 'duration', type: 'numeric',
              ranges: [
                  { min: 1, max: 4250, label: 'milliseconds' },
                  { min: -4250, max: -1, label: 'milliseconds, interrupting' },
              ],
              description: 'Milliseconds the sound lasts. A negative duration ' +
                  'interrupts the previous sound immediately instead of waiting ' +
                  'for it to finish' },
            { name: 'frequency', type: 'numeric', repeating: true,
              ranges: [
                  { min: 110, max: 44733, label: 'tone' },
                  { min: -8, max: -1, label: 'noise' },
              ],
              description: 'A tone in hertz, or a negative value selecting one ' +
                  'of the eight noise generators' },
            { name: 'volume', type: 'numeric', min: 0, max: 30, repeating: true,
              description: '0 is loudest and 30 is silent' },
        ],
        restrictions: [
            'At most three tones and one noise may sound at once.',
            'Frequency and volume are given as pairs, up to four pairs in one call.',
        ],
        description: 'Produces tones and noise.',
        reference: URG,
    },
    {
        name: 'SPRITE', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL SPRITE(#n, code, colour, row, column [, rowvel, colvel] ...)',
        params: [
            { name: '#n', type: 'numeric', spriteNumber: true, min: 1, max: 28 },
            { name: 'code', type: 'numeric' },
            { name: 'colour', type: 'numeric', min: 1, max: 16 },
            { name: 'row', type: 'numeric' },
            { name: 'column', type: 'numeric' },
            { name: 'rowvel', type: 'numeric', optional: true },
            { name: 'colvel', type: 'numeric', optional: true },
        ],
        restrictions: [
            'Automatic motion is driven by the console interrupt routine, so it continues while the interpreter is busy.',
            'A sprite whose vertical position reaches 208 stops the video processor drawing it and every sprite after it.',
        ],
        description: 'Creates a sprite, optionally in motion.',
        reference: XBM,
    },
    {
        name: 'DELSPRITE', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL DELSPRITE(#n [, #n ...])  or  CALL DELSPRITE(ALL)',
        description: 'Removes sprites.',
        reference: XBM,
    },
    {
        name: 'MOTION', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL MOTION(#n, rowvel, colvel [, ...])',
        description: 'Changes the velocity of sprites.',
        reference: XBM,
    },
    {
        name: 'LOCATE', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL LOCATE(#n, row, column [, ...])',
        description: 'Moves sprites to a position.',
        reference: XBM,
    },
    {
        name: 'POSITION', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL POSITION(#n, row, column [, ...])',
        description: 'Reads the position of sprites.',
        reference: XBM,
    },
    {
        name: 'PATTERN', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL PATTERN(#n, code [, ...])',
        description: 'Changes the character a sprite displays.',
        reference: XBM,
    },
    {
        name: 'MAGNIFY', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL MAGNIFY(magnification-factor)',
        params: [{ name: 'magnification-factor', type: 'numeric', min: 1, max: 4,
                   description: '1 single size, 2 double size, 3 four characters, ' +
                       '4 four characters double size. The default is 1' }],
        restrictions: ['Applies to every sprite; magnification is not per sprite.'],
        description: 'Sets the size of all sprites.',
        reference: XBM,
    },
    {
        name: 'COINC', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL COINC(#a, #b, tolerance, result)  or  CALL COINC(ALL, result)',
        description: 'Detects sprite coincidence.',
        reference: XBM,
    },
    {
        name: 'DISTANCE', kind: 'subprogram', dialects: XB_ONLY, category: 'Sprites',
        syntax: 'CALL DISTANCE(#a, #b, result)',
        description: 'Measures the distance between two sprites, or a sprite and a point.',
        reference: XBM,
    },
    {
        name: 'INIT', kind: 'subprogram', dialects: XB_ONLY, category: 'Assembly',
        syntax: 'CALL INIT',
        description: 'Prepares memory expansion for assembly support.',
        reference: XBM,
    },
    {
        name: 'LOAD', kind: 'subprogram', dialects: XB_ONLY, category: 'Assembly',
        syntax: 'CALL LOAD(filename)  or  CALL LOAD(address, value, ...)',
        description: 'Loads a tagged object file, or writes bytes directly to memory.',
        reference: XBM,
    },
    {
        name: 'LINK', kind: 'subprogram', dialects: XB_ONLY, category: 'Assembly',
        syntax: 'CALL LINK(name [, argument ...])',
        description: 'Calls an assembly routine by the name it exports with DEF.',
        reference: XBM,
    },
    {
        name: 'PEEK', kind: 'subprogram', dialects: XB_ONLY, category: 'Assembly',
        syntax: 'CALL PEEK(address, variable [, ...])',
        description: 'Reads bytes from memory.',
        reference: XBM,
    },
    {
        name: 'CHARPAT', kind: 'subprogram', dialects: XB_ONLY, category: 'Graphics',
        syntax: 'CALL CHARPAT(code, variable [, ...])',
        description: 'Reads the pattern of a character.',
        reference: XBM,
    },
    {
        name: 'CHARSET', kind: 'subprogram', dialects: XB_ONLY, category: 'Graphics',
        syntax: 'CALL CHARSET',
        description: 'Restores the standard character patterns.',
        reference: XBM,
    },
    {
        name: 'ERR', kind: 'subprogram', dialects: XB_ONLY, category: 'Errors',
        syntax: 'CALL ERR(code, type [, severity, line])',
        description: 'Reports the most recent error, for use with ON ERROR.',
        reference: XBM,
    },
    {
        name: 'VERSION', kind: 'subprogram', dialects: XB_ONLY, category: 'System',
        syntax: 'CALL VERSION(numeric-variable)',
        params: [{ name: 'numeric-variable', type: 'numeric', output: true,
                   description: 'Receives the version number of the interpreter' }],
        restrictions: [
            'The argument is written to, so it must be a variable rather than ' +
                'an expression.',
            'Values of 100 and 110 are known to occur. The set is not closed, ' +
                'so do not test for equality with a fixed list.',
        ],
        description: 'Reports the version of Extended BASIC in use.',
        reference: XBM,
    },
];

/** Every built-in, from every category. Providers read this. */
export function allBuiltins(): readonly Builtin[] {
    return SUBPROGRAMS;
}

/** Built-ins available in a dialect. */
export function builtinsFor(dialect: Dialect): Builtin[] {
    return allBuiltins().filter(b => b.dialects.includes(dialect));
}

/** Look up one built-in by name within a dialect. */
export function findBuiltin(name: string, dialect: Dialect): Builtin | undefined {
    const upper = name.toUpperCase();
    return allBuiltins().find(b => b.name === upper && b.dialects.includes(dialect));
}

/**
 * A built-in that exists, but not in this dialect. Drives the diagnostic that
 * says CALL SPRITE requires Extended BASIC rather than merely "unknown".
 */
export function findInOtherDialect(name: string, dialect: Dialect): Builtin | undefined {
    const upper = name.toUpperCase();
    return allBuiltins().find(b => b.name === upper && !b.dialects.includes(dialect));
}

/**
 * Statements and commands.
 *
 * A statement runs inside a program. A command runs only at the prompt. The
 * distinction matters because using a command as a statement is a documented
 * error, and it is one of the few things that can be checked statically.
 */
export const STATEMENTS: readonly Builtin[] = [
    // --- flow --------------------------------------------------------------
    {
        name: 'GOTO', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'GOTO line-number', lineReference: true,
        description: 'Transfers control to a line.', reference: URG,
    },
    {
        name: 'GO TO', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'GO TO line-number', lineReference: true,
        description: 'Spelling variant of GOTO.', reference: URG,
    },
    {
        name: 'GOSUB', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'GOSUB line-number', lineReference: true,
        description: 'Calls a subroutine at a line.', reference: URG,
    },
    {
        name: 'GO SUB', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'GO SUB line-number', lineReference: true,
        description: 'Spelling variant of GOSUB.', reference: URG,
    },
    {
        name: 'RETURN', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'RETURN  or  RETURN line-number',
        description: 'Returns from a subroutine, or from an error handler.',
        reference: URG,
    },
    {
        name: 'ON', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'ON expression GOTO line [, line ...]  or  ON expression GOSUB line [, line ...]',
        lineReference: true,
        description: 'Branches to the nth line in the list.', reference: URG,
    },
    {
        name: 'IF', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'IF condition THEN line-or-statement [ELSE line-or-statement]',
        lineReference: true,
        description: 'Conditional execution.',
        restrictions: [
            'TI BASIC allows only a line number after THEN and ELSE. Extended ' +
                'BASIC also allows statements.',
        ],
        reference: URG,
    },
    {
        name: 'FOR', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'FOR variable = start TO limit [STEP increment]',
        description: 'Begins a counted loop.', reference: URG,
    },
    {
        name: 'NEXT', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'NEXT variable',
        description: 'Ends a counted loop.', reference: URG,
    },
    {
        name: 'END', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'END', description: 'Ends the program.', reference: URG,
    },
    {
        name: 'STOP', kind: 'statement', dialects: BOTH, category: 'Flow',
        syntax: 'STOP', description: 'Stops the program.', reference: URG,
    },

    // --- assignment and data ----------------------------------------------
    {
        name: 'LET', kind: 'statement', dialects: BOTH, category: 'Assignment',
        syntax: 'LET variable = expression',
        description: 'Assigns a value. LET itself is optional.', reference: URG,
    },
    {
        name: 'DIM', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'DIM array(size [, size, size]) [, array(size) ...]',
        description: 'Declares array dimensions.',
        restrictions: ['Up to three dimensions in TI BASIC, seven in Extended BASIC.'],
        reference: URG,
    },
    {
        name: 'DATA', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'DATA value [, value ...]',
        description: 'Supplies constants for READ.',
        restrictions: ['Everything after DATA is data, so it may not be followed ' +
            'by another statement on the same line.'],
        reference: URG,
    },
    {
        name: 'READ', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'READ variable [, variable ...]',
        description: 'Reads the next DATA values.', reference: URG,
    },
    {
        name: 'RESTORE', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'RESTORE [line-number]  or  RESTORE #file-number [, REC record]',
        lineReference: true,
        description: 'Resets the DATA pointer, or repositions a file.', reference: URG,
    },
    {
        name: 'OPTION', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'OPTION BASE 0  or  OPTION BASE 1',
        description: 'Sets the lowest array subscript.', reference: URG,
    },
    {
        name: 'DEF', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'DEF name [(parameter)] = expression',
        description: 'Defines a single-line function.', reference: URG,
    },

    // --- input and output --------------------------------------------------
    {
        name: 'PRINT', kind: 'statement', dialects: BOTH, category: 'Output',
        syntax: 'PRINT [#file-number,] [USING image,] item [; item ...]',
        description: 'Writes to the screen or a file.',
        restrictions: ['PRINT USING requires Extended BASIC.'],
        reference: URG,
    },
    {
        name: 'DISPLAY', kind: 'statement', dialects: BOTH, category: 'Output',
        syntax: 'DISPLAY item  or  DISPLAY [AT(row, column)] [BEEP] [ERASE ALL] ' +
            '[SIZE(n)] [USING image] : item',
        description: 'Writes to the screen.',
        restrictions: ['The AT, BEEP, ERASE ALL, SIZE and USING clauses require ' +
            'Extended BASIC.'],
        reference: URG,
    },
    {
        name: 'INPUT', kind: 'statement', dialects: BOTH, category: 'Input',
        syntax: 'INPUT ["prompt":] variable [, variable ...]  or  INPUT #file-number, variable',
        description: 'Reads from the keyboard or a file.', reference: URG,
    },
    {
        name: 'LINPUT', kind: 'statement', dialects: XB_ONLY, category: 'Input',
        syntax: 'LINPUT [#file-number,] ["prompt":] string-variable',
        description: 'Reads a whole line, punctuation included.', reference: XBM,
    },
    {
        name: 'ACCEPT', kind: 'statement', dialects: XB_ONLY, category: 'Input',
        syntax: 'ACCEPT [AT(row, column)] [VALIDATE(...)] [BEEP] [ERASE ALL] ' +
            '[SIZE(n)] : variable',
        description: 'Reads input at a screen position, with validation.',
        reference: XBM,
    },
    {
        name: 'IMAGE', kind: 'statement', dialects: XB_ONLY, category: 'Output',
        syntax: 'IMAGE format-string',
        description: 'Defines a format for PRINT USING and DISPLAY USING.',
        restrictions: ['The whole rest of the line is the format, quoted or not.'],
        reference: XBM,
    },

    // --- files -------------------------------------------------------------
    {
        name: 'OPEN', kind: 'statement', dialects: BOTH, category: 'Files',
        syntax: 'OPEN #file-number : "device.file" [, organisation] [, type] ' +
            '[, mode] [, record-length]',
        description: 'Opens a file.', reference: URG,
    },
    {
        name: 'CLOSE', kind: 'statement', dialects: BOTH, category: 'Files',
        syntax: 'CLOSE #file-number [: DELETE]',
        description: 'Closes a file.', reference: URG,
    },

    // --- debugging ---------------------------------------------------------
    {
        name: 'REM', kind: 'statement', dialects: BOTH, category: 'Comment',
        syntax: 'REM text',
        description: 'A comment. The rest of the line is ignored.', reference: URG,
    },
    {
        name: 'RANDOMIZE', kind: 'statement', dialects: BOTH, category: 'Data',
        syntax: 'RANDOMIZE [seed]',
        description: 'Reseeds the random number generator.', reference: URG,
    },
    {
        name: 'BREAK', kind: 'statement', dialects: BOTH, category: 'Debug',
        syntax: 'BREAK [line-number [, line-number ...]]', lineReference: true,
        description: 'Sets breakpoints.', reference: URG,
    },
    {
        name: 'UNBREAK', kind: 'statement', dialects: BOTH, category: 'Debug',
        syntax: 'UNBREAK [line-number [, line-number ...]]', lineReference: true,
        description: 'Clears breakpoints.', reference: URG,
    },
    {
        name: 'TRACE', kind: 'statement', dialects: BOTH, category: 'Debug',
        syntax: 'TRACE', description: 'Displays line numbers as they run.',
        reference: URG,
    },
    {
        name: 'UNTRACE', kind: 'statement', dialects: BOTH, category: 'Debug',
        syntax: 'UNTRACE', description: 'Stops tracing.', reference: URG,
    },

    // --- Extended BASIC structure and error handling -----------------------
    {
        name: 'SUB', kind: 'statement', dialects: XB_ONLY, category: 'Subprograms',
        syntax: 'SUB name [(parameter [, parameter ...])]',
        description: 'Begins a user-defined subprogram.', reference: XBM,
    },
    {
        name: 'SUBEND', kind: 'statement', dialects: XB_ONLY, category: 'Subprograms',
        syntax: 'SUBEND', description: 'Ends a subprogram and returns.', reference: XBM,
    },
    {
        name: 'SUBEXIT', kind: 'statement', dialects: XB_ONLY, category: 'Subprograms',
        syntax: 'SUBEXIT', description: 'Returns from a subprogram early.',
        reference: XBM,
    },
    {
        name: 'RUN', kind: 'statement', dialects: XB_ONLY, category: 'Flow',
        syntax: 'RUN [line-number]  or  RUN "device.file"', lineReference: true,
        description: 'Runs this program from a line, or loads and runs another.',
        reference: XBM,
    },
    {
        name: 'ON ERROR', kind: 'statement', dialects: XB_ONLY, category: 'Errors',
        syntax: 'ON ERROR line-number  or  ON ERROR STOP', lineReference: true,
        description: 'Installs an error handler.', reference: XBM,
    },
    {
        name: 'ON WARNING', kind: 'statement', dialects: XB_ONLY, category: 'Errors',
        syntax: 'ON WARNING PRINT  or  ON WARNING STOP  or  ON WARNING NEXT',
        description: 'Chooses what warnings do.', reference: XBM,
    },
    {
        name: 'ON BREAK', kind: 'statement', dialects: XB_ONLY, category: 'Errors',
        syntax: 'ON BREAK STOP  or  ON BREAK NEXT',
        description: 'Chooses what a breakpoint does.', reference: XBM,
    },
];

/**
 * Commands.
 *
 * These run at the prompt, not inside a program. Extended BASIC allows a few
 * of them as statements as well, which is noted per entry.
 */
export const COMMANDS: readonly Builtin[] = [
    { name: 'NEW', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'NEW', description: 'Clears the program and variables.', reference: URG },
    { name: 'LIST', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'LIST ["device":] [start] [- stop]',
      description: 'Lists the program.', reference: URG },
    { name: 'OLD', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'OLD "device.file"', description: 'Loads a program.', reference: URG },
    { name: 'SAVE', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'SAVE "device.file" [, PROTECTED]',
      description: 'Saves the program.', reference: URG },
    { name: 'BYE', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'BYE', description: 'Returns to the title screen.', reference: URG },
    { name: 'CONTINUE', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'CONTINUE', description: 'Resumes after a breakpoint.', reference: URG },
    { name: 'NUMBER', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'NUMBER [start [, increment]]',
      description: 'Generates line numbers while typing.', reference: URG },
    { name: 'RESEQUENCE', kind: 'command', dialects: BOTH, category: 'Command',
      syntax: 'RESEQUENCE [start [, increment]]',
      description: 'Renumbers the program and its line references.', reference: URG },
    { name: 'MERGE', kind: 'command', dialects: XB_ONLY, category: 'Command',
      syntax: 'MERGE "device.file"',
      description: 'Merges a program saved in MERGE format.', reference: XBM },
    { name: 'DELETE', kind: 'command', dialects: XB_ONLY, category: 'Command',
      syntax: 'DELETE "device.file"  or  DELETE line-range',
      description: 'Deletes a file, or program lines.', reference: XBM },
    { name: 'SIZE', kind: 'command', dialects: XB_ONLY, category: 'Command',
      syntax: 'SIZE', description: 'Reports free memory.', reference: XBM },
];

/** Built-in functions. */
export const FUNCTIONS: readonly Builtin[] = [
    // numeric
    { name: 'ABS', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'ABS(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Absolute value.', reference: URG },
    { name: 'ATN', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'ATN(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Arctangent, in radians.', reference: URG },
    { name: 'COS', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'COS(radians)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Cosine.', reference: URG },
    { name: 'EXP', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'EXP(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'e raised to a power.', reference: URG },
    { name: 'INT', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'INT(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Greatest integer not exceeding the value.', reference: URG },
    { name: 'LOG', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'LOG(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Natural logarithm.', reference: URG },
    { name: 'SGN', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'SGN(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Sign: -1, 0 or 1.', reference: URG },
    { name: 'SIN', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'SIN(radians)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Sine.', reference: URG },
    { name: 'SQR', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'SQR(numeric-expression)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Square root.', reference: URG },
    { name: 'TAN', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'TAN(radians)', returns: 'numeric',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'Tangent.', reference: URG },
    { name: 'RND', kind: 'function', dialects: BOTH, category: 'Numeric',
      syntax: 'RND', returns: 'numeric',
      description: 'A random number from 0 up to but not including 1.',
      restrictions: ['Written without parentheses.'], reference: URG },

    // string
    { name: 'ASC', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'ASC(string-expression)', returns: 'numeric',
      params: [{ name: 's', type: 'string' }],
      description: 'Character code of the first character.', reference: URG },
    { name: 'CHR$', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'CHR$(numeric-expression)', returns: 'string',
      params: [{ name: 'code', type: 'numeric', min: 0, max: 32767 }],
      description: 'The character with that code.', reference: URG },
    { name: 'LEN', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'LEN(string-expression)', returns: 'numeric',
      params: [{ name: 's', type: 'string' }],
      description: 'Length in characters.', reference: URG },
    { name: 'POS', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'POS(string1, string2, start)', returns: 'numeric',
      params: [
          { name: 'string1', type: 'string' },
          { name: 'string2', type: 'string' },
          { name: 'start', type: 'numeric' },
      ],
      description: 'Position of string2 within string1, or 0.', reference: URG },
    { name: 'SEG$', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'SEG$(string-expression, position, length)', returns: 'string',
      params: [
          { name: 'string', type: 'string' },
          { name: 'position', type: 'numeric' },
          { name: 'length', type: 'numeric' },
      ],
      description: 'A substring.', reference: URG },
    { name: 'STR$', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'STR$(numeric-expression)', returns: 'string',
      params: [{ name: 'x', type: 'numeric' }],
      description: 'The number as a string.', reference: URG },
    { name: 'VAL', kind: 'function', dialects: BOTH, category: 'String',
      syntax: 'VAL(string-expression)', returns: 'numeric',
      params: [{ name: 's', type: 'string' }],
      description: 'The string as a number.', reference: URG },

    // files
    { name: 'EOF', kind: 'function', dialects: BOTH, category: 'Files',
      syntax: 'EOF(file-number)', returns: 'numeric',
      params: [{ name: 'file-number', type: 'numeric' }],
      description: 'End-of-file status: 0, 1 or -1.', reference: URG },
    { name: 'REC', kind: 'function', dialects: BOTH, category: 'Files',
      syntax: 'REC(file-number)', returns: 'numeric',
      params: [{ name: 'file-number', type: 'numeric' }],
      description: 'The current record number of a relative file.', reference: URG },

    // output positioning
    { name: 'TAB', kind: 'function', dialects: BOTH, category: 'Output',
      syntax: 'TAB(numeric-expression)', returns: 'none',
      params: [{ name: 'column', type: 'numeric' }],
      description: 'Moves printing to a column. Only inside PRINT or DISPLAY.',
      reference: URG },

    // Extended BASIC additions
    { name: 'MAX', kind: 'function', dialects: XB_ONLY, category: 'Numeric',
      syntax: 'MAX(a, b)', returns: 'numeric',
      params: [{ name: 'a', type: 'numeric' }, { name: 'b', type: 'numeric' }],
      description: 'The larger of two values.', reference: XBM },
    { name: 'MIN', kind: 'function', dialects: XB_ONLY, category: 'Numeric',
      syntax: 'MIN(a, b)', returns: 'numeric',
      params: [{ name: 'a', type: 'numeric' }, { name: 'b', type: 'numeric' }],
      description: 'The smaller of two values.', reference: XBM },
    { name: 'PI', kind: 'function', dialects: XB_ONLY, category: 'Numeric',
      syntax: 'PI', returns: 'numeric',
      description: 'The constant pi.',
      restrictions: ['Written without parentheses.'], reference: XBM },
    { name: 'RPT$', kind: 'function', dialects: XB_ONLY, category: 'String',
      syntax: 'RPT$(string-expression, repetitions)', returns: 'string',
      params: [
          { name: 'string', type: 'string' },
          { name: 'repetitions', type: 'numeric' },
      ],
      description: 'A string repeated.', reference: XBM },
];

/** Operator precedence, lowest binding first. */
export interface OperatorInfo {
    symbol: string;
    /** Higher binds tighter. */
    precedence: number;
    kind: 'binary' | 'unary';
    dialects: Dialect[];
    description: string;
}

/**
 * The operator table.
 *
 * Precedence follows the manuals: exponentiation binds tightest, then unary
 * minus, then the usual arithmetic, then string concatenation, then the
 * relations, and finally the logical operators. AND binds tighter than OR.
 */
export const OPERATORS: readonly OperatorInfo[] = [
    { symbol: 'OR', precedence: 1, kind: 'binary', dialects: BOTH, description: 'Logical or' },
    { symbol: 'XOR', precedence: 1, kind: 'binary', dialects: XB_ONLY, description: 'Logical exclusive or' },
    { symbol: 'AND', precedence: 2, kind: 'binary', dialects: BOTH, description: 'Logical and' },
    { symbol: 'NOT', precedence: 3, kind: 'unary', dialects: BOTH, description: 'Logical not' },
    { symbol: '=', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Equal' },
    { symbol: '<>', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Not equal' },
    { symbol: '<', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Less than' },
    { symbol: '>', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Greater than' },
    { symbol: '<=', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Less than or equal' },
    { symbol: '>=', precedence: 4, kind: 'binary', dialects: BOTH, description: 'Greater than or equal' },
    { symbol: '&', precedence: 5, kind: 'binary', dialects: XB_ONLY, description: 'String concatenation' },
    { symbol: '+', precedence: 6, kind: 'binary', dialects: BOTH, description: 'Add' },
    { symbol: '-', precedence: 6, kind: 'binary', dialects: BOTH, description: 'Subtract' },
    { symbol: '*', precedence: 7, kind: 'binary', dialects: BOTH, description: 'Multiply' },
    { symbol: '/', precedence: 7, kind: 'binary', dialects: BOTH, description: 'Divide' },
    { symbol: '-u', precedence: 8, kind: 'unary', dialects: BOTH, description: 'Negation' },
    { symbol: '^', precedence: 9, kind: 'binary', dialects: BOTH, description: 'Exponentiation' },
];

export function findOperator(symbol: string): OperatorInfo | undefined {
    return OPERATORS.find(o => o.symbol === symbol.toUpperCase());
}

/** Every builtin of every kind. */
export function allBuiltinsComplete(): Builtin[] {
    return [...SUBPROGRAMS, ...STATEMENTS, ...COMMANDS, ...FUNCTIONS];
}

/** Look a name up across every kind, for the dialect given. */
export function lookup(name: string, dialect: Dialect, kind?: BuiltinKind): Builtin | undefined {
    const wanted = name.toUpperCase();
    return allBuiltinsComplete().find(b =>
        b.name === wanted && b.dialects.includes(dialect) && (!kind || b.kind === kind));
}

/** Look a name up in the other dialect, to explain why it was rejected. */
export function lookupOtherDialect(name: string, dialect: Dialect, kind?: BuiltinKind): Builtin | undefined {
    const other: Dialect = dialect === 'ti-basic' ? 'ti-extended-basic' : 'ti-basic';
    return lookup(name, other, kind);
}
