/**
 * The abstract syntax tree for TI BASIC and TI Extended BASIC.
 *
 * One tree serves both dialects. A construct that only Extended BASIC accepts
 * still parses in TI BASIC and is reported by the validator, because a parse
 * error tells the user far less than "ACCEPT requires Extended BASIC" does.
 *
 * Every node carries an exact source range. That is what lets diagnostics
 * point at the right characters, navigation jump to the right place, and any
 * later refactoring rewrite only what it meant to touch. A node without a
 * usable range is a bug, not a shortcut.
 */

export interface Range {
    /** Offset of the first character within the document. */
    start: number;
    /** Offset one past the last character. */
    end: number;
    /** Zero-based line within the document. */
    line: number;
    /** Zero-based column of the first character. */
    column: number;
}

export interface NodeBase extends Range {
    kind: string;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface NumericLiteral extends NodeBase {
    kind: 'NumericLiteral';
    value: number;
    /** Exactly as written, so 1E-3 can be re-emitted unchanged. */
    text: string;
}

export interface StringLiteral extends NodeBase {
    kind: 'StringLiteral';
    /** Decoded value, with doubled quotes collapsed. */
    value: string;
    text: string;
}

export interface Variable extends NodeBase {
    kind: 'Variable';
    name: string;
    /** A trailing dollar makes it a string variable. */
    isString: boolean;
}

export interface ArrayReference extends NodeBase {
    kind: 'ArrayReference';
    name: string;
    isString: boolean;
    subscripts: Expression[];
}

export interface FunctionCall extends NodeBase {
    kind: 'FunctionCall';
    name: string;
    args: Expression[];
    /** True when the name resolved to a user DEF rather than a built-in. */
    userDefined?: boolean;
}

export interface UnaryExpression extends NodeBase {
    kind: 'UnaryExpression';
    operator: string;
    operand: Expression;
}

export interface BinaryExpression extends NodeBase {
    kind: 'BinaryExpression';
    operator: string;
    left: Expression;
    right: Expression;
}

export interface ParenExpression extends NodeBase {
    kind: 'ParenExpression';
    inner: Expression;
}

/** A reference to a program line, as GOTO and friends take. */
export interface LineReference extends NodeBase {
    kind: 'LineReference';
    value: number;
    text: string;
}

/** A file number written #n. */
export interface FileNumber extends NodeBase {
    kind: 'FileNumber';
    expression: Expression;
}

/** Something that could not be parsed. Keeps the range so it can be reported. */
export interface ErrorExpression extends NodeBase {
    kind: 'ErrorExpression';
    text: string;
}

export type Expression =
    | NumericLiteral | StringLiteral | Variable | ArrayReference | FunctionCall
    | UnaryExpression | BinaryExpression | ParenExpression | LineReference
    | FileNumber | ErrorExpression;

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export interface Assignment extends NodeBase {
    kind: 'Assignment';
    /** Present when the optional LET was written. */
    hasLet: boolean;
    target: Variable | ArrayReference | ErrorExpression;
    value: Expression;
}

/** One item in a PRINT or DISPLAY list, with the separator that followed it. */
export interface PrintItem extends Range {
    expression?: Expression;
    /** ";" packs, "," moves to the next zone, ":" starts a new line. */
    separator?: string;
}

export interface PrintStatement extends NodeBase {
    kind: 'PrintStatement';
    /** PRINT or DISPLAY. */
    keyword: string;
    file?: FileNumber;
    /** The image of PRINT USING, either a line reference or a string. */
    using?: Expression;
    /** Extended BASIC DISPLAY clauses: AT, BEEP, ERASE ALL, SIZE. */
    clauses: DisplayClause[];
    items: PrintItem[];
}

export interface DisplayClause extends Range {
    name: string;
    args: Expression[];
}

export interface InputStatement extends NodeBase {
    kind: 'InputStatement';
    /** INPUT or LINPUT or ACCEPT. */
    keyword: string;
    file?: FileNumber;
    prompt?: Expression;
    clauses: DisplayClause[];
    targets: Expression[];
}

export interface IfStatement extends NodeBase {
    kind: 'IfStatement';
    condition: Expression;
    /** THEN takes a line number or, in Extended BASIC, statements. */
    thenLine?: LineReference;
    thenStatements: Statement[];
    elseLine?: LineReference;
    elseStatements: Statement[];
}

export interface ForStatement extends NodeBase {
    kind: 'ForStatement';
    /**
     * Documented as a simple numeric variable. An array element parses so the
     * validator can report it precisely rather than the parser losing it.
     */
    variable: Variable | ArrayReference | ErrorExpression;
    from: Expression;
    to: Expression;
    step?: Expression;
}

export interface NextStatement extends NodeBase {
    kind: 'NextStatement';
    variable?: Variable | ArrayReference | ErrorExpression;
}

export interface GotoStatement extends NodeBase {
    kind: 'GotoStatement';
    /** GOTO or GOSUB. */
    keyword: string;
    target?: LineReference;
}

export interface OnGotoStatement extends NodeBase {
    kind: 'OnGotoStatement';
    selector: Expression;
    /** GOTO or GOSUB. */
    keyword: string;
    targets: LineReference[];
}

export interface ReturnStatement extends NodeBase {
    kind: 'ReturnStatement';
    target?: LineReference;
}

export interface OnErrorStatement extends NodeBase {
    kind: 'OnErrorStatement';
    /** ERROR, WARNING or BREAK. */
    what: string;
    target?: LineReference;
    /** STOP, NEXT or PRINT, where the dialect allows it. */
    action?: string;
}

export interface DataStatement extends NodeBase {
    kind: 'DataStatement';
    /** Raw operand text, quoted or not, exactly as written. */
    values: DataItem[];
}

export interface DataItem extends Range {
    text: string;
    quoted: boolean;
}

export interface ReadStatement extends NodeBase {
    kind: 'ReadStatement';
    targets: Expression[];
}

export interface RestoreStatement extends NodeBase {
    kind: 'RestoreStatement';
    target?: LineReference;
    file?: FileNumber;
    record?: Expression;
}

export interface DimStatement extends NodeBase {
    kind: 'DimStatement';
    declarations: ArrayReference[];
}

export interface DefStatement extends NodeBase {
    kind: 'DefStatement';
    name: string;
    isString: boolean;
    parameter?: Variable;
    body: Expression;
}

export interface OptionStatement extends NodeBase {
    kind: 'OptionStatement';
    base: number;
}

export interface OpenStatement extends NodeBase {
    kind: 'OpenStatement';
    file?: FileNumber;
    device?: Expression;
    /** RELATIVE, SEQUENTIAL, INTERNAL, DISPLAY, FIXED, VARIABLE, INPUT, ... */
    options: OpenOption[];
}

export interface OpenOption extends Range {
    name: string;
    value?: Expression;
}

export interface CloseStatement extends NodeBase {
    kind: 'CloseStatement';
    file?: FileNumber;
    deleteFile: boolean;
}

export interface CallStatement extends NodeBase {
    kind: 'CallStatement';
    name: string;
    /** Range of just the subprogram name, for navigation and diagnostics. */
    nameRange: Range;
    args: Expression[];
}

export interface SubStatement extends NodeBase {
    kind: 'SubStatement';
    name: string;
    nameRange: Range;
    parameters: Expression[];
}

export interface SubEndStatement extends NodeBase { kind: 'SubEndStatement' }
export interface SubExitStatement extends NodeBase { kind: 'SubExitStatement' }

export interface RunStatement extends NodeBase {
    kind: 'RunStatement';
    target?: LineReference;
    program?: Expression;
}

export interface ImageStatement extends NodeBase {
    kind: 'ImageStatement';
    format: string;
    formatRange: Range;
}

export interface Comment extends NodeBase {
    kind: 'Comment';
    /** REM or ! */
    marker: string;
    text: string;
}

/** END, STOP, RETURN without a target, TRACE, UNTRACE, and the like. */
export interface SimpleStatement extends NodeBase {
    kind: 'SimpleStatement';
    keyword: string;
    /** BREAK and UNBREAK take an optional line list. */
    lines: LineReference[];
    /** RANDOMIZE takes an optional seed. */
    argument?: Expression;
}

export interface UnknownStatement extends NodeBase {
    kind: 'UnknownStatement';
    text: string;
    /** The first word, when there was one, so it can be named in the message. */
    word?: string;
}

export type Statement =
    | Assignment | PrintStatement | InputStatement | IfStatement | ForStatement
    | NextStatement | GotoStatement | OnGotoStatement | ReturnStatement
    | OnErrorStatement | DataStatement | ReadStatement | RestoreStatement
    | DimStatement | DefStatement | OptionStatement | OpenStatement
    | CloseStatement | CallStatement | SubStatement | SubEndStatement
    | SubExitStatement | RunStatement | ImageStatement | Comment
    | SimpleStatement | UnknownStatement;

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

export interface ProgramLine extends NodeBase {
    kind: 'ProgramLine';
    /** Absent when the line was written without a number. */
    lineNumber?: number;
    lineNumberRange?: Range;
    /** A label definition, in xbas99 label mode. */
    label?: string;
    labelRange?: Range;
    statements: Statement[];
}

export interface Program extends NodeBase {
    kind: 'Program';
    lines: ProgramLine[];
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

/** Every child node of any node, in source order where it matters. */
export function childrenOf(node: NodeBase): NodeBase[] {
    const out: NodeBase[] = [];
    const add = (v: unknown): void => {
        if (!v) { return; }
        if (Array.isArray(v)) { v.forEach(add); return; }
        const candidate = v as NodeBase;
        if (typeof candidate === 'object' && typeof candidate.kind === 'string') {
            out.push(candidate);
        } else if (typeof candidate === 'object' && 'expression' in (candidate as object)) {
            // PrintItem and friends carry a node without being one themselves.
            add((candidate as { expression?: unknown }).expression);
        }
    };
    for (const [key, value] of Object.entries(node)) {
        if (key === 'kind' || key === 'nameRange' || key === 'lineNumberRange' ||
            key === 'formatRange' || key === 'labelRange') { continue; }
        add(value);
    }
    return out;
}

/** Depth-first walk, parents before children. */
export function walk(node: NodeBase, visit: (n: NodeBase) => void): void {
    visit(node);
    for (const child of childrenOf(node)) { walk(child, visit); }
}

/** The innermost node covering an offset, or undefined. */
export function nodeAt(root: NodeBase, offset: number): NodeBase | undefined {
    let best: NodeBase | undefined;
    walk(root, n => {
        if (n.start <= offset && offset <= n.end) {
            if (!best || (n.end - n.start) <= (best.end - best.start)) { best = n; }
        }
    });
    return best;
}
