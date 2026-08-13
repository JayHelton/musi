#!/usr/bin/env node
/**
 * Generates Cursor skills from MiniSpec slash-command files.
 *
 * MiniSpec ships slash commands only. This script writes matching skills under
 * `.cursor/skills/minispec-*`. Run it after a MiniSpec upgrade when command
 * files change.
 *
 * Usage:
 *   node scripts/minispec-skills.mjs
 *   node scripts/minispec-skills.mjs --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS_DIR = path.join(REPO_ROOT, '.cursor', 'commands');
const SKILLS_DIR = path.join(REPO_ROOT, '.cursor', 'skills');
const COMMAND_GLOB_PREFIX = 'minispec.';
const COMMAND_GLOB_SUFFIX = '.md';

function parseArgs(argv) {
  const check = argv.includes('--check');
  for (const arg of argv) {
    if (arg !== '--check') throw new Error(`Unknown option: ${arg}`);
  }
  return { check };
}

function listCommandFiles() {
  if (!fs.existsSync(COMMANDS_DIR)) return [];
  return fs.readdirSync(COMMANDS_DIR)
    .filter((name) => name.startsWith(COMMAND_GLOB_PREFIX) && name.endsWith(COMMAND_GLOB_SUFFIX))
    .map((name) => path.join(COMMANDS_DIR, name))
    .sort();
}

function commandNameFromPath(commandPath) {
  const base = path.basename(commandPath);
  return base.slice(COMMAND_GLOB_PREFIX.length, base.length - COMMAND_GLOB_SUFFIX.length);
}

function parseCommandFile(commandPath) {
  const content = fs.readFileSync(commandPath, 'utf8');
  const frontmatterMatch = content.match(/^---\r?\ndescription:\s*(.*)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error(`${commandPath}: frontmatter must start with ---, then description:, then ---`);
  }
  const description = frontmatterMatch[1].trim();
  if (!description) {
    throw new Error(`${commandPath}: frontmatter description is empty`);
  }
  return { description, body: frontmatterMatch[2] };
}

function escapeYamlDoubleQuoted(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildSkillContent(name, description, body) {
  const quotedDescription = escapeYamlDoubleQuoted(description);
  const frontmatter = [
    '---',
    `name: "minispec-${name}"`,
    `description: "${quotedDescription}"`,
    'compatibility: "Requires minispec project structure with .minispec/ directory"',
    'metadata:',
    '  author: "ivo-toby-mini-spec"',
    `  source: ".cursor/commands/minispec.${name}.md"`,
    '---',
  ].join('\n');
  return `${frontmatter}\n${body}`;
}

function listStaleSkillDirs(activeNames) {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const activeSet = new Set(activeNames.map((name) => `minispec-${name}`));
  return fs.readdirSync(SKILLS_DIR)
    .filter((entry) => entry.startsWith('minispec-') && !activeSet.has(entry))
    .map((entry) => path.join(SKILLS_DIR, entry))
    .sort();
}

function removeDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const commandPaths = listCommandFiles();

  if (commandPaths.length === 0) {
    console.error('No MiniSpec command files found in .cursor/commands/.');
    process.exit(1);
  }

  const skills = commandPaths.map((commandPath) => {
    const name = commandNameFromPath(commandPath);
    const { description, body } = parseCommandFile(commandPath);
    const skillDir = path.join(SKILLS_DIR, `minispec-${name}`);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const content = buildSkillContent(name, description, body);
    return { name, skillDir, skillPath, content };
  });

  const staleDirs = listStaleSkillDirs(skills.map((skill) => skill.name));

  if (args.check) {
    const differingPaths = [];

    for (const staleDir of staleDirs) {
      differingPaths.push(staleDir);
    }

    for (const skill of skills) {
      if (!fs.existsSync(skill.skillPath)) {
        differingPaths.push(skill.skillPath);
        continue;
      }
      const existing = fs.readFileSync(skill.skillPath, 'utf8');
      if (existing !== skill.content) {
        differingPaths.push(skill.skillPath);
      }
    }

    if (differingPaths.length > 0) {
      for (const differingPath of differingPaths) {
        console.log(path.relative(REPO_ROOT, differingPath));
      }
      process.exit(1);
    }
    process.exit(0);
  }

  for (const staleDir of staleDirs) {
    removeDirectory(staleDir);
    console.log(`Removed ${path.relative(REPO_ROOT, staleDir)}`);
  }

  for (const skill of skills) {
    fs.mkdirSync(skill.skillDir, { recursive: true });
    fs.writeFileSync(skill.skillPath, skill.content);
    console.log(`Wrote ${path.relative(REPO_ROOT, skill.skillPath)}`);
  }

  console.log(`Generated ${skills.length} skill(s).`);
}

try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  if (message.startsWith('Unknown option:')) {
    console.error('Usage: node scripts/minispec-skills.mjs [--check]');
  }
  process.exit(1);
}
