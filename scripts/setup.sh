#!/bin/sh
# One-time local setup: install dependencies and enable repo git hooks.
set -e
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/*
pnpm install
echo "Hooks enabled from .githooks. Run pnpm check to verify."
