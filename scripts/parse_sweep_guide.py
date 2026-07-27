#!/usr/bin/env python3
"""Parse the A-centered sweep inversion guide into a JS module."""
import json, re, sys
from pathlib import Path

GUIDE = Path(sys.argv[1] if len(sys.argv) > 1 else 'js/data/sweep-guide.md')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'js/data/sweepLibrary.js')

# Map section headers to pattern ids / names
HEADER_MAP = {
    'A major': ('maj', 'major', ' ', '1 3 5'),
    'A minor': ('min', 'minor', ' ', '1 b3 5'),
    'A diminished': ('dim', 'diminished', ' ', '1 b3 b5'),
    'A augmented': ('aug', 'augmented', ' ', '1 3 #5'),
    'Asus2': ('sus2', 'sus2', '', '1 2 5'),
    'Asus4': ('sus4', 'sus4', '', '1 4 5'),
    'Amaj7': ('maj7', 'maj7', '', '1 3 5 7'),
    'A7': ('7', '7', '', '1 3 5 b7'),
    'Am7': ('m7', 'm7', '', '1 b3 5 b7'),
    'AmMaj7': ('mMaj7', 'mMaj7', '', '1 b3 5 7'),
    'Am7b5': ('m7b5', 'm7b5', '', '1 b3 b5 b7'),
    'Adim7': ('dim7', 'dim7', '', '1 b3 b5 bb7'),
    'Amaj7#5': ('maj7#5', 'maj7#5', '', '1 3 #5 7'),
    'A7#5': ('7#5', '7#5', '', '1 3 #5 b7'),
    'A7b5': ('7b5', '7b5', '', '1 3 b5 b7'),
    'A6': ('6', '6', '', '1 3 5 6'),
    'Am6': ('m6', 'm6', '', '1 b3 5 6'),
    'Aadd9': ('add9', 'add9', '', '1 2 3 5'),
    'Amadd9': ('madd9', 'madd9', '', '1 2 b3 5'),
    'A7sus4': ('7sus4', '7sus4', '', '1 4 5 b7'),
    'A7b9': ('7b9', '7b9', '', '1 b9 3 5 b7'),
    'A7#9': ('7#9', '7#9', '', '1 #9 3 5 b7'),
    'A13': ('13', '13', '', '1 3 5 6 b7'),
    'A13b9': ('13b9', '13b9', '', '1 b9 3 5 6 b7'),
    'A7b9#11': ('7b9#11', '7b9#11', '', '1 b9 3 #11 5 b7'),
    'A7b9b13': ('7b9b13', '7b9b13', '', '1 b9 3 5 b13 b7'),
}

INV_RE = re.compile(
    r'^(Root position|1st inversion|2nd inversion|3rd inversion|4th inversion|5th inversion)\s*—\s*(.+)$',
    re.I,
)
SET_RE = re.compile(r'^([345])-string patterns', re.I)
STRING_ORDER = ['e', 'B', 'G', 'D', 'A', 'E']  # high to low as written in tabs


def parse_tab_block(lines):
    """Parse ASCII tab lines into ordered play events with h/p."""
    rows = {}
    for line in lines:
        m = re.match(r'^([eBGDAE])\|(.*)\|$', line.strip())
        if not m:
            continue
        rows[m.group(1)] = m.group(2)

    if not rows:
        return []

    # Normalize row lengths
    width = max(len(v) for v in rows.values())
    for k, v in list(rows.items()):
        rows[k] = v.ljust(width, '-')

    events = []
    i = 0
    while i < width:
        # Find a token starting at i on any string: optional h/p then digits
        found = None
        for s in STRING_ORDER:
            if s not in rows:
                continue
            row = rows[s]
            if i >= len(row):
                continue
            # tech letter immediately before digits
            if row[i] in 'hp' and i + 1 < len(row) and row[i + 1].isdigit():
                j = i + 1
                while j < len(row) and row[j].isdigit():
                    j += 1
                found = (s, int(row[i + 1:j]), row[i], i, j)
                break
            if row[i].isdigit():
                j = i
                while j < len(row) and row[j].isdigit():
                    j += 1
                found = (s, int(row[i:j]), None, i, j)
                break
        if not found:
            i += 1
            continue
        s, fret, tech, start, end = found
        # Ensure no other string has a note overlapping this column start
        # (already took first in STRING_ORDER which is high→low; play order is
        # low→high ascending then descending, so we need chronological order
        # by column position, and when same column, low string first for asc.)
        # Collect ALL notes whose token starts in [start, end) ... better:
        # gather every token whose start == the leftmost note start at this step.
        # Re-scan: find leftmost token start >= i
        starts = []
        for s2, row in rows.items():
            k = i
            while k < width:
                if row[k] in 'hp' and k + 1 < width and row[k + 1].isdigit():
                    j = k + 1
                    while j < width and row[j].isdigit():
                        j += 1
                    starts.append((k, s2, int(row[k + 1:j]), row[k], j))
                    break
                if row[k].isdigit():
                    j = k
                    while j < width and row[j].isdigit():
                        j += 1
                    starts.append((k, s2, int(row[k:j]), None, j))
                    break
                k += 1
        if not starts:
            i += 1
            continue
        min_col = min(t[0] for t in starts)
        at = [t for t in starts if t[0] == min_col]
        # Same column: play low string first (ascending sweep convention for
        # stacked notes is rare; for sequential tokens at same visual column
        # prefer low→high by string pitch).
        rank = {n: idx for idx, n in enumerate(['E', 'A', 'D', 'G', 'B', 'e'])}
        at.sort(key=lambda t: rank.get(t[1], 99))
        max_end = min_col
        for col, s2, fret, tech, j in at:
            ev = {'s': s2, 'f': fret}
            if tech:
                ev['t'] = tech
            events.append(ev)
            max_end = max(max_end, j)
        i = max_end
    return events


def ban_open_strings(events):
    """Sweep shapes never use open strings — move that string into the 12th zone."""
    open_strings = {e['s'] for e in events if e['f'] == 0}
    if not open_strings:
        return events
    out = []
    for e in events:
        if e['s'] in open_strings:
            ne = dict(e)
            ne['f'] = e['f'] + 12
            out.append(ne)
        else:
            out.append(e)
    return out


def main():
    text = GUIDE.read_text()
    lines = text.splitlines()

    library = []  # list of {id,name,join,formula,stringSet,inversion,bassLabel,events}
    current = None  # chord meta
    string_set = None
    inv = None
    inv_label = None
    bass_label = None
    tab_buf = []
    in_tab = False

    def flush_tab():
        nonlocal tab_buf, in_tab
        if current and string_set is not None and inv is not None and tab_buf:
            events = ban_open_strings(parse_tab_block(tab_buf))
            if events:
                library.append({
                    'id': current[0],
                    'name': current[1],
                    'join': current[2],
                    'formula': current[3],
                    'stringSet': string_set,
                    'inversion': inv,
                    'bassLabel': bass_label,
                    'events': events,
                })
        tab_buf = []
        in_tab = False

    for line in lines:
        stripped = line.strip()
        # Chord header: exact match keys, optionally with trailing ####
        key = stripped.rstrip('#').strip()
        if key in HEADER_MAP:
            flush_tab()
            current = HEADER_MAP[key]
            string_set = None
            inv = None
            continue
        sm = SET_RE.match(stripped)
        if sm:
            flush_tab()
            string_set = int(sm.group(1))
            inv = None
            continue
        im = INV_RE.match(stripped)
        if im:
            flush_tab()
            label = im.group(1).lower()
            bass_label = im.group(2).strip()
            inv_map = {
                'root position': 0,
                '1st inversion': 1,
                '2nd inversion': 2,
                '3rd inversion': 3,
                '4th inversion': 4,
                '5th inversion': 5,
            }
            inv = inv_map[label]
            continue
        if re.match(r'^[eBGDAE]\|', stripped):
            in_tab = True
            tab_buf.append(stripped)
            continue
        if in_tab and stripped == '':
            flush_tab()
            continue
        if in_tab and not re.match(r'^[eBGDAE]\|', stripped):
            flush_tab()

    flush_tab()

    # Deduplicate by (id, stringSet, inversion) keeping first
    seen = set()
    unique = []
    for p in library:
        k = (p['id'], p['stringSet'], p['inversion'])
        if k in seen:
            continue
        seen.add(k)
        unique.append(p)

    # Validate counts
    by_id = {}
    for p in unique:
        by_id.setdefault(p['id'], []).append(p)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    js = '// Auto-generated from the A-centered sweep inversion guide. Do not edit by hand.\n'
    js += 'export const SWEEP_LIBRARY = '
    js += json.dumps(unique, indent=2)
    js += ';\n'
    js += f'export const SWEEP_LIBRARY_COUNT = {len(unique)};\n'
    OUT.write_text(js)

    print(f'Wrote {len(unique)} patterns to {OUT}')
    for cid, items in sorted(by_id.items()):
        sets = sorted({i["stringSet"] for i in items})
        invs = sorted({i["inversion"] for i in items})
        print(f'  {cid}: {len(items)} shapes, sets={sets}, invs={invs}')

if __name__ == '__main__':
    main()
