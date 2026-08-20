/**
 * Reading a native BASIC program back, to say what was actually produced.
 *
 * The two formats are not interchangeable, and the difference decides where a
 * program will run:
 *
 *   Standard  VDP-resident, stored as a PROGRAM file, loads on an unexpanded
 *             console, and is the format Extended BASIC will auto-run from
 *             DSK1.LOAD.
 *   Long      marked >ABCD, stored as INT/VAR 254, needs the 32K expansion,
 *             and does not auto-run.
 *
 * A build that quietly produced the wrong one would leave someone with a disk
 * that does nothing on the machine they aimed it at, so the format is measured
 * from the artifact rather than assumed from the flags that were passed.
 */

import { stripContainer } from '../../actions/evidence';

export type ProgramFormat = 'standard' | 'long';

export interface ProgramInfo {
    format: ProgramFormat;
    /** Size of the program image itself, container header excluded. */
    size: number;
    /** True when the format cannot load without the 32K expansion. */
    requires32k: boolean;
    /** Top-of-program pointer, as recorded in the header. */
    topOfProgram: number;
    /** True when a TIFILES container was wrapped around it. */
    hadContainer: boolean;
    /**
     * Not determined.
     *
     * A negated checksum is said to mark a listing-protected program, but the
     * high bit is also set on ordinary long-format headers, so that test
     * reports unprotected programs as protected. Protected-program support
     * belongs to the round-trip phase and needs its own verification; until
     * then nothing here claims to know.
     */
    protectedProgram?: undefined;
}

/** Top-of-program values the two formats use, as verified against xbas99. */
export const STANDARD_TOP = 0x37d7;
export const LONG_TOP = 0xffe7;

/**
 * Describe a tokenised program.
 *
 * Returns undefined for anything too short or too malformed to be one, rather
 * than guessing, since a wrong answer here would be reported to the user as
 * fact.
 */
export function describeProgram(raw: Uint8Array): ProgramInfo | undefined {
    const hadContainer = raw.length > 128 && raw[0] === 0x07;
    const image = stripContainer(raw);
    if (image.length < 8) { return undefined; }

    // Long format is stored as INT/VAR 254, so in a file it is
    // record-structured: each record carries a length byte before its content,
    // which puts the >ABCD marker at offset 1 rather than 0. Standard format
    // is a flat image with no prefix. Checking only offset 0 reports a long
    // program as standard, which is wrong in the direction that matters, since
    // long format does not auto-run from DSK1.LOAD.
    let headerAt: number | undefined;
    if (image[0] === 0xab && image[1] === 0xcd) { headerAt = 0; }
    else if (image[1] === 0xab && image[2] === 0xcd) { headerAt = 1; }

    const long = headerAt !== undefined;
    const base = long ? headerAt! + 2 : 0;
    const be = (offset: number): number => (image[offset] << 8) | image[offset + 1];

    const topOfProgram = be(base + 6);

    return {
        format: long ? 'long' : 'standard',
        size: image.length,
        requires32k: long,
        topOfProgram,
        hadContainer,
    };
}

/** One line for the build output, naming what a user needs to know. */
export function describeForBuildLog(info: ProgramInfo): string {
    const parts = [
        info.format === 'long' ? 'Long format' : 'Standard format',
        info.size + ' bytes',
    ];
    parts.push(info.requires32k
        ? '32K expansion required'
        : '32K expansion not required');
    if (info.format === 'long') {
        parts.push('does not auto-run from DSK1.LOAD');
    }
    return parts.join(', ');
}
