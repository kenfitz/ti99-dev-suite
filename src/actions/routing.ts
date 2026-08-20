/**
 * VS Code glue for the action resolver.
 *
 * Everything decision-shaped lives in resolver.ts, which imports no vscode
 * and is unit tested. This file only turns editor state into a ResolveContext,
 * shows pickers, and calls back. Keeping the split means the routing rules can
 * be tested without an editor host, and it stops menu behaviour and palette
 * behaviour from being written twice.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ProjectConfig, SourceLanguage } from "../config/project";
import {
    ActionPlan, ResolveContext, artifactIsCurrent, contextKeysFor, defaultTargetFor,
    resolveActions, resolveTargets, toPosix,
} from "./resolver";
import { LanguageId, findLanguage, labelOf } from "./languages";
import { ActionKind, TargetDefinition } from "./targets";

/** Remembered dialect choices for ambiguous files, keyed by path. */
let memento: vscode.Memento | undefined;

export function initRouting(context: vscode.ExtensionContext): void {
    memento = context.workspaceState;
}

function rememberedDialect(file: string): LanguageId | undefined {
    return memento?.get<LanguageId>("dialect:" + file.toLowerCase());
}

async function rememberDialect(file: string, language: LanguageId): Promise<void> {
    await memento?.update("dialect:" + file.toLowerCase(), language);
}

/** A per-file language override from settings, if the user set one. */
function fileOverride(uri: vscode.Uri): LanguageId | undefined {
    const configured = vscode.workspace
        .getConfiguration("ti99", uri)
        .get<Record<string, string>>("languageOverrides") ?? {};
    const wanted = toPosix(uri.fsPath).toLowerCase();
    for (const [pattern, language] of Object.entries(configured)) {
        const p = toPosix(pattern).toLowerCase();
        if (wanted === p || wanted.endsWith("/" + p)) { return language as LanguageId; }
    }
    return undefined;
}

/** True when a setting has a usable value. */
function isConfigured(key: string): boolean {
    const dot = key.lastIndexOf(".");
    const section = key.slice(0, dot);
    const name = key.slice(dot + 1);
    const value = vscode.workspace.getConfiguration(section).get<string>(name);
    return typeof value === "string" && value.trim().length > 0;
}

/** Build the context the resolver needs from the editor world. */
export function contextFor(uri: vscode.Uri, project?: ProjectConfig): ResolveContext {
    return {
        project,
        readSource: p => {
            try {
                const full = path.isAbsolute(p) ? p : uri.fsPath;
                return fs.readFileSync(full, "utf8");
            } catch {
                return undefined;
            }
        },
        isConfigured,
        fileOverride: fileOverride(uri),
        rememberedDialect: rememberedDialect(uri.fsPath),
    };
}

export function planFor(uri: vscode.Uri, project?: ProjectConfig): ActionPlan {
    return resolveActions(uri.fsPath, contextFor(uri, project));
}

/**
 * Keep the context keys in step with what is selected.
 *
 * These drive every when clause, so a TI menu appears only on a TI file. The
 * keys go stale rather than wrong when nothing is selected: everything clears.
 */
export async function updateContextKeys(
    uri: vscode.Uri | undefined, project?: ProjectConfig,
): Promise<void> {
    const keys = uri
        ? contextKeysFor(planFor(uri, project))
        : {
            "ti99.language": "", "ti99.isEntrySource": false,
            "ti99.hasContainingTarget": false, "ti99.canBuild": false,
            "ti99.canRun": false, "ti99.canPackage": false,
        };
    for (const [key, value] of Object.entries(keys)) {
        await vscode.commands.executeCommand("setContext", key, value);
    }
}

/**
 * Ask which BASIC dialect a file is, and optionally remember the answer.
 *
 * Asking is the honest option. Absence of Extended BASIC syntax does not prove
 * TI BASIC, because every valid TI BASIC program is also valid Extended BASIC,
 * so there is nothing to infer from.
 */
export async function askDialect(uri: vscode.Uri): Promise<LanguageId | undefined> {
    const name = path.basename(uri.fsPath);
    const picked = await vscode.window.showQuickPick(
        [
            { label: "TI BASIC", id: "ti-basic" as LanguageId,
              detail: "Runs on an unexpanded console with no cartridge." },
            { label: "TI Extended BASIC", id: "ti-extended-basic" as LanguageId,
              detail: "Needs the Extended BASIC cartridge." },
        ],
        { title: "Which BASIC dialect is " + name + "?", matchOnDetail: true });
    if (!picked) { return undefined; }

    const scope = await vscode.window.showQuickPick(
        [
            { label: "Use once", id: "once" },
            { label: "Remember for this file", id: "file" },
        ],
        { title: "Remember this choice?" });
    if (scope?.id === "file") {
        await rememberDialect(uri.fsPath, picked.id);
    }
    return picked.id;
}

/**
 * Choose a target for an action.
 *
 * Only targets that accept the language appear. One that is compatible but
 * unconfigured stays visible carrying the setting to fix, because hiding it
 * leaves the user wondering where their route went, and offering it silently
 * would fail later with a process error.
 */
export async function pickTargetFor(
    language: LanguageId, action: ActionKind, ctx: ResolveContext,
    sourcePath?: string, title?: string,
): Promise<TargetDefinition | undefined> {
    const choices = resolveTargets(language, action, ctx);
    if (choices.length === 0) {
        vscode.window.showInformationMessage(
            "No " + labelOf(language) + " target supports that action yet.");
        return undefined;
    }

    interface Item extends vscode.QuickPickItem { target: TargetDefinition; missing: string[] }
    const items: Item[] = choices.map(c => ({
        label: (c.availability.available ? "" : "$(warning) ") + c.target.label,
        description: c.isDefault ? "default" : undefined,
        detail: c.availability.available
            ? c.target.description
            : c.target.description + "  --  needs " + c.availability.missing.join(", "),
        target: c.target,
        missing: c.availability.missing,
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: title ?? ("How should " + path.basename(sourcePath ?? "") + " run?"),
        matchOnDetail: true,
    });
    if (!picked) { return undefined; }

    if (picked.missing.length > 0) {
        const fix = "Configure";
        const answer = await vscode.window.showWarningMessage(
            picked.target.label + " needs " + picked.missing.join(" and ") + ".",
            fix);
        if (answer === fix) {
            await vscode.commands.executeCommand("ti99.configureToolchain");
        }
        return undefined;
    }
    return picked.target;
}

/** Resolve a target without asking, when the default is unambiguous. */
export function defaultTarget(
    language: LanguageId, ctx: ResolveContext, sourcePath?: string,
): string | undefined {
    return defaultTargetFor(language, ctx, sourcePath);
}

/**
 * Pick which source a generic command applies to.
 *
 * With one runnable entry there is nothing to ask. With several, the list
 * shows the resolved language beside each name, because "game.a99" and
 * "loader.xb99" are answered differently and the user needs to see which is
 * which. Modules never appear: they are not programs.
 */
export async function pickSource(
    candidates: vscode.Uri[], project?: ProjectConfig,
): Promise<vscode.Uri | undefined> {
    const runnable = candidates.filter(u => {
        const plan = planFor(u, project);
        return plan.source.role !== "module" && !plan.language.ambiguous;
    });
    if (runnable.length === 1) { return runnable[0]; }
    if (runnable.length === 0) { return undefined; }

    interface Item extends vscode.QuickPickItem { uri: vscode.Uri }
    const items: Item[] = runnable.map(u => {
        const plan = planFor(u, project);
        const lang = plan.language.language;
        return {
            label: path.basename(u.fsPath),
            description: lang ? labelOf(lang) : "",
            detail: vscode.workspace.asRelativePath(u),
            uri: u,
        };
    });
    const picked = await vscode.window.showQuickPick(items, {
        title: "Select program or source", matchOnDetail: true,
    });
    return picked?.uri;
}

/**
 * Whether the artifact for a target is newer than its sources.
 *
 * Run means run what was built. Launching a stale artifact shows yesterday
 * behaviour and blames today code, so a stale one is reported rather than
 * quietly used.
 */
export function artifactCurrent(artifact: string, sources: string[]): boolean {
    const mtime = (p: string) => {
        try { return fs.statSync(p).mtimeMs; } catch { return undefined; }
    };
    const newest = sources
        .map(mtime)
        .filter((n): n is number => n !== undefined)
        .reduce((a, b) => Math.max(a, b), 0);
    return artifactIsCurrent(mtime(artifact), newest || undefined);
}

/** Offer to rebuild rather than run something out of date. */
export async function offerRebuild(name: string): Promise<boolean> {
    const build = "Build and Run";
    const answer = await vscode.window.showWarningMessage(
        name + " has changed since the last successful build.",
        { modal: false }, build, "Cancel");
    return answer === build;
}

/**
 * Offer to rename a file to the canonical extension for its language.
 *
 * An offer, never automatic, and never an error. A .b99 file holding Extended
 * BASIC is perfectly valid, since xdt99 writes .b99 for both dialects; the
 * rename is only a tidiness suggestion for people who want the newer naming.
 */
export async function offerCanonicalRename(
    uri: vscode.Uri, language: LanguageId,
): Promise<vscode.Uri | undefined> {
    const canonical = findLanguage(language).canonicalExtension;
    const current = path.extname(uri.fsPath).toLowerCase();
    if (current === canonical) { return undefined; }

    const target = uri.with({ path: uri.path.slice(0, uri.path.length - current.length) + canonical });
    const suggested = path.basename(target.fsPath);
    const rename = "Rename";
    const never = "Do Not Ask Again";
    const answer = await vscode.window.showInformationMessage(
        "This " + labelOf(language) + " source uses " + current + ". New " +
        labelOf(language) + " projects use " + canonical + ".",
        rename, "Keep " + current, never);

    if (answer === never) {
        await memento?.update("noRenamePrompt:" + uri.fsPath.toLowerCase(), true);
        return undefined;
    }
    if (answer !== rename) { return undefined; }

    await vscode.workspace.fs.rename(uri, target, { overwrite: false });
    vscode.window.showInformationMessage("Renamed to " + suggested +
        ". Update ti99.json if it names the old path.");
    return target;
}

export function shouldOfferRename(uri: vscode.Uri): boolean {
    return memento?.get<boolean>("noRenamePrompt:" + uri.fsPath.toLowerCase()) !== true;
}

export { resolveTargets, defaultTargetFor };
export type { ActionPlan, SourceLanguage };
