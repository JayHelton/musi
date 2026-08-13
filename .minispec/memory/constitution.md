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

Use MiniSpec for non-trivial features.
Follow this flow: `/minispec.design`, then `/minispec.tasks`, then `/minispec.analyze`, then `/minispec.next` for each chunk, then `/minispec.status`.
Spec Kit is the other option.
See `docs/mini-spec.md` for a comparison of the two toolkits.
Keep feature folders in `specs/`.
One feature folder must use one toolkit only.
Keep MiniSpec tooling upgrades separate from feature artifact changes.
Design and tasks must align with this constitution.

## Workflow

MiniSpec keeps feature folders in `specs/<feature-name>/`.
Each MiniSpec folder holds `design.md` and `tasks.md`.
Spec Kit also uses `specs/`.
One feature folder must use one toolkit only.
Do not mix MiniSpec and Spec Kit artifacts in the same folder.
Verification means you run the CLI.
Verification means you exercise the web UI in a browser.
Verification means you run ad-hoc Node test runners under `tests/`.
Examples: `node tests/workbooks/run.mjs` and `node tests/exercises/run.mjs`.

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

---

## MiniSpec Preferences

### Review Chunk Size

`medium` (40-80 lines per chunk).
This pace balances review depth with steady progress on a static codebase.

### Documentation Review Policy

`review-decisions`.
The engineer reviews `decisions/` only.
The AI may update patterns and modules without a full doc review.

### Autonomy Level

`always-confirm`.
This repo has no CI.
A person must verify each chunk before the AI continues.

### Design Evolution Handling

`flag-and-continue`.
The AI flags design drift, proposes spec updates, and continues when the change is minor.

### Walkthrough Depth

`standard`.
This covers architecture, key patterns, and repo conventions in one session.

---

## Governance

This constitution supersedes other practice when they conflict.
`AGENTS.md` remains the runtime agent instruction source.
Amend this constitution when principles change.
Each amendment needs a version bump and an updated Last Amended date.
Record the ratification date when you adopt a new major version.
When you change principles, update `.specify/memory/constitution.md` and `.minispec/memory/constitution.md`.
Keep both constitution files aligned.

**Version**: 1.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-13
