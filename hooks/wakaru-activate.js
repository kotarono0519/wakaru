#!/usr/bin/env node
// wakaru — Claude Code SessionStart アクティベーションフック
//
// セッション開始毎に実行:
//   1. フラグファイル $CLAUDE_CONFIG_DIR/.wakaru-active 書込
//   2. SKILL.md（ルールの唯一の真実源）を状態記述ヘッダ付きで hidden context 注入
//
// 注入文言は「命令」ではなく「状態の記述」にしている。
// 「削除しろ」「無視しろ」「禁止」等の命令語彙は、プロンプトインジェクションの
// シグナルと重なり誤発火を招くため使わない。これが wakaru の設計上の要点。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag } = require('./wakaru-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.wakaru-active');

const mode = getDefaultMode();

// off モード — アクティベートせず、フラグ削除して注入なし
if (mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

// 1. フラグファイル書込（symlink-safe）
safeWriteFlag(flagPath, 'on');

// 2. SKILL.md を実行時読込 — wakaru 挙動の唯一の真実源。
//    プラグイン導入: __dirname = <plugin_root>/hooks/, SKILL.md は <plugin_root>/skills/wakaru/SKILL.md
let body = '';
try {
  const skill = fs.readFileSync(
    path.join(__dirname, '..', 'skills', 'wakaru', 'SKILL.md'), 'utf8'
  );
  // YAML frontmatter 除去
  body = skill.replace(/^---[\s\S]*?---\s*/, '');
} catch (e) { /* SKILL.md 不在 → 下のフォールバックを使用 */ }

// 状態記述ヘッダ（命令調を避ける）
const header =
  '出力形式 wakaru が有効（人間が読みやすい日本語 ＝ 要点圧縮＋構造化）。以下はその形式の定義。';

let output;
if (body) {
  output = header + '\n\n' + body;
} else {
  // SKILL.md 不在時のフォールバック
  output =
    header + '\n\n' +
    '冗長・前置き・過剰敬語を削り、冒頭で目的と結論を先に出して箇条書きで整える。' +
    '助詞・文法・技術用語・コードブロックは保持する（原始人口調のようには崩さない）。' +
    '破壊的操作の確認・セキュリティ警告・コード・ユーザーが混乱している場面では通常の丁寧文にする。' +
    '解除は「wakaru やめて」「通常モード」または /wakaru off。';
}

process.stdout.write(output);
