# MiniSpec in Musi

[MiniSpec](https://github.com/ivo-toby/mini-spec) is a fork of
[GitHub Spec Kit](https://github.com/github/spec-kit). It turns Spec-Driven
Development into a pair-programming loop. The engineer navigates. The AI agent
drives. The agent implements one small chunk at a time. The engineer reviews
each chunk.

Spec Kit writes a full spec, plan, and task list up front. MiniSpec writes a
design and tasks, then runs a `/minispec.next` loop for each chunk. MiniSpec
also grows a knowledge base under `.minispec/knowledge/`.

Musi uses MiniSpec with Cursor (`cursor-agent`). Spec Kit skills under
`.cursor/skills/speckit-*` stay separate. See [docs/spec-kit.md](spec-kit.md)
for the Spec Kit workflow.

## Prerequisites

You need these tools on your machine:

- Python 3.11 or newer
- [uv](https://docs.astral.sh/uv/) (Python package and tool manager)
- `minispec-cli` (the MiniSpec CLI)

## Install the CLI

Install from the Git repository:

```bash
uv tool install minispec-cli --from git+https://github.com/ivo-toby/mini-spec.git
```

Musi already has MiniSpec scaffolding in this repo. You do not need to run
`minispec init` again unless you reset the project.

This repo was initialized with release template v0.0.11 for `cursor-agent`.

## What is already in this repo

| Path | Purpose |
| ---- | ------- |
| `.minispec/` | Templates, scripts, hooks, and integration config |
| `.minispec/memory/constitution.md` | Project constitution (principles for design and tasks) |
| `.minispec/knowledge/` | Decision records, patterns, and module docs (folder does not exist yet; the agent creates it on first use) |
| `.minispec/scripts/bash/` | Bash helpers (`common.sh`, `check-prerequisites.sh`, and others) |
| `.minispec/templates/` | Design, tasks, checklist, agent-file, and knowledge templates |
| `.minispec/hooks/` | Claude Code hook adapters (no effect in Cursor) |
| `.cursor/commands/minispec.*` | Eleven slash commands for the MiniSpec workflow |
| `specs/` | Feature design and tasks (created per feature) |

The Spec Kit paths (`.specify/`, `.cursor/skills/speckit-*`) also remain in
this repo. Use one toolkit per feature folder.

## Cursor slash-command workflow

In Cursor chat, type `/` and pick a `minispec.*` command. Run them in this
order for a new feature:

1. `/minispec.constitution` — create or update the project constitution (do
   this once, or when principles change)
2. `/minispec.walkthrough` — learn an existing codebase before you design a
   feature
3. `/minispec.design "<feature>"` — write or update the feature design from a
   plain-language description
4. `/minispec.tasks` — break the design into concrete tasks
5. `/minispec.analyze` — run a consistency check across design and tasks
6. `/minispec.next` — implement the next task chunk (repeat until done)
7. `/minispec.status` — show progress on the active feature

Optional commands:

| Command | Use when |
| ------- | -------- |
| `/minispec.checklist` | You want a quality checklist before implementation |
| `/minispec.validate-docs` | You need to check docs against the knowledge base |
| `/minispec.import` | You want to import a Spec Kit or OpenSpec spec |

Command files live under `.cursor/commands/`. Each file has full instructions
for the agent.

## Feature artifacts

Each feature gets a directory under `specs/`. MiniSpec names the folder after
the Git branch. A typical layout:

```text
specs/
└── feature-tempo-trainer/
    ├── design.md
    └── tasks.md
```

The `/minispec.design` command creates the directory and writes `design.md`.
It takes the folder name from the current branch and replaces `/` with `-`.
The script `.minispec/scripts/bash/create-new-feature.sh` creates numbered
folders such as `001-feature-name`.
Later commands add and update `tasks.md` in the same folder.

### Shared `specs/` directory

Both MiniSpec and Spec Kit use the top-level `specs/` directory. MiniSpec
writes `design.md` and `tasks.md`. Spec Kit writes `spec.md`, `plan.md`, and
`tasks.md`. Both toolkits write `tasks.md`.

Use one toolkit per feature folder. Do not mix MiniSpec and Spec Kit artifacts
in the same directory.

## Active feature pointer

The scripts track the current feature from the Git branch name. They also read
the `MINISPEC_FEATURE` environment variable when you set it.

MiniSpec refuses to run on `main`, `master`, `develop`, and `production`. You
must work on a feature branch for MiniSpec commands and scripts.

## Knowledge base

MiniSpec stores project knowledge under `.minispec/knowledge/`. This folder
does not exist yet in this repo. The agent adds decision records, patterns, and
module docs as features progress. This folder grows over time. It is separate
from per-feature files in `specs/`.

## Constitution

The constitution is at `.minispec/memory/constitution.md`. It defines Musi
principles for design and task work.

Design and tasks must follow the constitution. Run `/minispec.constitution` when
you need to add or change principles.

## Upgrade MiniSpec

Upgrade the CLI and project scaffolding in two steps.

Step 1 upgrades the CLI in your environment:

```bash
uv tool upgrade minispec-cli
```

This step works when you installed the CLI from the Git repository.

Step 2 updates scaffolding in the project. Run this command from the repo root:

```bash
minispec upgrade
```

`minispec upgrade` overwrites scripts and hooks under `.minispec/`. It shows a
diff for command files and templates. It never changes `specs/**`,
`.minispec/memory/**`, or `.minispec/knowledge/**`.

Review changes with `git diff` before you commit.
Keep tooling upgrades separate from feature work.
Do not mix a MiniSpec upgrade commit with feature design or implementation
changes.

After an upgrade, read the release notes. Re-run verification on an existing
feature if templates changed.

## MiniSpec CLI subcommands

The CLI also provides these commands:

- `minispec registry`, `search`, `install`, `list`, `uninstall`, `update` —
  opt-in package registries
- `minispec init-registry` — set up a local registry

See the upstream repo for full CLI help.

## Cursor Cloud

Cloud Agents install `uv` and `minispec-cli` through
`scripts/cloud-agent-install.sh`. The install script runs from
`.cursor/environment.json` or from the dashboard `install` field.

After install, agents can run `minispec` and use slash commands under
`.cursor/commands/minispec.*`.

If you set up a personal dashboard environment separately, you must click
Save when the agent proposes changes. The repo file overrides the dashboard
when agents start from a revision that contains `.cursor/environment.json`.

## More help

- Upstream repo: [ivo-toby/mini-spec](https://github.com/ivo-toby/mini-spec)
- Spec Kit workflow in Musi: [docs/spec-kit.md](spec-kit.md)
- Agent rules for Musi: `AGENTS.md` (MiniSpec section)
