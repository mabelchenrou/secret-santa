# Secret Santa｜秘密交換禮物網站

這是一個可部署、跨裝置共用的交換禮物網站。前端使用 React + Vite，資料庫與匿名登入使用 Supabase。

## 功能
- 主辦人建立活動、設定日期與預算
- 朋友透過同一個邀請網址加入，填寫姓名與注音開頭願望
- 主辦人開始抽籤；每個人不能抽到自己
- 每位參加者只能透過伺服器函式讀取自己的配對
- 主辦人不能讀取完整配對表
- 以資料庫權限保護配對資料，不依賴前端隱藏

## 一、建立 Supabase 專案
1. 到 https://supabase.com 建立免費專案。
2. 在 Authentication → Providers / Sign In Providers，啟用 **Anonymous Sign-Ins**（匿名登入）。
3. 打開 SQL Editor，將 `supabase/schema.sql` 全部貼上執行。
4. 到 Project Settings → API，複製 Project URL 與 anon/public key。

## 二、本機測試
需要 Node.js 20 或更新版本。

```bash
npm install
cp .env.example .env
```

編輯 `.env`：
```env
VITE_SUPABASE_URL=https://你的專案.supabase.co
VITE_SUPABASE_ANON_KEY=你的_supabase_anon_key
```

啟動：
```bash
npm run dev
```
開啟終端機顯示的網址測試。

## 三、部署成公開網址（Vercel）
1. 將此資料夾上傳到自己的 GitHub repository。
2. 到 https://vercel.com → Add New → Project，匯入 repository。
3. Framework 選 Vite（通常會自動偵測）。
4. 在 Environment Variables 加入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 按 Deploy。完成後會得到可分享的 `https://....vercel.app` 網址。

任何朋友都可以用同一個網址開啟。活動邀請網址會自動帶入活動代碼。

## 使用流程
1. 主辦人開啟網站，建立活動並輸入自己的名字。
2. 複製邀請網址傳給朋友。
3. 朋友打開網址，輸入名字與願望（例如 `ㄆ：盤子`、`ㄒ：香氛`）。
4. 主辦人確認名單後按「開始秘密抽籤」。
5. 每位朋友用當初加入活動的同一個瀏覽器／裝置打開邀請網址，即可看到自己的送禮對象。

## 重要限制與注意事項
- 目前採匿名登入，不需要朋友註冊，但每位參加者的身分存在該瀏覽器的 Supabase session。清除網站資料、換瀏覽器或換手機後，匿名身分不會自動轉移；請使用原本加入活動的裝置查看結果。
- 若希望換裝置也能登入，下一版應加入 Email magic link 或一次性個人取件碼。
- 匿名帳號可能受到 Supabase 專案的驗證／速率限制，正式活動前請先用兩個不同瀏覽器測試。
- 目前抽籤後鎖定名單及願望，不提供重新抽籤，避免已有人看到結果後配對被改動。
- 主辦人可以看到參加者姓名及願望，但不能透過網站查詢所有人的配對。
- 邀請代碼相當於活動入口，請只分享給參加者。
- 正式使用前，請先用測試活動驗證「主辦人不能看到別人的配對」及「不同瀏覽器可以加入」。
