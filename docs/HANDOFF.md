# HANDOFF

最後更新：2026-10-18（匯出裁剪框、Delete 刪除物件；測試角色已移除）
分支：`main`（單一根提交，無父提交）
狀態：檢視與匯出功能完成，介面為繁中 Spine 式版面；動畫編輯第 1 至 4 階段已由使用者驗收通過；第 5 階段（限制器、網格變形、繪製順序、皮膚與新增動畫，最終階段）與匯出即時預覽亦已驗收通過；測試角色 `003妙蛙花/`、`054可达鸭/` 已依 D21 刪除，Git 歷史已壓平為單一根提交。

---

## 1. 現況摘要

`spine-asset-inspector` 為純前端、可離線運作的 Spine 骨骼動畫資產檢驗工作台。已實作：資產載入與渲染、動作播放與逐影格、混合實驗室與多軌、換皮與插槽、除錯線框與事件監聽、匯出、安全性，以及圖集拆解與紋理熱替換、骨架效能體檢、音訊事件對齊。內建程序化示範骨架，未載入外部檔案時可完整啟動與通過 E2E。版面：中央畫面、右側階層樹與屬性面板、下方播放列；「進階工具」側欄 8 個頁籤：混合、插槽、事件、音訊、圖集、效能、歷史、顯示；匯出為對話框。動畫編輯可在屬性面板修改名稱與設置值，並在設置模式以畫布控制軸拖曳骨骼位移、旋轉、縮放，復原、重做、存成 Spine 4.2 JSON。

---

## 2. 有效決策

| 編號 | 決策 | 理由 |
| --- | --- | --- |
| D1 | 渲染採 `@esotericsoftware/spine-webgl`，未使用 pixi.js | 需求允許二擇一；spine-webgl 直接提供 SceneRenderer、SkeletonDebugRenderer 與 OrthoCamera，依賴更少，除錯線框與離屏匯出更容易精準控制 |
| D2 | Spine 執行環境固定為 4.2（`4.2.120`） | 4.2 為目前產線主流匯出版本且持續維護；4.3 於 2026-05 發布，暫不支援，版本不一致時顯示警告 |
| D3 | 壓縮檔使用 `fflate`，未使用 JSZip | 同步 API、體積小、無 `setImmediate` 相依，符合 CSP |
| D4 | CSP 只注入正式建置，開發模式不套用 | Vite 開發模式需要 inline 前導腳本與 WebSocket |
| D5 | `connect-src 'none'`、`worker-src 'none'` | 程式不使用 fetch 與 Worker，檔案以 `File.arrayBuffer` 讀取，貼圖以 `createImageBitmap` 解碼 |
| D6 | 匯出使用獨立離屏 WebGL 環境並重建骨架 | 貼圖屬於各自的 GL 環境；可任意解析度、透明背景，不受舞台縮放與除錯層影響 |
| D7 | 單影格截圖以 `transferPose` 複製世界變換 | 精確保留混合中、多軌疊加與物理結果 |
| D8 | 序列幀與 WebM 只取樣 Track 0 指定動作 | 輸出可重現；多軌與過渡匯出列為後續項目 |
| D9 | 狀態分為 `inspectorStore`（UI 狀態）與 `liveStore`（每影格資料） | 避免每影格重繪整個介面 |
| D10 | 控制器透過 `ControllerEnvironment` 注入瀏覽器相依 | 控制器、store 與核心可在 Node 中完整測試 |
| D11 | 無註解規則以 TypeScript 掃描器實作，零 Emoji 以 Unicode 屬性實作 | 避免字串、正規表示式與 JSX 文字誤判 |
| D12 | 提交者身分固定為 `zzoraemon043 <195147269+zzoraemon043@users.noreply.github.com>`，提交訊息不含 Co-Authored-By 與 Claude-Session | 依專案規範；已以 repo 層級 `git config` 設定 |
| D13 | 圖集拆解以 WebGL 讀回原始像素並以內建 PNG 編碼器輸出，不經 2D Canvas | 2D Canvas 會預乘 Alpha，半透明像素無法無損還原 |
| D14 | Region 熱替換建立獨立 TextureAtlasRegion 並改指引用它的部件，不修改共用圖集頁面 | 可精準還原，並可在匯出用的離屏環境重複套用 |
| D15 | 效能基準採中階手機、60 FPS、單一角色同屏，集中於 `src/core/audit/budgets.ts` | 需求未提供具體數值；集中定義方便專案調整 |
| D16 | 起音點偵測採能量比較法，對齊容許值：半影格內為 aligned、兩影格內為 near | 足以檢查腳步、打擊等短促音效；不引入額外音訊分析套件 |
| D17 | 新功能以 `controller/features/*` 模組實作，經 `FeatureHost` 取得資產與舞台 | 控制器本體維持精簡，功能可獨立測試 |
| D18 | 儲存庫歷史為單一根提交並強制覆蓋 `main` | 依使用者指示排除 GitHub 自動建立的 Initial commit |
| D19 | 舊版支援採「載入時升級為 4.2 結構」，不並存多套執行環境；首先支援 3.6 二進位 | 使用者資產為 3.6.52 / 3.6.53 二進位；比照編輯器匯入舊檔，渲染、圖集、體檢、音訊、匯出等功能全部可直接沿用 |
| D20 | 3.6 旋轉關鍵影格依 3.x 最短路徑規則展開後寫入，貝茲曲線轉為 4.x 絕對座標 | 4.x 旋轉不做最短路徑換算，未展開會造成跨 180 度時反向旋轉 |
| D21 | 第三方參考資產不放入儲存庫。測試用的 `003妙蛙花/` 與 `054可达鸭/` 已於全部驗收完成後刪除，Git 歷史亦已壓平為單一根提交，不再包含這兩個目錄；參考資產測試在目錄不存在時自動略過，需要時可在本機放回同名目錄執行 | 著作權不屬於本專案，且不應隨 MIT 授權散布 |
| D22 | 介面全面繁中化，版面參考 Spine 編輯器習慣（中央畫面、右側階層樹與屬性、下方播放列與時間軸），但不複製其外觀與商標 | 使用者要求「跟 Spine 相同介面」且原介面難以理解；外觀與商標屬於 Esoteric Software |
| D23 | 混合、插槽清單、事件、音訊、圖集、效能、除錯收進「進階工具」側欄，預設關閉，開啟時推開畫面而非覆蓋 | 使用者選擇保留全部功能但預設收合 |
| D24 | 匯出改為對話框：PNG 序列、Sprite Sheet（TexturePacker JSON 格式）、目前畫面、WebM；支援指定寬高、影格速率與起訖影格、透明或純色背景 | 使用者指定的四項匯出設定；所有 PNG 改以 GL 讀回加自有編碼器輸出，結果一致 |
| D25 | 初始視角改以「去除遠處離群部件」的範圍適配 | 3.6 角色的特效部件遠離本體，原本適配會讓角色過小 |
| D26 | 完整動畫編輯採分階段進行（見第 5 節），編輯結果一律存成 Spine 4.2 JSON | 工作量極大需分批驗收；3.6 舊檔無法回存舊格式 |
| D27 | 可編輯文件即為原始 4.2 JSON 物件（不可變、寫入時複製），不由執行環境的 `SkeletonData` 反向產生 | `SkeletonData` 會遺失曲線原值、預設值省略、非必要欄位與鍵順序；直接保留 JSON 才能無損回存 |
| D28 | 編輯以可逆修補運算記錄（set / insert / remove / rename，刪除鍵還原至原位置），歷史 200 步，同欄位 1 秒內連續修改合併為一步，已儲存點之後不合併 | 比整份快照省記憶體，且任意步驟可精確還原；合併避免數值微調塞滿歷史 |
| D29 | 每次編輯先以 `SkeletonJson` 重新解析新文件，成功才寫入歷史並換上新的執行環境實例；保留動作、時間、皮膚、多軌、混合、插槽覆寫與 Region 替換 | 確保歷史中每一步都能被 4.2 執行環境讀取，畫面與存檔一致 |
| D30 | Spine 4.x 二進位 `.skel` 僅供檢視與匯出，編輯需改用 JSON；4.2 二進位讀取器延後（使用者已確認維持此策略） | 與第 5 節原訂第 1 階段內容的差異（原計畫含 4.2 二進位讀取器）。使用者現有資產為 3.6 二進位（已可編輯）；官方 4.2 二進位讀取器只輸出執行環境資料，需另寫一套完整讀取器才能無損保留曲線，優先順序較低 |
| D31 | 改名指令同步更新全部引用：骨骼（父骨骼、插槽、IK / Transform / Path / Physics、皮膚骨骼清單、動畫骨骼時間軸）、插槽（皮膚部件、裁切結束插槽、Path 目標、動畫插槽與變形時間軸、繪製順序）、事件（事件關鍵影格）、動畫（鍵名）；選取項目跟隨改名 | 避免改名後檔案無法載入或動畫失效 |
| D33 | 設置模式為獨立狀態：進入時清除所有軌道並顯示設置姿勢；按播放或切換動畫自動離開並恢復原動作與多軌 | 拖曳的是設置值，畫面必須顯示設置姿勢才不會與動畫姿勢混淆；比照 Spine 編輯器的設置 / 動畫模式 |
| D34 | 控制軸分三種模式（W / E / R）：位移軸沿父骨骼座標（拖 X 箭頭只改 x）、縮放軸沿骨骼自身座標、旋轉為環；把手尺寸以螢幕像素計算 | 數值與軸向一一對應最直覺；縮放畫面時把手大小不變 |
| D35 | 拖曳中直接改執行環境的 BoneData 做即時預覽，不寫入文件；放開時還原後以一筆 `setBoneTransform` 指令提交（不與其他步驟合併），Esc 或指標中斷則取消 | 避免每影格重新解析 JSON 與產生歷史；符合「放開才產生單一筆紀錄」 |
| D36 | 拖曳結果取位：位移與旋轉 0.01、縮放 0.001；吸附為位移整數、旋轉 15 度、縮放 0.1，工具列開關與 Shift 互為反向 | 避免 JSON 出現無意義的長小數；吸附值比照常見編輯器 |
| D37 | 畫面點選骨骼只在設置模式啟用，以骨骼線段距離（6 像素內）判定，距離相近時取繪製較後的子骨骼，並自動展開階層樹 | 避免一般檢視時點擊畫面誤改選取；重疊的父子骨骼通常想選子骨骼 |
| D38 | Gizmo 的螢幕座標以 `data-gizmo-*` 屬性輸出在畫布元素上 | 讓 E2E 以真實滑鼠拖曳把手；不含任何使用者資料 |
| D39 | 設置模式與動畫模式互斥；動畫模式需已選動畫，進入時暫停並停用多軌疊加、時間對齊到目前影格，離開時恢復多軌；切換動畫維持在動畫模式 | 編輯對象必須唯一明確；多軌疊加會讓看到的姿勢不等於被編輯動畫的姿勢 |
| D40 | 自動 K 幀預設開啟；關閉時控制軸與面板的變更以執行環境姿勢覆寫暫存（不寫文件、不進歷史），按 K 寫入，換影格、播放、切換動畫或離開模式即捨棄 | 使用者需求以「拖曳即作用於目前影格的關鍵影格」為主；關閉時的行為比照 Spine 編輯器 |
| D41 | K 幀寫入位移、旋轉、縮放三個通道（4.x 數值：位移與旋轉為相對設置值的差，縮放為倍率），時間對齊目前影格；同時間已有關鍵影格則只更新數值、保留曲線 | 對應 4.x 時間軸定義；保留美術原本調好的曲線 |
| D42 | `K` 為 K 幀選取骨骼、`Shift+K` 為全部骨骼；未採用需求範例中的 `L`，因 `L` 已是循環播放快捷鍵 | 避免既有快捷鍵衝突 |
| D43 | 關鍵影格以「骨骼 + 通道 + 索引」識別；移動到已有關鍵影格的時間會取代它（比照 Spine），移動整體不可早於 0 秒；插入、移動、刪除後，相關區段的 4.x 絕對座標貝茲控制點依新的時間與數值範圍等比例換算 | 4.x 曲線控制點為絕對值，不換算會讓曲線變形或超出區段 |
| D44 | 每次關鍵影格操作只重寫受影響的骨骼時間軸，且未變更的關鍵影格保留原始 JSON 物件 | 延續第 1 階段的無損原則，未動到的資料輸出不變 |
| D45 | 定位時若時間的 float32 值大於 float64 值，改用 float32 值 | 執行環境以 float32 儲存關鍵影格時間，定位到剛好的關鍵影格時間會被判定為「早於該影格」而顯示前一個姿勢 |
| D46 | 關鍵影格以「目標 + 通道 + 索引」識別，目標依通道歸屬為骨骼名、插槽名或固定的 `events`；同名的骨骼與插槽以通道區分，律動表列 id 以 `slot:` 前綴區分 | 讓骨骼、插槽、事件共用同一套選取、移動、刪除、複製貼上與曲線邏輯 |
| D47 | 曲線面板以正規化控制桿編輯，同一形狀套用到區段的每個數值通道；Spine 單段貝茲無法多次彈跳，「回彈」預設採超出後回彈的單段曲線 | 符合 Spine 4.x 曲線格式；明確告知限制，不自行改變為多個關鍵影格 |
| D48 | 插槽顏色 K 幀依既有時間軸選通道：已有 `rgba2` / `rgb2` 則寫雙色並保留目前暗色，已有 `rgb` 或 `alpha` 且沒有 `rgba` 則分別寫入，否則寫 `rgba` | 避免同一插槽同時存在互相覆蓋的顏色時間軸 |
| D49 | 插槽部件、顏色與事件的修改一律直接寫入關鍵影格，不受自動 K 幀開關影響 | 這些操作本身就是明確的「在此影格設定」動作，沒有暫存姿勢可對應 |
| D50 | 事件時間軸允許同一時間多個事件，移動、貼上不會互相取代 | Spine 允許同一影格觸發多個事件，取代會遺失資料 |
| D51 | 依影格定位時加上 1e-6 秒 | 關鍵影格時間以 6 位小數儲存，可能比影格的精確時間稍晚，造成定位到該格時部件等步進通道仍顯示前一個狀態 |
| D52 | IK 目標拖曳不另寫解算器，直接使用 4.2 執行環境在更新世界變換時套用限制器的結果 | 與遊戲端執行環境行為完全一致 |
| D53 | 限制器設置值與關鍵影格只開放 IK 與變換限制器；變換限制器關鍵影格六個權重一律明確寫出 | 依需求範圍；4.2 讀取時 `mixY`、`mixScaleY` 省略會沿用 X 值，明確寫出避免誤解 |
| D54 | 繪製順序只以動畫關鍵影格調整，不改設置順序；位移以最長遞增子序列求最少項 | 改設置順序會改變所有既有繪製順序關鍵影格的意義 |
| D55 | 網格變形以世界座標拖曳換算為每個權重項的骨骼區域位移；變形、插槽、限制器的修改一律直接寫入關鍵影格 | 加權網格的正確表示方式；與第 4 階段 D49 一致 |
| D56 | 變形時間軸目標以「皮膚|插槽|部件」組成，皮膚取目前套用中且提供此部件的皮膚 | 4.x 變形時間軸依皮膚分組 |
| D57 | 皮膚改名同步更新連結網格的 `skin` 欄位、各動畫變形時間軸的皮膚鍵與套用中的皮膚；`default` 皮膚不可改名 | 避免檔案失效；`default` 為執行環境保留名稱 |
| D58 | 匯出預覽與實際匯出共用同一套擺放計算（`core/export/placement.ts`）：序列以全部取樣影格的聯集範圍決定畫布，單張以目前姿勢；水平與垂直偏移以輸出像素為單位，正值向右、向下 | 預覽所見即輸出結果；以像素為單位才能與寬高設定直接對照 |
| D59 | 預覽以獨立離屏環境縮小渲染（最長 360x300），依資產、編輯版本、皮膚、覆寫、Region 替換與動作設定快取已準備好的骨架；連續變更合併為最後一次請求，關閉對話框時釋放 | 拖曳滑桿或輸入數值時不重複重建骨架，也不排隊堆積渲染 |
| D61 | 匯出尺寸新增「自訂裁剪範圍」，比照 Spine 編輯器匯出的檢視區：以骨架座標 X、Y（左下角）、寬、高指定裁剪範圍，輸出尺寸 = 裁剪範圍 x 縮放倍率；預覽顯示比輸出更大的區域、框外變暗，拖曳邊或角只移動那一邊、角色大小不變，拖曳框內平移裁剪範圍，雙擊或「重設為角色範圍」以向外取整的角色範圍重設；拖曳期間鎖定預覽視野，放開後重新適配 | 使用者指出前一版（對稱縮放並自動切換指定寬高、會連帶縮放角色）與 Spine 原版做法不同，並提供原版截圖 |
| D62 | 選取物件按 Delete（或屬性面板「刪除」）即刪除：骨骼連同子骨骼與其插槽、插槽連同各皮膚部件、部件從所有皮膚移除、IK / 變換限制器、非 default 皮膚、事件、動畫；同步清除時間軸、皮膚引用、路徑 / 物理限制器、裁切結束插槽與變形時間軸，繪製順序關鍵影格以刪除後的插槽順序重算最少位移，加權網格的骨骼索引重新對應；根骨骼與仍被其他網格權重綁定的骨骼拒絕刪除；Backspace 只刪關鍵影格 | 比照 Spine 編輯器；整筆刪除為單一可復原步驟，避免留下讓執行環境載入失敗的懸空引用；Backspace 容易誤觸，不用於刪除物件 |
| D60 | 對齊提供「置中」與「底部對齊」兩種；底部對齊讓內容底緣貼齊畫布底部（留白仍保留） | 角色腳底對齊為遊戲素材最常見需求；其他位置以偏移微調 |
| D32 | 專案 ZIP 匯出 JSON、原始圖集文字與以無損讀回重新編碼的貼圖頁面；Region 熱替換不寫入 | 熱替換定位為預覽工具；寫入需重新打包圖集，列入後續 |

---

## 3. 驗證紀錄

以下四類分開記錄。只有「程式測試」與「腳本觸發畫面」有實際執行證據；「人工驗收」尚未進行。

### 3.1 實作完成

| 模組 | 狀態 |
| --- | --- |
| AssetLoader：檔案選取、資料夾選取、拖曳（含資料夾與 ZIP）、配對、版本偵測、多骨架切換 | 完成 |
| StageRenderer：WebGL、高 DPI、縮放、平移、適配、1:1、背景、座標軸 | 完成 |
| 示範骨架：18 骨骼、18 插槽、7 皮膚、7 動作、3 事件、網格、碰撞框、顏色與部件時間軸 | 完成 |
| MotionPlayer / PlaybackController：清單、播放、循環、0.1x 至 2.0x、逐影格、時間軸定位、事件標記 | 完成 |
| Mix Lab：defaultMix、A 至 B 過渡、停留時間、混合進度、配對表、Track 1 至 3 疊加 | 完成 |
| Skins & Attachments：單選、疊加組裝、插槽隱藏、強制部件、高亮 | 完成 |
| Debug Overlays：骨骼、插槽點位、區域、網格外殼、網格線框、碰撞框、路徑、裁切 | 完成 |
| Event Monitor：參數、生命週期、篩選、暫停、清除、計數 | 完成 |
| AssetExporter：透明 PNG、PNG 序列 ZIP + manifest、WebM、取消 | 完成 |
| 安全性：CSP meta、預覽安全標頭、輸入與解壓上限 | 完成 |
| Atlas Toolkit：頁面預覽、Region 清單、四種旋轉與留白還原的無損拆解、單張下載、整包 ZIP + manifest、拖入或選檔熱替換、還原、替換同步套用到匯出 | 完成 |
| Auditor：15 項指標、優良 / 警告 / 過重分級、整體評級、發現清單、皮膚 / 插槽 / 替換變更自動重算 | 完成 |
| Audio Sync：音效載入與拖放、波形（面板與主時間軸）、起音點、播放游標、偏移與自動建議、同步試聽、事件對齊表、事件綁定觸發與計數、同名自動綁定 | 完成 |
| Spine 3.6 二進位自動升級：讀取器、欄位與時間軸對應、曲線與旋轉換算、「已升級 4.2」徽章與提示、不支援版本的明確錯誤 | 完成 |
| 繁中 Spine 式介面：階層樹、屬性面板、骨骼與插槽高亮、進階工具側欄、播放列動畫選單、畫面快捷顯示（骨骼 / 網格 / 碰撞框） | 完成 |
| 匯出對話框：四種類型、指定寬高或倍率、影格速率、起訖影格、留白、透明或純色背景、Sprite Sheet 每列格數 | 完成 |
| 匯出即時預覽：左右雙欄、依寬高 / 留白 / 背景即時渲染、影格滑桿、畫布邊界 / 留白 / 內容範圍 / 目前姿勢輔助線、超出畫布警告、置中 / 底部對齊與水平垂直偏移（同步套用到實際匯出） | 完成並已驗收 |
| 匯出預覽裁剪框：自訂裁剪範圍模式（X / Y / 寬 / 高 / 縮放倍率 / 重設為角色範圍）、預覽框外變暗、單邊拖曳與平移、雙擊重設 | 完成，待人工驗收 |
| 選取物件按 Delete 刪除：骨骼、插槽、部件、限制器、皮膚、事件、動畫，含引用清理、可復原，屬性面板「刪除」按鈕 | 完成，待人工驗收 |
| 動畫編輯第 1 階段：可編輯文件模型（`src/core/editor/*`）、可逆修補運算、編輯歷史與工作階段、12 種編輯指令與引用更新、無損序列化、專案 ZIP、`EditorFeature` 重建執行環境並保留檢視狀態、屬性面板可編輯欄位（Enter 套用 / Esc 取消）、頂列復原 / 重做 / 儲存 JSON / 未儲存標記、「歷史」頁籤、Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y / Ctrl+S、離開頁面提醒 | 完成 |
| 動畫編輯第 2 階段：設置模式（停止動畫、設置姿勢、自動離開）、位移 / 旋轉 / 縮放控制軸繪製與命中、拖曳即時預覽與子骨骼跟隨、屬性面板與畫面提示即時數值、放開單筆歷史、Esc 取消、吸附、畫面點選骨骼並展開階層樹、W / E / R / S 快捷鍵、游標隨把手變化 | 完成 |
| 動畫編輯第 3 階段：動畫模式（互斥、多軌停用與恢復、影格對齊）、骨骼關鍵影格通道模型與無損序列化、K 幀（選取 / 全部、自動 K 幀與暫存姿勢）、控制軸與屬性面板寫入目前影格、律動表（骨骼 / 通道列、收合、刻度與播放頭、點選 / 多選 / 框選、拖曳移動、刪除、複製貼上）、快捷鍵 A / K / Shift+K / Delete / Ctrl+C / Ctrl+V、全部接入復原 / 重做 | 完成 |
| 動畫編輯第 4 階段：曲線模型（正規化 / 絕對座標、取樣、8 種預設）、曲線面板（類型、控制桿拖曳、預設、多段套用）、律動表區段類型標示、通道模型擴充（插槽部件 / RGBA / RGB / 透明度 / 雙色、事件）、插槽「目前影格」部件 / 顏色 / 透明度 K 幀、事件新增與參數編輯、插槽與事件列 | 完成 |
| 動畫編輯第 5 階段：限制器群組與屬性（設置值、動畫權重滑桿 K 幀）、IK 目標拖曳即時解算、繪製順序關鍵影格（往前 / 往後 / 還原、最少位移）、網格頂點選取與拖曳變形（含加權網格）、變形 / 限制器 / 繪製順序律動表列、新增空白動畫、新增 / 改名皮膚與部件綁定 | 完成 |

### 3.2 程式測試（2026-10-18 於本機容器執行 `npm run verify`，全部通過；測試角色已刪除）

| 檢查 | 指令 | 結果 |
| --- | --- | --- |
| 型別檢查 | `npm run typecheck` | 通過，0 錯誤 |
| 無註解規則 | `npm run lint:comments` | 通過 |
| 零 Emoji 規則 | `npm run lint:emoji` | 通過 |
| 單元與元件測試 | `npm run test` | 36 檔案、330 測試通過、2 略過（略過者為參考資產測試，測試角色已刪除；第 5 階段新增 3 檔 15 測試；匯出預覽新增 2 檔 7 測試；匯出裁剪框與 Delete 刪除新增 2 檔與相關測試） |
| 覆蓋率 | `npm run test:coverage` | 全部 Statements 85.79%、Lines 87.66%；`core/animation` 98.01% Lines、`core/gizmo` 100% Lines、`core/editor` 98.68% Lines、`controller/features` 97.51% Lines；`core/legacy`、`core/atlas`、`core/audio`、`core/audit` 與前次相同 |
| 正式建置 | `npm run build` | 通過，0 錯誤 0 警告 |
| E2E | `npm run test:e2e` | 63 測試通過、3 略過（略過者為兩個 3.6 參考角色的載入與存檔測試，測試角色已刪除；含第 5 階段新增 4 項、匯出預覽新增 2 項、裁剪框拖曳 1 項、Delete 刪除 1 項）（Chromium 1194 headless，SwiftShader） |

覆蓋率說明：`StageRenderer`、`debugOverlay`、`OffscreenSpineRenderer`、`exporters`、`browserFiles`、`download`、`pixelReader`、`audioBackend` 依賴 WebGL、DOM、MediaRecorder 與 Web Audio，單元覆蓋率為 0%，由 E2E 實際執行驗證（渲染、除錯層、檔案載入、PNG / ZIP / WebM 下載與內容解碼、圖集逐像素比對、音效解碼與觸發）。

第二階段新增的驗證重點：

- 圖集切割的旋轉映射以 Spine 4.2 執行環境 `RegionAttachment.updateRegion` 計算的 UV 角點比對，確認與官方慣例一致。
- E2E 將下載的碎圖 ZIP 逐像素比對 Node 端以同一演算法從原始貼圖切出的結果，示範貼圖與 Alpha 1 至 255 漸層頁面皆完全一致。
- 音訊測試以程式合成的點擊音 WAV 驗證起音點誤差小於 6 毫秒；瀏覽器端以 Web Audio 實際解碼。

動畫編輯第 1 階段的驗證重點：

- 無損：示範 JSON 載入後直接序列化與原檔逐位元組相同；6 種指令連續執行後跳回第 0 步，序列化結果與原始文件逐位元組相同。
- 執行環境等價：文件重新以 `SkeletonJson` 解析後，骨骼、插槽、皮膚部件、事件、每條時間軸的影格數值與原始 `SkeletonData` 完全一致；3.6 升級文件同樣驗證。
- E2E：編輯 torso 旋轉後畫面改變，復原後畫面截圖與編輯前逐位元組相同，重做後與編輯後相同；下載的 JSON 與專案 ZIP 解壓後檢查內容；本機 `hero_kedaya`（3.6.53）存成 4.2 JSON 後重新載入，9 個動作完整。
- HawkScan（DAST）未執行：環境未設定 `HAWK_API_KEY`。本階段未新增任何網路功能，CSP 斷言仍通過。

動畫編輯第 5 階段的驗證重點：

- 繪製順序：50 組隨機排列經位移輸出再以 Spine 讀取演算法還原完全一致；以 4.2 執行環境重播得到指定順序。
- 網格變形：示範披風為加權網格，只拖曳 2 個頂點時這 2 個頂點的世界位移恰為 (7, -3)、其餘頂點不動；寫入關鍵影格後以 4.2 執行環境重播位置相同。
- IK：測試用骨架（示範角色加上 `aim` 骨骼與 IK、變換限制器，位於 `tests/support/ikFixture.ts`，不屬於產品內建資產）拖曳 `aim` 時手臂骨骼世界旋轉改變超過 10 度。
- E2E 以真實滑鼠：拖曳 IK 目標後手肘位置改變；繪製順序往後 8 層後全部復原，畫面逐像素回到原狀；拖曳網格頂點寫入變形關鍵影格，未選取的頂點座標不變。

動畫編輯第 4 階段的驗證重點：

- 以 4.2 執行環境重播：示範骨架 idle 的 torso 旋轉套用緩入曲線後，第 0.3 秒的旋轉明顯落後線性；部件關鍵影格在第 0.4 秒隱藏、第 0.7 秒恢復；RGBA 關鍵影格的透明度內插值正確；新增的事件在播放時實際觸發。
- 曲線正規化與 4.x 絕對座標換算以手算值比對（含平坦區段與多通道）；RGBA 曲線為 16 個數。
- E2E 以真實滑鼠：套用緩入預設後畫面改變，拖曳控制桿後兩次復原，畫面截圖與線性時逐像素相同；插槽部件隱藏後復原畫面逐像素相同；事件新增並編輯參數後下載 JSON 得到 `{ time: 0.333333, name: 'hit', int: 9, string: 'critical' }`。

動畫編輯第 3 階段的驗證重點：

- 以示範骨架在 idle 第 0.4 秒為 head K 幀後，重新以 4.2 執行環境解析並定位到該時間，位置、旋轉、縮放與目標姿勢誤差小於 0.001。
- 關鍵影格插入、取代、移動撞格、刪除後的貝茲控制點以手算值逐一比對；未修改的關鍵影格輸出與原始 JSON 相同。
- E2E 以真實滑鼠：旋轉控制軸後律動表出現該影格菱形，復原後菱形消失且畫面截圖與操作前逐像素相同；拖曳菱形 5 格後 Ctrl+Z 還原；框選 4 個關鍵影格、複製貼上到第 3 格再刪除；關閉自動 K 幀時出現暫存提示，按 K 後三個通道菱形出現，下載的 JSON 含該關鍵影格。

動畫編輯第 2 階段的驗證重點：

- 純數學：仿射換算與反算、各模式把手位置與命中、父骨骼旋轉 90 度且縮放 2 倍時的位移換算、旋轉連續超過 360 度、鏡像父骨骼反向、單軸與等比縮放、吸附與最小縮放。
- 控制器（真實示範骨架）：拖曳 torso 時 torso 與子骨骼 head 世界座標同步位移 30 / 20；拖曳中歷史為 0 筆，放開後恰為 1 筆；旋轉 30 度後 head 繞 torso 原點轉 30 度；復原後世界座標回到原值。
- E2E 以真實滑鼠拖曳：拖曳中屬性面板數值即時改變且復原按鈕仍停用；放開後歷史出現「移動骨骼 torso」；復原後畫面截圖與拖曳前逐像素相同。

### 3.3 腳本觸發畫面

- 以 Playwright 截圖檢視：示範資產載入、attack 動作加全部除錯線框、walk 動作事件紀錄頁籤、spineboy 載入後的 run 動作與 footstep 事件、ATLAS 頁籤（頁面預覽與 Region 清單）、AUDIO 頁籤（step.wav 自動綁定、波形、對齊表 near / aligned、主時間軸波形）、AUDIT 頁籤（評級優良、15 項指標）。
- 以官方 Spine 4.2 範例 `spineboy-pro.skel` 與 `spineboy-pro.json`（從 spine-runtimes 4.2 分支下載至暫存目錄，未提交）驗證：二進位與 JSON 皆可載入，67 骨骼、52 插槽、11 動作、版本 4.2.22、footstep 事件正確記錄、渲染正常。
- 使用者上傳的 `hero_kedaya.skel`（3.6.53，100 骨骼、67 插槽、9 動作）與 `hero_miaowahua.skel`（3.6.52，302 骨骼、180 插槽、4 個 IK、7 動作）：二進位逐位元組完整解析（無剩餘位元組），截圖確認貼圖、特效與 IK 渲染正常，E2E 確認事件 `hit` 與 `999999` 觸發。
- 第 4 階段：以 Playwright 截圖檢查過渡曲線面板（控制桿、預設按鈕）、事件列、插槽列與區段線條樣式；據此將律動表加高為 300 像素、縮小曲線圖，避免面板需要捲動。
- 第 3 階段：以 Playwright 截圖檢查動畫模式工具列、畫面提示「動畫模式・自動 K 幀」、律動表（骨骼與通道列、刻度、播放頭、通道顏色菱形）與屬性面板「目前影格姿勢」區塊。
- 第 2 階段：以 Playwright 截圖檢查設置模式工具列、位移（紅 X / 綠 Y 箭頭與中心方塊）、旋轉（黃色環與把手）、縮放（方頭軸與中心方塊）三種控制軸外觀與畫面提示。
- 第 1 階段：以 Playwright 截圖檢查屬性面板的可編輯欄位（骨骼設置姿勢、插槽顏色 / 預設部件 / 混合模式）、頂列「未儲存變更」標記與復原 / 重做 / 儲存 JSON、「歷史」頁籤（8 個頁籤在 400px 側欄中排成兩列）。
- 此為腳本驅動的畫面檢查，不等同人工操作驗收。

### 3.4 人工驗收

第 1 至 4 階段項目依使用者回報「該階段驗收通過」勾選，使用者未逐項回報細節；其餘未勾選項目尚未驗收。

待使用者以實際專案資產操作確認：

- [ ] 實際產線 `.skel` / `.json` + 多頁圖集載入
- [ ] 預乘 Alpha（PMA）資產的邊緣顏色
- [ ] 混合時間調整的視覺手感
- [ ] 多軌疊加（上下半身分層）是否符合遊戲端行為
- [ ] 皮膚組裝與插槽覆寫是否能抓出組裝瑕疵
- [ ] 事件時間戳記與遊戲端音效 / 判定對齊
- [ ] PNG 序列與 WebM 匯入目標工具（例如引擎或剪輯軟體）後的透明度與尺寸
- [ ] 介面文字、配色、資訊密度與可讀性
- [ ] 真實 GPU 環境下的效能（測試環境為軟體渲染，約 14 至 15 FPS，不代表實機表現）
- [ ] 兩個 3.6 角色的每個動作與 Spine 3.8.75 編輯器畫面逐一比對（姿勢、曲線節奏、特效顯示順序、事件時間）
- [ ] 新介面是否直覺：階層樹、屬性面板、進階工具的位置與用語
- [ ] 匯出預覽裁剪框：與 Spine 3.8 匯出檢視區的操作手感比較；裁剪範圍與縮放倍率的匯出尺寸、位置是否與預覽一致
- [ ] Delete 刪除：在實際角色上刪除骨骼、插槽、部件後，存出的 JSON 能否在 Spine 4.2 編輯器與遊戲端正常開啟
- [x] 匯出即時預覽：調整寬高、留白、對齊與偏移時預覽與實際匯出結果一致，輔助線與裁切警告是否清楚
- [ ] 匯出對話框：指定寬高、影格範圍、背景色、Sprite Sheet 在目標引擎中的使用結果
- [ ] 以實際產線圖集（含 rotate 與 trim）拆解碎圖，與美術原始切圖比對
- [ ] Region 熱替換（換武器、表情）在實際角色上的視覺結果
- [ ] 效能基準數值是否符合專案目標平台，必要時調整 `budgets.ts`
- [ ] 實際音效（MP3 / OGG）與事件對齊的聽感、偏移建議是否合理
- [ ] 實際喇叭輸出的同步試聽延遲（測試環境無音訊輸出，只驗證排程與觸發計數）
- [x] 動畫編輯第 1 階段：以兩個 3.6 角色修改骨骼數值、改名、複製 / 刪除動畫後，復原 / 重做與畫面是否一致
- [x] 第 1 階段：儲存的 JSON 以 Spine 4.2 編輯器「匯入資料」開啟是否正常（本環境沒有 Spine 編輯器，只驗證 4.2 執行環境可讀取）
- [x] 第 1 階段：專案 ZIP 匯入遊戲引擎是否可直接使用
- [x] 第 5 階段：妙蛙花（4 個 IK）拖曳 IK 目標與權重 K 幀的結果，在 Spine 4.2 編輯器比對
- [x] 第 5 階段：轉身時手臂前後換層的繪製順序關鍵影格、網格變形手感（頂點大小與命中範圍）
- [x] 第 5 階段：新增空白動畫、新增皮膚與綁定部件後存出的 JSON 在遊戲端使用
- [x] 第 4 階段：以兩個 3.6 角色調整曲線（預設與控制桿），在 Spine 4.2 編輯器開啟比對曲線形狀
- [x] 第 4 階段：眨眼等部件切換、受擊閃色與淡出、事件新增與參數在遊戲端的結果
- [x] 第 4 階段：曲線面板與律動表高度、配色是否易讀
- [x] 第 3 階段：以兩個 3.6 角色在動畫模式 K 幀、拖曳 / 框選 / 複製貼上關鍵影格，確認播放結果與預期一致
- [x] 第 3 階段：存出的 JSON 以 Spine 4.2 編輯器開啟，確認關鍵影格時間、數值與原有曲線形狀
- [x] 第 3 階段：自動 K 幀預設開啟、`K` / `Shift+K` 等快捷鍵與律動表操作是否順手
- [x] 第 2 階段：三種控制軸在兩個 3.6 角色上的手感（把手大小、命中範圍、吸附值、旋轉方向），特別是有鏡像或非等比縮放父骨骼的部位
- [x] 第 2 階段：設置模式進出時動畫與多軌的恢復是否符合預期
- [x] 第 2 階段：畫面點選骨骼在骨骼密集處是否選得到想要的骨骼
- [x] 第 1 階段：屬性面板輸入方式（Enter / 移開游標套用、Esc 取消）、歷史頁籤與快捷鍵是否直覺

---

## 4. 測試入口

| 目的 | 指令或位置 |
| --- | --- |
| 全部檢查 | `npm run verify` |
| 開發預覽 | `npm run dev`，首頁自動載入示範資產 |
| 正式建置預覽（含 CSP） | `npm run build && npm run preview` |
| 單元測試 | `tests/unit/*.test.ts`（Node）、`tests/unit/*.test.tsx`（jsdom）；編輯相關為 `editorCore`、`editorSerialize`、`editorController`、`editorPanels`、`gizmoCore`、`gizmoController`、`gizmoPanels`、`keyframeCore`、`animateController`、`dopesheetPanels`、`curveChannels`、`stage4Controller`、`curvePanels`、`stage5Core`、`stage5Controller`、`stage5Panels` |
| E2E | `tests/e2e/*.spec.ts`，共用 fixture 在 `tests/e2e/fixtures.ts`；編輯相關為 `editor.spec.ts`、`gizmo.spec.ts`、`animate.spec.ts`、`curves.spec.ts`、`advanced.spec.ts` |
| 測試輔助 | `tests/support/fakeTexture.ts`、`fakeEnvironment.ts`（含 FakeAudio 與 fakeImaging）、`demoFiles.ts`、`pngDecode.ts`、`wav.ts`（WAV 合成與解析） |
| 規則檢驗 | `scripts/run-rule.mjs`，規則在 `scripts/rules/` |
| E2E 環境變數 | `PW_CHROMIUM_PATH`、`E2E_PORT`、`E2E_SKIP_BUILD` |

---

## 5. 動畫編輯分階段計畫

使用者選擇「完整動畫編輯」。每階段完成後需人工驗收再進下一階段，編輯結果一律存成 Spine 4.2 JSON（3.6 舊檔升級後也是存 4.2）。

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| 0 | 繁中 Spine 式介面、階層樹與屬性面板、匯出對話框 | 完成 |
| 1 | 可編輯文件模型：載入時保留 4.2 JSON 結構、復原 / 重做、存成 4.2 JSON | 完成並已驗收。附帶完成：屬性面板數值輸入（原屬第 2 階段）、動畫重新命名 / 複製 / 刪除（原屬第 4 階段）。未做：4.2 二進位讀取器（見 D30） |
| 2 | 設置模式：在畫面上拖曳調整骨骼位置、旋轉、縮放（屬性面板數值輸入已於第 1 階段完成） | 完成並已驗收。未做：斜切與長度拖曳、多骨骼選取 |
| 3 | 動畫模式：在目前時間為骨骼設定 / 刪除關鍵影格，下方改為逐骨骼的關鍵影格表（Dopesheet），可拖曳移動關鍵影格 | 完成並已驗收。另含框選、複製貼上、自動 K 幀 |
| 4 | 曲線編輯（線性、階梯、貝茲）、部件與顏色關鍵影格、事件關鍵影格（複製 / 刪除 / 重新命名動畫已於第 1 階段完成） | 完成並已驗收。未做：雙色暗色編輯介面 |
| 5 | 進階：IK / 限制器關鍵影格、網格變形、繪製順序、皮膚編輯、新增空白動畫 | 完成並已驗收（最終階段）。未做：Path / Physics 限制器、設置姿勢繪製順序、頂點框選 |

## 6. 待辦與建議後續

| 優先 | 項目 |
| --- | --- |
| 高 | 依人工驗收結果調整介面與預設值 |
| 中 | 雙色暗色的編輯介面、斜切關鍵影格建立、Path / Physics 限制器、網格頂點框選 |
| 中 | 律動表縮放與水平捲動跟隨播放頭、多軌動畫在律動表中切換 |
| 低 | Spine 4.2 二進位讀取器（使用者確認維持延後，見 D30） |
| 低 | 控制軸支援斜切與長度拖曳、多骨骼選取、世界 / 父空間軸向切換 |
| 低 | 專案 ZIP 寫入 Region 熱替換結果（需重新打包圖集頁面） |
| 低 | 編輯歷史保存到瀏覽器儲存空間，重新整理後可還原 |
| 中 | 支援 Spine 4.3（可透過 npm alias 並存 4.2 與 4.3 執行環境，依版本自動選用） |
| 中 | 3.7 / 3.8 二進位與 3.x JSON 的自動升級（同 D19 架構，需各自的格式讀取器與樣本資產） |
| 中 | 序列幀與 WebM 匯出包含多軌疊加與指定過渡 |
| 中 | 以 WebCodecs 取代 MediaRecorder，產生逐格精確且不受實際時間影響的 WebM |
| 低 | 事件紀錄匯出 CSV / JSON |
| 低 | 時間軸顯示多軌與混合區段 |
| 低 | 主程式碼切分（目前單一 JS 約 540 KB，gzip 約 163 KB） |
| 低 | 物理約束參數即時調整面板 |
| 中 | Region 熱替換保留原裁切偏移選項、Sequence 部件替換 |
| 低 | 圖集拆解輸出 `split` / `pad` 九宮格資訊 |
| 低 | 效能基準可在介面切換預設檔（低階 / 中階 / 高階） |
| 低 | 起音點偵測加入頻譜通量法以支援長音 |

---

## 7. 重要限制與規範

- 原始碼、型別定義、測試、腳本與設定檔不得出現任何註解；所有文件與介面不得出現 Emoji。兩者皆由 `npm run lint:rules` 與單元測試強制檢查，新增檔案會自動納入掃描。
- 新增網路相關功能前必須先修改 `csp.config.ts` 並更新 E2E 中的 CSP 斷言；預設政策為禁止一切網路連線。
- 提交者身分與訊息規範見決策 D12；未取得授權不得發布或部署。
- 示範骨架為程序化產生，不包含任何第三方美術；不要將 Esoteric Software 的範例資產提交進儲存庫。
- E2E 依賴可用 WebGL 的 Chromium；無 GPU 環境需 `--use-angle=swiftshader --enable-unsafe-swiftshader`（已寫入 `playwright.config.ts`）。

---

## 8. 檔案地圖

| 需求模組 | 主要檔案 |
| --- | --- |
| AssetLoader | `src/core/assets/*`、`src/components/layout/TopBar.tsx`、`src/components/stage/StageView.tsx` |
| StageRenderer | `src/core/render/StageRenderer.ts`、`camera.ts`、`src/components/stage/ViewportToolbar.tsx` |
| Demo Asset | `src/core/demo/*` |
| MotionPlayer / PlaybackController | `src/core/spine/SpineInstance.ts`、`src/components/tree/HierarchyPanel.tsx`、`src/components/stage/PlaybackBar.tsx`、`TimelineScrubber.tsx` |
| Animation Mix Lab | `src/components/panels/MixLabPanel.tsx`、`InspectorController` 中 transition / mixPair / layer 方法 |
| Skins & Attachments | `src/components/tree/HierarchyPanel.tsx`、`src/components/properties/PropertiesPanel.tsx`、`src/components/panels/SlotInspectorPanel.tsx` |
| Debug Overlays | `src/core/render/debugOverlay.ts`、`src/components/panels/DebugPanel.tsx` |
| Event Monitor | `src/components/panels/EventMonitorPanel.tsx`、`SpineInstance` 事件監聽 |
| AssetExporter | `src/core/export/*`（擺放計算 `placement.ts`、預覽 `ExportPreviewer`）、`src/controller/features/exportPreviewFeature.ts`、`src/components/export/ExportDialog.tsx`、`ExportPreviewPanel.tsx` |
| 版面 | `src/components/layout/*`（Workbench、TopBar、AdvancedDrawer、StatusBar） |
| Atlas Toolkit | `src/core/atlas/*`、`src/core/image/*`、`src/controller/features/atlasFeature.ts`、`src/components/panels/AtlasPanel.tsx` |
| Auditor | `src/core/audit/*`、`src/controller/features/auditFeature.ts`、`src/components/panels/AuditPanel.tsx` |
| Audio Sync | `src/core/audio/*`、`src/controller/audioBackend.ts`、`src/controller/features/audioFeature.ts`、`src/components/panels/AudioPanel.tsx`、`src/components/stage/WaveformCanvas.tsx` |
| 安全性 | `csp.config.ts`、`vite.config.ts`、`src/core/assets/archive.ts`、`browserFiles.ts` |
| 狀態與控制 | `src/store/*`、`src/controller/*` |
| 限制器、繪製順序、網格變形、皮膚與新增動畫 | `src/core/animation/drawOrder.ts`、`meshDeform.ts`、`src/core/editor/structureCommands.ts`、`src/controller/features/meshFeature.ts`、`AnimateFeature` 的限制器與繪製順序方法、`src/components/properties/AdvancedEditors.tsx`、測試骨架 `tests/support/ikFixture.ts` |
| 曲線編輯與擴充通道 | `src/core/animation/curveShape.ts`、`channels.ts`（通道規格）、`keyCommands.ts`（`setCurves`、`updateKeyExtra`）、`src/components/dopesheet/CurveEditor.tsx`、`EventKeyEditor.tsx`、`PropertiesPanel` 的 `SlotKeyEditor`、`AnimateFeature` 的插槽與事件方法 |
| 動畫模式與律動表 | `src/core/animation/*`、`src/controller/features/animateFeature.ts`、`InspectorController.setAnimateMode`、`src/components/dopesheet/Dopesheet.tsx`、`PropertiesPanel` 的 `BonePoseEditor` |
| 設置模式與控制軸 | `src/core/gizmo/*`、`src/core/render/gizmoOverlay.ts`、`src/controller/features/gizmoFeature.ts`、`InspectorController.setSetupMode`、`src/components/stage/StageView.tsx`、`ViewportToolbar.tsx`、`StageHud.tsx` |
| 動畫編輯 | `src/core/editor/*`（json、patch、history、session、document、commands、serialize、projectArchive）、`src/controller/features/editorFeature.ts`、`src/components/edit/EditFields.tsx`、`src/components/properties/PropertiesPanel.tsx`、`src/components/panels/HistoryPanel.tsx`、`src/hooks/useUnsavedGuard.ts` |
