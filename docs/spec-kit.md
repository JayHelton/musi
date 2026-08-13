# Spec Kit in Musi

[GitHub Spec Kit](https://github.com/github/spec-kit) is a Spec-Driven Development
toolkit. You write a feature spec first. You plan and task from that spec. You
implement against the plan. Musi uses Spec Kit with Cursor (`cursor-agent`).

For the upstream quickstart, see
[spec-kit quickstart](https://github.github.io/spec-kit/quickstart.html).

## Prerequisites

You need these tools on your machine:

- Python 3.11 or newer
- [uv](https://docs.astral.sh/uv/) (Python package and tool manager)
- `specify-cli` (the Spec Kit CLI)

## Install the CLI

Install the latest release:

```bash
uv tool install specify-cli
```

To pin a version from the Git repository:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.16.2
```

Replace `v0.16.2` with the tag you want.

Musi already has Spec Kit scaffolding in this repo. You do not need to run
`specify init` again unless you reset the project.

## What is already in this repo

| Path | Purpose |
| ---- | ------- |
| `.specify/` | Templates, scripts, workflows, and integration config |
| `.cursor/skills/speckit-*` | Cursor skills for each Spec Kit workflow step |
| `.specify/memory/constitution.md` | Project constitution (principles for specs and plans) |
| `specs/` | Feature specs, plans, and tasks (created per feature) |

This repo was initialized with `specify-cli` 0.16.2 for `cursor-agent` with
skills enabled.

## Cursor workflow skills

In Cursor chat, type `/` and pick a skill name. Run them in this order for a
new feature:

1. `/speckit-constitution` — create or update the project constitution (do this
   once, or when principles change)
2. `/speckit-specify` — write or update the feature spec from a plain-language
   description
3. `/speckit-plan` — generate the implementation plan from the spec
4. `/speckit-tasks` — break the plan into concrete tasks
5. `/speckit-implement` — implement the tasks
6. `/speckit-converge` — review and align the code with the spec

Optional skills:

| Skill | Use when |
| ----- | -------- |
| `/speckit-clarify` | The spec has gaps or ambiguous requirements |
| `/speckit-analyze` | You need a consistency check across spec, plan, and tasks |
| `/speckit-checklist` | You want a quality checklist before implementation |
| `/speckit-taskstoissues` | You want to export tasks to GitHub issues |

Skill files live under `.cursor/skills/`. Each folder has a `SKILL.md` file
with full instructions for the agent.

## Feature artifacts

Each feature gets a directory under `specs/`. A typical layout:

```text
specs/
└── 001-feature-name/
    ├── spec.md
    ├── plan.md
    └── tasks.md
```

The `/speckit-specify` skill creates the directory and writes `spec.md`. Later
skills add plan and task files in the same folder.

Musi uses sequential numbering (`001`, `002`, …) for feature directory names.

## Active feature pointer

The CLI and skills track the current feature in `.specify/feature.json`. This
file is gitignored. It stores the path to the active feature directory (for
example `specs/003-user-auth`).

Do not commit `feature.json`. Each checkout keeps its own active feature.

You can also set `SPECIFY_FEATURE_DIRECTORY` in the environment when you work
on a specific feature.

## Constitution

The constitution is at `.specify/memory/constitution.md`. It defines Musi
principles: static-first architecture, shared theory engine, Game Boy Color UI,
verify-before-ship, and spec-driven feature work.

Plans and tasks must follow the constitution. Run `/speckit-constitution` when
you need to add or change principles.

## Upgrade Spec Kit

To upgrade the CLI in your environment:

```bash
specify self upgrade
```

Use upgrades with care. Spec Kit updates can change templates, skills, and
scripts under `.specify/` and `.cursor/skills/`.

Keep tooling upgrades separate from feature work. Do not mix a Spec Kit upgrade
commit with feature spec or implementation changes.

After an upgrade, read the release notes. Re-run verification on an existing
feature if templates changed.

## Cursor Cloud

Cloud Agents install `uv` and `specify-cli` through
`scripts/cloud-agent-install.sh`. The install script runs from
`.cursor/environment.json` or from the dashboard `install` field.

After install, agents can run `specify` and use Cursor skills under
`.cursor/skills/`.

If you set up a personal dashboard environment separately, you must click
Save when the agent proposes changes. The repo file overrides the dashboard
when agents start from a revision that contains `.cursor/environment.json`.

## MiniSpec in this repo

This repo also has [MiniSpec](https://github.com/ivo-toby/mini-spec) for
pair-programming spec work. MiniSpec sits beside Spec Kit. Do not remove
`.specify/` or speckit skills.

See [docs/mini-spec.md](mini-spec.md) for MiniSpec install, skills, and upgrade
notes. Do not mix Spec Kit and MiniSpec artifacts in one feature directory.

## More help

- Upstream repo: [github/spec-kit](https://github.com/github/spec-kit)
- Quickstart: [github.github.io/spec-kit/quickstart.html](https://github.github.io/spec-kit/quickstart.html)
- MiniSpec in Musi: [docs/mini-spec.md](mini-spec.md)
- Agent rules for Musi: `AGENTS.md` (Spec Kit section)
