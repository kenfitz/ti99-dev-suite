/**
 * The central action resolver.
 *
 * Everything that offers the user a TI action goes through here: the Explorer
 * context menu, the Command Palette, the project tree, and whatever comes
 * later. There is deliberately no second path. If the menu and the palette
 * each worked out their own target list they would drift apart, and the one
 * that is wrong would be the one nobody tested.
 *
 * Nothing in this file imports vscode, so all of it can be tested directly.
 */

import { ProjectConfig, TargetConfig } from "../config/project";
import { LanguageId, LanguageResolution, findLanguage, resolveLanguage } from "./languages";
import { scanSource } from "./evidence";
import {
    ActionKind, Availability, TargetDefinition, availability, findTargetDefinition,
    targetsForAction, targetsForLanguage,
} from "./targets";

/** Everything the resolver needs to know about the world, supplied by the caller. */
export interface ResolveContext {
    /** The project containing the file, when there is one. */
    project?: ProjectConfig;
    /** Path of the project file, used to make paths relative. */
    projectDir?: string;
    /** Reads the source to look for dialect evidence. Omitted when not needed. */
    readSource?: (path: string) => string | undefined;
    /** Whether a setting has a usable value. */
    isConfigured?: (key: string) => boolean;
    /** A dialect the user chose earlier for this file. */
    rememberedDialect?: LanguageId;
    /** A per-file language override from settings. */
    fileOverride?: LanguageId;
}

/** Normalise Windows separators without writing an escape in this source. */
const WINDOWS_SEP = String.fromCharCode(92);
export function toPosix(p: string): string {
    return p.split(WINDOWS_SEP).join("/");
}

export type SourceRole = "entry" | "module" | "standalone" | "unknown";

export interface SourceResolution {
    path: string;
    role: SourceRole;
    /** Targets in the project whose sources include this file. */
    containingTargets: TargetConfig[];
}

/**
 * Work out what a file is to the project: the entry point of a target, one
 * module among several, or a file with no project around it.
 *
 * A project with many modules has exactly one entry per target, and the
 * others are not independently runnable. Offering Build and Run on
 * graphics.a99 as though it were a program is how a user ends up with a
 * confusing assembler error instead of a clear one.
 */
export function resolveSource(path: string, ctx: ResolveContext = {}): SourceResolution {
    const project = ctx.project;
    if (!project) {
        return { path, role: "standalone", containingTargets: [] };
    }

    const norm = (p: string) => toPosix(p).toLowerCase();
    const target = norm(path);
    const endsWith = (candidate?: string) =>
        candidate !== undefined && (norm(candidate) === target || target.endsWith("/" + norm(candidate)));

    const targets = project.targets ?? [];
    const containing = targets.filter(t => {
        const sources = t.sources ?? (t.entrySource ? [t.entrySource] : []);
        return sources.some(endsWith) || endsWith(t.entrySource) || endsWith(t.basicSource);
    });

    const isEntry =
        containing.some(t => endsWith(t.entrySource) || endsWith(t.basicSource)) ||
        (targets.length === 0 &&
            (endsWith(project.entrySource) || project.sources.some(endsWith)));

    if (isEntry) {
        return { path, role: "entry", containingTargets: containing };
    }
    if (containing.length > 0) {
        return { path, role: "module", containingTargets: containing };
    }
    // In the project folder but not named by it. Treat as standalone rather
    // than pretending it belongs to a target.
    const inProject = project.sources.some(endsWith);
    return {
        path,
        role: inProject ? "module" : "standalone",
        containingTargets: [],
    };
}

/**
 * Resolve the language of a file, gathering evidence only when it can matter.
 *
 * Reading the source costs something, so it happens only for BASIC files
 * whose dialect is genuinely in doubt: a neutral .bas, or a .b99 whose weak
 * presumption evidence could overturn. An .a99 never needs it.
 */
export function resolveFileLanguage(path: string, ctx: ResolveContext = {}): LanguageResolution {
    const projectLanguage = ctx.project?.language;
    const lower = path.toLowerCase();
    const mightBeBasic =
        lower.endsWith(".bas") || lower.endsWith(".b99") ||
        lower.endsWith(".xb99") || lower.endsWith(".xb");

    let extendedBasicProven = false;
    let evidenceDetail: string | undefined;

    const declared = ctx.fileOverride ?? projectLanguage;
    const needEvidence = mightBeBasic && ctx.readSource !== undefined &&
        (declared === undefined || declared === "ti-basic");

    if (needEvidence) {
        const text = ctx.readSource ? ctx.readSource(path) : undefined;
        if (text !== undefined) {
            const found = scanSource(text);
            extendedBasicProven = found.extendedBasicProven;
            evidenceDetail = found.detail;
        }
    }

    return resolveLanguage({
        path,
        fileOverride: ctx.fileOverride,
        projectLanguage,
        extendedBasicProven,
        evidenceDetail,
        userChoice: ctx.rememberedDialect,
    });
}

export interface TargetChoice {
    target: TargetDefinition;
    availability: Availability;
    /** True when this is the target a plain Build and Run would use. */
    isDefault: boolean;
}

/**
 * The targets a source can use for a given action, in the order to show them.
 *
 * Only targets that accept this language appear. A target that is compatible
 * but unusable stays in the list carrying the reason, so the user is told
 * which setting to fix rather than being offered nothing and left guessing.
 */
export function resolveTargets(
    language: LanguageId, action: ActionKind, ctx: ResolveContext = {},
): TargetChoice[] {
    const isConfigured = ctx.isConfigured ?? (() => true);
    const defaultId = defaultTargetFor(language, ctx);
    return targetsForAction(language, action).map(target => ({
        target,
        availability: availability(target, isConfigured),
        isDefault: target.id === defaultId,
    }));
}

/**
 * The default target for a source, most specific first.
 *
 * A per-source default beats the project default, which beats the language
 * default. Nothing here writes a default; a target used once is not a
 * preference, and persisting it silently would take the choice away from the
 * user without being asked.
 */
export function defaultTargetFor(
    language: LanguageId, ctx: ResolveContext = {}, sourcePath?: string,
): string | undefined {
    const project = ctx.project;
    if (project && sourcePath) {
        const norm = (p: string) => toPosix(p).toLowerCase();
        const wanted = norm(sourcePath);
        for (const [source, target] of Object.entries(project.sourceDefaults ?? {})) {
            if (wanted === norm(source) || wanted.endsWith("/" + norm(source))) {
                return target;
            }
        }
    }
    if (project?.defaultTarget) { return project.defaultTarget; }
    return findLanguage(language).defaultTarget;
}

/** One thing the user can be offered for a file. */
export interface ResolvedAction {
    kind: ActionKind;
    /** Command id to invoke. */
    command: string;
    /** Menu and picker label, in TI terms rather than tool switches. */
    label: string;
    /** Target this action applies to, when it is target-specific. */
    targetId?: string;
    /** True for the chooser variants, which always show the picker. */
    choosesTarget?: boolean;
}

export interface ActionPlan {
    source: SourceResolution;
    language: LanguageResolution;
    actions: ResolvedAction[];
    /** Set when the user must pick a dialect before anything can be offered. */
    needsDialectChoice?: boolean;
    /** Set when the file belongs to targets but is not itself runnable. */
    containingTargetIds?: string[];
}

/**
 * The whole plan for a file: what it is, what language it is, and what the
 * user may do with it.
 *
 * This is the function the menus and the palette both call.
 */
export function resolveActions(path: string, ctx: ResolveContext = {}): ActionPlan {
    const source = resolveSource(path, ctx);
    const language = resolveFileLanguage(path, ctx);

    if (language.ambiguous || !language.language) {
        // Nothing can be offered until the dialect is known. Asking is the
        // action, and it is the only honest one, since absence of Extended
        // BASIC syntax never proves TI BASIC.
        return {
            source,
            language,
            needsDialectChoice: language.candidates !== undefined,
            actions: language.candidates
                ? [{
                    kind: "validate",
                    command: "ti99.selectDialect",
                    label: "Select BASIC Dialect...",
                }]
                : [],
        };
    }

    // A module is not a program. Offer its containing target instead of
    // pretending the file builds on its own.
    if (source.role === "module") {
        const ids = source.containingTargets.map(t => t.id);
        return {
            source,
            language,
            containingTargetIds: ids,
            actions: [
                { kind: "build", command: "ti99.buildContainingTarget", label: "Build Containing Target" },
                { kind: "build-run", command: "ti99.buildAndRunContainingTarget", label: "Build and Run Containing Target" },
                { kind: "validate", command: "ti99.selectContainingTarget", label: "Select Containing Target..." },
            ],
        };
    }

    const lang = language.language;
    const hasRun = targetsForAction(lang, "build-run").length > 0;
    const hasPackage = targetsForAction(lang, "package").length > 0;

    const actions: ResolvedAction[] = [
        { kind: "validate", command: "ti99.validate", label: validateLabel(lang) },
        { kind: "build", command: "ti99.build", label: "Build" },
    ];
    if (hasRun) {
        actions.push(
            { kind: "run", command: "ti99.run", label: "Run" },
            { kind: "build-run", command: "ti99.buildAndRun", label: "Build and Run" },
            {
                kind: "build-run", command: "ti99.buildAndRunAs",
                label: "Build and Run As...", choosesTarget: true,
            });
    }
    if (hasPackage) {
        actions.push({ kind: "package", command: "ti99.package", label: "Package...", choosesTarget: true });
    }
    return { source, language, actions };
}

function validateLabel(language: LanguageId): string {
    switch (language) {
        case "ti-basic": return "Validate TI BASIC";
        case "ti-extended-basic": return "Validate Extended BASIC";
        case "gpl": return "Validate GPL";
        default: return "Validate";
    }
}

/**
 * Whether a stale artifact may be launched.
 *
 * Run means run what was built. If the source has moved on, running the old
 * artifact shows the user yesterday behaviour and blames today code, so the
 * caller must offer to rebuild instead of quietly launching.
 */
export function artifactIsCurrent(
    artifactMtimeMs: number | undefined, sourceMtimeMs: number | undefined,
): boolean {
    if (artifactMtimeMs === undefined) { return false; }
    if (sourceMtimeMs === undefined) { return true; }
    return artifactMtimeMs >= sourceMtimeMs;
}

/** Context-key values for the VS Code when clauses, derived from one plan. */
export interface ContextKeys {
    "ti99.language": string;
    "ti99.isEntrySource": boolean;
    "ti99.hasContainingTarget": boolean;
    "ti99.canBuild": boolean;
    "ti99.canRun": boolean;
    "ti99.canPackage": boolean;
}

export function contextKeysFor(plan: ActionPlan): ContextKeys {
    const has = (kind: ActionKind) => plan.actions.some(a => a.kind === kind);
    return {
        "ti99.language": plan.language.language ?? (plan.needsDialectChoice ? "basic-ambiguous" : ""),
        "ti99.isEntrySource": plan.source.role === "entry",
        "ti99.hasContainingTarget": (plan.containingTargetIds ?? []).length > 0,
        "ti99.canBuild": has("build"),
        "ti99.canRun": has("run") || has("build-run"),
        "ti99.canPackage": has("package"),
    };
}

export { findTargetDefinition, targetsForLanguage };

/**
 * Rewrite the project references to a renamed source file.
 *
 * Renaming game.b99 to game.xb99 breaks entrySource, the sources list, any
 * target that names it, basicSource and the per-source defaults, all of which
 * are paths written by hand. Returning a new config rather than mutating lets
 * the caller diff it and lets this be tested without a filesystem.
 *
 * Paths are compared by suffix, since ti99.json holds project-relative paths
 * while the editor supplies absolute ones.
 */
export function renameSourceReferences(
    config: ProjectConfig, from: string, to: string,
): { config: ProjectConfig; changed: string[] } {
    const norm = (p: string) => toPosix(p).toLowerCase();
    const oldName = norm(from);
    const newName = toPosix(to).split("/").pop() ?? to;
    const changed: string[] = [];

    const matches = (p: string) =>
        norm(p) === oldName || oldName.endsWith("/" + norm(p)) || norm(p).endsWith("/" + oldName);

    /** Keep the directory the project wrote, swap only the filename. */
    const rewrite = (p: string, where: string): string => {
        if (!matches(p)) { return p; }
        const parts = toPosix(p).split("/");
        parts[parts.length - 1] = newName;
        const updated = parts.join("/");
        changed.push(where + ": " + p + " -> " + updated);
        return updated;
    };

    const next: ProjectConfig = { ...config };
    next.sources = config.sources.map((p, i) => rewrite(p, "sources[" + i + "]"));
    if (config.entrySource) { next.entrySource = rewrite(config.entrySource, "entrySource"); }
    if (config.basicSource) { next.basicSource = rewrite(config.basicSource, "basicSource"); }

    if (config.targets) {
        next.targets = config.targets.map(t => {
            const copy: TargetConfig = { ...t };
            if (t.sources) { copy.sources = t.sources.map((p, i) => rewrite(p, t.id + ".sources[" + i + "]")); }
            if (t.entrySource) { copy.entrySource = rewrite(t.entrySource, t.id + ".entrySource"); }
            if (t.basicSource) { copy.basicSource = rewrite(t.basicSource, t.id + ".basicSource"); }
            return copy;
        });
    }

    if (config.sourceDefaults) {
        const defaults: Record<string, string> = {};
        for (const [key, value] of Object.entries(config.sourceDefaults)) {
            defaults[rewrite(key, "sourceDefaults")] = value;
        }
        next.sourceDefaults = defaults;
    }

    return { config: next, changed };
}
