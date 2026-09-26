STARK WORLDを「見た目だけのプロトタイプ」ではなく、
実際に操作して機能する完成度の高いインタラクティブWebアプリへ徹底的に改修してください。

最重要:
現在のSTARK WORLDのデザイン・世界観・レイアウトを維持してください。
勝手に別デザインへ作り直さないでください。

現在のコードを最初に完全に確認し、
既存実装を理解したうえで、
必要なファイルを追加・修正して機能を実装してください。

コードが長くなっても構いません。
短いコードにすることより、
「実際に動くこと」「状態が正しく連動すること」「操作しても壊れないこと」を優先してください。

━━━━━━━━━━━━━━━━━━━━
1. 基本コンセプト
━━━━━━━━━━━━━━━━━━━━

STARK WORLDは、
未来型のパーソナル・オペレーティング・インターフェースです。

単なるWebサイトやダッシュボードではありません。

ユーザーが3D空間に入り、
オブジェクトを選択し、
システムを確認し、
スキャンし、
コマンドを実行し、
設定を変更できる、
「未来のコンピューター環境」のようにしてください。

現在のビジュアル:

- ダークな宇宙空間
- 青 / シアンの発光
- ガラスモーフィズム
- ARC CORE
- 4つのNODE
- パーティクル
- 左ナビゲーション
- 中央3D空間
- 右Telemetry
- 下部Control
- Status Log

このデザインを維持してください。

━━━━━━━━━━━━━━━━━━━━
2. 最初にコード全体を監査
━━━━━━━━━━━━━━━━━━━━

実装を開始する前に、
現在のプロジェクトに存在するコードを確認してください。

特に確認するもの:

- src/App.tsx
- src/index.css
- src/main.tsx
- package.json
- その他の既存コンポーネント
- 3D関連コード
- 状態管理
- イベント処理

既存機能を削除してから作り直すのではなく、
利用できるコードは可能な限り再利用してください。

重複コード、
未使用コード、
壊れたイベント、
状態の不整合、
TypeScriptエラー、
Reactの不要な再レンダリング、
Three.jsのメモリリークなどがあれば修正してください。

━━━━━━━━━━━━━━━━━━━━
3. 3D WORLD
━━━━━━━━━━━━━━━━━━━━

中央の3D空間を本当にインタラクティブにしてください。

ARC CORE:

- 中央にARC COREを配置
- 滑らかな回転
- 発光
- 複数の回転リング
- 外側のワイヤーフレーム
- 呼吸するようなパルス
- 周囲に微粒子
- エネルギーが流れているような表現

NODE:

以下の4つを配置:

NORTH NODE
EAST NODE
WEST NODE
SOUTH NODE

各NODE:

- 発光する3Dオブジェクト
- 微妙にパルス
- ARC COREとの接続線
- 地面側のビーコン
- 選択可能

オブジェクトは単なる画像ではなく、
可能な限りThree.jsなどを使用した本物の3Dオブジェクトとして実装してください。

━━━━━━━━━━━━━━━━━━━━
4. カメラ操作
━━━━━━━━━━━━━━━━━━━━

デスクトップ:

- マウスドラッグ → カメラ回転
- ホイール → ズーム
- 右クリックなどでページ全体が誤操作されないようにする

モバイル:

- 1本指ドラッグ → カメラ回転
- ピンチ → ズーム
- タップ → オブジェクト選択

操作中にページが勝手にスクロールしないようにしてください。

カメラ操作は滑らかにしてください。

極端な角度や距離になって3D空間が壊れないように、
最小値・最大値を設定してください。

━━━━━━━━━━━━━━━━━━━━
5. OBJECT SELECTION
━━━━━━━━━━━━━━━━━━━━

3Dオブジェクトをクリック / タップすると選択してください。

選択したオブジェクト:

- 発光を強くする
- 選択リングを表示
- 必要なら小さなターゲットマーカーを表示
- カメラを滑らかに対象へフォーカス
- CURRENT TARGETを更新

例:

TARGET LOCKED
ARC CORE

ENERGY CORE
STABLE
87%

NODEを選択した場合も同じように、
そのNODEの情報を表示してください。

ドラッグ操作中に誤ってオブジェクト選択されないようにしてください。

「タップ」と「カメラドラッグ」を正しく区別してください。

━━━━━━━━━━━━━━━━━━━━
6. HOME
━━━━━━━━━━━━━━━━━━━━

HOMEでは現在のデザインを維持してください。

表示:

WELCOME
STARK WORLD

"Your World."

説明:

A spatial personal interface built for
exploration, control and future expansion.

ENTER SYSTEM

ENTER SYSTEMを押すとSYSTEMへ移動してください。

━━━━━━━━━━━━━━━━━━━━
7. SYSTEM
━━━━━━━━━━━━━━━━━━━━

SYSTEMを完全に機能させてください。

表示:

ENERGY
SIGNAL
STABILITY
FPS

値は固定文字ではなく、
実際の状態を反映してください。

可能なら:

- FPSをThree.jsの実測値から計算
- Energyをシステム状態から取得
- Signalを状態値として管理
- Stabilityを状態値として管理

数値が突然ジャンプしないように、
滑らかなアニメーションを使用してください。

━━━━━━━━━━━━━━━━━━━━
8. CORE
━━━━━━━━━━━━━━━━━━━━

ARC COREまたはNODEを選択したとき、
CORE画面に移動できるようにしてください。

表示:

名前
タイプ
ステータス
ENERGY

RUN DIAGNOSTICS

RESTART CORE

RUN DIAGNOSTICS:

クリックすると実際に処理を開始してください。

例:

DIAGNOSTICS STARTED
↓
POWER CHECK
↓
NETWORK CHECK
↓
THERMAL CHECK
↓
CORE CHECK
↓
DIAGNOSTICS COMPLETE

プログレス表示を使用してください。

RESTART CORE:

安全確認を表示し、
確認するとCore状態を再起動してください。

━━━━━━━━━━━━━━━━━━━━
9. MAP
━━━━━━━━━━━━━━━━━━━━

MAPを完全に機能させてください。

一覧:

ARC CORE
NORTH NODE
EAST NODE
WEST NODE
SOUTH NODE

各項目:

- ENERGY
- STATUS
- TYPE

項目をクリックすると:

1. そのオブジェクトを選択
2. CURRENT TARGET更新
3. 3D空間で対象を強調
4. カメラを対象へ移動
5. CORE画面へ移動

これらを滑らかに実行してください。

━━━━━━━━━━━━━━━━━━━━
10. SCAN
━━━━━━━━━━━━━━━━━━━━

SCANを本当に動作させてください。

START SCANを押すと:

0%
5%
10%
...
100%

と進行してください。

同時に3D空間では:

- スキャンリング
- スキャン波
- 光の走査
- 対象の検出アニメーション

を表示してください。

スキャン中は、

SCANNING ENVIRONMENT

と表示。

検出したオブジェクト:

ARC CORE
NORTH NODE
EAST NODE
WEST NODE
SOUTH NODE

完了:

SCAN COMPLETE

5 OBJECTS DETECTED
5 OBJECTS INDEXED

Status Logにも追加してください。

SCAN AGAINで再実行可能にしてください。

━━━━━━━━━━━━━━━━━━━━
11. COMMAND
━━━━━━━━━━━━━━━━━━━━

本当に使えるコマンドコンソールを作ってください。

入力:

scan
core
map
system
home
grid
rotate
safe
diagnostics
target north
target east
target west
target south
target core
clear

大文字小文字は区別しないでください。

例:

scan

→ SCAN開始

core

→ ARC COREへ移動

map

→ MAPへ移動

grid

→ Grid ON/OFF

rotate

→ Auto Rotation ON/OFF

safe

→ Safe Mode ON/OFF

target north

→ NORTH NODEを選択

diagnostics

→ 現在の対象を診断

clear

→ Command Logを消去

未知のコマンド:

UNKNOWN COMMAND

と表示してください。

Command Historyを保存してください。

Enterキーでも実行できるようにしてください。

━━━━━━━━━━━━━━━━━━━━
12. SETTINGS
━━━━━━━━━━━━━━━━━━━━

以下を完全に機能させてください。

AUTO ROTATION
ON / OFF

SPATIAL GRID
ON / OFF

SAFE MODE
ON / OFF

SOUND
ON / OFF

PERFORMANCE MODE
ON / OFF

変更すると即座に3D環境へ反映してください。

可能なら設定値をlocalStorageへ保存してください。

ページをリロードしても設定が維持されるようにしてください。

━━━━━━━━━━━━━━━━━━━━
13. SAFE MODE
━━━━━━━━━━━━━━━━━━━━

SAFE MODE ON:

- 強い発光を減らす
- パーティクル数を減らす
- 重いエフェクトを減らす
- パフォーマンスを優先

OFF:

通常表示に戻す。

━━━━━━━━━━━━━━━━━━━━
14. TELEMETRY
━━━━━━━━━━━━━━━━━━━━

右側のLIVE TELEMETRYを完全に機能させてください。

表示:

CORE LOAD
SIGNAL
MEMORY
FPS

さらに:

CURRENT TARGET

QUICK CONTROLS

ROTATION
GRID

を表示してください。

値が変更された場合、
UIもリアルタイムに更新してください。

━━━━━━━━━━━━━━━━━━━━
15. STATUS LOG
━━━━━━━━━━━━━━━━━━━━

Status Logをイベントと完全に連動させてください。

例:

STARK WORLD INITIALIZED
LOCAL CORE ONLINE
SYSTEM READY
TARGET LOCKED
SCAN STARTED
SCAN COMPLETE
GRID ENABLED
GRID DISABLED
ROTATION ENABLED
ROTATION DISABLED
SAFE MODE ENABLED
DIAGNOSTICS STARTED
DIAGNOSTICS COMPLETE
COMMAND EXECUTED

最新ログを上に表示してください。

最大10件程度に制限してください。

━━━━━━━━━━━━━━━━━━━━
16. QUICK CONTROLS
━━━━━━━━━━━━━━━━━━━━

下部の:

HOME
PAUSE ROTATION
HIDE GRID
SCAN

を完全に機能させてください。

ボタンの文字も状態に合わせて変えてください。

例:

PAUSE ROTATION
↓
AUTO ROTATE

HIDE GRID
↓
SHOW GRID

━━━━━━━━━━━━━━━━━━━━
17. 通知システム
━━━━━━━━━━━━━━━━━━━━

重要な操作時に小さな通知を表示してください。

例:

TARGET LOCKED
SCAN COMPLETE
SETTINGS SAVED
COMMAND EXECUTED

通知は数秒後に自動的に消してください。

複数通知が発生してもUIが壊れないようにしてください。

━━━━━━━━━━━━━━━━━━━━
18. ERROR HANDLING
━━━━━━━━━━━━━━━━━━━━

操作によってアプリがクラッシュしないようにしてください。

特に:

- 空Command
- 存在しないTarget
- 連続Scan
- 連打
- 3Dオブジェクトが存在しない場合
- resize
- mobile orientation change

などを安全に処理してください。

JavaScript / TypeScriptエラーを可能な限り排除してください。

━━━━━━━━━━━━━━━━━━━━
19. RESPONSIVE
━━━━━━━━━━━━━━━━━━━━

Desktop:

現在のレイアウトを維持。

Tablet:

NavigationとTelemetryをコンパクト化。

Mobile:

- 3D空間を全面的に活用
- 上部Header
- 下部Navigation
- Floating Panel
- Touch操作
- Pinch Zoom
- Tap Selection

画面外にはみ出さないようにしてください。

横向き・縦向きの両方を考慮してください。

━━━━━━━━━━━━━━━━━━━━
20. PERFORMANCE
━━━━━━━━━━━━━━━━━━━━

見た目だけではなく、
実際に滑らかに動くことを優先してください。

以下を実施してください:

- devicePixelRatioを適切に制限
- 不必要なReact再レンダリングを避ける
- animation loopをReact stateで毎フレーム更新しない
- Three.jsオブジェクトを毎フレーム生成しない
- dispose漏れを防ぐ
- EventListenerの重複登録を防ぐ
- resize処理を適切に管理
- Particle数を適切に管理
- Safe Mode / Performance Modeを実装

特に、
設定変更のたびにThree.jsのScene全体を再生成しないでください。

━━━━━━━━━━━━━━━━━━━━
21. STATE MANAGEMENT
━━━━━━━━━━━━━━━━━━━━

アプリ全体で状態が矛盾しないようにしてください。

最低限管理する状態:

currentMode
selectedTarget
energy
signal
stability
fps
scanProgress
isScanning
gridEnabled
autoRotation
safeMode
soundEnabled
performanceMode
commandHistory
statusLogs
notifications

同じ状態を複数箇所で別々に管理して矛盾させないでください。

━━━━━━━━━━━━━━━━━━━━
22. THREE.JS CLEANUP
━━━━━━━━━━━━━━━━━━━━

Three.jsを使用している場合、
component unmount時に適切にcleanupしてください。

dispose対象:

- Geometry
- Material
- Texture
- Renderer

EventListenerも解除してください。

requestAnimationFrameも停止してください。

Memory Leakを起こさないようにしてください。

━━━━━━━━━━━━━━━━━━━━
23. UI DESIGN
━━━━━━━━━━━━━━━━━━━━

現在のSTARK WORLDのデザインを維持してください。

絶対に:

- 古いWebサイト風
- レトロHUD
- ピクセルアート
- 過剰なネオン
- 巨大な枠線
- 情報過多
- 安っぽいゲームUI

にはしないでください。

目指すのは:

Premium
Minimal
Futuristic
Cinematic
Spatial
Elegant

です。

━━━━━━━━━━━━━━━━━━━━
24. AI
━━━━━━━━━━━━━━━━━━━━

現在AI機能は実装しないでください。

UIには:

AI OFFLINE

と表示してください。

ただし将来AIを追加できる構造にしてください。

将来的に:

- Voice Command
- AI Assistant
- Natural Language Command
- Vision
- Personal Agent

などを追加できるようにしてください。

━━━━━━━━━━━━━━━━━━━━
25. 将来のMeta Quest対応
━━━━━━━━━━━━━━━━━━━━

今すぐWebXRを無理に実装する必要はありません。

ただし、
将来的にMeta Quest / WebXRへ拡張できる構造を意識してください。

3D空間とUIを分離し、
3D Sceneへアクセスしやすい構造にしてください。

━━━━━━━━━━━━━━━━━━━━
26. コード品質
━━━━━━━━━━━━━━━━━━━━

コードを短くすることを目的にしないでください。

必要なら:

- コンポーネント分割
- hooks
- utility functions
- types
- Three.js helper
- command parser
- state management

を使用してください。

ただし、
意味のない巨大なコードやダミーコードを大量に追加しないでください。

「行数を増やすためのコード」は禁止です。

すべてのコードに実際の役割を持たせてください。

━━━━━━━━━━━━━━━━━━━━
27. 最重要：完成後の自己テスト
━━━━━━━━━━━━━━━━━━━━

実装後、
自分でアプリ全体を確認してください。

以下を順番にテストしてください。

HOME
↓
SYSTEM
↓
CORE
↓
MAP
↓
SCAN
↓
COMMAND
↓
SETTINGS

さらに:

ARC COREをクリック
NORTH NODEをクリック
EAST NODEをクリック
WEST NODEをクリック
SOUTH NODEをクリック

カメラをドラッグ
ズーム
Grid ON/OFF
Rotation ON/OFF
Safe Mode ON/OFF
Scan
Diagnostics
Command
Settings Save

すべての操作が正常に連動することを確認してください。

━━━━━━━━━━━━━━━━━━━━
28. バグ修正
━━━━━━━━━━━━━━━━━━━━

もし既存コードにエラーがある場合は、
エラーを残したまま完了にしないでください。

TypeScriptエラー
Reactエラー
Three.jsエラー
イベントエラー
UI状態エラー

を確認し、
可能な限り修正してください。

━━━━━━━━━━━━━━━━━━━━
29. 重要な禁止事項
━━━━━━━━━━━━━━━━━━━━

現在のデザインを勝手に変更しない。

既存の正常な機能を削除しない。

見た目だけ作って「実装した」としない。

ダミーボタンを作らない。

クリックして何も起きないボタンを作らない。

Commandを見た目だけの入力欄にしない。

SCANを単なるプログレスバーにしない。

3Dオブジェクトを単なる画像にしない。

設定を見た目だけのToggleにしない。

━━━━━━━━━━━━━━━━━━━━
30. 最終目標
━━━━━━━━━━━━━━━━━━━━

完成したSTARK WORLDを実際に触ったとき、

「これはWebページだ」

ではなく、

「未来のコンピューターを操作している」

と感じるレベルまで完成度を上げてください。

現在のSTARK WORLD V2.4.1の
デザイン・世界観・レイアウトを維持しながら、

機能
↓
インタラクション
↓
3D
↓
状態管理
↓
レスポンシブ
↓
パフォーマンス
↓
エラー処理

まで一貫して実装してください。

コードが長くなっても問題ありません。

完成度を最優先してください。