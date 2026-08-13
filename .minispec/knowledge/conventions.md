# Musi Conventions

## Agent Instructions

Read `AGENTS.md` for cloud-agent workflow, delivery rules, and gotchas.
It is the runtime instruction source for agents in this repo.

## Visual Design

Use theme tokens in `css/base.css` for palette and shared tokens.
Use `css/theme-gbc.css` for Game Boy Color shell and screen-tile surfaces.
Add feature CSS under `css/<feature>.css` and reuse existing tokens and fonts.

## Spec Workflows

Use Spec Kit for `/speckit-*` flows with `spec.md`, `plan.md`, and `tasks.md`.
Use MiniSpec for `/minispec.*` flows with `design.md` and `tasks.md`.
Do not mix both workflows in the same feature directory.

## Verify Before Ship

Verify changes before you push.
Run `node cli/bin/musi.js --help` or another relevant CLI command.
Serve the repo root over HTTP and exercise the web UI in a browser.
Run relevant runners under `tests/` when they exist.
After JS or CSS edits, hard reload or bump the service-worker cache name.

## Communication Style

Agent-written prose follows ASD-STE100 Simplified Technical English.
Keep technical terms as-is: interval, mode, chord quality, Game Boy Color.
