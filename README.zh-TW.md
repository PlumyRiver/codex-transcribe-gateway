# Codex Transcribe Gateway

把 Sub2API 整合中的 GPT Transcribe 與後端 OAuth 登入流程拆成可獨立部署的服務。每位部署者自行登入自己的帳號；不附帶任何帳號權限、正式金鑰或用戶資料。

**目前能做的事：** 上傳音檔、要求 `gpt-transcribe`、回傳逐字稿及上游原始 usage；憑證加密保存，後端自行刷新；預設 10 併發，上游授權／限流／服務錯誤後冷卻五分鐘。沒有另計費 API key 備援，也不會自動重送音訊。

**權限界線：** OAuth 登入成功不等於有語音轉錄權限。這是使用現有 Codex 公開 OAuth client 的實驗性整合，不代表官方承諾所有帳號都支援。有些帳號會回 `billing_not_active`。沒有上游 model 回報時，明確保留 `unreported`，不能把請求名稱當成已驗證模型。

## 本機啟動

需要 Node.js 22 以上：

```sh
npm ci --ignore-scripts
npm run init
npm run login
npm start
```

依終端印出的 localhost 網址開啟官方登入頁。授權碼會自動交換並加密保存，不要把 callback 網址、Token 或 Cookie 貼到聊天／GitHub Issue。登入流程不讀寫你平常使用的 Codex 設定。

另開終端測試已知內容的音檔：

```sh
npm run smoke -- /path/to/known-speech.wav
```

要核對實際逐字稿，不能只看 HTTP 200。第一次建立的 `.env` 不會被覆寫；妥善保存其中的加密金鑰。憑證不會放入 Git。

## 後端獨立登入

```sh
docker compose build
docker compose run --rm --service-ports login
docker compose up -d gateway
```

在遠端主機使用時，先從自己的電腦建立 SSH 通道：

```sh
ssh -L 1455:127.0.0.1:1455 user@your-server
```

於 SSH 內執行登入命令，電腦瀏覽器開啟終端顯示的 localhost 網址。成功後即可關閉 SSH，後端會以自己的獨立授權繼續運作。若需重登，先停止 gateway，登入後再啟動。

命名 volume 保存加密憑證；同一份憑證只交給一個刷新管理者。不要把目前正在使用的 Codex refresh token 複製成兩份同時跑。程式的儲存鎖只能保護同一個資料目錄，不能協調兩份不同的副本。

## 呼叫與錯誤

API：`POST /v1/audio/transcriptions`，使用你自己產生的 `GATEWAY_TOKEN`。認證、檔案格式、提示參數、錯誤分類與 curl 範例見 [英文 README](README.md)。

- `gateway_busy`：本機名額滿，沒有送到上游。
- `upstream_cooldown`：正在冷卻，沒有重送音訊。
- `billing_not_active`／403：先查上游帳號權限；不能保證重登就能修好。
- `upstream_challenge_required`：上游要求驗證，本專案不繞過安全挑戰。
- `reportedModel=null`：上游沒有交代實際模型，不應宣稱與另一條 API 模型完全相同。

預設 10 併發是部署設定，不是所有帳號的上限實測，也不是無限額度保證。

另附 [Sub2API 轉錄補丁](docs/sub2api.md)、[部署與持久化說明](docs/deployment.md)及[測試界線](docs/validation.md)。本版本使用持久磁碟，尚未提供 serverless 外部憑證儲存實作。
