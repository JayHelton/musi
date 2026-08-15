# Quickstart: Workbook Seamless Play

## Node checks

```bash
node tests/gp-player/run.mjs
node tests/workbooks/run.mjs
node cli/bin/musi.js --help
```

## Browser check

1. Serve the repo root over HTTP.
2. Optional seed: open `tests/workbooks/seed-playthrough.html`.
3. Open Workbooks.
4. Open a workbook with two Guitar Pro exercises.
5. Turn Loop off.
6. Press Play.
7. Confirm the second exercise starts with no gap and no score reload.
8. Press Next. Confirm the playhead jumps and playback continues.
9. Turn Loop on. Confirm the current exercise repeats.
