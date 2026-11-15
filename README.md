# Secret Santa｜秘密交換禮物

給朋友一起用的交換禮物網站。網頁放在 GitHub Pages，資料存在 Supabase。

網址：https://mabelchenrou.github.io/secret-santa/

## 怎麼玩

1. 主辦人打開網站，建立活動（填活動名稱、日期、預算、自己的名字和一組 4 位數密碼）。
2. 主辦人把邀請連結傳給朋友。
3. 朋友點連結，填名字、注音願望和自己的 4 位數密碼。
   願望只寫每個字的第一個注音，例如想要「香氛」就填 `ㄒㄈ`，讓送禮的人自己猜。
4. 大家都加入後，主辦人按「開始抽籤」。
5. 每個人回到同一個連結，點「點一下揭曉」，就會看到自己要送禮給誰，以及對方的願望。

## 規則

- 只有主辦人能抽籤、移除參加者、重新開放報名。
- 名單上只看得到名字和「有沒有填願望」。願望內容只有自己看得到，主辦人也看不到。
- 抽籤結果只有本人看得到：自己要送給誰，以及對方的願望。主辦人在網站上也只看得到自己的結果。
- 不會抽到自己，每個人剛好送一份、收一份。
- 抽籤後名單和願望會鎖定。如果漏了人，主辦人可以作廢結果、重新開放，再抽一次。
- 換手機或瀏覽器時，打開邀請連結，選「找回我的身分」，點自己的名字並輸入密碼。
  密碼連續輸錯 5 次會鎖 15 分鐘。

## 注意事項

- 擁有 Supabase 專案的人可以在 Supabase 後台直接打開資料表看到配對。想要完全保密，就不要去看 `ss_assignments` 這張表。
- Supabase 免費方案的專案如果大約一週沒有人使用會被暫停，到 Supabase 後台按 Resume 就能恢復，資料不會不見。
- 邀請連結等於活動的入口，只傳給要參加的人。

## 設定（只需要做一次）

### Supabase

1. 在 https://supabase.com 建立專案。
2. Authentication → Sign In / Providers，開啟 **Allow anonymous sign-ins**。
3. SQL Editor → New query，貼上 `supabase/schema.sql` 的全部內容，按 Run。
   這份檔案可以重複執行；之後 `schema.sql` 有更新時，再貼一次執行即可，已建立的活動不會被刪除。

### GitHub Pages

1. Settings → Secrets and variables → Actions，新增兩個 secret：
   - `VITE_SUPABASE_URL`：Supabase 的 Project URL（結尾不要有 `/rest/v1/`）
   - `VITE_SUPABASE_ANON_KEY`：Supabase 的 anon public key
2. Settings → Pages → Source 選 **GitHub Actions**。
3. 之後每次更新 `main` 分支的檔案，`.github/workflows/deploy.yml` 會自動重新部署。

## 本機開發

需要 Node.js 20 以上。

```bash
npm install
# 建立 .env，內容為：
# VITE_SUPABASE_URL=https://你的專案.supabase.co
# VITE_SUPABASE_ANON_KEY=你的 anon key
npm run dev
```

## 檔案

- `src/main.jsx`：整個網頁的程式
- `src/style.css`：樣式
- `supabase/schema.sql`：資料表與資料庫函式（抽籤與權限檢查都在這裡）
