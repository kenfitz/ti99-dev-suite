import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { DIALECTS } from '../lang/dialect';
import type { ProjectManager } from '../config/loader';
import type { Artifact } from '../build/coordinator';
import type { Capability } from '../config/project';

class Node extends vscode.TreeItem {
    children?: Node[];

    constructor(label: string, collapsibleState = vscode.TreeItemCollapsibleState.None) {
        super(label, collapsibleState);
    }
}

function leaf(label: string, value?: string, icon?: string, tooltip?: string): Node {
    const n = new Node(label);
    n.description = value;
    if (icon) n.iconPath = new vscode.ThemeIcon(icon);
    if (tooltip) n.tooltip = new vscode.MarkdownString(tooltip);
    return n;
}

function branch(label: string, children: Node[], icon?: string, expanded = false): Node {
    const n = new Node(label, children.length
        ? expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None);
    n.children = children;
    if (icon) n.iconPath = new vscode.ThemeIcon(icon);
    return n;
}

abstract class BaseProvider implements vscode.TreeDataProvider<Node> {
    private emitter = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData = this.emitter.event;

    refresh(): void { this.emitter.fire(undefined); }
    getTreeItem(node: Node): vscode.TreeItem { return node; }
    getChildren(node?: Node): Node[] { return node ? node.children ?? [] : this.roots(); }

    protected abstract roots(): Node[];
}

// ---------------------------------------------------------------------------

export class ProjectView extends BaseProvider {
    constructor(private readonly projects: ProjectManager) {
        super();
    }

    protected roots(): Node[] {
        const project = this.projects.active;
        if (!project) {
            const n = new Node('No TI-99 project in this workspace');
            n.iconPath = new vscode.ThemeIcon('info');
            n.command = { command: 'ti99.newProject', title: 'Create New Project' };
            return [n];
        }

        const c = project.config;
        const dialect = DIALECTS[c.syntaxDialect];

        const nodes: Node[] = [
            leaf('Name', c.name, 'symbol-property'),
            leaf('Type', c.type, 'package'),
            leaf('Dialect', dialect.label, 'law',
                `${dialect.description}\n\nAssembler flag: \`${dialect.assemblerFlag || '(none)'}\`\n\n` +
                `Comment field begins at ${dialect.commentRule}.`),
            leaf('Processor', c.processor, 'chip'),
            leaf('Toolchain', c.toolchainProfile, 'tools'),
        ];

        const entryNode = leaf('Entry', c.entrySource, 'debug-start');
        entryNode.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [vscode.Uri.file(path.resolve(project.root.fsPath, c.entrySource))],
        };
        nodes.push(entryNode);

        nodes.push(branch('Sources', c.sources.map(s => {
            const n = leaf(path.basename(s), path.dirname(s) === '.' ? '' : path.dirname(s), 'file-code');
            n.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(path.resolve(project.root.fsPath, s))],
            };
            return n;
        }), 'files'));

        nodes.push(branch('Include paths', c.includePaths.map(p => leaf(p, '', 'folder-library')), 'folder-library'));
        nodes.push(branch('Outputs', c.outputs.map(o => leaf(o, '', 'output')), 'output', true));

        if (c.cartridge) {
            nodes.push(branch('Cartridge', [
                leaf('Menu name', c.cartridge.name),
                leaf('Base address', c.cartridge.baseAddress),
                leaf('Banking', c.cartridge.banking),
                leaf('Classic99 filename', c.cartridge.binFilename ?? '(derived)'),
            ], 'circuit-board'));
        }

        if (c.disk) {
            nodes.push(branch('Disk', [
                leaf('Geometry', c.disk.geometry),
                leaf('Volume', c.disk.volumeName),
                ...c.disk.files.map(f => leaf(f.tiName, `${f.artifact} as ${f.format}`, 'file-binary')),
            ], 'save'));
        }

        nodes.push(leaf('Emulator', c.emulatorProfile ?? '(prompt)', 'play-circle'));

        if (project.issues.length) {
            nodes.push(branch('Problems', project.issues.map(i => {
                const n = leaf(i.field, i.message, i.severity === 'error' ? 'error' : 'warning');
                n.tooltip = i.fix ? `${i.message}\n\nTry: ${i.fix}` : i.message;
                return n;
            }), 'warning', true));
        }

        return nodes;
    }
}

// ---------------------------------------------------------------------------

export interface SymbolEntry {
    name: string;
    value?: number;
    kind: 'constant' | 'label';
}

export class SymbolsView extends BaseProvider {
    private symbols: SymbolEntry[] = [];

    /** Parse the -E EQU file, which reports values in hex. */
    loadFromEquFile(equPath: string): void {
        this.symbols = [];
        let text: string;
        try {
            text = fs.readFileSync(equPath, 'utf8');
        } catch {
            this.refresh();
            return;
        }

        for (const line of text.split(/\r?\n/)) {
            const m = /^(\S+)\s+EQU\s+>([0-9A-Fa-f]+)/.exec(line);
            if (!m) continue;
            this.symbols.push({ name: m[1], value: parseInt(m[2], 16), kind: 'constant' });
        }
        this.symbols.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
        this.refresh();
    }

    clear(): void { this.symbols = []; this.refresh(); }

    protected roots(): Node[] {
        if (this.symbols.length === 0) {
            const n = new Node('Build to populate the symbol table');
            n.iconPath = new vscode.ThemeIcon('info');
            return [n];
        }

        // Group by memory region so the layout is legible at a glance.
        const regions = [
            { label: 'Console ROM', from: 0x0000, to: 0x1FFF, icon: 'lock' },
            { label: 'Low RAM expansion', from: 0x2000, to: 0x3FFF, icon: 'symbol-array' },
            { label: 'Cartridge ROM', from: 0x6000, to: 0x7FFF, icon: 'circuit-board' },
            { label: 'Scratchpad / registers', from: 0x8000, to: 0x9FFF, icon: 'dashboard' },
            { label: 'High RAM expansion', from: 0xA000, to: 0xFFFF, icon: 'symbol-array' },
        ];

        const nodes: Node[] = [];
        for (const region of regions) {
            const inRegion = this.symbols.filter(s => s.value !== undefined && s.value >= region.from && s.value <= region.to);
            if (inRegion.length === 0) continue;

            const children = inRegion.map(s => {
                const hex = `>${(s.value ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
                const n = leaf(s.name, hex, 'symbol-constant');
                n.tooltip = `${s.name} = ${hex} (${s.value})`;
                return n;
            });

            const span = `${inRegion.length} symbol${inRegion.length === 1 ? '' : 's'}`;
            const node = branch(region.label, children, region.icon);
            node.description = span;
            nodes.push(node);
        }

        const other = this.symbols.filter(s => s.value === undefined);
        if (other.length) {
            nodes.push(branch('Unresolved', other.map(s => leaf(s.name, '', 'question')), 'question'));
        }

        return nodes;
    }
}

// ---------------------------------------------------------------------------

export class ArtifactsView extends BaseProvider {
    private artifacts: Artifact[] = [];

    set(artifacts: Artifact[]): void { this.artifacts = artifacts; this.refresh(); }
    clear(): void { this.artifacts = []; this.refresh(); }
    get all(): Artifact[] { return this.artifacts; }

    protected roots(): Node[] {
        if (this.artifacts.length === 0) {
            const n = new Node('No build artifacts yet');
            n.iconPath = new vscode.ThemeIcon('info');
            n.command = { command: 'ti99.build', title: 'Build' };
            return [n];
        }

        return this.artifacts.map(a => {
            const n = leaf(a.displayName, formatBytes(a.size), iconFor(a.kind));
            n.tooltip = new vscode.MarkdownString(
                `**${a.kind}**\n\n\`${a.path}\`\n\n${a.size} bytes, built ${a.createdAt.toLocaleTimeString()}`);
            n.contextValue = a.runnable ? 'ti99.runnableArtifact' : 'ti99.artifact';
            n.command = {
                command: 'revealFileInOS',
                title: 'Reveal',
                arguments: [vscode.Uri.file(a.path)],
            };
            return n;
        });
    }
}

function iconFor(kind: Capability): string {
    switch (kind) {
        case 'cart-rpk':
        case 'cart-bin': return 'circuit-board';
        case 'disk-image': return 'save';
        case 'ea5-image':
        case 'ea3-object': return 'file-binary';
        case 'listing': return 'list-flat';
        case 'symbols': return 'symbol-constant';
        default: return 'file';
    }
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    return `${(n / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------

export interface DiskHeader {
    volume: string;
    used: number;
    free: number;
    capacity: string;
    geometry: string;
}

export interface DiskEntry {
    name: string;
    sectors: number;
    type: string;
    bytes: number;
    records?: number;
    timestamp?: string;
}

export class DiskView extends BaseProvider {
    private header: DiskHeader | undefined;
    private entries: DiskEntry[] = [];

    /**
     * Parse xdm99 catalog output, which is fixed width:
     *
     *   SNAKE     :     81 used  279 free   90 KB  1S/1D 40T  9 S/T
     *   SNAKE        17  PROGRAM       3972 B             2026-07-26 20:24:16 C
     */
    parseCatalog(text: string): void {
        this.header = undefined;
        this.entries = [];

        for (const raw of text.split(/\r?\n/)) {
            const line = raw.replace(/\s+$/, '');
            if (!line || /^-+$/.test(line)) continue;

            const h = /^(\S+)\s*:\s+(\d+)\s+used\s+(\d+)\s+free\s+(\d+\s*\S+)\s+(.*)$/.exec(line);
            if (h) {
                this.header = {
                    volume: h[1], used: parseInt(h[2], 10), free: parseInt(h[3], 10),
                    capacity: h[4].trim(), geometry: h[5].trim(),
                };
                continue;
            }

            const e = /^(\S+)\s+(\d+)\s+(\S+(?:\/\S+)?(?:\s+\d+)?)\s+(\d+)\s*B(?:\s+(\d+)\s+recs)?\s*(.*)$/.exec(line);
            if (e) {
                this.entries.push({
                    name: e[1],
                    sectors: parseInt(e[2], 10),
                    type: e[3].trim(),
                    bytes: parseInt(e[4], 10),
                    records: e[5] ? parseInt(e[5], 10) : undefined,
                    timestamp: e[6]?.trim() || undefined,
                });
            }
        }
        this.refresh();
    }

    clear(): void { this.header = undefined; this.entries = []; this.refresh(); }

    protected roots(): Node[] {
        if (!this.header) {
            const n = new Node('No disk image loaded');
            n.iconPath = new vscode.ThemeIcon('info');
            return [n];
        }

        const total = this.header.used + this.header.free;
        const pct = total ? Math.round((this.header.used / total) * 100) : 0;

        const nodes: Node[] = [
            leaf('Volume', this.header.volume, 'save'),
            leaf('Geometry', this.header.geometry, 'settings'),
            leaf('Capacity', this.header.capacity, 'database'),
            leaf('Used', `${this.header.used} of ${total} sectors (${pct}%)`, 'pie-chart'),
        ];

        if (this.entries.length >= 127) {
            nodes.push(leaf('Warning', 'At the TI limit of 127 files', 'warning'));
        }
        if (this.header.free < 10) {
            nodes.push(leaf('Warning', `Only ${this.header.free} sectors free`, 'warning'));
        }

        nodes.push(branch('Files', this.entries.map(e => {
            const n = leaf(e.name, `${e.type}  ${e.bytes} B`, 'file-binary');
            n.tooltip = new vscode.MarkdownString(
                `**${e.name}**\n\n` +
                `Type: ${e.type}\n\nSize: ${e.bytes} bytes in ${e.sectors} sectors` +
                (e.records ? `\n\nRecords: ${e.records}` : '') +
                (e.timestamp ? `\n\n${e.timestamp}` : ''));
            return n;
        }), 'files', true));

        return nodes;
    }
}
