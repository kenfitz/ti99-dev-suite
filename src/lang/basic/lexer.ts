/**
 * Lexer for TI BASIC and TI Extended BASIC.
 *
 * The awkward part of this language is that the meaning of text depends on the
 * keyword before it. After DATA, commas separate operands and quoting is
 * optional. After REM or !, everything to end of line is text. After IMAGE a
 * format string runs to end of line whether or not it is quoted. After GOTO a
 * number is a line reference, but after RUN a number is a line reference and a
 * string is a filename.
 *
 * xbas99 handles this with follow-token classes, and this lexer mirrors them
 * deliberately: anything we accept should be something xbas99 can encode.
 *
 * The lexer is therefore mode-driven, with the parser saying what to expect
 * next. A single regular-expression pass cannot do this, which is why there is
 * not one here.
 */

export type TokenKind =
    | "line-number"
    | "number"
    | "string"
    | "identifier"
    | "keyword"
    | "operator"
    | "separator"
    | "statement-sep"
    | "comment-text"
    | "data-item"
    | "image-text"
    | "unquoted-string"
    | "label"
    | "label-ref"
    | "eol"
    | "unknown";

export interface Token {
    kind: TokenKind;
    /** Text exactly as written, so source can be re-emitted unchanged. */
    text: string;
    start: number;
    end: number;
    /** Zero-based line within the document. */
    line: number;
    /** Zero-based column within the line. */
    column: number;
    /** Set when the token is not well formed, such as an unterminated string. */
    error?: string;
}

/** What the lexer should produce next. The parser sets this. */
export type LexMode = "statement" | "comment" | "data" | "image" | "unquoted";

export interface LexOptions {
    /** Extended BASIC allows :: and ! comments. */
    allowStatementSeparator: boolean;
    /** Label mode: NAME: definitions and @NAME references. */
    labels: boolean;
}

const OPERATORS = ["<=", ">=", "<>", "+", "-", "*", "/", "^", "=", "<", ">", "&"];
const SEPARATORS = ",;:()#";

/**
 * Reserved words, taken from the xbas99 token table. Membership decides
 * keyword versus variable name; which dialect a keyword belongs to is the
 * metadata table's business, not the lexer's.
 */
export const RESERVED = new Set([
    "ELSE", "IF", "GO", "GOTO", "GOSUB", "RETURN", "DEF", "DIM", "END", "FOR",
    "LET", "BREAK", "UNBREAK", "TRACE", "UNTRACE", "INPUT", "DATA", "RESTORE",
    "RANDOMIZE", "NEXT", "READ", "STOP", "DELETE", "REM", "ON", "PRINT", "CALL",
    "OPTION", "OPEN", "CLOSE", "SUB", "DISPLAY", "IMAGE", "ACCEPT", "ERROR",
    "WARNING", "SUBEXIT", "SUBEND", "RUN", "LINPUT", "THEN", "TO", "STEP",
    "OR", "AND", "XOR", "NOT", "EOF", "ABS", "ATN", "COS", "EXP", "INT", "LOG",
    "SGN", "SIN", "SQR", "TAN", "LEN", "CHR$", "RND", "SEG$", "POS", "VAL",
    "STR$", "ASC", "PI", "REC", "MAX", "MIN", "RPT$", "NUMERIC", "DIGIT",
    "UALPHA", "SIZE", "ALL", "USING", "BEEP", "ERASE", "AT", "BASE",
    "VARIABLE", "RELATIVE", "INTERNAL", "SEQUENTIAL", "OUTPUT", "UPDATE",
    "APPEND", "FIXED", "PERMANENT", "TAB", "VALIDATE",
]);

export class Lexer {
    private pos = 0;
    private line = 0;
    private lineStart = 0;

    constructor(private readonly text: string, private readonly opts: LexOptions) {}

    get offset(): number { return this.pos; }
    atEnd(): boolean { return this.pos >= this.text.length; }
    atLineStart(): boolean { return this.pos === this.lineStart; }

    private make(kind: TokenKind, start: number, error?: string): Token {
        const t: Token = {
            kind,
            text: this.text.slice(start, this.pos),
            start,
            end: this.pos,
            line: this.line,
            column: start - this.lineStart,
        };
        if (error) { t.error = error; }
        return t;
    }

    /** Consume spaces and tabs. Never crosses a line break. */
    skipSpace(): void {
        while (this.pos < this.text.length) {
            const c = this.text[this.pos];
            if (c === " " || c === "\t") { this.pos++; } else { break; }
        }
    }

    private newline(start: number): Token {
        if (this.text.startsWith("\r\n", this.pos)) { this.pos += 2; } else { this.pos += 1; }
        const t = this.make("eol", start);
        this.line++;
        this.lineStart = this.pos;
        return t;
    }

    /** Read the next token in the given mode. */
    next(mode: LexMode = "statement"): Token {
        if (mode !== "comment" && mode !== "image") { this.skipSpace(); }
        const start = this.pos;

        if (this.pos >= this.text.length) { return this.make("eol", start); }
        const c = this.text[this.pos];
        if (c === "\n" || c === "\r") { return this.newline(start); }

        switch (mode) {
            case "comment": return this.readToEol(start, "comment-text");
            case "image": return this.readToEol(start, "image-text");
            case "data": return this.readDataItem(start);
            case "unquoted": return this.readUnquoted(start);
        }
        return this.readStatement(start, c);
    }

    private readToEol(start: number, kind: TokenKind): Token {
        while (this.pos < this.text.length &&
               this.text[this.pos] !== "\n" && this.text[this.pos] !== "\r") {
            this.pos++;
        }
        return this.make(kind, start);
    }

    /**
     * One DATA operand. Commas separate; a quoted item may contain a comma; an
     * unquoted item runs to the next comma or end of line, trailing spaces
     * included, because that is what the interpreter stores.
     */
    private readDataItem(start: number): Token {
        if (this.text[this.pos] === ",") { this.pos++; return this.make("separator", start); }
        if (this.text[this.pos] === "\"") { return this.readString(start); }
        while (this.pos < this.text.length) {
            const c = this.text[this.pos];
            if (c === "," || c === "\n" || c === "\r") { break; }
            this.pos++;
        }
        return this.make("data-item", start);
    }

    /** A bare name, as after CALL. */
    private readUnquoted(start: number): Token {
        if (this.text[this.pos] === "\"") { return this.readString(start); }
        while (this.pos < this.text.length && /[A-Za-z0-9_@$]/.test(this.text[this.pos])) {
            this.pos++;
        }
        if (this.pos === start) { this.pos++; return this.make("unknown", start); }
        return this.make("unquoted-string", start);
    }

    private readString(start: number): Token {
        this.pos++;
        while (this.pos < this.text.length) {
            const c = this.text[this.pos];
            if (c === "\n" || c === "\r") {
                return this.make("string", start, "Unterminated string");
            }
            if (c === "\"") {
                // A doubled quote is an escaped quote and continues the string.
                if (this.text[this.pos + 1] === "\"") { this.pos += 2; continue; }
                this.pos++;
                return this.make("string", start);
            }
            this.pos++;
        }
        return this.make("string", start, "Unterminated string");
    }

    private readStatement(start: number, c: string): Token {
        // :: is a single token, and only Extended BASIC has it.
        if (c === ":" && this.text[this.pos + 1] === ":" && this.opts.allowStatementSeparator) {
            this.pos += 2;
            return this.make("statement-sep", start);
        }
        // ! introduces a comment in Extended BASIC. The parser switches mode.
        if (c === "!" && this.opts.allowStatementSeparator) {
            this.pos++;
            return this.make("keyword", start);
        }
        if (c === "\"") { return this.readString(start); }

        const next = this.text[this.pos + 1] ?? "";
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(next))) {
            return this.readNumber(start);
        }
        if (this.opts.labels && c === "@") {
            this.pos++;
            while (this.pos < this.text.length && /[A-Za-z0-9_]/.test(this.text[this.pos])) {
                this.pos++;
            }
            return this.make("label-ref", start);
        }
        if (/[A-Za-z]/.test(c)) { return this.readWord(start); }

        for (const op of OPERATORS) {
            if (this.text.startsWith(op, this.pos)) {
                this.pos += op.length;
                return this.make("operator", start);
            }
        }
        if (SEPARATORS.includes(c)) { this.pos++; return this.make("separator", start); }

        this.pos++;
        return this.make("unknown", start, "Unexpected character");
    }

    /**
     * Numbers may be written 1, 1.5, .5, 1E9 or 1.5E-3. The exponent sign is
     * part of the number only when a digit follows it, so 1E-3 is one token
     * while A-3 is three.
     */
    private readNumber(start: number): Token {
        while (this.pos < this.text.length && /[0-9]/.test(this.text[this.pos])) { this.pos++; }
        if (this.text[this.pos] === ".") {
            this.pos++;
            while (this.pos < this.text.length && /[0-9]/.test(this.text[this.pos])) { this.pos++; }
        }
        if (this.text[this.pos] === "E" || this.text[this.pos] === "e") {
            const save = this.pos;
            this.pos++;
            if (this.text[this.pos] === "+" || this.text[this.pos] === "-") { this.pos++; }
            if (/[0-9]/.test(this.text[this.pos] ?? "")) {
                while (this.pos < this.text.length && /[0-9]/.test(this.text[this.pos])) {
                    this.pos++;
                }
            } else {
                this.pos = save;  // not an exponent after all
            }
        }
        return this.make("number", start);
    }

    /**
     * A word is a keyword or a variable. String variables and string functions
     * end in $, which is part of the name. In label mode, a word at the very
     * start of a line followed by a single colon is a label definition.
     */
    private readWord(start: number): Token {
        while (this.pos < this.text.length && /[A-Za-z0-9_]/.test(this.text[this.pos])) {
            this.pos++;
        }
        if (this.text[this.pos] === "$") { this.pos++; }

        if (this.opts.labels && start === this.lineStart &&
            this.text[this.pos] === ":" && this.text[this.pos + 1] !== ":") {
            this.pos++;
            return this.make("label", start);
        }

        const word = this.text.slice(start, this.pos).toUpperCase();
        return this.make(RESERVED.has(word) ? "keyword" : "identifier", start);
    }
}

/** Lex a whole document in statement mode. Useful for tests and highlighting. */
export function lexAll(text: string, opts: LexOptions): Token[] {
    const lexer = new Lexer(text, opts);
    const out: Token[] = [];
    let guard = 0;
    while (!lexer.atEnd() && guard++ < 1000000) {
        out.push(lexer.next("statement"));
    }
    return out;
}
