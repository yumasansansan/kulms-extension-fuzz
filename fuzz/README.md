<!--
SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
SPDX-License-Identifier: GPL-3.0-or-later

This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
holder and its license, in the machine-readable form of the REUSE
specification: the GNU General Public License, version 3 or any later version
(LICENSES/GPL-3.0-or-later.txt).
-->

# fuzz — 拡張機能のファジング

KULMS+ のコードに，外から入ってくる値（シラバスの HTML，Sakai API の JSON，保存された状態，runtime メッセージなど）を [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js) で与え続けるファジングです．Jazzer.js は libFuzzer を内蔵した，カバレッジ誘導型のファザーです．

## 仕組み

- 各ファズ対象は，ハーネス（[../harness/](../harness/)）を使います．拡張のスクリプトを，偽の chrome API を持つ vm のコンテキスト（background）や jsdom のウィンドウ（タブ，popup）で，manifest のとおりに動かします．
- 拡張のスクリプトは，ハーネスが読み込むときに Jazzer.js の計装を通します（`-i .harness`）．そのため，vm や jsdom で動くコードでもカバレッジがファザーに届きます．同梱ライブラリ（`vendor/`）は計装しません．
- 対象は，例外のほかに次のものを失敗として扱います（[../harness/detectors.mjs](../harness/detectors.mjs)）．
  - ページに入り込んだスクリプトを動かすマークアップ（DOM XSS）
  - プロトタイプの汚染
  - 誰も受けない Promise の拒否
  - 正規表現などで 1 入力が `--timeout`（10 秒）を超えること（ReDoS）
- canary（[canary/planted.js](canary/planted.js)）は，わざとバグを仕込んだ対象です．ファザーがこれを見つけられない場合は，計装が効いていないことになるので，CI はほかの対象より先に canary で確かめます．

## ファズ対象

| 対象 | 入力 | 失敗とするもの |
|---|---|---|
| `syllabus-detail` | シラバスのページ（先頭 1 バイトで文字コードを選ぶ） | 例外，本でないものを返す，検出器，時間超過 |
| `syllabus-search` | 検索語，照合する科目名と教員名，検索結果のページ | 例外，KULASIS の検索以外への通信，科目でないものを返す |
| `site-contact` | Sakai のサイト情報ページ | 例外，名前でないものを返す，時間超過 |
| `background-message` | background への runtime メッセージ（送信元はタブか popup） | リスナーの例外，未処理の拒否，content script に TOTP シークレットが渡る |
| `i18n` | `t()` のキーと置換値 | 例外，文字列でない結果，置換値が欠ける |
| `grading-status` | TA 採点画面の状態文字列，提出へのリンク，提出の内容 | 例外，未知の分類，アイコンの取り残し |
| `assignments` | Sakai API の答えと，保存されたメモ・チェック・非表示 | 例外，未処理の拒否，検出器（DOM XSS など） |
| `canary` | 任意 | 仕込んだバグ（見つかることを確かめる） |

## ディレクトリ

- `targets/`：ファズ対象．`export function fuzz(data)` を持つモジュールです．
- `seeds/<対象>/`：手で書いたシードとなる入力．
- `dict/<対象>.dict`：辞書．正規表現が探す語のように，計装では学べない語を教えます．
- `regressions/<対象>/`：一度失敗し，修正で通るようになった入力．毎回のテストで流し，再発を防ぎます．
- `known/<対象>/<ID>-<名前>`：[../docs/findings.md](../docs/findings.md) の ID の問題が残っている間，失敗する入力．テストでは todo として流します．
- `open-findings.mjs`：まだ直っていない問題の ID．対象はこれらの問題を引き起こす入力を避けるので，ファジングは既知の問題で止まらずに先へ進みます．
- `replay.mjs`：ファザーを使わずに，入力を対象に流します．

## 実行

```bash
pnpm exec jazzer fuzz/targets/syllabus-detail.fuzz.mjs fuzz-run/corpora/syllabus-detail fuzz/seeds/syllabus-detail -i .harness -e vendor -- -max_total_time=60 -dict=fuzz/dict/syllabus-detail.dict
```

```bash
bash ci/fuzz.sh 60 fuzz-run/corpora fuzz-run/crashes
```

```bash
node fuzz/replay.mjs syllabus-detail fuzz-run/crashes/syllabus-detail
```

## 失敗が見つかったら

1. `node fuzz/replay.mjs` で再現し，原因を確かめます．
2. 新しい問題なら [../docs/findings.md](../docs/findings.md) に ID を付けて載せ，入力を `known/<対象>/<ID>-<名前>` に置きます．ID は `open-findings.mjs` に加え，対象側でその入力を避けるようにします．
3. 拡張を直したら（fork のブランチに修正を入れ，submodule を進める），ID を `open-findings.mjs` から外し，入力を `known/` から `regressions/` に移します．
