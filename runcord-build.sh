#!/usr/bin/env bash
set -uo pipefail

if ! npm install -g agent-browser; then
  echo "Warning: failed to install agent-browser globally; continuing anyway." >&2
fi

if ! agent-browser install; then
  echo "Warning: failed to run agent-browser install; continuing anyway." >&2
fi

exit 0
