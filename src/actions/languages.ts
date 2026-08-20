/**
 * Source languages, their file extensions, and how a file resolves to one.
 *
 * This module knows nothing about VS Code. It takes plain facts about a file
 * and returns a decision, which is what makes the whole routing layer
 * testable without an editor host.
 *
 * See docs/source-naming.md for where the conventions came from and why .b99
 * is treated differently from the others.
 */

export type LanguageId = "tms9900" | "ti-basic" | "ti-extended-basic" | "gpl";

/**
 * How firmly a filename implies a language.
 *
 * Strong: the extension names one language and nothing else uses it that way.
 * Weak: the extension is used for more than one language in practice, so the
 * name is a hint rather than a statement. Only .b99 is weak, because xbas99
 * writes it for both BASIC dialects.
 */
export type PresumptionStrength = "strong" | "weak";

export interface SourceLanguageDefinition {
    id: LanguageId;
    label: string;
    /** Used when this extension creates a new file. */
    canonicalExtension: string;
    /** Recognised as first-class equivalents, never deprecated. */
    aliases: string[];
    /** Target ids this language can build, in preference order. */
    buildTargets: string[];
    /** Target ids this language can run. */
    runTargets: string[];
    defaultTarget?: string;
}

export const LANGUAGES: SourceLanguageDefinition[] = [
    {
        id: "tms9900",
        label: "TMS9900 Assembly",
        canonicalExtension: ".a99",
        aliases: [".asm"],
        buildTargets: ["cart", "ea3", "ea5", "ea-disk", "xb-loader"],
        runTargets: ["cart", "ea3", "ea5", "ea-disk", "xb-loader"],
        defaultTarget: "cart",
    },
    {
        id: "ti-basic",
        label: "TI BASIC",
        canonicalExtension: ".b99",
        aliases: [],
        buildTargets: ["basic-program", "basic-disk"],
        runTargets: ["basic-program", "basic-disk", "basic-under-xb"],
        defaultTarget: "basic-program",
    },
    {
        id: "ti-extended-basic",
        label: "TI Extended BASIC",
        canonicalExtension: ".xb99",
        aliases: [".xb"],
        buildTargets: ["xb-basic-program", "xb-basic-disk", "xb-autorun-disk"],
        runTargets: ["xb-basic-program", "xb-basic-disk", "xb-autorun-disk"],
        defaultTarget: "xb-basic-program",
    },
    {
        id: "gpl",
        label: "GPL",
        canonicalExtension: ".g99",
        aliases: [".gpl"],
        buildTargets: [],
        runTargets: [],
    },
];

/**
 * Extensions that name a BASIC program without saying which dialect. Neutral
 * by definition, not merely unrecognised.
 */
export const NEUTRAL_BASIC_EXTENSIONS = [".bas"];

const BASIC_DIALECTS: LanguageId[] = ["ti-basic", "ti-extended-basic"];

export function findLanguage(id: LanguageId): SourceLanguageDefinition {
    const def = LANGUAGES.find(l => l.id === id);
    if (!def) { throw new Error("Unknown language " + id); }
    return def;
}

export function labelOf(id: LanguageId): string {
    return findLanguage(id).label;
}

/** Windows path separator, built to avoid an escape in this source. */
const SEP = String.fromCharCode(92);

/** Lower-case extension including the dot, or empty string when there is none. */
export function extensionOf(path: string): string {
    const name = path.split("/").join(SEP).split(SEP).pop() ?? "";
    const dot = name.lastIndexOf(".");
    return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export interface Presumption {
    language?: LanguageId;
    strength?: PresumptionStrength;
    /** Set for a neutral extension: the dialects it could be. */
    candidates?: LanguageId[];
}

/**
 * What the filename alone suggests.
 *
 * .b99 is deliberately weak. xbas99 writes it when detokenizing either
 * dialect, and the editor support shipped with xdt99 maps it, .bas and .xb to
 * one BASIC mode, so an existing .b99 file is more likely to be Extended
 * BASIC than the name suggests.
 */
export function presumeFromExtension(path: string): Presumption {
    const ext = extensionOf(path);
    if (NEUTRAL_BASIC_EXTENSIONS.includes(ext)) {
        return { candidates: BASIC_DIALECTS };
    }
    for (const lang of LANGUAGES) {
        if (ext === lang.canonicalExtension || lang.aliases.includes(ext)) {
            const strength: PresumptionStrength = ext === ".b99" ? "weak" : "strong";
            return { language: lang.id, strength };
        }
    }
    return {};
}

/** Where a resolved language came from. Reported so the UI can explain itself. */
export type ResolutionSource =
    | "file-override"
    | "project"
    | "content"
    | "extension"
    | "user"
    | "unresolved";

export interface LanguageResolution {
    /** Undefined only when the dialect is genuinely undecided. */
    language?: LanguageId;
    source: ResolutionSource;
    /** Dialects still in play when ambiguous, for the picker. */
    candidates?: LanguageId[];
    /** True when the caller must ask the user before proceeding. */
    ambiguous: boolean;
    /** One sentence suitable for showing to a person. */
    reason: string;
    /**
     * Set when a declaration was honoured but the file contradicts it, or
     * when evidence disagrees with a strong filename. The caller should
     * surface this as a diagnostic, not silently re-resolve.
     */
    conflict?: string;
}

export interface ResolveLanguageInput {
    path: string;
    /** Level 1. An explicit setting for this one file. */
    fileOverride?: LanguageId;
    /** Level 2. The language declared by the containing project or target. */
    projectLanguage?: LanguageId;
    /**
     * Level 4. True only when an Extended BASIC-only construct was actually
     * found. Absence must be reported as false, never as proof of TI BASIC.
     */
    extendedBasicProven?: boolean;
    /** What proved it, for the explanation. */
    evidenceDetail?: string;
    /** Level 5. A choice the user already made. */
    userChoice?: LanguageId;
}

/**
 * Resolve the language of a source file.
 *
 * Precedence is per docs/source-naming.md:
 *
 *   1. explicit per-file override
 *   2. explicit project configuration
 *   3. canonical extension
 *   4. deterministic content evidence
 *   5. user selection
 *
 * Levels 1 and 2 are declarations of intent and always win; when the file
 * contradicts them the contradiction is reported as a conflict rather than
 * used to re-resolve, because the user said what they meant and the construct
 * is the error. Level 3 is only a presumption, and a weak one for .b99, so
 * proof from level 4 outranks it.
 *
 * Evidence is asymmetric throughout. Proving Extended BASIC is possible;
 * proving TI BASIC is not, because every valid TI BASIC program is also a
 * valid Extended BASIC program.
 */
export function resolveLanguage(input: ResolveLanguageInput): LanguageResolution {
    const presumed = presumeFromExtension(input.path);
    const proven = input.extendedBasicProven === true;
    const detail = input.evidenceDetail ? " (" + input.evidenceDetail + ")" : "";

    // 1 and 2: declarations of intent.
    for (const [declared, source, where] of [
        [input.fileOverride, "file-override", "This file is configured"],
        [input.projectLanguage, "project", "The project is configured"],
    ] as Array<[LanguageId | undefined, ResolutionSource, string]>) {
        if (!declared) { continue; }
        const res: LanguageResolution = {
            language: declared,
            source,
            ambiguous: false,
            reason: where + " as " + labelOf(declared) + ".",
        };
        if (proven && declared === "ti-basic") {
            res.conflict = "Declared as TI BASIC, but the source uses an " +
                "Extended BASIC-only construct" + detail + ".";
        }
        return res;
    }

    // 3 and 4: a filename presumption, which proof can outrank when weak.
    if (presumed.language) {
        const strong = presumed.strength === "strong";
        if (proven && presumed.language === "ti-basic") {
            if (!strong) {
                return {
                    language: "ti-extended-basic",
                    source: "content",
                    ambiguous: false,
                    reason: "Named .b99, but the source uses an Extended " +
                        "BASIC-only construct" + detail + ". xdt99 writes .b99 " +
                        "for both dialects, so the evidence decides.",
                };
            }
            return {
                language: presumed.language,
                source: "extension",
                ambiguous: false,
                reason: labelOf(presumed.language) + " by file extension.",
                conflict: "The extension implies TI BASIC, but the source uses " +
                    "an Extended BASIC-only construct" + detail + ".",
            };
        }
        return {
            language: presumed.language,
            source: "extension",
            ambiguous: false,
            reason: labelOf(presumed.language) + " by file extension.",
        };
    }

    // A dialect-neutral extension. Evidence can settle it one way only.
    if (presumed.candidates) {
        if (proven) {
            return {
                language: "ti-extended-basic",
                source: "content",
                ambiguous: false,
                reason: "Extended BASIC, proven by an Extended BASIC-only " +
                    "construct" + detail + ".",
            };
        }
        if (input.userChoice) {
            return {
                language: input.userChoice,
                source: "user",
                ambiguous: false,
                reason: "Set to " + labelOf(input.userChoice) + " for this file.",
            };
        }
        // Absence of Extended BASIC syntax is not evidence of TI BASIC.
        return {
            source: "unresolved",
            candidates: presumed.candidates,
            ambiguous: true,
            reason: "This file does not say which BASIC dialect it is, and no " +
                "Extended BASIC-only construct appears in it. Every valid TI " +
                "BASIC program is also valid Extended BASIC, so the dialect " +
                "cannot be determined from the source.",
        };
    }

    if (input.userChoice) {
        return {
            language: input.userChoice,
            source: "user",
            ambiguous: false,
            reason: "Set to " + labelOf(input.userChoice) + " for this file.",
        };
    }
    return {
        source: "unresolved",
        ambiguous: true,
        reason: "Not a recognised TI-99 source file.",
    };
}

/** The filename an imported program should be given, once the dialect is known. */
export function importFilename(stem: string, language: LanguageId): string {
    return stem + findLanguage(language).canonicalExtension;
}
