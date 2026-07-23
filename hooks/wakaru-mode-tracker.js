#!/usr/bin/env node
// wakaru — UserPromptSubmit フック
//
// ユーザー入力から /wakaru 系コマンド・自然言語トリガー・解除を検出し、
// フラグファイルにモードを反映。加えて毎ターン補強リマインダを注入する。
//
// 【injection 誤発火対策の要点】
// 毎ターン注入する additionalContext は「状態の記述」に徹し、命令形・否定命令
// （〜しろ / 無視 / 禁止 / 削除しろ）を一切使わない。毎ターン外部テキストが
// 差し込まれる構造そのものは残るが、文言を非命令にすることで、モデルの
// プロンプトインジェクション検知の誤発火を最小化する。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag, readFlag } = require('./wakaru-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.wakaru-active');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim();
    const lower = prompt.toLowerCase();

    // 解除検出（起動より先に評価）
    const deactivate =
      /wakaru\s*(やめて|解除|停止|オフ|無効)/i.test(prompt) ||
      /通常モード/.test(prompt) ||
      /^\/wakaru\s+(off|stop|disable)\b/i.test(prompt) ||
      (/\bwakaru\b/i.test(lower) && /\b(stop|disable|off|deactivate|turn off)\b/i.test(lower));

    // 起動検出 — スラッシュコマンド or 自然言語
    const activateCmd = /^\/wakaru(?:\s+on)?\s*$/i.test(prompt);
    const activateNl =
      /\bwakaru\b/i.test(lower) &&
      /(モード|起動|有効|オン|にして|化)/.test(prompt) &&
      !/(やめて|解除|停止|オフ|無効)/.test(prompt);

    if (deactivate) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    } else if (activateCmd || activateNl) {
      const m = getDefaultMode();
      if (m !== 'off') safeWriteFlag(flagPath, 'on');
    }

    // 毎ターン補強 — 状態記述のみ（命令語彙ゼロ）。
    // readFlag は symlink-safe + サイズ上限 + VALID_MODES ホワイトリスト。
    // 不正値は null → コンテキストに untrusted bytes を注入しない。
    const active = readFlag(flagPath);
    if (active === 'on') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext:
            '出力形式 wakaru が有効（人間が読みやすい日本語）。' +
            '冗長・前置き・過剰敬語を削り、結論を先に出して箇条書きで整える形式。' +
            '助詞・文法・技術用語・コードブロックは保持。' +
            '破壊的操作の確認・セキュリティ警告・コード・混乱している場面は通常の丁寧文。'
        }
      }));
    }
  } catch (e) {
    // silent fail
  }
});
