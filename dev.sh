#!/usr/bin/env bash
set -euo pipefail

# Run mr-mush locally from the working tree
exec node "$(dirname "$0")/bin/mr-mush.js" "$@"
