# MiniSpec in Musi

[MiniSpec](https://github.com/ivo-toby/mini-spec) is a pair-programming Spec-Driven
Development toolkit. The engineer navigates. The AI drives. Musi uses MiniSpec with
Cursor (`cursor-agent`).

MiniSpec sits beside [Spec Kit](spec-kit.md) in this repo. Do not remove `.specify/`
or `.cursor/skills/speckit-*` scaffolding.

For the upstream project, see
[ivo-toby/mini-spec](https://github.com/ivo-toby/mini-spec).

## Prerequisites

You need these tools on your machine:

- Python 3.11 or newer
- [uv](https://docs.astral.sh/uv/) (Python package and tool manager)
- `minispec-cli` (the MiniSpec CLI)

## Install the CLI

Install the CLI pinned to the git tag used in this repo:

```bash
uv tool install minispec-cli --from git+https://github.com/ivo-toby/mini-spec.git@v0.0.11
```

Musi already has MiniSpec scaffolding in this repo. Init was run with:

```bash
minispec init --here --force --ai cursor-agent --script sh
```

You do not need to run `minispec init` again unless you reset the project.

## What is already in this repo

| Path | Purpose |
| ---- | ------- |
| `.minispec/` | Templates, scripts, hooks, and integration config |
| `.cursor/skills/minispec-*` | Cursor skills for each MiniSpec workflow step |
| `.cursor/commands/minispec.*.md` | Cursor IDE slash commands for each workflow step |
| `.minispec/memory/constitution.md` | Project constitution (principles for design and tasks) |
| `.minispec/knowledge/` | Project knowledge (architecture, conventions, patterns) |
| `specs/` | Feature design and tasks (created per feature) |

This repo was initialized with MiniSpec template v0.0.11 and `minispec-cli` 0.5.1
from git tag `v0.0.11` for `cursor-agent`.

## Cursor workflow skills

In Cursor chat, type `/` and pick a skill name. Run them in this order for a
new feature:

1. `/minispec-constitution` (or `/minispec.constitution`) — create or update the
   project constitution (do this once, or when principles change)
2. `/minispec-walkthrough` — explore an existing codebase before you design a
   feature (skip for greenfield work)
3. `/minispec-design` — write or update the feature design from a plain-language
   description
4. `/minispec-tasks` — break the design into concrete tasks
5. `/minispec-analyze` — optional consistency check across design and tasks
6. `/minispec-next` — implement one task chunk at a time
7. `/minispec-status` — review progress on the active feature

Optional skills:

| Skill | Use when |
| ----- | -------- |
| `/minispec-checklist` | You want a quality checklist before implementation |
| `/minispec-validate-docs` | You need to check documentation against the design |
| `/minispec-import` | You want to convert a Spec Kit `spec.md` into a MiniSpec design |
| `/minispec-registry` | You want to browse or install MiniSpec registry packages |

Skill files live under `.cursor/skills/minispec-*`. Each folder has a `SKILL.md`
file with full instructions for the agent.

## Feature artifacts

Each feature gets a directory under `specs/`. A typical MiniSpec layout:

```text
specs/
└── 001-feature-name/
    ├── design.md
    └── tasks.md
```

The `/minispec-design` skill creates the directory and writes `design.md`. The
`/minispec-tasks` skill writes `tasks.md` in the same folder.

Spec Kit uses a different layout in the same `specs/` tree:

```text
specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    └── tasks.md
```

Do not mix both workflows in one feature directory. Use `/minispec-import` to
convert a Spec Kit spec into a MiniSpec design.

Musi uses sequential numbering (`001`, `002`, …) for feature directory names.

## Constitution

The constitution is at `.minispec/memory/constitution.md`. It defines Musi
principles for design and task work.

Designs and tasks must follow the constitution. Run `/minispec-constitution` when
you need to add or change principles.

## Knowledge

Project knowledge lives under `.minispec/knowledge/`. It holds architecture notes,
conventions, and patterns the agent can read during design and implementation.

## Upgrade MiniSpec

To upgrade the CLI in your environment:

```bash
uv tool upgrade minispec-cli
```

Then run from the project root:

```bash
minispec upgrade
```

Use upgrades with care. MiniSpec updates can change templates, skills, and
scripts under `.minispec/` and `.cursor/skills/minispec-*`.

Keep tooling upgrades separate from feature work. Do not mix a MiniSpec upgrade
commit with feature design or implementation changes.

After an upgrade, read the release notes. Re-run verification on an existing
feature if templates changed.

## Cursor Cloud

Cloud Agents install `uv` and `minispec-cli` through
`scripts/cloud-agent-install.sh`. The install script runs from
`.cursor/environment.json` or from the dashboard `install` field.

Skills live under `.cursor/skills/minispec-*`. Commands live under
`.cursor/commands/` for the Cursor IDE slash menu. Cloud Agents use the skills.

After install, agents can run `minispec` and use Cursor skills under
`.cursor/skills/minispec-*`.

If you set up a personal dashboard environment separately, you must click
Save when the agent proposes changes. The repo file overrides the dashboard
when agents start from a revision that contains `.cursor/environment.json`.

## More help

- Upstream repo: [ivo-toby/mini-spec](https://github.com/ivo-toby/mini-spec)
- Spec Kit in Musi: [docs/spec-kit.md](spec-kit.md)
- Agent rules for Musi: `AGENTS.md` (MiniSpec subsection)
