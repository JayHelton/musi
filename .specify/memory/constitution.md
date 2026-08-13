# Musi Constitution

## Core Principles

### I. Static-First Architecture

Musi is a fully static, frontend-only product.
The core product has no backend, database, or API.
Musi ships two deliverables that share the same music-theory engine in `js/`.
The web app is a PWA at the repo root.
It uses plain HTML, CSS, and ES modules.
It has no build step and no framework.
The CLI lives in `cli/`.
It is a zero-dependency Node.js program.
The CLI requires Node.js version 18 or newer.
Do not add a backend or API for core product features.

### II. Shared Theory Engine

Put music-theory logic in shared `js/` when both web and CLI need the same behavior.
Keep the CLI zero-dependency.
Do not add npm packages to `cli/` for theory that belongs in `js/`.
Match existing module patterns in `js/` before you add new abstractions.

### III. Atomic Purple Game Boy Color UI

The web UI uses an Atomic Purple Game Boy Color aesthetic.
Use theme tokens in `css/base.css` and `css/theme-gbc.css`.
Use the pixel font stack: Press Start 2P, Pixelify Sans, and VT323.
Panels must read as LCD screen tiles, not flat black cards.
Reuse `--radius-screen`, `--radius-pill`, and theme tokens.
Do not restyle toward SaaS purple-on-white layouts.
Do not restyle toward cream or terracotta editorial layouts.
Do not restyle toward broadsheet newspaper layouts.
Keep ambient GBC motion subtle and purposeful.

### IV. Verify Before Ship

This repo has no CI, lint tooling, or test framework.
Verify changes before you ship them.
Run CLI smoke commands, for example `node cli/bin/musi.js --help`.
Serve the repo root over HTTP and exercise the web UI in a browser.
Run relevant Node runners under `tests/` when they exist.
Examples: `node tests/workbooks/run.mjs` and `node tests/exercises/run.mjs`.
After you edit JS or CSS, do a hard reload or bump the service-worker cache name.
Audio and mic features need a browser with Web Audio and microphone access.
Non-audio features can verify in a browser without mic access.

### V. Spec-Driven Feature Work

Use Spec Kit for non-trivial features.
Follow this flow: `/speckit-specify`, then plan, then tasks, then implement, then converge.
MiniSpec is the other toolkit.
MiniSpec runs a pair-programming loop.
The MiniSpec constitution lives at `.minispec/memory/constitution.md`.
Keep feature specs in `specs/`.
One feature folder must use one toolkit only.
Keep Spec Kit tooling updates separate from feature artifact changes.
Plans and tasks must align with this constitution.

## Communication

Agent-written docs, comments, and product copy follow ASD-STE100 Simplified Technical English.
Use short sentences, active voice, and simple words.
Write one instruction per sentence.
Do not reword verbatim UI strings, code, file paths, commands, or error text.
Keep technical project terms as-is.
Examples include interval, mode, chord quality, and Game Boy Color theme tokens.

## Agent Workflow

When `AGENTS.md` applies, the main agent thread plans and coordinates work.
Composer 2.5 sub-agents perform implementation.
Launch sub-agents in parallel when tasks are independent.
Sequence sub-agents when one task needs output from another.
Give each sub-agent a focused prompt with enough context to finish its slice.

## Delivery

The repo prefers trunk-based delivery.
Push finished work straight to `main`.
Only push complete, working features.
Before you push, pull and rebase onto `origin/main`.
A cloud-agent harness may force branch and PR delivery.
When that happens, state the override explicitly.
Do not silently open a PR against the trunk preference.

## Governance

This constitution guides Spec Kit plans and tasks.
`AGENTS.md` remains the runtime agent instruction source.
Amend this constitution when principles change.
Each amendment needs a version bump and an updated Last Amended date.
Record the ratification date when you adopt a new major version.
When you change principles, update `.specify/memory/constitution.md` and `.minispec/memory/constitution.md`.
Keep both constitution files aligned.

**Version**: 1.1.0 | **Ratified**: 2026-08-12 | **Last Amended**: 2026-08-13
