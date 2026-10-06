#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null; then echo '请先安装 Node.js LTS，参见 START.command。'; exit 1; fi
if [ ! -d node_modules/@modelcontextprotocol/sdk ]; then npm ci --ignore-scripts || exit 1; fi
if [ ! -f dist/main.js ]; then npm run build || exit 1; fi
node scripts/setup.mjs
