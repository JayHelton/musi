#!/usr/bin/env bash
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  if [[ -f "${HOME}/.local/bin/env" ]]; then
    # shellcheck source=/dev/null
    source "${HOME}/.local/bin/env"
  else
    export PATH="${HOME}/.local/bin:${PATH}"
  fi
fi

uv tool install specify-cli 2>/dev/null || uv tool install specify-cli --force

if [[ -f cli/package.json ]]; then
  npm install --prefix cli
fi

uv --version
specify version 2>/dev/null || specify --version
