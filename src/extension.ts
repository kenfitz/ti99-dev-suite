import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import {
    DIRECTIVES, EXTENDED_INSTRUCTIONS, INSTRUCTIONS,
    describe, lookupDirective, lookupInstruction, signature,
} from './data/instructions';
import { ALL_BUILTINS, describeBuiltin, lookupBuiltin } from './data/builtins';
import {
    DEFAULT_FORMAT_OPTIONS, convertEaToXdt99, findDialectHazards, formatText, splitLine,
} from './lang/formatter';
import type { FormatOptions } from './lang/formatter';
import { DIALECTS, detectDialect } from './lang/dialect';
import type { SyntaxDialect } from './lang/dialect';
import { ProjectManager } from './config/loader';
import type { Project } from './config/loader';
import type { Capability, Processor } from './config/project';
import { resolveTarget, targetIds } from './config/project';
import { describeState, discover } from './toolchain/discovery';
import type { ToolchainState } from './toolchain/discovery';
import { Cancellation, run } from './toolchain/runner';
import { BuildCoordinator } from './build/coordinator';
import type { Artifact, BuildResult } from './build/coordinator';
import { EmulatorLauncher } from './emulator/launcher';
import { createProject, importProject } from './project/wizard';
import { ArtifactsView, DiskView, ProjectView, SymbolsView } from './views/trees';
import { StatusBar, Ti99TaskProvider } from './tasks';

const LANGUAGE_ID = 'tms9900';
const DIAG_SOURCE = 'ti99';

let diagnostics: vscode.DiagnosticCollection;
let output: vscode.OutputChannel;
let projects: ProjectManager;
let toolchain: ToolchainState = { problems: ['Toolchain not yet probed.'], ready: false };
let coordinator: BuildCoordinator;
let launcher: EmulatorLauncher;
let statusBar: StatusBar;
let symbolsView: SymbolsView;
let artifactsView: ArtifactsView;
let diskView: DiskView;
let projectView: ProjectView;
let lastBuild: BuildResult | undefined;
let activeBuild: Cancellation | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    diagnostics = vscode.languages.createDiagnosticCollection(DIAG_SOURCE);
    output = vscode.window.createOutputChannel('TI-99');
    projects = new ProjectManager();
    coordinator = new BuildCoordinator(output, diagnostics);
    launcher = new EmulatorLauncher(output);
    statusBar = new StatusBar();

    projectView = new ProjectView(projects);
    symbolsView = new SymbolsView();
    artifactsView = new ArtifactsView();
    diskView = new DiskView();

    context.subscriptions.push(diagnostics, output, projects, statusBar, launcher);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('ti99.project', projectView),
        vscode.window.registerTreeDataProvider('ti99.symbols', symbolsView),
        vscode.window.registerTreeDataProvider('ti99.artifacts', artifactsView),
        vscode.window.registerTreeDataProvider('ti99.disk', diskView));

    registerLanguageFeatures(context);
    registerCommands(context);

    context.subscriptions.push(
        vscode.tasks.registerTaskProvider(Ti99TaskProvider.type, new Ti99TaskProvider(projects)));

    await projects.initialise();
    projects.onDidChangeActive(() => {
        projectView.refresh();
        statusBar.update(projects, toolchain);
    });

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration('ti99.toolchain')) {
            toolchain = await discover(context);
            statusBar.update(projects, toolchain);
        }
        if (e.affectsConfiguration('ti99.syntaxDialect') || e.affectsConfiguration('ti99.diagnostics')) {
            for (const doc of vscode.workspace.textDocuments) {
                if (doc.languageId === LANGUAGE_ID) analyze(doc);
            }
            statusBar.update(projects, toolchain);
        }
    }));

    // Probe the toolchain without blocking activation.
    void discover(context).then(state => {
        toolchain = state;
        statusBar.update(projects, toolchain);
        if (state.problems.length) output.appendLine(describeState(state));
    });

    statusBar.update(projects, toolchain);
}

export function deactivate(): void {
    activeBuild?.cancel();
}

// ---------------------------------------------------------------------------
// Language features
// ---------------------------------------------------------------------------

function registerLanguageFeatures(context: vscode.ExtensionContext): void {
    const selector: vscode.DocumentSelector = { language: LANGUAGE_ID, scheme: 'file' };

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(selector, formattingProvider),
        vscode.languages.registerDocumentRangeFormattingEditProvider(selector, rangeFormattingProvider),
        vscode.languages.registerHoverProvider(selector, hoverProvider),
        vscode.languages.registerCompletionItemProvider(selector, completionProvider),
        vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider),
        vscode.languages.registerDefinitionProvider(selector, definitionProvider),
        vscode.languages.registerReferenceProvider(selector, referenceProvider),
        vscode.languages.registerCodeActionsProvider(selector, codeActionProvider, {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
        }));

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.languageId === LANGUAGE_ID) scheduleAnalysis(e.document);
        }),
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === LANGUAGE_ID) scheduleAnalysis(doc);
        }),
        vscode.workspace.onDidCloseTextDocument(doc => diagnostics.delete(doc.uri)));

    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === LANGUAGE_ID) scheduleAnalysis(doc);
    }
}

function currentDialect(doc: vscode.TextDocument): SyntaxDialect {
    const project = projects?.active;
    if (project) return project.config.syntaxDialect;
    return vscode.workspace.getConfiguration('ti99', doc.uri).get<SyntaxDialect>('syntaxDialect', 'xdt99');
}

function formatOptions(doc: vscode.TextDocument): FormatOptions {
    const cfg = vscode.workspace.getConfiguration('ti99.format', doc.uri);
    return {
        ...DEFAULT_FORMAT_OPTIONS,
        labelColumn: cfg.get('labelColumn', DEFAULT_FORMAT_OPTIONS.labelColumn),
        opcodeColumn: cfg.get('opcodeColumn', DEFAULT_FORMAT_OPTIONS.opcodeColumn),
        operandColumn: cfg.get('operandColumn', DEFAULT_FORMAT_OPTIONS.operandColumn),
        commentColumn: cfg.get('commentColumn', DEFAULT_FORMAT_OPTIONS.commentColumn),
        uppercaseMnemonics: cfg.get('uppercaseMnemonics', true),
        uppercaseRegisters: cfg.get('uppercaseRegisters', true),
        alignComments: cfg.get('alignComments', true),
        minCommentGap: 2,
        minimalChanges: false,
        inputDialect: currentDialect(doc),
    };
}

const formattingProvider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
        const full = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        warnIfDialectBlocksFormatting(document);
        return [vscode.TextEdit.replace(full, formatText(document.getText(), formatOptions(document)))];
    },
};

/**
 * The formatter leaves single-blank comment lines untouched under a non-strict
 * dialect, because it cannot tell comment from expression there. Say so, rather
 * than letting the user conclude the formatter is broken.
 */
let dialectWarningShown = false;

function warnIfDialectBlocksFormatting(document: vscode.TextDocument): void {
    if (currentDialect(document) === 'ea') return;
    const hazards = findDialectHazards(document.getText());
    if (hazards.length === 0 || dialectWarningShown) return;

    dialectWarningShown = true;
    void vscode.window
        .showWarningMessage(
            `${hazards.length} line(s) were left unformatted. They separate a comment from the operand ` +
            `by a single blank, which the current dialect reads as part of the expression.`,
            'Switch to Editor/Assembler', 'Convert the file', 'Show me the lines')
        .then(async choice => {
            dialectWarningShown = false;
            if (choice === 'Switch to Editor/Assembler') {
                const project = projects.active;
                if (project) {
                    project.config.syntaxDialect = 'ea';
                    await vscode.workspace.fs.writeFile(
                        project.configUri,
                        Buffer.from(JSON.stringify(project.config, null, 2) + '\n', 'utf8'));
                } else {
                    await vscode.workspace.getConfiguration('ti99')
                        .update('syntaxDialect', 'ea', vscode.ConfigurationTarget.Workspace);
                }
                await vscode.commands.executeCommand('editor.action.formatDocument');
            } else if (choice === 'Convert the file') {
                await vscode.commands.executeCommand('ti99.convertSyntax');
            } else if (choice === 'Show me the lines') {
                await vscode.commands.executeCommand('ti99.checkHazards');
            }
        });
}

const rangeFormattingProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(document, range) {
        const start = new vscode.Position(range.start.line, 0);
        const full = new vscode.Range(start, document.lineAt(range.end.line).range.end);
        warnIfDialectBlocksFormatting(document);
        return [vscode.TextEdit.replace(full, formatText(document.getText(full), formatOptions(document)))];
    },
};

const hoverProvider: vscode.HoverProvider = {
    provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_!][A-Za-z0-9_!.$]*/);
        if (!range) return undefined;
        const word = document.getText(range);

        const fields = splitLine(document.lineAt(position.line).text, currentDialect(document));

        if (fields.kind === 'code' && fields.opcode.toUpperCase() === word.toUpperCase()) {
            const instr = lookupInstruction(word);
            if (instr) return new vscode.Hover(new vscode.MarkdownString(describe(instr)), range);

            const dir = lookupDirective(word);
            if (dir) {
                const md = new vscode.MarkdownString();
                md.appendCodeblock(`${dir.name} ${dir.operands}`.trim(), LANGUAGE_ID);
                md.appendMarkdown(`**${dir.summary}**\n\n${dir.description}`);
                if (dir.extension)
                    md.appendMarkdown('\n\n> xas99 extension. Not understood by the TI Editor/Assembler.');
                return new vscode.Hover(md, range);
            }
        }

        const builtin = lookupBuiltin(word);
        if (builtin) return new vscode.Hover(new vscode.MarkdownString(describeBuiltin(builtin)), range);

        const symbol = findDefinitionMarkdown(document, word);
        if (symbol) return new vscode.Hover(symbol, range);

        return undefined;
    },
};

function findDefinitionLine(document: vscode.TextDocument, name: string): number | undefined {
    const dialect = currentDialect(document);
    const target = name.toUpperCase();
    for (let i = 0; i < document.lineCount; i++) {
        const f = splitLine(document.lineAt(i).text, dialect);
        if (f.kind !== 'code' || !f.label) continue;
        if (f.label.replace(/:$/, '').toUpperCase() === target) return i;
    }
    return undefined;
}

function findDefinitionMarkdown(document: vscode.TextDocument, name: string): vscode.MarkdownString | undefined {
    const line = findDefinitionLine(document, name);
    if (line === undefined) return undefined;

    const f = splitLine(document.lineAt(line).text, currentDialect(document));
    const md = new vscode.MarkdownString();
    const isEqu = /^(EQU|WEQU|REQU)$/i.test(f.opcode);
    md.appendCodeblock(isEqu ? `${f.label} ${f.opcode.toUpperCase()} ${f.operand}` : f.label, LANGUAGE_ID);
    md.appendMarkdown(isEqu ? '**Constant**' : '**Label**');
    // A trailing comment on a definition is documentation. Free hover text.
    if (f.comment) md.appendMarkdown(`\n\n${f.comment.replace(/^[*;]\s*/, '')}`);
    md.appendMarkdown(`\n\n*Defined at line ${line + 1}*`);
    return md;
}

const definitionProvider: vscode.DefinitionProvider = {
    provideDefinition(document, position) {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_!][A-Za-z0-9_!.$]*/);
        if (!range) return undefined;

        const f = splitLine(document.lineAt(position.line).text, currentDialect(document));
        if (f.kind === 'code' && /^B?COPY$/i.test(f.opcode)) {
            const target = resolveCopyTarget(document, f.operand);
            if (target) return new vscode.Location(vscode.Uri.file(target), new vscode.Position(0, 0));
        }

        const line = findDefinitionLine(document, document.getText(range));
        if (line === undefined) return undefined;
        return new vscode.Location(document.uri, new vscode.Position(line, 0));
    },
};

function resolveCopyTarget(document: vscode.TextDocument, operand: string): string | undefined {
    const raw = operand.replace(/^["']|["']$/g, '').trim();
    if (!raw) return undefined;

    const project = projects?.active;
    const from = path.dirname(document.uri.fsPath);
    const searchPaths = [from];
    if (project) {
        for (const p of project.config.includePaths)
            searchPaths.push(path.resolve(project.root.fsPath, p));
    }

    const tiPath = /^DSK\d?\.?(.+)$/i.exec(raw);
    const bases = tiPath ? [tiPath[1].replace(/\./g, path.sep)] : [raw];

    for (const dir of searchPaths) {
        for (const base of bases) {
            for (const ext of ['', '.a99', '.asm', '.s']) {
                for (const name of [base + ext, base.toLowerCase() + ext, base.toUpperCase() + ext]) {
                    const candidate = path.isAbsolute(name) ? name : path.resolve(dir, name);
                    try {
                        if (fs.statSync(candidate).isFile()) return candidate;
                    } catch { /* keep looking */ }
                }
            }
        }
    }
    return undefined;
}

const referenceProvider: vscode.ReferenceProvider = {
    provideReferences(document, position) {
        const range = document.getWordRangeAtPosition(position, /[A-Za-z_!][A-Za-z0-9_!.$]*/);
        if (!range) return [];

        const target = document.getText(range).toUpperCase();
        const dialect = currentDialect(document);
        const locations: vscode.Location[] = [];

        for (let i = 0; i < document.lineCount; i++) {
            const text = document.lineAt(i).text;
            const f = splitLine(text, dialect);
            if (f.kind !== 'code') continue;

            if (f.label && f.label.replace(/:$/, '').toUpperCase() === target) {
                locations.push(new vscode.Location(document.uri, new vscode.Range(i, 0, i, f.label.length)));
            }

            // Search the operand field only, so hits inside comments are excluded.
            if (f.operand) {
                const base = text.indexOf(f.operand);
                const re = new RegExp(`\\b${escapeRegex(target)}\\b`, 'gi');
                let m: RegExpExecArray | null;
                while ((m = re.exec(f.operand)) !== null) {
                    locations.push(new vscode.Location(
                        document.uri,
                        new vscode.Range(i, base + m.index, i, base + m.index + m[0].length)));
                }
            }
        }
        return locations;
    },
};

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const codeActionProvider: vscode.CodeActionProvider = {
    provideCodeActions(document, _range, context) {
        const actions: vscode.CodeAction[] = [];

        for (const d of context.diagnostics) {
            if (d.code !== 'single-blank-comment') continue;

            const fix = new vscode.CodeAction('Widen the gap before the comment', vscode.CodeActionKind.QuickFix);
            fix.diagnostics = [d];
            fix.isPreferred = true;
            fix.edit = new vscode.WorkspaceEdit();
            fix.edit.insert(document.uri, new vscode.Position(d.range.start.line, d.range.start.character), ' ');
            actions.push(fix);

            const all = new vscode.CodeAction('Convert the whole file to xas99 syntax', vscode.CodeActionKind.QuickFix);
            all.diagnostics = [d];
            all.command = { command: 'ti99.convertSyntax', title: 'Convert' };
            actions.push(all);
        }
        return actions;
    },
};

const completionProvider: vscode.CompletionItemProvider = {
    provideCompletionItems(document, position) {
        const prefix = document.lineAt(position.line).text.slice(0, position.character);
        const items: vscode.CompletionItem[] = [];
        if (position.character === 0) return items;

        const inOpcodeField = /^\s*\S*$/.test(prefix) || /^\S+\s+\S*$/.test(prefix);
        const processor = projects?.active?.config.processor
            ?? vscode.workspace.getConfiguration('ti99', document.uri).get<Processor>('processor', '9900');

        if (inOpcodeField) {
            for (const instr of INSTRUCTIONS) {
                const item = new vscode.CompletionItem(instr.mnemonic, vscode.CompletionItemKind.Keyword);
                item.detail = signature(instr);
                item.documentation = new vscode.MarkdownString(describe(instr));
                item.sortText = `1_${instr.mnemonic}`;
                items.push(item);
            }

            if (processor !== '9900') {
                for (const instr of EXTENDED_INSTRUCTIONS) {
                    if (instr.cpu !== processor) continue;
                    const item = new vscode.CompletionItem(instr.mnemonic, vscode.CompletionItemKind.Keyword);
                    item.detail = `${signature(instr)}  (${instr.cpu})`;
                    item.documentation = new vscode.MarkdownString(describe(instr));
                    item.sortText = `2_${instr.mnemonic}`;
                    items.push(item);
                }
            }

            for (const dir of DIRECTIVES) {
                const item = new vscode.CompletionItem(dir.name, vscode.CompletionItemKind.Function);
                item.detail = `${dir.name} ${dir.operands}`.trim();
                item.documentation = new vscode.MarkdownString(
                    `**${dir.summary}**\n\n${dir.description}` + (dir.extension ? '\n\n> xas99 extension.' : ''));
                item.sortText = dir.extension ? `4_${dir.name}` : `3_${dir.name}`;
                items.push(item);
            }
            return items;
        }

        for (let n = 0; n <= 15; n++) {
            const item = new vscode.CompletionItem(`R${n}`, vscode.CompletionItemKind.Variable);
            item.detail = n === 11 ? 'Return address for BL' : n === 12 ? 'CRU base address' : `Register ${n}`;
            item.sortText = `1_R${String(n).padStart(2, '0')}`;
            items.push(item);
        }

        for (const sym of documentSymbols(document)) {
            const item = new vscode.CompletionItem(sym.name, sym.kind);
            item.detail = sym.detail;
            item.sortText = `2_${sym.name}`;
            items.push(item);
        }

        for (const b of ALL_BUILTINS) {
            const item = new vscode.CompletionItem(b.name, vscode.CompletionItemKind.Constant);
            item.detail = b.summary;
            item.documentation = new vscode.MarkdownString(describeBuiltin(b));
            item.sortText = `3_${b.name}`;
            items.push(item);
        }

        return items;
    },
};

interface DocSymbol {
    name: string;
    kind: vscode.CompletionItemKind;
    symbolKind: vscode.SymbolKind;
    detail: string;
    line: number;
}

function documentSymbols(document: vscode.TextDocument): DocSymbol[] {
    const dialect = currentDialect(document);
    const out: DocSymbol[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        const f = splitLine(document.lineAt(i).text, dialect);
        if (f.kind !== 'code') continue;

        if (f.label) {
            const name = f.label.replace(/:$/, '');
            const isEqu = /^(EQU|WEQU)$/i.test(f.opcode);
            const isReg = /^REQU$/i.test(f.opcode);
            out.push({
                name,
                kind: isEqu || isReg ? vscode.CompletionItemKind.Constant : vscode.CompletionItemKind.Function,
                symbolKind: isEqu || isReg ? vscode.SymbolKind.Constant : vscode.SymbolKind.Function,
                detail: isEqu ? `EQU ${f.operand}` : isReg ? `REQU ${f.operand}` : (f.comment.replace(/^[*;]\s*/, '') || 'label'),
                line: i,
            });
        }

        if (/^AORG$/i.test(f.opcode)) {
            out.push({ name: `AORG ${f.operand}`, kind: vscode.CompletionItemKind.Module, symbolKind: vscode.SymbolKind.Namespace, detail: 'absolute origin', line: i });
        }

        if (/^B?COPY$/i.test(f.opcode)) {
            out.push({ name: f.operand.replace(/^["']|["']$/g, ''), kind: vscode.CompletionItemKind.File, symbolKind: vscode.SymbolKind.File, detail: 'included source', line: i });
        }
    }
    return out;
}

const symbolProvider: vscode.DocumentSymbolProvider = {
    provideDocumentSymbols(document) {
        return documentSymbols(document).map(s => new vscode.SymbolInformation(
            s.name,
            s.symbolKind,
            s.detail,
            new vscode.Location(document.uri, document.lineAt(s.line).range)));
    },
};

// ---------------------------------------------------------------------------
// Static analysis
// ---------------------------------------------------------------------------

const analysisTimers = new Map<string, NodeJS.Timeout>();

function scheduleAnalysis(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = analysisTimers.get(key);
    if (existing) clearTimeout(existing);
    analysisTimers.set(key, setTimeout(() => { analysisTimers.delete(key); analyze(document); }, 250));
}

function analyze(document: vscode.TextDocument): void {
    if (!vscode.workspace.getConfiguration('ti99.diagnostics').get('staticAnalysis', true)) {
        diagnostics.delete(document.uri);
        return;
    }

    const dialect = currentDialect(document);
    const found: vscode.Diagnostic[] = [];
    const labels = new Map<string, number>();

    for (let i = 0; i < document.lineCount; i++) {
        const text = document.lineAt(i).text;
        const f = splitLine(text, dialect);
        if (f.kind !== 'code') continue;

        if (f.label) {
            const name = f.label.replace(/:$/, '').toUpperCase();
            if (!name.startsWith('!')) {
                const first = labels.get(name);
                if (first !== undefined) {
                    found.push(diag(i, 0, f.label.length,
                        `Duplicate symbol: ${f.label} is already defined at line ${first + 1}.`,
                        vscode.DiagnosticSeverity.Error));
                } else {
                    labels.set(name, i);
                }
            }
        }

        if (!f.opcode) continue;

        const instr = lookupInstruction(f.opcode);
        const dir = lookupDirective(f.opcode);

        if (!instr && !dir) {
            const col = text.indexOf(f.opcode);
            found.push(diag(i, col, f.opcode.length,
                `Unknown instruction or directive: ${f.opcode}`,
                vscode.DiagnosticSeverity.Error));
            continue;
        }

        if (instr) {
            const supplied = f.operand ? splitOperands(f.operand).length : 0;
            const expected = instr.operands.length;
            if (supplied !== expected) {
                const col = text.indexOf(f.opcode);
                found.push(diag(i, col, Math.max(1, text.trimEnd().length - col),
                    `${instr.mnemonic} takes ${expected} operand${expected === 1 ? '' : 's'} (${signature(instr)}), but ${supplied} ${supplied === 1 ? 'was' : 'were'} supplied.`,
                    vscode.DiagnosticSeverity.Error));
            }
        }

        // Dialect hazard: a single blank before a comment, under a non-strict dialect.
        if (dialect !== 'ea') {
            const ea = splitLine(text, 'ea');
            if (ea.ambiguous) {
                const idx = text.indexOf(ea.operand) + ea.operand.length;
                const d = diag(i, Math.max(0, idx), 2,
                    'A single blank before a comment is read as part of the expression under xas99 default syntax. Use two blanks or a tab.',
                    vscode.DiagnosticSeverity.Warning);
                d.code = 'single-blank-comment';
                found.push(d);
            }
        }
    }

    diagnostics.set(document.uri, found);
}

function diag(
    line: number,
    col: number,
    len: number,
    message: string,
    severity: vscode.DiagnosticSeverity,
): vscode.Diagnostic {
    const start = Math.max(0, col);
    const d = new vscode.Diagnostic(
        new vscode.Range(line, start, line, start + Math.max(1, len)), message, severity);
    d.source = DIAG_SOURCE;
    return d;
}

function splitOperands(operand: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inText = false;
    let current = '';

    for (let i = 0; i < operand.length; i++) {
        const c = operand[i];
        if (inText) {
            current += c;
            if (c === "'") {
                if (operand[i + 1] === "'") { current += operand[++i]; continue; }
                inText = false;
            }
            continue;
        }
        if (c === "'") { inText = true; current += c; continue; }
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += c;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function registerCommands(context: vscode.ExtensionContext): void {
    const register = (id: string, handler: (...args: never[]) => unknown) =>
        context.subscriptions.push(vscode.commands.registerCommand(id, handler));

    register('ti99.build', () => doBuildAll(false));
    register('ti99.rebuild', () => doBuildAll(true));
    register('ti99.buildTarget', (target?: string) => doBuildTarget(false, target));
    register('ti99.rebuildTarget', (target?: string) => doBuildTarget(true, target));
    register('ti99.clean', doClean);
    register('ti99.run', () => doRun(undefined));
    register('ti99.buildAndRun', doBuildAndRun);
    register('ti99.newProject', createProject);
    register('ti99.importProject', importProject);
    register('ti99.toolchainStatus', () => doToolchainStatus(context));
    register('ti99.configureToolchain', doConfigureToolchain);
    register('ti99.convertSyntax', doConvertSyntax);
    register('ti99.detectDialect', doDetectDialect);
    register('ti99.checkHazards', doCheckHazards);
    register('ti99.showListing', doShowListing);
    register('ti99.showMemoryMap', doShowMemoryMap);
    register('ti99.showDiskCatalog', doShowDiskCatalog);
    register('ti99.exportToHardware', doExportToHardware);
}

function stem(project: Project): string {
    return project.config.name.replace(/[^\w.-]/g, '_');
}

async function requireReady(): Promise<Project | undefined> {
    if (!vscode.workspace.isTrusted) {
        void vscode.window.showErrorMessage('Building runs local programs, which requires a trusted workspace.');
        return undefined;
    }

    const project = await projects.require();
    if (!project) return undefined;

    if (!toolchain.ready) {
        const choice = await vscode.window.showErrorMessage(
            toolchain.problems[0] ?? 'The toolchain is not configured.',
            'Configure Toolchain', 'Show Status');
        if (choice === 'Configure Toolchain') await doConfigureToolchain();
        if (choice === 'Show Status') output.show(true);
        return undefined;
    }

    return project;
}

/** The target chosen for the last build, so Run launches what was built. */
let lastTarget: string | undefined;

/** A Project whose config is the named target merged onto the base. */
function forTarget(project: Project, target?: string): Project {
    if ((project.config.targets ?? []).length === 0) return project;
    return { ...project, config: resolveTarget(project.config, target) };
}

async function pickTarget(project: Project, title: string): Promise<string | undefined> {
    const targets = project.config.targets ?? [];
    if (targets.length === 0) return undefined;
    if (targets.length === 1) return targets[0].id;

    const picked = await vscode.window.showQuickPick(
        targets.map(t => ({
            label: t.label ?? t.id,
            description: t.id,
            detail: t.description ?? `${(t.outputs ?? project.config.outputs).join(', ')} -> ${t.distDir ?? project.config.distDir}`,
            id: t.id,
        })),
        { title, matchOnDetail: true });
    return picked?.id;
}

async function doBuild(options: { rebuild: boolean; target?: string }): Promise<boolean> {
    const project = await requireReady();
    if (!project) return false;

    const resolved = forTarget(project, options.target);
    lastTarget = options.target;

    activeBuild?.cancel();
    const token = new Cancellation();
    activeBuild = token;

    output.clear();
    output.show(true);
    const label = options.target ? `${project.config.name} [${options.target}]` : project.config.name;
    output.appendLine(`${options.rebuild ? 'Rebuilding' : 'Building'} ${label}`);
    output.appendLine(`  dialect  ${DIALECTS[resolved.config.syntaxDialect].label}`);
    output.appendLine(`  outputs  ${resolved.config.outputs.join(', ')}`);

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `TI-99: building ${label}`,
        cancellable: true,
    }, async (_progress, cancelToken) => {
        cancelToken.onCancellationRequested(() => token.cancel());
        statusBar.building('Building');

        const result = await coordinator.build(
            project, toolchain, { rebuild: options.rebuild, target: options.target }, token);
        lastBuild = result;
        activeBuild = undefined;

        statusBar.built(result.success, result.durationMs);
        artifactsView.set(result.artifacts);

        const equ = path.resolve(resolved.root.fsPath, resolved.config.buildDir, `${stem(resolved)}.equ`);
        if (fs.existsSync(equ)) symbolsView.loadFromEquFile(equ);

        if (result.success) {
            const warning = EmulatorLauncher.checkClassic99Naming(resolved, result.artifacts);
            if (warning) void vscode.window.showWarningMessage(`TI-99: ${warning}`);
            void refreshDiskCatalog(resolved, result.artifacts);
        } else if (!result.cancelled) {
            void vscode.window
                .showErrorMessage('TI-99: build failed. See the Problems panel.', 'Show Output')
                .then(c => { if (c === 'Show Output') output.show(true); });
        }

        return result.success;
    });
}

/** Build one route, chosen from the picker. */
async function doBuildTarget(rebuild: boolean, target?: string): Promise<boolean> {
    const project = await requireReady();
    if (!project) return false;

    const ids = targetIds(project.config);
    if (ids.length === 0) {
        void vscode.window.showInformationMessage(
            'This project defines no targets. Use TI-99: Build.');
        return doBuild({ rebuild });
    }

    // A caller may name the route - a task, a keybinding, another command -
    // in which case there is nothing to ask.
    if (target) {
        if (!ids.includes(target)) {
            void vscode.window.showErrorMessage(
                `TI-99: unknown target '${target}'. This project defines: ${ids.join(', ')}.`);
            return false;
        }
        return doBuild({ rebuild, target });
    }

    const picked = await pickTarget(project, 'Which distribution route?');
    if (!picked) return false;
    return doBuild({ rebuild, target: picked });
}

/**
 * Build every route in declaration order.
 *
 * One failure stops the run: a half-built distribution set is more misleading
 * than an obvious stop, and the output channel already names the target that
 * failed.
 */
async function doBuildAll(rebuild: boolean): Promise<boolean> {
    const project = await requireReady();
    if (!project) return false;

    const ids = targetIds(project.config);
    if (ids.length === 0) return doBuild({ rebuild });

    const done: string[] = [];
    for (const id of ids) {
        const ok = await doBuild({ rebuild, target: id });
        if (!ok) {
            void vscode.window.showErrorMessage(
                `TI-99: target '${id}' failed. Built: ${done.join(', ') || 'none'}.`);
            return false;
        }
        done.push(id);
    }

    void vscode.window.showInformationMessage(
        `TI-99: built ${done.length} target(s) — ${done.join(', ')}.`);
    return true;
}

async function doClean(): Promise<boolean> {
    const project = await projects.require();
    if (!project) return false;

    output.clear();
    output.show(true);
    await coordinator.clean(project);
    artifactsView.clear();
    symbolsView.clear();
    diskView.clear();
    lastBuild = undefined;
    return true;
}

async function doRun(artifacts: Artifact[] | undefined): Promise<boolean> {
    const base = await projects.require();
    if (!base) return false;

    // Launch the route that was actually built. Each target carries its own
    // emulator profile, so using the base config here would pick the wrong one.
    const project = forTarget(base, lastTarget);

    const available = artifacts ?? lastBuild?.artifacts ?? [];
    if (available.length === 0) {
        const choice = await vscode.window.showWarningMessage('Nothing has been built yet.', 'Build and Run');
        if (choice === 'Build and Run') return doBuildAndRun();
        return false;
    }

    const profile = await launcher.pick(project, available);
    if (!profile) return false;
    return launcher.launch(profile, project, available);
}

async function doBuildAndRun(): Promise<boolean> {
    const project = await requireReady();
    if (!project) return false;

    // Running needs one specific route: each target has its own emulator
    // profile and its own artifacts.
    const target = (project.config.targets ?? []).length
        ? await pickTarget(project, 'Which route do you want to run?')
        : undefined;
    if ((project.config.targets ?? []).length && !target) return false;

    const ok = await doBuild({ rebuild: false, target });
    if (!ok) return false;
    return doRun(lastBuild?.artifacts);
}

async function doToolchainStatus(context: vscode.ExtensionContext): Promise<void> {
    toolchain = await discover(context);
    statusBar.update(projects, toolchain);
    output.clear();
    output.appendLine(describeState(toolchain));
    output.show(true);
}

interface ConfigChoice extends vscode.QuickPickItem {
    setting: string;
    url: string;
}

async function doConfigureToolchain(): Promise<void> {
    const choice = await vscode.window.showQuickPick<ConfigChoice>([
        { label: 'Set the Python interpreter', setting: 'ti99.toolchain.pythonPath', url: '' },
        { label: 'Set the xdt99 directory', setting: 'ti99.toolchain.xdt99Path', detail: 'The folder containing xas99.py and xdm99.py', url: '' },
        { label: 'Set the Classic99 path', setting: 'ti99.emulator.classic99Path', url: '' },
        { label: 'Set the MAME path', setting: 'ti99.emulator.mamePath', url: '' },
        { label: 'Open all TI-99 settings', setting: 'ti99', url: '' },
        { label: 'Where do I get xdt99?', setting: '', url: 'https://github.com/endlos99/xdt99' },
    ], { title: 'Configure the TI-99 toolchain' });
    if (!choice) return;

    if (choice.url) {
        await vscode.env.openExternal(vscode.Uri.parse(choice.url));
        return;
    }
    await vscode.commands.executeCommand('workbench.action.openSettings', choice.setting);
}

interface ModeChoice extends vscode.QuickPickItem {
    value: 'minimal' | 'reformat';
}

async function doConvertSyntax(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== LANGUAGE_ID) {
        void vscode.window.showWarningMessage('Open a TMS9900 assembly file first.');
        return;
    }

    const doc = editor.document;
    const hazards = findDialectHazards(doc.getText());

    const mode = await vscode.window.showQuickPick<ModeChoice>([
        {
            label: `Fix only the ${hazards.length} hazard line${hazards.length === 1 ? '' : 's'}`,
            detail: 'Widens the blank before the comment and changes nothing else. Keeps the diff reviewable.',
            value: 'minimal',
        },
        {
            label: 'Reformat the whole file',
            detail: 'Also realigns every label, opcode, operand and comment to the configured columns.',
            value: 'reformat',
        },
    ], {
        title: hazards.length ? `${hazards.length} line(s) need fixing` : 'No hazards found',
        matchOnDetail: true,
    });
    if (!mode) return;

    const converted = convertEaToXdt99(doc.getText(), formatOptions(doc), mode.value);
    if (converted === doc.getText()) {
        void vscode.window.showInformationMessage('TI-99: nothing to change.');
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), converted);
    await vscode.workspace.applyEdit(edit);

    const project = projects.active;
    if (project && project.config.syntaxDialect === 'ea') {
        const choice = await vscode.window.showInformationMessage(
            'Converted. Switch the project to xas99 extended syntax to drop the -s flag?',
            'Switch', 'Not yet');
        if (choice === 'Switch') {
            project.config.syntaxDialect = 'xdt99';
            await vscode.workspace.fs.writeFile(
                project.configUri,
                Buffer.from(JSON.stringify(project.config, null, 2) + '\n', 'utf8'));
        }
    }
}

async function doDetectDialect(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const result = detectDialect(editor.document.getText());
    const info = DIALECTS[result.dialect];

    const choice = await vscode.window.showInformationMessage(
        `Detected: ${info.label} (${Math.round(result.confidence * 100)}% confidence).\n\n${result.reason}`,
        { modal: true },
        'Apply to project', 'Apply to workspace settings');
    if (!choice) return;

    if (choice === 'Apply to project' && projects.active) {
        projects.active.config.syntaxDialect = result.dialect;
        await vscode.workspace.fs.writeFile(
            projects.active.configUri,
            Buffer.from(JSON.stringify(projects.active.config, null, 2) + '\n', 'utf8'));
    } else {
        await vscode.workspace
            .getConfiguration('ti99')
            .update('syntaxDialect', result.dialect, vscode.ConfigurationTarget.Workspace);
    }
}

function doCheckHazards(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const hazards = findDialectHazards(editor.document.getText());
    output.clear();
    output.appendLine(`Dialect hazard scan: ${editor.document.fileName}`);
    output.appendLine('');

    if (hazards.length === 0) {
        output.appendLine('No hazards. This file assembles under xas99 default syntax.');
    } else {
        output.appendLine(`${hazards.length} line(s) require -s (strict), or conversion:`);
        output.appendLine('');
        for (const h of hazards) {
            output.appendLine(`  line ${String(h.line + 1).padStart(5)}  ${editor.document.lineAt(h.line).text.trimEnd()}`);
        }
        output.appendLine('');
        output.appendLine('Run "TI-99: Convert Source to xas99 Syntax" to fix them.');
    }
    output.show(true);
}

async function doShowListing(): Promise<void> {
    const project = await projects.require();
    if (!project) return;

    const listing = path.resolve(project.root.fsPath, project.config.buildDir, `${stem(project)}.lst`);
    if (!fs.existsSync(listing)) {
        void vscode.window.showWarningMessage('No listing yet. Build the project first.');
        return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(listing));
    await vscode.window.showTextDocument(doc, { preview: true });
}

async function doShowMemoryMap(): Promise<void> {
    const project = await projects.require();
    if (!project) return;

    const equ = path.resolve(project.root.fsPath, project.config.buildDir, `${stem(project)}.equ`);
    if (!fs.existsSync(equ)) {
        void vscode.window.showWarningMessage('No symbol file yet. Build the project first.');
        return;
    }
    symbolsView.loadFromEquFile(equ);
    await vscode.commands.executeCommand('ti99.symbols.focus');
}

async function refreshDiskCatalog(project: Project, artifacts: Artifact[]): Promise<void> {
    const disk = artifacts.find(a => a.kind === 'disk-image');
    if (!disk || !toolchain.tool || !toolchain.python) return;

    const result = await run({
        program: toolchain.python.path,
        args: [path.join(toolchain.tool.directory, 'xdm99.py'), disk.path],
        cwd: project.root.fsPath,
    });
    if (result.exitCode === 0) diskView.parseCatalog(result.stdout);
}

async function doShowDiskCatalog(): Promise<void> {
    const project = await projects.require();
    if (!project) return;

    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        title: 'Select a disk image',
        filters: { 'TI disk images': ['dsk', 'DSK', 'hfe'] },
        defaultUri: vscode.Uri.file(path.resolve(project.root.fsPath, project.config.distDir)),
    });
    if (!picked?.[0] || !toolchain.tool || !toolchain.python) return;

    const result = await run({
        program: toolchain.python.path,
        args: [path.join(toolchain.tool.directory, 'xdm99.py'), picked[0].fsPath],
        cwd: project.root.fsPath,
    });

    if (result.exitCode === 0) {
        diskView.parseCatalog(result.stdout);
        await vscode.commands.executeCommand('ti99.disk.focus');
    } else {
        void vscode.window.showErrorMessage(`Could not read the disk image: ${result.stderr.trim()}`);
    }
}

interface ExportChoice extends vscode.QuickPickItem {
    artifactKind: Capability;
}

async function doExportToHardware(): Promise<void> {
    const project = await projects.require();
    if (!project) return;

    const artifacts = lastBuild?.artifacts ?? [];
    if (artifacts.length === 0) {
        void vscode.window.showWarningMessage('Build the project before exporting.');
        return;
    }

    const target = await vscode.window.showQuickPick<ExportChoice>([
        { label: 'FinalGROM 99', detail: 'Cartridge binary onto an SD card. Needs the 8/3/C/G naming convention.', artifactKind: 'cart-bin' },
        { label: 'FlashROM 99', detail: 'Cartridge binary onto an SD card.', artifactKind: 'cart-bin' },
        { label: 'Disk image to a folder', detail: 'For a real controller or an HxC drive.', artifactKind: 'disk-image' },
        { label: 'TIFILES to a folder', detail: 'Individual files for FIAD-style transfer.', artifactKind: 'tifiles' },
    ], { title: 'Export to real hardware', matchOnDetail: true });
    if (!target) return;

    const artifact = artifacts.find(a => a.kind === target.artifactKind);
    if (!artifact) {
        void vscode.window.showWarningMessage(
            `This project does not produce a ${target.artifactKind} artifact. Add it to "outputs" in ti99.json.`);
        return;
    }

    const destination = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        title: `Copy ${path.basename(artifact.path)} to`, openLabel: 'Export here',
    });
    if (!destination?.[0]) return;

    const to = path.join(destination[0].fsPath, path.basename(artifact.path));
    try {
        fs.copyFileSync(artifact.path, to);
        void vscode.window.showInformationMessage(`Exported to ${to}`);
        output.appendLine(`Exported ${artifact.path} -> ${to}`);
    } catch (err) {
        void vscode.window.showErrorMessage(`Export failed: ${(err as Error).message}`);
    }
}
