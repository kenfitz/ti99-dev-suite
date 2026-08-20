# Contributing

Thanks for your interest in the TI-99/4A Development Suite. This is a small
project for a small community, and input from people actually writing TMS9900
code is genuinely valuable.

## What is welcome

**Bug reports.** If something misbehaves, please open an issue. Assembler and
emulator behaviour varies a lot between setups, so details about your xdt99
version, emulator and source dialect help more than you might expect.

**Feature requests and suggestions.** Ideas for new capabilities, better
workflows, or support for toolchains and emulators that are not covered yet.

**Discussion and technical feedback.** Corrections about TMS9900, the E/A
environment, cartridge formats, disk formats, or anything else where the
extension gets the hardware or the tooling wrong. This is the kind of feedback
that is hardest to get and most useful to receive.

Real-world sample sources that reproduce a problem are especially helpful.

## What is not being accepted right now

**External code contributions and pull requests are not currently accepted.**

The project is maintained directly by KF1TZ Software, and at this stage keeping
the codebase under single authorship is a deliberate choice rather than a
comment on anyone's work. Unsolicited pull requests may be closed without
review.

If you would like to see a change made:

1. Open an issue describing the problem or the capability you want.
2. Wait for a reply before writing any code.

Please do not start work on a change expecting it to be merged. That protects
your time as much as anything else.

You are welcome to fork the repository and modify it for your own use, within
the terms of the MIT licence.

## Reporting a bug

Use the **Bug report** issue template. The fields it asks for are the ones that
usually determine whether a problem can be reproduced:

- extension version and VS Code version
- operating system
- xdt99 version, if the problem involves building
- emulator, if the problem involves running
- steps to reproduce, and what you expected instead

Output from the **TI-99** channel in the Output panel is often the single most
useful thing you can attach.

## Requesting a feature

Use the **Feature request** issue template. Describing the TI-99/4A workflow
you are trying to complete is more useful than describing a proposed
implementation, because it leaves room for a better solution than either of us
had in mind.

## Security

Please do not report suspected vulnerabilities in a public issue. See
[SECURITY.md](SECURITY.md).

## Code of conduct

Be civil and stay on topic. Discussion should be about the software and the
hardware, not about the people involved.
