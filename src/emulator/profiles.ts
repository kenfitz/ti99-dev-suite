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
    /**
     * Settings that must hold a value before this profile can launch.
     *
     * Unresolved arguments are dropped, which is right for an optional list
     * like extraArgs but wrong for a flag with a value: dropping the value of
     * '-rom' leaves a bare '-rom'. Naming the settings here turns that into a
     * clear message about what to configure.
     */
    requires?: string[];
    /**
     * Shown after a successful launch. A cartridge boots straight into the
     * program, but a loader cartridge drops the user at a menu, and without
     * being told which option to choose and what filename to type, a working
     * launch is indistinguishable from a broken one. Supports the same
     * substitutions as args.
     */
    hint?: string;
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

/**
 * Running anything that is not a cartridge needs a cartridge anyway: the bare
 * console has no way to load code from disk. These two profiles load the
 * loader, so Run reaches the program instead of the TI BASIC prompt.
 */
export const CLASSIC99_EA: EmulatorProfile = {
    id: 'classic99-ea',
    displayName: 'Classic99 — Editor/Assembler cartridge + DSK1',
    kind: 'fiad-drop',
    accepts: ['ea5-image', 'ea3-object'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${config:ti99.emulator.classic99EaRom}'],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        { action: 'copy', from: '${artifact:tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${tiFilename}' },
        // Option 3 loads the tagged object, which is a different file from the
        // option 5 memory image, so it needs its own name on the disk.
        { action: 'copy', from: '${artifact:ea3-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${tiFilename}O' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99EaRom', 'ti99.emulator.classic99Dsk1'],
    hint: 'Editor/Assembler loaded. Press a key, then 2 for EDITOR/ASSEMBLER. ' +
        'Option 5 (RUN PROGRAM FILE): enter DSK1.${tiFilename} and it starts ' +
        'by itself. Option 3 (LOAD AND RUN): enter DSK1.${tiFilename}O, press ' +
        'Enter on the blank line, then type MAIN.',
    notes: 'Loads the Editor/Assembler cartridge and drops the build into DSK1. ' +
        'Choose option 5 for a memory image or option 3 for a tagged object, then ' +
        'the program name from DEF. Cartridge ROMs are not distributed with the ' +
        'extension; point the setting at your own copy.',
};

export const CLASSIC99_XB: EmulatorProfile = {
    id: 'classic99-xb',
    displayName: 'Classic99 — Extended BASIC cartridge + DSK1',
    kind: 'fiad-drop',
    accepts: ['ea3-object', 'disk-image'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${config:ti99.emulator.classic99XbRom}'],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        { action: 'copy', from: '${artifact:tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${tiFilename}' },
        { action: 'copy', from: '${artifact:basic-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/LOAD' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99XbRom', 'ti99.emulator.classic99Dsk1'],
    hint: 'Extended BASIC loaded. It runs DSK1.LOAD at power-up, so the program ' +
        'should start on its own. If it does not, type RUN "DSK1.LOAD".',
    notes: 'Loads Extended BASIC and drops the build plus its LOAD program into ' +
        'DSK1. XB runs a program called LOAD at power-up, so the game starts by ' +
        'itself. Cartridge ROMs are not distributed with the extension.',
};

/**
 * A distribution disk rather than a development drop: the .dsk is the
 * deliverable, so nothing is staged into a FIAD folder. Classic99 has no
 * command line for mounting a disk, so inserting it is a manual step - which
 * is what it was on real hardware too.
 */
export const CLASSIC99_EA_DISK: EmulatorProfile = {
    id: 'classic99-eadisk',
    displayName: 'Classic99 — Editor/Assembler cartridge + disk image',
    kind: 'process',
    accepts: ['disk-image'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${config:ti99.emulator.classic99EaRom}'],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99EaRom'],
    hint: 'Editor/Assembler loaded. Insert the disk: Disk > DSK1 > open ' +
        '${artifact:disk-image} — then press a key, choose 2, then 5 ' +
        '(RUN PROGRAM FILE) and enter DSK1.${tiFilename}.',
    notes: 'The disk image is the distribution artifact. Mount it as DSK1 in ' +
        'Classic99, or write it to a real floppy with xdm99. Cartridge ROMs are ' +
        'not distributed with the extension.',
};

/**
 * An Extended BASIC distribution disk: the whole game travels inside an XB
 * program, so no Editor/Assembler is needed. Nothing is staged, because the
 * .dsk is the deliverable and Classic99 has no command line for mounting one.
 */
export const CLASSIC99_XB_DISK: EmulatorProfile = {
    id: 'classic99-xbdisk',
    displayName: 'Classic99 — Extended BASIC cartridge + DSK1',
    kind: 'fiad-drop',
    accepts: ['xb-program', 'basic-program', 'disk-image'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${config:ti99.emulator.classic99XbRom}'],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        // Staged rather than mounted. Mounting a disk is a manual step in
        // Classic99, and a stale file left in the FIAD folder will shadow the
        // image the user thinks they are running.
        { action: 'copy', from: '${artifact:basic-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${basicName}' },
        { action: 'copy', from: '${artifact:ea3-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${tiFilename}' },
        // Single-file alternative: an embedded program needs no companion object.
        { action: 'copy', from: '${artifact:xb-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${basicName}' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99XbRom', 'ti99.emulator.classic99Dsk1'],
    // A standard-format PROGRAM named LOAD on DSK1 auto-loads and auto-runs;
    // verified on a cold Classic99 start. Only the long INT/VAR 254 format
    // needs an explicit RUN, which is why the assembly disk used to.
    hint: 'Extended BASIC loaded. DSK1.${basicName} starts on its own — give it ' +
        'a moment. If nothing happens, type  RUN "DSK1.${basicName}"',
    notes: 'The game is embedded in the Extended BASIC program, so the Editor/' +
        'Assembler cartridge is not required. The .dsk in distDir is the ' +
        'distribution artifact; the staged copy is for testing.',
};

/**
 * TI BASIC on a bare console.
 *
 * No cartridge is involved: TI BASIC is in the console ROM, so the only
 * requirement is Classic99 itself and somewhere to put the program. That makes
 * this the one route that needs no ROM the user has to supply, which is worth
 * something for a first program.
 *
 * TI BASIC does not auto-run anything, so the remaining step is stated rather
 * than pretended away.
 */
export const CLASSIC99_BASIC: EmulatorProfile = {
    id: 'classic99-basic',
    displayName: 'Classic99 — TI BASIC',
    kind: 'fiad-drop',
    accepts: ['basic-tifiles', 'basic-program', 'disk-image'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: [],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        // The TIFILES-wrapped form, not the raw image. Classic99 reads a
        // headerless file with no extension as DIS/FIX 128, so a raw program
        // is on the disk but is not a PROGRAM, and nothing can load it.
        { action: 'copy', from: '${artifact:basic-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${basicName}' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99Dsk1'],
    hint: 'Choose TI BASIC from the console menu, then  OLD DSK1.${basicName}  ' +
        'and  RUN. TI BASIC has no auto-run of any kind, so those two lines ' +
        'cannot be automated away; they are what the machine requires.',
    notes: 'TI BASIC lives in the console ROM, so no cartridge file is needed. ' +
        'The tokenised program is dropped into DSK1 under its TI name.',
};

/**
 * Extended BASIC running a tokenised BASIC program.
 *
 * Distinct from the assembly Extended BASIC loader profile even though both
 * end up with a file called LOAD on DSK1. This one carries a BASIC program the
 * interpreter runs directly; that one carries machine code embedded in a BASIC
 * wrapper. Confusing them produces a disk that looks right and does nothing.
 */
export const CLASSIC99_XB_PROGRAM: EmulatorProfile = {
    id: 'classic99-xb-program',
    displayName: 'Classic99 — Extended BASIC program',
    kind: 'fiad-drop',
    accepts: ['basic-tifiles', 'basic-program', 'disk-image'],
    executable: '${config:ti99.emulator.classic99Path}',
    args: ['-rom', '${config:ti99.emulator.classic99XbRom}'],
    preLaunch: [
        { action: 'mkdir', to: '${config:ti99.emulator.classic99Dsk1}' },
        // Twice, on purpose. Extended BASIC runs a standard-format program
        // called LOAD at power-up, so that copy is what makes it start by
        // itself. The copy under its own name is so the program can still be
        // reached deliberately, with OLD DSK1.NAME, when you want to LIST or
        // edit it instead of watching it run.
        { action: 'copy', from: '${artifact:basic-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/LOAD' },
        { action: 'copy', from: '${artifact:basic-tifiles}', to: '${config:ti99.emulator.classic99Dsk1}/${basicName}' },
    ],
    singleInstance: true,
    detached: true,
    platforms: ['win32'],
    requires: ['ti99.emulator.classic99Path', 'ti99.emulator.classic99XbRom', 'ti99.emulator.classic99Dsk1'],
    hint: 'Extended BASIC starts the program by itself. Press FCTN+4 to break ' +
        'into it, then LIST or RUN. It is also on the disk as ${basicName}, so ' +
        'OLD DSK1.${basicName} loads it without running it.',
    notes: 'Drops the tokenised program into DSK1 twice: as LOAD, which Extended ' +
        'BASIC runs at power-up, and under its own name for loading by hand. ' +
        'Whichever project was built last owns DSK1.LOAD, exactly as one real ' +
        'disk would.',
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
    requires: ['ti99.emulator.mamePath', 'ti99.emulator.eaCartridgePath'],
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
    CLASSIC99_CART, CLASSIC99_EA, CLASSIC99_EA_DISK, CLASSIC99_XB_DISK, CLASSIC99_XB, CLASSIC99_DISK,
    CLASSIC99_BASIC, CLASSIC99_XB_PROGRAM,
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
