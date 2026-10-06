<!--
SPDX-FileCopyrightText: 2026 Yuma Kakei <yumasansansan@gmail.com>
SPDX-License-Identifier: GPL-3.0-or-later

This file is part of kulms-extension-fuzz. The SPDX lines name its copyright
holder and its license, in the machine-readable form of the REUSE
specification: the GNU General Public License, version 3 or any later version
(LICENSES/GPL-3.0-or-later.txt).
-->

# KULMS+ 拡張機能 レビューの記録

- **対象**: [Radian0523/kulms-extension](https://github.com/Radian0523/kulms-extension) の [`087452e`](https://github.com/Radian0523/kulms-extension/commit/087452e33d14c117e6fa584fe3dd4b19f8f9a76c)（v1.21.0 と提出検知の修正）
- **日付**: 2026-10-06
- **方法**: 全ソースを通読した．そのうえで，実コードを Node 26.10.0 と jsdom 30.1.2 の上で動かして確かめた．その後，拡張を Node の上で動かすハーネス（[harness/](../harness/)）を作り，確かめたことをテスト（[tests/](../tests/)）にした．また，Jazzer.js でファジング（[fuzz/](../fuzz/)）を行い，B15 と B16 を見つけた
- 行番号は上記コミット時点のもの．リンクはそのコミットへの固定リンク

## 凡例

- **重さ**: 高（利用者のデータが消える，広く効く）／中／低
- **確認**: 再現（tests/ のテストで再現した）／計測（時間を測った）／ビルド（build.sh を実行した）／ファズ（ファジングで見つかった）／読解（コードを読んで判断した）
- **状態**: 未着手／対応中／修正済（PR へのリンクを書く）．修正したら，tests/ の該当テストから `todo` を外し，ID を `fuzz/open-findings.mjs` から外す

## 一覧

| ID | 重さ | 件名 | 確認 | 状態 | 上流 Issue |
|---|---|---|---|---|---|
| [S1](#s1) | 中 | TOTP の平文シークレットが content script と LMS の DOM に渡る | 再現 | 未着手 | |
| [S2](#s2) | 中 | サイト連絡先の正規表現が入力長の 3 乗で遅くなる（ReDoS） | 再現・計測 | 未着手 | |
| [S3](#s3) | 低 | TOTP 登録補助がシークレットをページの sessionStorage に置く | 読解 | 未着手 | |
| [S4](#s4) | 低 | シラバスの実体参照を二重にデコードし，数値参照は捨てる | 再現 | 未着手 | |
| [S5](#s5) | 低 | 使っていないホスト権限 `radian0523.github.io` | 読解 | 未着手 | |
| [S6](#s6) | 低 | 不正な TOTP シークレットを保存できる | 再現 | 未着手 | |
| [S7](#s7) | 低 | 形の崩れたメッセージで onMessage リスナーが例外を投げる | 再現 | 未着手 | |
| [S8](#s8) | 低 | シラバス解析の正規表現が入力長の 2 乗で遅くなる | 再現・計測 | 未着手 | |
| [B1](#b1) | **高** | 複数タブを開いていると，メモ・完了チェック・非表示が消える | 再現 | 未着手 | |
| [B2](#b2) | 中 | 非表示にした課題が 30 日後に一覧へ戻る | 再現 | 未着手 | [#74](https://github.com/Radian0523/kulms-extension/issues/74) |
| [B3](#b3) | 中 | サイドバーの色分けで，期限切れが最も弱く扱われる | 再現 | 未着手 | |
| [B4](#b4) | 中 | ツール表示管理が 200ms ごとの再処理を止めない | 再現 | 未着手 | |
| [B5](#b5) | 中 | Safari 版に `vendor/` が同梱されない | 再現（ビルド） | 未着手 | |
| [B6](#b6) | 中 | 配布用 zip に `node_modules/` などが入る | 再現（ビルド） | 未着手 | |
| [B7](#b7) | 低 | キャッシュから描画すると，クイズのリンクが課題ツールを指す | 再現 | 未着手 | |
| [B8](#b8) | 低 | バナーが重複し，設定タブにも紛れ込む | 再現 | 未着手 | |
| [B9](#b9) | 低 | 読み込み中の更新要求が，成功扱いのまま捨てられる | 読解 | 未着手 | |
| [B10](#b10) | 低 | i18n の置換で `$&` などが展開される（潜在） | 再現 | 未着手 | |
| [B11](#b11) | 低 | 教科書一覧が科目名をキーにしていて，同名の科目が衝突する | 読解 | 未着手 | |
| [B12](#b12) | 低 | ページから書き換えられる Web Storage の値で例外になる | 読解 | 未着手 | |
| [B13](#b13) | 低 | シラバス検索の最後のフォールバックが無関係な科目を選びうる | 読解 | 未着手 | |
| [B14](#b14) | 低 | Shift_JIS にない文字を検索語から黙って落とす | 再現 | 未着手 | |
| [B15](#b15) | 低 | `t()` がキーをプロトタイプ越しに引き，`t("hasOwnProperty")` が undefined になる（潜在） | ファズ | 未着手 | |
| [B16](#b16) | 低 | TA 採点支援が壊れた `%` の並びで URIError を投げ，装飾が止まる | ファズ | 未着手 | |
| [P1](#p1) | **高** | 課題取得の N+1 と，タブごとの短い間隔での再取得（LMS への負荷） | 読解 | 未着手 | [#32](https://github.com/Radian0523/kulms-extension/issues/32), [#27](https://github.com/Radian0523/kulms-extension/issues/27) |
| [P2](#p2) | 中 | フォルダ自動展開が，ページ全体の POST を最大 30 回直列に行う | 読解 | 未着手 | [#62](https://github.com/Radian0523/kulms-extension/issues/62) |
| [P3](#p3) | 中 | `document.body` 全体を監視する MutationObserver が多く，重い | 読解 | 未着手 | |
| [P4](#p4) | 低 | jsQR（256KB）と qrcode-gen（56KB）を広すぎる範囲に注入する | 読解 | 未着手 | |
| [P5](#p5) | 低 | 教科書の取得が科目ごとの直列処理 | 読解 | 未着手 | |
| [P6](#p6) | 低 | Service Worker の起動ごとに Shift_JIS 変換表を作り直す | 計測 | 未着手 | |
| [M1](#保守性) | — | TOTP の実装が 4 か所に重複している | 読解 | 未着手 | |
| [M2](#保守性) | — | popup.js と assignments.js，textbooks.js と assignments.js の重複 | 読解 | 未着手 | |
| [M3](#保守性) | — | テストが無く，CI は PR 時の ESLint だけ．IIFE 構造でテストしにくい | 読解 | 未着手 | |
| [M4](#保守性) | — | Safari の Resources がコミットされた複製で，本体から遅れる | 読解 | 未着手 | |
| [M5](#保守性) | — | 動かないコード（textbooks.js の設定確認，popup.js の SVG 走査） | 読解 | 未着手 | |
| [D1](#d1) | 低 | プライバシーポリシーの TOTP の記述が実装と合わない | 読解 | 未着手 | |

## 問題ではないもの：TOTP の HMAC-SHA-1

- TOTP（RFC 6238）の既定のアルゴリズムが HMAC-SHA-1 で，Google Authenticator なども実質これを使う．アルゴリズムを決めるのは京大の認証サーバーなので，拡張側で変えるとコードが合わなくなる．
- SHA-1 の弱点は衝突攻撃で，HMAC としての安全性には影響しない．
- 実装も正しい．RFC 6238 のテストベクタ 6 本がすべて一致した．また，ランダムな 3,000 件（tests/ では 100 件）を node:crypto と突き合わせても不一致は無かった（[tests/totp.test.mjs](../tests/totp.test.mjs)）．
- TOTP で問題なのは，シークレットの扱い（S1，S3，S6）と，実装の重複（M1）である．

## セキュリティ

### S1
**TOTP の平文シークレットが content script と LMS の DOM に渡る**（中・再現）

- 場所: [background.js:732-771](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L732-L771)（送信元を確かめない），[src/auth-totp.js:86](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp.js#L86)，[src/assignments.js:2361-2401](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2361-L2401)
- 何が起きるか:
  - `kulms-totp-load` は，LMS の全フレームと auth.iimc の content script のどれに対しても平文のシークレットを返す．
  - 自動入力（auth-totp.js）は 6 桁のコードがあれば足りるのに，平文を受け取って自分でコードを計算している．
  - LMS の設定パネルで「QR」を押すと，`otpauth://…secret=…` を符号化した QR の SVG が **LMS ページの DOM** に描画される．「コード表示」を押すと現在の OTP も描画される．どちらも表示中は，LMS 側のスクリプト（XSS，外部スクリプト）から読める．
- 影響: 長期間有効な 2 段階認証のシードが漏れると，そのアカウントの 2 段階認証が恒久的に無意味になる．
- 直し方:
  1. OTP は background で計算し，content script には 6 桁だけを返す（例: `kulms-totp-code`）．
  2. `load`・`save`・`delete` は拡張ページ（`sender.tab` が無く，`sender.url` が `chrome.runtime.getURL("")` で始まる）からだけ受け付ける．登録は auth.iimc の送信元に限った専用メッセージにする．
  3. QR とシークレットの表示は popup かオプションページだけで行い，LMS の設定パネルからはそこへ誘導する（挙動の変更になるので，先に上流で Issue を立てる）．
- テスト: `tests/totp.test.mjs` の「S1」．

### S2
**サイト連絡先の正規表現の ReDoS**（中・再現・計測）

- 場所: [background.js:96-98](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L96-L98)．Sakai のサイト情報ページの HTML（教科書の教員名による絞り込み）に対して使う．
- 根拠: `<td>` の後に `,` も `<` も無い空白が続くと，`\s*([^,<\n]+?)\s*` の 3 つの量指定子が互いに文字を取り合う．空白 1,000 字で 0.3 秒，2,000 字で 2.4 秒，4,000 字で **20 秒**かかり，入力長の 3 乗で伸びる．
- 影響: その間 Service Worker のイベントループが止まり，TOTP 自動入力を含む拡張の全メッセージが応答しない．引き金はサイト連絡先の欄に異常な内容が入ることなので，起きる可能性は低い．
- 直し方: 見出しを `indexOf` で探し，次の `<td…>` から `</td>` までを切り出してから，`,` と `<` で区切る．あるいは量指定子の上限を決める．
- テスト: `tests/background.test.mjs` の「S2」．

### S3
**TOTP 登録補助がシークレットをページの sessionStorage に置く**（低・読解）

- 場所: [src/auth-totp-register.js:12-17](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L12-L17)，[:134](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/auth-totp-register.js#L134)
- 何が起きるか:
  - 登録が終わるまで，シークレットを auth.iimc の sessionStorage に平文で置く．このストレージはページの JS から読め，登録を途中でやめるとそのタブに残り続ける．
  - 登録完了の判定は「sessionStorage のキー」と「ページ本文の『設定が完了しました』」だけで行っている．そのため，ページ側がこの 2 つを用意すると，保存済みのシークレットを任意の値で上書きさせられる．
- 前提: auth.iimc でスクリプトを動かせる攻撃者がいること．
- 直し方: 保留中のシークレットは background の `chrome.storage.session` にタブ ID ごとに置く．完了の判定には URL やフォームの状態も使う．
- テスト: 未作成（ハーネスで作る）．

### S4
**シラバスの実体参照を二重にデコードし，数値参照は捨てる**（低・再現）

- 場所: [background.js:365-376](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L365-L376)
- 根拠:
  - `&amp;` を `&lt;` より先にデコードするので，`&amp;lt;img…&amp;gt;` が `<img…>` になる（書名が `<img src=x onerror=alert(1)>入門` になった）．
  - `&#\d+;` は空文字に置き換えるので，数値参照で書かれた文字が消える．
- 影響: 描画は textContent なので，今は XSS にならない．ただしデータが壊れ，将来 innerHTML で描画すれば XSS になる．
- 直し方: 実体参照を表で引く 1 回きりのデコーダにする．数値参照もデコードする．
- テスト: `tests/background.test.mjs` の「S4」．

### S5
**使っていないホスト権限**（低・読解）

- 場所: [manifest.json:22](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/manifest.json#L22)
- 何が起きるか: v1.20.0 で Tips を消してから，`https://radian0523.github.io/*` へ通信するコードは無い（`<a href>` のリンクだけが残っている）．
- 直し方: 権限を外す．権限を減らす更新では，利用者に再承認を求める警告は出ない．

### S6
**不正な TOTP シークレットを保存できる**（低・再現）

- 場所: [popup.js:624](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L624)，[:713-714](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L713-L714)，[src/assignments.js:2252](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2252)，[:2443-2444](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2443-L2444)
- 根拠:
  - `^[A-Z2-7=\s-]+$` は `=` を途中に許し，長さも見ない．
  - `A` は保存され，コード表示中は毎秒 `DataError: Zero-length key` の未処理 Promise 拒否が出る（[popup.js:744](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L744)，[src/assignments.js:2366](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2366)）．
  - `AB=CD2345` と `========` は保存されるが，デコード結果が null になり，自動入力は何も言わずに動かない．
- 直し方: 実際にデコードして確かめる．末尾以外の `=` を拒み，最低長を決める（80 ビット = 16 文字）．拒んだときはエラーを表示する．
- テスト: `tests/totp.test.mjs` の「S6」．

### S7
**形の崩れたメッセージで onMessage リスナーが例外を投げる**（低・再現）

- 場所: [background.js:480-481](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L480-L481)，[:732-733](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L732-L733)
- 根拠: 次のメッセージで TypeError になる．
  - `null`（`message.action` を読む）
  - `{type: 1}`（`startsWith` が無い）
  - `{action: "fetchTextbooks", courseName: 1}`（`replace` が無い）
- 影響: 送れるのは拡張の文脈だけなので，堅牢化の範囲の問題．
- 直し方: メッセージの形を確かめる．オブジェクトであること，`type` が文字列であること，文字列の項目は `String()` で受けること．
- テスト: `tests/background.test.mjs` の「S7」．

### S8
**シラバス解析の正規表現が入力長の 2 乗で遅くなる**（低・再現・計測）

- 場所: [background.js:370](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L370)（`<[^>]+>`），[:433](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L433)（`^(.*?)『(.+?)』`）
- 根拠: 閉じない `<` や対にならない `『` が 20,000 字続くと，それぞれ約 0.2 秒かかる．
- テスト: `tests/background.test.mjs` の「S8」．

## 不具合

### B1
**複数タブを開いていると，メモ・完了チェック・非表示が消える**（高・再現）

- 場所: [src/assignments.js:548-550](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L548-L550)，[:660-662](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L660-L662)，[:726-728](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L726-L728)
- 何が起きるか: 各タブは，ページを開いたときに状態を一度だけ読み込む（[:2975-2977](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2975-L2977)）．その後は，メモリにある全体をそのまま上書き保存する．assignments.js には `chrome.storage.onChanged` の処理が無く，他のタブの変更を知らない．
- 根拠: タブ B でメモを追加し，続いてタブ A で追加すると，B のメモが消えた．完了チェックと非表示も同じ書き方をしている．
- 影響: LMS をよく複数タブで開く利用者のデータが消える．
- 直し方: 操作のたびに「最新を読む → 差分を当てる → 書く」にするか，`storage.onChanged` で他のタブと同期する．より良いのは，項目ごとのキーにするか，background が更新を一列に並べる方式．
- テスト: `tests/assignments.test.mjs` の「B1」．

### B2
**非表示にした課題が 30 日後に一覧へ戻る**（中・再現・上流 [#74](https://github.com/Radian0523/kulms-extension/issues/74) の原因とみられる）

- 場所: [src/assignments.js:664-686](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L664-L686)
- 何が起きるか: 画面は「30日後に自動的に完全削除されます」と表示する．しかし 30 日後に消えるのは，課題を隠している**非表示の記録**の方である．そのため，サーバーの一覧にまだある課題は「遅延提出」や「その他」に戻ってくる．
- 根拠: 31 日前に非表示にした課題 2 件が，どちらも一覧に戻った．
- 直し方: 「隠し続ける」と「削除済みに 30 日表示する」を分ける．非表示の記録は，その課題が取得結果から消えたとき（あるいは締切から一定期間が過ぎたとき）に消す．
- テスト: `tests/assignments.test.mjs` の「B2」．

### B3
**サイドバーの色分けで，期限切れが最も弱く扱われる**（中・再現）

- 場所: [src/assignments.js:2796](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2796)
- 何が起きるか: `(priority[u] || 99)` は，期限切れの優先度 0 を 99 として扱う．そのため，期限切れの課題がある科目が，同じ科目の他の課題の色で塗られる．
- 根拠: 「期限切れ + 先の課題」は灰色，「期限切れ + 緑の課題」は緑になった．
- 直し方: `??` を使うか，`in` で確かめる．
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
- テスト: `tests/sidebar.test.mjs` の「B4」．

### B5
**Safari 版に `vendor/` が同梱されない**（中・再現（ビルド））

- 場所: [build.sh:49](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/build.sh#L49)．Xcode プロジェクトも `vendor` を参照していない．
- 何が起きるか: v1.18.0 以降，manifest は `vendor/jsqr.min.js` と `vendor/qrcode-gen.js` を参照している．しかし Safari への同期と Xcode のリソースには `vendor/` が無い．そのため Safari では，auth.iimc の登録補助（jsQR と同じ組）と QR 表示が動かないはずである（Safari 実機では未確認）．
- 根拠: コピーで `build.sh safari` を実行すると，manifest が参照する 2 ファイルが Resources に無かった．
- 直し方: 同期の対象と Xcode プロジェクトに `vendor` を加える．あわせて，各ビルド出力に manifest の参照するファイルが揃っているかを CI で検査する．
- テスト: `tests/build.test.mjs` の「B5」．

### B6
**配布用 zip に `node_modules/` などが入る**（中・再現（ビルド））

- 場所: [build.sh:8](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/build.sh#L8)
- 何が起きるか: 除外リストに `node_modules/`，`package.json`，`bun.lock`，`eslint.config.js` が無い．bun に移行してからは開発者の手元に `node_modules/` があるので，ストアに出す zip に開発用の依存が入る．
- 根拠: `node_modules` があるコピーで `build.sh chrome` を実行すると，4 つとも zip に入った．
- 直し方: 除外リスト方式をやめ，入れるものを列挙する（manifest.json，background.js，popup.*，styles.css，src，vendor，icons，_locales）．
- テスト: `tests/build.test.mjs` の「B6」．

### B7
**キャッシュから描画すると，クイズのリンクが課題ツールを指す**（低・再現）

- 場所: [src/assignments.js:2910-2919](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2910-L2919)
- 何が起きるか:
  - 課題ツールの地図を，クイズにも当てはめてしまう．
  - サイドバーに無い科目では，項目ごとに `pages.json` を直列に取りに行く．そして解決した URL をキャッシュに書き戻さないので，パネルを開くたびに繰り返す．
- 直し方: 地図は種類ごとに当てる．解決は科目ごとに 1 回，並行して行い，結果をキャッシュに残す．
- テスト: `tests/assignments.test.mjs` の「B7」．

### B8
**バナーが重複し，設定タブにも紛れ込む**（低・再現）

- 場所: [src/assignments.js:1940-2020](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L1940-L2020)
- 何が起きるか: 描画のたびにストレージを非同期に読み，読み終わったときにバナーを付け足す．そのとき，まだ同じ描画のままか，今のタブが課題一覧かを確かめていない．
- 根拠: 2 回続けて描画すると，バナーが 2 個から 4 個になった．設定タブにも現れた．
- 直し方: 描画ごとに世代番号を持たせて照合する．あるいは，バナーを出すかどうかを初期化時に一度だけ読む．
- テスト: `tests/assignments.test.mjs` の「B8」．

### B9
**読み込み中の更新要求が，成功扱いのまま捨てられる**（低・読解）

- 場所: [src/assignments.js:2891-2893](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L2891-L2893)，[:3043-3047](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L3043-L3047)，[:577](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L577)
- 何が起きるか: 読み込み中に `loadAssignments` を呼ぶと，何もせずに返る．そのため，popup の更新ボタンは成功と表示するが，実際には更新していない．提出直後に強制する再取得も，同じ理由で捨てられることがある．
- 直し方: 進行中の Promise を返す．強制更新の要求は，今の処理が終わった後に 1 回実行する．

### B10
**i18n の置換で `$&` などが展開される（潜在）**（低・再現）

- 場所: [src/settings.js:112](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/settings.js#L112)，[popup.js:29](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L29)
- 何が起きるか: 値を `String.prototype.replace` の置換文字列として渡しているので，`$&` は `$MINS$` に，`$$` は `$` に変わる．今の呼び出しは数値しか渡さないので，表には出ていない．
- 直し方: `msg.replace(re, () => value)` のように関数で渡す．
- テスト: `tests/i18n.test.mjs` の「B10」．

### B11
**教科書一覧が科目名をキーにしていて，同名の科目が衝突する**（低・読解）

- 場所: [src/textbooks.js:368-373](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L368-L373)
- 直し方: サイト ID をキーにし，表示名は別に持つ．

### B12
**ページから書き換えられる Web Storage の値で例外になる**（低・読解）

- 場所: [src/assignments.js:556-579](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/assignments.js#L556-L579)，[src/tool-visibility.js:31](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tool-visibility.js#L31)，[src/top-favbar.js:87](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/top-favbar.js#L87)
- 何が起きるか: LMS の sessionStorage と localStorage は，ページ自身の JS から書き換えられる．
  - `kulms-submitted-ids` が配列でない JSON（`"abc"` など）だと，`ids.forEach` で未処理の拒否になる．
  - `kulms-tool-config` の値に `hasOwnProperty` という名前の項目があると，TypeError になる．
- 直し方: 読んだ値の形を確かめ，`Object.hasOwn` を使う．拡張の状態は，できるだけ chrome.storage に置く．

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
- 何が起きるか: 読み込んだ messages.json を `__kulmsOverrideMessages[key]` で引くので，`constructor`，`toString`，`hasOwnProperty` などのキーは Object.prototype の関数に当たる．その `message` は undefined なので，`t()` は文字列でなく undefined を返す．今の呼び出しはキーが定数なので，表には出ていない．
- 根拠: ファズ対象 `i18n` が，起動から 1 秒足らず（390 回目）で見つけた．
- 直し方: `Object.hasOwn(messages, key)` で引く．
- テスト: `fuzz/known/i18n/B15-hasOwnProperty`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

### B16
**TA 採点支援が壊れた `%` の並びで URIError を投げ，装飾が止まる**（低・ファズ）

- 場所: [src/grading-ta.js:62-68](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L62-L68)，[:134-142](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/grading-ta.js#L134-L142)
- 何が起きるか: 提出へのリンクや URL のクエリから ID を取り出すとき，`decodeURIComponent` を例外の処理なしに呼ぶ．`%` の後に 16 進数が続かないリンクがあると URIError で止まり，提出一覧の状態アイコンの装飾がその場で途切れる．URL のクエリに壊れた `%` があると，採点画面の起動そのものが止まる．
- 根拠: ファズ対象 `grading-status` が，約 6 万回目（10 秒）で見つけた．
- 直し方: 失敗したら元の文字列を使う（あるいは `URLSearchParams` で読む）．
- テスト: `fuzz/known/grading-status/B16-malformed-percent`（`tests/fuzz-inputs.test.mjs` が todo として流す）．

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
**フォルダ自動展開が，ページ全体の POST を最大 30 回直列に行う**（中・読解・上流 [#62](https://github.com/Radian0523/kulms-extension/issues/62)）

- 場所: [src/tree-view.js:208-263](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/tree-view.js#L208-L263)
- 直し方: Sakai の `/direct/content/site/{siteId}.json` なら，木全体を 1 回で取れるはず（KULMS で使えるかは要確認）．それを取得して拡張の側で描画する．

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

### P5
**教科書の取得が科目ごとの直列処理**（低・読解）

- 場所: [src/textbooks.js:355-375](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L355-L375)．1 科目につき，background で 2〜4 本の HTTP を使う．
- 直し方: 並列数 2〜3 程度で並行させる（KULASIS への負荷に配慮する）．

### P6
**Service Worker の起動ごとに Shift_JIS 変換表を作り直す**（低・計測）

- 場所: [background.js:112-145](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/background.js#L112-L145)．約 2.2 万回のデコードで，Node では約 32ms かかった．

## 保守性

- **M1**: TOTP の base32 デコードと HMAC の計算が，popup.js，assignments.js，auth-totp.js，auth-totp-register.js の 4 か所に重複している．background の 1 か所にまとめる（S1 の修正と同時に行う）．
- **M2**: 緊急度・表示形式・提出判定が popup.js と assignments.js に，コース一覧の取得が textbooks.js と assignments.js に重複している．
- **M3**: テストが無く，CI は PR 時の ESLint だけ．関数が IIFE に閉じていて，chrome API と DOM に依存するので，単体ではテストしにくい．
- **M4**: `safari/KULMS+ Extension/Resources/` がコミットされた複製で，本体から遅れる．`087452e` では `src/assignments.js` と `src/submit-detect.js` が古いままだった．
- **M5**: 動かないコードがある．[src/textbooks.js:7](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/src/textbooks.js#L7) は，設定を読み込む前に設定を確かめている．[popup.js:901-917](https://github.com/Radian0523/kulms-extension/blob/087452e33d14c117e6fa584fe3dd4b19f8f9a76c/popup.js#L901-L917) の SVG 走査は，作った画像を使っていない．

## ドキュメント

### D1
**プライバシーポリシーの TOTP の記述が実装と合わない**（低・読解）

- 何が起きるか:
  - `docs/privacy.html` は「暗号文は chrome.storage.local に，鍵は IndexedDB に置く」と書いているが，v1.21.0 からはどちらも同じ IndexedDB にある．
  - 鍵が暗号文の隣にあるので，ディスクを読める攻撃者には平文とほぼ同じである．「AES-256-GCM で暗号化」という書き方は，実際より強く見える．

## 上流 Issue との対応

| 上流 Issue | 対応 |
|---|---|
| [#74](https://github.com/Radian0523/kulms-extension/issues/74) 30日後の削除効いてなくね？ | B2 |
| [#32](https://github.com/Radian0523/kulms-extension/issues/32) lms への負荷軽減，[#27](https://github.com/Radian0523/kulms-extension/issues/27) sakai api 7分くらいかかってる | P1 |
| [#62](https://github.com/Radian0523/kulms-extension/issues/62) 授業資料のページのロード長い | P2 |
| [#58](https://github.com/Radian0523/kulms-extension/issues/58) 課題提出が反映されなくなった | `087452e`（提出ボタンを listen する修正）が対処しているとみられる（実機では未検証） |
| [#56](https://github.com/Radian0523/kulms-extension/issues/56) 非ログイン時に更新すると課題が空になる | ログアウトを検知してキャッシュを守る処理（`LoggedOutError`）がある（実機では未検証） |
| [#54](https://github.com/Radian0523/kulms-extension/issues/54) クイズが完了にならない | API に完了状態が無い仕様（範囲外） |

## JS のファジングとサニタイザ（2026-10-06 時点の調査）

JS はメモリ安全なので，ASan や MSan が見る種類の不具合は起きない．代わりに見るのは次の 4 つ．

- 落ちる: 未捕捉の例外，未処理の Promise 拒否
- 固まる: ReDoS や無限ループ（timeout で検出する．S2 がこれ）
- 膨らむ: メモリの膨張
- 注入: DOM XSS，プロトタイプ汚染

| C++ | JS での相当物 | 状況 |
|---|---|---|
| libFuzzer | Jazzer.js：libFuzzer を内蔵したカバレッジ誘導型のファザー．Apache-2.0．Node のネイティブアドオンなので bun では動かない | v4.0.0（2026-04-15），2026-09 も更新あり |
| 性質ベーステスト | fast-check：`fc.uint8Array()` などで入力を生成し，失敗例を最小化する | v4.10.2（2026-09-19） |
| ASan / MSan | 不要 | — |
| UBSan に近いもの | TypeScript の `checkJs`（JSDoc の型）による静的検査 | — |
| 注入の検出器 | Jazzer.js の検出器（プロトタイプ汚染，eval/Function，コマンド注入，パストラバーサル，SSRF）．DOM XSS は jsdom の innerHTML などにフックする自作の検出器．popup には Trusted Types | — |
| clang-tidy | ESLint + `eslint-plugin-no-unsanitized` + `eslint-plugin-regexp`（`no-super-linear-backtracking`），CodeQL（`js/redos`，`js/double-escaping` など），`web-ext lint` | いずれも 2026-09〜10 に更新あり |
| 差分テスト | 参照実装との突き合わせ | TOTP と node:crypto で実施済み |

## fuzz リポジトリの仕組み

- **このリポジトリ（kulms-extension-fuzz）の役割**: kulms-extension を submodule として持ち，上流のコードは変えずに，ハーネス側でテストとファジングを行う．
- **ハーネス**（[harness/](../harness/)）: 偽の chrome API と jsdom を用意し，submodule のスクリプトを manifest と同じ順で読み込む．偽の API は，複数タブで共有するストレージ，メッセージとその記録，拡張自身のファイル（web_accessible_resources の制限つき）を備える．IIFE の中の関数は，読み込み時に AST 変換で外へ公開する（行番号は変えない）．読み込むコードは Jazzer.js の計装を通すので，vm や jsdom で動くコードからもカバレッジがファザーに届く．
- **検出器**（[harness/detectors.mjs](../harness/detectors.mjs)）: 例外のほか，ページに入り込んだスクリプトを動かすマークアップ（DOM XSS），プロトタイプの汚染，誰も受けない Promise の拒否を失敗とする．
- **テスト**（[tests/](../tests/)）: 各問題の再現（todo），ハーネス自体のテスト，ファズ対象のシードと回帰入力と既知の失敗入力の再生．
- **ファジング**（[fuzz/](../fuzz/)）: 外から入力が来る面ごとの 7 つの対象と canary．対象の一覧と運用は [fuzz/README.md](../fuzz/README.md) にある．
- **CI**（[yumasansansan/ADLplug-Next](https://github.com/yumasansansan/ADLplug-Next) にならう）:
  - 素の git でチェックアウトし，submodule も含める．Node は最新版を，pnpm は `packageManager` の版を，`ci/setup.sh` が SHA-256 を確かめて入れる．外部の action は，commit で固定した `actions/upload-artifact` だけ．
  - `ci.yml`（push ごと）: Ubuntu と Windows でのテスト，lint（このリポジトリには ESLint のすべての指摘で失敗し，submodule の拡張には DOM XSS と ReDoS のルールを掛けて報告だけする），REUSE，canary と各対象 1 分のファジング．落ちた入力は artifact に残す．
  - `fuzz.yml`（毎日）: 各対象 20 分のファジング．コーパスを artifact で引き継ぎ，前回落ちた入力を最初に再生する．

## 進める順序

1. **fuzz リポジトリの土台**（済み）: submodule（kulms-extension の fork），ハーネス，テスト，ファズ対象，`ci.yml`，`fuzz.yml`．
2. **修正と上流への PR**: データ消失（B1，B2）→ セキュリティ（S1〜S8）→ 不具合 → 負荷（P1〜P6）の順に直す．修正には，このリポジトリの回帰テストを付ける．
3. **挙動が変わるもの**（S1 の表示場所，P1 の取得間隔とリクエスト数，B2 の仕様，P2 の API）は，先に上流で Issue を立てる．

## このリポジトリの方針

- kulms-extension は fork（[yumasansansan/kulms-extension](https://github.com/yumasansansan/kulms-extension)）を submodule `kulms-extension/` として持つ．修正はこの fork のブランチで行い，上流（[Radian0523/kulms-extension](https://github.com/Radian0523/kulms-extension)）へ PR を出す．
- このリポジトリのパッケージ管理は pnpm で，Node は最新版を使う（2026-10-06 の検証は Node 26.10.0 と pnpm 12.9.1）．上流は bun を使うが，このリポジトリでは不要．
- このリポジトリのファイルは GPL-3.0-or-later とし，ADLplug-Next と同じ形の SPDX ヘッダを各ファイルの先頭に付ける．コメントを書けないファイルは `REUSE.toml` で指定し，REUSE 仕様に適合させる（CI で `reuse lint` を掛ける）．submodule の kulms-extension は上流の MIT のまま．
