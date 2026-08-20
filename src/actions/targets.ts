/**
 * Target definitions: what each distribution route is, which languages can
 * feed it, and what you can do with it.
 *
 * This is the single list the Explorer menu, the Command Palette and the tree
 * views all read. Anything that hard-codes a target name somewhere else can
 * drift away from it, which is exactly what this exists to prevent.
 */

import { Capability } from "../config/project";
import { LanguageId } from "./languages";

export type ActionKind = "build" | "run" | "build-run" | "package" | "validate";

export interface TargetDefinition {
    id: string;
    label: string;
    /** Shown under the label in the picker. Says what the user gets. */
    description: string;
    languageIds: LanguageId[];
    actionKinds: ActionKind[];
    /** What the build produces. Ties a target to the existing build cache. */
    outputs: Capability[];
    /** Emulator profile id this target runs under, when it is runnable. */
    emulatorProfile?: string;
    /**
     * Settings that must be configured for this target to run. Reuses the
     * same keys as EmulatorProfile.requires so there is one story about why
     * something is unavailable.
     */
    requires?: string[];
    /** Set when the behaviour is not yet verified and must not be advertised. */
    unverified?: boolean;
}

const CLASSIC99 = "ti99.emulator.classic99Path";
const EA_ROM = "ti99.emulator.classic99EaRom";
const XB_ROM = "ti99.emulator.classic99XbRom";
const DSK1 = "ti99.emulator.classic99Dsk1";

export const TARGETS: TargetDefinition[] = [
    {
        id: "cart",
        label: "Cartridge",
        description: "Build a cartridge image and launch it. Needs no disk or expansion.",
        languageIds: ["tms9900"],
        actionKinds: ["build", "run", "build-run", "package", "validate"],
        outputs: ["cart-bin", "cart-rpk"],
        emulatorProfile: "classic99-cart",
        requires: [CLASSIC99],
    },
    {
        id: "ea3",
        label: "E/A Option 3",
        description: "Build object code for Editor/Assembler LOAD AND RUN.",
        languageIds: ["tms9900"],
        actionKinds: ["build", "run", "build-run", "package", "validate"],
        outputs: ["ea3-object", "ea3-tifiles"],
        emulatorProfile: "classic99-ea",
        requires: [CLASSIC99, EA_ROM],
    },
    {
        id: "ea5",
        label: "E/A Option 5",
        description: "Build a memory-image program for RUN PROGRAM FILE.",
        languageIds: ["tms9900"],
        actionKinds: ["build", "run", "build-run", "package", "validate"],
        outputs: ["ea5-image"],
        emulatorProfile: "classic99-ea",
        requires: [CLASSIC99, EA_ROM],
    },
    {
        id: "ea-disk",
        label: "E/A Disk",
        description: "Build a disk image holding the program, for Editor/Assembler.",
        languageIds: ["tms9900"],
        actionKinds: ["build", "run", "build-run", "package", "validate"],
        outputs: ["disk-image"],
        emulatorProfile: "classic99-eadisk",
        requires: [CLASSIC99, EA_ROM],
    },
    {
        id: "xb-loader",
        label: "Extended BASIC Loader",
        description: "Build a disk that starts from Extended BASIC, for people with 32K but no Editor/Assembler cartridge.",
        languageIds: ["tms9900"],
        actionKinds: ["build", "run", "build-run", "package", "validate"],
        outputs: ["xb-program", "xb-tifiles"],
        emulatorProfile: "classic99-xbdisk",
        requires: [CLASSIC99, XB_ROM],
    },
];

/**
 * BASIC targets.
 *
 * Registered now so command routing is complete and testable. The build
 * pipelines behind them arrive in a later phase; a target whose behaviour is
 * not yet verified carries the unverified flag and is not offered.
 */
export const BASIC_TARGETS: TargetDefinition[] = [
    {
        id: "basic-program",
        label: "TI BASIC",
        description: "Tokenize to a native TI BASIC program and run it in TI BASIC.",
        languageIds: ["ti-basic"],
        actionKinds: ["build", "run", "build-run", "validate"],
        outputs: ["basic-program"],
        emulatorProfile: "classic99-basic",
        requires: [CLASSIC99],
    },
    {
        id: "basic-disk",
        label: "TI BASIC Disk",
        description: "Build a disk holding the tokenized TI BASIC program.",
        languageIds: ["ti-basic"],
        actionKinds: ["build", "package", "run", "build-run", "validate"],
        outputs: ["basic-program", "disk-image"],
        emulatorProfile: "classic99-basic",
        requires: [CLASSIC99, DSK1],
    },
    {
        id: "basic-under-xb",
        label: "Extended BASIC",
        description: "Run this TI BASIC program under Extended BASIC instead. An alternate runtime; the source stays TI BASIC.",
        languageIds: ["ti-basic"],
        actionKinds: ["run", "build-run"],
        outputs: ["basic-program"],
        emulatorProfile: "classic99-xb-program",
        requires: [CLASSIC99, XB_ROM],
    },
    {
        id: "xb-basic-program",
        label: "Extended BASIC",
        description: "Tokenize to a native Extended BASIC program and run it.",
        languageIds: ["ti-extended-basic"],
        actionKinds: ["build", "run", "build-run", "validate"],
        outputs: ["basic-program"],
        emulatorProfile: "classic99-xb-program",
        requires: [CLASSIC99, XB_ROM],
    },
    {
        id: "xb-basic-disk",
        label: "Extended BASIC Disk",
        description: "Build a disk holding the tokenized Extended BASIC program.",
        languageIds: ["ti-extended-basic"],
        actionKinds: ["build", "package", "run", "build-run", "validate"],
        outputs: ["basic-program", "disk-image"],
        emulatorProfile: "classic99-xbdisk",
        requires: [CLASSIC99, XB_ROM],
    },
    {
        id: "xb-autorun-disk",
        label: "Extended BASIC Auto-Run Disk",
        description: "Build a disk whose program is named LOAD, so Extended BASIC starts it by itself at power-up.",
        languageIds: ["ti-extended-basic"],
        actionKinds: ["build", "package", "run", "build-run", "validate"],
        outputs: ["basic-program", "disk-image"],
        emulatorProfile: "classic99-xbdisk",
        requires: [CLASSIC99, XB_ROM],
    },
];

export function allTargets(): TargetDefinition[] {
    return [...TARGETS, ...BASIC_TARGETS];
}

export function findTargetDefinition(id: string): TargetDefinition | undefined {
    return allTargets().find(t => t.id === id);
}

/** Targets that can consume this language, in declaration order. */
export function targetsForLanguage(language: LanguageId): TargetDefinition[] {
    return allTargets().filter(t => t.languageIds.includes(language) && !t.unverified);
}

/** Targets offering a particular action, for that language. */
export function targetsForAction(language: LanguageId, action: ActionKind): TargetDefinition[] {
    return targetsForLanguage(language).filter(t => t.actionKinds.includes(action));
}

export interface Availability {
    available: boolean;
    /** Settings that are missing, when it is unavailable. */
    missing: string[];
}

/**
 * Whether a target can actually be used right now.
 *
 * Reuses the requires-key mechanism the emulator profiles already had rather
 * than inventing a second way of saying the same thing, so a target that
 * cannot run explains itself with the setting to fix, instead of being
 * offered and then failing with a process error.
 */
export function availability(
    target: TargetDefinition, isConfigured: (key: string) => boolean,
): Availability {
    const missing = (target.requires ?? []).filter(key => !isConfigured(key));
    return { available: missing.length === 0, missing };
}
