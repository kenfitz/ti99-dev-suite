/**
 * TMS9900 assembly source formatter.
 *
 * Ported from the prototype that was validated against a 1,487-line production
 * source. Key property: with `inputDialect: 'ea'` it rewrites legacy Editor/
 * Assembler source into a form that assembles under xas99's default (extended)
 * syntax, producing a byte-identical binary.
 *
 * See lang/dialect.ts for why the input dialect matters.
 */

import { isNoOperand } from '../data/instructions';
import type { SyntaxDialect } from './dialect';

export interface FormatOptions {
    labelColumn: number;
    opcodeColumn: number;
    operandColumn: number;
    commentColumn: number;
    uppercaseMnemonics: boolean;
    uppercaseRegisters: boolean;
    /**
     * Minimum blanks between operand and trailing comment. Clamped to 2 at use:
     * a single blank turns a `*` comment into a multiplication operator under
     * xas99 default syntax and silently changes the program.
     */
    minCommentGap: number;
    alignComments: boolean;
    /** Dialect of the text being read, which decides where the operand ends. */
    inputDialect: SyntaxDialect;
    /** Repair hazards in place instead of reflowing every line. */
    minimalChanges: boolean;
}

export type LineKind = 'code' | 'blank' | 'linecomment';

export interface LineFields {
    kind: LineKind;
    raw: string;
    label: string;
    opcode: string;
    operand: string;
    comment: string;
    /** Set when the line parses differently under strict and extended syntax. */
    ambiguous?: string;
}

export interface Hazard {
    /** Zero-based line number. */
    line: number;
    reason: string;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
    labelColumn: 1,
    opcodeColumn: 8,
    operandColumn: 13,
    commentColumn: 31,
    uppercaseMnemonics: true,
    uppercaseRegisters: true,
    minCommentGap: 2,
    alignComments: true,
    inputDialect: 'xdt99',
    minimalChanges: false,
};

const isSpace = (c: string): boolean => c === ' ' || c === '\t';

/**
 * Split a source line into its four fields.
 *
 * The hard part is finding the end of the operand field, which depends on the
 * dialect of the *input*:
 *   ea      -- a single blank ends the operand field (TI Editor/Assembler)
 *   xdt99   -- two blanks or a tab end it; single blanks may pad expressions
 *   relaxed -- only a semicolon ends it
 */
export function splitLine(line: string, dialect: SyntaxDialect = 'xdt99'): LineFields {
    const base: LineFields = { kind: 'code', raw: line, label: '', opcode: '', operand: '', comment: '' };

    if (line.trim() === '') return { ...base, kind: 'blank' };
    if (line[0] === '*' || line[0] === ';') return { ...base, kind: 'linecomment' };

    let i = 0;

    // A label must begin in column 1.
    if (!isSpace(line[0])) {
        while (i < line.length && !isSpace(line[i])) i++;
        base.label = line.slice(0, i);
    }

    while (i < line.length && isSpace(line[i])) i++;
    if (i >= line.length) return base;

    const opStart = i;
    while (i < line.length && !isSpace(line[i])) i++;
    base.opcode = line.slice(opStart, i);

    while (i < line.length && isSpace(line[i])) i++;
    if (i >= line.length) return base;

    // Instructions and directives that take no operand: the rest is comment.
    if (isNoOperand(base.opcode)) {
        base.comment = line.slice(i).trim();
        return base;
    }

    const operandStart = i;
    let inText = false;  // '...'  text literal, '' escapes a quote
    let inFile = false;  // "..."  filename literal
    let commentStart = -1;

    while (i < line.length) {
        const c = line[i];
        if (inText) {
            if (c === "'") {
                if (line[i + 1] === "'") { i += 2; continue; }
                inText = false;
            }
            i++;
            continue;
        }
        if (inFile) {
            if (c === '"') inFile = false;
            i++;
            continue;
        }
        if (c === "'") { inText = true; i++; continue; }
        if (c === '"') { inFile = true; i++; continue; }
        if (c === ';') { commentStart = i; break; }
        if (dialect !== 'relaxed') {
            if (c === '\t') { commentStart = i; break; }
            if (c === ' ') {
                if (dialect === 'ea' || line[i + 1] === ' ') { commentStart = i; break; }
            }
        }
        i++;
    }

    if (commentStart === -1) {
        base.operand = line.slice(operandStart).trimEnd();
        return base;
    }

    base.operand = line.slice(operandStart, commentStart).trimEnd();
    base.comment = line.slice(commentStart).trim();

    // Flag the exact pattern that breaks a strict-mode source under xas99 default.
    // Trailing whitespace is not a hazard -- there must be actual comment text.
    if (dialect === 'ea' &&
        base.comment.length > 0 &&
        line[commentStart] === ' ' &&
        line[commentStart + 1] !== ' ') {
        base.ambiguous = 'Comment is separated from the operand by a single blank. ' +
            'Under xas99 default syntax this is parsed as part of the expression.';
    }

    return base;
}

function padTo(text: string, column: number, minGap: number): string {
    const target = column - 1;
    if (text.length < target) return text + ' '.repeat(target - text.length);
    return text + ' '.repeat(Math.max(minGap, 1));
}

const REGISTER_RE = /\b([rR])(1[0-5]|[0-9])\b/g;

export function formatLine(line: string, opts: Partial<FormatOptions> = {}): string {
    const o: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS, ...opts };
    const gap = Math.max(2, o.minCommentGap);  // hard clamp -- see FormatOptions
    const f = splitLine(line, o.inputDialect);

    if (f.kind === 'blank') return o.minimalChanges ? line : '';
    if (f.kind === 'linecomment') return o.minimalChanges ? line : f.raw.replace(/\s+$/, '');

    // Minimal mode: leave the line exactly as written unless it is a hazard,
    // i.e. unless the assembler would read it differently than the author meant.
    if (o.minimalChanges && !f.ambiguous) return line;

    // Under a non-strict dialect, a line whose comment is separated from the
    // operand by a single blank cannot be reflowed safely: this parse cannot
    // tell comment text from expression text. Folding it into the operand and
    // re-indenting looks like the formatter is broken, and risks rewriting
    // characters inside what is really a comment. Leave the line byte for byte
    // and let the diagnostic point at it instead.
    if (!o.minimalChanges && o.inputDialect !== 'ea') {
        if (splitLine(line, 'ea').ambiguous) return line;
    }

    let out = f.label;

    if (f.opcode) {
        out = padTo(out, o.opcodeColumn, 1);
        out += o.uppercaseMnemonics ? f.opcode.toUpperCase() : f.opcode;
    }

    if (f.operand) {
        out = padTo(out, o.operandColumn, 1);
        let operand = f.operand;
        if (o.uppercaseRegisters) {
            // Only outside literals; splitLine already isolated the operand field,
            // but a literal may still sit inside it.
            operand = mapOutsideLiterals(operand, s => s.replace(REGISTER_RE, (_m, r, n) => 'R' + n));
        }
        out += operand;
    }

    if (o.minimalChanges) {
        // Repair in place: widen the single blank, preserve the original columns.
        return widenCommentGap(line, o.inputDialect, gap);
    }

    if (f.comment) {
        out = o.alignComments
            ? padTo(out, o.commentColumn, gap)
            : out + ' '.repeat(gap);
        // Guarantee the invariant even when the line already overruns the column.
        if (!new RegExp(` {${gap},}$`).test(out)) {
            out = out.replace(/ *$/, ' '.repeat(gap));
        }
        out += f.comment;
    }

    return out.replace(/\s+$/, '');
}

/**
 * Repair a hazard line without reflowing it: find the single blank that ends
 * the operand field and widen it to `gap` blanks. Columns elsewhere are
 * untouched, so a diff shows one whitespace change per affected line.
 */
export function widenCommentGap(line: string, dialect: SyntaxDialect, gap = 2): string {
    const f = splitLine(line, dialect);
    if (f.kind !== 'code' || !f.comment || !f.ambiguous) return line;

    // splitLine found the operand end; locate that same position in the raw line.
    const operandEnd = line.indexOf(f.operand) + f.operand.length;
    if (operandEnd <= 0) return line;

    const head = line.slice(0, operandEnd);
    const tail = line.slice(operandEnd).replace(/^[ \t]+/, '');
    return `${head}${' '.repeat(gap)}${tail}`;
}

/** Apply a transform to the parts of `text` that are not inside quotes. */
function mapOutsideLiterals(text: string, fn: (chunk: string) => string): string {
    let out = '';
    let chunk = '';
    let inText = false;
    let inFile = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inText) {
            out += c;
            if (c === "'") {
                if (text[i + 1] === "'") { out += text[++i]; continue; }
                inText = false;
            }
            continue;
        }
        if (inFile) {
            out += c;
            if (c === '"') inFile = false;
            continue;
        }
        if (c === "'" || c === '"') {
            out += fn(chunk);
            chunk = '';
            out += c;
            if (c === "'") inText = true;
            else inFile = true;
            continue;
        }
        chunk += c;
    }
    return out + fn(chunk);
}

export function formatText(text: string, opts: Partial<FormatOptions> = {}): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return text.split(/\r?\n/).map(l => formatLine(l, opts)).join(eol);
}

/**
 * Convert a strict Editor/Assembler source into xas99 extended syntax by
 * widening every operand-to-comment gap to at least two blanks.
 * Semantics preserved; verified byte-identical output on a real program.
 */
export function convertEaToXdt99(
    text: string,
    opts: Partial<FormatOptions> = {},
    mode: 'minimal' | 'reformat' = 'minimal',
): string {
    return formatText(text, {
        ...opts,
        inputDialect: 'ea',
        minimalChanges: mode === 'minimal',
    });
}

/** Lines whose comment would be swallowed if the file were assembled without -s. */
export function findDialectHazards(text: string): Hazard[] {
    const hazards: Hazard[] = [];
    const lines = text.split(/\r?\n/);
    for (let n = 0; n < lines.length; n++) {
        const f = splitLine(lines[n], 'ea');
        if (f.ambiguous) hazards.push({ line: n, reason: f.ambiguous });
    }
    return hazards;
}
