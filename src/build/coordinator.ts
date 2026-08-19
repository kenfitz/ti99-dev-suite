import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

import { expandArgs } from '../toolchain/profiles';
import { run, verifyArtifact } from '../toolchain/runner';
import type { ToolCommand } from '../toolchain/profiles';
import type { Cancellation, RunResult } from '../toolchain/runner';
import type { ToolchainState } from '../toolchain/discovery';
import { parseXas99, parseXdm99 } from './diagnostics';
import type { ParsedDiagnostic } from './diagnostics';
import { DIALECTS } from '../lang/dialect';
import type { Project } from '../config/loader';
import type { Capability, UnresolvedPolicy } from '../config/project';

export interface Artifact {
    id: string;
    kind: Capability;
    path: string;
    displayName: string;
    size: number;
    createdAt: Date;
    /** True when an emulator profile could be handed this file. */
    runnable: boolean;
}

export interface BuildStep {
    capability: Capability;
    result: RunResult;
    ok: boolean;
    reason?: string;
}

export interface BuildResult {
    success: boolean;
    cancelled: boolean;
    artifacts: Artifact[];
    diagnostics: ParsedDiagnostic[];
    durationMs: number;
    steps: BuildStep[];
}

export interface BuildOptions {
    rebuild?: boolean;
    /** Build only these capabilities instead of the project's full output set. */
    only?: Capability[];
}

export class BuildCoordinator {
    private cache = new Map<Capability, string>();

    constructor(
        private readonly output: vscode.OutputChannel,
        private readonly diagnostics: vscode.DiagnosticCollection,
    ) {}

    invalidate(): void {
        this.cache.clear();
    }

    async build(
        project: Project,
        toolchain: ToolchainState,
        options: BuildOptions = {},
        token?: Cancellation,
    ): Promise<BuildResult> {
        const started = Date.now();
        const steps: BuildStep[] = [];
        const artifacts: Artifact[] = [];
        const allDiagnostics: ParsedDiagnostic[] = [];

        if (options.rebuild) this.invalidate();

        const blocking = project.issues.filter(i => i.severity === 'error');
        if (blocking.length) {
            this.output.appendLine('Build aborted: project configuration is not valid.');
            for (const issue of blocking) {
                this.output.appendLine(`  ${issue.field}: ${issue.message}`);
                if (issue.fix) this.output.appendLine(`    try: ${issue.fix}`);
            }
            return { success: false, cancelled: false, artifacts, diagnostics: [], durationMs: 0, steps };
        }

        if (!toolchain.ready || !toolchain.tool || !toolchain.python) {
            this.output.appendLine('Build aborted: the toolchain is not ready.');
            for (const p of toolchain.problems) this.output.appendLine(`  ${p}`);
            return { success: false, cancelled: false, artifacts, diagnostics: [], durationMs: 0, steps };
        }

        const wanted = options.only ?? project.config.outputs;
        const profile = toolchain.tool.profile;

        const unsupported = wanted.filter(c => !profile.capabilities.includes(c));
        if (unsupported.length) {
            this.output.appendLine(
                `Build aborted: ${profile.displayName} cannot produce ${unsupported.join(', ')}. ` +
                `It provides ${profile.capabilities.join(', ')}.`);
            return { success: false, cancelled: false, artifacts, diagnostics: [], durationMs: 0, steps };
        }

        await this.ensureDirs(project);
        this.diagnostics.clear();

        for (const capability of wanted) {
            if (token?.cancelled) {
                return { success: false, cancelled: true, artifacts, diagnostics: allDiagnostics, durationMs: Date.now() - started, steps };
            }

            const command = profile.commands[capability];
            if (!command) {
                this.output.appendLine(`Skipping ${capability}: no command defined in profile ${profile.id}.`);
                continue;
            }

            const { program, args, outputPath } = this.resolve(project, toolchain, capability, command);
            const hash = this.hashStep(project, program, args);

            if (!options.rebuild && this.cache.get(capability) === hash && verifyArtifact(outputPath).ok) {
                this.output.appendLine(`${capability}: up to date`);
                artifacts.push(this.describeArtifact(capability, outputPath));
                continue;
            }

            this.output.appendLine('');
            this.output.appendLine(`> ${capability}`);

            const result = await run({
                program,
                args,
                cwd: project.root.fsPath,
                onOutput: chunk => this.output.append(chunk),
            }, token);

            this.output.appendLine(`  ${result.displayCommand}`);
            this.output.appendLine(`  exit ${result.exitCode} in ${result.durationMs} ms`);

            const parsed = command.problemMatcher === 'xdm99'
                ? parseXdm99(result.stderr)
                : parseXas99(result.stderr, path.basename(project.config.entrySource));

            allDiagnostics.push(...parsed.diagnostics);
            this.publish(project, parsed.diagnostics);

            if (result.cancelled) {
                return { success: false, cancelled: true, artifacts, diagnostics: allDiagnostics, durationMs: Date.now() - started, steps };
            }

            // Exit code alone is not sufficient: a tool can return 0 and write nothing.
            const artifactCheck = result.exitCode === 0
                ? verifyArtifact(outputPath)
                : { ok: false, reason: undefined };
            const ok = result.exitCode === 0 && artifactCheck.ok;
            steps.push({ capability, result, ok, reason: artifactCheck.reason });

            if (!ok) {
                if (artifactCheck.reason) this.output.appendLine(`  ${artifactCheck.reason}`);
                this.output.appendLine(`  ${parsed.uniqueErrorCount} error(s), ${parsed.uniqueWarningCount} warning(s)`);
                this.cache.delete(capability);
                return { success: false, cancelled: false, artifacts, diagnostics: allDiagnostics, durationMs: Date.now() - started, steps };
            }

            this.cache.set(capability, hash);
            if (outputPath) artifacts.push(this.describeArtifact(capability, outputPath));
        }

        // Disk projects assemble first, then the image is populated.
        if (project.config.type === 'disk' && project.config.disk) {
            const added = await this.populateDisk(project, toolchain, artifacts, token);
            if (!added) {
                return { success: false, cancelled: false, artifacts, diagnostics: allDiagnostics, durationMs: Date.now() - started, steps };
            }
        }

        const durationMs = Date.now() - started;
        this.output.appendLine('');
        this.output.appendLine(`Build succeeded in ${durationMs} ms — ${artifacts.length} artifact(s).`);
        for (const a of artifacts) {
            this.output.appendLine(`  ${a.kind.padEnd(12)} ${a.path}  (${a.size} bytes)`);
        }

        return { success: true, cancelled: false, artifacts, diagnostics: allDiagnostics, durationMs, steps };
    }

    async clean(project: Project): Promise<void> {
        const root = project.root.fsPath;

        // Hard guard: never delete outside the configured build and dist folders.
        for (const dir of [project.config.buildDir, project.config.distDir]) {
            const target = path.resolve(root, dir);
            if (!target.startsWith(root + path.sep)) {
                this.output.appendLine(`Refusing to clean ${target}: outside the project root.`);
                continue;
            }
            if (target === root) {
                this.output.appendLine('Refusing to clean the project root.');
                continue;
            }
            try {
                fs.rmSync(target, { recursive: true, force: true });
                this.output.appendLine(`Removed ${target}`);
            } catch (err) {
                this.output.appendLine(`Could not remove ${target}: ${(err as Error).message}`);
            }
        }

        this.invalidate();
        this.diagnostics.clear();
    }

    // -- internals ------------------------------------------------------------

    private async ensureDirs(project: Project): Promise<void> {
        for (const dir of [project.config.buildDir, project.config.distDir]) {
            fs.mkdirSync(path.resolve(project.root.fsPath, dir), { recursive: true });
        }
    }

    private outputPathFor(project: Project, capability: Capability): string {
        const { config } = project;
        const root = project.root.fsPath;
        const dist = path.resolve(root, config.distDir);
        const build = path.resolve(root, config.buildDir);
        const stem = config.name.replace(/[^\w.-]/g, '_');
        // TI filenames have no spaces or punctuation and are at most 10 characters.
        const tiStem = config.name.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10) || 'PROGRAM';

        switch (capability) {
            case 'cart-rpk': return path.join(dist, `${stem}.rpk`);
            case 'cart-bin': return path.join(dist, config.cartridge?.binFilename ?? `${tiStem.slice(0, 9)}C.BIN`);
            case 'ea5-image': return path.join(dist, tiStem);
            case 'ea3-object': return path.join(dist, `${tiStem.slice(0, 9)}O`);
            case 'disk-image': return path.join(dist, `${stem}.dsk`);
            case 'tifiles': return path.join(dist, `${tiStem}.tfi`);
            default: return path.join(build, `${stem}.${capability}`);
        }
    }

    private resolve(
        project: Project,
        toolchain: ToolchainState,
        capability: Capability,
        command: ToolCommand,
    ): { program: string; args: string[]; outputPath: string } {
        const { config } = project;
        const root = project.root.fsPath;
        const build = path.resolve(root, config.buildDir);
        const outputPath = this.outputPathFor(project, capability);
        const stem = config.name.replace(/[^\w.-]/g, '_');
        const tiStem = config.name.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 10) || 'PROGRAM';

        const variables = toolchain.tool!.profile.variables ?? {};
        const pick = (key: string, value: string): string => {
            const table = variables[key];
            if (table && typeof table === 'object') return table[value] ?? '';
            return typeof table === 'string' ? table : '';
        };

        const scalars: Record<string, string> = {
            python: toolchain.python!.path,
            tool: toolchain.tool!.directory,
            projectRoot: root,
            buildDir: build,
            distDir: path.resolve(root, config.distDir),
            output: outputPath,
            listing: path.join(build, `${stem}.lst`),
            symbolFile: path.join(build, `${stem}.equ`),
            dialectFlag: DIALECTS[config.syntaxDialect].assemblerFlag,
            registerFlag: pick('registerFlag', String(config.registerSymbols)),
            cpuFlag: pick('cpuFlag', config.processor),
            cartBase: config.cartridge?.baseAddress ?? '>6000',
            cartridgeName: config.cartridge?.name ?? config.name,
            diskGeometry: config.disk?.geometry ?? 'sssd',
            diskName: config.disk?.volumeName ?? tiStem,
        };

        const lists: Record<string, string[]> = {
            sources: config.sources.map(s => path.resolve(root, s)),
            includePaths: config.includePaths.map(p => path.resolve(root, p)),
        };

        const program = expandArgs([command.program], scalars)[0] ?? command.program;
        let args = expandArgs(command.args, scalars, lists);
        if (config.assembler.extraArgs.length) args = [...args, ...config.assembler.extraArgs];

        return { program, args, outputPath };
    }

    private hashStep(project: Project, program: string, args: string[]): string {
        const h = crypto.createHash('sha256');
        h.update(program);
        h.update('\0');
        h.update(args.join('\0'));

        // Sources and resolved includes. Argv is part of the hash so that changing
        // -R or the dialect flag invalidates the cache without touching a file.
        for (const source of project.config.sources) {
            const p = path.resolve(project.root.fsPath, source);
            try {
                const st = fs.statSync(p);
                h.update(`${p}:${st.mtimeMs}:${st.size}`);
            } catch {
                h.update(`${p}:missing`);
            }
        }
        for (const include of this.includeClosure(project)) {
            try {
                const st = fs.statSync(include);
                h.update(`${include}:${st.mtimeMs}:${st.size}`);
            } catch { /* an include that has gone missing will fail the build anyway */ }
        }

        return h.digest('hex');
    }

    /** Transitive COPY closure, resolved against include paths and TI-style names. */
    private includeClosure(project: Project): string[] {
        const root = project.root.fsPath;
        const searchPaths = [root, ...project.config.includePaths.map(p => path.resolve(root, p))];
        const seen = new Set<string>();
        const queue = project.config.sources.map(s => path.resolve(root, s));

        while (queue.length) {
            const file = queue.shift()!;
            if (seen.has(file)) continue;
            seen.add(file);

            let text: string;
            try {
                text = fs.readFileSync(file, 'utf8');
            } catch {
                continue;
            }

            for (const line of text.split(/\r?\n/)) {
                const m = /^\s*\S*\s+COPY\s+["']?([^"'\s]+)["']?/i.exec(line);
                if (!m) continue;
                const resolved = this.resolveInclude(m[1], path.dirname(file), searchPaths);
                if (resolved) queue.push(resolved);
            }
        }

        // The sources themselves are hashed separately.
        for (const s of project.config.sources) seen.delete(path.resolve(root, s));
        return [...seen];
    }

    /** Resolve a COPY operand, which may be a native path or a TI path. */
    private resolveInclude(operand: string, from: string, searchPaths: string[]): string | undefined {
        const tiPath = /^DSK\d?\.?(.+)$/i.exec(operand);
        const bases = tiPath ? [tiPath[1].replace(/\./g, path.sep)] : [operand];
        const extensions = ['', '.a99', '.asm', '.s', '.A99', '.ASM', '.S'];

        for (const dir of [from, ...searchPaths]) {
            for (const base of bases) {
                for (const ext of extensions) {
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

    private describeArtifact(kind: Capability, filePath: string): Artifact {
        let size = 0;
        let createdAt = new Date();
        try {
            const st = fs.statSync(filePath);
            size = st.size;
            createdAt = st.mtime;
        } catch { /* verifyArtifact already reported this */ }

        return {
            id: `${kind}:${filePath}`,
            kind,
            path: filePath,
            displayName: path.basename(filePath),
            size,
            createdAt,
            runnable: ['cart-rpk', 'cart-bin', 'ea5-image', 'ea3-object', 'disk-image'].includes(kind),
        };
    }

    /** Add build outputs to the disk image after it has been created. */
    private async populateDisk(
        project: Project,
        toolchain: ToolchainState,
        artifacts: Artifact[],
        token?: Cancellation,
    ): Promise<boolean> {
        const disk = artifacts.find(a => a.kind === 'disk-image');
        if (!disk || !project.config.disk) return true;

        for (const entry of project.config.disk.files) {
            const source = artifacts.find(a => a.kind === entry.artifact);
            if (!source) {
                this.output.appendLine(`Disk: no ${entry.artifact} artifact to add as ${entry.tiName}.`);
                continue;
            }

            // The image name must precede list options or argparse consumes it.
            const args = [
                path.join(toolchain.tool!.directory, 'xdm99.py'),
                disk.path,
                '-a', source.path,
                '-f', entry.format,
                '-n', entry.tiName,
            ];

            const result = await run(
                { program: toolchain.python!.path, args, cwd: project.root.fsPath, onOutput: c => this.output.append(c) },
                token);

            if (result.exitCode !== 0) {
                this.output.appendLine(`Disk: failed to add ${entry.tiName} (exit ${result.exitCode}).`);
                return false;
            }
            this.output.appendLine(`Disk: added ${entry.tiName} as ${entry.format}`);
        }
        return true;
    }

    private publish(project: Project, diagnostics: ParsedDiagnostic[]): void {
        const policy = vscode.workspace
            .getConfiguration('ti99.diagnostics')
            .get<UnresolvedPolicy>('unresolvedReferencePolicy', project.config.assembler.unresolvedReferencePolicy);

        const byFile = new Map<string, vscode.Diagnostic[]>();

        for (const d of diagnostics) {
            if (/^Unresolved references:/i.test(d.message)) {
                if (policy === 'ignore') continue;
            }

            if (!d.file || d.line === null) {
                this.output.appendLine(`  [${d.severity}] ${d.message}`);
                continue;
            }

            const uri = path.isAbsolute(d.file)
                ? vscode.Uri.file(d.file)
                : vscode.Uri.file(path.resolve(project.root.fsPath, d.file));

            const line = d.line - 1;
            const range = new vscode.Range(line, d.column, line, d.column + Math.max(1, d.length));

            let severity = d.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;

            if (/^Unresolved references:/i.test(d.message)) {
                severity = policy === 'error' ? vscode.DiagnosticSeverity.Error
                    : policy === 'information' ? vscode.DiagnosticSeverity.Information
                        : vscode.DiagnosticSeverity.Warning;
            }

            const vd = new vscode.Diagnostic(range, d.message, severity);
            vd.source = d.source;

            if (d.related.length) {
                vd.relatedInformation = d.related
                    .filter(r => r.line !== null)
                    .map(r => new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(uri, new vscode.Position(r.line! - 1, 0)),
                        `${r.name} defined here`));
            }

            const key = uri.toString();
            const list = byFile.get(key) ?? [];
            list.push(vd);
            byFile.set(key, list);
        }

        for (const [key, list] of byFile) {
            this.diagnostics.set(vscode.Uri.parse(key), list);
        }
    }
}
