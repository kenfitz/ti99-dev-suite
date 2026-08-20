/**
 * The binder: what names a program defines, and where each one is used.
 *
 * Built as a separate pass over the tree rather than inside the parser, so
 * that navigation, rename, renumbering and validation all read one model. The
 * providers that arrive later need definitions and references keyed by
 * position, which is why every entry carries a range rather than just a name.
 *
 * Nothing here reports problems. The binder records what is there; the
 * validator decides what is wrong. Keeping those apart means a diagnostic can
 * be added or softened without touching the symbol model.
 */

import {
    CallStatement, DefStatement, Expression, FunctionCall,
    NodeBase, Program, ProgramLine, Range, Statement, SubStatement, Variable,
    walk,
} from './ast';
import { Dialect, lookup } from './metadata';

export type SymbolKind =
    | 'variable' | 'string-variable' | 'array' | 'sub' | 'sub-parameter'
    | 'function' | 'line' | 'label';

export interface SymbolReference extends Range {
    /** True when this occurrence writes the symbol. */
    write?: boolean;
}

export interface BasicSymbol {
    name: string;
    kind: SymbolKind;
    /** Where it was introduced. Absent for a variable used before assignment. */
    definition?: Range;
    references: SymbolReference[];
    /** For arrays, the declared dimension count. */
    dimensions?: number;
    /** For SUBs, the declared parameter names. */
    parameters?: string[];
    /** The SUB this symbol is local to, when the dialect scopes it. */
    scope?: string;
}

export interface LineInfo {
    number: number;
    range: Range;
    /** Every place that branches here. */
    references: Range[];
    /** The line, for previewing a branch target. */
    node: ProgramLine;
}

export interface BindResult {
    /** Program lines by number, in source order. */
    lines: Map<number, LineInfo>;
    /** Line numbers declared more than once, with every occurrence. */
    duplicateLines: Array<{ number: number; ranges: Range[] }>;
    /** Branch targets that name a line the program does not define. */
    danglingReferences: Array<{ value: number; range: Range }>;
    /** Variables, arrays and DEF functions, keyed by upper-case name. */
    symbols: Map<string, BasicSymbol>;
    /** User-defined subprograms, keyed by upper-case name. */
    subs: Map<string, BasicSymbol>;
    /** CALL sites, including built-ins, for navigation and validation. */
    calls: CallStatement[];
    /** Labels defined in xbas99 label mode. */
    labels: Map<string, BasicSymbol>;
}

const rangeOf = (n: Range): Range => ({
    start: n.start, end: n.end, line: n.line, column: n.column,
});

export function bind(program: Program, dialect: Dialect): BindResult {
    const lines = new Map<number, LineInfo>();
    const seenLines = new Map<number, Range[]>();
    const symbols = new Map<string, BasicSymbol>();
    const subs = new Map<string, BasicSymbol>();
    const labels = new Map<string, BasicSymbol>();
    const calls: CallStatement[] = [];
    const pendingLineRefs: Array<{ value: number; range: Range }> = [];

    /** The SUB currently being scanned, for local scoping. */
    let currentSub: string | undefined;

    const symbolFor = (name: string, kind: SymbolKind): BasicSymbol => {
        const key = name.toUpperCase();
        let found = symbols.get(key);
        if (!found) {
            found = { name: key, kind, references: [], scope: currentSub };
            symbols.set(key, found);
        }
        return found;
    };

    // --- pass one: lines, so forward branches can be resolved ---------------
    for (const line of program.lines) {
        if (line.lineNumber === undefined) { continue; }
        const range = line.lineNumberRange ?? rangeOf(line);
        const existing = seenLines.get(line.lineNumber);
        if (existing) {
            existing.push(range);
        } else {
            seenLines.set(line.lineNumber, [range]);
            lines.set(line.lineNumber, {
                number: line.lineNumber, range, references: [], node: line,
            });
        }
        if (line.label) {
            const key = line.label.toUpperCase();
            const entry = labels.get(key) ?? { name: key, kind: 'label' as const, references: [] };
            if (!entry.definition) { entry.definition = line.labelRange; }
            labels.set(key, entry);
        }
    }

    // --- pass two: everything else -----------------------------------------
    for (const line of program.lines) {
        for (const statement of line.statements) {
            bindStatement(statement);
        }
    }

    function noteLineRef(node: { value: number } & Range): void {
        const target = lines.get(node.value);
        if (target) { target.references.push(rangeOf(node)); }
        else { pendingLineRefs.push({ value: node.value, range: rangeOf(node) }); }
    }

    function bindStatement(statement: Statement): void {
        switch (statement.kind) {
            case 'SubStatement': {
                const sub = statement as SubStatement;
                const key = sub.name.toUpperCase();
                const entry = subs.get(key) ?? { name: key, kind: 'sub' as const, references: [] };
                if (!entry.definition) { entry.definition = rangeOf(sub.nameRange); }
                entry.parameters = sub.parameters
                    .filter((p): p is Variable => p.kind === 'Variable')
                    .map(p => p.name);
                subs.set(key, entry);
                currentSub = key;
                // Parameters are local to the subprogram.
                for (const p of sub.parameters) {
                    if (p.kind === 'Variable') {
                        const local = symbolFor(p.name, 'sub-parameter');
                        local.kind = 'sub-parameter';
                        local.scope = key;
                        if (!local.definition) { local.definition = rangeOf(p); }
                    }
                }
                return;
            }
            case 'SubEndStatement':
                currentSub = undefined;
                return;
            case 'DefStatement': {
                const def = statement as DefStatement;
                const entry = symbolFor(def.name, 'function');
                entry.kind = 'function';
                if (!entry.definition) { entry.definition = rangeOf(def); }
                bindExpression(def.body);
                return;
            }
            case 'DimStatement':
                for (const decl of statement.declarations) {
                    const entry = symbolFor(decl.name, 'array');
                    entry.kind = 'array';
                    entry.dimensions = decl.subscripts.length;
                    if (!entry.definition) { entry.definition = rangeOf(decl); }
                    decl.subscripts.forEach(e => { bindExpression(e); });
                }
                return;
            case 'CallStatement':
                calls.push(statement);
                if (!lookup(statement.name, dialect, 'subprogram')) {
                    // Not a built-in, so it is a user subprogram reference.
                    const key = statement.name.toUpperCase();
                    const entry = subs.get(key) ?? { name: key, kind: 'sub' as const, references: [] };
                    entry.references.push(rangeOf(statement.nameRange));
                    subs.set(key, entry);
                }
                statement.args.forEach(e => { bindExpression(e); });
                return;
            case 'Assignment':
                if (statement.target.kind === 'Variable') {
                    const entry = symbolFor(statement.target.name,
                        statement.target.isString ? 'string-variable' : 'variable');
                    entry.references.push({ ...rangeOf(statement.target), write: true });
                    if (!entry.definition) { entry.definition = rangeOf(statement.target); }
                } else if (statement.target.kind === 'ArrayReference') {
                    bindExpression(statement.target);
                }
                bindExpression(statement.value);
                return;
            case 'ForStatement':
                if (statement.variable.kind === 'Variable') {
                    const entry = symbolFor(statement.variable.name, 'variable');
                    entry.references.push({ ...rangeOf(statement.variable), write: true });
                    if (!entry.definition) { entry.definition = rangeOf(statement.variable); }
                }
                bindExpression(statement.from);
                bindExpression(statement.to);
                if (statement.step) { bindExpression(statement.step); }
                return;
            default:
                break;
        }

        // Everything else: walk for line references and expressions.
        walk(statement as NodeBase, node => {
            if (node === statement) { return; }
            if (node.kind === 'LineReference') {
                noteLineRef(node as unknown as { value: number } & Range);
            } else if (node.kind === 'Variable' || node.kind === 'ArrayReference' ||
                       node.kind === 'FunctionCall') {
                bindExpression(node as Expression, false);
            }
        });
    }

    function bindExpression(expression: Expression, recurse = true): void {
        switch (expression.kind) {
            case 'Variable': {
                const entry = symbolFor(expression.name,
                    expression.isString ? 'string-variable' : 'variable');
                entry.references.push(rangeOf(expression));
                return;
            }
            case 'ArrayReference': {
                const entry = symbolFor(expression.name, 'array');
                entry.references.push(rangeOf(expression));
                if (recurse) { expression.subscripts.forEach(e => { bindExpression(e); }); }
                return;
            }
            case 'FunctionCall': {
                const call = expression as FunctionCall;
                // A name with parentheses is a built-in function, a DEF, or an
                // array element. Only the symbol table can tell them apart.
                if (!lookup(call.name, dialect, 'function')) {
                    const entry = symbolFor(call.name,
                        symbols.get(call.name.toUpperCase())?.kind === 'function'
                            ? 'function' : 'array');
                    entry.references.push(rangeOf(call));
                }
                if (recurse) { call.args.forEach(e => { bindExpression(e); }); }
                return;
            }
            case 'LineReference':
                noteLineRef(expression);
                return;
            default:
                if (!recurse) { return; }
                walk(expression as NodeBase, node => {
                    if (node === expression) { return; }
                    if (node.kind === 'Variable' || node.kind === 'ArrayReference' ||
                        node.kind === 'FunctionCall' || node.kind === 'LineReference') {
                        bindExpression(node as Expression, false);
                    }
                });
        }
    }

    const duplicateLines = [...seenLines.entries()]
        .filter(([, ranges]) => ranges.length > 1)
        .map(([number, ranges]) => ({ number, ranges }));

    return {
        lines, duplicateLines,
        danglingReferences: pendingLineRefs.filter(r => !lines.has(r.value)),
        symbols, subs, calls, labels,
    };
}

/** The array declarations a program made, for subscript checking. */
export function arrayOf(result: BindResult, name: string): BasicSymbol | undefined {
    const found = result.symbols.get(name.toUpperCase());
    return found && found.kind === 'array' ? found : undefined;
}

/** Every symbol at a position, for hover and navigation. */
export function symbolAt(result: BindResult, offset: number): BasicSymbol | undefined {
    const covers = (r: Range | undefined): boolean =>
        r !== undefined && r.start <= offset && offset <= r.end;
    for (const table of [result.subs, result.symbols, result.labels]) {
        for (const symbol of table.values()) {
            if (covers(symbol.definition) || symbol.references.some(covers)) { return symbol; }
        }
    }
    return undefined;
}
