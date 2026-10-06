#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null; then
  echo '请先从 https://nodejs.org/ 安装 Node.js LTS。'
  read -r -p '按回车保留并关闭窗口。' _writer_reply
  exit 1
fi
node scripts/launcher.mjs
_writer_exit=$?
if [ "$_writer_exit" -ne 0 ]; then read -r -p '失败信息已保留，按回车关闭。' _writer_reply; fi
exit "$_writer_exit"
