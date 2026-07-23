#!/usr/bin/env node
// wakaru — 共有設定リゾルバ
//
// defaultMode の解決順:
//   1. WAKARU_DEFAULT_MODE 環境変数
//   2. 設定ファイル defaultMode（$XDG_CONFIG_HOME/wakaru/config.json ほか）
//   3. 'on'（開始時ON が既定）
//
// モードは単一（on / off）。強度段階は持たない。
// フラグファイルの読み書きは symlink 攻撃対策を施す（genshijin から流用）。

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = ['off', 'on'];

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'wakaru');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'wakaru'
    );
  }
  return path.join(os.homedir(), '.config', 'wakaru');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getDefaultMode() {
  const envMode = process.env.WAKARU_DEFAULT_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    if (config.defaultMode && VALID_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) {
    // 設定ファイル不在 or 不正 → フォールスルー
  }

  return 'on';
}

// Symlink-safe フラグ書込。親ディレクトリ・対象ファイルの symlink を拒否し、
// O_NOFOLLOW を使い temp + rename で 0o600 アトミック書込。
// 予測可能なフラグパス（~/.claude/.wakaru-active）を symlink で差し替えて
// 他ファイルを破壊する攻撃を塞ぐ。
function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(flagDir, `.wakaru-active.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* Windows ベストエフォート */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, flagPath);
  } catch (e) {
    // silent fail — フラグはベストエフォート
  }
}

// symlink 拒否・サイズ上限・ホワイトリスト検証付きフラグ読込。
// 攻撃者が別ファイルへの symlink で差し替えた場合でも、不正値なら null を返し
// コンテキストに untrusted bytes を混入させない。
const MAX_FLAG_BYTES = 64;

function readFlag(flagPath) {
  try {
    let st;
    try {
      st = fs.lstatSync(flagPath);
    } catch (e) {
      return null;
    }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    const raw = out.trim().toLowerCase();
    if (!VALID_MODES.includes(raw)) return null;
    return raw;
  } catch (e) {
    return null;
  }
}

module.exports = {
  getDefaultMode,
  getConfigDir,
  getConfigPath,
  VALID_MODES,
  safeWriteFlag,
  readFlag
};
