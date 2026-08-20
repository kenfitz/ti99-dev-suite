/**
 * The parser for TI BASIC and TI Extended BASIC.
 *
 * One recursive-descent parser serves both dialects, parameterised by dialect
 * rather than duplicated. A construct only Extended BASIC accepts still parses
 * in TI BASIC and is reported by the validator, because "ACCEPT requires
 * Extended BASIC" helps a user and "syntax error" does not.
 *
 * The parser drives the lexer rather than consuming a finished token list. It
 * has to: after DATA, REM, IMAGE and CALL the text is not code, and only the
 * parser knows which of those it is in. That is the same reason the lexer is
 * mode-driven, and it is why neither half can be a set of regular expressions.
 *
 * Error handling recovers to the next statement separator or line, so one bad
 * line does not destroy the diagnostics for the rest of the program.
 */

import { LexMode, Lexer, Token } from './lexer';
import { Dialect, findOperator } from './metadata';
import {
    ArrayReference, Comment, DataItem, DisplayClause, ErrorExpression, Expression,
    FileNumber, LineReference, OpenOption, PrintItem, Program,
    ProgramLine, Range, Statement, Variable,
} from './ast';

export interface ParseDiagnostic {
    message: string;
    start: number;
    end: number;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    /** Stable identity so a test or a fix can name the rule. */
    code: string;
}

export interface ParseResult {
    program: Program;
    diagnostics: ParseDiagnostic[];
}

export interface ParseOptions {
    dialect: Dialect;
    /** xbas99 label mode: NAME: definitions and @NAME references. */
    labels?: boolean;
}

/** Statements after which the rest of the line is not code. */
const COMMENT_WORDS = new Set(['REM']);

export class Parser {
    private readonly lexer: Lexer;
    private readonly xb: boolean;
    private pushed: Token[] = [];
    private diagnostics: ParseDiagnostic[] = [];
    /** Guards against a rule that fails to consume, which would spin forever. */
    private guard = 0;

    constructor(private readonly text: string, private readonly opts: ParseOptions) {
        this.xb = opts.dialect === 'ti-extended-basic';
        this.lexer = new Lexer(text, {
            // The statement separator and ! comments are lexed for both
            // dialects so TI BASIC can report them as Extended BASIC features
            // rather than as unexpected characters.
            allowStatementSeparator: true,
            labels: opts.labels === true,
        });
    }

    // --- token plumbing ----------------------------------------------------

    private next(mode: LexMode = 'statement'): Token {
        const pushed = this.pushed.pop();
        if (pushed) { return pushed; }
        return this.lexer.next(mode);
    }

    private peek(mode: LexMode = 'statement'): Token {
        const t = this.next(mode);
        this.pushed.push(t);
        return t;
    }

    private push(t: Token): void { this.pushed.push(t); }

    private atEnd(): boolean {
        return this.pushed.length === 0 && this.lexer.atEnd();
    }

    private error(code: string, message: string, at: Range | Token,
                  severity: 'error' | 'warning' = 'error'): void {
        this.diagnostics.push({
            code, message, severity,
            start: at.start, end: Math.max(at.end, at.start + 1),
            line: at.line, column: at.column,
        });
    }

    private rangeOf(t: Token): Range {
        return { start: t.start, end: t.end, line: t.line, column: t.column };
    }

    private span(from: Range, to: Range): Range {
        return { start: from.start, end: to.end, line: from.line, column: from.column };
    }

    /** Is this token the given word, whatever its case? */
    private isWord(t: Token, word: string): boolean {
        return (t.kind === 'keyword' || t.kind === 'identifier') &&
            t.text.toUpperCase() === word;
    }

    private isAnyWord(t: Token, words: string[]): boolean {
        const up = t.text.toUpperCase();
        return (t.kind === 'keyword' || t.kind === 'identifier') && words.includes(up);
    }

    /** Consume the token if it matches, otherwise leave it. */
    private accept(word: string): Token | undefined {
        const t = this.peek();
        if (this.isWord(t, word)) { return this.next(); }
        return undefined;
    }

    private acceptSymbol(symbol: string): Token | undefined {
        const t = this.peek();
        if ((t.kind === 'separator' || t.kind === 'operator') && t.text === symbol) {
            return this.next();
        }
        return undefined;
    }

    private atStatementEnd(): boolean {
        const t = this.peek();
        return t.kind === 'eol' || t.kind === 'statement-sep' ||
            (t.kind === 'separator' && t.text === ':');
    }

    // --- entry point -------------------------------------------------------

    parse(): ParseResult {
        const lines: ProgramLine[] = [];
        const start = 0;
        while (!this.atEnd() && this.guard++ < 200000) {
            const line = this.parseLine();
            if (line) { lines.push(line); }
        }
        const end = this.text.length;
        const program: Program = {
            kind: 'Program', lines, start, end, line: 0, column: 0,
        };
        return { program, diagnostics: this.diagnostics };
    }

    private parseLine(): ProgramLine | undefined {
        let t = this.next();
        while (t.kind === 'eol' && !this.atEnd()) { t = this.next(); }
        if (t.kind === 'eol') { return undefined; }

        const startRange = this.rangeOf(t);
        let lineNumber: number | undefined;
        let lineNumberRange: Range | undefined;
        let label: string | undefined;
        let labelRange: Range | undefined;

        if (t.kind === 'number' && t.column === 0) {
            lineNumber = parseInt(t.text, 10);
            lineNumberRange = this.rangeOf(t);
            t = this.next();
        } else if (t.kind === 'label') {
            label = t.text.replace(/:$/, '');
            labelRange = this.rangeOf(t);
            t = this.next();
        }

        this.push(t);
        const statements = this.parseStatements();

        const last = statements.length ? statements[statements.length - 1] : undefined;
        const endRange = last ?? (lineNumberRange ?? startRange);
        return {
            kind: 'ProgramLine',
            lineNumber, lineNumberRange, label, labelRange, statements,
            start: startRange.start, end: endRange.end,
            line: startRange.line, column: startRange.column,
        };
    }

    /** Statements up to end of line, separated by :: or : . */
    private parseStatements(): Statement[] {
        const out: Statement[] = [];
        let spin = 0;
        for (;;) {
            if (spin++ > 5000) { break; }
            const t = this.peek();
            if (t.kind === 'eol') { this.next(); break; }

            const before = t.start;
            const statement = this.parseStatement();
            if (statement) { out.push(statement); }

            const sep = this.peek();
            if (sep.kind === 'eol') { this.next(); break; }
            if (sep.kind === 'statement-sep') {
                this.next();
                if (!this.xb) {
                    this.error('xb-statement-separator',
                        'The :: statement separator requires Extended BASIC.',
                        this.rangeOf(sep));
                }
                continue;
            }
            if (sep.kind === 'separator' && sep.text === ':') { this.next(); continue; }

            // Nothing consumed and nothing recognised: skip a token so the
            // loop cannot spin, and report once.
            if (this.peek().start === before) {
                const bad = this.next();
                if (bad.kind !== 'eol') {
                    this.error('unexpected-token',
                        'Unexpected ' + JSON.stringify(bad.text) + '.', this.rangeOf(bad));
                }
                if (bad.kind === 'eol') { break; }
            }
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Statements
    // -----------------------------------------------------------------------

    private parseStatement(): Statement | undefined {
        const t = this.peek();
        if (t.kind === 'eol') { return undefined; }

        // ! introduces a comment in Extended BASIC. The lexer reports it as a
        // keyword; whether the dialect allows it is decided here.
        if (t.kind === 'keyword' && t.text === '!') {
            return this.parseComment(this.next(), '!');
        }

        if (t.kind === 'keyword' || t.kind === 'identifier') {
            const word = t.text.toUpperCase();
            if (COMMENT_WORDS.has(word)) { return this.parseComment(this.next(), 'REM'); }

            switch (word) {
                case 'DATA': return this.parseData();
                case 'IMAGE': return this.parseImage();
                case 'PRINT': case 'DISPLAY': return this.parsePrint();
                case 'INPUT': case 'LINPUT': case 'ACCEPT': return this.parseInput();
                case 'IF': return this.parseIf();
                case 'FOR': return this.parseFor();
                case 'NEXT': return this.parseNext();
                case 'GOTO': return this.parseGoto('GOTO');
                case 'GOSUB': return this.parseGoto('GOSUB');
                case 'GO': return this.parseGoWord();
                case 'ON': return this.parseOn();
                case 'RETURN': return this.parseReturn();
                case 'READ': return this.parseRead();
                case 'RESTORE': return this.parseRestore();
                case 'DIM': return this.parseDim();
                case 'DEF': return this.parseDef();
                case 'OPTION': return this.parseOption();
                case 'OPEN': return this.parseOpen();
                case 'CLOSE': return this.parseClose();
                case 'CALL': return this.parseCall();
                case 'SUB': return this.parseSub();
                case 'SUBEND': return this.parseKeywordOnly('SUBEND');
                case 'SUBEXIT': return this.parseKeywordOnly('SUBEXIT');
                case 'RUN': return this.parseRun();
                case 'LET': return this.parseAssignment(true);
                case 'END': case 'STOP': case 'TRACE': case 'UNTRACE':
                    return this.parseSimple(word);
                case 'BREAK': case 'UNBREAK':
                    return this.parseSimple(word, true);
                case 'RANDOMIZE':
                    return this.parseSimple(word, false, true);
                default:
                    break;
            }
        }

        // Anything else starting with a name is an assignment.
        if (t.kind === 'identifier') { return this.parseAssignment(false); }

        const bad = this.next();
        return {
            kind: 'UnknownStatement', text: bad.text,
            word: bad.kind === 'keyword' ? bad.text.toUpperCase() : undefined,
            ...this.rangeOf(bad),
        };
    }

    private parseComment(marker: Token, which: string): Comment {
        const body = this.next('comment');
        return {
            kind: 'Comment', marker: which, text: body.text,
            ...this.span(this.rangeOf(marker), this.rangeOf(body)),
        };
    }

    private parseImage(): Statement {
        const kw = this.next();
        const body = this.next('image');
        const formatRange = this.rangeOf(body);
        return {
            kind: 'ImageStatement', format: body.text, formatRange,
            ...this.span(this.rangeOf(kw), formatRange),
        };
    }

    private parseData(): Statement {
        const kw = this.next();
        const values: DataItem[] = [];
        let last: Range = this.rangeOf(kw);
        for (;;) {
            const t = this.next('data');
            if (t.kind === 'eol') { this.push(t); break; }
            if (t.kind === 'separator' && t.text === ',') { last = this.rangeOf(t); continue; }
            const quoted = t.kind === 'string';
            values.push({
                text: quoted ? t.text.slice(1, -1).replace(/""/g, '"') : t.text,
                quoted, ...this.rangeOf(t),
            });
            last = this.rangeOf(t);
        }
        return { kind: 'DataStatement', values, ...this.span(this.rangeOf(kw), last) };
    }

    private parsePrint(): Statement {
        const kw = this.next();
        const keyword = kw.text.toUpperCase();
        let file: FileNumber | undefined;
        let using: Expression | undefined;
        const clauses: DisplayClause[] = [];
        const items: PrintItem[] = [];
        let last: Range = this.rangeOf(kw);

        if (this.peek().kind === 'separator' && this.peek().text === '#') {
            file = this.parseFileNumber();
            last = file;
            this.acceptSymbol(',');
        }

        // Extended BASIC DISPLAY clauses, before the colon that starts the list.
        for (;;) {
            const t = this.peek();
            if (!this.isAnyWord(t, ['AT', 'BEEP', 'ERASE', 'SIZE', 'USING'])) { break; }
            const name = this.next();
            const clause = this.parseDisplayClause(name);
            if (name.text.toUpperCase() === 'USING') {
                using = clause.args[0];
            } else {
                clauses.push(clause);
            }
            last = clause;
            if (!this.xb) {
                this.error('xb-display-clause',
                    'The ' + name.text.toUpperCase() + ' clause requires Extended BASIC.',
                    clause);
            }
            this.acceptSymbol(',');
        }
        if (clauses.length || using) { this.acceptSymbol(':'); }

        for (;;) {
            const t = this.peek();
            if (t.kind === 'eol' || t.kind === 'statement-sep') { break; }
            // A colon inside a print list is a separator meaning "new line",
            // not the end of the statement. TI BASIC has no multi-statement
            // lines at all, and Extended BASIC separates statements with ::,
            // so a bare colon here is never a statement boundary.
            if (t.kind === 'separator' && (t.text === ';' || t.text === ',' || t.text === ':')) {
                const sep = this.next();
                items.push({ separator: sep.text, ...this.rangeOf(sep) });
                last = this.rangeOf(sep);
                continue;
            }
            const expr = this.parseExpression();
            items.push({ expression: expr, ...expr });
            last = expr;
        }
        return {
            kind: 'PrintStatement', keyword, file, using, clauses, items,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseDisplayClause(name: Token): DisplayClause {
        const args: Expression[] = [];
        let last: Range = this.rangeOf(name);
        if (this.peek().kind === 'separator' && this.peek().text === '(') {
            this.next();
            for (;;) {
                if (this.acceptSymbol(')')) { break; }
                const e = this.parseExpression();
                args.push(e);
                last = e;
                if (!this.acceptSymbol(',')) {
                    const close = this.acceptSymbol(')');
                    if (close) { last = this.rangeOf(close); }
                    break;
                }
            }
        } else if (name.text.toUpperCase() === 'USING') {
            const e = this.parseExpression();
            args.push(e);
            last = e;
        } else if (this.isWord(this.peek(), 'ALL')) {
            last = this.rangeOf(this.next());
        }
        return { name: name.text.toUpperCase(), args, ...this.span(this.rangeOf(name), last) };
    }

    private parseInput(): Statement {
        const kw = this.next();
        const keyword = kw.text.toUpperCase();
        let file: FileNumber | undefined;
        let prompt: Expression | undefined;
        const clauses: DisplayClause[] = [];
        const targets: Expression[] = [];
        let last: Range = this.rangeOf(kw);

        if (this.peek().kind === 'separator' && this.peek().text === '#') {
            file = this.parseFileNumber();
            last = file;
            this.acceptSymbol(',');
        }

        for (;;) {
            const t = this.peek();
            if (!this.isAnyWord(t, ['AT', 'BEEP', 'ERASE', 'SIZE', 'VALIDATE'])) { break; }
            const name = this.next();
            const clause = this.parseDisplayClause(name);
            clauses.push(clause);
            last = clause;
            if (!this.xb) {
                this.error('xb-accept-clause',
                    'The ' + name.text.toUpperCase() + ' clause requires Extended BASIC.',
                    clause);
            }
            this.acceptSymbol(',');
        }
        if (clauses.length) { this.acceptSymbol(':'); }

        // A quoted prompt is followed by a colon; without one it is a target.
        if (this.peek().kind === 'string') {
            const s = this.next();
            if (this.peek().kind === 'separator' && this.peek().text === ':') {
                this.next();
                prompt = this.stringLiteral(s);
                last = prompt;
            } else {
                this.push(s);
            }
        }

        for (;;) {
            const t = this.peek();
            if (t.kind === 'eol' || t.kind === 'statement-sep') { break; }
            if (t.kind === 'separator' && t.text === ':') { break; }
            const e = this.parseExpression();
            targets.push(e);
            last = e;
            if (!this.acceptSymbol(',')) { break; }
        }
        return {
            kind: 'InputStatement', keyword, file, prompt, clauses, targets,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseIf(): Statement {
        const kw = this.next();
        const condition = this.parseExpression();
        let thenLine: LineReference | undefined;
        let elseLine: LineReference | undefined;
        const thenStatements: Statement[] = [];
        const elseStatements: Statement[] = [];
        let last: Range = condition;

        if (this.accept('THEN')) {
            const branch = this.parseBranchTarget();
            if (branch.line) { thenLine = branch.line; } else { thenStatements.push(...branch.statements); }
            last = branch.range;
        } else {
            this.error('if-missing-then', 'IF needs THEN.', last);
        }

        if (this.isWord(this.peek(), 'ELSE')) {
            this.next();
            const branch = this.parseBranchTarget();
            if (branch.line) { elseLine = branch.line; } else { elseStatements.push(...branch.statements); }
            last = branch.range;
        }
        return {
            kind: 'IfStatement', condition, thenLine, thenStatements, elseLine, elseStatements,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    /**
     * What follows THEN or ELSE.
     *
     * A bare number is a line reference in both dialects. Anything else is a
     * statement, which only Extended BASIC allows, so TI BASIC gets a dialect
     * diagnostic rather than a parse failure.
     */
    private parseBranchTarget(): { line?: LineReference; statements: Statement[]; range: Range } {
        const t = this.peek();
        if (t.kind === 'number') {
            const n = this.next();
            const ref = this.lineReference(n);
            return { line: ref, statements: [], range: ref };
        }
        const statement = this.parseStatement();
        const range: Range = statement ?? this.rangeOf(t);
        if (statement && !this.xb) {
            this.error('xb-if-statement',
                'Only a line number may follow THEN or ELSE in TI BASIC. ' +
                'Statements there require Extended BASIC.', range);
        }
        return { statements: statement ? [statement] : [], range };
    }

    private parseFor(): Statement {
        const kw = this.next();
        const variable = this.parseVariableTarget();
        let last: Range = variable;
        if (!this.acceptSymbol('=')) { this.error('for-missing-equals', 'FOR needs an initial value.', last); }
        const from = this.parseExpression();
        last = from;
        let to: Expression = from;
        if (this.accept('TO')) { to = this.parseExpression(); last = to; }
        else { this.error('for-missing-to', 'FOR needs TO.', last); }
        let step: Expression | undefined;
        if (this.accept('STEP')) { step = this.parseExpression(); last = step; }
        return {
            kind: 'ForStatement', variable, from, to, step,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseNext(): Statement {
        const kw = this.next();
        let variable: Variable | ArrayReference | ErrorExpression | undefined;
        let last: Range = this.rangeOf(kw);
        if (!this.atStatementEnd()) {
            variable = this.parseVariableTarget();
            last = variable;
        }
        return { kind: 'NextStatement', variable, ...this.span(this.rangeOf(kw), last) };
    }

    private parseGoWord(): Statement {
        const go = this.next();
        const t = this.peek();
        if (this.isWord(t, 'TO')) { this.next(); return this.finishGoto('GOTO', go); }
        if (this.isWord(t, 'SUB')) { this.next(); return this.finishGoto('GOSUB', go); }
        this.error('go-alone', 'GO must be followed by TO or SUB.', this.rangeOf(go));
        return this.finishGoto('GOTO', go);
    }

    private parseGoto(keyword: string): Statement {
        const kw = this.next();
        return this.finishGoto(keyword, kw);
    }

    private finishGoto(keyword: string, kw: Token): Statement {
        let target: LineReference | undefined;
        let last: Range = this.rangeOf(kw);
        const t = this.peek();
        if (t.kind === 'number') { target = this.lineReference(this.next()); last = target; }
        else if (t.kind === 'label-ref') { const l = this.next(); last = this.rangeOf(l); }
        else { this.error('goto-missing-target', keyword + ' needs a line number.', last); }
        return { kind: 'GotoStatement', keyword, target, ...this.span(this.rangeOf(kw), last) };
    }

    private parseOn(): Statement {
        const kw = this.next();
        const t = this.peek();

        if (this.isAnyWord(t, ['ERROR', 'WARNING', 'BREAK'])) {
            const what = this.next();
            let target: LineReference | undefined;
            let action: string | undefined;
            let last: Range = this.rangeOf(what);
            const nxt = this.peek();
            if (nxt.kind === 'number') { target = this.lineReference(this.next()); last = target; }
            else if (this.isAnyWord(nxt, ['STOP', 'NEXT', 'PRINT'])) {
                const a = this.next(); action = a.text.toUpperCase(); last = this.rangeOf(a);
            }
            if (!this.xb) {
                this.error('xb-on-handler',
                    'ON ' + what.text.toUpperCase() + ' requires Extended BASIC.',
                    this.span(this.rangeOf(kw), last));
            }
            return {
                kind: 'OnErrorStatement', what: what.text.toUpperCase(), target, action,
                ...this.span(this.rangeOf(kw), last),
            };
        }

        const selector = this.parseExpression();
        let keyword = 'GOTO';
        let last: Range = selector;
        if (this.accept('GOTO')) { keyword = 'GOTO'; }
        else if (this.accept('GOSUB')) { keyword = 'GOSUB'; }
        else if (this.accept('GO')) {
            if (this.accept('SUB')) { keyword = 'GOSUB'; } else { this.accept('TO'); }
        } else {
            this.error('on-missing-branch', 'ON needs GOTO or GOSUB.', last);
        }
        const targets: LineReference[] = [];
        for (;;) {
            const n = this.peek();
            if (n.kind !== 'number') { break; }
            const ref = this.lineReference(this.next());
            targets.push(ref);
            last = ref;
            if (!this.acceptSymbol(',')) { break; }
        }
        if (targets.length === 0) { this.error('on-missing-targets', 'ON needs at least one line number.', last); }
        return {
            kind: 'OnGotoStatement', selector, keyword, targets,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseReturn(): Statement {
        const kw = this.next();
        let target: LineReference | undefined;
        let last: Range = this.rangeOf(kw);
        if (this.peek().kind === 'number') { target = this.lineReference(this.next()); last = target; }
        return { kind: 'ReturnStatement', target, ...this.span(this.rangeOf(kw), last) };
    }

    private parseRead(): Statement {
        const kw = this.next();
        const targets: Expression[] = [];
        let last: Range = this.rangeOf(kw);
        for (;;) {
            if (this.atStatementEnd()) { break; }
            const e = this.parseExpression();
            targets.push(e);
            last = e;
            if (!this.acceptSymbol(',')) { break; }
        }
        return { kind: 'ReadStatement', targets, ...this.span(this.rangeOf(kw), last) };
    }

    private parseRestore(): Statement {
        const kw = this.next();
        let target: LineReference | undefined;
        let file: FileNumber | undefined;
        let record: Expression | undefined;
        let last: Range = this.rangeOf(kw);

        if (this.peek().kind === 'separator' && this.peek().text === '#') {
            file = this.parseFileNumber();
            last = file;
            if (this.acceptSymbol(',')) {
                if (this.accept('REC')) { record = this.parseExpression(); last = record; }
            }
        } else if (this.peek().kind === 'number') {
            target = this.lineReference(this.next());
            last = target;
        }
        return { kind: 'RestoreStatement', target, file, record, ...this.span(this.rangeOf(kw), last) };
    }

    private parseDim(): Statement {
        const kw = this.next();
        const declarations: ArrayReference[] = [];
        let last: Range = this.rangeOf(kw);
        for (;;) {
            const name = this.peek();
            if (name.kind !== 'identifier') {
                this.error('dim-needs-array', 'DIM needs an array name.', this.rangeOf(name));
                break;
            }
            const parsed = this.parsePrimary();
            const array = this.asArrayReference(parsed);
            if (array && array.subscripts.length) { declarations.push(array); }
            else { this.error('dim-needs-subscripts', 'DIM needs the array size in parentheses.', parsed); }
            last = parsed;
            if (!this.acceptSymbol(',')) { break; }
        }
        return { kind: 'DimStatement', declarations, ...this.span(this.rangeOf(kw), last) };
    }

    private parseDef(): Statement {
        const kw = this.next();
        const nameTok = this.next();
        const name = nameTok.text.toUpperCase();
        const isString = name.endsWith('$');
        let parameter: Variable | undefined;
        let last: Range = this.rangeOf(nameTok);

        if (this.acceptSymbol('(')) {
            const p = this.next();
            parameter = {
                kind: 'Variable', name: p.text.toUpperCase(),
                isString: p.text.endsWith('$'), ...this.rangeOf(p),
            };
            const close = this.acceptSymbol(')');
            last = close ? this.rangeOf(close) : parameter;
        }
        if (!this.acceptSymbol('=')) { this.error('def-missing-equals', 'DEF needs = and an expression.', last); }
        const body = this.parseExpression();
        return {
            kind: 'DefStatement', name, isString, parameter, body,
            ...this.span(this.rangeOf(kw), body),
        };
    }

    private parseOption(): Statement {
        const kw = this.next();
        let last: Range = this.rangeOf(kw);
        if (!this.accept('BASE')) { this.error('option-needs-base', 'OPTION must be followed by BASE.', last); }
        let base = 0;
        const n = this.peek();
        if (n.kind === 'number') {
            const tok = this.next();
            base = parseInt(tok.text, 10);
            last = this.rangeOf(tok);
            if (base !== 0 && base !== 1) {
                this.error('option-base-range', 'OPTION BASE takes 0 or 1.', last);
            }
        } else {
            this.error('option-needs-value', 'OPTION BASE needs 0 or 1.', last);
        }
        return { kind: 'OptionStatement', base, ...this.span(this.rangeOf(kw), last) };
    }

    private parseOpen(): Statement {
        const kw = this.next();
        let file: FileNumber | undefined;
        let device: Expression | undefined;
        const options: OpenOption[] = [];
        let last: Range = this.rangeOf(kw);

        if (this.peek().kind === 'separator' && this.peek().text === '#') {
            file = this.parseFileNumber();
            last = file;
        }
        this.acceptSymbol(':');
        if (!this.atStatementEnd()) { device = this.parseExpression(); last = device; }

        while (this.acceptSymbol(',')) {
            const t = this.peek();
            if (t.kind === 'number') {
                const n = this.next();
                options.push({ name: 'RECORD-LENGTH', value: this.numericLiteral(n), ...this.rangeOf(n) });
                last = this.rangeOf(n);
                continue;
            }
            if (t.kind !== 'identifier' && t.kind !== 'keyword') { break; }
            const name = this.next();
            let value: Expression | undefined;
            let end: Range = this.rangeOf(name);
            if (this.peek().kind === 'number') { const v = this.next(); value = this.numericLiteral(v); end = value; }
            options.push({ name: name.text.toUpperCase(), value, ...this.span(this.rangeOf(name), end) });
            last = end;
        }
        return { kind: 'OpenStatement', file, device, options, ...this.span(this.rangeOf(kw), last) };
    }

    private parseClose(): Statement {
        const kw = this.next();
        let file: FileNumber | undefined;
        let last: Range = this.rangeOf(kw);
        if (this.peek().kind === 'separator' && this.peek().text === '#') {
            file = this.parseFileNumber();
            last = file;
        }
        let deleteFile = false;
        if (this.acceptSymbol(':')) {
            if (this.accept('DELETE')) { deleteFile = true; }
        }
        return { kind: 'CloseStatement', file, deleteFile, ...this.span(this.rangeOf(kw), last) };
    }

    /**
     * CALL, whose subprogram name is read in unquoted mode.
     *
     * The name is not an expression and must not be lexed as one: it is the
     * one payload after CALL that carries meaning, which is the same reason
     * the tokenised-program scanner reads it rather than skipping it.
     */
    private parseCall(): Statement {
        const kw = this.next();
        const nameTok = this.next('unquoted');
        const nameRange = this.rangeOf(nameTok);
        const name = nameTok.text.toUpperCase();
        const args: Expression[] = [];
        let last: Range = nameRange;

        if (this.acceptSymbol('(')) {
            for (;;) {
                const close = this.acceptSymbol(')');
                if (close) { last = this.rangeOf(close); break; }
                if (this.atStatementEnd()) {
                    this.error('call-unclosed', 'CALL ' + name + ' is missing a closing parenthesis.', last);
                    break;
                }
                const e = this.parseExpression();
                args.push(e);
                last = e;
                if (!this.acceptSymbol(',')) {
                    const c = this.acceptSymbol(')');
                    if (c) { last = this.rangeOf(c); }
                    else { this.error('call-unclosed', 'CALL ' + name + ' is missing a closing parenthesis.', last); }
                    break;
                }
            }
        }
        return {
            kind: 'CallStatement', name, nameRange, args,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseSub(): Statement {
        const kw = this.next();
        const nameTok = this.next('unquoted');
        const nameRange = this.rangeOf(nameTok);
        const parameters: Expression[] = [];
        let last: Range = nameRange;

        if (this.acceptSymbol('(')) {
            for (;;) {
                const close = this.acceptSymbol(')');
                if (close) { last = this.rangeOf(close); break; }
                if (this.atStatementEnd()) { break; }
                const e = this.parseExpression();
                parameters.push(e);
                last = e;
                if (!this.acceptSymbol(',')) {
                    const c = this.acceptSymbol(')');
                    if (c) { last = this.rangeOf(c); }
                    break;
                }
            }
        }
        if (!this.xb) {
            this.error('xb-sub', 'SUB requires Extended BASIC.', this.span(this.rangeOf(kw), last));
        }
        return {
            kind: 'SubStatement', name: nameTok.text.toUpperCase(), nameRange, parameters,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseKeywordOnly(word: string): Statement {
        const kw = this.next();
        if (!this.xb) {
            this.error('xb-keyword', word + ' requires Extended BASIC.', this.rangeOf(kw));
        }
        return word === 'SUBEND'
            ? { kind: 'SubEndStatement', ...this.rangeOf(kw) }
            : { kind: 'SubExitStatement', ...this.rangeOf(kw) };
    }

    private parseRun(): Statement {
        const kw = this.next();
        let target: LineReference | undefined;
        let program: Expression | undefined;
        let last: Range = this.rangeOf(kw);
        const t = this.peek();
        if (t.kind === 'number') { target = this.lineReference(this.next()); last = target; }
        else if (t.kind === 'string') { program = this.stringLiteral(this.next()); last = program; }
        if (!this.xb) {
            this.error('xb-run', 'RUN as a statement requires Extended BASIC.',
                this.span(this.rangeOf(kw), last));
        }
        return { kind: 'RunStatement', target, program, ...this.span(this.rangeOf(kw), last) };
    }

    private parseSimple(keyword: string, takesLines = false, takesArgument = false): Statement {
        const kw = this.next();
        const lines: LineReference[] = [];
        let argument: Expression | undefined;
        let last: Range = this.rangeOf(kw);

        if (takesLines) {
            while (this.peek().kind === 'number') {
                const ref = this.lineReference(this.next());
                lines.push(ref);
                last = ref;
                if (!this.acceptSymbol(',')) { break; }
            }
        } else if (takesArgument && !this.atStatementEnd()) {
            argument = this.parseExpression();
            last = argument;
        }
        return {
            kind: 'SimpleStatement', keyword, lines, argument,
            ...this.span(this.rangeOf(kw), last),
        };
    }

    private parseAssignment(hasLet: boolean): Statement {
        const startTok = this.peek();
        if (hasLet) { this.next(); }
        const target = this.parseVariableTarget();
        let last: Range = target;
        if (!this.acceptSymbol('=')) {
            this.error('assignment-missing-equals',
                'Expected = in an assignment.', last);
            return {
                kind: 'Assignment', hasLet, target, value: this.errorExpression(last),
                ...this.span(this.rangeOf(startTok), last),
            };
        }
        const value = this.parseExpression();
        last = value;
        return {
            kind: 'Assignment', hasLet, target, value,
            ...this.span(this.rangeOf(startTok), last),
        };
    }

    /** A variable or array element being assigned to or iterated over. */
    private parseVariableTarget(): Variable | ArrayReference | ErrorExpression {
        const t = this.peek();
        if (t.kind !== 'identifier') {
            const bad = this.next();
            this.error('expected-variable',
                'Expected a variable name, found ' + JSON.stringify(bad.text) + '.',
                this.rangeOf(bad));
            return this.errorExpression(this.rangeOf(bad), bad.text);
        }
        const parsed = this.parsePrimary();
        if (parsed.kind === 'Variable') { return parsed; }
        const array = this.asArrayReference(parsed);
        if (array) { return array; }
        this.error('expected-variable', 'Expected a variable name.', parsed);
        return this.errorExpression(parsed);
    }

    // -----------------------------------------------------------------------
    // Expressions
    // -----------------------------------------------------------------------

    /**
     * Precedence climbing, using the table in the metadata rather than a
     * private copy, so the parser and any documentation of precedence cannot
     * disagree.
     *
     * Exponentiation is right-associative; everything else is left.
     */
    private parseExpression(minPrecedence = 0): Expression {
        let left = this.parseUnary();

        for (;;) {
            const t = this.peek();
            if (t.kind !== 'operator' && !(t.kind === 'keyword' &&
                ['AND', 'OR', 'XOR'].includes(t.text.toUpperCase()))) {
                break;
            }
            const symbol = t.text.toUpperCase();
            const info = findOperator(symbol);
            if (!info || info.kind !== 'binary' || info.precedence < minPrecedence) { break; }

            this.next();
            if (!info.dialects.includes(this.opts.dialect)) {
                this.error('xb-operator',
                    'The ' + symbol + ' operator requires Extended BASIC.', this.rangeOf(t));
            }
            // ^ is right-associative, so recurse at the same precedence.
            const nextMin = symbol === '^' ? info.precedence : info.precedence + 1;
            const right = this.parseExpression(nextMin);
            left = {
                kind: 'BinaryExpression', operator: symbol, left, right,
                start: left.start, end: right.end, line: left.line, column: left.column,
            };
        }
        return left;
    }

    private parseUnary(): Expression {
        const t = this.peek();
        if (t.kind === 'operator' && (t.text === '-' || t.text === '+')) {
            const op = this.next();
            const operand = this.parseExpression(8);  // binds tighter than *, looser than ^
            return {
                kind: 'UnaryExpression', operator: op.text, operand,
                ...this.span(this.rangeOf(op), operand),
            };
        }
        if (t.kind === 'keyword' && t.text.toUpperCase() === 'NOT') {
            const op = this.next();
            const operand = this.parseExpression(3);
            return {
                kind: 'UnaryExpression', operator: 'NOT', operand,
                ...this.span(this.rangeOf(op), operand),
            };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Expression {
        const t = this.next();

        if (t.kind === 'number') { return this.numericLiteral(t); }
        if (t.kind === 'string') {
            if (t.error) { this.error('unterminated-string', t.error, this.rangeOf(t)); }
            return this.stringLiteral(t);
        }
        if (t.kind === 'separator' && t.text === '(') {
            const inner = this.parseExpression();
            const close = this.acceptSymbol(')');
            if (!close) { this.error('unclosed-paren', 'Missing a closing parenthesis.', inner); }
            return {
                kind: 'ParenExpression', inner,
                ...this.span(this.rangeOf(t), close ? this.rangeOf(close) : inner),
            };
        }
        if (t.kind === 'separator' && t.text === '#') {
            this.push(t);
            return this.parseFileNumber();
        }
        if (t.kind === 'label-ref') {
            return { kind: 'ErrorExpression', text: t.text, ...this.rangeOf(t) };
        }

        if (t.kind === 'identifier' || t.kind === 'keyword') {
            const name = t.text.toUpperCase();
            const isString = name.endsWith('$');

            // RND and PI take no parentheses; everything else that is followed
            // by one is a call or an array reference.
            if (this.peek().kind === 'separator' && this.peek().text === '(') {
                this.next();
                const args: Expression[] = [];
                let last: Range = this.rangeOf(t);
                for (;;) {
                    const close = this.acceptSymbol(')');
                    if (close) { last = this.rangeOf(close); break; }
                    if (this.atStatementEnd()) {
                        this.error('unclosed-paren', 'Missing a closing parenthesis.', last);
                        break;
                    }
                    const e = this.parseExpression();
                    args.push(e);
                    last = e;
                    if (!this.acceptSymbol(',')) {
                        const c = this.acceptSymbol(')');
                        if (c) { last = this.rangeOf(c); }
                        else { this.error('unclosed-paren', 'Missing a closing parenthesis.', last); }
                        break;
                    }
                }
                // Whether this is a function or an array is the binder's
                // decision, since it needs the DIM table. The parser records
                // it as a call and the binder rewrites what it must.
                return {
                    kind: 'FunctionCall', name, args,
                    ...this.span(this.rangeOf(t), last),
                };
            }
            return {
                kind: 'Variable', name, isString, ...this.rangeOf(t),
            };
        }

        this.error('expected-expression',
            'Expected a value, found ' + JSON.stringify(t.text) + '.', this.rangeOf(t));
        return this.errorExpression(this.rangeOf(t), t.text);
    }

    private parseFileNumber(): FileNumber {
        const hash = this.next();
        const expression = this.parseExpression(4);
        return {
            kind: 'FileNumber', expression,
            ...this.span(this.rangeOf(hash), expression),
        };
    }

    // --- small builders ----------------------------------------------------


    /**
     * Reinterpret a parsed call as an array reference.
     *
     * NAME(...) is syntactically identical for a function call, a user DEF and
     * an array element; only the symbol table can tell them apart. Where the
     * grammar already forces an array, such as DIM or the target of an
     * assignment, the parser converts rather than guessing elsewhere.
     */
    private asArrayReference(e: Expression): ArrayReference | undefined {
        if (e.kind === 'ArrayReference') { return e; }
        if (e.kind !== 'FunctionCall') { return undefined; }
        return {
            kind: 'ArrayReference', name: e.name,
            isString: e.name.endsWith('$'), subscripts: e.args,
            start: e.start, end: e.end, line: e.line, column: e.column,
        };
    }

    private numericLiteral(t: Token): Expression {
        return {
            kind: 'NumericLiteral', value: Number(t.text), text: t.text, ...this.rangeOf(t),
        };
    }

    private stringLiteral(t: Token): Expression {
        const raw = t.text.replace(/^"/, '').replace(/"$/, '');
        return {
            kind: 'StringLiteral', value: raw.replace(/""/g, '"'), text: t.text,
            ...this.rangeOf(t),
        };
    }

    private lineReference(t: Token): LineReference {
        return {
            kind: 'LineReference', value: parseInt(t.text, 10), text: t.text, ...this.rangeOf(t),
        };
    }

    private errorExpression(at: Range, text = ''): ErrorExpression {
        return { kind: 'ErrorExpression', text, start: at.start, end: at.end, line: at.line, column: at.column };
    }
}

/** Parse a document. The convenience entry point. */
export function parse(text: string, options: ParseOptions): ParseResult {
    return new Parser(text, options).parse();
}
