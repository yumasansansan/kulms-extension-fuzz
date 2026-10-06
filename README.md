<!--
SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
SPDX-License-Identifier: GPL-3.0-or-later

This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
holder and its license, in the machine-readable form of the REUSE
specification: the GNU General Public License, version 3 or any later version
(LICENSES/GPL-3.0-or-later.txt).
-->

# kulms-extension-fuzz

ブラウザ拡張 [KULMS+](https://github.com/Radian0523/kulms-extension) をテストし，ファジングするためのリポジトリです．拡張本体には手を加えず，submodule として取り込み，このリポジトリのハーネスで動かします．

- [docs/findings.md](docs/findings.md)：レビューとファジングで見つかった問題の一覧と，進め方．
- [harness/](harness/)：拡張を Node の上で動かす部品です．偽の chrome API（複数タブで共有するストレージ，メッセージ，拡張自身のファイル），jsdom のタブと popup，vm の background，IIFE の内部の公開，DOM XSS などの検出器があります．
- [tests/](tests/)：node:test のテスト．見つかった問題は，あるべき振る舞いを確かめるテストに todo を付けて置いてあります．問題が残っている間は失敗しますが，テスト全体は失敗にしません．
- [fuzz/](fuzz/)：Jazzer.js のファズ対象，シード，辞書，回帰入力．
- [ci/](ci/) と [.github/workflows/](.github/workflows/)：CI．push ごとにテスト，lint，REUSE，1 分ずつのファジングを行い，毎日長時間のファジングを行います．

## 使い方

Node 26 以降と pnpm を使います．

```bash
git submodule update --init
```

```bash
pnpm install
```

```bash
pnpm test
```

```bash
bash ci/lint.sh
```

```bash
bash ci/fuzz.sh 60 fuzz-run/corpora fuzz-run/crashes
```

## ライセンス

このリポジトリのファイルは GNU General Public License，version 3 以降（GPL-3.0-or-later）です．各ファイルの先頭の SPDX の行と [REUSE.toml](REUSE.toml) が著作権者とライセンスを示し，本文は [LICENSES/](LICENSES/) にあります．submodule の kulms-extension は上流のもの（MIT）です．
