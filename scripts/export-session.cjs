// Exports only public user/assistant text from the requested Codex session.
// Excludes system/developer instructions, tools, reasoning, image data and credentials.
const fs = require('node:fs');
const path = require('node:path');
const input = process.argv[2];
if (!input) throw Error('Usage: node scripts/export-session.cjs SESSION.jsonl');
const rows = fs
  .readFileSync(input, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const clean = (s) =>
  s
    .replace(/密码\s*[:：]\s*[^\s<]+/gi, '密码：[已脱敏]')
    .replace(/password\s*[:=]\s*[^\s<]+/gi, 'password=[REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[远程地址已脱敏]')
    .replace(/用户名\s*[:：]\s*[^\s<]+/gi, '用户名：[已脱敏]')
    .replace(/[A-Z]:[\\/]xwechat_files[\\/][^\s<]+/gi, '[附件路径已脱敏]')
    .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi, '[本机用户目录]')
    .replace(/[^\\/\s:]+\.rdp/gi, '[远程连接文件].rdp');
const parts = [
  '# AI 开发会话公开消息导出（脱敏）',
  '来源：本次 Codex session 原始 JSONL。只导出公开用户/助手文本；删除系统指令、工具数据、内部推理和图像数据。保留原始消息顺序。凭证和远程地址已脱敏。导出时间：' +
    new Date().toISOString(),
];
let count = 0;
for (const row of rows) {
  const p = row.payload;
  if (
    row.type !== 'response_item' ||
    p?.type !== 'message' ||
    !['user', 'assistant'].includes(p.role)
  )
    continue;
  if (
    p.role === 'assistant' &&
    !['commentary', 'final', 'final_answer'].includes(p.channel || p.phase)
  )
    continue;
  let text = (p.content || [])
    .filter((c) => ['input_text', 'output_text'].includes(c.type))
    .map((c) => c.text || '')
    .join('\n');
  if (!text.trim() || /^<environment_context>|^<external_codex_apps_open_page>/.test(text.trim()))
    continue;
  parts.push(
    `## ${++count}. ${p.role === 'user' ? '用户' : '助手'}${row.timestamp ? ' / ' + row.timestamp : ''}\n\n${clean(text)}`,
  );
}
const out = path.resolve(__dirname, '../docs/AI-SESSION.md');
fs.writeFileSync(out, parts.join('\n\n').trimEnd() + '\n');
console.log(`Exported ${count} public messages with redaction.`);
