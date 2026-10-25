<!--
SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
SPDX-License-Identifier: GPL-3.0-or-later

This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
holder and its license, in the machine-readable form of the REUSE
specification: the GNU General Public License, version 3 or any later version
(LICENSES/GPL-3.0-or-later.txt).
-->

# KULMS+ 拡張機能 レビューの記録

- **対象**: [Radian0523/kulms-extension](https://github.com/Radian0523/kulms-extension) の [`087452e`](https://github.com/Radian0523/kulms-extension/commit/087452e33d14c117e6fa584fe3dd4b19f8f9a76c)（v1.21.0 と提出検知の修正）．テストとファジングは，2026-10-13 から v1.21.1 の [`20d7da3`](https://github.com/Radian0523/kulms-extension/commit/20d7da3b9193960a2a1b38f1281e2e12c8155817) に対して行う（B1，B2，B5，B6 が直った版）
- **日付**: 2026-10-06（B19〜B21 と S9 は 2026-10-07，B22 は 2026-10-13，S13，M6，D2〜D9 は 2026-10-14）
- **方法**: 全ソースを通読した．そのうえで，実コードを Node 26.10.0 と jsdom 30.1.2 の上で動かして確かめた．その後，拡張を Node の上で動かすハーネス（[harness/](../harness/)）を作り，確かめたことをテスト（[tests/](../tests/)）にした．また，Jazzer.js [[Jazzer.js]](#参考文献) でファジング（[fuzz/](../fuzz/)）を行い，B15〜B22 と，S7 の新しい例を見つけた．拡張のすべての正規表現を，受理するオートマトンで調べ，S9 を見つけた
- 行番号は `087452e` の時点のもの（S13，M6，D2〜D9 は `20d7da3` の時点のもの）．リンクはそのコミットへの固定リンク

## 凡例

- **重さ**: 高（利用者のデータが消える，広く効く）／中／低
- **確認**: 再現（tests/ のテストで再現した）／計測（時間を測った）／ビルド（build.sh を実行した）／ファズ（ファジングで見つかった）／解析（正規表現が受理するオートマトンを調べた）／読解（コードを読んで判断した）／ブラウザ（ヘッドレスの Microsoft Edge 155 と Firefox 158 でページを開いて確かめた）／取得（応答ヘッダーやリンク先を実際に取得して確かめた）／CI（上流の GitHub Actions の記録で確かめた）
- **状態**: 未着手／対応中（直したブランチへのリンクを書く）／PR 中（PR へのリンクを書く）／修正済（上流に取り込まれた）．上流に取り込まれたら，tests/ の該当テストから `todo` を外し，ID を `fuzz/open-findings.mjs` から外し，`fuzz/inputs.mjs` での既知の入力の書き出し先を `fuzz/regressions/` に移す

## 一覧

| ID | 重さ | 件名 | 確認 | 状態 | 上流 Issue |
|---|---|---|---|---|---|
| [S1](#s1) | 中 | TOTP の平文シークレットが content script と LMS の DOM に渡る | 再現 | PR 中（前半：[#80](https://github.com/Radian0523/kulms-extension/pull/80)） | |
| [S2](#s2) | 中 | サイト連絡先の正規表現が入力長の 3 乗で遅くなる（ReDoS） | 再現・計測 | PR 中（[#81](https://github.com/Radian0523/kulms-extension/pull/81)） | |
| [S3](#s3) | 低 | TOTP 登録補助がシークレットをページの sessionStorage に置く | 読解 | 未着手 | |
| [S4](#s4) | 低 | シラバスの実体参照を二重にデコードし，数値参照は捨てる | 再現 | PR 中（[#83](https://github.com/Radian0523/kulms-extension/pull/83)） | |
| [S5](#s5) | 低 | 使っていないホスト権限 `radian0523.github.io` | 読解 | PR 中（[#85](https://github.com/Radian0523/kulms-extension/pull/85)） | |
| [S6](#s6) | 低 | 不正な TOTP シークレットを保存できる | 再現・ファズ | 対応中（[fix/validate-totp-secret](https://github.com/yumasansansan/kulms-extension/tree/fix/validate-totp-secret)） | |
| [S7](#s7) | 低 | 形の崩れたメッセージで onMessage リスナーが例外を投げる | 再現 | PR 中（[#84](https://github.com/Radian0523/kulms-extension/pull/84)） | |
| [S8](#s8) | 低 | シラバス解析の正規表現が入力長の 2 乗で遅くなる | 再現・計測 | PR 中（[#83](https://github.com/Radian0523/kulms-extension/pull/83)） | |
| [S9](#s9) | 低 | 科目名，TOTP のシークレット，フォルダを読む正規表現が入力長の 2 乗で遅くなる | 解析・再現・計測 | 対応中（[fix/backtracking-regexes](https://github.com/yumasansansan/kulms-extension/tree/fix/backtracking-regexes)．ログインページの分は S1 の前半の [#80](https://github.com/Radian0523/kulms-extension/pull/80)） | |
| [S10](#s10) | 低 | ページに `<script>` と `<style>` を入れる | 読解・再現 | 未着手 | |
| [S11](#s11) | 低 | Trusted Types を求めるページで，innerHTML などに文字列を渡す | 読解・再現 | 未着手 | |
| [S12](#s12) | 低 | 取得したデータを，リダイレクトの行き先を確かめずに使用する | 読解・ファズ | PR 中（[#82](https://github.com/Radian0523/kulms-extension/pull/82)） | |
| [S13](#s13) | 低 | ランディングページに CSP などの守りが無く，GitHub Pages ではヘッダーを付けられない | 取得・ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)．meta 要素の CSP と Referrer-Policy．埋め込みの禁止などはヘッダーが要り，GitHub Pages では与えられない） | |
| [S14](#s14) | 中 | 授業資料のツリーのキャッシュを，ページから書き換えられる localStorage に HTML のまま置き，検証せずに表へ入れる | 読解・ファズ | 未着手 | |
| [B1](#b1) | **高** | 複数タブを開いていると，メモ・完了チェック・非表示が消える | 再現 | 修正済（[#75](https://github.com/Radian0523/kulms-extension/pull/75)，v1.21.1） | |
| [B2](#b2) | 中 | 非表示にした課題が 30 日後に一覧へ戻る | 再現 | 修正済（[#76](https://github.com/Radian0523/kulms-extension/pull/76)，v1.21.1） | [#74](https://github.com/Radian0523/kulms-extension/issues/74) |
| [B3](#b3) | 中 | サイドバーの色分けで，期限切れが最も弱く扱われる | 再現 | 対応中（[fix/sidebar-overdue-color](https://github.com/yumasansansan/kulms-extension/tree/fix/sidebar-overdue-color)） | |
| [B4](#b4) | 中 | ツール表示管理が 200ms ごとの再処理を止めない | 再現・ファズ | 対応中（[fix/tool-visibility-loop](https://github.com/yumasansansan/kulms-extension/tree/fix/tool-visibility-loop)） | |
| [B5](#b5) | 中 | Safari 版に `vendor/` が同梱されない | 再現（ビルド） | 修正済（上流の [`97a8746`](https://github.com/Radian0523/kulms-extension/commit/97a87462f3ab2950867ef53c2171713a77a7b3a8)，v1.21.1） | |
| [B6](#b6) | 中 | 配布用 zip に `node_modules/` などが入る | 再現（ビルド） | 修正済（上流の [`97a8746`](https://github.com/Radian0523/kulms-extension/commit/97a87462f3ab2950867ef53c2171713a77a7b3a8)，v1.21.1） | |
| [B7](#b7) | 低 | キャッシュから描画すると，クイズのリンクが課題ツールを指す | 再現 | 対応中（[fix/cached-tool-links](https://github.com/yumasansansan/kulms-extension/tree/fix/cached-tool-links)） | |
| [B8](#b8) | 低 | バナーが重複し，設定タブにも紛れ込む | 再現 | 対応中（[fix/assignment-banners](https://github.com/yumasansansan/kulms-extension/tree/fix/assignment-banners)） | |
| [B9](#b9) | 低 | 読み込み中の更新要求が，成功扱いのまま捨てられる | 読解・再現 | 対応中（[fix/refresh-while-loading](https://github.com/yumasansansan/kulms-extension/tree/fix/refresh-while-loading)） | |
| [B10](#b10) | 低 | i18n の置換で，値の中の `$&` や置き場所の名前が展開され，結果が値の長さの 3 乗まで伸びる（潜在） | 再現・ファズ | 対応中（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)） | |
| [B11](#b11) | 低 | 教科書一覧が科目名をキーとしており，同名の科目が衝突する | 読解・再現 | 対応中（[fix/textbooks-by-site](https://github.com/yumasansansan/kulms-extension/tree/fix/textbooks-by-site)） | |
| [B12](#b12) | 低 | ページから書き換えられる Web Storage の値で例外になる | 読解・再現 | 対応中（[fix/web-storage-values](https://github.com/yumasansansan/kulms-extension/tree/fix/web-storage-values)） | |
| [B13](#b13) | 低 | シラバス検索の最後のフォールバックが無関係な科目を選びうる | 読解 | 未着手 | |
| [B14](#b14) | 低 | Shift_JIS にない文字を検索語から黙って落とす | 再現 | 未着手 | |
| [B15](#b15) | 低 | `t()` がキーをプロトタイプ越しに引き，`t("hasOwnProperty")` が undefined になる（潜在） | ファズ | 対応中（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)） | |
| [B16](#b16) | 低 | TA 採点支援が壊れた `%` の並びで URIError を投げ，装飾が止まる | ファズ | 対応中（[fix/grading-ta-input](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-ta-input)） | |
| [B17](#b17) | 中 | 保存されたメモが配列でないか，null を 1 つでも含むか，欄に文字列にできない値を持つと，課題パネルの描画が止まる | ファズ | 対応中（[fix/invalid-memo](https://github.com/yumasansansan/kulms-extension/tree/fix/invalid-memo)） | |
| [B18](#b18) | 低 | TA 採点支援が，ページから届く提出の status の型を確かめず TypeError で止まる | ファズ | 対応中（[fix/grading-ta-input](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-ta-input)） | |
| [B19](#b19) | 低 | Sakai の応答に形の崩れた項目が 1 つあると，ほかの科目や課題も一覧から消える | ファズ | 対応中（[fix/sakai-answer-shape](https://github.com/yumasansansan/kulms-extension/tree/fix/sakai-answer-shape)） | |
| [B20](#b20) | 低 | サイト連絡先の取得で，pages.json の形の崩れたページが，後のページを隠す | ファズ | 対応中（[fix/site-contact-pages](https://github.com/yumasansansan/kulms-extension/tree/fix/site-contact-pages)） | |
| [B21](#b21) | 低 | `t()` に値を 1 つだけ空文字列で渡すと，`$HOURS$` などが残る（潜在） | ファズ | 対応中（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)） | |
| [B23](#b23) | 低 | ページの Web Storage が埋まっていると，ツールの表示の切り替え，サイドバーの幅の保存，提出の検知，TOTP の登録補助，課題パネルの読み込みが例外で止まる | ファズ・再現 | 対応中（[fix/storage-full](https://github.com/yumasansansan/kulms-extension/tree/fix/storage-full)） | |
| [B22](#b22) | 低 | 長い TOTP シークレットを background が保存できない（潜在） | ファズ | 対応中（[fix/long-totp-secret](https://github.com/yumasansansan/kulms-extension/tree/fix/long-totp-secret)） | |
| [B24](#b24) | 低 | TA 採点支援のページ側の橋渡しが，ページのオブジェクトが投げる例外で止まり，文字列でない ID や名前をそのまま渡す | ファズ | 対応中（[fix/grading-bridge-values](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-bridge-values)） | |
| [B25](#b25) | 低 | 保存された課題のキャッシュが拡張の書く形でないと，課題パネルと popup の描画が止まる | ファズ | 対応中（[fix/cache-shape](https://github.com/yumasansansan/kulms-extension/tree/fix/cache-shape)） | |
| [B26](#b26) | 低 | TA 採点支援が，提出日時の列にセルの無い行で，提出一覧の読み取りを止める | 再現・ファズ | 対応中（[fix/grading-list-short-rows](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-list-short-rows)） | |
| [B27](#b27) | 低 | 上部のピン留めバーが，サイト ID に壊れた `%` の並びがある科目のクリックで URIError を投げ，ツールの一覧を開けない | ファズ | 未着手 | |
| [B28](#b28) | 中 | ページの先読みが，ツールのリンク（tool-reset）にマウスを乗せただけで，そのツールの状態を初期化させる | 再現・読解 | 未着手 | |
| [B29](#b29) | 低 | ページの先読みが，マウスを乗せただけの科目の訪問を Sakai に記録させる | 再現・読解 | 未着手 | |
| [B30](#b30) | 低 | 授業資料のツリーのキャッシュを 20 件に抑える処理が，項目の形を確かめず，TypeError を捕まえて黙って続ける | ファズ・読解 | 未着手 | |
| [P1](#p1) | **高** | 課題取得の N+1 と，タブごとの短い間隔での再取得（LMS への負荷） | 読解 | 未着手 | [#32](https://github.com/Radian0523/kulms-extension/issues/32), [#27](https://github.com/Radian0523/kulms-extension/issues/27) |
| [P2](#p2) | 中 | フォルダ自動展開が，ページ全体の POST を最大 30 回直列に行い，開かないフォルダを何度も要求し直す | 読解・ファズ | 対応中（一部：[fix/expand-folders-once](https://github.com/yumasansansan/kulms-extension/tree/fix/expand-folders-once)） | [#62](https://github.com/Radian0523/kulms-extension/issues/62) |
| [P3](#p3) | 中 | `document.body` 全体を監視する MutationObserver が多く，重い | 読解 | 未着手 | |
| [P4](#p4) | 低 | jsQR（256KB）と qrcode-gen（56KB）を広すぎる範囲に注入する | 読解 | 対応中（jsQR：[fix/jsqr-where-read](https://github.com/yumasansansan/kulms-extension/tree/fix/jsqr-where-read)） | |
| [P5](#p5) | 低 | 教科書の取得が科目ごとの直列処理 | 読解・再現 | 対応中（[fix/textbooks-parallel](https://github.com/yumasansansan/kulms-extension/tree/fix/textbooks-parallel)） | |
| [P6](#p6) | 低 | Service Worker の起動ごとに Shift_JIS 変換表を作り直す | 計測 | 未着手 | |
| [P7](#p7) | 低 | TA 採点支援のページ側の橋渡しが，配列もどきの `length` が示す回数だけ反復する | ファズ・ブラウザ | 対応中（[fix/grading-bridge-values](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-bridge-values)） | |
| [P8](#p8) | 低 | 表示中の TOTP コードを毎秒作り直すたびに，シークレットをデコードし，HMAC の鍵を作り直す | 再現・ファズ | 対応中（[fix/totp-key-once](https://github.com/yumasansansan/kulms-extension/tree/fix/totp-key-once)） | |
| [P9](#p9) | 低 | QR コードを表示するたびに，シークレットを読み直し，QR コードを最初から作る | ファズ | 対応中（[fix/qr-code-once](https://github.com/yumasansansan/kulms-extension/tree/fix/qr-code-once)） | |
| [M1](#保守性) | — | TOTP の実装が 4 か所に重複している | 読解 | 未着手 | |
| [M2](#保守性) | — | popup.js と assignments.js，textbooks.js と assignments.js の重複 | 読解 | 未着手 | |
| [M3](#保守性) | — | テストが無く，CI は PR 時の ESLint のみ．IIFE 構造でテストしにくい | 読解 | 未着手 | |
| [M4](#保守性) | — | Safari の Resources がコミットされた複製で，本体から遅れる | 読解 | 未着手 | |
| [M5](#保守性) | — | 動かないコード（textbooks.js の設定確認，popup.js の SVG 走査，assignments.js の状態のバッジ） | 読解 | 対応中（[fix/dead-code](https://github.com/yumasansansan/kulms-extension/tree/fix/dead-code)） | |
| [M6](#保守性) | — | 上流の CI の Auto Assign が，フォークからの PR で必ず失敗する | CI | PR 中（[#79](https://github.com/Radian0523/kulms-extension/pull/79)） | |
| [D1](#d1) | 低 | プライバシーポリシーの TOTP の記述が実装と合わない | 読解 | 対応中（[fix/privacy-storage](https://github.com/yumasansansan/kulms-extension/tree/fix/privacy-storage)） | |
| [D2](#d2) | 低 | ランディングページが画面の大きさに合わせて伸び縮みせず，狭い画面で内容がはみ出す | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D3](#d3) | 低 | 高さの低い画面で，スクロールで現れる節が透明のまま残る | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D4](#d4) | 低 | 文字と背景のコントラスト比が WCAG 2.2 の AA に届かない（応援のボタンは 1.07:1） | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D5](#d5) | 低 | 機能のカルーセルで「次へ」「前へ」を続けて押すと，押した回数だけ進まない | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D6](#d6) | 低 | スクリーンショットが PNG だけで重い（9 枚で 947,698 バイト） | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D7](#d7) | 低 | ヘッダーの飾りの円が，ヘッダーの下端で切れる | ブラウザ | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D8](#d8) | 低 | 多要素認証の案内と設定手順の PDF へのリンクが切れている | 取得 | 修正済（[#77](https://github.com/Radian0523/kulms-extension/pull/77)，[`507fc96`](https://github.com/Radian0523/kulms-extension/commit/507fc96a81f57b5e23c8507303a2c4cfa26703a3)） | |
| [D9](#d9) | 低 | ダウンロードボタンのアイコンが，各ブラウザとストアのものと違う | ブラウザ | 未着手（上流の作者と相談する） | |

## 問題ではないもの：TOTP の HMAC-SHA-1

- TOTP [[RFC6238]](#参考文献) の既定のアルゴリズムは HMAC-SHA-1 [[RFC4226]](#参考文献) であり，Google Authenticator なども実質的にこれを使う．アルゴリズムを決めるのは京大の認証サーバーであるため，拡張の側で変更するとコードが一致しなくなる．
- SHA-1 の弱点は衝突攻撃であり，SHA-1 への攻撃が HMAC-SHA-1 に及ぶ兆候はない [[RFC6194]](#参考文献)．
- 実装も正しい．RFC 6238 の付録 B のテストベクタ 6 本がすべて一致した．また，ランダムな 3,000 件（tests/ では 100 件）を node:crypto と突き合わせても不一致は無かった（[tests/totp.test.mjs](../tests/totp.test.mjs)）．
- TOTP で問題なのは，シークレットの扱い（S1，S3，S6）と，実装の重複（M1）である．

## セキュリティ

### S1
**TOTP の平文シークレットが content script と LMS の DOM に渡る**（中・再現）

- 場所: [background.js:732-771](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L732-L771)（送信元を確かめない），[src/auth-totp.js:86](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp.js#L86)，[src/assignments.js:2361-2401](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2361-L2401)
- 何が起きるか:
  - `kulms-totp-load` は，LMS の全フレームと auth.iimc の content script のどれに対しても平文のシークレットを返す．
  - 自動入力（auth-totp.js）は 6 桁のコードがあれば足りるにもかかわらず，平文を受け取って自らコードを計算している．
  - LMS の設定パネルで「QR」を押すと，`otpauth://…secret=…` を符号化した QR の SVG が **LMS ページの DOM** に描画される．「コード表示」を押すと現在の OTP も描画される．どちらも表示中は，LMS 側のスクリプト（XSS，外部スクリプト）から読める．
- 影響: 長期間有効な 2 段階認証のシードが漏れると，そのアカウントの 2 段階認証が恒久的に無意味になる．
- 直し方:
  1. OTP は background で計算し，content script には 6 桁のみを返す（例: `kulms-totp-code`）．
  2. `load`・`save`・`delete` は拡張ページ（`sender.tab` が無く，`sender.url` が `chrome.runtime.getURL("")` で始まる）からのみ受け付ける．登録は auth.iimc の送信元に限った専用メッセージにする．
  3. QR とシークレットの表示は popup かオプションページのみで行い，LMS の設定パネルからはそこへ誘導する（挙動の変更になるので，先に上流で Issue を立てる）．
- 対応: 前半として，自動入力が background で計算したコードのみを受け取るようにし（`kulms-totp-code`），認証ページの content script には `kulms-totp-load` でシークレットを返さないようにした（[fix/totp-code-from-background](https://github.com/yumasansansan/kulms-extension/tree/fix/totp-code-from-background)）．時刻は background が決めるので，content script は先の時刻のコードを求められない．LMS の設定パネルでのコードと QR の表示（直し方の 3）は，表示の場所が変わるので，上流で Issue を立ててから行う．2026-10-25 に，前半を上流へ PR として送った（[#80](https://github.com/Radian0523/kulms-extension/pull/80)）．
- 前半のブランチが background に置いた base32 のデコードは，末尾の = を `/=+$/` で取っていた（S9 の正規表現の写し）．すべての修正ブランチを当てたときに見つけ，同じブランチで S9 と同じ書き方に直した．`src/auth-totp.js` のデコードはこのブランチが取り除くので，S9 のブランチはそこに触れない（2 つのブランチが衝突しないように）．
- テスト: `tests/totp.test.mjs` の「S1」の 3 件．前半で，ログインページと認証ページの 2 件が通る．設定パネルの 1 件は，後半まで失敗する．

### S2
**サイト連絡先の正規表現の ReDoS**（中・再現・計測）

- 場所: [background.js:96-98](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L96-L98)．Sakai のサイト情報ページの HTML（教科書の教員名による絞り込み）に対して使う．
- 根拠: `<td>` の後に `,` も `<` も無い空白が続くと，`\s*([^,<\n]+?)\s*` の 3 つの量指定子が互いに文字を取り合う．空白 1,000 字で 0.3 秒，2,000 字で 2.4 秒，4,000 字で **20 秒**かかり，入力長の 3 乗で伸びる．
- 影響: その間 Service Worker のイベントループが止まり，TOTP 自動入力を含む拡張の全メッセージが応答しない．引き金はサイト連絡先の欄に異常な内容が入ることであるため，発生する可能性は低い．
- 直し方: 見出しを `indexOf` で探し，次の `<td…>` から `</td>` までを切り出してから，`,` と `<` で区切る．あるいは量指定子の上限を決める．
- 対応: 見出し，`<td`，`>` の位置を順に探して，セルを切り出す（[fix/site-contact-regex](https://github.com/yumasansansan/kulms-extension/tree/fix/site-contact-regex)）．ランダムな 20 万件のページで古い正規表現と答えを突き合わせると，最初の `<td>` が空のときを除いて一致した．そのとき古い正規表現は，次の `<td>`（多くは別の行）の内容を教員名として返していた．2026-10-25 に上流へ PR を送った（[#81](https://github.com/Radian0523/kulms-extension/pull/81)）．
- テスト: [tests/background.test.mjs](../tests/background.test.mjs) の「S2」（空白の連なりの長さ n，2n，4n で数えた仕事量の伸びの次数．main では 3），[tests/regexp.test.mjs](../tests/regexp.test.mjs)（正規表現のオートマトン）．

### S3
**TOTP 登録補助がシークレットをページの sessionStorage に置く**（低・読解）

- 場所: [src/auth-totp-register.js:12-17](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L12-L17)，[:134](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L134)
- 何が起きるか:
  - 登録が終わるまで，シークレットを auth.iimc の sessionStorage に平文で置く．このストレージはページの JS から読め，登録を途中でやめるとそのタブに残り続ける．
  - 登録完了の判定は「sessionStorage のキー」と「ページ本文の『設定が完了しました』」だけで行っている．そのため，ページ側がこの 2 つを用意すると，保存済みのシークレットを任意の値で上書きさせられる．
- 前提: auth.iimc でスクリプトを動かせる攻撃者がいること．
- 直し方: 保留中のシークレットは background の `chrome.storage.session` [[ChromeStorage]](#参考文献) にタブ ID ごとに置く．完了の判定には URL やフォームの状態も使う．
- 見立て: 登録の途中では，シークレットは QR とテキストとしてページに表示されている．そのため，ページのスクリプトは sessionStorage が無くても読める．偽の QR を表示すれば，好きなシークレットを保存させることもできる．保留中のシークレットを background に移して得られる利点は，登録を中止したときにタブに残らない程度であるため，優先度は低い．
- テスト: 未作成（ハーネスで作る）．

### S4
**シラバスの実体参照を二重にデコードし，数値参照は捨てる**（低・再現）

- 場所: [background.js:365-376](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L365-L376)
- 根拠:
  - `&amp;` を `&lt;` より先にデコードするので，`&amp;lt;img…&amp;gt;` が `<img…>` になる（書名が `<img src=x onerror=alert(1)>入門` になった）．
  - `&#\d+;` は空文字に置き換えるので，数値参照で書かれた文字が消える．
- 影響: 描画は textContent で行うため，現状では XSS にはならない．ただしデータが壊れ，将来 innerHTML で描画すれば XSS になる．
- 直し方: 実体参照を表で引く 1 回きりのデコーダにする．数値参照もデコードする．
- そのほか: 16 進の数値文字参照（`&#x…;`）と `&quot;` は，デコードされずに残る．
- 対応: すべての参照を 1 回の置き換えでデコードし，数値文字参照は 10 進も 16 進も文字に戻す．0，サロゲート，範囲外の数値は，これまでどおり捨てる（[fix/syllabus-parse](https://github.com/yumasansansan/kulms-extension/tree/fix/syllabus-parse)，S8 と同じブランチ）．2026-10-25 に，S8 とあわせて上流へ PR を送った（[#83](https://github.com/Radian0523/kulms-extension/pull/83)）．
- テスト: `tests/background.test.mjs` の「S4」の 2 件（二重のデコードと，数値文字参照）．

### S5
**使っていないホスト権限**（低・読解）

- 場所: [manifest.json:22](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/manifest.json#L22)
- 何が起きるか: v1.20.0 で Tips を消してから，`https://radian0523.github.io/*` へ通信するコードは無い（`<a href>` のリンクだけが残っている）．
- 直し方: 権限を外す．権限を減らす更新では，利用者に再承認を求める警告は出ない．
- 対応: [fix/drop-unused-host-permission](https://github.com/yumasansansan/kulms-extension/tree/fix/drop-unused-host-permission)．2026-10-25 に上流へ PR を送った（[#85](https://github.com/Radian0523/kulms-extension/pull/85)）．

### S6
**不正な TOTP シークレットを保存できる**（低・再現・ファズ）

- 場所: [popup.js:624](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L624)，[:713-714](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L713-L714)，[src/assignments.js:2252](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2252)，[:2443-2444](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2443-L2444)，[src/auth-totp-register.js:114-117](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L114-L117)，[:134-137](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L134-L137)，[background.js:13-16](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L13-L16)
- 根拠:
  - `^[A-Z2-7=\s-]+$` は `=` を途中に許し，長さも見ない．
  - `A` は保存され，コード表示中は毎秒 `DataError: Zero-length key` の未処理 Promise 拒否が出る（[popup.js:744](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L744)，[src/assignments.js:2366](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2366)）．8 ビットに満たないシークレット（Base32 の 1 文字）はデコードすると 1 バイトにもならず，Web Crypto は長さ 0 の HMAC の鍵を DataError で拒む [[WebCrypto]](#参考文献)．保存の前の検証を直しても，検証の前の版が保存したシークレットは残るので，表示する側でも防ぐ必要がある．2026-10-14 の毎日のファジング（38474299674）も，`popup` で，保存された `J` のコードを表示する入力としてこれを見つけた．
  - `AB=CD2345` と `========` は保存されるが，デコード結果が null になり，自動入力は何も言わずに動かない．
  - popup の「QR」は，保存されたシークレットを `encodeURIComponent()` で URI に入れて QR を作る．base32 でない文字を含むシークレットは 1 文字が最大 9 バイトに広がり，同梱の qrcode-gen が大きな QR を作る仕事が，入力の大きさに対して線形のコードの上限を超える（2026-10-14．ファズ対象 `popup` で確かめた）．QR の生成は，シークレットによらず，1 回に約 78 万歩（最短のシークレット `A` で版 4 の QR）の固定の仕事をする．対象はこの固定の仕事を入力の上限に加える（「fuzz リポジトリの仕組み」）が，9 バイトに広がる分は加えないので，その場合はなお上限を超える．
  - TOTP の登録補助（auth-totp-register.js）は，ページの文から `[A-Za-z2-7=]+` に当たる文字列を確かめずにシークレットとして読み，sessionStorage に置いて，登録の完了後に保存させる．`A` のような短い文字列では，コードの計算で `DataError: Zero-length key is not supported` の未処理の拒否が起きる（2026-10-14．ファズ対象 `totp-register` で確かめた）．
  - background は，拡張の更新時（`runtime.onInstalled`）に，旧版が chrome.storage.local に平文で残したシークレット（`kulms-totp-secret`）を，形を確かめずに暗号化して保存する．`A` や `========` もそのまま保存され，文字列でない値は文字列にされる（`[object Object]`，`12345`）（2026-10-14．カバレッジで届いていなかった移行のテストを書く際に確かめた）．
- 直し方: 実際にデコードして確かめる．末尾以外の `=` を拒み，最低長を決める（80 ビット = 16 文字）．拒んだときはエラーを表示する．
- 対応: popup と LMS の設定パネルの両方で，空白とハイフンを除いて大文字にしたシークレットを `^[A-Z2-7]{16,}=*$` で確かめる（[fix/validate-totp-secret](https://github.com/yumasansansan/kulms-extension/tree/fix/validate-totp-secret)）．登録補助は，同じブランチの続く修正で，QR と本文からの読み取りと完了後の保存の前に同じ形を確かめるようにした．更新時の移行も，同じ続く修正で，同じ形に合うものだけを移し，合わないものは移さずに平文だけを消すようにした（いずれも 2026-10-14）．さらに続く修正で，保存済みのシークレットにも備えた．4 か所の Base32 のデコードは 1 バイトにもならない入力をデコードできないものとし，popup と LMS の設定パネルの「QR」は保存のときと同じ形でないシークレットを QR にしない（2026-10-14）．このうち src/auth-totp.js の変更は，コードの計算を background に移す fix/totp-code-from-background と衝突する．そのブランチの background での計算も 1 バイトにもならない鍵を null とするので，後に取り込む方でそのブランチの形を取ればよい．
- テスト: `tests/totp.test.mjs` の「S6」の 3 件（popup，設定パネル，更新時の移行）と，`fuzz/known/totp-register/S6-short-secret` と `fuzz/known/popup/S6-qr-of-non-base32`（`tests/fuzz-inputs.test.mjs` が todo として流す）．空白，ハイフン，小文字，末尾の `=` を含む正しいシークレットが，今までどおり保存されることも確かめる．

### S7
**形の崩れたメッセージで onMessage リスナーが例外を投げる**（低・再現）

- 場所: [background.js:480-481](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L480-L481)，[:484-485](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L484-L485)，[:732-733](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L732-L733)
- 根拠: 次のメッセージで TypeError になる．
  - `null`（`message.action` を読む）
  - `{type: 1}`（`startsWith` が無い）
  - `{action: "fetchTextbooks", courseName: 1}`（`replace` が無い）
  - `{action: "fetchTextbooks", siteId: {toString: 0}}`（`String()` が変換できない．ファズ対象 `background-message` が見つけた）
- 影響: 送信できるのは拡張の文脈に限られるため，堅牢化の範囲の問題である．
- 直し方: メッセージの形を確かめる．オブジェクトであること，`type` と文字列の項目が文字列であること．`String()` で受けるだけでは足りない（`toString` が関数でないオブジェクトでは，`String()` も例外を投げる）．
- 対応: メッセージが無いときと，`type` が文字列でないときは，関係のないメッセージとして扱う．`fetchTextbooks` の項目は，文字列でなければ空として扱う（[fix/message-shape](https://github.com/yumasansansan/kulms-extension/tree/fix/message-shape)）．2026-10-25 に上流へ PR を送った（[#84](https://github.com/Radian0523/kulms-extension/pull/84)）．
- テスト: `tests/background.test.mjs` の「S7」．

### S8
**シラバス解析の正規表現が入力長の 2 乗で遅くなる**（低・再現・計測）

- 場所: background.js の，シラバスと検索結果を読む正規表現．
  - シラバス: [:366-367](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L366-L367)（`<style>` と `<script>` を除く `<style[^>]*>[\s\S]*?<\/style>` など），[:370](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L370)（タグを除く `<[^>]+>`），[:433](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L433)（書名を読む `^(.*?)『(.+?)』`），[:441](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L441)（出版社を読む `[（(]([^）)]+)[）)]`），[:452](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L452)（書名の末尾の区切りを除く `[\s,、;；]+$`），[:455-457](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L455-L457)（出版社のフォールバック `[,、]\s*([^,、]+?(?:社|…))`）．
  - 検索結果: [:228](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L228)（行の `<tr[^>]*>([\s\S]*?)<\/tr>`），[:244](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L244)（列の `<td[^>]*>([\s\S]*?)<\/td>`），[:248](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L248)（列の中のタグを除く `<[^>]+>`）．
- 根拠: いずれも，一致しなかった位置から一字ずつずらして探し直す．閉じない `<`，対にならない `『`，閉じない括弧，途中に長く続く区切り，`</tr>` の無い `<tr>`，`</td>` の無い `<td>`，閉じない `<style>`，区切りの後に長く続く空白で，入力長の 2 乗の時間がかかる．V8 で，閉じない `<` 2 万字に約 0.2 秒，対にならない `『` 2 万字に約 0.1 秒，閉じない括弧 8 万字に約 3.6 秒，`</tr>` の無い `<tr>` 4 万個に約 1 秒，閉じない `<style>` 4 万個に約 1.8 秒，区切りの後の空白 16 万字に約 6.3 秒かかった（Node 26.10.0，Core i7-1360P，3 回の中央値）．
- 補足: 教員が書いた文字は，KULASIS がエスケープして HTML に出す（`<` は `&lt;` になる）．そのため，タグを除く `<[^>]+>` が遅くなる入力は，教員の入力からは作りにくい．
- 対応: [fix/syllabus-parse](https://github.com/yumasansansan/kulms-extension/tree/fix/syllabus-parse) で，答えを変えずに線形の時間にした．2026-10-25 に，S4 とあわせて上流へ PR を送った（[#83](https://github.com/Radian0523/kulms-extension/pull/83)）．
  - 最初の修正（S4 と同じコミット）: 370 行と出版社の括弧は，最後の `>` や閉じ括弧より後ろを正規表現に渡さないようにした．433 行は `『` と `』` の位置で探し，書名の末尾は末尾から 1 字ずつ見て取り除いた．ランダムな 10 万件のページで古い実装と答えを突き合わせると，行の途中に U+2028 などの改行扱いの文字があるときを除いて一致した．そのとき古い実装は，『』を書名として読まなかった．
  - 続く修正: 正規表現そのものが線形になるよう，残りを書き換えた．閉じないものからは，残りを丸ごと一致させて探すのをやめる（その先に閉じるものは無いので，後ろのものも閉じない）．出版社のフォールバックは，出版社名を空白でない文字から始めて，区切りの後の空白と取り合わないようにした．区切りの後の空白の直後に出版社の語があるときに限り，これまでどおり最後の空白 1 字を含める．370 行と出版社の括弧も，渡す範囲を切る代わりに同じ書き方にした．新しい正規表現はいずれもオートマトンで線形と判定され，関わる文字だけでできたランダムな文字列（各 3 万件）で，元の正規表現と答えが一致した．
- テスト: [tests/background.test.mjs](../tests/background.test.mjs) の「S8」（連なりの長さ n，2n，4n で数えた仕事量の伸びの次数．main では 2），[tests/large.test.mjs](../tests/large.test.mjs)（ランダムなバイト列 8MB の検索結果．閉じない `<tr>` が約 400 万字に 1 度出る），[tests/regexp.test.mjs](../tests/regexp.test.mjs)（正規表現のオートマトン）．

### S9
**科目名，TOTP のシークレット，フォルダを読む正規表現が入力長の 2 乗で遅くなる**（低・解析・再現・計測）

- 場所:
  - [background.js:39](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L39)：`cleanCourseName()` が末尾の (…) を取る `\s*\(.*\)\s*$`．
  - [popup.js:628](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L628)，[src/assignments.js:2284](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2284)，[src/auth-totp-register.js:26](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L26)，[src/auth-totp.js:10](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp.js#L10)：base32 のデコードで，末尾の `=` を取る `=+$`．
  - [src/course-name.js:15](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/course-name.js#L15)，[src/textbooks.js:134](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L134)：曜日と時限を読む `\[(?:\d{4}[^\]]*?)?([月火水木金土日])\s*([０-９0-9]+)\s*\]`．
  - [src/tree-view.js:26](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tree-view.js#L26)：フォルダの深さを読む `collectionId.*?=\s*'([^']*)'`．
- 根拠: 拡張のすべての正規表現を，受理するオートマトンで調べて見つけた（recheck [[recheck]](#参考文献)．[tests/regexp.test.mjs](../tests/regexp.test.mjs)）．いずれも，一致しなかった位置から一字ずつずらして探し直す．`(` の続かない空白や閉じない `(`，末尾でない `=`，年の 4 桁が続く `[`（`]` が来ない），1 行に続く `collectionId`（`='…'` が無い）が長く続くと，入力長の 2 乗の時間がかかる．V8 で，空白 4 万字の科目名に約 0.9 秒，末尾でない `=` 4 万字に約 0.7 秒，日本語を含む 8 万字の科目名に約 0.3 秒，`collectionId` が続く 20 万字の onclick に約 0.8 秒（40 万字で約 3.3 秒）かかった（Node 26.10.0，Core i7-1360P，3 回の中央値）．
  - 曜日と時限の正規表現は，文字列が U+00FF までの文字だけのときは，V8 が直ちに失敗させる（曜日の文字がその範囲に無いため）．日本語を含む科目名では遅くなる．
- 影響: 科目名とフォルダはページから，シークレットは保存された値から来る．引き金は異常に長い値であるため，発生する可能性は低い．content script の処理が止まると，そのページが固まる．
- 対応: 正規表現そのものを，一度失敗した範囲を探し直さない書き方に改めた（[fix/backtracking-regexes](https://github.com/yumasansansan/kulms-extension/tree/fix/backtracking-regexes)）．ログインページの分を取り除く S1 の前半は，2026-10-25 に上流へ PR を送った（[#80](https://github.com/Radian0523/kulms-extension/pull/80)）．
  - `cleanCourseName()` は，`(` の続かない空白の連なりと，行末まで閉じない `(` からの残りを，丸ごと一致させてそのまま返し，末尾の (…) だけを取り除く．
  - 末尾の `=` は，その前の 1 字（または文字列の先頭）と一緒に一致させる（`(^|[^=])=+$` を `$1` に置き換える）．
  - 曜日と時限は，先に「曜日 時限 ]」を探し，同じ括弧の中（前の `]` から曜日まで）に，年の 4 桁が続く `[` か，曜日の直前の `[` があるかを確かめる．どの括弧の中も一度しか見ない．最初の書き換えでは，`[` を探す `indexOf` が括弧の外まで走っていたため，「月1]」が長く続くと 2 乗になった（数えた仕事量の次数 1.98）．下のテストの「月1]」の連なりは，これを確かめる．
  - フォルダの深さは，`collectionId` の後に `='…'` が無い行の残りを丸ごと一致させて，次の行へ進む．
  - 新しい正規表現はいずれもオートマトンで線形と判定された．関わる文字だけでできたランダムな文字列で，元の正規表現と答えが一致した（曜日と時限は 20 万件，ほかは各 3 万件．`cleanCourseName()` は前後の空白を除いた結果が一致し，関数はその結果を返す）．
- ログインページの `src/auth-totp.js` のデコードは，このブランチでは直さない．S1 の前半のブランチ（[fix/totp-code-from-background](https://github.com/yumasansansan/kulms-extension/tree/fix/totp-code-from-background)）が，そのデコードを background へ移して取り除くからで，ここで直すと同じ行を変えて衝突する．S1 の前半が background に置いたデコードの `/=+$/` は，そのブランチで同じように直した．そのため，S9 はこの 2 つのブランチがそろって直る．
- テスト: [tests/regexp.test.mjs](../tests/regexp.test.mjs) の「S9」（オートマトン），[tests/runs.test.mjs](../tests/runs.test.mjs)（それぞれの連なりの長さ n，2n，4n で数えた仕事量の伸びの次数．main では 2.00，修正後は 1）．ログインページのデコードの件と，オートマトンの件は，S1 の前半とそろって通る．

### S10
**ページに `<script>` と `<style>` を入れる**（低・読解・再現）

- 場所: [src/grading-ta.js:224-244](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L224-L244)（TA 採点支援のブリッジ `src/grading-ta-page.js` を `<script src>` で入れる），[src/sidebar-resize.js:32-34](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/sidebar-resize.js#L32-L34)（サイドバーの幅），[src/assignments.js:2717-2728](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2717-L2728)（緊急度の色），[:2734-2770](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2734-L2770)（サイドバーの上書き）
- 何が起きるか:
  - LMS のページの DOM に，`<script src>` と `<style>` を要素として入れる．ページから見れば，これらは攻撃で入ったものと区別がつかない．nonce やハッシュで許可したものだけを実行する CSP [[CSP3]](#参考文献) をページが持つと，ブラウザはこれらを止める．すると，TA 採点支援の提出一覧の取得，サイドバーの幅，緊急度の色，サイドバーの上書きが効かなくなる．nonce を付けても解決にはならない．nonce はページが自分のものを通すためのもので，拡張がページの nonce を写して付ければ，ページの守りをすり抜けることになる．
  - 緊急度の色の `<style>` は，保存された設定の値（`colorDanger` など）を，そのまま CSS の文に連結する．値に `;` や `}` があれば，任意の規則が入る．
- 根拠: コードを読んだ．広げた検出器（「fuzz リポジトリの仕組み」）は，拡張が入力の間にこれらの要素を入れたら失敗とする．
- 直し方: ページに要素を入れない．ページの世界で動かすスクリプトは，manifest の content_scripts に `"world": "MAIN"` で書くか [[ChromeContentScripts]](#参考文献)，background から `chrome.scripting.executeScript()` に `world: "MAIN"` を指定して入れる [[ChromeScripting]](#参考文献)（`scripting` の権限はすでにある）．スタイルは content_scripts の css（styles.css）にまとめ，値の変わる色や幅は，CSSOM（`style.setProperty()` で CSS 変数を与える）で渡す．色の値は，CSS の色として読めるものだけを使う．
- テスト: `tests/assignments.test.mjs` の「S10」（科目のページに，拡張が `<style>` を入れない）．

### S11
**Trusted Types を求めるページで，innerHTML などに文字列を渡す**（低・読解・再現）

- 場所: [src/assignments.js:120](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L120)，[:958-987](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L958-L987)，[:1959](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L1959)，[:2001](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2001)，[:2069](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2069)，[:2326](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2326)，[:2382-2404](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2382-L2404)，[:2693](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2693)，[src/textbooks.js:166-189](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L166-L189)，[src/tree-view.js:231-238](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tree-view.js#L231-L238)，[src/tool-visibility.js:115](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L115)，[src/grading-ta.js:234](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L234)，[:467](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L467)，[popup.js:316](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L316)，[:766-794](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L766-L794)
- 何が起きるか: 拡張は，UI を `innerHTML` で組み立てたり消したりし（`innerHTML = ""` も），取得したページを `DOMParser` で読み，ブリッジの `src` に文字列を入れる．いずれも Trusted Types [[TT]](#参考文献) の受け口であり，CSP に `require-trusted-types-for 'script'` があるページ（と，それを求める拡張のページ）は，TrustedHTML などでない文字列を拒み，例外を投げる．そのページでは，課題パネル，教科書パネル，フォルダの展開，ツール表示管理，TA 採点支援，popup の該当する部分が動かなくなる．
- 根拠: コードを読んだ．ハーネスの窓は Chrome と同じ Trusted Types の API を持ち，受け口に渡された文字列を検出器が失敗とする（「fuzz リポジトリの仕組み」）．
- 直し方: 受け口を使わない．要素は `createElement` と `textContent` で作り，消すのは `replaceChildren()` にする．取得したページから値を読む箇所では，サニタイズする API（HTML Sanitizer API [[Sanitizer]](#参考文献) の `Element.setHTML()` など）で無害にした文書から読む．ブリッジは，S10 の直し方のとおり，DOM に差し込まずに入れる．文字列を TrustedHTML に変えるだけで内容を確かめない方針や，すべての文字列を通す default の方針を作ることは，型を形骸化させるため，修正にはならない（検出器は，作られた方針を試し，そうした方針も失敗とする）．
- テスト: `tests/assignments.test.mjs` の「S11」（課題パネルを，Trusted Types の受け口に文字列を渡さずに描く）．

### S12
**取得したデータを，リダイレクトの行き先を確かめずに使用する**（低・読解・ファズ）

- 場所: [background.js:68-93](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L68-L93)（サイト連絡先），[:186-190](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L186-L190)（KULASIS の検索とシラバス），[src/assignments.js:54-71](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L54-L71)（Sakai の API），[:117](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L117)，[src/textbooks.js:25-29](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L25-L29)，[src/grading-ta.js:464-466](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L464-L466)，[src/tree-view.js:223-231](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tree-view.js#L223-L231)
- 何が起きるか: 拡張は KULMS と KULASIS の応答を，リダイレクトを追った結果のまま使用し，最終的な取得元（`res.url`）を確かめない．`sakaiGet()` は，ログインページへのリダイレクトをパスのみで判定する．サーバーが外部のオリジンへリダイレクトした場合（オープンリダイレクトなど）や，http へ切り替えた場合，転送先のサーバー（攻撃者のものであってもよい）は，CORS の判定を通過する応答ヘッダーを返すだけで，自らのデータを課題，教員名，シラバス，教科書，提出の状態，フォルダの一覧として拡張に表示させることができる．Fetch 標準では，別のオリジンへのリダイレクトの後，CORS の判定に用いる要求のオリジンは `null` として直列化される（redirect-taint）が，転送先が `Access-Control-Allow-Origin: null` と `Access-Control-Allow-Credentials: true` を返せば，資格情報を伴う要求であっても判定は成功する [[Fetch]](#参考文献)．
- 暗号学的な検証について: KULMS（Sakai）も KULASIS も，応答に署名を付与しない．したがって，拡張が依拠できる暗号学的な保証は TLS [[RFC8446]](#参考文献) のみであり，TLS が保証するのはデータの送信元のサーバーである．最終的な取得元が https であり，期待するホストであることを確かめれば，TLS による保証をそのまま利用できる．Chrome の拡張は，ホスト権限を宣言したホストとスキームに限り CORS を経ずに取得できる [[ChromeNetwork]](#参考文献) が，取得元の証明書そのものを参照する API は持たない．Firefox では，`webRequest.onHeadersReceived` の blocking リスナーの中で `webRequest.getSecurityInfo()` を呼ぶことにより，証明書チェーンを取得できる [[MDN-getSecurityInfo]](#参考文献)．これを用いれば，大学のホストの証明書（または発行者）を固定（ピン留め）できる．
- 根拠: コードを読んだ．ハーネスの fetch は，Fetch 標準のリダイレクトの扱い（HTTP fetch と HTTP-redirect fetch），redirect-taint，CORS の判定 [[Fetch]](#参考文献) と，Chrome の拡張の取得の扱い [[ChromeNetwork]](#参考文献) に従い，content script の http への要求は混在コンテンツとして止める [[MixedContent]](#参考文献)．そのうえで，リダイレクトで別のオリジンや http から届いた応答の本文を拡張が読んだ場合に失敗とする（2026-10-14．[harness/net.mjs](../harness/net.mjs)）．ファズ対象 `site-contact` で確かめた（pages.json の取得が外部へリダイレクトされ，転送先が CORS で読み取りを許可した場合に，background はそれを LMS の応答として読む）．
- 直し方: リダイレクトを想定しない取得には `redirect: "error"` を指定する．ログアウトの検知のためにリダイレクトを扱う `sakaiGet()` は，`redirect: "manual"` を指定して opaque-redirect の応答 [[Fetch]](#参考文献) をログアウトとみなすか，`res.url` のオリジンが `https://lms.gakusei.kyoto-u.ac.jp` であることを確かめてから使用する．
- 対応: 応答を使う前に，最終的な取得元のオリジン（スキームとホスト）が求めた先と同じであることを確かめ，違えば取得の失敗として扱う（7 か所．[fix/redirect-origin](https://github.com/yumasansansan/kulms-extension/tree/fix/redirect-origin)）．2026-10-20 に，ブランチを v1.22.0 の上に作り直し，フォルダの取得の確かめを，取得を移した `fetchFolderAction()` に当て直した（「すべて展開」もここを通る）．2026-10-25 に上流へ PR を送った（[#82](https://github.com/Radian0523/kulms-extension/pull/82)）．
- テスト: `fuzz/known/site-contact/S12-redirect-elsewhere`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### S13
**ランディングページに CSP などの守りが無く，GitHub Pages ではヘッダーを付けられない**（低・取得・ブラウザ）

- 場所: `docs/` の 4 ページ．[docs/index.html:9-412](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L9-L412) の style 要素，[:1415-1501](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L1415-L1501) のインラインのスクリプト，style 属性 11 か所とイベントハンドラーの属性 3 か所．[docs/2fa/index.html](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/2fa/index.html) にも style 要素，style 属性，インラインのスクリプトがあり，[docs/security/index.html](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/security/index.html) と [docs/privacy.html](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/privacy.html) にも style 要素がある．
- 何が起きるか:
  - どのページも CSP [[CSP3]](#参考文献) を持たず，インラインのスクリプトとスタイル，イベントハンドラーの属性を使っている．そのため，差し込まれたマークアップやスクリプトを止める仕組みが無い．
  - GitHub Pages では，レスポンスヘッダーを設定できない．公開中のサイトが返すのは，Content-Type，`Access-Control-Allow-Origin: *`，`Strict-Transport-Security: max-age=31556952`，`Cache-Control: max-age=600` のみであり，Content-Security-Policy，X-Frame-Options，X-Content-Type-Options，Permissions-Policy などは返らない．
  - HTML の `http-equiv` が受け付ける値は 7 つであり，そのうちセキュリティに関わるのは Content-Security-Policy のみである [[HTML]](#参考文献)．meta 要素で与えた CSP では，frame-ancestors と sandbox が無視される [[CSP3]](#参考文献)．Referrer-Policy は `<meta name="referrer">` で与えられる [[ReferrerPolicy]](#参考文献)．したがって，埋め込みの禁止（frame-ancestors，X-Frame-Options），MIME の推測の禁止，機能の制限，オリジンの分離は，サイトの側からは与えられない．
  - CSP の `'self'` は `https://radian0523.github.io` を指す．このオリジンは，同じ作者の kulms-android と kulms-ios の Pages と共有されている．
  - `github.io` は，Chromium と Firefox の HSTS のプリロードの一覧に無い（`github.com` はサブドメインを含めて載っている）[[HSTSPreloadChromium]](#参考文献) [[HSTSPreloadFirefox]](#参考文献)．そのため，初めて http でアクセスしたときに限り，https への転送の前に通信を改ざんされうる．
- 前提: ページは入力を表示せず，ログインやフォームのような，利用者を欺いて操作させる価値のあるものを持たない．そのため，直ちに害が及ぶ経路は見つかっていない．
- 根拠: 公開中のサイトの応答ヘッダーを取得して確かめた（2026-10-14）．ヘッドレスの Edge 155 と Firefox 158 で，別のオリジンのページから iframe で埋め込んだ．meta 要素で与えた frame-ancestors と X-Frame-Options は無視され（ページは表示され，Edge はコンソールにエラーを出す），レスポンスヘッダーで与えたものだけが埋め込みを止めた．
- 直し方: インラインのスクリプトとスタイルを外部のファイルに移し，meta 要素で CSP と Referrer-Policy を与える．meta 要素で与えられないものは，ヘッダーを付けられる層（独自ドメインと CDN，または `_headers` などを読むホスティング）を前に置かない限り与えられない．その場合はサイトの URL が変わるので，拡張の `manifest.json` の `homepage_url`，`src/assignments.js`，`popup.html`，README，ストアの掲載情報も変える必要がある．埋め込みを JavaScript で検知して隠す方法は，埋め込む側がそのフレームのスクリプトを止めれば働かない [[OWASP-Clickjacking]](#参考文献)．
- 対応: 4 ページのスタイルとスクリプトを `docs/assets/site.css` と `site.js` に移した．meta 要素では，CSP（`default-src 'none'`，自身のスクリプト，スタイル，画像のみを許可，`base-uri` と `form-action` は `'none'`，`upgrade-insecure-requests`，Trusted Types を必須とする．スクリプトの無い 2 ページは `script-src 'none'`）と Referrer-Policy を与えた（[#77](https://github.com/Radian0523/kulms-extension/pull/77)．2026-10-23 に上流に取り込まれた）．SRI [[SRI]](#参考文献) とハッシュによるスクリプトの許可は導入していない．CSS や JS を変えるたびにハッシュの更新が必要であり，Pages のキャッシュ（10 分）の間に HTML と食い違うと，ファイルが読み込まれなくなるためである．
- テスト: ブラウザで，文字列の innerHTML への代入，差し込んだインラインのスクリプト，style 属性，ほかのオリジンの画像が拒まれることを確かめた．
- 取り込まれた後の確認（2026-10-24）: 公開中の 4 ページは，head の meta 要素で CSP と Referrer-Policy を持ち，インラインのスクリプト，style 要素，style 属性，イベントハンドラーの属性を持たない．Chromium で開くと，文字列の innerHTML への代入（Trusted Types），差し込んだインラインのスクリプト，ほかのオリジンの画像が拒まれ，ページ自体の読み込みでは違反が出ない．応答ヘッダーは取り込む前と同じであり，応答ヘッダーだけを調べる検査（Security Headers など）では，CSP は無いと出る．

### S14
**授業資料のツリーのキャッシュを，ページから書き換えられる localStorage に HTML のまま置き，検証せずに表へ入れる**（中・読解・ファズ）

- 場所: [src/tree-view.js:252-307](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/tree-view.js#L252-L307)（`loadCache()`，`saveCache()`，`pruneCache()`），[:329-380](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/tree-view.js#L329-L380)（`expandAllFolders()`．346 行で表に入れる）
- 何が起きるか: v1.22.0 の授業資料の自動展開は，展開した表の tbody の HTML を，LMS のページの localStorage に `kulms-tree-cache:<パス>|<ルートの ID>` のキーで保存する．次にそのページを開いたときは，サーバーに取り直す前に，その HTML を検証せずに表の `innerHTML` に入れる．LMS の起源の localStorage は，同じ起源で動くどのスクリプト（Sakai 自身のもの，XSS で入ったもの，同じ起源で開かれる利用者のアップロードした HTML など）も読み書きできる．
  - 一度でも LMS の起源でスクリプトを動かせた攻撃者は，キャッシュにイベントハンドラーを持つマークアップ（`<img onerror>` など）を書いておけば，利用者がその授業資料を開くたびにスクリプトを動かせる．`innerHTML` は `<script>` を実行しないが，イベントハンドラーは実行する [[HTML]](#参考文献)．キャッシュは取り直した結果で上書きされるが，動いたスクリプトが書き直せば残り続ける．
  - キャッシュはログアウトしても消えない．共用のブラウザでは，次の利用者が同じ授業資料のページを開いたとき，前の利用者に見えていた一覧（その役割で見えたフォルダやファイルの名前）が，取り直すまでの間表示される．
  - Trusted Types を求めるページでは，文字列を `innerHTML` に入れること自体が拒まれる（S11）．
- 根拠: 読解．ファズ対象 `resources` に，ページの localStorage のキャッシュを入力として加えたところ，キャッシュから表に入ったイベントハンドラーを，検出器が報告した（2026-10-20）．
- 直し方: キャッシュを，ページから読み書きできない `chrome.storage.local` に置き，ログアウトや利用者の切り替えで消す．HTML ではなく，表を作り直すのに要る値（行の名前，リンク，階層）だけを保存し，textContent などで組み立てる．
- 対応: 未着手．
- テスト: `fuzz/known/resources/S14-cached-tree-runs-script`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

## 不具合

### B1
**複数タブを開いていると，メモ・完了チェック・非表示が消える**（高・再現）

- 場所: [src/assignments.js:548-550](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L548-L550)，[:660-662](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L660-L662)，[:726-728](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L726-L728)
- 何が起きるか: 各タブは，ページを開いたときに状態を一度だけ読み込む（[:2975-2977](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2975-L2977)）．その後は，メモリにある全体をそのまま上書き保存する．assignments.js には `chrome.storage.onChanged` の処理が無く，他のタブの変更を知らない．
- 根拠: タブ B でメモを追加し，続いてタブ A で追加すると，B のメモが消えた．完了チェックと非表示も同じ書き方をしている．
- 影響: LMS を頻繁に複数のタブで開く利用者のデータが消える．
- 直し方: 操作のたびに「最新を読む → 差分を当てる → 書く」にするか，`storage.onChanged` で他のタブと同期する．より良いのは，項目ごとのキーにするか，background が更新を一列に並べる方式．
- 対応: `storage.onChanged` で，ほかのタブが保存した状態をメモリに取り込み，開いているパネルを描き直す．バックフォワードキャッシュから戻ったページは読み直す（[fix/sync-state-across-tabs](https://github.com/yumasansansan/kulms-extension/tree/fix/sync-state-across-tabs)，PR [#75](https://github.com/Radian0523/kulms-extension/pull/75)）．2026-10-13 に上流に取り込まれ（[`0a0683b`](https://github.com/Radian0523/kulms-extension/commit/0a0683b905fa924cc4931f58bd6e2e19d9302949)），v1.21.1 で出た．
- テスト: `tests/assignments.test.mjs` の「B1」の 4 件（メモ，完了チェック，削除，開いているパネルの表示）．

### B2
**非表示にした課題が 30 日後に一覧へ戻る**（中・再現・上流 [#74](https://github.com/Radian0523/kulms-extension/issues/74) の原因とみられる）

- 場所: [src/assignments.js:664-686](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L664-L686)
- 何が起きるか: 画面は「30日後に自動的に完全削除されます」と表示する．しかし 30 日後に消えるのは，課題を隠している**非表示の記録**の方である．そのため，サーバーの一覧にまだある課題は「遅延提出」や「その他」に戻ってくる．
- 根拠: 31 日前に非表示にした課題 2 件が，どちらも一覧に戻った．
- 直し方: 「隠し続ける」と「削除済みに 30 日表示する」を分ける．非表示の記録は，その課題が取得結果から消えたとき（あるいは締切から一定期間が過ぎたとき）に消す．
- 対応: 30 日たった課題・クイズの記録は，削除日時だけの記録にして隠し続ける．メモは今までどおり，メモごと削除する（[fix/keep-dismissed-hidden](https://github.com/yumasansansan/kulms-extension/tree/fix/keep-dismissed-hidden)，PR [#76](https://github.com/Radian0523/kulms-extension/pull/76)）．2026-10-13 に上流に取り込まれ（[`f569e9d`](https://github.com/Radian0523/kulms-extension/commit/f569e9de9d23b1aefcef152b845c400fe74cff54)），v1.21.1 で出た．上流は #74 を閉じた．
- テスト: `tests/assignments.test.mjs` の「B2」（削除済みセクションから外れることも確かめる）と，31 日前に削除したメモがメモごと消えることを確かめるテスト．

### B3
**サイドバーの色分けで，期限切れが最も弱く扱われる**（中・再現）

- 場所: [src/assignments.js:2796](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2796)
- 何が起きるか: `(priority[u] || 99)` は，期限切れの優先度 0 を 99 として扱う．そのため，期限切れの課題がある科目が，同じ科目の他の課題の色で塗られる．
- 根拠: 「期限切れ + 先の課題」は灰色，「期限切れ + 緑の課題」は緑になった．
- 直し方: `??` を使うか，`in` で確かめる．
- 対応: 急ぐ順の表に無いときだけ 99 とし，`in` で確かめる（[fix/sidebar-overdue-color](https://github.com/yumasansansan/kulms-extension/tree/fix/sidebar-overdue-color)）．
- テスト: `tests/assignments.test.mjs` の「B3」．

### B4
**ツール表示管理が 200ms ごとの再処理を止めない**（中・再現）

- 場所: [src/tool-visibility.js:71](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L71)，[:107-108](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L107-L108)，[:141-161](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L141-L161)
- 何が起きるか:
  - 処理済みかどうかの目印は，隠すツールがあるときにしか付かない．
  - 処理のたびに，表示側のツールをすべて付け直す（appendChild）．この付け直しは DOM の変更として通知される．
  - `processing` フラグで二重処理を防ごうとしているが，MutationObserver のコールバックはフラグを戻した後に非同期で呼ばれるので効かない．
  - その結果，全ツールが表示側にある科目が 1 つでもあると，ページの変更 1 回をきっかけに，200ms ごとの処理が永久に続く．
- 根拠: 3 秒で 15 回，1.5 秒で 8 回の変更が起きた．全科目に隠すツールがある場合は 1 回で止まる．
- 影響: LMS を開いている間，CPU と電池を使い続ける（この機能は既定でオフ）．
- 直し方: 処理済みの印を明示的に付ける．並びが変わるときだけ並べ替える．監視はサイドバーに絞る．自分の変更は `takeRecords()` で読み捨てる．
- 対応: 表示ツールがすでにその順で並んでいれば付け直さず，処理の後に自分の変更の通知を `takeRecords()` で読み捨てる（[fix/tool-visibility-loop](https://github.com/yumasansansan/kulms-extension/tree/fix/tool-visibility-loop)）．効いていなかった処理中のフラグは外した．監視の範囲は P3 で扱う．
- テスト: `tests/sidebar.test.mjs` の「B4」と，`fuzz/known/sidebar/B4-every-tool-shown`（`tests/fuzz-inputs.test.mjs` が todo として流す）．ファズ対象 `sidebar` が，ページの時計を進めたときに見つけた（再処理が止まらず，仕事が上限を超える）．

### B5
**Safari 版に `vendor/` が同梱されない**（中・再現（ビルド））

- 場所: [build.sh:49](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/build.sh#L49)．Xcode プロジェクトは，ビルドの段（Sync Web Extension Resources）で Resources/ の内容をすべて appex に写すため，Resources/ に置けば同梱される．
- 何が起きるか: v1.18.0 以降，manifest は `vendor/jsqr.min.js` と `vendor/qrcode-gen.js` を参照している．しかし Safari への同期と Xcode のリソースには `vendor/` が無い．そのため Safari では，auth.iimc の登録補助（jsQR と同じ組）と QR 表示が動かないはずである（Safari 実機では未確認）．
- 根拠: コピーで `build.sh safari` を実行すると，manifest が参照する 2 ファイルが Resources に無かった．
- 直し方: 同期の対象に `vendor` を加える．あわせて，各ビルド出力に manifest の参照するファイルが揃っているかを CI で検査する．
- 対応: 拡張機能の動作に必要なものを build.sh の 1 か所に並べ，Safari への同期と zip の両方でそれを使う（[fix/build-contents](https://github.com/yumasansansan/kulms-extension/tree/fix/build-contents)，B6 と同じ）．上流は 2026-10-13 に，この指摘をもとに同じ形の修正を自ら入れ（[`97a8746`](https://github.com/Radian0523/kulms-extension/commit/97a87462f3ab2950867ef53c2171713a77a7b3a8)），v1.21.1 で出た．あわせて Safari の Resources を src に揃えた（M4）．
- テスト: `tests/build.test.mjs` の「B5」．

### B6
**配布用 zip に `node_modules/` などが入る**（中・再現（ビルド））

- 場所: [build.sh:8](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/build.sh#L8)
- 何が起きるか: 除外リストに `node_modules/`，`package.json`，`bun.lock`，`eslint.config.js` が無い．bun に移行してからは開発者の手元に `node_modules/` があるので，ストアに出す zip に開発用の依存が入る．
- 根拠: `node_modules` があるコピーで `build.sh chrome` を実行すると，4 つとも zip に入った．
- 直し方: 除外リスト方式をやめ，入れるものを列挙する（manifest.json，background.js，popup.*，styles.css，src，vendor，icons，_locales）．
- 対応: そのとおりに列挙し，zip には今までどおり LICENSE も入れる（[fix/build-contents](https://github.com/yumasansansan/kulms-extension/tree/fix/build-contents)，B5 と同じ）．Chrome と Firefox の zip に開発用のファイルが入らず，Safari の Resources に manifest の参照するファイルがすべて揃うことを確かめた．上流の修正は B5 と同じ（[`97a8746`](https://github.com/Radian0523/kulms-extension/commit/97a87462f3ab2950867ef53c2171713a77a7b3a8)，v1.21.1）．
- テスト: `tests/build.test.mjs` の「B6」．

### B7
**キャッシュから描画すると，クイズのリンクが課題ツールを指す**（低・再現）

- 場所: [src/assignments.js:2910-2919](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2910-L2919)
- 何が起きるか:
  - 課題ツールの対応表を，クイズにも当てはめる．
  - サイドバーに無い科目では，項目ごとに `pages.json` を直列に取りに行く．そして解決した URL をキャッシュに書き戻さないので，パネルを開くたびに繰り返す．
- 直し方: 地図は種類ごとに当てる．解決は科目ごとに 1 回，並行して行い，結果をキャッシュに残す．
- 対応: 課題には課題ツールの，クイズにはテスト・クイズツールの地図を当てる．地図に無い科目の課題は，科目ごとに 1 回だけ並行して引き，キャッシュが読んだときのままなら，タイムスタンプを変えずにそこへ残す（[fix/cached-tool-links](https://github.com/yumasansansan/kulms-extension/tree/fix/cached-tool-links)）．
- テスト: `tests/assignments.test.mjs` の「B7」の 2 件（クイズのリンク，サイドバーに無い科目の課題を 1 回だけ引いて残すこと）．

### B8
**バナーが重複し，設定タブにも紛れ込む**（低・再現）

- 場所: [src/assignments.js:1940-2020](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L1940-L2020)
- 何が起きるか: 描画のたびにストレージを非同期に読み，読み終わったときにバナーを付け足す．そのとき，描画が同じままであるか，現在のタブが課題一覧であるかを確かめていない．
- 根拠: 2 回続けて描画すると，バナーが 2 個から 4 個になった．設定タブにも現れた．
- 直し方: 描画ごとに世代番号を持たせて照合する．あるいは，バナーを出すかどうかを初期化時に一度だけ読む．
- 対応: 描画のときにバナーの場所に目印を置き，ストレージを読み終えたときに，目印がまだパネルの中にあるときに限りバナーに置き換える（[fix/assignment-banners](https://github.com/yumasansansan/kulms-extension/tree/fix/assignment-banners)）．描画し直すか別のタブに移ると，内容とともに目印も消える．
- テスト: `tests/assignments.test.mjs` の「B8」の 2 件（2 回続けて描画したとき，設定タブに移ったとき）．

### B9
**読み込み中の更新要求が，成功扱いのまま捨てられる**（低・読解・再現）

- 場所: [src/assignments.js:2891-2893](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2891-L2893)，[:3043-3047](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L3043-L3047)，[:577](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L577)
- 何が起きるか: 読み込み中に `loadAssignments` を呼ぶと，何もせずに返る．そのため，popup の更新ボタンは成功と表示するが，実際には更新していない．提出直後に強制する再取得も，同じ理由で捨てられることがある．
- 直し方: 進行中の Promise を返す．強制更新の要求は，実行中の処理が終わった後に 1 回実行する．
- 対応: そのとおりに直し，続けて要求された強制更新は 1 回にまとめる（[fix/refresh-while-loading](https://github.com/yumasansansan/kulms-extension/tree/fix/refresh-while-loading)）．読み込み中かどうかを表す `isLoading` は，B1 の修正がタブ間の同期で読むので残し，読み込みの間 true にする．
- テスト: `tests/assignments.test.mjs` の「B9」．

### B10
**i18n の置換で，値の中の `$&` や置き場所の名前が展開され，結果が値の長さの 3 乗まで伸びる（潜在）**（低・再現・ファズ）

- 場所: [src/settings.js:112](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/settings.js#L112)，[popup.js:29](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L29)
- 何が起きるか: 値が，置いたとおりに入らない．現在の呼び出しは数値しか渡さないため，表面化していない．
  - 値を `String.prototype.replace` の置換文字列として渡しているので，`$&` は `$MINS$` に，`$$` は `$` に変わる．
  - 置き場所ごとに順に置き換えるので，前に入れた値の中に後の置き場所の名前（`$MINS$` など）があると，それも置き換わる．`t("remainDaysHoursMins", ["$HOURS$", "5", "7"])` は「残り5日5時間7分」になる．
  - 置換文字列の `` $` `` と `$'` は，一致の前と後の文字列を差し込む．置き場所が 2 つある文では，前の置換が差し込んだ文字列の中にある後の置き場所の名前を，後の置換がまた置き換えるので，結果の長さと仕事は値の長さの 2 乗（`` $` ``）や 3 乗（`$'`）で伸びる．`$'` を 256 回繰り返した値を `remainHoursMins` の 2 つの置き場所に入れると，結果は約 7,600 万文字になる．
- 根拠: 後半は，前半を直したブランチを読む過程で判明し，ファズ対象 `i18n` もそのブランチで見つけた（2026-10-07，期待する結果と比べる確かめ方にしてから）．伸びは，ファズ対象 `i18n` が段で見つけた（2026-10-07．仕事の次数は，`` $` `` で 1.98，`$'` で 2.99）．
- 直し方: メッセージを 1 回だけ置き換え，値は関数で返す．
- 対応: メッセージを 1 回だけ置き換え，値は関数で返してそのまま入れる（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)，B15，B21 と同じブランチ）．
- テスト: `fuzz/known/i18n/B10-placeholder-in-value`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/i18n.test.mjs` の「B10」の 4 件（settings.js と popup.js の `t()` が，値をそのまま入れることと，仕事が値の長さに線形に伸びること）．

### B11
**教科書一覧が科目名をキーとしており，同名の科目が衝突する**（低・読解・再現）

- 場所: [src/textbooks.js:368-373](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L368-L373)
- 何が起きるか: 名前が同じ科目があると，後の科目の項目が前の科目の項目を上書きし，一覧には 1 つしか出ない．
- 直し方: サイト ID をキーにし，表示名は別に持つ．
- 対応: そのとおりに直した（[fix/textbooks-by-site](https://github.com/yumasansansan/kulms-extension/tree/fix/textbooks-by-site)）．以前に科目名をキーにして保存したキャッシュは，表示名を持たないので，キーを表示名として読む．
- テスト: `tests/assignments.test.mjs` の「B11」と，科目名をキーにしたキャッシュを描画するテスト．

### B12
**ページから書き換えられる Web Storage の値で例外になる**（低・読解）

- 場所: [src/assignments.js:556-579](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L556-L579)，[src/tool-visibility.js:31](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L31)，[src/top-favbar.js:87](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/top-favbar.js#L87)，[src/submit-detect.js:68-75](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/submit-detect.js#L68-L75)
- 何が起きるか: LMS の sessionStorage と localStorage は，ページ自身の JS から（攻撃者のものも）いつでも書き換えられる．
  - `kulms-submitted-ids` が配列でない JSON（`"abc"` など）だと，`ids.forEach` で未処理の拒否になる．
  - `kulms-tool-config` の値に `hasOwnProperty` という名前の項目があると，TypeError になる．項目がオブジェクトでない場合，表示の切り替えが strict モードでそれにプロパティを置こうとして TypeError になる．
  - 提出を検知する submit-detect.js は，提出ボタンが押されたときに `kulms-submitted-ids` を読み，配列でない値（文字列など）の `push` を呼んで TypeError になる．提出は完了として記録されない（2026-10-13 にファズ対象 `submission` で確かめた）．
- 直し方: 読んだ値の形を確かめ，`Object.hasOwn` を使う．拡張の状態は，可能な限り chrome.storage に置く．
- 対応: 提出の ID は文字列の配列だけを使い，それ以外の要素は捨てる．ツールの設定は，オブジェクトでなければ空とみなし，科目の設定の有無は `Object.prototype.hasOwnProperty.call` で確かめる（[fix/web-storage-values](https://github.com/yumasansansan/kulms-extension/tree/fix/web-storage-values)）．top-favbar.js の同じ読み方と submit-detect.js の提出の ID の一覧も，同じブランチの続く修正で同じように直した（2026-10-14）．
- テスト: `tests/assignments.test.mjs` の「B12」（提出の ID）と，`tests/sidebar.test.mjs` の「B12」の 2 件（ツールの設定）と，`fuzz/known/submission/B12-ids-not-a-list`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### B13
**シラバス検索の最後のフォールバックが無関係な科目を選びうる**（低・読解）

- 場所: [background.js:318-324](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L318-L324)
- 何が起きるか: 科目名検索の結果に，名前が完全一致も部分一致もしない候補しか無くても，先頭の 1 件を返す．そのため，別の科目の教科書がシラバスへのリンク付きで表示されうる．コメントでは意図した動作とされているので，設計を見直す候補として扱う．
- 直し方: 一致が無いときは「シラバス未登録」を表示する．あるいは教員名が一致するときだけ採用する．

### B14
**Shift_JIS にない文字を検索語から黙って落とす**（低・再現）

- 場所: [background.js:148-183](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L148-L183)
- 根拠: `𠮷野家` は `野家` として検索される．
- テスト: `tests/background.test.mjs` の「B14」．

### B15
**`t()` がキーをプロトタイプ越しに引き，`t("hasOwnProperty")` が undefined になる（潜在）**（低・ファズ）

- 場所: [src/settings.js:104-117](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/settings.js#L104-L117)，[popup.js:21-33](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L21-L33)
- 何が起きるか: 読み込んだ messages.json を `__kulmsOverrideMessages[key]` で引くので，`constructor`，`toString`，`hasOwnProperty` などのキーは Object.prototype の関数に当たる．その `message` は undefined であるため，`t()` は文字列ではなく undefined を返す．現在の呼び出しではキーが定数であるため，表面化していない．
- 根拠: ファズ対象 `i18n` が，起動から 1 秒足らず（390 回目）で見つけた．
- 直し方: `Object.hasOwn(messages, key)` で引く．
- 対応: 辞書自身のキーだけを引き，それ以外は `chrome.i18n.getMessage` に任せる（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)，B10，B21 と同じブランチ）．
- テスト: `fuzz/known/i18n/B15-hasOwnProperty`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/i18n.test.mjs` の「B15」（popup の `t()`）．

### B16
**TA 採点支援が壊れた `%` の並びで URIError を投げ，装飾が止まる**（低・ファズ）

- 場所: [src/grading-ta.js:62-68](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L62-L68)，[:134-142](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L134-L142)
- 何が起きるか: 提出へのリンクや URL のクエリから ID を取り出すとき，`decodeURIComponent` を例外の処理なしに呼ぶ．`%` の後に 16 進数が続かないリンクがあると URIError で止まり，提出一覧の状態アイコンの装飾がその場で途切れる．URL のクエリに壊れた `%` があると，採点画面の起動そのものが止まる．
- 根拠: ファズ対象 `grading-status` が，約 6 万回目（10 秒）で見つけた．ファズ対象 `grading-pages`（2026-10-14 に加えた）では，ページのクエリ，課題へのリンク，表の提出へのリンクで同じことが起きる．
- 直し方: 失敗した場合は元の文字列を使う（あるいは `URLSearchParams` で読む）．
- 対応: デコードできないときは，元の文字列をそのまま使う（[fix/grading-ta-input](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-ta-input)，B18 と同じブランチ）．
- テスト: `fuzz/known/grading-status/B16-malformed-percent`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/grading-ta.test.mjs` の「B16」．

### B17
**保存されたメモが配列でないか，null を 1 つでも含むか，欄に文字列にできない値を持つと，課題パネルの描画が止まる**（中・ファズ）

- 場所: [src/assignments.js:1064-1066](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L1064-L1066)，[:1468-1470](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L1468-L1470)，[:674-676](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L674-L676)，[:720](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L720)，[popup.js:390-393](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L390-L393)
- 何が起きるか:
  - メモは `normalizeMemo()` を通してから `.deadline` や `.id` を読むが，`normalizeMemo()` は文字列しか直さず，null をそのまま返す．そのため，保存されたメモの一覧に null が 1 つでもあると TypeError になり，課題パネルの描画全体が止まる．popup の一覧と，期限の切れた非表示の掃除（読み込み時）も同じ箇所で止まる．
  - メモの一覧は `loadMemos()` が `result[MEMO_KEY] || []` として読むので，保存された値が配列でなく，偽でもないとき（文字列やオブジェクトなど）は，それがそのまま一覧になる．描画が `memos.forEach` を呼ぶ箇所で TypeError になり，課題パネルの描画全体が止まる．popup も，長さを持つ値（文字列など）では一覧が止まる．
  - メモの欄も，拡張が書いた型であるものとして使う．ID は非表示のキーを作るために，本文，期限，科目の ID と名前は表示のために，文字列か数にする．JSON が返す，自分の `toString` を持つオブジェクト（`{ toString: 0 }` など）は文字列にも数にもできない [[ECMA-262]](#参考文献) ので，そうした値が欄に 1 つでもあると TypeError になり，課題パネルも popup も描画が止まる．課題パネルでは ID，本文，期限のいずれでも止まり，期限のあるメモでは科目の ID，期限か科目の ID のあるメモでは科目名でも止まる．popup では ID と期限のいずれでも止まり，期限のあるメモでは本文，科目の ID，科目名でも止まる（期限の無いメモは，これらを表示しない）．
  - 値は拡張自身のストレージから来るが，旧版や，計画中のスマホ版との同期，ストレージの破損などで 1 件でも壊れると，パネルを開けない状態が続く．
- 根拠: ファズ対象 `assignments` が，Linux で約 2,500 回目（9 秒）に null のメモを見つけた．配列でない一覧は，2026-10-09 の毎日のファジング（[run 37853268307](https://github.com/yumasansansan/kulms-extension-fuzz/actions/runs/37853268307)）が見つけた．欄の値は，2026-10-14 の毎日のファジング（[run 38636298848](https://github.com/yumasansansan/kulms-extension-fuzz/actions/runs/38636298848)）で，ファズ対象 `assignments` が，本文が `{ toString: 0 }` のメモで見つけた．どの欄で止まるかは，欄ごとに確かめた．
- 直し方: 読み込んだ値が配列でなければ空の一覧とし，一覧から，オブジェクトでない要素を取り除く（`normalizeMemo()` で null や数値を捨てる）．メモの欄の型も正す．
- 対応: `normalizeMemo()` は，オブジェクトでも文字列でもないものに null を返し，呼び出し元（課題パネルの 4 か所と popup の 1 か所）はそれを飛ばす．`loadMemos()` は配列でない値を空の一覧とみなし，popup は配列でない値ではメモを描かない（[fix/invalid-memo](https://github.com/yumasansansan/kulms-extension/tree/fix/invalid-memo)）．`normalizeMemo()` は欄の型も正す．表示や連結に使う欄（本文，科目の ID と名前）は文字列でなければ空文字列に（有限の数は文字列にする），期限は有限の数でなければ null に，ID は文字列か有限の数でなければ null にする（2026-10-15．同じブランチの続く修正）．
- テスト: `fuzz/known/assignments/B17-null-memo`，`B17-memos-not-a-list`，`B17-memo-text-object`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/assignments.test.mjs` の「B17」の 6 件（null，配列でない一覧，欄に文字列にできない値．それぞれ課題パネルと popup）．

### B18
**TA 採点支援が，ページから届く提出の status の型を確かめず TypeError で止まる**（低・ファズ）

- 場所: [src/grading-ta.js:88-89](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L88-L89)，[:204-205](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L204-L205)，[:263-268](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L263-L268)
- 何が起きるか: 提出の一覧は，ページの世界のブリッジ（`grading-ta-page.js`）から JSON の event で届く．content script はその `status` を `String()` に渡すが，`toString` や `valueOf` が関数でないオブジェクトだと TypeError になり，状態の表示とジャンプが止まる．ページのスクリプトは，外へ出る event から requestId を読んで応答を偽れるので，届く値は任意の JSON になりうる．
- 根拠: ファズ対象 `grading-status` が，Linux で見つけた．
- 直し方: ページから届いた値は型を確かめてから使う（文字列でなければ空として扱う）．
- 対応: 届いた提出は，ブリッジが送るのと同じ形に揃える（文字列の項目は文字列，真偽の項目は真偽値）．`stripStatusIcon()` も文字列でないものを空として扱う（[fix/grading-ta-input](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-ta-input)，B16 と同じブランチ）．
- テスト: `fuzz/known/grading-status/B18-status-object`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/grading-ta.test.mjs` の「B18」（ページのスクリプトがブリッジの代わりに答える）．

### B19
**Sakai の応答に形の崩れた項目が 1 つあると，ほかの科目や課題も一覧から消える**（低・ファズ）

- 場所: [src/assignments.js:265-367](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L265-L367)（課題），[:380-413](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L380-L413)（クイズ），[:103-113](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L103-L113)，[:155-166](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L155-L166)（科目の一覧），[:247-263](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L247-L263)（課題ツールの URL），[src/textbooks.js:24-37](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L24-L37)（教科書の科目一覧），[src/assignments.js:581-584](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L581-L584)（描画）
- 何が起きるか: 科目ごとの取得は，Sakai の API の応答を，形を確かめずに読む．次のようなときに TypeError になる．
  - 応答や項目が null のとき（`data.assignment_collection`，`a.entityId`，`a.dueTime`）
  - 提出の `status` が文字列でないとき（`toLowerCase` が無い）
  - 一覧が配列でないとき（`map` が無い）

  取得全体を囲む try がこれを受けて `console.warn` に書き，その科目の課題を空にする．そのため，形の崩れた項目が 1 つあるだけで，同じ科目の正しい課題も一覧から黙って消える．クイズの取得は，警告も出さずに，その科目のクイズをすべて捨てる．

  科目の一覧（`site.json`）でも同じで，項目が 1 つ崩れていると，API から得た一覧をすべて捨てて，ポータルのページから科目を読む方法に切り替わる．ポータルのページから読めない科目は，課題ごと一覧から消える（ページも読めなければ「科目が見つからない」になる）．課題ツールの URL を pages.json から探すときも，null のページがあると探すのをやめ，科目のページへのリンクで代える（警告は出さない）．教科書の科目一覧（textbooks.js）も，項目が 1 つ崩れると API から得た一覧をすべて捨て，サイドバーから読む方法に切り替わる．

  取得を通った値も，形のまま描画まで届く．課題の名前（`title`）が，自分の `toString` を持つオブジェクト（JSON では，そのキーを持つオブジェクト）で，ID が無いと，描画が既読と削除の記録のキーを作る箇所（`getCheckedKey()`）で，文字列にできずに TypeError になる．これは捕まえられず，課題パネルが描かれない．
- 根拠: ファズ対象 `assignments` が，拡張の捕まえたプログラムの誤りも失敗とするようにした最初の実行で見つけた（課題の一覧の応答が JSON の `null` だった）．次の 2 つのとき，同じ科目の正しい課題も消えることを確かめた．
  - 項目に null があるとき
  - 提出の `status` が数のとき

  クイズでも，null の項目があると同じことが起きる．科目の一覧の経路は，13 本の修正をすべて当てた拡張のファジングで見つけた（`site.json` の応答が `null` だった）．描画で止まる経路は，2026-10-13 の 30 分ずつの毎日のファジングが見つけた（課題の名前が `{"toString": …}` だった）．クイズの取得が警告も出さずに捨てる誤りは，拡張が捕まえた誤りも見る検出器（「fuzz リポジトリの仕組み」）で検出できるようになった．
- 見立て: Sakai の API がこの形を返すことは，ほとんど考えられない．ただし，期限を知らせる拡張において，科目ごと期限の一覧から黙って消えることは重大な失敗である．
- 直し方: 応答と項目の形を確かめ，形の崩れた項目だけを飛ばす．文字列の項目は，文字列のときだけ使う．
- 対応: 応答の一覧は配列のときだけ読み，オブジェクトでない項目は飛ばす．文字列の欄は，文字列か数のときだけ使う．日時は，数か数の文字列で，Date で表せるときだけ使う．ID の無い課題には個別の API を呼ばない．課題ツールの URL と教科書の科目一覧も，同じように直した（[fix/sakai-answer-shape](https://github.com/yumasansansan/kulms-extension/tree/fix/sakai-answer-shape)）．
- テスト: `fuzz/known/assignments/B19-null-assignment` と `B19-title-object`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/assignments.test.mjs` の「B19」の 4 件（課題，クイズ，科目の一覧，描画）．修正ブランチ（v1.21.1 に当てたもの）で，描画の 1 件も通る．

### B20
**サイト連絡先の取得で，pages.json の形の崩れたページが，後のページを隠す**（低・ファズ）

- 場所: [background.js:75-83](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L75-L83)
- 何が起きるか: `fetchSakaiSiteContact()` は，pages.json の各ページの `tools` を，形を確かめずに読む．ページが null のとき（`p.tools`）や，`tools` が反復できない値のときに TypeError になる．関数全体を囲む try がこれを受けて null を返すので，後に Site Info のツールがあっても連絡先が見つからない．
- 根拠: ファズ対象 `site-contact` が，拡張の捕まえたプログラムの誤りも失敗とするようにした最初の実行で見つけた（pages.json が `[null]` だった）．
- 見立て: Sakai がこの形を返すことは，ほとんど考えられない．失われるのも，同名の科目を教員名で絞り込む手がかりのみであるため，影響は小さい．
- 直し方: オブジェクトでないページと，配列でない `tools` を飛ばす．
- 対応: 配列でない pages.json，オブジェクトでないページとツール，配列でない `tools` を飛ばす．`placementId` は，空でない文字列のときだけ使う（[fix/site-contact-pages](https://github.com/yumasansansan/kulms-extension/tree/fix/site-contact-pages)）．
- テスト: `fuzz/known/site-contact/B20-null-page`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/background.test.mjs` の「B20」．

### B21
**`t()` に値を 1 つだけ空文字列で渡すと，`$HOURS$` などが残る（潜在）**（低・ファズ）

- 場所: [src/settings.js:107](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/settings.js#L107)，[popup.js:24](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L24)
- 何が起きるか: `t()` は，置換値を `if (substitutions && entry.placeholders)` で確かめる．そのため，1 つだけ渡した値が空文字列だと置換しない．たとえば `t("sectionDanger", "")` は `$HOURS$時間以内` を返す．配列で渡した `[""]` なら空文字列が入るので，渡し方によって結果が食い違う．現在の呼び出しはいずれも配列で渡すため，表面化していない．
- 根拠: ファズ対象 `i18n` の確かめ方を，値が結果のどこかにあるかを見るものから，期待する結果と比べるものに変えた時点で見つけた．
- 直し方: `substitutions != null` で確かめる．
- 対応: 値が null か undefined のときだけ置換しない（[fix/i18n-lookup](https://github.com/yumasansansan/kulms-extension/tree/fix/i18n-lookup)，B10，B15 と同じブランチ）．
- テスト: `fuzz/known/i18n/B21-empty-value`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/i18n.test.mjs` の「B21」の 2 件（settings.js と popup.js の `t()`）．

### B22
**長い TOTP シークレットを background が保存できない（潜在）**（低・ファズ）

- 場所: [background.js:706-718](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L706-L718)
- 何が起きるか: `encryptSecret()` は，暗号文を `btoa` に渡す前に `String.fromCharCode(...bytes)` で文字列にする．スプレッドで渡す引数の数にはエンジンの上限があり（V8 で約 12.5 万），それより長いシークレットでは `RangeError`（Maximum call stack size exceeded）になる．`kulms-totp-save` はエラーを返し，何も保存しない．実際の TOTP シークレットは 32 字程度であるため，利用者がこの上限に達することはほとんどない．
- 根拠: background の対象が，入力の初めの TOTP の保存内容を入力から作るようにした時点で，そのテストが 6.5 万字のシークレットで見つけた（ハーネスは組み込み関数を包んで引数をもう一度渡すため，上限が約 6 万バイトに下がる）．Node だけでも，12.6 万バイトから同じ例外になる．TOTP の登録補助も，ページの sessionStorage に保留された長いシークレットを，登録が済んだと書くページで保存させる．ファズ対象 `totp-register` が，2026-10-15 の CI（38743594130）と毎日のファジング（38802566900）でこれを見つけた．
- 直し方: 暗号文を少しずつ文字列にする．
- 対応: 8,192 バイトずつ `String.fromCharCode.apply` で文字列にする関数を加え，暗号文と IV の両方に使う（[fix/long-totp-secret](https://github.com/yumasansansan/kulms-extension/tree/fix/long-totp-secret)）．
- テスト: `fuzz/known/background-message/B22-long-secret`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/totp.test.mjs` の「B22」（20 万字のシークレットを保存して読み出す）．

### B23
**ページの Web Storage が埋まっていると，ツールの表示の切り替え，サイドバーの幅の保存，提出の検知，TOTP の登録補助，課題パネルの読み込みが例外で止まる**（低・ファズ）

- 場所: [src/tool-visibility.js:16-18](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L16-L18)（`saveConfig()`），[src/sidebar-resize.js:17-20](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/sidebar-resize.js#L17-L20)，[:81](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/sidebar-resize.js#L81)，[src/submit-detect.js:66](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/submit-detect.js#L66)，[:75](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/submit-detect.js#L75)，[src/auth-totp-register.js:134](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L134)，[src/assignments.js:931](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L931)
- 何が起きるか: ツール表示管理とサイドバーの幅は，拡張の状態を LMS のページの localStorage に書く．localStorage は，ページ自身のデータやページのスクリプト（攻撃者のものも）でいつでも埋められ，書き換えられる．上限（Storage 標準は localStorage と sessionStorage の保存領域ごとに 5 MiB を推奨値とする [[Storage]](#参考文献)．ハーネスは jsdom の既定の 500 万コード単位とする）まで埋まっていると，`setItem()` が QuotaExceededError を投げる [[HTML]](#参考文献)．拡張はこれを捕まえないので，ツールの切り替えは例外で止まってツールが動かず，ドラッグした幅は保存されない（どちらもイベントの処理の中で捕まえられない例外になる）．提出の検知も，提出の目印を書く sessionStorage が埋まっていると例外で止まり，提出は完了として記録されない．TOTP の登録補助も，読み取ったシークレットを置く sessionStorage が埋まっていると，コードを入力せずに未処理の拒否で止まる．課題パネルは，開くときに sessionStorage に開いた状態を書くため，埋まっていると開いた直後に例外で止まり，課題を読み込まない．
- 根拠: ファズ対象 `sidebar` が，ページのデータで localStorage を埋めた入力で見つけた．提出の検知はファズ対象 `submission` で，登録補助は `totp-register` で確かめた．
- 直し方: 拡張の状態はページの localStorage ではなく `chrome.storage` に置く（ページから読めず，書き換えられない．B12 の直し方と同じ）．書き込みが失敗しうる箇所では例外を受け，状態をメモリに残して続ける．
- 対応: 埋まりうる Web Storage への書き込みで例外を受け，書けないまま処理を続ける（[fix/storage-full](https://github.com/yumasansansan/kulms-extension/tree/fix/storage-full)）．ツールの設定とサイドバーの幅は，埋まった localStorage には保存されない．状態を chrome.storage に移すこと（B12 の直し方）は，別に扱う．
- テスト: `fuzz/known/sidebar/B23-storage-full`，`fuzz/known/submission/B23-session-full`，`fuzz/known/totp-register/B23-session-full`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/assignments.test.mjs` の「B23」（課題パネル）．

### B24
**TA 採点支援のページ側の橋渡しが，ページのオブジェクトが投げる例外で止まり，文字列でない ID や名前をそのまま渡す**（低・ファズ）

- 場所: [src/grading-ta-page.js:19-67](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta-page.js#L19-L67)
- 何が起きるか: 橋渡しはページの世界で動き，Sakai の採点画面の要素（`<sakai-grader>`）の `originalSubmissions` を読んで，content script の求めに JSON の文字列で答える．その要素と値はページのもので，ページのスクリプト（攻撃者のものも）がいつでも作り変えられる．
  - 橋渡しは値を読む箇所で例外を受けない．ページのオブジェクトが投げる例外（getter，Proxy の罠，取り消された Proxy），`JSON.stringify()` が書けない値（BigInt，循環），`String()` が変換できない値（`reference` の `toString` が関数でないなど）で，そのまま例外を投げる．答えは返らず，content script は 300ms 待って何も表示しない．例外はページのコンソールと `window.onerror` に，拡張のスクリプトのものとして届く．ページが送る求めの ID が JSON にできない値でも同じである．
  - ID（`id` か `submissionId`），提出者名，提出日時は，真と見なせる値なら型を確かめずにそのまま渡す（数，オブジェクト，Symbol など）．Symbol は JSON で落ちて ID の無い提出になり，オブジェクトは content script の側で B18 の例外になる．
  - 値が自らを持つ（循環する）と，`JSON.stringify()` は TypeError を投げるが，Chrome の V8 は，replacer も space も無い呼び出しを速い道で書き出し，循環をそのループの 20 万回ごとにしか調べない [[V8JSON]](#参考文献)．それまでの間，同じ値を書き出し続けるので，投げるまでの時間とメモリは，値の文字列の長さに比例して大きくなる．`submissionId` が自らである提出（鍵と値を合わせて 100 字ほど）では，Edge 155 で 82〜101 ms かかり，Node 26 では同じ値でヒープの外に 115 MiB を使った．ページは自らのオブジェクトでこれを起こせるので，害はそのページに留まる．
- 根拠: ファズ対象 `grading-bridge`（2026-10-14 に加えた）が見つけた．循環の形は，2026-10-15 の毎日のファジング（38802566900）で，ハーネスが V8 の速い道を通ったために，対象のプロセスが 13 GB を使って止められたことから調べた（ハーネスは速い道を使わないようにした．「fuzz リポジトリの仕組み」の仕事量）．
- 直し方: 求めの処理全体で例外を受け，受けたら空の一覧で答える．提出は 1 件ずつ読み，読めないものは捨てる．ID，名前，日時は文字列のときだけ使い，ほかは空にする（ID が空の提出は捨てる）．求めの ID も文字列のときだけ受ける．
- 対応: 上のとおりに直し，ID は有限の数も文字列にして受ける（[fix/grading-bridge-values](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-bridge-values)．P7 と同じブランチ）．
- テスト: `fuzz/known/grading-bridge/B24-getter-throws`，`B24-id-not-a-string`，`B24-submission-holds-itself`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### B25
**保存された課題のキャッシュが拡張の書く形でないと，課題パネルと popup の描画が止まる**（低・ファズ）

- 場所: [src/assignments.js:2909-2925](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2909-L2925)（キャッシュの読み込み），[:462-466](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L462-L466)（`isSubmitted()`），[popup.js:313-360](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L313-L360)（`render()`），[:87-91](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L87-L91)（`isSubmitted()`），[:93-96](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L93-L96)（`getCheckedKey()`）
- 何が起きるか: 課題パネルと popup は，`chrome.storage.local` [[ChromeStorage]](#参考文献) の課題のキャッシュ（`kulms-assignments`）を，拡張自身が書いた形であるものとして読む．課題の一覧（`assignments`）が配列でない値（文字列やオブジェクト）であれば `forEach` や `filter` の呼び出しで，項目に null などのオブジェクトでない値があればその項目のプロパティの読み取りで，状態（`status`）が文字列でない真の値であれば `isSubmitted()` の `toLowerCase()` の呼び出しで，TypeError になる．表示や連結，比較に使う欄（科目名，科目の ID，名前，ID，期限，締め切り．popup では URL も）に，文字列や数にできない値（JSON が返す，自分の `toString` を持つオブジェクト）があっても，TypeError になる．課題パネルは例外を捕まえて警告するのみで一覧を描かず，popup では例外が設定の読み込みの後の Promise の中で起き，誰も受けないため，一覧は空のまま残る．値は拡張自身のストレージから来るが，旧版との互換，ストレージの破損，将来の同期（B17 と同様）で 1 件でも壊れると，課題パネルではキャッシュの有効期間（既定で 2 分）が過ぎて取り直すまで，popup では content script がキャッシュを書き直すまで，一覧を表示できない．
- 根拠: ファズ対象 `popup`（2026-10-14 に加えた）が見つけた．課題パネルでも同じ 3 通りの値で止まることを確かめた．欄の値は，2026-10-14 の毎日のファジング（[run 38636298848](https://github.com/yumasansansan/kulms-extension-fuzz/actions/runs/38636298848)）で，`popup` が，締め切りが `{ toString: 0 }` の課題で見つけた．どの欄で止まるかは，欄ごとに確かめた（課題パネルは URL を除く 7 つ，popup は 8 つ）．
- 直し方: キャッシュの一覧が配列でなければ空の一覧とみなし，オブジェクトである項目のみを受ける．`status` など文字列であるべき項目は，文字列でなければ空文字列とみなす．
- 対応: キャッシュを読む箇所（課題パネルの `loadCache()` と `loadStaleCache()`，popup の `render()`）で形を整える `normalizeCache()` を加えた（[fix/cache-shape](https://github.com/yumasansansan/kulms-extension/tree/fix/cache-shape)）．`normalizeCache()` は，文字列であるべき欄と時刻の欄も正すので，欄に文字列や数にできない値がある形も直る（2026-10-15 に確かめた）．
- テスト: `fuzz/known/popup/B25-assignments-not-a-list` と `B25-close-time-object`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/assignments.test.mjs` の「B25」の 4 件（配列でない一覧と，欄に文字列や数にできない値．それぞれ課題パネルと popup）．

### B26
**TA 採点支援が，提出日時の列にセルの無い行で，提出一覧の読み取りを止める**（低・再現・ファズ）

- 場所: [src/grading-ta.js:158-180](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L158-L180)（`parseSubmissionListGroups()`）
- 何が起きるか: TA 採点支援は，採点の一覧の表を読むとき，行が状態の列にセルを持つことだけを確かめ，提出日時の列のセル（`cells[submitColIdx]`）を，その行に有るかどうかを確かめずに読む．提出日時の列より少ないセルの行（`colspan` でセルをまとめた行など）があると TypeError になり，その表の状態の読み取りとアイコンの付与が止まる．ページの表は，起動時の Promise の中と，DOM の変化に応じて読み直す `requestAnimationFrame` の中で読まれ，どちらでも例外は誰にも受けられない．取得した一覧のページでは例外は捕まえられるが，その一覧から状態を得られない．
- 根拠: ファズ対象 `grading-pages`（2026-10-14 に加えた）が，最初の 1 分で見つけた．
- 直し方: 提出日時の列にセルが無い行では，提出日時を空とする．
- 対応: そのようにした（[fix/grading-list-short-rows](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-list-short-rows)）．
- テスト: `fuzz/known/grading-pages/B26-row-short-of-submit-column`（`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/grading-ta.test.mjs` の「B26」．

### B27
**上部のピン留めバーが，サイト ID に壊れた `%` の並びがある科目のクリックで URIError を投げ，ツールの一覧を開けない**（低・ファズ）

- 場所: [src/top-favbar.js:93-97](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/src/top-favbar.js#L93-L97)（`getSiteIdFromUrl()`），[:211-214](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/src/top-favbar.js#L211-L214)（`openDropdownFor()`），[:227-238](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/src/top-favbar.js#L227-L238)（`onBarClick()`）
- 何が起きるか: 上部のピン留めバーは，サイドバーのピン留めした科目のリンクを写して項目を作る．科目の行のクリックでツールを開く設定が有効なとき，項目のクリックはリンクへの移動を止め，リンクの URL からサイト ID を取り出して，その科目のツールの一覧（ドロップダウン）を開く．取り出した ID は，`decodeURIComponent()` で例外を受けずにデコードする．ID に，後に 2 桁の 16 進数が続かない `%` や，UTF-8 にならないバイトの並び（`%E0%A4` など）があると，URIError になる [[ECMA-262]](#参考文献)．URL の解析はそのような `%` をそのまま残す [[URL]](#参考文献) ため，ページのリンクにあれば項目のリンクにも残る．このとき，ドロップダウンは開かず，移動も止めたままなので，クリックは何も起こさない．例外はクリックの処理の中で受けられず，ページのコンソールと `window.onerror` に出る．Sakai が作るサイト ID（UUID や，KULMS の `2026-110-1001-000` の形）には `%` が無いため，通常のページでは起きない．
- 根拠: 2026-10-16 の毎日のファジング（38959386385）で，ファズ対象 `sidebar` が，ID に `%E0%A4%A` を含む科目で見つけた．上流の v1.22.0（`2f7c918`）にも同じコードがある．
- 直し方: デコードできないときは，元の文字列を ID として使う（B16 と同じ）．
- 対応: 未着手．
- テスト: `fuzz/known/sidebar/B27-malformed-percent-site`（ID の末尾が `%` の科目．`tests/fuzz-inputs.test.mjs` が todo として流す）．

### B28
**ページの先読みが，ツールのリンク（tool-reset）にマウスを乗せただけで，そのツールの状態を初期化させる**（中・再現・読解）

- 場所: [src/prerender.js:12-33](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/prerender.js#L12-L33)
- 何が起きるか: v1.22.0 の prerender.js は，サイドバー（`#portal-nav-sidebar`）とピン留め上部バー（`#kulms-top-favbar`）の中の `/portal/site/*` へのリンクを，マウスを約 200 ms 乗せた時点（eagerness moderate）で，ブラウザに先読み（prerender）させる規則を入れる [[HTML]](#参考文献)．除くのは，target，download，onclick を持つリンクと，クエリに sakai_action を含む URL だけである．
  - Sakai のサイドバーのツールのリンクは，`/portal/site/<サイト>/tool-reset/<配置>` の形である（拡張自身の `src/assignments.js:92` と，上流の調査メモ `docs/sakai-network-requests.md` がそう書いている）．Sakai はこの URL を受けると，その利用者のセッションに置いたツールの状態を消してから，ツールを描く（tool-reset の URL はリセットの印を付けてツールの URL へ転送し，転送先がツールの状態を消す [[SakaiSiteHandler]](#参考文献)，[[SakaiCharonPortal]](#参考文献)）．したがって，ツールのリンクにマウスを乗せただけで，そのツールで進めていた画面の位置，一覧の並び替えや絞り込み，開いたフォルダなどが初期化されうる．先読みしたページは，利用者が開かなければ捨てられる．上流のメモ自身も「表示中のツール自身のリンクは，先読みの対象から外すのが安全」と書いているが，規則には入っていない．
  - 規則の条件は ID の選択子なので，ページのどこにあっても，同じ ID を持つ要素の中のリンクに当たる（ID の選択子は，その ID を持つ要素をどれも表す [[Selectors]](#参考文献)）．マークアップを書ける投稿などに `<div id="portal-nav-sidebar">` を入れれば，その中に置いた `/portal/site/` の下の任意のリンクを，マウスを乗せさせるだけで先読みさせられる．同じ起源の URL を利用者の資格情報付きで読ませることは，`<img>` などでも，マウスを乗せさせずにできる．そのため攻撃者の能力が広がるわけではないが，この副作用（と B29 の副作用）を，どのページに起こすかを選べる．
  - 一方，規則そのものは書き換えられない．規則は，要素が文書につながった時点のテキストで一度だけ解析され，後からテキストを書き換えても効かない．要素を外せば解除されるが，先読みが止まるだけである．ページのスクリプトは，拡張が無くても自分で規則を入れられる．
- 根拠: 読解（Sakai の振る舞いはソースを読んだ結果であり，実際の KULMS では確かめていない）．規則がツールのリンクと，差し込んだ同じ ID の要素の中のリンクに当たることは，HTML 標準の規則の読み方 [[HTML]](#参考文献) と URL パターン [[URLPattern]](#参考文献) をハーネスに写して確かめた（`tests/prerender.test.mjs` の「B28」）．
- 直し方: 先読みを，科目のトップ（`/portal/site/<サイト>` で，その後にパスの無いもの）へのリンクに限り，tool-reset と page-reset を含む URL を除く．条件を ID の選択子だけに頼らない（拡張が作ったピン留め上部バーの項目に印を付けて選ぶなど）．
- 対応: 未着手．
- テスト: `tests/prerender.test.mjs` の「B28」（todo）．

### B29
**ページの先読みが，マウスを乗せただけの科目の訪問を Sakai に記録させる**（低・再現・読解）

- 場所: [src/prerender.js:12-24](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/prerender.js#L12-L24)
- 何が起きるか: 先読みは，利用者がリンクを開く前に，そのページをサーバーから取得し，ページのスクリプトまで動かす．Sakai は，サイトのページを描くときにその利用者の在席を始め（`pres.begin` の事象），統計ツール（SiteStats）はそれを「サイト訪問」として数える [[SakaiSiteHandler]](#参考文献)，[[SakaiPresence]](#参考文献)，[[SakaiStats]](#参考文献)．在席の時間切れまでの間は，同じ科目で 2 度は記録されない．そのため，サイドバーや上部バーの科目にマウスを約 200 ms 乗せただけで，開いていない科目への訪問が記録され，教員が見る訪問者数や在席の表示が実際と違うものになる．ページを開いた時点でサーバーの状態を変えるほかのページでも同じであり，B28 のツールの初期化もその一つである．先読みのたびにサイトのページ全体を描かせるので，サーバーの負荷も増える．
- 根拠: 読解（Sakai のソース）．規則の eagerness が moderate であることは，`tests/prerender.test.mjs` の「B29」で確かめた．
- 直し方: eagerness を conservative にし，利用者がリンクを押し始めた時点（pointerdown）で先読みさせる．開く直前なので，記録は実際の訪問と変わらない．
- 対応: 未着手．
- テスト: `tests/prerender.test.mjs` の「B29」（todo）．

### B30
**授業資料のツリーのキャッシュを 20 件に抑える処理が，項目の形を確かめず，TypeError を捕まえて黙って続ける**（低・ファズ・読解）

- 場所: [src/tree-view.js:294-307](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/tree-view.js#L294-L307)（`pruneCache()`），[:278-291](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/tree-view.js#L278-L291)（`saveCache()`）
- 何が起きるか: v1.22.0 の tree-view.js は，展開したツリーをキャッシュに保存するたびに `pruneCache()` を呼び，ページの localStorage のうち `kulms-tree-cache:` で始まるキーの項目を 20 件までに減らす．各項目を拡張が書く形（`{"html": …, "savedAt": <時刻>}`）とみなし，`JSON.parse()` した値の `savedAt` を読み，`savedAt` の差で並べ替えて古いものから消す．この localStorage は，LMS の起源で動くどのスクリプトも書ける（S14）．
  - テキストが `null` の項目では，`JSON.parse()` が null を返し，その `savedAt` の読み取りが TypeError になる．項目ごとの catch がこれを受け，その項目の時刻を 0 とする．結果として，その項目は JSON でない項目（catch が受けるのは SyntaxError）と同じく最も古いものとして扱われるが，プログラムの誤りを catch で黙らせている．
  - 項目が，保存したばかりのものを含めて 20 件を超えるとき，`savedAt` が数にできない値（`toString` を関数でない値として自分に持つオブジェクトや，それを含む配列．JSON はそれを返せる）の項目があると，並べ替えの比較関数の引き算が TypeError になる [[ECMA-262]](#参考文献)．関数全体を囲む catch がこれを受け，項目を 1 つも消さずに戻る．その項目は消されないので，それが残る間は件数の上限が効かず，キャッシュは，開いた授業資料のページの数だけ増える（localStorage の容量の上限に達すると，`saveCache()` が拡張のキャッシュをすべて消す）．
  - `savedAt` が数にならない値（`"abc"` のような文字列や，`{}` や `[1,2]` のようなオブジェクト）の項目では，比較関数が NaN を返す．並べ替えは NaN を 0（等しい）とみなすので，比較は一貫せず，並べ替えの結果は実装に任される [[ECMA-262]](#参考文献)．そのため，消す項目が古いものとは限らない．V8 で，同じ並べ替えを 22 件（数にならない時刻の項目，時刻が 1〜20 の項目，今保存した項目）に掛けると，消す 2 件は，キーの辞書順に並べたときは今保存した項目と数にならない時刻の項目，挿入した順では数にならない時刻の項目と最も古い項目であった．localStorage のキーの順はブラウザが決める [[HTML]](#参考文献)．
  - いずれも，この形の項目を書くのはページのスクリプトであり，拡張自身は書かない．影響は，キャッシュの件数と，次に開いたときにキャッシュから表示できるかに限られる．
- 根拠: 2026-10-20 の CI（39404471638，39437098916）と毎日のファジング（39495354410）で，ファズ対象 `resources` が，テキストが `null` の項目で見つけた．比較関数の TypeError は，項目を，保存したばかりのものを含めて 21 件置いた入力で確かめた（20 件では並べ替えに至らず，起きない）．NaN の場合は，上の V8 の試行による．
- 直し方: `JSON.parse()` の結果がオブジェクトであり，その `savedAt` が有限の数であるときに限りその値を使い，それ以外は 0 とする．S14 の直し方（キャッシュを `chrome.storage.local` に置く）をとれば，ページのスクリプトは項目を書けなくなるが，ストレージの破損や旧版との互換に備えて，同じ確かめは要る（B25 と同様）．
- 対応: 未着手．
- テスト: `fuzz/known/resources/B30-cache-entry-null` と `B30-saved-at-unconvertible`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

## 速度・負荷

### P1
**課題取得の N+1 と，タブごとの短い間隔での再取得**（高・読解・上流 [#32](https://github.com/Radian0523/kulms-extension/issues/32)，[#27](https://github.com/Radian0523/kulms-extension/issues/27)）

- 場所:
  - [src/assignments.js:280-284](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L280-L284)（課題 1 件ごとの個別 API．科目の中では並列数の上限が無い）
  - [:429-455](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L429-L455)
  - [:2557-2560](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2557-L2560)（間隔は最短 10 秒まで設定できる）
  - [:3013-3035](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L3013-L3035)
- 何が起きるか:
  - 1 回の更新で「科目ごとに 2 本 + 課題 1 件ごとに 1 本」（サイドバーに無い科目は，さらに pages.json が 1 本）のリクエストを出す．15 科目 × 8 課題なら約 150 本になる．
  - これを，表示中の LMS タブがそれぞれ既定 120 秒ごとに実行する．他のタブが直前に書いた新しいキャッシュも使わない．パネルを開いたままタブに戻るたびにも実行する．
- 直し方:
  - タブ間で取得を共有する（chrome.storage の更新時刻，または background でまとめる）．タイマーとタブ復帰による再取得では，キャッシュの有効期限を守る．
  - 個別 API は，状態が変わりうる課題（締切前，または未採点）だけに使う．
  - 全体の並列数に上限を設け，最短間隔を引き上げる．
  - 挙動が変わるので，先に上流で Issue を立てる．

### P2
**フォルダ自動展開が，ページ全体の POST を最大 30 回直列に行い，開かないフォルダを何度も要求し直す**（中・読解・ファズ・上流 [#62](https://github.com/Radian0523/kulms-extension/issues/62)）

- 場所: [src/tree-view.js:208-263](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tree-view.js#L208-L263)，v1.22.0 では [src/tree-view.js:329-380](https://github.com/Radian0523/kulms-extension/blob/2f7c918031e2b198f8fc0526495f45795c474f02/src/tree-view.js#L329-L380)
- 何が起きるか: `expandAllFolders()` は，閉じたフォルダの先頭を 1 つずつ開く．そのたびにページ全体を POST で取り直し，一覧の tbody を丸ごと置き換えて，置き換えた一覧全体から次の閉じたフォルダを探す．どのフォルダを要求したかを記録していないため，サーバーの答えがまだそのフォルダを閉じたまま示していると（開けなかったときなど），同じフォルダを 30 回まで要求し直す．フォルダが多いと，POST のたびに一覧全体を解析し直すので，仕事は一覧の大きさの最大 30 倍になる．v1.22.0 は，先に Sakai の「すべて展開」（doExpandall）を 1 回送り，それでも閉じたフォルダが残ると，1 つずつ開く．この 1 つずつ開く処理は変わっておらず，答えがフォルダを閉じたまま示すと，同じフォルダを 30 回まで要求し直す．
- 根拠: 読解．ファズ対象 `resources` が，答えがフォルダを閉じたまま示す入力で，同じ POST を 30 回送り，一覧を 30 回解析し直すのを見つけた（2026-10-14．1 回 19,309 歩で，入力 250 単位の線形の上限 605,692 歩を超えた）．対象は，利用者が何も操作しないうちに拡張が同じフォルダを 2 度要求した場合に失敗とする．v1.22.0 でも，既知の入力は 29 回の求め直しで止まる（2026-10-20）．
- 直し方: Sakai の `/direct/content/site/{siteId}.json` なら，ツリー全体を 1 回で取れるはず（KULMS で使えるかは要確認）．それを取得して拡張の側で描画する．現在の設計を保つ場合は，要求したフォルダ（collectionId）を記録し，同じフォルダを 2 度は要求しない．
- 対応: 要求したフォルダを記録し，まだ要求していない閉じたフォルダのみを開くようにした（[fix/expand-folders-once](https://github.com/yumasansansan/kulms-extension/tree/fix/expand-folders-once)）．2026-10-20 に，ブランチを v1.22.0 の上に作り直し，同じ修正を，一括展開の後の 1 つずつ開く処理に当て直した．ツリー全体を 1 回で取る方法は，上流 Issue で扱う．
- テスト: `fuzz/known/resources/P2-folder-stays-closed`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### P3
**`document.body` 全体を監視する MutationObserver が多く，重い**（中・読解）

- 場所: [src/course-name.js:202-207](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/course-name.js#L202-L207)，[src/submit-detect.js:83-85](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/submit-detect.js#L83-L85)，[src/file-drop.js:96-98](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/file-drop.js#L96-L98)，[src/top-favbar.js:487-495](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/top-favbar.js#L487-L495)，[src/tool-visibility.js:158-161](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L158-L161)，[src/grading-ta.js:712-718](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L712-L718)，[:1110-1118](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L1110-L1118)
- 何が起きるか:
  - 12 本の content script が全フレームに注入される（[manifest.json:34-53](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/manifest.json#L34-L53)）．
  - course-name.js は debounce なしで，変更のたびに文書全体を `querySelectorAll` する．
  - submit-detect.js と file-drop.js は，役目を終えても監視をやめない．
  - `sorting`・`updatingNowBadges`・`processing` による二重処理の防止は，コールバックが非同期で呼ばれるので効いていない（B4 はその一例）．
- 直し方: 共有の debounce 付き observer を 1 本にする．監視対象をサイドバーなどに絞る．役目を終えたら disconnect する．トップフレームだけの機能は，manifest で `all_frames` を外した組に分ける．

### P4
**jsQR と qrcode-gen を広すぎる範囲に注入する**（低・読解）

- 場所: [manifest.json:29-33](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/manifest.json#L29-L33)（jsQR 256KB を auth.iimc の全ページに），[:54-58](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/manifest.json#L54-L58)（qrcode-gen 56KB を LMS の全ページに）
- 直し方: `include_globs` で範囲を絞るか，必要になったときに `chrome.scripting` で注入する．
- 対応: jsQR は，TOTP の登録補助が QR を読む `app=qrsecret` のページでしか使わないので，別の組に分けて `include_globs` でそのページにだけ注入する（[fix/jsqr-where-read](https://github.com/yumasansansan/kulms-extension/tree/fix/jsqr-where-read)）．登録補助は，登録の完了を確かめるため，これまでどおり全ページに注入する．qrcode-gen は課題パネルの中の QR の表示に使い，必要になったときに注入するには `scripting` の権限が必要であるため，残した．
- テスト: `tests/totp.test.mjs` の「P4」（ハーネスは manifest の `include_globs`，`exclude_globs`，`exclude_matches` を Chrome と同じに読む）．

### P5
**教科書の取得が科目ごとの直列処理**（低・読解・再現）

- 場所: [src/textbooks.js:355-375](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L355-L375)．1 科目につき，background で 2〜4 本の HTTP を使う．
- 直し方: 並列数 2〜3 程度で並行させる（KULASIS への負荷に配慮する）．
- 根拠: `tests/assignments.test.mjs` の「P5」が，background の KULASIS の検索を保留させ，同時に問い合わせる科目の数を数える．`20d7da3` では 1 科目である．
- 対応: 問い合わせを同時に 3 科目までにして並行させ，これまでの繰り返しが，科目の順にその結果を待つようにした（一覧の組み立てと取得中の表示は変えない）．KULASIS の検索とシラバスの取得は，クエリーだけで決まる GET であり，サーバー側の状態に頼らないので，並行させても互いに影響しない（[fix/textbooks-parallel](https://github.com/yumasansansan/kulms-extension/tree/fix/textbooks-parallel)．2026-10-14）．B11 の [fix/textbooks-by-site](https://github.com/yumasansansan/kulms-extension/tree/fix/textbooks-by-site) と衝突しないよう，繰り返しの中では結果を受け取る行だけを変えた．両方を合わせた版で，B11 と P5 のテストがどちらも通る．
- テスト: `tests/assignments.test.mjs` の「P5」（todo）．

### P6
**Service Worker の起動ごとに Shift_JIS 変換表を作り直す**（低・計測）

- 場所: [background.js:112-145](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L112-L145)．約 2.2 万回のデコードで，Node では約 32ms かかった．
- ファジング: 表は，Service Worker が起きてから最初の検索で作られ，ハーネスの数え方で約 15.6 万歩になる．検索語によらない一度きりの仕事だが，小さな入力の線形の上限（`background-message` の 11 単位の入力で 96,122 歩）を超える．`background-message` の対象は，最初の入力の前に表を作っておき，どの入力にも数えない（P6 を探すときは，入力ごとに表を消す．下の「ファジングで避けている既知の問題」）．`syllabus-search` の対象は，入力が空のとき（上限の基になる仕事量を数えるとき）にも検索するので，表の仕事はその基に入り，どの入力にも数えない．
- テスト: `fuzz/known/background-message/P6-first-search`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### P7
**TA 採点支援のページ側の橋渡しが，配列もどきの `length` が示す回数だけ反復する**（低・ファズ・ブラウザ）

- 場所: [src/grading-ta-page.js:45](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta-page.js#L45)
- 何が起きるか: `normalizeSubmissions()` は，`originalSubmissions` が配列でも Map でもなく，`length` が数なら，`Array.from()` で配列にする．`Array.from()` は，値が反復子を持たなければ，要素の有無に関わらず `length` まで反復する [[ECMA-262]](#参考文献) ため，`length` が 2^32 − 2 なら約 43 億回反復し，それより大きければ「Invalid array length」の RangeError になる．`length` を持つ値は，配列もどきに限らず，`length` という名前の数を持つ任意のオブジェクトでも，それを包む Proxy でもよい．Edge 155 で，`length` が 2^25 と 2^31 の Proxy（`has` の罠を持つもの）を置くと，橋渡しはページの主スレッドをそれぞれ 2.9 秒と 7.1 秒ふさぎ，前者には空の一覧を答え，後者では RangeError を投げて答えなかった．値はページのものであるため，ページのスクリプトはいつでもこの状態を作れる（ページが自らを停止させうるのと同様であり，害はそのページに留まる）．Sakai 自身は配列を置くため，通常は発生しない．
- 根拠: ファズ対象 `grading-bridge`．ハーネスは，配列もどきの長さまで反復する組み込み（`Array.from()` と `%TypedArray%.from()`）を，走る前にその長さで数え，入力の上限を超えるなら走らせずに止める（[harness/costs.mjs](../harness/costs.mjs) の `least`）．ただし Proxy の長さは，読むとページのコードが動くため前もって読まず，ループは数えられないまま最後まで走る．Node 26 では，長さ 2^25 のループは 2.3 秒と 489 MB を使って走り終えた後に上限を超え，2^31 では V8 が約 10 秒と 1.6 GB の後にプロセスごと終わった（"invalid table size"．要素の辞書がそれ以上大きくなれない）．オブジェクトと Proxy の形は，2026-10-15 の毎日のファジング（38718496528）の停止を調べる中で，ファジングの回避が配列もどきだけを見ていたことから見つけた（「ファジングで避けている既知の問題」）．
- 直し方: 配列と Map だけを受け，ほかは空の一覧とする．
- 対応: 配列，Map，キーごとのオブジェクトのみを受け，`length` の値は使わない（[fix/grading-bridge-values](https://github.com/yumasansansan/kulms-extension/tree/fix/grading-bridge-values)．B24 と同じブランチ）．
- テスト: `fuzz/known/grading-bridge/P7-array-like-length`，`P7-object-length`，`P7-proxy-length`．

### P8
**表示中の TOTP コードを毎秒作り直すたびに，シークレットをデコードし，HMAC の鍵を作り直す**（低・再現・ファズ）

- 場所: [popup.js:646-657](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L646-L657)，[:754](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L754)，[src/assignments.js:2301](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2301)，[:2375](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2375)
- 何が起きるか: popup と LMS の設定パネルは，TOTP のコードを表示している間，1 秒ごとにコードを作り直す．そのたびに，保存されたシークレットを base32 からデコードし，`crypto.subtle.importKey()` で HMAC の鍵を作る．そのため，1 秒の仕事はシークレットの長さに比例し，表示している時間との積で増える（ハーネスの数え方で，16 字のシークレットで 1 秒に 2,651 歩，4,096 字で 63,341 歩）．通常のシークレット（32 字程度）では無視できる量であるが，保存されたシークレットが長いほど，表示している間の負荷が増える．
- 根拠: `tests/large.test.mjs` の「P8」（シークレットの長さ n，2n，4n での 1 秒の仕事の伸びの次数が 1.00）．ファズ対象 `popup` で，コードを表示したまま時間を進める入力の仕事を数えて確かめた（2026-10-14）．
- 直し方: 表示を始めるときに 1 度だけデコードして鍵を作り，毎秒は署名（HMAC の計算）だけを行う．
- 対応: popup と設定パネルの両方で，そのようにした（[fix/totp-key-once](https://github.com/yumasansansan/kulms-extension/tree/fix/totp-key-once)．2026-10-14）．
- テスト: `tests/large.test.mjs` の「P8」の 2 件（popup と設定パネル．todo）．

### P9
**QR コードを表示するたびに，シークレットを読み直し，QR コードを最初から作る**（低・ファズ）

- 場所: [popup.js:774-799](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/popup.js#L774-L799)，[src/assignments.js:2384-2413](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/src/assignments.js#L2384-L2413)
- 何が起きるか: popup と LMS の設定パネルの QR のボタンは，QR コードの表示と非表示を切り替える．非表示にするときは描いた SVG を消し，表示するときは，background に保存されたシークレットを読み直して（復号を含む），同梱の qrcode-gen で QR コードを作り直す．qrcode-gen は 8 通りのマスクをすべての模様に試して，最良のものを選ぶ．模様の数は QR コードの型番とともに増え，型番は符号化する URI の長さで決まるため，1 回の表示の仕事はシークレットの長さにほぼ比例する（ハーネスの数え方で，1 字で 78.6 万歩，32 字で 101 万歩，256 字で 366 万歩，1,024 字で 1,273 万歩，2,048 字で 2,399 万歩）．表示のたびに作り直すので，仕事は表示の回数との積で増える．通常のシークレット（32 字程度）であれば，数回の表示は問題にならない．
- 根拠: 2026-10-15 の毎日のファジング（38802566900）で，ファズ対象 `popup` が，数百字のシークレットの QR コードを 7 回表示する入力で，線形のコードの上限を超えた（1,044 単位の入力で，上限を 23 歩超えた）．対象は，QR コードを作る固定の仕事（最短のシークレットの分）を上限に加えていたが，長いシークレットで増える分は入力の仕事として数えていた．
- 直し方: 作った SVG をシークレットが変わるまで取っておき，表示を切り替えるだけにする（P8 と同じく，1 度作ったものを使い回す）．
- 対応: 作った QR コードの SVG 要素をシークレットとともに取っておき，表示するときに読んだシークレットが同じなら，作り直さずに付け直す．シークレットは今までどおり表示のたびに読むので，ほかの場所で変えられたときは作り直す（[fix/qr-code-once](https://github.com/yumasansansan/kulms-extension/tree/fix/qr-code-once)．v1.22.0 を基にした．2026-10-20）．
- テスト: `fuzz/known/popup/P9-qr-shown-again`（512 字のシークレットの QR コードを 5 回表示する．`tests/fuzz-inputs.test.mjs` が todo として流す）と，`tests/totp.test.mjs` の「P9」の 2 件（popup と設定パネルで，同じシークレットの QR コードを 3 回表示しても `qrcode()` を 1 回しか呼ばず，ほかの場所でシークレットが変わった後は作り直すこと．todo）．

## 保守性

- **M1**: TOTP の base32 デコードと HMAC の計算が，popup.js，assignments.js，auth-totp.js，auth-totp-register.js の 4 か所に重複している．background の 1 か所にまとめる（S1 の修正と同時に行う）．
- **M2**: 緊急度・表示形式・提出判定が popup.js と assignments.js に，コース一覧の取得が textbooks.js と assignments.js に重複している．
- **M3**: テストが無く，CI は PR 時の ESLint だけ．関数が IIFE に閉じており，chrome API と DOM に依存するため，単体ではテストしにくい．
- **M4**: `safari/KULMS+ Extension/Resources/` がコミットされた複製で，本体から遅れる．`087452e` では `src/assignments.js` と `src/submit-detect.js` が古いままだった．v1.21.1 では，上流が src に揃え（[`97a8746`](https://github.com/Radian0523/kulms-extension/commit/97a87462f3ab2950867ef53c2171713a77a7b3a8)），CONTRIBUTING.md に，`./build.sh safari` で生成される複製であるため直接編集しないよう記した．複製をコミットする形は変わらない．
- **M5**: 動かないコードがある．[src/textbooks.js:7](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L7) は，設定を読み込む前に設定を確かめている．[popup.js:901-917](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L901-L917) の SVG 走査は，作った画像を使っていない．[src/assignments.js:478-496](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L478-L496) の `getStatusBadgeClass()` と `getStatusLabel()` はどこからも呼ばれず，`isGraded()` はこの 2 つからのみ呼ばれる（2026-10-14．カバレッジで見つけ，呼び出しが無いことをコードで確かめた）． 対応: 3 か所を取り除き，`getStatusLabel()` からのみ使われていた翻訳のキー 3 つ（`statusSubmitted`，`statusGraded`，`statusNotSubmitted`）も en と ja から取り除いた．textbooks.js には，教科書を出すかどうかは設定を読み込んでから assignments.js が決めることを，コメントで残した（[fix/dead-code](https://github.com/yumasansansan/kulms-extension/tree/fix/dead-code)．2026-10-14）．上流の ESLint の警告は 46 件から 42 件に減った．減ったのは，取り除いたコードに対する no-unused-vars の 4 件である．
- **M6**: 上流の CI の Auto Assign（[.github/workflows/ci.yml:17-31](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/.github/workflows/ci.yml#L17-L31)）は，PR が開かれたときに，上流の所有者を担当者として付ける．しかし，フォークからの PR では，`permissions` に `pull-requests: write` を書いても GITHUB_TOKEN は読み取りの権限しか持たない [[GitHubActionsEvents]](#参考文献)．そのため，403（Resource not accessible by integration）で必ず失敗する（[#75](https://github.com/Radian0523/kulms-extension/pull/75)，[#76](https://github.com/Radian0523/kulms-extension/pull/76)，[#77](https://github.com/Radian0523/kulms-extension/pull/77) の記録で確かめた）．PR の内容の検査（ESLint）とは関係しない．直し方は，フォークからの PR ではこのジョブを飛ばすか，担当者を付ける処理を，PR のコードを取り出さない `pull_request_target` のワークフローに分けることである． 対応: 担当者を付ける処理を，`pull_request_target` で動く `auto-assign.yml` に移した．このジョブは PR のコードを取り出さず，実行もせず，PR から届く値をスクリプトに埋め込まないので，信頼できないコードを `pull_request_target` で動かす危険 [[GitHubActionsEvents]](#参考文献) には当たらない．`ci.yml` に残る ESLint のジョブには，読み取りの権限だけを与えた（[fix/auto-assign-forks](https://github.com/yumasansansan/kulms-extension/tree/fix/auto-assign-forks)．2026-10-14）．2026-10-25 に，担当者を，`actions/github-script` ではなく，ランナーにある `gh` で REST API を呼んで付けるようにし（PR の番号などは環境変数で渡す），ジョブに 5 分の時間の上限を付けた．同日に PR を送った（[#79](https://github.com/Radian0523/kulms-extension/pull/79)）．`pull_request_target` は既定のブランチにあるワークフローで動くため，実際の動作は，取り込まれた後に開かれる PR で確かめる．

## ドキュメント

### D1
**プライバシーポリシーの TOTP の記述が実装と合わない**（低・読解）

- 何が起きるか:
  - `docs/privacy.html` は「暗号文は chrome.storage.local に，鍵は IndexedDB に置く」と書いているが，v1.21.0 からはどちらも同じ IndexedDB にある．
  - 鍵が暗号文の隣にあるので，ディスクを読める攻撃者には平文とほぼ同じである．「AES-256-GCM で暗号化」という記述は，実際より強い保護であるかのように読める．
  - 扱うデータはすべて chrome.storage.local にあると書いているが，サイドバーのツール表示設定と幅は LMS のページの localStorage に，パネルの開閉や提出の目印，登録途中の TOTP シークレット（S3）は sessionStorage にある．2段階認証の設定ガイドとセキュリティのページも同じ書き方である．
- 対応: 3 つのページの保存先の記述を実装に合わせ，鍵が同じ端末にあるので端末のデータを読める人からは守れないことを書いた（[fix/privacy-storage](https://github.com/yumasansansan/kulms-extension/tree/fix/privacy-storage)）．
- ほかの修正との関係: ランディングページの修正（S13，D2〜D8．[#77](https://github.com/Radian0523/kulms-extension/pull/77)）も同じ 3 ページを変えるが，変える行が重ならないため，どちらを先に取り込んでも衝突しない（git merge-tree で確かめた）．両方を合わせた版でも，D2〜D5 と S13 のブラウザでの確認がすべて通った（2026-10-14）．

### D2
**ランディングページが画面の大きさに合わせて伸び縮みせず，狭い画面で内容がはみ出す**（低・ブラウザ）

- 場所: [docs/index.html:69](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L69)，[:107](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L107)，[:380](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L380)（列の幅 740px），[:404-411](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L404-L411)（区切りは幅 640px の 1 か所のみ）．大きさはほぼ px で固定されている．
- 何が起きるか: 狭い画面では，内容が画面の幅からはみ出し（幅 100px の画面で 204px），文字が箱からはみ出す．大きな画面では，幅 740px の列が小さく取り残される．読み込み直さずに画面の大きさを変えると，カルーセルの位置が見ていたスライドからずれる．
- 対応: 長さをすべて rem，em，割合で表し，基準の文字の大きさを `clamp(56.25%, 5vw, max(100%, 1.6vmin))` で画面から決めるようにした．長い語は箱の中で折り返す．カルーセルは，大きさが変わると，見ていたスライドに位置を合わせ直す（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，4 ページを 100×100 から 15360×8640 まで 22 通りの大きさで開き，読み込み直さずに大きさを変えた場合も含めて，画面や箱からはみ出す要素が無いことを確かめた．

### D3
**高さの低い画面で，スクロールで現れる節が透明のまま残る**（低・ブラウザ）

- 場所: [docs/index.html:1490-1500](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L1490-L1500)
- 何が起きるか: 節は，IntersectionObserver が，節の 10% 以上が画面（下端の 40px を除く）に入ったと伝えたときに現れる（`threshold: 0.1`，`rootMargin: '0px 0px -40px 0px'`）．画面の高さから 40px を除いた値が，節の高さの 10% に満たないと，どこまでスクロールしても閾値に届かず，その節は透明のまま表示されない．
- 対応: 読み込んだ時点で画面の外にある節だけを隠し，閾値を 0 にした（少しでも画面に入れば現す）（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，高さ 100px の画面を含む 22 通りの大きさで，隠した節がスクロールするとすべて現れることを確かめた．

### D4
**文字と背景のコントラスト比が WCAG 2.2 の AA に届かない**（低・ブラウザ）

- 場所: [docs/index.html:299](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L299)（`.footer a` の色），[:1407](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L1407)（開発を応援するボタン）
- 何が起きるか: フッターの「開発を応援する」ボタンでは，`.footer a` の色がボタンの文字の色より優先され，文字が背景に同化する（コントラスト比 1.07:1，ホバー時 1.20:1）．このほかにも，補足の文字，リンク，各ボタンの文字が，WCAG 2.2 の達成基準 1.4.3 の 4.5:1 [[WCAG22]](#参考文献) に届かない．
- 対応: 色相を保ったまま明るさだけを変え，文字と背景の組み合わせをすべて 4.5:1（大きな文字は 3:1）以上にした（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，22 通りの大きさにおいて，表示されているすべての文字のコントラスト比を背景の色から計算し，基準に届かないものが無いことを確かめた．

### D5
**機能のカルーセルで「次へ」「前へ」を続けて押すと，押した回数だけ進まない**（低・ブラウザ）

- 場所: [docs/index.html:1447-1454](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L1447-L1454)
- 何が起きるか: ボタンを押すたびに，現在のスライドをスクロール位置から求める．スムーズスクロールの途中で続けて押すと，途中の位置から求めたスライドの次を指すため，押した回数だけ進まない．Edge 155 と Firefox 158 のいずれでも，50 ms 間隔で 2 回押すと 2 枚目で，30 ms 間隔で 8 回押すと 3 枚目で止まった．
- 対応: ボタンや点で選んだスライドを記録し，そこへのスクロールが止まるまで（`scrollend`．これが無いブラウザでは `scroll` が 150 ms 途絶えるまで），途中の位置で現在のスライドを決め直さない．利用者がホイールやキーで動かした場合は，記録したスライドを捨てる（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，ボタンと点を 0〜400 ms の間隔で続けて押す操作など 21 通りを，prefers-reduced-motion の両方の設定で確かめた．

### D6
**スクリーンショットが PNG だけで重い**（低・ブラウザ）

- 場所: [docs/images/](https://github.com/Radian0523/kulms-extension/tree/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/images)（9 枚で 947,698 バイト）
- 何が起きるか: 機能を紹介する 9 枚のスクリーンショットが PNG であり，合わせて 947,698 バイトある．
- 対応: AVIF [[AVIF]](#参考文献)（4:4:4）に変換し（187,122 バイト），AVIF を表示できないブラウザには，picture 要素で PNG を出す．最初の 1 枚のほかは遅延して読み込む．AVIF の色空間は，colr と AV1 のシーケンスヘッダーの両方に明示した（原色 BT.709，伝達特性 sRGB，行列係数 BT.601，全範囲．[[H273]](#参考文献) の符号で 1/13/6）．行列係数を未指定（2）とした場合，Chromium は BT.601 とみなすが，Firefox は原色から推し量り，原色が BT.709 であれば BT.709 とみなす [[FirefoxCICP]](#参考文献)．原色だけを sRGB と明示した版では，Firefox においてのみ色がずれた（色のある画素で平均 5.25 段階）．Display P3 で撮られた 1 枚は sRGB に変換した（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，次のことを確かめた．いずれのブラウザでも AVIF が選ばれ，PNG は取得されない．AVIF を無効にした Edge と，source の type を未対応のものに替えた Firefox では，PNG に切り替わる．表示される画素は両方のブラウザで等しく，元の PNG との PSNR は 46.5〜52.1 dB である．

### D7
**ヘッダーの飾りの円が，ヘッダーの下端で切れる**（低・ブラウザ）

- 場所: [docs/index.html:317-332](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L317-L332)
- 何が起きるか: ヘッダーは `overflow: hidden` であり，右下の円はヘッダーの下に 40px はみ出しているので，円の下側が水平に切れる．狭い画面ではヘッダーが低くなるため，左上の円も切れる．
- 対応: ヘッダーは横方向のみを切り取り（`overflow: clip visible`），円は `z-index: -1` で，ページの背景のすぐ上，どの内容よりも後ろに描く（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: ブラウザで，1891×899 と 375×812 の画面を撮影し，円の中心を通る縦の列の明るさが，ヘッダーの下端をまたぐ範囲で，隣り合う行の間で最大 1.0 段階（255 段階中）しか変わらないことを確かめた．

### D8
**多要素認証の案内と設定手順の PDF へのリンクが切れている**（低・取得）

- 場所: [docs/index.html:585](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L585)，[:589](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L589)，[docs/2fa/index.html:271](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/2fa/index.html#L271)
- 何が起きるか: 京都大学情報環境機構の多要素認証の案内（`https://www.iimc.kyoto-u.ac.jp/ja/services/cert/mfa/`）は 404 を返す．設定手順の PDF（`https://iimc.kyoto-u.ac.jp/sites/default/files/2025-03/info31_0.pdf`）は，`www` の無いホスト名には接続できない．
- 対応: 現在の案内のページ（`https://www.iimc.kyoto-u.ac.jp/ja/services/account/mfa`）と，`www` の付いた PDF の URL に替えた（[#77](https://github.com/Radian0523/kulms-extension/pull/77)）．
- テスト: 4 ページのページ内のリンク 45 個と外部のリンク 20 個を取得し，すべて有効であることを確かめた（2026-10-14）．

### D9
**ダウンロードボタンのアイコンが，各ブラウザとストアのものと違う**（低・ブラウザ）

- 場所: [docs/index.html:424-454](https://github.com/Radian0523/kulms-extension/blob/20d7da3b9193960a2a1b38f1281e2e12c8155817/docs/index.html#L424-L454)
- 何が起きるか: ボタンのアイコンは，いずれも各社のロゴやストアのバッジではない．Chrome は 3 つに分けた円による近似であり，欠けがある．Edge は旧いロゴの部品がずれた形，Firefox は地球儀，Safari は方位磁針，iOS はスマートフォンの輪郭であり，Android はロボットの頭の触角が下に出た形である．また，Edge のボタンは Chrome ウェブストアを指している．
- 直し方: 各社のロゴは商標であり，使用の指針がある．たとえば Apple は，Apple のロゴを単独で使うことを認めず，App Store のバッジについて最小の大きさや周囲の余白を定める [[AppStoreMarketing]](#参考文献)．ストアのバッジ（App Store [[AppStoreMarketing]](#参考文献)，Google Play [[GooglePlayBadges]](#参考文献)，Chrome ウェブストア [[CWSBranding]](#参考文献)，Firefox Add-ons [[AMOPromote]](#参考文献)）を，それぞれの指針に従って使うのがよい．どれをどのように使うかは，上流の作者と相談して決める．

## 上流 Issue との対応

| 上流 Issue | 対応 |
|---|---|
| [#74](https://github.com/Radian0523/kulms-extension/issues/74) 30日後の削除効いてなくね？ | B2（[#76](https://github.com/Radian0523/kulms-extension/pull/76) を取り込んだ後，上流が閉じた） |
| [#32](https://github.com/Radian0523/kulms-extension/issues/32) lms への負荷軽減，[#27](https://github.com/Radian0523/kulms-extension/issues/27) sakai api 7分くらいかかってる | P1 |
| [#62](https://github.com/Radian0523/kulms-extension/issues/62) 授業資料のページのロード長い | P2 |
| [#58](https://github.com/Radian0523/kulms-extension/issues/58) 課題提出が反映されなくなった | `087452e`（提出ボタンを listen する修正）が対処しているとみられる（v1.21.1 の CHANGELOG はこれを #58 の修正とする．Issue は開いたまま．実機では未検証） |
| [#56](https://github.com/Radian0523/kulms-extension/issues/56) 非ログイン時に更新すると課題が空になる | ログアウトを検知してキャッシュを守る処理（`LoggedOutError`）がある（実機では未検証） |
| [#54](https://github.com/Radian0523/kulms-extension/issues/54) クイズが完了にならない | API に完了状態が無い仕様（範囲外） |

## JS のファジングとサニタイザ（2026-10-06 時点の調査）

JS はメモリ安全であるため，ASan や MSan が検出する種類の不具合は生じない．代わりに見るのは次の 4 つ．

- 落ちる: 未捕捉の例外，未処理の Promise 拒否
- 固まる: ReDoS や無限ループ（時計ではなく，数えた仕事量の伸びで検出する．S2，S8，S9 がこれ）
- 膨らむ: メモリの膨張
- 注入: DOM XSS，プロトタイプ汚染

| C++ | JS での相当物 | 状況 |
|---|---|---|
| libFuzzer | Jazzer.js：libFuzzer を内蔵したカバレッジ誘導型のファザー．Apache-2.0．Node のネイティブアドオンであるため bun では動作しない | v4.0.0（2026-04-15），2026-09 も更新あり |
| 性質ベーステスト | fast-check：`fc.uint8Array()` などで入力を生成し，失敗例を最小化する | v4.10.2（2026-09-19） |
| ASan / MSan | 不要 | — |
| UBSan に近いもの | TypeScript の `checkJs`（JSDoc の型）による静的検査 | — |
| 注入の検出器 | Jazzer.js の検出器（プロトタイプ汚染，eval/Function，コマンド注入，パストラバーサル，SSRF）．DOM XSS は jsdom の innerHTML などにフックする自作の検出器．popup には Trusted Types | — |
| clang-tidy | ESLint + `eslint-plugin-no-unsanitized` + `eslint-plugin-regexp`（`no-super-linear-backtracking`），CodeQL（`js/redos`，`js/double-escaping` など），`web-ext lint` | いずれも 2026-09〜10 に更新あり |
| 差分テスト | 参照実装との突き合わせ | TOTP と node:crypto で実施済み |

## fuzz リポジトリの仕組み

- **このリポジトリ（kulms-extension-fuzz）の役割**: kulms-extension を submodule として持ち，上流のコードは変えずに，ハーネス側でテストとファジングを行う．
- **ハーネス**（[harness/](../harness/)）: 偽の chrome API と jsdom を用意し（jsdom に無く Chrome にある ResizeObserver と Trusted Types の API も持たせる），submodule のスクリプトを manifest と同じ順で読み込む．偽の API は，複数タブで共有するストレージ，メッセージとその記録，拡張自身のファイル（web_accessible_resources の制限つき）を備える．タブは Chrome の文書のとおりに扱う．ウィンドウは 1 つで，前面のタブは 1 つであり，拡張に渡すタブの URL は，拡張がそのページを見てよいとき（ホスト権限があるか，activeTab が与えられたとき）に限る（拡張は "tabs" の権限を持たない）[[ChromeTabs]](#参考文献)．popup はアクションから開かれるので，開いたときに前面のタブへ activeTab を与える [[ChromeActiveTab]](#参考文献)．`tabs.query()` は，前面かどうか，ウィンドウ，URL のパターン（見てよいページに限る）で絞る（2026-10-14 に改めた．それまでは，すべてのタブを前面とし，条件を URL のパターンに限っていた）．`chrome.scripting.executeScript()` は，Chrome の文書のとおり，渡された関数を直列化してタブのページで改めてコンパイルし，引数は JSON として写し，返した値（Promise は待つ）を，注入できたフレームごとの結果とする．ファイルはそのページで順に実行する．スクリプトを入れてよいのは，拡張がそのページを見てよいとき（ホスト権限か activeTab）に限り，Chrome のページ（`chrome://`）には入れない [[ChromeScripting]](#参考文献)．拡張が同梱するライブラリ（jsQR）は，テストや対象が置き換えられる．投げた関数がどうなるかは文書に無いので，ハーネスは拡張の誤りとして報告し，そのフレームを結果から除く（2026-10-14 に改めた．それまでは，関数を実行せず，テストや対象の言う結果を返していた）．拡張がページに入れる `<script src>` のうち拡張自身のファイルを指すもの（grading-ta.js の橋渡し）は，web_accessible_resources がそのページに開いているときに限り，ページで実行して `load` を発火し，そうでなければ `error` を発火する（HTML 標準の「prepare the script element」[[HTML]](#参考文献)．jsdom はページのスクリプトを実行しないため）．スクリプトが求めるページの移動（`location.href` など）は jsdom が実行しないため，`beforeunload` でページに尋ねた後に記録し，ページはそのまま残す（いずれも 2026-10-14 に加えた）．キャンバスの 2D コンテキストは，HTML 標準の `drawImage()` と `getImageData()` の手順に従う（使えない画像は描かない，他のオリジンの画像は origin-clean を失わせる，幅か高さが 0 なら IndexSizeError，origin-clean でなければ SecurityError，ビットマップの外は透明な黒）[[HTML]](#参考文献)．jsdom はキャンバスを持たないためで，その仕事は画素ごとに数える（[harness/canvas.mjs](../harness/canvas.mjs)）．IIFE の中の関数は，読み込み時に AST 変換で外へ公開する（行番号は変えない）．読み込むコードは Jazzer.js の計装を通すので，vm や jsdom で動くコードからもカバレッジがファザーに届く．jsdom は，リンクの `href` や `host` を読むたびに URL を解析し直し（HTML 標準の「reinitialize url」[[HTML]](#参考文献) のとおり），セレクタの照合も，上る要素ごとに `host` を読む．その解析器（URL 標準 [[URL]](#参考文献) の URL パーサーの実装）は JavaScript で書かれ，1 文字に 1〜3 マイクロ秒かかる（Node の URL の数百倍）．そのため，最上段の数百万字のリンクを持つ入力では，数えた仕事は線形のまま，1 つの入力が数十分かかることがあった．解析は文字列と文書のベース URL と文字コードで決まるので，ハーネスは直近の 8 つの結果を取っておき，その写しを渡す．数える仕事は標準の手順のままである．また，jsdom の HTML パーサー（parse5）は，下位サロゲートの後に続く下位サロゲートを対として結合し，U+10FFFF を超えるコード点で例外を投げる．HTML 標準の入力ストリームの前処理は，孤立したサロゲートをそれぞれ 1 つのコード点として扱う（解析エラー surrogate-in-input-stream）[[HTML]](#参考文献)．そのため，ハーネスは上位サロゲートに限り結合するよう parse5 を正す（2026-10-14．ファズ対象 `resources` が見つけた）．コンテンツスクリプトは，Chrome と同じく実行時点（run_at）の順に入れる（document_start，document_end，document_idle の順で，同じ時点の中は manifest の順）[[ChromeContentScripts]](#参考文献)．ページは先に組み立てるので，document_start のスクリプトも組み立てた文書に会う．jsdom に無い `HTMLScriptElement.supports()` は，HTML 標準のとおり，classic，module，importmap，speculationrules に真を返す（Chrome は先読みの規則を実行する．2026-10-20 に加えた）．
- **検出器**（[harness/detectors.mjs](../harness/detectors.mjs)）: 例外のほか，次のものを失敗とする．いずれも，入力の前と後のコンテキスト全体を比べ，拡張がしそうなことに範囲を絞らない（2026-10-13 に広げた）．
  - マークアップ: 文書と，開いたシャドウツリーと，フレームの文書に，新しい要素でも前からある要素でも，スクリプトを動かすもの，外部から読み込むもの，ページを外部へ送るものが増えたら失敗とする．`<script>`（自分の文のもの，src が integrity のハッシュ（Subresource Integrity [[SRI]](#参考文献)）で確かめられないもの．ハッシュは sha256，sha384，sha512 のいずれかが実際の内容と一致するときに限り認め，内容を確かめられるのは拡張自身のファイルに限られる．nonce は認めない．拡張が付ける nonce は何も確かめないため），`<style>`（nonce があっても），確かめられないスタイルシートの `<link>`，マークアップや `setAttribute()` で付いた style 属性（CSSOM で付いたものは除く），`<object>`，`<embed>`，iframe の srcdoc，イベントハンドラの属性（コードが変わったものも），URL の属性が URL 標準 [[URL]](#参考文献) の URL パーサー（ブラウザと同じ）で `javascript:` か `vbscript:` に読めるもの（タブや改行を挟んでも同じ），フレームやスクリプトの `data:` と `blob:`，リンクをそれに変える SVG のアニメーション，`<base>`，`<meta http-equiv>`，スクリプトを読み込む `<link>`，拡張の host_permissions とページと拡張自身のいずれでもないオリジンから資源を読み込むマークアップ．type が speculationrules の `<script>` は，スクリプトを動かさない．HTML 標準の「prepare the script element」のとおり，その規則は，要素が文書につながった時点のテキストで一度だけ読まれる（後から書き換えても効かず，外すと解除され，外してから入れ直すと読み直される．複製には規則が無い）．ブラウザに先読みさせるページの URL を，標準の規則の読み方（list の規則の URL と，document の規則の条件に当たる a と area のリンク）で求め，許された起源の外のものを，外部から読み込むマークアップとして失敗とする（2026-10-20 に加えた）．同じ起源への先読みがサーバーで起こす副作用（B28，B29）は，検出器では見ず，テストで扱う．確かめる時点の文書に残っているものに加え，拡張が入力の間に文書へ入れた要素と，文書の中で属性を与えた要素を，その時点で調べて記録する．後で取り除いても，ブラウザでは，入れた時点でスクリプトが動き，画像が読み込まれるためである．文書に入れずに作った要素も，画像，video，audio のように文書の外でも読み込み，ハンドラーが動くものは調べる（文書に入れていない div の innerHTML に入れた `<img onerror>` も動く [[HTML]](#参考文献)）．ハーネス自身の操作（`uncounted()`）は除く（2026-10-20 に加えた．それまでは，確かめる時点の文書だけを見ていた）．
  - 組み込みの書き換え: 全域オブジェクトが持つすべての関数とそのプロトタイプ，名前空間（Math，JSON，Reflect，Intl，Atomics，WebAssembly），名前の無い組み込み（イテレータ，ジェネレータ，非同期のプロトタイプ，%TypedArray%，%ThrowTypeError%），それらがたどるすべてのプロトタイプで，プロパティの増減と変化（値，getter，setter，属性），プロトタイプの付け替え，拡張不可にすること．全域オブジェクトの関数と名前空間の差し替えと削除．
  - Trusted Types: ハーネスの窓は Chrome と同じ Trusted Types [[TT]](#参考文献) の API を持つ．拡張が受け口（innerHTML，outerHTML，insertAdjacentHTML，DOMParser，createContextualFragment，document.write，iframe の srcdoc，script の src と text，イベントハンドラの属性，文字列のタイマー）に文字列を渡した場合は，空の文字列であっても失敗とする．型を形だけにする方針も失敗とする．default の方針と，作られたときに試すと，スクリプトを動かすマークアップ，スクリプトを動かすか外部を指すスクリプトの URL，任意のスクリプトの文を通す方針．
  - 誰も受けない例外と Promise の拒否．
  - 拡張が握りつぶしたプログラムの誤り: 拡張のすべての catch 節と，拡張が Promise に渡す拒否の処理に，受けたものを渡す呼び出しを行を動かさずに差し込み（harness/source.mjs），Promise.all，allSettled，any，race が値として返したり捨てたりする拒否も見る．TypeError などの文言（`Cannot read properties`，`is not a function`，`Cannot destructure` など）のものを失敗とする．JSON の構文の誤り，URL でない文字列，壊れた %-エンコードのように，データを読むコードが受けるはずの誤りは除く．
  - 通信: 拡張の host_permissions，そのコンテキストのオリジン，拡張自身のいずれでもない宛先への要求．
  - 保証の無い応答: https で host_permissions のオリジンから来たものでも，拡張自身のものでもない応答の本文を，拡張が読むこと（2026-10-14 に加えた）．KULMS と KULASIS は応答に署名しないため，データを保証するのは TLS [[RFC8446]](#参考文献) のみであり，TLS が保証するのは送信元である．応答が拡張に届くかどうかは，ハーネスの fetch が，Fetch 標準のリダイレクトの扱い，redirect-taint，CORS の判定 [[Fetch]](#参考文献) と，Chrome の拡張の取得の扱い [[ChromeNetwork]](#参考文献) に従って決める．content script の http への要求は，混在コンテンツとして止める [[MixedContent]](#参考文献)．
- **仕事量**（[harness/work.mjs](../harness/work.mjs)）: 遅さは時計で判定せず，拡張がした仕事を数えて判定する（2026-10-07 に作り直した）．
  - 拡張のコードは，関数の呼び出し，ループの 1 周，値をたどる構文（コードに書かれていない文字列どうしの比較，実行時に作るキー，オブジェクトの展開，プロトタイプチェーンをたどる演算子）を数える．組み込み関数と Web API は，標準（ECMAScript [[ECMA-262]](#参考文献)，DOM [[DOM]](#参考文献)，HTML [[HTML]](#参考文献)，URL [[URL]](#参考文献) など）の手順の歩数で数える（[harness/costs.mjs](../harness/costs.mjs)，[harness/web-costs.mjs](../harness/web-costs.mjs)）．標準が上限だけを求めるものはその上限，エンジンに任せるものは Chrome のやり方で数える．DOM は標準の手順どおりに数えるので，Chrome が索引で速く済ませるもの（getElementById など）もツリーをたどる分を数え，数は Chrome にとっての上限になる．正規表現は，V8 と答えを突き合わせながら，バックトラックするエンジンの歩数で数える（[harness/backtrack.mjs](../harness/backtrack.mjs)）．そのエンジンは，戻る先の選択肢を，固定の大きさのブロック（Int32Array）の連なりに積む．貪欲なループは 1 単位ごとに 4 つの数を積み，配列は約 1.3 億要素までしか持てないので，最上段の長いリンクで足りなくなったためである．
  - 規則の抜けは [tests/costs.test.mjs](../tests/costs.test.mjs) が防ぐ．ECMAScript の組み込み関数のすべて（1 つの realm に 645），拡張のコードが名前を挙げる Web API のメンバーのすべて，構文の形のすべて，拡張のコードが書く selector のすべてに規則があることを確かめる．拡張は eval も Function も使わない（使えば数えられないので，これも確かめる）．
  - 数えた仕事量で，テストは入力の大きさ n，2n，4n での伸びの次数を見る（[harness/work.mjs](../harness/work.mjs) の `degree()`．1.5 未満を線形とする）．ファジングは，入力を段に分けて同じ基準で見る（下）．
  - 仕事量を数える手順そのもの（ハーネスの関数，jsdom の内部の呼び出し，前の入力の遅れて動くタイマー）は，入力の仕事に数えない．入力ごとに非同期の文脈（AsyncLocalStorage）を分け，その入力の文脈で動いた仕事だけを数える．拡張が前の入力のために覚えたり描いたりしたもの（課題パネルの科目の一覧と，描いた内容）は，対象が入力の初めに数えずに取り除く．background の TOTP の保存は，入力の初めに空にして，入力が言うシークレット（または無し）を拡張自身の `saveTotpSecret()` で置く．その仕事はどの入力にも数えない（harness/work.mjs の `aside()`）．前の入力が動かし始めたことは，次の段の前に終わらせ，そこで起きた未処理の拒否を次の段のものとしない．
  - ライブなコレクション（`getElementsByTagName()` などが返すもの）は，数える見方（Proxy）を通して拡張に渡し，添字の読みを数える．その forEach，values，keys，entries と反復子は，Web IDL [[WebIDL]](#参考文献) が Array.prototype のものとするため，どの realm のものも見方の上で動かす．2026-10-13 まで，ハーネスは realm を作るたびにこの包みを前の realm の包みに重ねており，2 つめ以降の realm では，それらを素のコレクションに束ねていた．そのため，同じプロセスで 2 つめ以降に開いたページでは，コレクションを走査する読み取りが数えられていなかった（100 個のリンクを走査する同じ操作が，1 つめのページで 10,811 歩，2 つめ以降で 313 歩）．包みの重なりは，開いたすべてのページを掴んでもいて，ページを入力ごとに開く対象（`resources`）のファジングは 12GB を使い，数えた呼び出しのたびにすべての包みを通って，1 つの入力に 2 秒かかるまで遅くなった．包みは realm を掴まない 1 つの関数にした．検出器が見る記録（例外，拡張が捕まえたもの，Trusted Types の受け口に渡された文字列）も，ほかの記録と同じく入力の初めに忘れる（`Browser.forget()`）．
  - 入力の大きさによらない，入力のした操作の固定の仕事は，対象が，入力が空のときの仕事量と同じく測り，その入力の上限に加える（[harness/work.mjs](../harness/work.mjs) の `allow()`．2026-10-14 に加えた）．下の段から外挿した上限には加えない．下の段も同じだけ払うからである．popup の QR の生成（最短のシークレットで約 78 万歩）と，表示したコードの毎秒の更新（16 字のシークレットで 1 秒に 2,652 歩．ページの時計がタイマーを動かす前に払う）がこれに当たる．それより長いシークレットが加える分は入力のものとして数え，判定する．それまでは，QR を作るかコードを表示する小さな入力が，線形のコードの上限を超えていた．また，対象が利用者の操作のために要素を探す処理（`querySelectorAll()`，`getElementById()`）も拡張の仕事として数えていたので，数えないようにした．
  - 線形のコードがするはずの上限は，対象ごとに決まる．数える場所は，その対象のブラウザが読み込んだスクリプトのもので，入力が空のときの仕事量も，その対象のものである．同じプロセスでほかの対象が読み込んだスクリプト（テストは対象をまとめて動かす）は数えない．
  - 上限の入力の大きさ U は，入力のバイト数とそれから作った値の単位数である．ただし，入力が拡張に渡したもの，すなわち開いたページの HTML と，拡張が読んだサーバーの答えの本文の大きさがそれより大きければ，その大きさを U とする（[harness/work.mjs](../harness/work.mjs) の `handOver()`．2026-10-14 に加えた）．答えは，拡張が何度求めても 1 度だけ数える．拡張自身のファイル（messages.json など）は入力ではないので数えない．対象は，入力から作った値の周りに Sakai の書くとおりのマークアップを組み立て，どの形にするかを入力の数ビットで選ぶ．一方，線形のコードは渡されたもの全体をたどる．そのため，それまでは 16 バイトの入力がフォルダの行（376 文字．うち onclick が 173 文字）をページに入れると，授業資料のフォルダ展開（tree-view.js）の仕事が 16 単位の上限を超えた（2026-10-14 の CI の実行 38504368910 の `resources`）．段から段への伸びは，これまでどおり入力の単位で読む．
  - 文字列を受ける組み込み関数と Web API の要素（`encodeURIComponent()`，`textContent` の設定など）は，仕様が引数を文字列にする（ECMA-262 の ToString [[ECMA-262]](#参考文献)，Web IDL の DOMString など [[WebIDL]](#参考文献)）ので，その文字列の長さで数える．オブジェクトは自らのメソッド（toString など）で文字列になり，その仕事はそのメソッドが動く所で数える（[harness/costs.mjs](../harness/costs.mjs) の `textUnits()`．2026-10-16 に改めた）．それまでは，配列もどきの長さと同じく，オブジェクトの `length` を読んでいた．そのため，サーバーの JSON の `{"length": 5.8e250}` を `encodeURIComponent()` に渡すと，`"[object Object]"` にするだけの呼び出しを 2^53 歩と数えた（CI の実行 38743594130 の `site-contact`）．
  - ハーネスは，V8 の `JSON.stringify()` の速い道を使わない（`--no-json-stringify-fast-path`．2026-10-16 から）．速い道は，循環をループの 20 万回ごとにしか調べず，その間に書き出したものをヒープの外に持つ [[V8JSON]](#参考文献)．自らを持つ値を渡されると，対象のプロセスが 13 GB を使い，ファジングの上限で止められた（毎日のファジング 38802566900 の `grading-bridge`）．規格は循環に会った時点で TypeError を投げ，仕事もそのように数える．Chrome の速い道が規格の手順の上に行う仕事は数えないので，そこでは数えた仕事は Chrome の上限にならない（B24）．
- **テスト**（[tests/](../tests/)）: 各問題の再現（todo），ハーネス自体のテスト，ファズ対象のシードと回帰入力と既知の失敗入力の再生．
  - 拡張の非同期の処理は，固定の時間ではなく，ハーネスが拡張に代わって行う処理（chrome API の応答とイベント，メッセージ，fetch，IndexedDB，Web Crypto）がすべて終わるまで待つ（[harness/work.mjs](../harness/work.mjs) の `idle()`）．ページのタイマーにかかわる処理は，ページに自分の時計を持たせて進める（[harness/clock.mjs](../harness/clock.mjs)）．2026-10-14 まで，いくつかのテストは固定の時間（20〜800 ms）を待っていた．カバレッジの計測で機械の負荷が高まると，B12 の todo のテストでは，最初の値に対する拡張の拒否が待ち時間の後に届いたため，テストは最初の値を問題なしとして次の値へ進んだ．最初の値の拒否が届いた時点でテストは失敗として終わり，次の値に対する拒否はテストの終了後に届いた．Node のテストランナーは，これをトップレベルの診断として報告し [[NodeTest]](#参考文献)，失敗の数を 0 としたまま終了コードを 1 とした．すべての固定の待ちを置き換えた後は，16 個の CPU をすべて塞いだ状態でカバレッジを測りながら実行しても，失敗はなく，テストの終了後に届く処理も生じない．
- **ファジング**（[fuzz/](../fuzz/)）: 外から入力が来る面ごとの 14 の対象と canary．`sidebar`（2026-10-13 に加えた）は，ページの DOM と localStorage と時刻と利用者の操作を入力にする最初の対象で，ページに自分の時計を持たせ（[harness/clock.mjs](../harness/clock.mjs)．タイマーは HTML 標準のタイマーの初期化手順 [[HTML]](#参考文献) に従って設定する），入力の操作の後に時計を 10 分進めて，スクリプトが仕掛けたタイマーをすべてその入力の中で動かす．それでも尽きないタイムアウトは，終わらない処理として失敗とする．`grading-bridge`（2026-10-14 に加えた）は，TA 採点支援がページの世界に入れる橋渡し（grading-ta-page.js）を，ページの採点の要素とその値（ページのスクリプトが作れるものすべて）と，届く求めで動かす．`totp-register`（2026-10-14 に加えた）は，認証サーバーの TOTP 登録のページで動く登録補助を，ページの URL，本文，リンク，画像，コードの入力欄，jsQR の読み取り結果，ページの sessionStorage で動かす（jsQR は拡張が同梱する外部のライブラリであるため，入力が画像ごとに言う結果で置き換える）．jsdom は innerText を持たないため，ハーネスは HTML 標準が CSS を扱わないユーザーエージェントについて定めるとおり，子孫のテキスト内容として与える [[HTML]](#参考文献)．`popup`（2026-10-14 に加えた）は，popup を，chrome.storage.local の値（拡張の書く形，または JSON の任意の値），background の TOTP シークレット，ウィンドウのタブ（LMS，認証サーバー，その他のページ，Chrome の新しいタブのページのタブと，それぞれの content script が popup の更新の求めに返す答え，前面のタブ），前面のタブのページ（画像とキャンバス．その画素，データのオリジン，jsQR がその画素に見つけるもの），利用者の操作で動かす．前面のタブのページは作り，popup の QR の読み取りはそこで実際に動く．ほかのタブのページは作らず，その content script は入力の言う答えで置き換える（content script は，それぞれを入口にする対象がファジングする）．`grading-pages`（2026-10-14 に加えた）は，TA 採点支援（grading-ta.js）を，Sakai の採点画面と提出一覧のページで動かす．入力は，ページの URL，採点画面（受講者の一覧，入力欄と保存や返却のボタンを持つパネル，採点済みの数），採点画面の要素が持つ提出（拡張がページに入れる橋渡しが実際に読む），ページの表（提出一覧とそれ以外），取得する提出一覧のページへのサーバーの答え，ページの sessionStorage に拡張が残す状態，未保存のまま移動するかを尋ねられたときの利用者の答え，利用者の操作とページ自身の書き換え（受講者の一覧の描き直し，パネルの開閉，状態の書き換え）である．拡張がページを移動させるときは，移動先が LMS であること，利用者が留まると答えた後に移動しないこと，同じ移動について二度尋ねないことも確かめる．対象の一覧と運用は [fuzz/README.md](../fuzz/README.md) にある．`resources` は，Sakai の「すべて展開」のリンク，ページの localStorage のツリーのキャッシュ（拡張の書く形，任意の JSON，任意の文字列）と，ページ自身のデータの量を，入力の最後に加えた（2026-10-20．v1.22.0 の一括展開とキャッシュのため．それまでの入力の読み方は変わらない）．`sidebar` は preload.js と prerender.js も読み込む．
  - 入力は手加減しない（2026-10-07 に見直した）．文字列は入力のビット列を 16 ビットずつ（すべての符号単位），8 ビットずつ（ASCII が出やすい），UTF-8 のいずれかで読む．数は任意の 64 ビットのパターンと境目の値，値は undefined，null，BigInt，任意の深さの入れ子などを含む．ネットワークは失敗，任意のステータスと Content-Type，途中で切れた本文と，リダイレクトで別のオリジンや http から来た応答（相手が CORS で許すかどうかも）も返す．JSON の文字列にできない数（NaN，Infinity）をどう書くかは，入力から読まずに，入力のバイト列から作る乱数（どの段でも同じ並び）で選ぶ．値のキーが段で繰り返す文字列だと，段によってキーが重なり，そうした数の個数が段で変わるからである．
  - 大きさは段で作る．入力そのもの（libFuzzer [[libFuzzer]](#参考文献) に作らせるバイト列）と，その下の段で作る値は 4,096 単位まで．入力は最初に段数を選び，段を上がるたびに，入力が繰り返す片を 2 倍の回数繰り返す．最上段で作る値は，Chrome の runtime メッセージ 1 通が運べる量（JSON の UTF-8 で 64MiB．1 単位は 6 バイト以内であるため 11,184,810 単位）まで．
  - 段から段へ，仕事の増えが前の段の増えの 2^1.5 倍（n log n の仕事が増える量）を超えたら，速い伸びとみなす．伸びを読むのは，コードが段の足した分をたどった（1 単位に 1 歩以上を使った）ときだけで，繰り返す部分が入力の残り以上の長さになった段から．それまでは，繰り返す部分と残りとの掛け合わせ（繰り返す文字列の中で残りの文字列を探すなど）が，段ごとに伸びの割合を変える．一度だけの速い伸びは，繰り返しが初めて行を閉じたときなどに生じる段差であるため，速い伸びがあった段の上の段にだけ，下の段の仕事量から外挿した上限を走らせる前に与え，超えたら止めて失敗とする．線形でない入力は，速い伸びが 2 段続いた所で止まり，何時間も走らない．ほかの段は，線形のコードがするはずの上限（対象のブラウザが読み込んだコードの，数える場所の数 × (U+1) × ⌈log₂(U+2)⌉ ＋ その対象の，入力が空のときの仕事量）で判定する．
  - 時間は，数え方を確かめるために見る．2 段離れた段どうしで，時間の伸びの次数が仕事量の伸びの次数を 0.5 より多く上回ったら，数えていない仕事があるとして失敗とする（下の「時計の揺れ」）．CI では見ない．
  - 時計で止めるのは，何も数えない所で終わらないものだけ．CI はジョブの終わるべき時刻を `ci/fuzz.sh --until` に渡し，各対象は残りの時間を残りの対象で等しく分けたものを使う．毎日のファジングは対象ごとにジョブを分けたので，各対象がジョブの時間をまるごと使う（2026-10-14 に分けた．下の CI）．ファジングそのものの時間は，その持ち時間に，前の実行で最も遅かった入力（最初に再生して時間を測る）と同じだけ遅い入力をもう 1 つ流す余裕が残るように短くする．余裕は少なくとも 5 分とする．毎日のファジングで遅かった入力は，`submission` の 466 秒の 1 件を除いて 5 分以内に終わったため，測った値から定めた．libFuzzer は，ファジングの時間が過ぎた後に新しい入力を始めないが，途中の入力は最後まで流す．そのため，それまでは最後に遅い入力を始めた対象が持ち時間を超え，失敗として止められていた（2026-10-14 の毎日のファジング 38462363590 の `submission`）．
  - 拡張が自分で捕まえて警告だけ出すエラーのうち，プログラムの誤りを示すもの（TypeError などの文言）も失敗とする．B19 と B20 はこれで見つかった．
  - シードと既知の問題の入力は，`fuzz/inputs.mjs` が，対象の読む値の並びから書く（`fuzz/encode.mjs` が FuzzedDataProvider の逆をたどる）．入力の読み方を変えたときに，これらが黙って別の入力になるのを防ぐためで，テストは，既知の入力がその問題だけを起こすことも確かめる．
  - 修正ブランチは，`KULMS_EXTENSION_DIR` でその拡張を指し，`KULMS_FUZZ_LOOK_FOR` で直した問題を避けずに探して，ファジングで確かめる（下の「ファジングで避けている既知の問題」）．
- **カバレッジ**（[harness/coverage.mjs](../harness/coverage.mjs)，[ci/coverage.sh](../ci/coverage.sh)）: テストとファズのコーパスが，拡張自身のコードのどこまで届くかを測る．拡張自身のコードは，manifest.json と popup のページが読み込むスクリプトの 17 本で，同梱のライブラリ（vendor/）は除く．
  - 計装は足さず，V8 が数える（`NODE_V8_COVERAGE` [[NodeCoverage]](#参考文献)）．vm で動く background も，jsdom の窓で動く content script と popup も数えられる．
  - ハーネスが書き換えたコードで数えた範囲は，拡張のコードの元の位置に戻す（harness/source.mjs の `sourcePlaces()`）．ハーネスが足した部分（仕事を数える呼び出しと，内部を公開する getter と setter）は，範囲が空になって落ちる．`chrome.scripting.executeScript()` がページで改めてコンパイルする関数は，元のスクリプトの中の位置に置き，残りを空白にしてコンパイルする．数えるのは，その関数とその中の範囲だけである．
  - プロセスごとの数をスクリプトごとにまとめ，ast-v8-to-istanbul で拡張のコードの構文木に当てて，istanbul [[istanbul]](#参考文献) と同じ単位（文，分岐，関数）で数える．1 度も動かなかったスクリプトは，どこにも届いていないものとして入れる．
  - 数字は判定に使わない．次のテストやファズ対象をどこに向けるかを読むためのもので，結果は，スクリプトごとの表と，届いていない関数の一覧と，1 行ずつ示すページ（istanbul の HTML）にする．V8 は，入ったブロックを最後まで動いたと数えるので，途中で例外を投げた呼び出しの後ろも届いたことになる．
  - [tests/coverage.test.mjs](../tests/coverage.test.mjs) が，すべてのスクリプトで位置の戻し方を確かめ，別のプロセスで実際に数えた回数が，background と窓のどちらでも拡張の関数と文に出ることを確かめる．
- **CI**（[yumasansansan/ADLplug-Next](https://github.com/yumasansansan/ADLplug-Next) にならう）:
  - 素の git でチェックアウトし，submodule も含める．Node と pnpm は，どちらも最新版を（pnpm は npm のレジストリが `latest` とする版を），`ci/setup.sh` が SHA-256 を確かめて入れる．外部の action は，commit で固定した `actions/upload-artifact` だけ．
  - `ci.yml`（push ごと）: Ubuntu と Windows でのテスト，lint（このリポジトリには ESLint のすべての指摘で失敗し，submodule の拡張には DOM XSS と ReDoS のルールを掛けて報告だけする），REUSE，canary と各対象 1 分のファジング，カバレッジの計測．落ちた入力は artifact に残す．カバレッジの計測は，テストと，次の毎日のファジングが引き継ぐコーパス（[ci/carry-over.sh](../ci/carry-over.sh)）を流し，1 行ずつ示すページを artifact に残す．数字では失敗にしないが，コーパスの入力がそのコミットで落ちれば失敗にする（次の毎日のファジングより先に判明する）．
  - `fuzz.yml`（毎日）: 各対象 20 分のファジング．対象ごとに 1 つのジョブとし，すべてのジョブを並べて走らせる．ADLplug-Next は重い対象をそれぞれ別のパートにするが，このリポジトリにはパートごとのビルドが無く，どのコーパスが重くなるかは日によって変わるので，すべての対象をそれぞれのジョブにした（2026-10-14）．コーパスと落ちた入力は対象ごとの artifact で引き継ぎ（分ける前の 1 つの artifact からも取る．[ci/carry-over.sh](../ci/carry-over.sh)），前回落ちた入力を最初に再生する．
  - どちらのジョブも，始めに，ファジングが終わるべき時刻（GitHub がジョブを止める 6 時間から，残したものを保存する 30 分を引いた時刻．`fuzz.yml` はジョブ自身の上限 330 分の 5 分前）を記録して `ci/fuzz.sh --until` に渡す．
  - 1 つのプロセス（対象のファジング，入力の再生）が持てるメモリは，スクリプトの開始時にマシンが使える量（`/proc/meminfo` の MemAvailable [[ProcMeminfo]](#参考文献)）から余白を引いたものとする（[ci/memory.sh](../ci/memory.sh)．2026-10-15 に改めた）．libFuzzer はそれを超えたプロセスの入力を（`-rss_limit_mb`），V8 はヒープがそれを超えた入力を（`--max-old-space-size`）止め，どちらも入力を残す．libFuzzer の居ない入力の再生（前の回に落ちた入力，カバレッジの計測）は，常駐メモリを 1 秒ごとに見て，超えたら止める．余白は，その 1 秒の間にプロセスが増やしうる量（各対象のコーパスを流して 0.1 秒ごとに測った最大）と，周りのプロセス（pnpm，timeout，シェル）が持つ量の和である．それまでは，マシンの全メモリを限度としていた．OS と runner がその一部を持ち，Ubuntu 26.04 では `/tmp` もメモリ上にある [[RunnerImages]](#参考文献) ため，どちらの限度にも達する前にマシンのメモリが尽きえた．GitHub は資源の尽きた runner を止める [[RunnerShutdown]](#参考文献)．止められたジョブは，ログがそこで切れ，後のステップ（見つけたものの保存）も動かない．
  - ファジングと再生が出力するものは，その場でジョブのログに流し（以前は一時ファイルに書き，終わってから一部を抜き出していた），1 分ごとに，そのプロセスが持つメモリと，マシンが使える量とスワップの使用量を 1 行で書く．runner が止められたときに残るのはログだけだからである．出力の写しは，メモリ上の `/tmp` ではなく，ディスクに置く．

## 時計の揺れ

ファジングで時間を確かめる値（[fuzz/lib.mjs](../fuzz/lib.mjs) の `NOISE`，`TIME_FLOOR`，`TIME_SPAN`）は，時計の揺れを測って決めた．時間は機械と実装によるので，理屈からは決まらない．測るのは [fuzz/noise.mjs](../fuzz/noise.mjs) で，段を上がるシード 4 つを，最上段を高くして 3 回ずつ流し，2 段離れた段どうしで，時間の伸びの次数が仕事量の伸びの次数をどれだけ上回るかを見る．数えていない 2 乗の仕事なら，1 上回る．

2026-10-07 に，13th Gen Intel Core i7-1360P，Windows 11，Node 26.10.0 で，電源につなぎ，高パフォーマンスの電源プランで測った．表の値は，上回った量の最大である．Linux（Ubuntu 26.04）では，まだ測っていない．

| 流し方 | 2 段下からの時間の増えが 0.1 秒以上 | 0.3 秒以上 | 1 秒以上 |
|---|---|---|---|
| node fuzz/noise.mjs | 0.32 | 0.10 | −0.04 |
| node fuzz/noise.mjs --jazzer（ファジングと同じ計装の下） | 0.16 | 0.09 | 0.02 |

- `NOISE` は，捕まえるべき最小の信号（数えていない 2 乗の仕事で 1）の半分の 0.5 とした．
- `TIME_FLOOR` は，測った揺れの最大が `NOISE` の半分（0.25）以下に収まる，最小の時間の増えとした．0.1 秒では 0.32 まで揺れるので，0.3 秒である．そこでの揺れの最大は 0.10 で，`NOISE` はその 5 倍ある．
- 隣の段どうしで比べると，揺れがはるかに大きい．ある段の時間が少し長く（短く）出ると，その段の下と上の増えが逆向きに変わるためである．電源につながず，通常と異なる電源プランで似た入力を流したときは，隣の段どうしでは 0.3 秒以上の増えでも 1.22 まで揺れ，2 段離すと 0.14（Jazzer の下で 0.19）だった．数えていない仕事の信号は，離しても変わらない．そこで 2 段離して比べる（`TIME_SPAN` = 2）．
- 揺れの違う機械では，環境変数 `KULMS_FUZZ_NOISE` で `NOISE` を変えられる．
- CI の機械は，ほかのジョブと分け合うので静かにできず，揺れも測っていない．そのため CI では時間を確かめない（`KULMS_FUZZ_NOISE=Infinity`）．続く修正の後の CI では，`assignments` の ×65536 から ×262144 までの 2 段で，仕事量は 4.0 倍なのに時間が 8.45 倍（12.6 秒から 106.5 秒）になり，0.54 上回った．手元では，同じ入力が Node だけでも Jazzer の下でも 4.4 倍ほどで，GC はその段の時間の 13% だった．

## ファジングで避けている既知の問題

ファザーは最初の失敗で止まる．そのため，まだ直っていない問題を起こす入力は，ファズ対象の側で避けている（`fuzz/open-findings.mjs`）．避けている場所にはいずれも `Known:` で始まるコメントがあり，[fuzz/README.md](../fuzz/README.md) にも同じ表がある．直った問題は `open-findings.mjs` から外し，対象はまたそれを探す．

| ID | 対象 | 避けているもの |
|---|---|---|
| S1 | `background-message` | content script への応答にシークレットがあるかを見ない（LMS の設定パネルが受け取るため） |
| S2 | `site-contact`，`background-message` | その正規表現を V8 の線形エンジンで動かし，進んだ長さで数える（入力は切らない） |
| S7 | `background-message` | リスナーが例外を投げる形のメッセージを送らない |
| S8 | `syllabus-detail`，`syllabus-search`，`background-message` | その正規表現を V8 の線形エンジンで動かす（同上） |
| S9 | `assignments`，`background-message` | その正規表現を V8 の線形エンジンで動かす（同上） |
| B10 | `i18n` | `$` を含む置換値では，拡張の文の `t()` を呼ばない（値が置換の記法として読まれ，結果が崩れる．置き場所が 2 つある文では，結果と仕事が値の長さの 2 乗や 3 乗で伸びる） |
| B15 | `i18n` | どのオブジェクトにもあるキー（`constructor`，`toString` など）を引かない |
| B16 | `grading-status` | `%` の並びが壊れたリンクを読ませない |
| B16 | `grading-pages` | ページのクエリ，課題へのリンク，表の提出へのリンクのうち，grading-ta.js がデコードする部分に壊れた `%` の並びがあるページは，流さない |
| B17 | `assignments` | 保存されたメモが配列でなければ無いものとし，一覧から null を除く．文字列や数にできない値を，ID か本文か期限に持つメモ，期限があって科目の ID に持つメモ，期限か科目の ID があって科目名に持つメモも除く（メモは拡張自身の読み込み関数で読む） |
| B18 | `grading-status` | `toString` か `valueOf` を自分に持つオブジェクトを含む応答を読ませない．提出の項目の型を確かめない |
| B19 | `assignments` | 科目の一覧と科目ごとの取得が捕まえたプログラムの誤り（警告に書いたものも，catch が受けたものも）を数えない．課題，クイズ，サイトの名前が自分の `toString` を持つオブジェクトなら，その名前を除く |
| B20 | `site-contact`，`background-message` | `fetchSakaiSiteContact()` が捕まえたプログラムの誤り（警告に書いたものも，catch が受けたものも）を数えない |
| B21 | `i18n` | 値を 1 つだけ，空文字列で渡したときは，値が無いものとして確かめる |
| B22 | `background-message` | UTF-8 で 32 KiB を超えるシークレットを，メッセージでも，入力の初めの TOTP の保存内容としても保存しない（その入力は流さない） |
| S10 | すべての対象 | 拡張が自分のファイルを，integrity のハッシュで確かめられない `<script>` で入れることと，`<style>` を入れることを数えない（その要素が運ぶものは，ほかの検出器が見る） |
| S11 | すべての対象 | 拡張が Trusted Types の受け口に文字列を渡すことを数えない（渡したもので起きることは，ほかの検出器が見る） |
| S12 | すべての対象 | リダイレクトで，https でホスト権限のオリジンでない所から来た応答の本文を，拡張が読むことを数えない（読んだもので拡張がすることは，ほかの検出器が見る） |
| B4 | `sidebar` | tool-visibility.js が DOM の変化から 200 ms 後に設定する再処理を，設定させない（設定済みのタイマーとみなされる値を入れる）．再処理は，ページを組んだ後と各操作の後に，対象が自分で呼ぶ |
| B12 | `sidebar` | ページの localStorage のツールの設定が，オブジェクトでない値か，オブジェクトでない項目や `hasOwnProperty` というキーを持つ項目を含むなら，置かない（途中で書くときも） |
| B23 | `sidebar`，`submission`，`totp-register` | 拡張のコードが投げた QuotaExceededError を数えない（これらの対象で Web Storage に書くのは tool-visibility.js，sidebar-resize.js，submit-detect.js，auth-totp-register.js のみ） |
| S6 | `totp-register` | 鍵にできないほど短いシークレットによる `DataError: Zero-length key is not supported` の未処理の拒否を数えない |
| B22 | `totp-register` | 登録補助が background に UTF-8 で 32 KiB を超えるシークレットを保存させたとき，`encryptSecret()` が `String.fromCharCode()` で受ける RangeError（background が捕まえて警告する）を数えない |
| S6 | `popup` | base32 でない文字を含むシークレットを保存したまま「QR」を押す入力は，流さない．8 ビットに満たないシークレットのコードの表示で起きる `DataError: Zero-length key is not supported` の未処理の拒否を数えない |
| B12 | `submission` | ページの sessionStorage の提出の ID が，JSON で配列でない値なら，置かない（途中で書くときも） |
| P6 | `background-message` | Shift_JIS の表を最初の入力の前に作っておき，どの入力にも数えない（探すときは，入力ごとに表を消し，Service Worker が起動した直後の状態から始める） |
| B25 | `popup` | 保存された課題のキャッシュのうち，一覧が配列でないもの，オブジェクトでない項目を持つもの，文字列でない状態を持つ項目を含むもの，表示や連結，比較に使う欄（科目名，科目の ID，名前，URL，ID，期限，締め切り）に文字列や数にできない値を持つ項目を含むものは，置かない（途中で書くときも） |
| B26 | `grading-pages` | 提出日時の列にセルの無い行で `parseSubmissionListGroups()` が投げる TypeError を，ページの表でも取得した一覧でも数えない |
| B17 | `popup` | 保存されたメモが，配列でない値か，null を含む一覧か，文字列や数にできない値を，ID に持つメモか，期限があって期限，本文，科目の ID か科目名に持つメモを含む一覧なら，置かない（途中で書くときも） |
| B22 | `popup` | 保存するシークレットと，入力欄に打つシークレットのいずれかが UTF-8 で 32 KiB を超える入力は，流さない |
| B24 | `grading-bridge` | 橋渡しが答えずに，ページのオブジェクトが投げたものか，取り消された Proxy，BigInt，循環，プリミティブに変換できない値，組み込みの型の prototype を継いだだけのオブジェクト（TypedArray の length の getter などが受けない）でエンジンが投げる例外だけを投げた求めは，問わない（その例外も数えない）．答えた提出の ID，名前，日時は，渡されたまま受ける |
| P7 | `grading-bridge` | 求めがあり，橋渡しが読む採点の要素の値が，`Array.from()` が長さまで回る値（配列でも Map でもなく，反復子を持たず，`length` が数のもの．罠が橋渡しを通す Proxy で包んだものも）で，持つ要素より大きい長さを言うなら，その入力は走らせない（2026-10-15 まで，配列もどきだけを見ていた） |
| P8 | `popup` | 表示しているコードの 1 秒の更新には，固定の仕事（16 字のシークレットで測ったもの）に加えて，表示しているシークレットが 16 字を超える分の仕事（1 字あたりの量を対象が測ったもの）を，入力の上限に加える |
| P9 | `popup` | 入力の中で QR コードを作ったことのあるシークレットの QR コードを再び作るクリックには，固定の仕事に加えて，そのシークレットで初めて作ったときに測った仕事を，入力の上限に加える |
| B27 | `sidebar` | ピン留めバーの項目のクリックで，`top-favbar.js` の `getSiteIdFromUrl()` がサイト ID をデコードして投げる URIError を数えない |
| S14 | `resources` | ページの localStorage に置かれたツリーのキャッシュの HTML のうち，tree-view.js がそのまま表に入れたものを数えない |
| P2 | `resources` | 利用者が何も操作しないうちに，拡張が以前に要求したのと同じフォルダの操作を再び要求した場合，サーバーは 404 で答える |
| B30 | `resources` | ページの localStorage のツリーのキャッシュの項目を読む `pruneCache()` が捕まえる TypeError（テキストが `null` の項目の `savedAt` の読み取りと，20 件を超えたときの並べ替えでの，数にできない `savedAt` の比較）を数えない |

S2，S8，S9 の正規表現は，以前は入力を切って避けていた（サイト情報のページを 512 バイト，KULASIS のページを 16,384 バイトで）．現在は入力を切らず，正規表現のみを線形のエンジンに移す．線形のエンジンは同じ一致を入力長に比例する時間で見つけるので，ほかの部分の遅さは，そのまま数えて判定できる．

このほか，次の境界は意図して残している（[fuzz/README.md](../fuzz/README.md) の「入力の作り方」）．

- 拡張の内部の関数を直接呼ぶ対象では，呼び出し元が渡す型を守る（`t()` の置換値は文字列）．
- runtime メッセージと chrome.storage は JSON を，ページの世界からの値はストラクチャードクローンを通す（Chrome と同じ）．
- 入力そのものと，その下の段で作る値は 4,096 単位まで．大きな値は段を上がって作り，最上段は runtime メッセージ 1 通が運べる量まで．
- 段で大きくなるのは，入力が繰り返す片（文字列，バイト列，配列の穴）だけで，一覧の件数（サイドバーの科目や提出の数）は段で増えない．件数の多い一覧の仕事量は，[tests/large.test.mjs](../tests/large.test.mjs) が次数で確かめる（課題 5,000 件，メモ 2 万件など）．

修正ブランチでのファジング（2026-10-07，直した問題を避けずに探した）:

| ブランチ | 対象 | 探した問題 | 結果 |
|---|---|---|---|
| fix/i18n-lookup | `i18n` | B10，B15（のちに B21 も） | 前半の修正では，値の中の置き場所の名前が後から置き換わる（B10 の後半）のを見つけた．直した後は 120 秒で失敗なし |
| fix/grading-ta-input | `grading-status` | B16，B18 | 60 秒で失敗なし |
| fix/invalid-memo | `assignments`，`popup` | B17 | 60 秒で失敗なし．2026-10-12 の続く修正の後は，引き継いだコーパス 370 入力と，シードからの 3 分のファジングで失敗なし．2026-10-15 の欄の型を正す修正の後は，run 38636298848 のコーパスから，`assignments` と `popup` を 3 分ずつで失敗なし |
| fix/cache-shape | `popup` | B25 | 2026-10-15，欄に文字列や数にできない値がある形について，run 38636298848 のコーパスから 3 分で失敗なし |
| fix/message-shape | `background-message` | S7 | 60 秒で失敗なし |
| fix/site-contact-regex | `site-contact` | S2 | 60 秒で失敗なし |
| fix/syllabus-parse | `syllabus-detail` | S8 | 60 秒で失敗なし |
| fix/sakai-answer-shape | `assignments` | B19 | 120 秒で失敗なし（その前に，jsdom の URL の解析の遅さで時間切れになる入力が出たので，サイドバーの href の長さに上限を設けた） |
| fix/site-contact-pages | `site-contact`，`background-message` | B20 | 各 120 秒で失敗なし |
| 13 本すべてを当てたもの | 7 対象すべて | S2，S7，S8，B10，B15〜B18，B21 | `assignments` が，科目の一覧でも B19 と同じ誤りが起きるのを見つけた（B19 に加えた）．避ける範囲を広げた後は，`assignments` を 120 秒，ほかの 6 対象を各 60 秒実行して失敗なし．入力の件数などの上限を外した後も，7 対象を各 60 秒実行して失敗なし |
| 24 本すべてを当てたもの（2026-10-08） | 7 対象すべて | S2，S6，S7，S8，S9，B10，B15〜B21 | 各 60 秒，続けて各 300 秒で失敗なし．当てると，S1 の前半と S9 が `src/auth-totp.js` で衝突したので，S9 のブランチはそこに触れないようにした（そのデコードは S1 の前半が取り除く）．その後は，24 本の 2 本ずつのどの組も，24 本を続けて取り込む 40 通りの順も衝突せず，どの順でも同じ結果になる（`git merge-tree` で確かめた）．S1 の前半が background に移したデコードに S9 の正規表現が残っていたのと，B1 の修正が読む `isLoading` を B9 の修正が消していたのも，それぞれのブランチで直した．テストは失敗 0 で，todo 62 件のうち 58 件が通る（残りは，判断を要する B14，S1 の後半，コミットを `git archive` してビルドする B5 と B6）．2026-10-12 に，B17 の続く修正も当てて流すと，失敗 0 で，todo 66 件のうち 61 件が通る（残りは同じ 4 件と，直していない P6）．2026-10-13 に B22 の修正（25 本目）も当てると，失敗 0 で，todo 68 件のうち 63 件が通る．同じ日に，上流の v1.21.1 に残る 22 本（取り込まれた 2 本と，上流が同じ修正を入れた fix/build-contents を除く）を当てると，40 通りの順のいずれでも衝突せずに同じツリーになり，失敗 0 で，todo 61 件のうち 58 件が通る（残りは B14，S1 の後半，P6） |
| fix/grading-bridge-values（2026-10-14） | `grading-bridge` | B24，P7 | 既知の入力 3 件とコーパス 144 入力が通り，120 秒（8,899 回）で失敗なし．2026-10-15 に加えた P7 の既知の入力 2 件（オブジェクトと Proxy）と，2026-10-16 に加えた B24 の既知の入力（自らを持つ提出）も通る |
| fix/long-totp-secret（2026-10-16 に確かめた） | `totp-register` | B22 | CI の実行 38743594130 と毎日のファジング 38802566900 が `totp-register` で止まった 2 入力（保留された長いシークレットを保存させる）が通る |
| fix/storage-full（2026-10-14） | `sidebar`，`submission`，`totp-register` | B23 | 既知の入力 3 件が通り，各 60 秒で失敗なし．課題パネルの B23 のテストも通る |
| fix/expand-folders-once（2026-10-14） | `resources` | P2 | 既知の入力と，P2 を見つけた入力を含む 90 入力が通り，90 秒（556 回）で失敗なし |
| fix/cache-shape（2026-10-14） | `popup` | B25 | 既知の入力を含む 157 入力が通り，90 秒（1,238 回）で失敗なし．B25 のテスト 2 件も通る |
| fix/redirect-origin（2026-10-14） | `site-contact` ほか取得を行う 5 対象 | S12 | 既知の入力を含む 71 入力が通り，5 対象を各 60 秒実行して失敗なし |
| fix/web-storage-values の続く修正（2026-10-14） | `submission`，`sidebar` | B12 | 既知の入力（提出の ID が配列でない）とシードが通る |
| fix/totp-key-once（2026-10-14） | `popup` | P8 | 150 秒（1,687 入力）で失敗なし．`tests/large.test.mjs` の P8 の 2 件が通り，テスト全体も失敗 0．ほかの修正ブランチと衝突なく合わさる（上流が v1.21.1 で自ら直した B5 と B6 の fix/build-contents は，v1.21.1 を基にしたどのブランチとも build.sh で衝突するため除く） |
| fix/qr-code-once（2026-10-20．v1.22.0 を基にした） | `popup` | P9 | `tests/totp.test.mjs` の P9 の 2 件と既知の入力，毎日のファジング 38802566900 が P9 で止まった入力が，探しても通る．テスト全体も失敗 0．上流の ESLint の警告は変わらない |
| fix/expand-folders-once の v1.22.0 の上への作り直し（2026-10-20） | `resources` | P2 | 既知の入力，シード，毎日のファジングのコーパスの 93 入力が，探しても通る（v1.22.0 では既知の入力が 29 回の求め直しで止まる）．180 秒（358 回）で失敗なし．テスト全体も失敗 0 |
| fix/redirect-origin の v1.22.0 の上への作り直し（2026-10-20） | 取得を行う 5 対象 | S12 | 既知の入力，シード，毎日のファジングのコーパスの 500 入力が，探しても通る．テスト全体も失敗 0 |
| fix/grading-list-short-rows（2026-10-14） | `grading-pages` | B26 | 既知の入力とシードとコーパスの 84 入力が通る．`tests/grading-ta.test.mjs` の B26 のテストが通り，テスト全体も失敗 0．ほかの修正ブランチと衝突なく合わさる（fix/build-contents を除く．上と同じ理由） |
| fix/validate-totp-secret の続く修正（2026-10-14） | `totp-register` | S6 | 既知の入力とシードを含む 55 入力が通る．同日に加えた更新時の移行の修正は，`tests/totp.test.mjs` の S6 のテスト（更新時の移行）が通り，ほかの 29 本と衝突なく合わさる（`git merge-tree`） |
| fix/validate-totp-secret の 2 つめの続く修正（2026-10-14） | `popup`，`totp-register` | S6 | `popup` の S6 の既知の入力 2 件と，毎日のファジング（38474299674）が `popup` で止まった入力と，`totp-register` の既知の入力が通る．`tests/totp.test.mjs` の S6 のテスト 5 件が通る．ほかの修正ブランチとは，fix/totp-code-from-background とだけ src/auth-totp.js で衝突する（上の S6 の「対応」） |
| 27 本すべて（2026-10-14） | — | — | 上の 5 本と 2 本の続く修正を含む修正ブランチ 27 本の 351 組は，どれも衝突なく合わさる（`git merge-tree`）．v1.21.1 を基にした 5 本では，テストは失敗 0 で，それぞれの問題の todo が通る |

段で判定するようにした後のファジング（2026-10-07）:

- 段の最初の規則（一度でも n log n より速く伸びた段の上で止める）では，5 つの対象が止まった．いずれも，ごく小さな仕事の増えの後の段差（繰り返しが行を閉じたとき，数の偶奇で道筋が変わったとき）だった．伸びを読むのは，コードが段の足した分をたどったときだけにし，速い伸びが 2 段続いたときに止めるようにした後は，7 対象を各 60 秒実行して失敗はなかった（時間の確かめも入れて，電源につないだ状態で）．
- 直した問題を避けずに探すと，main では S8 が検索結果で 1 秒以内に，シラバスで 3 秒で見つかり，S2 が 4 秒で見つかった．いずれも，仕事の増えが段ごとに 3.6〜3.9 倍になり，2 段続けて 2^1.5 倍を超えた．直したブランチ（fix/syllabus-parse の続く修正，fix/backtracking-regexes，fix/site-contact-regex）では，それぞれの対象を各 60 秒実行して失敗はなかった．
- S9 は，main でも 60 秒では見つからなかった．曜日と時限，フォルダの深さ，TOTP のシークレットを読む部分には，どのファズ対象も届かないためで，そこは [tests/runs.test.mjs](../tests/runs.test.mjs) が次数で確かめる．
- その後の CI では，`site-contact` と `background-message` が止まったが，どちらもファジングの側の誤りだった．応答の本文を途中で切る位置を，本文の長さまでの位置として読んでいたので，段で本文が長くなると，位置を書くバイト数が変わり，その後の読み方がずれて，段どうしが別の入力になっていた．`background-message` は「答えが返らない」として止まった．上限を超えた後は数える一歩がいずれも例外を投げるので，ハーネスが答えを送り手の realm に写す箇所で答えが失われていた．これは，同じ background で前の入力が Shift_JIS の表（最初の検索で約 16 万歩）を作り終えていたときだけ起きる．表を作る最初の段では，次の段で仕事が減るので伸びを読まないからである．切る位置は本文に対する割合として読み，どの段も provider に同じ問いをすることを，ファジングの最中とテストで確かめるようにした．答えは写しが例外を投げても届け，失敗の文言は，上限を超えたことを先に述べる．
- 直した後のファジングでは，この突き合わせが，`i18n` の対象の読み方のずれを見つけた（B15 を避ける判定を入力を読み終える前にしていたので，繰り返したキーの段では続きを読んでいた）．また `grading-status` が，拡張が要求の ID に使う乱数の長さが段ごとに違うことで止まった（同じ入力を 1 つのプロセスで 300 回流すと 1 回）．判定は入力を読み終えてからにし，拡張の `Math.random` は，入力のバイト列から作るシードで始まる乱数に替えて，同じ入力のどの段にも同じ並びを返すようにした．続いて `i18n` が，B10 の値が置換の記法として読まれることで，結果と仕事が値の長さの 3 乗まで伸びるのを見つけた（B10 に加え，避ける範囲を `t()` を呼ぶことまで広げた）．その後は，7 対象を各 60 秒実行して失敗はなかった．
- それを直した後の CI では，`syllabus-search` が，探す科目名を繰り返した入力で止まった．科目名の中で検索結果の行の名前を探す処理は，科目名が行の名前より短いうちは試す場所が無く，追い越すと 1 単位ごとに行の名前の長さだけ増える．長さの違う行が 2 つあったので，その追い越しが 2 段にまたがり，速い伸びが 2 段続いたように観測された（×16 から先は線形である）．伸びは，繰り返す部分が入力の残り以上の長さになった段から読むようにした．また `assignments` が，大きな段で時間の伸びが仕事量の伸びを 0.54 上回って止まった．手元では起きないので，CI では時間を確かめないことにした（「時計の揺れ」）．その後は，CI と同じ設定で 7 対象を各 300 秒実行して失敗はなく，canary も 4 秒で見つかった．
- 2026-10-08 の毎日のファジングは，この修正の前のコードで走り，`assignments` が CI の時間の確かめで止まった（ほかの 6 対象は各 20 分で失敗なし）．そのコーパスを現在のコードで順に流すと，2 バイトの入力が，線形のコードの上限を超えた．前の入力が課題パネルに描いたカードのリンクを，科目を探す処理（`extractCoursesFromDOM()`）が読み，その仕事がこの入力に数えられていた．カードのリンクは，課題ツールの URL が引けないと科目のページを指すので，科目へのリンクとして読まれる．課題パネルの対象は，入力の初めにパネルの内容を数えずに取り除くようにした（[tests/fuzz-history.test.mjs](../tests/fuzz-history.test.mjs)）．その後は，引き継ぐコーパスと，止まった入力と遅かった入力がすべて通る．
- 2026-10-09 から 12 日の毎日のファジングは，4 回とも `assignments` と `background-message` で止まった（ほかの 5 対象は各 20 分で失敗なし．2 回目からは，前の回に止まった 2 つの入力を流し直して止まった）．
  - `assignments` は，保存されたメモの一覧が配列でないと課題パネルの描画が止まることを見つけた（B17 に加えた）．対象は，メモをストアに置いて拡張自身の読み込み関数（`loadMemos()`）で読むようにした．それまでは，読み込み関数のすること（`|| []`）を対象の側でまねて内部の変数に入れていたので，読み込み関数での修正をファジングで確かめられなかった．
  - `background-message` は，8 バイトの入力が線形のコードの上限を超えた．Service Worker が起きてから最初の検索で作る Shift_JIS の表（P6，約 15.6 万歩）が，そのプロセスで最初に検索した入力に数えられていた．コーパスを小さい順に流すので，どの入力が止まるかは順序で決まっていた．対象は，最初の入力の前に表を作り，どの入力にも数えないようにした（「ファジングで避けている既知の問題」に P6 を加えた）．
  - この入力の失敗をテストで確かめると，対象をまとめて動かすテストのプロセスでは止まらなかった．数える場所を，プロセスで読み込んだすべてのスクリプトから数えていたので，ほかの対象の分まで上限に入っていた．上限は，対象のブラウザが読み込んだコードと，その対象の空の入力の仕事量で決めるようにした．また，上限を超えた入力の後に残った拡張の処理が拒否で終わり，次の入力やテストの失敗として数えられうるので，段の前に，前の入力が動かし始めたことを終わらせ，テストは既知の入力を 1 つずつ別のプロセスで流すようにした．
  - 修正ブランチ fix/invalid-memo を，B17 を避けずに手元で実行すると，失敗はなかったが，11 バイトの入力で 33 秒と 58 秒かかるものが出た．その後は，拡張の定期更新が最上段の巨大なサイドバーを読み直し続け，30 分を過ぎても実行が終わらなかった．jsdom がリンクの URL を読むたびに解析し直すためで，ハーネスが直近の解析結果を使い回すようにすると，この 2 つの入力は 21〜37 秒から 6〜8 秒になった（i7-1360P，電源につないで，各 2 回）．
  - その後は，次の毎日のファジングが引き継ぐコーパス（7 対象の 911 入力）を小さい順に流しても，止まった入力と遅かった入力を流しても，CI の設定ですべて通る．CI の設定で 7 対象を各 3 分実行しても失敗はなく，canary は 1 秒で見つかった．
- 2026-10-13 の毎日のファジングは，前の回に止まった 2 つの入力が通るようになって各対象を 20 分実行し，3 つの対象で止まった（ほかの 4 対象は失敗なし）．
  - `assignments` は，ハーネスの正規表現のエンジンが `RangeError: Invalid array length` で止まった．貪欲なループは 1 単位ごとに 4 つの数を戻る先として積み，最上段の 1 億字近いリンクで，配列の上限（約 1.3 億要素）を超えた．戻る先は，固定の大きさのブロックの連なりに積むようにした．数える歩数は変わらない（[tests/regexp.test.mjs](../tests/regexp.test.mjs) が 4,000 万字のリンクで確かめる）．
  - `background-message` は，6 単位の `kulms-totp-load` が線形のコードの上限を超えた．background は入力をまたいで TOTP の保存を持ち越していたので，前の入力が保存した長いシークレットの復号が，この入力に数えられていた．入力の初めに保存を空にし，入力が言うシークレット（または無し）を，拡張自身の `saveTotpSecret()` で，どの入力にも数えずに置くようにした（[tests/fuzz-history.test.mjs](../tests/fuzz-history.test.mjs)）．そのテストで，長いシークレットを保存できない B22 を見つけた．
  - `site-contact` は，段 ×2 が入力を下の段と違う順に読んで止まった．`jsonText()` は，JSON にできない数を書くたびに書き方を入力から読んでいた．値のキーが段で繰り返す文字列だと，段によってキーが重なり（"9" を繰り返すと ×2 で "99" になり，別のキー "99" と重なる），そうした数の個数が段で変わっていた．書き方は，入力から読まずに，入力のバイト列から作る乱数で選ぶようにした（[tests/fuzz-reads.test.mjs](../tests/fuzz-reads.test.mjs)）．
  - その後は，次の毎日のファジングが引き継ぐコーパス（7 対象の 1,085 入力）を小さい順に流しても，止まった入力と遅かった入力（15 件）を流しても，CI の設定ですべて通る．CI の設定で 7 対象を各 3 分実行しても失敗はなく，canary も見つかった．
- 同じ日に，上流が v1.21.1（[`20d7da3`](https://github.com/Radian0523/kulms-extension/commit/20d7da3b9193960a2a1b38f1281e2e12c8155817)）を出した．B1 と B2 の PR を取り込み，B5 と B6 を同じ形で自ら直し，教科書パネルを現在の学期の科目に絞った（[`f2cdec2`](https://github.com/Radian0523/kulms-extension/commit/f2cdec20f04a3ebdcc636a14d26aa8637101edd6)．教科書のキャッシュに学期を記録し，学期を持たないキャッシュや学期の違うキャッシュは取り直す）．submodule をこの版に進めた．
  - B1，B2，B5，B6 のテストは todo を外した．名前をキーにした教科書のキャッシュを描くテストは，学期を持たないキャッシュが使われなくなって失敗したので，現在の学期を記録したキャッシュで確かめるようにした．
  - 同じ日に手動で各対象 20 分実行したファジングのコーパス（7 対象の 737 入力）と，遅かった入力（8 件）は，v1.21.1 でも CI の設定ですべて通る．CI の設定で 7 対象を各 3 分実行しても失敗はなく，canary も見つかった．拡張の DOM XSS と ReDoS の報告は，`087452e` と同じ規則と件数のままである．

- 2026-10-13 の夜から 14 日にかけて，ページと拡張の各面を入力にする対象を 6 つ加え（`sidebar`，`resources`，`submission`，`grading-bridge`，`popup`，`totp-register`），検出器を広げ，ハーネスを Web 標準に沿わせた（「fuzz リポジトリの仕組み」）．
  - 同日の毎日のファジング（38382757101）は，課題の名前が自らの `toString` を持つオブジェクトのときに課題パネルの描画が止まることを見つけた（B19 に加えた）．この入力を避けた後は，引き継ぐコーパス（7 対象の 741 入力）と，止まった入力と遅かった入力（16 件）が，CI の設定ですべて通る．
  - `resources` の 2 回目のファジングは，12GB のメモリを使ったため止めた．ハーネスが realm ごとに結果の包みを重ねていたためであり，直した後は，同じコーパスを流してもヒープは 54MB 前後で増えない．
  - 10 対象を各 2 分実行すると，`resources` が P2 を見つけた．避けた後は，`resources` と `grading-bridge` を各 2 分実行して失敗はなかった．リダイレクトの答えを加えた後に 11 対象を各 1 分実行すると，`resources` が，jsdom の HTML パーサーの孤立したサロゲートの扱いの誤りで止まった（ハーネスで正した）．
  - ハーネスを Fetch 標準と HTML 標準のタイマーに沿わせた後に 12 対象を各 90 秒実行すると，`popup` が S6 の帰結（base32 でないシークレットの QR）を見つけた．`submission` は，段を ×262144 まで上がる入力（数えた仕事は各段で一定であり，ハーネスの時間が単位数に比例して最上段で 227 秒かかる）を流している間に，手元の実行で `--until` が与えた持ち時間を超えて止められた（毎日のファジングの持ち時間には収まる）．
  - その後，`popup` と `totp-register` を各 2 分実行して失敗はなかった．`submission` は，初期のコーパス（その遅い入力を含む）を流すのに 458 秒かかり，失敗はなかった．
  - テストと 13 対象のコーパスでカバレッジを測ると（「カバレッジ」），コーパスの入力はすべて通り，テストの失敗も 0 件であったが，`ci/coverage.sh` は失敗で終わった．B12 の todo のテストが固定の時間を待っていたためであり（「fuzz リポジトリの仕組み」のテスト），テストの固定の待ちをすべて置き換えて測り直した．
  - 測り直した結果から，`popup` の対象がタブを 1 つも開いておらず，popup の更新（LMS のタブへの求め）と QR の読み取りの経路に届いていないことが判明した（入力が読み取りの結果を言っても，使われていなかった）．ウィンドウのタブを入力に加え，ハーネスのタブを Chrome の文書のとおりに改めた．`popup` の最初の実行は，入力の文字列からタブの URL を作る対象の処理（`encodeURIComponent()`）が孤立したサロゲートで URIError を投げて止まった．これは対象の誤りであり，URL は URL パーサーで作るようにした．その後，`popup` を 3 分実行して（3,206 入力）失敗はなかった．
  - `popup` を 10 分実行すると，41 秒で，QR を 2 回作り，コードを表示したまま時間を進める 137 単位の入力が，線形のコードの上限を超えた．調べると，QR の生成（1 回に約 78 万歩）とコードの毎秒の更新は，入力の大きさによらない固定の仕事であり，それを含む小さな入力はすべて上限を超えていた．固定の仕事を測って入力の上限に加える仕組み（`allow()`）を設け，あわせて，コードの毎秒の更新がシークレットの長さに比例すること（P8）を見つけた．その後，`popup` を 8 分（5,220 入力）実行して失敗はなかった．
  - カバレッジで届いていなかった background の更新時（`runtime.onInstalled`）の移行にテストを書く際，移行が，旧版の平文のシークレットを，コードを作れないものも文字列でない値も保存することを見つけた（S6 に加え，fix/validate-totp-secret で続けて直した）．
  - これらの後，canary と 13 対象を，カバレッジを測ったコーパスから各 60 秒実行して，失敗はなかった（canary は 7 秒で見つかった）．
  - 同日の朝，`chrome.scripting.executeScript()` に渡された関数をタブのページで実行するようにハーネスを改め，`popup` の対象に前面のタブのページを加えた（「fuzz リポジトリの仕組み」）．QR の読み取りを含めて `popup` を 10 分（4,072 入力）実行して失敗はなく，popup.js の関数にはすべて届く（「カバレッジ」）．キャンバスの仕事を数えるようにした後も，`totp-register` のコーパス（53 入力）はすべて通る．
  - 同日，TA 採点支援（grading-ta.js）の採点画面と提出一覧のページを入力にする対象 `grading-pages` を加えた（「fuzz リポジトリの仕組み」）．あわせて，ハーネスは，拡張がページに入れる拡張自身のスクリプト（grading-ta.js の橋渡し）をページで実行し，スクリプトが求めるページの移動を記録するようにした．`grading-pages` は最初の 1 分で B26 を見つけた．B26 を避けた後の 10 分の実行は失敗なく終わった．その前の実行は時間の確認で止まったが，同時に動かしたテストの負荷によるものであり，その入力を単独で流すと，時間は数えた仕事量に比例して伸びた．
  - 同日の毎日のファジング（38462363590，`cef8229`）は 2 対象で失敗した．`grading-bridge` は，ページが組み込みの型の prototype を継いだだけのオブジェクトを置くと，橋渡しがエンジンの TypeError（`Method get TypedArray.prototype.length called on incompatible receiver`）で止まることを見つけた．B24 と同じ原因であり（fix/grading-bridge-values はこれも直す），B24 の回避に加えた．`submission` は，ファジングの時間の終わり近くに始めた遅い入力（466 秒）のため持ち時間を超え，止められた．`ci/fuzz.sh` は，ファジングそのものの時間を，持ち時間にその対象の最も遅い入力をもう 1 つ流す余裕が残るように短くするようにした（「fuzz リポジトリの仕組み」）．遅い入力は，最上段（数百万単位）で 1 単位あたり約 54 歩を数え，ハーネスの正規表現のエンジン（数えるために V8 とは別に 1 歩ずつ動かす）が 1 歩に約 0.5〜0.6 マイクロ秒かかるため，1 つの入力が数分に及ぶ（`submission` と `grading-pages` で測った）．
  - 同日に push した `1c51506` と `a56db05` の CI は，2 つのジョブで失敗した．`a56db05` の 1 分のファジングでは，`resources` の 16 バイトの入力が線形のコードの上限を超えた．すべての設定を有効にし，フォームの無いページに，Sakai のリンクで開くフォルダの行を 1 つ（376 文字．うち onclick が 173 文字）置くだけの入力である．上限の入力の大きさに，対象が入力から組み立てたページの大きさが入っていなかったため，線形の仕事が上限を超えた．この入力は `1c51506` のハーネスでも失敗し，この日のファジングが初めて作ったものであった．上限の入力の大きさは，入力が拡張に渡したもの（ページの HTML と，拡張が読んだ答えの本文）がより大きければ，その大きさとした（「fuzz リポジトリの仕組み」の仕事量）．同じ形の入力をシード `seeds/resources/no-form` とした．カバレッジのジョブは 2 回とも終わらなかった（「カバレッジ」）．
  - 同日の予定実行の毎日のファジング（38474299674，`cef8229`）は 4 対象で失敗した．`grading-bridge` は，前の回に止まった入力（B24）を最初に流し直して止まった．`a56db05` で避けるようにした入力であり，現在のコードでは通る．`popup` は，保存された `J`（Base32 の 1 文字）のコードを表示すると，毎秒，誰も受けない拒否が出ることを見つけた．これは S6 の帰結であり，対象は S6 の回避をこれにも広げた（既知の入力 `S6-short-secret-shown`）．修正ブランチ fix/validate-totp-secret は保存の前の検証しか直していなかったので，保存済みのシークレットにも備える続く修正を加えた（S6）．`sidebar` と `submission` は，コーパスの再生だけで持ち時間（34 分と 38 分）を使い切り，止められた．最上段まで上がる入力を含むコーパスは再生に時間がかかり，どのコーパスがそうなるかは日によって変わる．毎日のファジングは，対象ごとにジョブを分け，各対象がジョブの時間をまるごと使えるようにした（下の CI）．
  - 同日に push した `0c893e9` の CI はすべて通った．カバレッジのジョブは 53 分で終わった．`submission` の重い入力を含む組だけがメモリを使い切り，最後に単独で流し直されて通った．流しきれなかった入力は無かった．`sidebar` の重い入力は，数えながら単独で流すと 32 分 39 秒かかり（一部は別の測定と並行），最大の常駐メモリは 3.9 GiB であった．
- 2026-10-15 の毎日のファジング（38636298848，`3bd3efa`）は，`popup` と `assignments` で止まった．どちらも，保存された値の欄に文字列にも数にもできない値（JSON が返す，自身の `toString` を持つオブジェクト）がある形であり，B25 と B17 の回避を，止まる欄に限って広げた（B17，B25）．
  - 同じ日に手動で始めた各対象 20 分のファジング（38718496528，`0429d3b`）では，`grading-bridge` のジョブが，ファジングを始めて約 8 分後に，runner の停止（"The runner has received a shutdown signal"．終了コード 143）で終わった．ファジングの出力は一時ファイルに書いていたためログには何も残らず，見つけたものを保存するステップも動かなかった．GitHub は資源の尽きた runner を止めるが，その計測は公開されない [[RunnerShutdown]](#参考文献) ため，原因の入力は特定できない．それまでの 2 回の実行では，このジョブの最大の常駐メモリは 2.5〜2.8 GB であった．
  - この回が引き継いだコーパス（99 入力）は，CI の設定で 6.3 秒，最大の常駐メモリ 790 MB で通る．同じコーパスから，CI の設定で 20 分（60,430 回）ファジングしても失敗はなく，最大の常駐メモリは 2.6 GB であった（手元では，ヒープを 4 GB，常駐メモリを 6 GB に限った）．
  - 調べる中で，P7 の回避の抜けを見つけた．回避は配列もどきだけを見ていたが，`length` が数のオブジェクトも，それを包む Proxy も，橋渡しを長さまで回す．Proxy の長さはハーネスが前もって読まないため，ループを走る前に止められず，長さ 2^31 では V8 がプロセスごと終わる（P7）．ただし，そうして終わったプロセスの入力は libFuzzer が失敗として残すので，runner を止めた原因とは言えない．回避は，橋渡しが実際に読む採点の要素と，長さまで回る値に限って広げ，既知の入力を 2 件加えた．
  - 限度に達する前にマシンのメモリが尽きないよう，プロセスが持てるメモリを，マシンの全メモリではなく使える量から定めた．あわせて，ファジングの出力をその場でログに流し，1 分ごとにメモリの使用量を書くようにした（「fuzz リポジトリの仕組み」の CI）．
- 2026-10-15 に push した `c1497f8`（プロセスが持てるメモリと出力の扱いを改めた版）の CI（38743594130）は，各対象 1 分のファジングで `site-contact` と `totp-register` で止まり，同じ版の毎日のファジング（38802566900）は，`popup`，`totp-register`，`grading-bridge` で止まった．出力をその場でログに流すようにしたので，いずれもログから原因を読めた．
  - `grading-bridge` は，対象のプロセスが 13,185 MB を使ったところで，libFuzzer が限度（12,903 MB）で止め，入力を残した．runner は止められず，見つけたものも保存された．入力は，`submissionId` が自らである提出であった．V8 の `JSON.stringify()` の速い道は循環を 20 万回ごとにしか調べないので，橋渡しが渡した値を，段で長くなる文字列ごと書き出し続けていた（B24）．ハーネスはその速い道を使わないようにした（「fuzz リポジトリの仕組み」の仕事量）．10 月 15 日に runner ごと止められた実行（38718496528）も，同じ形の入力によるとみられる．
  - `site-contact` は，サーバーの pages.json の `placementId` が `length` を持つオブジェクトのとき，`encodeURIComponent()` の仕事を，そのオブジェクトの `length`（2^53）で数えていた．ハーネスの数え方の誤りであり，文字列を受ける組み込み関数と Web API は，仕様が引数から作る文字列の長さで数えるようにした（同上）．
  - `totp-register` は，ページの sessionStorage に保留された長いシークレットを登録補助が background に保存させ，`encryptSecret()` が B22 の RangeError を受けた．この対象には B22 の回避が無かったので，加えた．
  - `popup` は，数百字のシークレットの QR コードを 7 回表示する入力で，線形のコードの上限を超えた．popup は表示のたびに QR コードを作り直す（P9 として載せた）．
- 2026-10-16 に push した `205e6c5` の CI（38916378946）は通った．同じ版の毎日のファジング（38959386385）は，`grading-pages` と `sidebar` で止まった．その後の 3 回（39063563307，39159694668，39329795043）は，前の回に止まった入力がなお止まるため，この 2 対象をファジングせずに止まった．
  - `grading-pages` は，対象がページの役で sessionStorage に書く状態の文字列が，段で長くなって保存領域の上限（500 万コード単位）を超え，その書き込みが QuotaExceededError を投げた．拡張ではなく対象の誤りであり，ほかの対象と同じく，保存領域に入らない値は書かないようにした（ブラウザも書かない）．
  - `sidebar` は，上部のピン留めバーが，サイト ID に壊れた `%` の並びがある科目のクリックで投げる URIError を見つけた（B27 として載せ，回避と既知の入力を加えた）．
- 2026-10-20 に push した `a44a157`（サブモジュールを v1.22.0 に進めた版）の CI（39404471638）と `f7d247b`（検出器を広げた版）の CI（39437098916）は，各対象 1 分のファジングで `resources` が止まった（49 秒で 763 回と，19 秒で 202 回）．`f7d247b` の毎日のファジング（39495354410）も，`resources` が 505 秒（1,433 回）で止まり，ほかの 13 対象は各 20 分で失敗なしであった．
  - 3 回とも，ページの localStorage のツリーのキャッシュに，テキストが `null` の項目があり，`pruneCache()` が TypeError を受けて捕まえた（B30 として載せた）．調べる中で，項目が 20 件を超え，数にできない `savedAt` の項目があるときにも，並べ替えで TypeError を受けて捕まえることを確かめた．回避は両方を数えないようにし，既知の入力を 1 件ずつ加えた．回避の後は，`f7d247b` の CI と毎日のファジングが残した入力が通り，毎日のファジングのコーパス（109 入力）から `resources` を 180 秒（413 回）回して失敗はなかった．
  - 同じ毎日のファジングでは，`sidebar` のジョブが 96 分かかった（10 月 15 日は 53 分）．コーパスにあった 543 バイトの入力 1 件に 778 秒かかり，ファジングの間もこの入力から変えた入力が続いたため，20 分のはずのファジングが 81 分（1,149 回）続いた．libFuzzer は，時間を入力の合間にしか確かめない．
  - 手元で（電源につなぎ，性能モードで，ほかに負荷の無い状態．以下同じ），この入力は，検出器を広げる前の版（`5ce6338`）で 514.7 秒，広げた版で 497.7 秒かかった（各 1 回）．遅さは検出器によるものではない．CPU プロファイルでは，518 秒のうち 213 秒を，ハーネス自身の，拡張がページに入れるスクリプトを探す処理（加わった節点ごとの `querySelectorAll("script")`）が使っていた．jsdom のセレクタのエンジンは，問い合わせの起点の節点とその上の各節点の `host` を読み，リンク（`<a>`，`<area>`）ではその getter がリンクの URL を解析し直すので，長い href のリンクが加わるたびに，その URL を解析していた．数えない処理なので判定には響かないが，時間を使う．残りの大半は，拡張の `isCourseLink()` がリンクの href を読み，正規表現を掛ける処理であり，数えるための正規表現のエンジン（`harness/backtrack.mjs`）が 253 秒を使っていた．
  - ハーネスは，ページに加わった節点の下のスクリプトと style 属性を，セレクタではなく名前で探すようにした（HTML 標準がスクリプトとして準備する HTML の名前空間の `script` 要素と，名前空間の無い `style` 属性）．この入力は 291.7 秒になり（1 回），同じ回の遅い入力 3 件は，交互に 3 回ずつ測った時間の中央値で，29.83 秒が 4.52 秒に，18.78 秒が 2.83 秒に，9.80 秒が 9.14 秒になった．
  - あわせて，innerHTML を書いたとき，書いた要素自身の style 属性まで，マークアップが付けたものとして記録していたのを直した．innerHTML は要素に子を与えるが，要素自身の属性は変えない．CSSOM で style を付けた要素の innerHTML を拡張が書くと，その style が CSP に拒まれるものとして誤って報告されていた（テストで確かめた．これまでの CI と毎日のファジングでは報告されていない）．
  - これらの後，同じ毎日のファジングのコーパスと残した入力で確かめた．canary は埋めたバグを 7 秒で見つけた．ページを開く対象のうち 8 つ（`background-message`，`grading-bridge`，`grading-pages`，`grading-status`，`i18n`，`popup`，`resources`，`sidebar`）と `assignments` は，`ci/fuzz.sh` で各 60 秒回し，失敗はなかった．残りのうち `totp-register` の 66 入力と，`submission` の 73 入力のうち 72 入力は，時間の判定を外して再生し，すべて通った．`submission` の残る 1 入力は，手元のメモリの限度を超えるので（約 5.9 GB），push の後の CI に任せた．ページを開かない `site-contact`，`syllabus-detail`，`syllabus-search` は，今回の変更が効かないので流していない．
- 2026-10-21 に push した `4a955bf` の CI（39542791729）は通った．同じ版で手動で始めた各対象 20 分のファジング（39563165870）は，`resources` が 517 秒（1,109 回）で止まり，ほかの 13 対象は失敗なしであった．
  - `resources` は，サーバーの答えにあるフォルダのリンクの onclick に孤立したサロゲートがある入力で，そのマークアップを拡張のものとして数えた．対象の誤りである．ハーネスのネットワークは文字列の本文を UTF-8 で送るので（TextEncoder），孤立したサロゲートは U+FFFD になり，tree-view.js が `res.text()` で読んでページに入れるのも U+FFFD のほうである．対象は，ページ自身のマークアップの集合を元の文字列から作っていたので，一致しなかった．対象は，答えの本文を UTF-8 にして読み直したものから，その集合を作るようにした．
  - 検出器の報告は，値の先頭 80 字とハッシュで値を区別するが，ハッシュを UTF-8 から取っていたので，孤立したサロゲートと U+FFFD の違いが先頭 80 字より後ろにあると，違う値を同じものとみなしていた（今回の入力では違いが先頭 80 字の中にあり，一致しなかった）．拡張がページのハンドラーの値をそう書き換えても見落とすので，ハッシュを UTF-16 の符号単位から取るようにした．
  - サーバーの答えに孤立したサロゲートがある形をシードに加えた（`seeds/resources/answer-lone-surrogate`）．直す前の対象は，直した検出器のもとで，このシードと 39563165870 の入力で止まる．
  - `sidebar` のジョブは 77 分かかった．前の回が遅いとして残した 543 バイトの入力の再生に 32 分かかったが（手元では 292 秒），このジョブの runner は，canary を回す速さが毎日の実行（39495354410）の runner の約 4 分の 1 であった（毎秒約 1.4 万回と約 5.8 万回）．runner の遅さによるものとみられる．

## カバレッジ

2026-10-13 に，v1.21.1 で初めて測った．テストと，その日のファジングのコーパスとシード（7 対象の 749 入力）を流すと，拡張自身のコードのうち，文の 51.7%，分岐の 42.3%，関数の 54.5% に届いた．テストだけでは文の 48.9%，コーパスだけでは 31.5% であった．ほとんど届かなかったのは，ページの DOM を整える content script，提出の検知，TOTP の登録補助，TA 採点支援，popup であり，いずれも，それを入口にするファズ対象が無かった．

2026-10-14 に，それらを入口にする 6 つの対象を加え（「fuzz リポジトリの仕組み」），届いていなかった関数のテスト（[tests/panel.test.mjs](../tests/panel.test.mjs) の課題パネルの関数と，[tests/totp.test.mjs](../tests/totp.test.mjs) の background の更新時と起動時の処理）を加えて，測り直した．テスト（270 件）と，14 対象のコーパスとシード（1,908 入力．同日のファジングで育てたもの）を流すと，文の 85.7%（4,591/5,354），分岐の 75.0%（2,290/3,053），関数の 89.7%（619/690）に届く．テストだけでは文の 76.4%，コーパスだけでは 66.4% である（テストは各対象のシードと既知の入力も流す）．次の表は，文がテスト，コーパス，その両方で届く割合と，両方で届く分岐と関数の割合で，届く割合の低い順に並べた．

| スクリプト | テスト | コーパス | 合わせて | 分岐 | 関数 |
|---|---:|---:|---:|---:|---:|
| `src/settings.js` | 50.6% | 50.6% | 50.6% | 66.0% | 68.8% |
| `src/submit-detect.js` | 66.7% | 72.9% | 72.9% | 67.4% | 100.0% |
| `src/tree-view.js` | 65.7% | 76.8% | 77.3% | 62.1% | 91.7% |
| `src/auth-totp-register.js` | 75.3% | 78.5% | 78.5% | 62.8% | 100.0% |
| `src/textbooks.js` | 81.0% | 4.5% | 81.0% | 63.7% | 94.7% |
| `src/assignments.js` | 81.0% | 44.8% | 83.1% | 68.5% | 80.9% |
| `src/grading-ta.js` | 70.6% | 83.4% | 83.4% | 73.2% | 90.6% |
| `src/sidebar-resize.js` | 86.4% | 84.7% | 86.4% | 62.5% | 100.0% |
| `src/course-name.js` | 81.7% | 88.9% | 88.9% | 83.3% | 100.0% |
| `src/top-favbar.js` | 74.0% | 89.9% | 89.9% | 79.0% | 100.0% |
| `src/course-click.js` | 40.0% | 90.0% | 90.0% | 83.3% | 100.0% |
| `background.js` | 84.3% | 90.2% | 93.4% | 90.5% | 88.5% |
| `src/auth-totp.js` | 94.3% | 0.0% | 94.3% | 80.0% | 85.7% |
| `popup.js` | 68.0% | 94.3% | 95.2% | 91.6% | 100.0% |
| `src/tool-visibility.js` | 83.9% | 96.4% | 96.4% | 88.5% | 100.0% |
| `src/file-drop.js` | 74.3% | 97.3% | 97.3% | 85.7% | 100.0% |
| `src/grading-ta-page.js` | 72.7% | 97.7% | 97.7% | 98.1% | 100.0% |

- `src/grading-ta.js`（TA 採点支援の本体）には，当初は文の 17.5%，関数の 22/106 にしか届かなかった．Sakai の採点画面と提出一覧の DOM を読む関数に，それを入口にする対象もテストも無かったためである．それらを入力にする対象 `grading-pages` を加えた後は，文の 83.4%，関数の 96/106 に届く（同日．「fuzz リポジトリの仕組み」）．届かない関数は，橋渡しの読み込みの失敗と例外の処理，前の未採点へのジャンプ，返却と保存のボタンによる状態の保存，未保存のまま移動する前の確認の一部である．今最も届かないのは `src/settings.js`（文の 50.6%）である．
- `popup.js` のうち，QR の読み取りでページに入れる関数（`scanPageForQR`，`extractSecret`，`tryDecodeImageData`）には，当初は届かなかった．ハーネスが `chrome.scripting.executeScript()` に渡された関数を実行せず，テストや対象の言う結果を返していたためである．Chrome は，渡された関数を直列化してタブのページで実行する [[ChromeScripting]](#参考文献)．ハーネスもそのとおりに実行するようにし，そのカバレッジを popup.js の元の位置に数えるようにしたので，popup.js の関数にはすべて届く（同日に改めた．「fuzz リポジトリの仕組み」）．
- `src/settings.js` の届かない関数は，読み込みを止めたまま待つ Promise（L8），拡張の更新後に再読み込みを促すバナー（L17〜L34），メッセージの上書きの読み込みの失敗（L132）である．`background.js` の届かない関数は，IndexedDB の要求とトランザクションの失敗の処理（L572〜L617）であり，ハーネスの IndexedDB は失敗しない．
- `src/assignments.js` の `isGraded`，`getStatusBadgeClass`，`getStatusLabel` は，どこからも呼ばれない（M5）．
- `src/textbooks.js` と `src/auth-totp.js` には，テストでのみ届く（コーパスでは 4.5% と 0.0%）．教科書のパネルと，ログインページの自動入力を入口にする対象は無い．
- 測る過程で，テストの固定の待ち（「fuzz リポジトリの仕組み」のテスト），`popup` の対象がタブを開いていないこと，QR の生成とコードの毎秒の更新という固定の仕事の扱い（同じく仕事量），更新時の移行の S6 と，コードの表示の P8 が判明した．また，カバレッジを測る再生は，対象がページを入力ごとに開くと，コーパスが大きくなるにつれてメモリが尽きた（V8 は，数えている間，コンパイルしたスクリプトをその数とともに保つ．`popup` の 405 入力で 4 GB を超えた）．`ci/coverage.sh` は，コーパスを 100 入力ずつ別のプロセスで再生し，その数を合わせるようにした．
- 2026-10-14 の CI では，カバレッジのジョブが 2 回続けて終わらなかった．1 回目（38495804127）は，`submission` のコーパスの 100 入力を再生するプロセスが，段を ×262144 まで上がる入力でヒープ（4 GB）を使い切って止まった．2 回目（38504368910）は，60 分のうち 38 分を `sidebar` のコーパスに使い，`submission` の再生の途中でジョブの時間の上限に達した．`sidebar` の 210 入力は，数えずに流すと手元で 625 秒かかり，そのうち 520 秒を，最上段まで上がる 1 つの入力が占めた（543 バイト．1 単位に約 1,160 歩を使い，仕事も時間も段ごとに 2 倍になるので線形である）．数えながら流すと，その入力は約 3 倍遅くなる．`ci/coverage.sh` は，入力を 10 ずつの組に分け，すべての対象の組を並べて流すようにした．並べる数は，機械のプロセッサの数と，メモリ 4 GiB ごとの数のうち少ない方である．各組のヒープは，メモリの 4 分の 3 を並ぶ組で分けたものとする．メモリを使い切った組は，ほかの組の後に 1 つずつ，メモリのすべてをヒープとして流し直す（`ci/fuzz.sh` がファジングするときと同じ）．`submission` のその入力は，数えずに流してもヒープを 4 GB より多く使う．それでもメモリが尽きれば，流しきれなかった入力の名前を挙げるが，失敗とはしない．メモリで判定するのはファジングだからである．また，ジョブの上限を 120 分とし，ジョブが初めに記す時刻（開始から 110 分）を過ぎたら新しい組を始めず，その時刻にまだ流している組は止める．流しきれなかった入力は名前を挙げるが，失敗とはしない．毎日のファジングは，引き継ぐコーパスをファジングの前に流すからである．止めた組も，それまでに流した入力について数えたものを書き残す．`fuzz/replay.mjs` は，SIGTERM を受けると，最後まで流したときと同じく終了するからである．

## 進める順序

1. **fuzz リポジトリの土台**（済み）: submodule（kulms-extension の fork），ハーネス，テスト，ファズ対象，`ci.yml`，`fuzz.yml`．
2. **修正と上流への PR**: データ消失（B1，B2．v1.21.1 で取り込まれた）→ セキュリティ（S1〜S8）→ 不具合 → 負荷（P1〜P6）の順に直す．修正には，このリポジトリの回帰テストを付ける．
3. **挙動が変わるもの**（S1 の表示場所，P1 の取得間隔とリクエスト数，B2 の仕様，P2 の API）は，先に上流で Issue を立てる．
4. **Chrome の `JSON.stringify()` の速い道の仕事を数える**: ハーネスは V8 の速い道を使わず，規格の手順だけを数えている（「fuzz リポジトリの仕組み」の仕事量）．速い道は循環をループの 20 万回ごとにしか調べず，その間，循環する値を書き出し続ける [[V8JSON]](#参考文献)．そのため，循環する値では，数えた仕事は Chrome の上限にならない（B24）．速い道を使う呼び出し（replacer も gap も無いもの）に循環する値が渡されたとき，循環を見つけるまでに速い道が書き出す分を，その呼び出しの仕事に加える．

## このリポジトリの方針

- kulms-extension は fork（[yumasansansan/kulms-extension](https://github.com/yumasansansan/kulms-extension)）を submodule `kulms-extension/` として持つ．修正はこの fork のブランチで行い，上流（[Radian0523/kulms-extension](https://github.com/Radian0523/kulms-extension)）へ PR を出す．
- このリポジトリのパッケージ管理は pnpm で，Node も pnpm も最新版を使う（2026-10-06 の検証は Windows 11 で Node 26.10.0 と pnpm 12.9.1，2026-10-12 の検証は Ubuntu 26.04 で Node 26.11.1 と pnpm 12.11.2，2026-10-20 の検証は Ubuntu 26.10 で Node 26.12.0 と pnpm 12.14.0）．pnpm の版は `package.json` で固定しない（`packageManager` を書かない）．上流は bun を使うが，このリポジトリでは不要．
- このリポジトリのファイルは GPL-3.0-or-later とし，ADLplug-Next と同じ形の SPDX ヘッダを各ファイルの先頭に付ける．コメントを書けないファイルは `REUSE.toml` で指定し，REUSE 仕様 [[REUSE]](#参考文献) に適合させる（CI で `reuse lint` を掛ける）．submodule の kulms-extension は上流の MIT のまま．

## 参考文献

本文中の [ ] は次の文献を指す．Web の標準と文書は，いずれも 2026-10-14 に参照した版による．

- [AMOPromote] Mozilla, "Promoting your extension or theme," Firefox Extension Workshop. https://extensionworkshop.com/documentation/publish/promoting-your-extension/
- [AppStoreMarketing] Apple, "App Store Marketing Guidelines." https://developer.apple.com/app-store/marketing/guidelines/
- [AVIF] Alliance for Open Media, "AV1 Image File Format (AVIF)." https://aomediacodec.github.io/av1-avif/
- [ChromeActiveTab] Google, "The 'activeTab' permission," Chrome for Developers. https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- [ChromeContentScripts] Google, "Content scripts," Chrome for Developers（manifest の `content_scripts` と `world`）. https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- [ChromeNetwork] Google, "Cross-origin network requests," Chrome for Developers. https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- [ChromeScripting] Google, "chrome.scripting," Chrome for Developers. https://developer.chrome.com/docs/extensions/reference/api/scripting
- [ChromeStorage] Google, "chrome.storage," Chrome for Developers. https://developer.chrome.com/docs/extensions/reference/api/storage
- [ChromeTabs] Google, "chrome.tabs," Chrome for Developers（`tabs.query()` と `tabs.Tab`）. https://developer.chrome.com/docs/extensions/reference/api/tabs
- [CSP3] W3C, "Content Security Policy Level 3," Working Draft. https://www.w3.org/TR/CSP3/
- [CWSBranding] Google, "Branding guidelines," Chrome Web Store, Chrome for Developers. https://developer.chrome.com/docs/webstore/branding
- [DOM] WHATWG, "DOM Standard," Living Standard. https://dom.spec.whatwg.org/
- [ECMA-262] Ecma International, "ECMAScript Language Specification," ECMA-262. https://tc39.es/ecma262/
- [Fetch] WHATWG, "Fetch Standard," Living Standard（§2.2.5 の redirect-taint と要求のオリジンの直列化，§4.4 HTTP fetch，§4.5 HTTP-redirect fetch，§4.10 CORS check）. https://fetch.spec.whatwg.org/
- [FirefoxCICP] Mozilla, "gfx/thebes/gfxUtils.cpp," Firefox（`gfxUtils::CicpToColorSpace`：行列係数が未指定のとき，原色から行列を推し量る）. https://github.com/mozilla-firefox/firefox/blob/main/gfx/thebes/gfxUtils.cpp
- [GitHubActionsEvents] GitHub, "Events that trigger workflows," GitHub Docs（フォークからの pull_request では，GITHUB_TOKEN は読み取りの権限のみを持つ）. https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- [GooglePlayBadges] Google, "Google Play badges." https://play.google.com/intl/en_us/badges/
- [H273] ITU-T, "Coding-independent code points for video signal type identification," Recommendation H.273. https://www.itu.int/rec/T-REC-H.273
- [HSTSPreloadChromium] Chromium, "net/http/transport_security_state_static.json." https://github.com/chromium/chromium/blob/main/net/http/transport_security_state_static.json
- [HSTSPreloadFirefox] Mozilla, "security/manager/ssl/nsSTSPreloadList.inc," Firefox. https://github.com/mozilla-firefox/firefox/blob/main/security/manager/ssl/nsSTSPreloadList.inc
- [HTML] WHATWG, "HTML Standard," Living Standard（§3.2.7 The innerText and outerText properties，§4.2.5.3 Pragma directives，§4.6.3 API for hyperlink elements，§4.12.1 The script element，§4.12.5 The canvas element，§7.2.4 The Location interface，§7.6 Speculative loading，§8.7 Timers，§12 Web storage，§13.2.3.5 Preprocessing the input stream）. https://html.spec.whatwg.org/
- [istanbul] istanbul.js. https://istanbul.js.org/
- [Jazzer.js] Code Intelligence, "Jazzer.js." https://github.com/CodeIntelligenceTesting/jazzer.js
- [libFuzzer] LLVM Project, "libFuzzer – a library for coverage-guided fuzz testing." https://llvm.org/docs/LibFuzzer.html
- [MDN-getSecurityInfo] MDN Web Docs, "webRequest.getSecurityInfo()." https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/getSecurityInfo
- [MixedContent] W3C, "Mixed Content." https://www.w3.org/TR/mixed-content/
- [NodeCoverage] OpenJS Foundation, "Command-line API: NODE_V8_COVERAGE=dir," Node.js Documentation. https://nodejs.org/api/cli.html#node_v8_coveragedir
- [NodeTest] OpenJS Foundation, "Test runner: Extraneous asynchronous activity," Node.js Documentation（v26.11.1）. https://nodejs.org/api/test.html#extraneous-asynchronous-activity
- [OWASP-Clickjacking] OWASP, "Clickjacking Defense Cheat Sheet," OWASP Cheat Sheet Series. https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html
- [ProcMeminfo] Linux man-pages project, "proc_meminfo(5)"（MemAvailable：スワップせずに新しい割り当てに渡せるメモリの見積もり）. https://man7.org/linux/man-pages/man5/proc_meminfo.5.html
- [recheck] TSUYUSATO Kitsune, "recheck." https://makenowjust-labs.github.io/recheck/
- [ReferrerPolicy] W3C, "Referrer Policy," Candidate Recommendation Draft（meta 要素による指定）. https://www.w3.org/TR/referrer-policy/
- [REUSE] Free Software Foundation Europe, "REUSE Specification." https://reuse.software/spec/
- [RFC4226] D. M'Raihi et al., "HOTP: An HMAC-Based One-Time Password Algorithm," RFC 4226, 2005. https://www.rfc-editor.org/rfc/rfc4226
- [RFC6194] T. Polk et al., "Security Considerations for the SHA-0 and SHA-1 Message-Digest Algorithms," RFC 6194, 2011（§3.3，§4）. https://www.rfc-editor.org/rfc/rfc6194
- [RFC6238] D. M'Raihi et al., "TOTP: Time-Based One-Time Password Algorithm," RFC 6238, 2011. https://www.rfc-editor.org/rfc/rfc6238
- [RFC8446] E. Rescorla, "The Transport Layer Security (TLS) Protocol Version 1.3," RFC 8446, 2018. https://www.rfc-editor.org/rfc/rfc8446
- [RunnerImages] GitHub, "images/ubuntu/scripts/build/install-swift.sh," actions/runner-images（Ubuntu 26.04 の `/tmp` はメモリ上の tmpfs）. https://github.com/actions/runner-images/blob/e7c7cb8f4227797c6404a4e98c2ad463c2f70f91/images/ubuntu/scripts/build/install-swift.sh#L27-L29
- [RunnerShutdown] GitHub, "The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled," actions/runner-images, Discussion #8640（GitHub のホストする runner でこの停止が起きた例は，どれも資源（メモリか CPU）が尽きたためで，その計測は利用者に公開されない，との回答）. https://github.com/actions/runner-images/discussions/8640
- [SakaiCharonPortal] Apereo Foundation, "portal/portal-impl/impl/src/java/org/sakaiproject/portal/charon/SkinnableCharonPortal.java," Sakai（includeTool：リセットを求められたツールの，利用者のセッションに置いた状態を ts.clearAttributes() で消す．master の 38dc517 で読んだ）. https://github.com/sakaiproject/sakai/blob/38dc5174b0563fb9e9cc7af96874f48982d87fdf/portal/portal-impl/impl/src/java/org/sakaiproject/portal/charon/SkinnableCharonPortal.java#L607-L614
- [SakaiPresence] Apereo Foundation, "presence/presence-impl/impl/src/java/org/sakaiproject/presence/impl/BasePresenceService.java," Sakai（setPresence：その場所にまだ在席していなければ在席を記録し，pres.begin の事象を出す．master の 38dc517 で読んだ）. https://github.com/sakaiproject/sakai/blob/38dc5174b0563fb9e9cc7af96874f48982d87fdf/presence/presence-impl/impl/src/java/org/sakaiproject/presence/impl/BasePresenceService.java#L287-L303
- [SakaiSiteHandler] Apereo Foundation, "portal/portal-impl/impl/src/java/org/sakaiproject/portal/charon/handlers/SiteHandler.java," Sakai（243〜259 行：tool-reset の URL にリセットの印を付けてツールの URL へ転送する．624〜630 行：サイトのページを描くとき，既定で在席を記録する．master の 38dc517 で読んだ）. https://github.com/sakaiproject/sakai/blob/38dc5174b0563fb9e9cc7af96874f48982d87fdf/portal/portal-impl/impl/src/java/org/sakaiproject/portal/charon/handlers/SiteHandler.java
- [SakaiStats] Apereo Foundation, "sitestats/sitestats-api/src/java/org/sakaiproject/sitestats/api/StatsManager.java," Sakai（SITEVISIT_EVENTID：サイト訪問として数える事象は pres.begin．master の 38dc517 で読んだ）. https://github.com/sakaiproject/sakai/blob/38dc5174b0563fb9e9cc7af96874f48982d87fdf/sitestats/sitestats-api/src/java/org/sakaiproject/sitestats/api/StatsManager.java#L39
- [Sanitizer] WICG, "HTML Sanitizer API," Draft Community Group Report. https://wicg.github.io/sanitizer-api/
- [Selectors] W3C, "Selectors Level 4," Working Draft（§8.3 ID selectors）. https://www.w3.org/TR/selectors-4/
- [SRI] W3C, "Subresource Integrity," W3C Recommendation. https://www.w3.org/TR/SRI/
- [Storage] WHATWG, "Storage Standard," Living Standard（§4.1 Storage endpoints）. https://storage.spec.whatwg.org/
- [TT] W3C, "Trusted Types," Editor's Draft. https://w3c.github.io/trusted-types/dist/spec/
- [URL] WHATWG, "URL Standard," Living Standard. https://url.spec.whatwg.org/
- [URLPattern] WHATWG, "URL Pattern Standard," Living Standard. https://urlpattern.spec.whatwg.org/
- [V8JSON] V8 project, "src/json/json-stringifier.cc," V8（JSON.stringify の速い道 FastJsonStringifier：replacer と gap が無いときに使い（CanUseFastStringifier），循環はループの 200,000 回（kGlobalInterruptBudget）ごとの CheckCycle() でのみ調べる．2026-10-15 の版で読み，Node 26（V8 14.6）と Edge 155 で振る舞いを確かめた）. https://github.com/v8/v8/blob/3abab2c215e57bfb7704930dc89c019d842641f6/src/json/json-stringifier.cc#L3348-L3386
- [WCAG22] W3C, "Web Content Accessibility Guidelines (WCAG) 2.2," W3C Recommendation（達成基準 1.4.3 Contrast (Minimum)）. https://www.w3.org/TR/WCAG22/
- [WebCrypto] W3C, "Web Cryptography Level 2," Editor's Draft（§31.6.4 HMAC の Import Key：鍵のデータの長さが 0 ビットなら DataError を投げる）. https://w3c.github.io/webcrypto/
- [WebIDL] WHATWG, "Web IDL Standard," Living Standard（反復可能なインターフェースの forEach，keys，values，entries）. https://webidl.spec.whatwg.org/
