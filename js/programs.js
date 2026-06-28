import {
  createSession,
  deleteSession,
  getHistory,
  getSession,
  sessionTotalMinutes,
  toolName,
} from './sessions.js';

export const PROGRAMS_STORAGE_KEY = 'musi.programs';

const PROGRAM_NAME_LIMIT = 80;
const PROGRAM_NOTES_LIMIT = 4000;

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function readKey(key) {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function writeKey(key, value) {
  if (!canUseStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

let programsCache = null;

function uid(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function slug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'program';
}

function nowISO() {
  return new Date().toISOString();
}

function cleanTitle(text, fallback) {
  const title = String(text || '')
    .replace(/\s+#+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (title || fallback).slice(0, PROGRAM_NAME_LIMIT);
}

function clampNotes(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+$/, '').slice(0, PROGRAM_NOTES_LIMIT);
}

function normalizeProgram(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionIds = Array.isArray(raw.sessionIds)
    ? raw.sessionIds.filter(id => typeof id === 'string' && id)
    : [];
  const created = typeof raw.createdAt === 'string' ? raw.createdAt : nowISO();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('program'),
    name: cleanTitle(raw.name, 'Untitled Program'),
    notes: clampNotes(raw.notes),
    sessionIds,
    createdAt: created,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
  };
}

function persistPrograms() {
  if (!programsCache) return;
  writeKey(PROGRAMS_STORAGE_KEY, JSON.stringify(programsCache));
}

export function getPrograms() {
  if (programsCache) return programsCache;
  const raw = readKey(PROGRAMS_STORAGE_KEY);
  if (!raw) {
    programsCache = [];
    return programsCache;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    programsCache = parsed.map(normalizeProgram).filter(Boolean);
  } catch (e) {
    programsCache = [];
    persistPrograms();
  }
  return programsCache;
}

export function getProgram(id) {
  return getPrograms().find(p => p.id === id) || null;
}

export function getProgramSessions(program) {
  if (!program || !Array.isArray(program.sessionIds)) return [];
  return program.sessionIds.map(getSession).filter(Boolean);
}

export function parseProgramMarkdown(markdown, preferredName = '') {
  const source = String(markdown || '').replace(/\r\n?/g, '\n');
  const h1 = source.match(/^\s*#(?!#)\s+(.+)$/m);
  const headerRe = /^##(?!#)\s+(.+)$/gm;
  const matches = Array.from(source.matchAll(headerRe));

  const firstHeaderIndex = matches.length ? matches[0].index : source.length;
  let intro = source.slice(0, firstHeaderIndex).trim();
  if (h1) intro = intro.replace(h1[0], '').trim();

  const programName = cleanTitle(preferredName || (h1 && h1[1]) || 'Practice Program', 'Practice Program');
  const sessions = matches.map((match, index) => {
    const next = matches[index + 1];
    const start = match.index + match[0].length;
    const end = next ? next.index : source.length;
    return {
      title: cleanTitle(match[1], `Session ${index + 1}`),
      notes: source.slice(start, end).trim(),
    };
  });

  return {
    name: programName,
    notes: clampNotes(intro),
    sessions,
  };
}

export function createProgramFromMarkdown({ name, markdown }) {
  const parsed = parseProgramMarkdown(markdown, name);
  const errors = [];
  if (!parsed.name) errors.push('Program needs a name.');
  if (!parsed.sessions.length) errors.push('Paste markdown with at least one ## session header.');
  if (errors.length) return { ok: false, errors };

  const programId = uid(`program-${slug(parsed.name)}`);
  const createdSessions = [];
  parsed.sessions.forEach(section => {
    const result = createSession({
      name: section.title,
      notes: section.notes,
      programId,
      drills: [{
        toolId: 'metronome',
        toolName: toolName('metronome'),
        label: 'Metronome exercise',
        notes: 'One-hour metronome block generated from this program.',
        durationMinutes: 60,
      }],
    });
    if (result.ok) createdSessions.push(result.session);
    else errors.push(`${section.title}: ${result.errors.join(' ')}`);
  });

  if (errors.length || createdSessions.length === 0) return { ok: false, errors };

  const t = nowISO();
  const program = {
    id: programId,
    name: parsed.name,
    notes: parsed.notes,
    sessionIds: createdSessions.map(s => s.id),
    createdAt: t,
    updatedAt: t,
  };
  getPrograms().unshift(program);
  persistPrograms();
  return { ok: true, program, sessions: createdSessions };
}

export function deleteProgram(id, { deleteSessions = true } = {}) {
  const programs = getPrograms();
  const idx = programs.findIndex(p => p.id === id);
  if (idx < 0) return false;
  const [program] = programs.splice(idx, 1);
  if (deleteSessions) program.sessionIds.forEach(sessionId => deleteSession(sessionId));
  persistPrograms();
  return true;
}

export function programProgress(program) {
  const sessions = getProgramSessions(program);
  const completedIds = new Set(
    getHistory()
      .filter(item => item && item.completed)
      .map(item => item.sessionId)
      .filter(Boolean),
  );
  const completed = sessions.filter(s => completedIds.has(s.id)).length;
  const nextSession = sessions.find(s => !completedIds.has(s.id)) || sessions[0] || null;
  return {
    total: sessions.length,
    completed,
    nextSession,
    totalMinutes: sessions.reduce((sum, session) => sum + sessionTotalMinutes(session), 0),
  };
}
