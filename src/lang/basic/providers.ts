/**
 * Editing services for TI BASIC and Extended BASIC.
 *
 * Everything here reads the metadata table and the binder. Nothing keeps its
 * own list of keywords or its own idea of what a name means, so completion,
 * hover and the validator cannot tell a user three different stories.
 *
 * The document is parsed on demand and cached by version, because every
 * provider wants the same tree and reparsing four times per keystroke would be
 * wasteful for no benefit.
 */

import * as vscode from 'vscode';
import { Program } from './ast';
import { BindResult, bind } from './binder';
import {
    Builtin, Dialect, allBuiltinsComplete, findOperator, lookup, lookupOtherDialect,
} from './metadata';
import { parse } from './parser';

const LANGUAGES = ['ti-basic', 'ti-extended-basic'];

function dialectOf(document: vscode.TextDocument): Dialect {
    return document.languageId === 'ti-basic' ? 'ti-basic' : 'ti-extended-basic';
}

interface Analysis {
    program: Program;
    binding: BindResult;
    version: number;
}

const cache = new Map<string, Analysis>();

function analyse(document: vscode.TextDocument): Analysis {
    const key = document.uri.toString();
    const cached = cache.get(key);
    if (cached && cached.version === document.version) { return cached; }

    const dialect = dialectOf(document);
    const { program } = parse(document.getText(), { dialect });
    const analysis: Analysis = { program, binding: bind(program, dialect), version: document.version };
    cache.set(key, analysis);
    return analysis;
}

export function forgetDocument(document: vscode.TextDocument): void {
    cache.delete(document.uri.toString());
}

/** Documentation shared by hover and completion, so they cannot disagree. */
function documentationFor(builtin: Builtin): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(builtin.syntax, 'ti-extended-basic');
    md.appendMarkdown('\n' + builtin.description + '\n');

    if (builtin.params?.length) {
        md.appendMarkdown('\n');
        for (const p of builtin.params) {
            const bits: string[] = [];
            if (p.ranges?.length) {
                bits.push(p.ranges.map(r =>
                    r.min + ' to ' + r.max + (r.label ? ' (' + r.label + ')' : '')).join(', or '));
            } else if (p.min !== undefined || p.max !== undefined) {
                bits.push((p.min ?? '') + ' to ' + (p.max ?? ''));
            }
            if (p.maxLength !== undefined) { bits.push('up to ' + p.maxLength + ' characters'); }
            if (p.optional) { bits.push('optional'); }
            if (p.repeating) { bits.push('may repeat'); }
            if (p.output) { bits.push('receives a value'); }
            md.appendMarkdown('- `' + p.name + '`' +
                (p.description ? ' — ' + p.description : '') +
                (bits.length ? '  \n  _' + bits.join('; ') + '_' : '') + '\n');
        }
    }

    if (builtin.restrictions?.length) {
        md.appendMarkdown('\n');
        for (const r of builtin.restrictions) { md.appendMarkdown('> ' + r + '\n'); }
    }

    const dialects = builtin.dialects.length === 2
        ? 'TI BASIC and Extended BASIC'
        : builtin.dialects[0] === 'ti-basic' ? 'TI BASIC only' : 'Extended BASIC only';
    md.appendMarkdown('\n_' + dialects + '. ' + builtin.reference + '._');
    if (builtin.confirm) {
        md.appendMarkdown('\n\n_Some details here are not yet confirmed against ' +
            'primary documentation._');
    }
    return md;
}

const KIND_FOR: Record<string, vscode.CompletionItemKind> = {
    statement: vscode.CompletionItemKind.Keyword,
    command: vscode.CompletionItemKind.Keyword,
    function: vscode.CompletionItemKind.Function,
    subprogram: vscode.CompletionItemKind.Method,
    operator: vscode.CompletionItemKind.Operator,
    keyword: vscode.CompletionItemKind.Keyword,
};

/**
 * Completion.
 *
 * After CALL, only subprograms are offered, because nothing else may appear
 * there. Elsewhere the vocabulary of the current dialect is offered along with
 * the names the program itself defines.
 */
class BasicCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument, position: vscode.Position,
    ): vscode.CompletionItem[] {
        const dialect = dialectOf(document);
        const before = document.lineAt(position.line).text.slice(0, position.character);
        const afterCall = /\bCALL\s+[A-Za-z0-9_]*$/i.test(before);
        const items: vscode.CompletionItem[] = [];

        for (const builtin of allBuiltinsComplete()) {
            if (!builtin.dialects.includes(dialect)) { continue; }
            if (afterCall !== (builtin.kind === 'subprogram')) { continue; }
            const item = new vscode.CompletionItem(
                builtin.name, KIND_FOR[builtin.kind] ?? vscode.CompletionItemKind.Text);
            item.detail = builtin.syntax;
            item.documentation = documentationFor(builtin);
            items.push(item);
        }

        if (afterCall) {
            // User subprograms are callable too, and only the program knows them.
            for (const sub of analyse(document).binding.subs.values()) {
                if (!sub.definition) { continue; }
                const item = new vscode.CompletionItem(sub.name, vscode.CompletionItemKind.Method);
                item.detail = 'SUB ' + sub.name +
                    (sub.parameters?.length ? '(' + sub.parameters.join(', ') + ')' : '');
                items.push(item);
            }
            return items;
        }

        for (const symbol of analyse(document).binding.symbols.values()) {
            const item = new vscode.CompletionItem(symbol.name,
                symbol.kind === 'array'
                    ? vscode.CompletionItemKind.Variable
                    : vscode.CompletionItemKind.Variable);
            item.detail = symbol.kind.replace('-', ' ');
            items.push(item);
        }
        return items;
    }
}

/** Hover over a built-in, a line number, or a name the program defines. */
class BasicHoverProvider implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_]*\$?|[0-9]+/);
        if (!range) { return undefined; }
        const word = document.getText(range).toUpperCase();
        const dialect = dialectOf(document);
        const { binding } = analyse(document);

        const builtin = lookup(word, dialect);
        if (builtin) { return new vscode.Hover(documentationFor(builtin), range); }

        const elsewhere = lookupOtherDialect(word, dialect);
        if (elsewhere) {
            const md = documentationFor(elsewhere);
            md.appendMarkdown('\n\n**Not available in ' +
                (dialect === 'ti-basic' ? 'TI BASIC' : 'Extended BASIC') + '.**');
            return new vscode.Hover(md, range);
        }

        const operator = findOperator(word);
        if (operator) {
            return new vscode.Hover(
                new vscode.MarkdownString('`' + operator.symbol + '` — ' + operator.description),
                range);
        }

        // A line number: show the line it names.
        if (/^[0-9]+$/.test(word)) {
            const target = binding.lines.get(parseInt(word, 10));
            if (target) {
                const md = new vscode.MarkdownString();
                md.appendCodeblock(
                    document.lineAt(target.range.line).text.trim(), 'ti-extended-basic');
                md.appendMarkdown('\n' + target.references.length + ' reference' +
                    (target.references.length === 1 ? '' : 's') + ' to this line.');
                return new vscode.Hover(md, range);
            }
        }

        const sub = binding.subs.get(word);
        if (sub?.definition) {
            const md = new vscode.MarkdownString();
            md.appendCodeblock('SUB ' + sub.name +
                (sub.parameters?.length ? '(' + sub.parameters.join(', ') + ')' : ''),
                'ti-extended-basic');
            md.appendMarkdown('\nDefined in this program. ' + sub.references.length +
                ' call' + (sub.references.length === 1 ? '' : 's') + '.');
            return new vscode.Hover(md, range);
        }

        const symbol = binding.symbols.get(word);
        if (symbol) {
            const md = new vscode.MarkdownString('`' + symbol.name + '` — ' +
                symbol.kind.replace('-', ' ') +
                (symbol.dimensions ? ', ' + symbol.dimensions + ' dimension' +
                    (symbol.dimensions === 1 ? '' : 's') : '') +
                (symbol.scope ? ', local to SUB ' + symbol.scope : ''));
            return new vscode.Hover(md, range);
        }
        return undefined;
    }
}

/** The program outline: subprograms, and the lines other lines branch to. */
class BasicSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const { binding } = analyse(document);
        const out: vscode.DocumentSymbol[] = [];
        const toRange = (r: { line: number; column: number; end: number; start: number }) =>
            new vscode.Range(
                new vscode.Position(r.line, r.column),
                new vscode.Position(r.line, r.column + (r.end - r.start)));

        for (const sub of binding.subs.values()) {
            if (!sub.definition) { continue; }
            out.push(new vscode.DocumentSymbol(
                sub.name,
                sub.parameters?.length ? '(' + sub.parameters.join(', ') + ')' : '',
                vscode.SymbolKind.Function,
                toRange(sub.definition), toRange(sub.definition)));
        }

        // Only lines something branches to. Listing every line would be a
        // table of contents with one entry per line, which helps nobody.
        for (const line of binding.lines.values()) {
            if (line.references.length === 0) { continue; }
            out.push(new vscode.DocumentSymbol(
                String(line.number),
                line.references.length + ' reference' + (line.references.length === 1 ? '' : 's'),
                vscode.SymbolKind.Key,
                toRange(line.range), toRange(line.range)));
        }
        return out;
    }
}

/** Go to a branch target or a subprogram definition. */
class BasicDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument, position: vscode.Position,
    ): vscode.Location | undefined {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_]*\$?|[0-9]+/);
        if (!range) { return undefined; }
        const word = document.getText(range).toUpperCase();
        const { binding } = analyse(document);

        if (/^[0-9]+$/.test(word)) {
            const target = binding.lines.get(parseInt(word, 10));
            if (target) {
                return new vscode.Location(document.uri,
                    new vscode.Position(target.range.line, target.range.column));
            }
        }
        const sub = binding.subs.get(word);
        if (sub?.definition) {
            return new vscode.Location(document.uri,
                new vscode.Position(sub.definition.line, sub.definition.column));
        }
        return undefined;
    }
}

/** Find every use of a line number or a subprogram. */
class BasicReferenceProvider implements vscode.ReferenceProvider {
    provideReferences(
        document: vscode.TextDocument, position: vscode.Position,
    ): vscode.Location[] {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z][A-Za-z0-9_]*\$?|[0-9]+/);
        if (!range) { return []; }
        const word = document.getText(range).toUpperCase();
        const { binding } = analyse(document);
        const at = (r: { line: number; column: number }) =>
            new vscode.Location(document.uri, new vscode.Position(r.line, r.column));

        if (/^[0-9]+$/.test(word)) {
            const target = binding.lines.get(parseInt(word, 10));
            if (target) { return target.references.map(at); }
        }
        const symbol = binding.subs.get(word) ?? binding.symbols.get(word);
        if (symbol) {
            const found = symbol.references.map(at);
            if (symbol.definition) { found.unshift(at(symbol.definition)); }
            return found;
        }
        return [];
    }
}

/** Signature help for a built-in being typed. */
class BasicSignatureProvider implements vscode.SignatureHelpProvider {
    provideSignatureHelp(
        document: vscode.TextDocument, position: vscode.Position,
    ): vscode.SignatureHelp | undefined {
        const before = document.getText(new vscode.Range(
            new vscode.Position(position.line, 0), position));
        const match = /\b(?:CALL\s+)?([A-Za-z][A-Za-z0-9_]*\$?)\s*\(([^()]*)$/.exec(before);
        if (!match) { return undefined; }

        const builtin = lookup(match[1], dialectOf(document));
        if (!builtin?.params?.length) { return undefined; }

        const signature = new vscode.SignatureInformation(
            builtin.syntax, documentationFor(builtin));
        signature.parameters = builtin.params.map(p =>
            new vscode.ParameterInformation(p.name, p.description ?? ''));

        const help = new vscode.SignatureHelp();
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = Math.min(
            match[2].split(',').length - 1, builtin.params.length - 1);
        return help;
    }
}

/** Register every BASIC editing service. */
export function registerBasicProviders(context: vscode.ExtensionContext): void {
    const selector = LANGUAGES.map(language => ({ language, scheme: 'file' }));
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(selector, new BasicCompletionProvider()),
        vscode.languages.registerHoverProvider(selector, new BasicHoverProvider()),
        vscode.languages.registerDocumentSymbolProvider(selector, new BasicSymbolProvider()),
        vscode.languages.registerDefinitionProvider(selector, new BasicDefinitionProvider()),
        vscode.languages.registerReferenceProvider(selector, new BasicReferenceProvider()),
        vscode.languages.registerSignatureHelpProvider(
            selector, new BasicSignatureProvider(), '(', ','),
        vscode.workspace.onDidCloseTextDocument(forgetDocument),
    );
}
