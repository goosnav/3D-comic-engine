#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node 22.12+ with npm from https://nodejs.org/, then run this launcher again.' >&2
  exit 1
fi
node tools/setup.mjs || { result=$?; echo 'Setup failed. See the error above and launchers/README.md.' >&2; exit "$result"; }
exec node bin/theatre.mjs gui "$@"
