# Musi Architecture

Musi is a fully static, frontend-only music-theory product.
The core product has no backend, database, or API.

## Deliverables

The web app is a PWA at the repo root.
It uses plain HTML, CSS, and ES modules.
It has no build step and no framework.
The CLI lives in `cli/`.
It is a zero-dependency Node.js program.
The CLI requires Node.js version 18 or newer.

## Shared Theory Engine

Both deliverables share the music-theory engine in `js/`.
Put shared logic in `js/` when web and CLI need the same behavior.
Keep the CLI zero-dependency.
Do not add npm packages to `cli/` for theory that belongs in `js/`.

## Web UI

The web UI uses an Atomic Purple Game Boy Color aesthetic.
Theme tokens live in `css/base.css` and `css/theme-gbc.css`.
Panels read as LCD screen tiles, not flat black cards.
The pixel font stack includes Press Start 2P, Pixelify Sans, and VT323.

## Service Worker

The PWA uses `service-worker.js` for offline caching.
After you edit JS or CSS, do a hard reload or bump the cache name.

## Verification

This repo has no CI or bundled test framework.
Verify with CLI smoke commands and browser exercise of the web UI.
Run Node runners under `tests/` when they cover your change.
