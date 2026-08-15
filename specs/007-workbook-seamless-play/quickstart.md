# Quickstart: Workbook Seamless Play

## Node checks

```bash
node tests/gp-player/run.mjs
node tests/workbooks/run.mjs
node cli/bin/musi.js --help
```

## Browser check

1. Serve the repo root over HTTP.
2. Open Workbooks.
3. Open a workbook with two Guitar Pro exercises.
4. Turn Loop off.
5. Press Play.
6. Confirm the second exercise starts with no gap and no score reload.
7. Press Next. Confirm the playhead jumps and playback continues.
8. Turn Loop on. Confirm the current exercise repeats.
