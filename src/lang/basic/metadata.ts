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
    | 'keyword';      // TO, STEP, THEN - only legal inside another construct

export type ValueType = 'numeric' | 'string' | 'either' | 'none';

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
    /** A sprite parameter is written #n. */
    spriteNumber?: boolean;
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
        syntax: 'CALL CHAR(code, pattern)',
        params: [
            { name: 'code', type: 'numeric', min: 32, max: 159,
              description: 'Character code to redefine' },
            { name: 'pattern', type: 'string',
              description: 'Sixteen hexadecimal digits: eight rows of eight pixels' },
        ],
        description: 'Redefines the pattern of a character.',
        reference: URG,
        confirm: true,
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
        syntax: 'CALL SOUND(duration, frequency, volume [, frequency, volume ...])',
        params: [
            { name: 'duration', type: 'numeric',
              description: 'Milliseconds; a negative value begins the sound at once' },
            { name: 'frequency', type: 'numeric', repeating: true,
              description: 'Tone in hertz, or a negative value selecting noise' },
            { name: 'volume', type: 'numeric', min: 0, max: 30, repeating: true,
              description: '0 is loudest, 30 is silent' },
        ],
        restrictions: ['Up to three tones and one noise may sound together.'],
        description: 'Produces tones and noise.',
        reference: URG,
        confirm: true,
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
        syntax: 'CALL MAGNIFY(factor)',
        params: [{ name: 'factor', type: 'numeric', min: 1, max: 4,
                   description: '1 single size, 2 double size, 3 and 4 magnified' }],
        description: 'Sets the size of all sprites.',
        reference: XBM,
        confirm: true,
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
        syntax: 'CALL VERSION(variable)',
        description: 'Reports the Extended BASIC version.',
        reference: XBM,
        confirm: true,
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
