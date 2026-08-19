/**
 * Emulator profiles.
 *
 * The Classic99 command line is undocumented in the manual. It was confirmed by
 * the author (tursilion) in classic99 issue #3:
 *
 *     classic99.exe -rom "path\to\rom.bin"
 *
 * ROM identification follows the same rules as Cartridge -> User -> Open:
 *   xxxxxC.BIN  plain cartridge ROM        xxxxxD.BIN  second bank (XB style)
 *   xxxxxG.BIN  GROM                       xxxxx8.BIN  378, non-inverted banking
 *   xxxxx3.BIN  379 inverted / SuperSpace
 * Selecting one file loads the whole like-named set.
 */

import type { Banking, Capability } from '../config/project';

export type EmulatorKind = 'process' | 'browser' | 'fiad-drop';

export interface PreLaunchStep {
    action: 'mkdir' | 'copy';
    from?: string;
    to: string;
}

export interface EmulatorProfile {
    id: string;
    displayName: string;
    kind: EmulatorKind;
    /** Artifact kinds this profile can actually run. */
    accepts: Capability[];
    executable?: string;
    args?: string[];
    /** Browser profiles only. */
    url?: string;
    /** File staging performed before the process starts. */
    preLaunch?: PreLaunchStep[];
    singleInstance?: boolean;
    detached?: boolean;
    /** Restrict to these values of process.platform. */
    platforms?: NodeJS.Platform[];
    notes?: string;
}

export const CLASSIC99_CART: EmulatorProfile = {
    id: 'classic99-cart',
    displayName: 'Classic99 — cartridge',
    kind: 'process',
    accepts: ['cart-bin'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${artifact:cart-bin}'],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    notes: 'Build with -B so the ROM is padded to a multiple of 8 KB, and name the file ' +
        'with the trailing type letter Classic99 expects (C for a plain ROM, 8 or 3 ' +
        'for banked). Classic99 will load the rest of a like-named set automatically.',
};

export const CLASSIC99_DISK: EmulatorProfile = {
    id: 'classic99-disk',
    displayName: 'Classic99 — Editor/Assembler from DSK1',
    kind: 'fiad-drop',
    accepts: ['ea5-image', 'ea3-object'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: [],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        { action: 'copy', from: '${artifact:tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${tiFilename}' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    notes: 'Classic99 cannot write to .dsk images; its native format is files in a ' +
        'directory (FIAD) in TIFILES format. The extension drops the build output ' +
        'straight into the configured DSK1 folder. Then choose Editor/Assembler, ' +
        'option 5 for an image or option 3 for an object file.',
};

export const MAME_CART: EmulatorProfile = {
    id: 'mame-cart',
    displayName: 'MAME — cartridge (RPK)',
    kind: 'process',
    accepts: ['cart-rpk'],
    executable: '${config:ti99.emulator.mamePath}',
    args: [
        '${config:ti99.emulator.mameSystem}',
        '-cart', '${artifact:cart-rpk}',
        '${extraArgs}',
    ],
    detached: true,
    notes: 'System driver is ti99_4a (NTSC), ti99_4ae (PAL), ti99_4 or ti99_8.',
};

export const MAME_DISK: EmulatorProfile = {
    id: 'mame-disk',
    displayName: 'MAME — Editor/Assembler with a disk image',
    kind: 'process',
    accepts: ['disk-image'],
    executable: '${config:ti99.emulator.mamePath}',
    args: [
        '${config:ti99.emulator.mameSystem}',
        '-ioport', 'peb',
        '-ioport:peb:slot2', '32kmem',
        '-ioport:peb:slot8', 'hfdc',
        '-ioport:peb:slot8:hfdc:f1', '525dd',
        '-cart', '${config:ti99.emulator.eaCartridgePath}',
        '-flop1', '${artifact:disk-image}',
        '${extraArgs}',
    ],
    detached: true,
    notes: 'Requires an Editor/Assembler cartridge image, which the extension will ' +
        'never download for you. Point ti99.emulator.eaCartridgePath at your own copy.',
};

export const JS99ER: EmulatorProfile = {
    id: 'js99er',
    displayName: 'Js99er — open in browser',
    kind: 'browser',
    accepts: ['cart-rpk', 'cart-bin'],
    url: 'https://js99er.net/',
    notes: 'Browser based, so it cannot be launched as a process and cannot be handed ' +
        'a local file automatically. The extension opens it and reveals the build ' +
        'output so you can drag the file in.',
};

export const WIN994A: EmulatorProfile = {
    id: 'win994a',
    displayName: 'Win994a — launch only',
    kind: 'process',
    accepts: [],
    executable: '${config:ti99.emulator.win994aPath}',
    args: [],
    detached: true,
    platforms: ['win32'],
    notes: 'Windows only, and no documented command line for loading a program. ' +
        'Getting files in is done through the Win994a Disk Manager GUI. Treated as ' +
        'launch-only until argument support can be confirmed on your installation.',
};

export const CUSTOM_EMULATOR: EmulatorProfile = {
    id: 'custom',
    displayName: 'Custom emulator',
    kind: 'process',
    accepts: ['cart-rpk', 'cart-bin', 'ea5-image', 'ea3-object', 'disk-image'],
    executable: '${config:ti99.emulator.customPath}',
    args: ['${config:ti99.emulator.customArgs}'],
    detached: true,
    notes: 'Available substitutions: ${artifact:<kind>}, ${projectRoot}, ${buildDir}, ${distDir}, ${tiFilename}.',
};

export const BUILTIN_EMULATORS: EmulatorProfile[] = [
    CLASSIC99_CART, CLASSIC99_DISK,
    MAME_CART, MAME_DISK,
    JS99ER, WIN994A, CUSTOM_EMULATOR,
];

/** Emulators that can run the artifacts a build actually produced. */
export function candidatesFor(produced: Capability[], platform: NodeJS.Platform): EmulatorProfile[] {
    return BUILTIN_EMULATORS.filter(e => {
        if (e.platforms && !e.platforms.includes(platform)) return false;
        return e.accepts.some(a => produced.includes(a));
    });
}

/**
 * Classic99 infers the cartridge type from the last character of the filename.
 * Returns the name the build should use for a given banking scheme.
 */
export function classic99CartFilename(baseName: string, banking: Banking): string {
    // TI filenames allow no spaces, and Classic99 matches on the trailing letter.
    const stem = baseName
        .replace(/\.[^.]*$/, '')
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '')
        .slice(0, 9) || 'PROGRAM';
    const suffix = ({ none: 'C', '378': '8', '379': '3', grom: 'G' } as Record<Banking, string>)[banking];
    return `${stem}${suffix}.BIN`;
}
