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
  - 拡張が自分で捕まえて警告だけ出すエラーのうち，プログラムの誤りを示すもの（V8 が TypeError や RangeError に付ける文言．[lib.mjs](lib.mjs) の `warnings()`）．拡張は多くの場所でエラーを捕まえて `console.warn` に書くだけなので，そこでの誤りは，利用者に見えるものを黙って欠けさせます．HTTP のエラー，通信の失敗，JSON でない応答のように，捕まえるのが設計どおりのものは失敗としません．
- canary（[canary/planted.js](canary/planted.js)）は，わざとバグを仕込んだ対象です．ファザーがこれを見つけられない場合は，計装が効いていないことになるので，CI はほかの対象より先に canary で確かめます．

## 入力の作り方

入力は手加減しません．値は [lib.mjs](lib.mjs) が入力のバイト列から作ります．

- **バイト列**：入力のビット列そのもので，長さは 0 から任意です．ネットワークの応答やページは，これをそのまま渡し，UTF-8 や Shift_JIS としての解釈は拡張自身のデコードに任せます．
- **文字列**：入力のビット列を，入力が選ぶ読み方で文字列にします．16 ビットずつ符号単位にする読み方では，孤立したサロゲート，U+0000，U+FFFF を含め，すべての符号単位が出ます．8 ビットずつ U+0000〜U+00FF にする読み方では，拡張が読む構文を書く ASCII（`%`，`<`，`&` など）が，ほかの文字と同じくらい出ます．UTF-8 として読む読み方では，辞書（`dict/`）の語がそのまま文字列になります．
- **数**：任意の 64 ビットのパターン（どんなペイロードの NaN も，±Infinity，-0，非正規化数も）と，境目になりやすい値（`Number.MAX_VALUE`，2^53，Date の範囲の端など），整数です．
- **値**：undefined，null，真偽値，数，文字列，BigInt，Date，任意のフラグの RegExp，ArrayBuffer，DataView，あらゆる型付き配列，Map，Set，穴のある配列，任意のキー（自分のキーとしての `__proto__` も）のオブジェクトを，200 段まで入れ子にします（それより深くは，作る側のスタックが尽きるので作りません）．件数は入力の続く限りで，サイドバーの科目や提出の一覧も同じです．
- **長さ**：入力の続く限り取ります．さらに，入力の片（多くは数バイトで，ときに入力の続く限りの長さ）を，合わせて 2^22 単位まで繰り返すので，数バイトから数百万字の文字列や，数百万の穴のある配列ができます．繰り返す回数は，1〜2 回と 2,048〜4,096 回が同じくらいの割合で出て，64 回に 1 回は上限が 2^22 回になります．巨大な入力は 1 つで 1 秒以上かかるので，小さな入力と同じ割合で出すと，ファザーの時間のほとんどを使ってしまうためです．大きな入力にかかる時間は，[../tests/large.test.mjs](../tests/large.test.mjs) でも測ります．
- **ネットワーク**：通信の失敗，任意のステータス（200〜599），任意の Content-Type と文字コードの名前（無いことも），途中で切れた本文，任意のバイト列への差し替えが起きます．background への通信には，8 回分の応答を用意します（1 つのメッセージが出す通信は 5 回までです）．
- **入力の長さ**：libFuzzer には 1MiB まで作らせます（何も渡さないと 4,096 バイトまで）．課題パネルだけは 64KiB です．jsdom で何万件もの課題を描くと，線形でも 1 入力の時間の上限を超え，遅さが不具合と区別できなくなるためです．
- 拡張が探す語（`提出済`，`kulms-totp-load` など）を混ぜるのは，ファザーがその先の分岐に早く届くためだけです．

拡張へ入るときに値がどう変わるかは，その経路の性質なので，Chrome と同じに再現します．これは手加減ではありません．

- runtime メッセージと chrome.storage は JSON を通ります（NaN は null になり，BigInt は送れない）．
- ページの世界から content script へは，ストラクチャードクローンか文字列で届きます．
- ページの DOM が持つのは文字列だけです．

拡張の内部の関数を直接呼ぶ対象では，呼び出し元が渡す型（例：`t()` の置換値は，どの呼び出し元も `String()` で作った文字列）を守り，その中身は手加減しません．

## 既知の問題を避けている箇所

ファザーは最初の失敗で止まります．そのため，[../docs/findings.md](../docs/findings.md) に載せた，まだ直っていない問題（[open-findings.mjs](open-findings.mjs)）だけは，それを起こす入力を対象の側で避けます．そうしないと，既知の問題の先にある，まだ知られていない問題に届きません．避けている場所には，どれも `Known:` で始まるコメントを付けています．直った問題は `open-findings.mjs` から外し，対象はまたそれを探します．環境変数 `KULMS_FUZZ_LOOK_FOR`（ID をカンマで区切る）を付けて実行すると，その問題を避けずに探します．`KULMS_EXTENSION_DIR` で修正した拡張を指せば，修正をファジングで確かめられます（下の「実行」）．

| 対象 | ID | 避けているもの |
|---|---|---|
| `background-message` | S7 | リスナーが例外を投げるメッセージ．null（undefined も JSON では null），真で文字列でない `type`，真で文字列でない `courseName` の `fetchTextbooks`，`String()` が変換できない `siteId` や `lectureCode` の `fetchTextbooks` |
| `background-message` | S1 | content script への応答にシークレットがあるかを見ない（LMS の設定パネルが受け取るため） |
| `background-message` | B20 | `fetchSakaiSiteContact()` が捕まえたプログラムの誤りを数えない |
| `background-message` | S2，S8 | サイト情報のページへの応答を 512 バイトで，KULASIS からの応答を 16,384 バイトで切る |
| `grading-status` | B16 | `%` の並びが壊れたリンクを読ませない |
| `grading-status` | B18 | `toString` か `valueOf` を自分に持つオブジェクトを含む応答を読ませない．提出の項目の型を確かめない |
| `i18n` | B15 | どのオブジェクトにもあるキー（`constructor`，`toString` など）を引かない |
| `i18n` | B10 | `$` を含む置換値があるときは，結果を確かめない |
| `i18n` | B21 | 値を 1 つだけ，空文字列で渡したときは，値が無いものとして確かめる |
| `site-contact` | S2 | サイト情報のページを 512 バイトで切る |
| `site-contact` | B20 | 関数が捕まえたプログラムの誤りを数えない |
| `syllabus-detail` | S8 | シラバスのページを 16,384 バイトで切る |
| `syllabus-search` | S8 | 検索結果のページを 16,384 バイトで切る |
| `assignments` | B17 | 保存されたメモから null を除く |
| `assignments` | B19 | 科目の一覧と科目ごとの取得が捕まえたプログラムの誤りを数えない |

## ファズ対象

| 対象 | 入力 | 失敗とするもの |
|---|---|---|
| `syllabus-detail` | 講義と部局の番号，シラバスのページとその応答 | 例外，本でないものを返す，KULASIS のシラバス以外への通信，時間超過，捕まえられたプログラムの誤り |
| `syllabus-search` | 検索語，照合する科目名と教員名，検索結果のページとその応答 | 例外，KULASIS の検索以外への通信，科目でないものを返す，時間超過，捕まえられたプログラムの誤り |
| `site-contact` | サイト ID，pages.json の応答，サイト情報のページとその応答 | 例外，名前でないものを返す，LMS 以外への通信，時間超過，捕まえられたプログラムの誤り |
| `background-message` | background への runtime メッセージ（送信元はタブか popup），background の通信への応答 | リスナーの例外，未処理の拒否，5 秒たっても応答が無い，content script に TOTP シークレットが渡る，捕まえられたプログラムの誤り |
| `i18n` | `t()` のキーと置換値 | 例外，文字列でない結果，メッセージの置き場所に値をそのまま入れたものと一致しない結果 |
| `grading-status` | TA 採点画面の状態文字列，提出へのリンク，ページのスクリプトがブリッジの代わりに返す提出の一覧 | 例外，未知の分類，アイコンの取り残し，提出として読めないもの，捕まえられたプログラムの誤り |
| `assignments` | サイドバーの科目，Sakai API とポータルの応答，保存されたメモ・チェック・非表示 | 例外，未処理の拒否，検出器（DOM XSS など），時間超過，捕まえられたプログラムの誤り |
| `canary` | 任意 | 仕込んだバグ（見つかることを確かめる） |

## ディレクトリ

- `targets/`：ファズ対象．`export function fuzz(data)` を持つモジュールです．ページを読む対象は，入力から読む値を `read(fdp)` として切り出しています．
- `lib.mjs`：入力のバイト列から値を作る関数と，失敗の判定に使う関数．
- `seeds/<対象>/`：シードとなる入力．`inputs.mjs` が書きます．
- `dict/<対象>.dict`：辞書．正規表現が探す語のように，計装では学べない語を教えます．
- `regressions/<対象>/`：一度失敗し，修正で通るようになった入力．毎回のテストで流し，再発を防ぎます．
- `known/<対象>/<ID>-<名前>`：[../docs/findings.md](../docs/findings.md) の ID の問題が残っている間，失敗する入力．`inputs.mjs` が書きます．テストでは todo として流すほか，その問題を避けている間は通り，探すと失敗すること（その問題だけを起こすこと）を確かめます．
- `inputs.mjs`：シードと既知の問題の入力を，対象が読む順に並べた値（計画）から書きます．入力のバイト列は，`lib.mjs` や対象の読み方を変えると別の値として読まれるので，そのときは `node fuzz/inputs.mjs` で書き直します．`--check` は書かずに確かめます．
- `encode.mjs`：`lib.mjs` の逆で，読ませたい値から入力のバイト列を組み立てます．FuzzedDataProvider は整数を入力の末尾から，バイト列を先頭から読むので，その並びを逆にたどります．
- `open-findings.mjs`：まだ直っていない問題の ID．対象はこれらの問題を引き起こす入力を避けるので，ファジングは既知の問題で止まらずに先へ進みます（上の「既知の問題を避けている箇所」）．
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

修正した拡張を，その問題を避けずにファジングします（`KULMS_EXTENSION_DIR` は修正した拡張のチェックアウト）．

```bash
KULMS_EXTENSION_DIR=<チェックアウト> KULMS_FUZZ_LOOK_FOR=B10,B15 bash ci/fuzz.sh --only i18n 60 fuzz-run/fix/corpora fuzz-run/fix/crashes
```

## 失敗が見つかったら

1. `node fuzz/replay.mjs` で再現し，原因を確かめます．
2. 新しい問題なら [../docs/findings.md](../docs/findings.md) に ID を付けて載せ，その問題を起こす入力の計画を `inputs.mjs` に加えて，`known/<対象>/<ID>-<名前>` に書き出します．ファザーが見つけた入力をそのまま置かないのは，読み方が変わると別の値として読まれるためです．ID は `open-findings.mjs` に加え，対象側でその入力を避けるようにします．避ける場所には `Known:` で始まるコメントを付け，上の表にも加えます．
3. 拡張を直したら（fork のブランチに修正を入れ，submodule を進める），ID を `open-findings.mjs` から外し，計画の書き出し先を `known/` から `regressions/` に移します．
