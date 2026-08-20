Source naming and language resolution
=====================================

Canonical extensions and compatibility aliases
----------------------------------------------

New projects created by this extension use the canonical extension. The
aliases are recognised as first-class equivalents and are never treated as
second-class or deprecated.

| Language              | Canonical | Alias  |
|-----------------------|-----------|--------|
| TMS9900 Assembly      | `.a99`    | `.asm` |
| TI BASIC              | `.b99`    | -      |
| TI Extended BASIC     | `.xb99`   | `.xb`  |
| GPL                   | `.g99`    | `.gpl` |
| BASIC, dialect-neutral| -         | `.bas` |

`.bas` names a BASIC program without saying which dialect. It is neutral by
definition, not merely unrecognised.

Where these came from
---------------------

`.a99` and `.g99` are the primary extensions xas99 and xga99 already look for,
and `.asm` and `.gpl` are among the alternatives they accept:

    xas99.py   extensions = ['', '.a99', '.A99', '.asm', '.ASM', '.s', '.S']
    xga99.py   extensions = ['', '.g99', '.G99', '.gpl', '.GPL', '.g', '.G']

So the assembly and GPL conventions are xdt99 conventions, not new ones.

`.b99` is the extension xbas99 writes by default when it detokenizes a
program. Note carefully what that does and does not mean: xbas99 uses it for
**both** dialects, because xbas99 does not distinguish them at all. It has one
token table, one mode, and one tool for TI BASIC and Extended BASIC alike. The
editor support shipped with xdt99 maps `.b99`, `.bas` and `.xb` to the same
BASIC mode.

`.b99` therefore does **not** historically mean TI BASIC specifically. This
extension adopts it as the canonical name for new TI BASIC source, which is a
narrowing of the xdt99 meaning, and resolution is built to respect the wider
meaning for files that already exist.

`.xb` is the closest thing to an existing Extended BASIC convention. It is
documented in the xdt99 editor support and appears in public TI source, though
in small numbers. It is accepted as a first-class alias.

`.xb99` is a modern convention introduced by this extension for consistency
with the `.a99` / `.b99` / `.g99` family. It was **not** used on the original
TI and has no historical standing. Research before adopting it found no
existing use of `.xb99` in xdt99, in public repositories, or in community
documentation, so nothing conflicts with it.

Resolution precedence
---------------------

1. Explicit per-file override
2. Explicit project configuration
3. Canonical extension
4. Deterministic content evidence
5. User selection

Strength, and why `.b99` is a special case
------------------------------------------

Levels 1 and 2 are declarations of intent. Level 3 is a presumption drawn from
a filename. Those are not the same kind of claim, and treating them as one
produces a wrong answer for exactly one extension.

A presumption is either strong or weak:

- `.a99`, `.xb99`, `.g99`, and the aliases are **strong**. Each names one
  language and nothing else uses it that way.
- `.b99` is **weak**, because xdt99 writes it for both dialects. An existing
  `.b99` file is genuinely more likely to be Extended BASIC than the name
  suggests.

Content evidence is asymmetric. Finding an Extended BASIC-only construct
proves Extended BASIC. Finding none proves nothing, because every valid TI
BASIC program is also a valid Extended BASIC program.

Combining those two facts:

- Evidence overrides a **weak** presumption. A `.b99` file containing
  `CALL SPRITE` resolves as Extended BASIC, because it cannot be TI BASIC.
- Evidence does not override a **declaration**. A project that declares
  `ti-basic` and contains `CALL SPRITE` resolves as TI BASIC and reports a
  dialect diagnostic. The user said what they meant; the construct is the
  error, not the declaration.
- Evidence conflicting with a **strong** presumption is reported rather than
  silently applied.

Never infer TI BASIC from the absence of Extended BASIC constructs. Absence is
not evidence here. When nothing above resolves the dialect, ask.

Tokenized programs
------------------

The same asymmetry applies to a program read off a disk, but the scan must
walk the token stream and skip the payloads of quoted strings, unquoted
strings, line numbers and DATA. A byte inside a string can equal an Extended
BASIC token value by coincidence, so a flat byte scan produces false
positives.

Import naming
-------------

Resolve the dialect first, then choose the filename from the resolved dialect.
Do not let the default output name of xbas99 decide it, since that default is
`.b99` for both dialects and would silently mislabel every imported Extended
BASIC program.

    Extended BASIC proven   ->  .xb99
    ambiguous               ->  ask, then .b99 or .xb99

Renaming
--------

When a file is configured as Extended BASIC but named `.b99`, the extension
may offer to rename it to `.xb99`. This is an offer, never automatic, and
never an error. Accepting it updates `ti99.json`, `entrySource`, target
references and any sidecar association.
