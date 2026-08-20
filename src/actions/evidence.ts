/**
 * Deterministic evidence that a program is Extended BASIC.
 *
 * Evidence is one-directional. Finding an Extended BASIC-only construct
 * proves Extended BASIC. Finding none proves nothing, because every valid TI
 * BASIC program is also a valid Extended BASIC program. Nothing in this file
 * ever returns "this is TI BASIC".
 */

import { Lexer, LexMode } from "../lang/basic/lexer";
import { SUBPROGRAMS } from "../lang/basic/metadata";

export interface Evidence {
    /** True only when an Extended BASIC-only construct was actually found. */
    extendedBasicProven: boolean;
    /** What proved it, e.g. "CALL SPRITE" or "::", for the explanation. */
    detail?: string;
    /** Zero-based line it was found on, when known. */
    line?: number;
}

const NONE: Evidence = { extendedBasicProven: false };

/**
 * Keywords that exist only in Extended BASIC.
 *
 * Deliberately conservative. A keyword goes here only when its absence from
 * TI BASIC is certain, because a wrong entry silently relabels someone's
 * program. Statements whose dialect still needs checking against the manuals
 * are left out; leaving one out costs a missed inference, putting a wrong one
 * in costs a wrong answer.
 */
export const XB_ONLY_KEYWORDS = new Set([
    "SUB", "SUBEND", "SUBEXIT", "LINPUT", "ACCEPT", "IMAGE",
    "RPT$", "MAX", "MIN", "PI",
]);

/** The statement separator and end-of-line comment marker are XB-only. */
const XB_ONLY_PUNCTUATION = new Set(["::", "!"]);

/** CALL subprograms the metadata marks as Extended BASIC only. */
function xbOnlySubprograms(): Set<string> {
    const out = new Set<string>();
    for (const s of SUBPROGRAMS) {
        if (!s.dialects.includes("ti-basic") && s.dialects.includes("ti-extended-basic")) {
            out.add(s.name.toUpperCase());
        }
    }
    return out;
}

/**
 * Scan text source for Extended BASIC-only constructs.
 *
 * Uses the real lexer with mode switching, so a construct named inside a
 * string, a REM, a DATA item or an IMAGE format is not mistaken for code. The
 * whole point of the lexer is that this cannot be done with a search.
 */
export function scanSource(text: string): Evidence {
    const xbSubs = xbOnlySubprograms();
    const lexer = new Lexer(text, { allowStatementSeparator: true, labels: false });
    let mode: LexMode = "statement";
    let expectSubprogramName = false;
    let guard = 0;

    while (!lexer.atEnd() && guard++ < 500000) {
        const t = lexer.next(mode);
        if (t.kind === "eol") { mode = "statement"; expectSubprogramName = false; continue; }

        if (mode === "unquoted") {
            // The name right after CALL or SUB.
            const name = t.text.toUpperCase();
            if (expectSubprogramName && xbSubs.has(name)) {
                return { extendedBasicProven: true, detail: "CALL " + name, line: t.line };
            }
            mode = "statement";
            expectSubprogramName = false;
            continue;
        }
        if (mode === "comment" || mode === "image" || mode === "data") {
            // Content, not code. Nothing here can be evidence.
            continue;
        }

        if (t.kind === "statement-sep" || (t.kind === "keyword" && XB_ONLY_PUNCTUATION.has(t.text))) {
            const what = t.text === "!" ? "an end-of-line comment" : "the :: statement separator";
            return { extendedBasicProven: true, detail: what, line: t.line };
        }
        if (t.kind === "keyword") {
            const word = t.text.toUpperCase();
            if (XB_ONLY_KEYWORDS.has(word)) {
                return { extendedBasicProven: true, detail: word, line: t.line };
            }
            if (word === "REM") { mode = "comment"; }
            else if (word === "DATA") { mode = "data"; }
            else if (word === "IMAGE") { mode = "image"; }
            else if (word === "CALL" || word === "SUB") {
                mode = "unquoted";
                expectSubprogramName = true;
            }
        }
    }
    return NONE;
}

/**
 * Token values that only Extended BASIC produces.
 *
 * Taken from the xbas99 token table, where a keyword at index i encodes as
 * >81 + i. Kept in step with XB_ONLY_KEYWORDS above by a test.
 */
export const XB_ONLY_TOKENS: ReadonlyMap<number, string> = new Map([
    [0x82, "the :: statement separator"],
    [0x83, "an end-of-line comment"],
    [0xa1, "SUB"],
    [0xa3, "IMAGE"],
    [0xa4, "ACCEPT"],
    [0xa7, "SUBEXIT"],
    [0xa8, "SUBEND"],
    [0xaa, "LINPUT"],
    [0xdd, "PI"],
    [0xdf, "MAX"],
    [0xe0, "MIN"],
    [0xe1, "RPT$"],
]);

/** Tokens that introduce a payload the scan must step over rather than read. */
const QUOTED_STRING = 0xc7;
const UNQUOTED_STRING = 0xc8;
const LINE_NUMBER = 0xc9;

/** CALL takes a subprogram name as an unquoted-string payload. */
const CALL = 0x9d;
const SUB = 0xa1;

/**
 * Scan a tokenized BASIC program for Extended BASIC-only tokens.
 *
 * This walks the token stream and steps over payloads. It does not search the
 * bytes, and it must not: a character inside a string literal, an unquoted
 * string or a line-number reference can equal an Extended BASIC token value
 * by coincidence. GOTO 130 encodes the line number as >00 >82, and >82 is the
 * :: token, so a flat scan calls an ordinary TI BASIC program Extended BASIC.
 *
 * Accepts the program image with its header, standard or long format.
 */
/**
 * Strip a TIFILES header if one is present.
 *
 * A program taken off a disk or out of a FIAD directory usually arrives
 * wrapped in a 128-byte TIFILES header, which begins with a length-prefixed
 * "TIFILES". Parsing that as a BASIC header yields nonsense, so it has to go
 * before anything else looks at the bytes.
 */
export function stripContainer(image: Uint8Array): Uint8Array {
    const TIFILES = "TIFILES";
    if (image.length > 128 && image[0] === 0x07) {
        let matches = true;
        for (let i = 0; i < TIFILES.length; i++) {
            if (image[1 + i] !== TIFILES.charCodeAt(i)) { matches = false; break; }
        }
        if (matches) { return image.subarray(128); }
    }
    return image;
}

export function scanTokenized(raw: Uint8Array): Evidence {
    const image = stripContainer(raw);
    const layout = readHeader(image);
    if (!layout) { return NONE; }

    const xbSubs = xbOnlySubprograms();
    let at = layout.firstLine;
    // Each line is a length byte, then that many bytes of tokens ending in >00.
    while (at < image.length) {
        const length = image[at];
        if (length === undefined || length === 0) { break; }
        const end = Math.min(at + 1 + length, image.length);
        const found = scanLine(image, at + 1, end, xbSubs);
        if (found) { return found; }
        at = end;
    }
    return NONE;
}

function scanLine(
    image: Uint8Array, from: number, to: number, xbSubs: Set<string>,
): Evidence | undefined {
    let i = from;
    let previous = 0;
    while (i < to) {
        const b = image[i];

        if (b === QUOTED_STRING || b === UNQUOTED_STRING) {
            const len = image[i + 1] ?? 0;
            // The name after CALL is the one payload worth reading. Numeric
            // literals use the same token, so only this position counts.
            if (b === UNQUOTED_STRING && (previous === CALL || previous === SUB)) {
                let name = "";
                for (let k = 0; k < len; k++) {
                    name += String.fromCharCode(image[i + 2 + k] ?? 0);
                }
                if (xbSubs.has(name.toUpperCase())) {
                    return { extendedBasicProven: true, detail: "CALL " + name.toUpperCase() };
                }
            }
            previous = b;
            i += 2 + len;
            continue;
        }
        if (b === LINE_NUMBER) {
            previous = b;
            i += 3;   // two-byte line number
            continue;
        }

        const detail = XB_ONLY_TOKENS.get(b);
        if (detail !== undefined) {
            return { extendedBasicProven: true, detail };
        }
        previous = b;
        i += 1;
    }
    return undefined;
}

interface Layout { firstLine: number }

/**
 * Locate the first program line.
 *
 * A standard program has an eight-byte header; a long one is marked >ABCD and
 * has ten. Both are followed by the line-number table, and the program lines
 * themselves sit after it. Rather than trust the pointers, which differ
 * between formats and may be relocated, find the lowest address the table
 * points at.
 */
function readHeader(image: Uint8Array): Layout | undefined {
    if (image.length < 12) { return undefined; }
    const long = image[0] === 0xab && image[1] === 0xcd;
    const headerSize = long ? 10 : 8;
    const be = (o: number) => (image[o] << 8) | image[o + 1];

    const topOfProgram = be(long ? 2 : 0);
    const lineTableTop = be(long ? 4 : 2);
    const lineTableBottom = be(long ? 6 : 4);
    if (topOfProgram === 0 || lineTableTop < lineTableBottom) { return undefined; }

    // Addresses are TI-side; convert by anchoring the table top to the header.
    const tableBytes = lineTableTop - lineTableBottom + 1;
    const firstLine = headerSize + tableBytes;
    return firstLine < image.length ? { firstLine } : undefined;
}
