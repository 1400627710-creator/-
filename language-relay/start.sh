#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ -n "${RELAY_PYTHON:-}" ]; then
    exec "$RELAY_PYTHON" bootstrap.py "$@"
fi
for python_cmd in python3.11 python3 python; do
    if "$python_cmd" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' 2>/dev/null; then
        exec "$python_cmd" bootstrap.py "$@"
    fi
done
echo "请先安装 Python 3.11，再运行此启动文件。" >&2
exit 1
