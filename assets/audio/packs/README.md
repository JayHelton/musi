# Sound packs

Sound packs live under `assets/audio/packs/<id>/`.

Each pack has a `manifest.json` file and same-origin sample files listed in that manifest.

## Rules

- Use same-origin paths only. Do not load audio from a third-party URL.
- Do not put pack files in the app-shell precache list.
- The loader stores installed packs in Cache Storage under `musi-pack-<id>-<version>`.

## This feature

Feature 006 ships no production sample files. It adds the folder layout and the manifest contract only.
