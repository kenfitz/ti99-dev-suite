/**
 * Semantic validation for TI BASIC and TI Extended BASIC.
 *
 * Deliberately conservative. Retro BASIC uses patterns a modern linter would
 * complain about, and a diagnostic that is usually wrong is worse than no
 * diagnostic: people stop reading the Problems panel, and then the real errors
 * are invisible too.
 *
 * The rule applied throughout is that a problem is reported only when it is
 * decidable from the source alone. Anything that depends on what a value turns
 * out to be at run time is left alone, however suspicious it looks.
 *
 * Everything checked here comes from the metadata table, so the vocabulary,
 * the ranges and the dialect availability cannot drift away from what hover
 * and completion tell the user.
 */

import { Expression, Program, Statement, walk } from './ast';
import { BindResult, bind } from './binder';
import {
    Builtin, Dialect, NumericRange, Param, lookup, lookupOtherDialect,
} from './metadata';
import { ParseDiagnostic, parse } from './parser';

export type Diagnostic = ParseDiagnostic;

export interface ValidateOptions {
    dialect: Dialect;
    labels?: boolean;
}

export interface ValidationResult {
    program: Program;
    binding: BindResult;
    diagnostics: Diagnostic[];
}

const LOWEST_LINE = 1;
const HIGHEST_LINE = 32767;

/** Parse, bind and validate in one call. */
export function validate(text: string, options: ValidateOptions): ValidationResult {
    const parsed = parse(text, { dialect: options.dialect, labels: options.labels });
    const binding = bind(parsed.program, options.dialect);
    const diagnostics = [...parsed.diagnostics];
    const dialect = options.dialect;
    const other: Dialect = dialect === 'ti-basic' ? 'ti-extended-basic' : 'ti-basic';
    const dialectName = dialect === 'ti-basic' ? 'TI BASIC' : 'Extended BASIC';
    const otherName = other === 'ti-basic' ? 'TI BASIC' : 'Extended BASIC';

    const report = (
        code: string, message: string, at: { start: number; end: number; line: number; column: number },
        severity: 'error' | 'warning' = 'error',
    ): void => {
        diagnostics.push({
            code, message, severity,
            start: at.start, end: Math.max(at.end, at.start + 1),
            line: at.line, column: at.column,
        });
    };

    // --- line numbers ------------------------------------------------------

    for (const duplicate of binding.duplicateLines) {
        // Report every occurrence after the first; the first one is fine.
        for (const range of duplicate.ranges.slice(1)) {
            report('duplicate-line',
                'Line ' + duplicate.number + ' is defined more than once.', range);
        }
    }

    for (const line of parsed.program.lines) {
        if (line.lineNumber === undefined) { continue; }
        if (line.lineNumber < LOWEST_LINE || line.lineNumber > HIGHEST_LINE) {
            report('line-number-range',
                'A line number must be between ' + LOWEST_LINE + ' and ' + HIGHEST_LINE + '.',
                line.lineNumberRange ?? line);
        }
    }

    for (const dangling of binding.danglingReferences) {
        report('missing-line',
            'There is no line ' + dangling.value + ' in this program.', dangling.range);
    }

    // --- statements and calls ----------------------------------------------

    for (const line of parsed.program.lines) {
        for (const statement of line.statements) {
            checkStatement(statement);
        }
    }

    function checkStatement(statement: Statement): void {
        walk(statement, node => {
            const s = node as Statement;
            switch (s.kind) {
                case 'CallStatement': checkCall(s); break;
                case 'ForStatement':
                    if (s.variable.kind === 'ArrayReference') {
                        report('for-needs-simple-variable',
                            'FOR needs a simple numeric variable, not an array element.',
                            s.variable);
                    }
                    break;
                case 'InputStatement':
                    checkStatementDialect(s.keyword, s);
                    break;
                case 'ImageStatement':
                    checkStatementDialect('IMAGE', s);
                    break;
                default:
                    break;
            }
            if (node.kind === 'FunctionCall') { checkFunction(node as Expression); }
        });
    }

    /** A statement the other dialect has and this one does not. */
    function checkStatementDialect(
        keyword: string, at: { start: number; end: number; line: number; column: number },
    ): void {
        if (lookup(keyword, dialect, 'statement')) { return; }
        if (lookupOtherDialect(keyword, dialect, 'statement')) {
            report('wrong-dialect-statement',
                keyword + ' is available in ' + otherName + ' but not ' + dialectName + '.', at);
        }
    }

    function checkCall(call: Extract<Statement, { kind: 'CallStatement' }>): void {
        const builtin = lookup(call.name, dialect, 'subprogram');
        if (builtin) {
            checkArguments(builtin, call.args, call);
            return;
        }

        const inOther = lookupOtherDialect(call.name, dialect, 'subprogram');
        if (inOther) {
            report('wrong-dialect-subprogram',
                'CALL ' + call.name + ' is available in ' + otherName +
                ' but not ' + dialectName + '.', call.nameRange);
            return;
        }

        // Not a built-in in either dialect. In Extended BASIC it may be a user
        // subprogram; in TI BASIC there is no such thing.
        const sub = binding.subs.get(call.name.toUpperCase());
        if (dialect === 'ti-basic') {
            report('unknown-subprogram',
                'CALL ' + call.name + ' is not a TI BASIC subprogram.', call.nameRange);
            return;
        }
        if (!sub || !sub.definition) {
            report('undefined-sub',
                'No subprogram named ' + call.name + ' is defined in this program.',
                call.nameRange);
            return;
        }
        if (sub.parameters && sub.parameters.length !== call.args.length) {
            report('sub-argument-count',
                'SUB ' + call.name + ' takes ' + sub.parameters.length +
                ' parameter' + (sub.parameters.length === 1 ? '' : 's') +
                ', but ' + call.args.length + ' were given.', call);
        }
    }

    function checkFunction(expression: Expression): void {
        if (expression.kind !== 'FunctionCall') { return; }
        const name = expression.name;
        const builtin = lookup(name, dialect, 'function');
        if (builtin) {
            checkArguments(builtin, expression.args, expression);
            return;
        }
        if (lookupOtherDialect(name, dialect, 'function')) {
            report('wrong-dialect-function',
                name + ' is available in ' + otherName + ' but not ' + dialectName + '.',
                expression);
            return;
        }
        // Otherwise it is an array element or a DEF. Both are legitimate and
        // neither can be checked without knowing which, so nothing is said.
    }

    /**
     * Argument count and, where the value is written literally, its range.
     *
     * Only literals are range-checked. A variable might hold anything, and
     * guessing would produce exactly the noise this validator avoids.
     */
    function checkArguments(
        builtin: Builtin, args: Expression[],
        at: { start: number; end: number; line: number; column: number },
    ): void {
        const params = builtin.params ?? [];
        if (params.length === 0) { return; }

        const repeating = params.some(p => p.repeating);
        const required = params.filter(p => !p.optional && !p.repeating).length;
        const minimum = repeating ? params.filter(p => !p.optional).length : required;
        const maximum = repeating ? Number.POSITIVE_INFINITY : params.length;

        if (args.length < minimum) {
            report('argument-count',
                builtin.name + ' needs at least ' + minimum + ' argument' +
                (minimum === 1 ? '' : 's') + ', but ' + args.length +
                (args.length === 1 ? ' was' : ' were') + ' given.  ' + builtin.syntax, at);
            return;
        }
        if (args.length > maximum) {
            report('argument-count',
                builtin.name + ' takes at most ' + maximum + ' argument' +
                (maximum === 1 ? '' : 's') + ', but ' + args.length + ' were given.  ' +
                builtin.syntax, at);
            return;
        }

        for (let i = 0; i < args.length; i++) {
            const param = paramFor(params, i, repeating);
            if (!param) { continue; }
            checkArgumentValue(builtin, param, args[i]);
        }
    }

    /** Which parameter an argument position corresponds to. */
    function paramFor(params: Param[], index: number, repeating: boolean): Param | undefined {
        if (index < params.length) { return params[index]; }
        if (!repeating) { return undefined; }
        // Past the declared list, the repeating group cycles. CALL SOUND
        // repeats frequency and volume; CALL CHAR repeats code and pattern.
        const group = params.filter(p => p.repeating);
        if (group.length === 0) { return undefined; }
        const first = params.findIndex(p => p.repeating);
        return group[(index - first) % group.length];
    }

    function checkArgumentValue(builtin: Builtin, param: Param, argument: Expression): void {
        // An output parameter is written to, so it must name somewhere. This
        // is checked first: a literal would otherwise pass the range test and
        // never reach the writability test below.
        if (param.output && argument.kind !== 'Variable' &&
            argument.kind !== 'ArrayReference' && argument.kind !== 'FunctionCall') {
            report('argument-not-writable',
                builtin.name + ': ' + param.name +
                ' receives a value, so it must be a variable.', argument);
            return;
        }

        const literal = numericValueOf(argument);
        if (literal !== undefined) {
            const ranges = param.ranges ?? rangeFromMinMax(param);
            if (ranges.length && !ranges.some(r => literal >= r.min && literal <= r.max)) {
                report('argument-range',
                    builtin.name + ': ' + param.name + ' is documented as ' +
                    describeRanges(ranges) + ', but ' + literal + ' was given.', argument);
            }
            return;
        }

        if (argument.kind === 'StringLiteral') {
            const text = argument.value;
            if (param.type === 'numeric') {
                report('argument-type',
                    builtin.name + ': ' + param.name + ' takes a number, not a string.',
                    argument);
                return;
            }
            if (param.maxLength !== undefined && text.length > param.maxLength) {
                report('argument-length',
                    builtin.name + ': ' + param.name + ' takes at most ' +
                    param.maxLength + ' characters, but ' + text.length + ' were given.',
                    argument);
                return;
            }
            if (param.hexString && !/^[0-9A-Fa-f]*$/.test(text)) {
                report('argument-hex',
                    builtin.name + ': ' + param.name +
                    ' must contain only hexadecimal characters.', argument);
            }
            return;
        }

    }

    // --- Extended BASIC subprogram structure -------------------------------

    if (dialect === 'ti-extended-basic') {
        checkSubStructure();
    }

    function checkSubStructure(): void {
        let open: { name: string; at: Statement } | undefined;
        const defined = new Set<string>();

        for (const line of parsed.program.lines) {
            for (const statement of line.statements) {
                if (statement.kind === 'SubStatement') {
                    if (open) {
                        report('sub-not-closed',
                            'SUB ' + open.name + ' was not closed with SUBEND before SUB ' +
                            statement.name + ' began.', statement);
                    }
                    if (defined.has(statement.name)) {
                        report('duplicate-sub',
                            'A subprogram named ' + statement.name +
                            ' is already defined.', statement.nameRange);
                    }
                    defined.add(statement.name);
                    open = { name: statement.name, at: statement };
                } else if (statement.kind === 'SubEndStatement') {
                    if (!open) {
                        report('subend-without-sub',
                            'SUBEND without a matching SUB.', statement);
                    }
                    open = undefined;
                } else if (statement.kind === 'SubExitStatement') {
                    if (!open) {
                        report('subexit-outside-sub',
                            'SUBEXIT is only allowed inside a subprogram.', statement);
                    }
                }
            }
        }
        if (open) {
            report('sub-not-closed',
                'SUB ' + open.name + ' is never closed with SUBEND.', open.at);
        }
    }

    diagnostics.sort((a, b) => a.start - b.start);
    return { program: parsed.program, binding, diagnostics };
}

/** The value of a literal, including a negated one. Undefined when unknown. */
function numericValueOf(expression: Expression): number | undefined {
    if (expression.kind === 'NumericLiteral') { return expression.value; }
    if (expression.kind === 'UnaryExpression' && expression.operator === '-') {
        const inner = numericValueOf(expression.operand);
        return inner === undefined ? undefined : -inner;
    }
    if (expression.kind === 'ParenExpression') { return numericValueOf(expression.inner); }
    return undefined;
}

function rangeFromMinMax(param: Param): NumericRange[] {
    if (param.min === undefined && param.max === undefined) { return []; }
    return [{
        min: param.min ?? Number.NEGATIVE_INFINITY,
        max: param.max ?? Number.POSITIVE_INFINITY,
    }];
}

function describeRanges(ranges: NumericRange[]): string {
    return ranges
        .map(r => {
            const span = r.min + ' to ' + r.max;
            return r.label ? span + ' (' + r.label + ')' : span;
        })
        .join(', or ');
}
