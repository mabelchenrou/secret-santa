import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { CalendarDays, Check, Coins, Copy, Crown, Delete, EyeOff, Gift, KeyRound, LockKeyhole, Plus, RotateCcw, Share2, Sparkles, Users, X } from "lucide-react";
import "@fontsource/gloock/400.css";
import { Hills, Lights, Village } from "./Scenery";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const MAX_WISHES = 6;
const MAX_WISH_LEN = 12;
// 注音鍵盤，照課本的順序一組一組排
const KEY_ROWS = ["ㄅㄆㄇㄈㄉㄊㄋㄌ", "ㄍㄎㄏㄐㄑㄒ", "ㄓㄔㄕㄖㄗㄘㄙ", "ㄧㄨㄩㄚㄛㄜㄝ", "ㄞㄟㄠㄡㄢㄣㄤㄥ"];

/* ───────── 小工具 ───────── */

function friendly(error) {
  const m = (error && error.message) || "";
  if (/Could not find the function|schema cache/i.test(m)) return "資料庫還沒更新到新版：請到 Supabase 的 SQL Editor 執行 supabase/schema.sql。";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "連不上伺服器，請檢查網路後再試一次。";
  if (/Anonymous sign-ins are disabled/i.test(m)) return "Supabase 還沒開啟匿名登入（Anonymous Sign-Ins）。";
  return m || "發生錯誤，請稍後再試。";
}

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendly(error));
  return data;
}

const splitWishes = (text) => (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
const codeFromUrl = () => (new URLSearchParams(window.location.search).get("code") || "").trim().toUpperCase();
const inviteUrl = (code) => `${window.location.origin}${window.location.pathname}?code=${code}`;

function formatDate(iso) {
  if (!iso) return "日期待定";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date(y, m - 1, d));
}

// 記住這個瀏覽器參加過的活動，首頁可以直接點回去
function savedEvents() {
  try { return JSON.parse(localStorage.getItem("ss_events") || "[]"); } catch { return []; }
}
function saveEvents(list) {
  try { localStorage.setItem("ss_events", JSON.stringify(list.slice(0, 8))); } catch { /* 無痕模式存不了也沒關係 */ }
}
const rememberEvent = (ev) => saveEvents([{ code: ev.invite_code, title: ev.title }, ...savedEvents().filter((e) => e.code !== ev.invite_code)]);
const forgetEvent = (code) => saveEvents(savedEvents().filter((e) => e.code !== code));

const Notify = createContext(() => {});

/* ───────── 共用元件 ───────── */

function WishTags({ wishes, empty }) {
  const list = splitWishes(wishes);
  if (!list.length) return empty ? <p className="no-wish">{empty}</p> : null;
  return <ul className="tags">{list.map((w, i) => <li className="tag" key={i}>{w}</li>)}</ul>;
}

// 願望輸入：點注音鍵盤組出一個願望，按「加入」變成一張小卡
function WishEditor({ value, onChange }) {
  const { list, draft } = value;
  const full = list.length >= MAX_WISHES;
  const setDraft = (d) => onChange({ list, draft: d.slice(0, MAX_WISH_LEN) });
  const add = () => {
    const w = draft.trim();
    if (!w) return;
    onChange({ list: list.includes(w) ? list : [...list, w], draft: "" });
  };
  const remove = (i) => onChange({ list: list.filter((_, j) => j !== i), draft });

  return <div className="wish-editor">
    {list.length > 0 && <ul className="tags">
      {list.map((w, i) => <li className="tag" key={i + w}>{w}
        <button type="button" className="tag-x" aria-label={`刪除願望 ${w}`} onClick={() => remove(i)}><X size={14} /></button>
      </li>)}
    </ul>}
    {full ? <p className="hint">最多 {MAX_WISHES} 個願望。想換的話，先刪掉一個。</p> : <>
      <div className="compose">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="例如 ㄒㄈ" aria-label="新的願望"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button type="button" className="btn small" disabled={!draft.trim()} onClick={add}><Plus size={16} />加入</button>
      </div>
      <div className="keypad" role="group" aria-label="注音鍵盤">
        {KEY_ROWS.map((row) => <div className="key-row" key={row}>
          {[...row].map((k) => <button type="button" className="key" key={k} onClick={() => setDraft(draft + k)}>{k}</button>)}
        </div>)}
        <div className="key-row">
          <button type="button" className="key" onClick={() => setDraft(draft + "ㄦ")}>ㄦ</button>
          <button type="button" className="key key-back" aria-label="刪除一個字" onClick={() => setDraft(draft.slice(0, -1))}><Delete size={18} /></button>
        </div>
      </div>
    </>}
  </div>;
}

function PinField({ value, onChange, label = "設定 4 位數密碼", hint }) {
  return <label className="field">{label}
    <input className="pin" value={value} inputMode="numeric" autoComplete="off" placeholder="例如 0825"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))} />
    {hint && <span className="hint">{hint}</span>}
  </label>;
}

function EventSummary({ event, count }) {
  return <ul className="meta">
    <li><CalendarDays size={16} />{formatDate(event.event_date)}</li>
    <li><Coins size={16} />{event.budget ? `預算 ${event.budget}` : "預算未設定"}</li>
    <li><Users size={16} />{count} 人參加</li>
  </ul>;
}

function ConfirmDialog({ title, children, action, busy, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return <div className="overlay" onClick={onCancel}>
    <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>取消</button>
        <button className="btn primary" onClick={onConfirm} disabled={busy} autoFocus>{busy ? "處理中…" : action}</button>
      </div>
    </div>
  </div>;
}

/* ───────── 首頁：建立活動 ───────── */

function Home({ go }) {
  const notify = useContext(Notify);
  const [f, setF] = useState({ title: "2026 聖誕交換禮物", date: "2026-12-25", budget: "500–1000 元", name: "", pin: "" });
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const saved = savedEvents();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return notify("請填你的名字", "error");
    if (!/^\d{4}$/.test(f.pin)) return notify("密碼請輸入 4 個數字", "error");
    setBusy(true);
    try {
      const code = await call("ss_create_event", { p_title: f.title, p_event_date: f.date || null, p_budget: f.budget, p_name: f.name, p_pin: f.pin });
      go(code);
      notify("活動建立好了，把邀請連結傳給朋友吧");
    } catch (err) { notify(err.message, "error"); } finally { setBusy(false); }
  };

  return <>
    <section className="card">
      <h2>怎麼玩</h2>
      <ol className="steps">
        <li>建立活動，把連結傳給朋友</li>
        <li>每個人填名字和注音願望，只有自己看得到</li>
        <li>主辦人按抽籤，各自看到要送給誰</li>
      </ol>
    </section>

    {saved.length > 0 && <section className="card">
      <h2>回到我的活動</h2>
      <ul className="saved">
        {saved.map((e) => <li key={e.code}><button className="saved-item" onClick={() => go(e.code)}><Gift size={18} /><span>{e.title}</span><small>{e.code}</small></button></li>)}
      </ul>
    </section>}

    <form className="card" onSubmit={create}>
      <h2>建立一場交換禮物</h2>
      <p className="muted">你是主辦人，也是其中一位參加者。只有你能按抽籤，但你一樣只看得到自己要送給誰。</p>
      <label className="field">活動名稱<input value={f.title} onChange={set("title")} maxLength={60} required /></label>
      <div className="two">
        <label className="field">交換日期<input type="date" value={f.date} onChange={set("date")} /></label>
        <label className="field">禮物預算<input value={f.budget} onChange={set("budget")} maxLength={40} placeholder="例如 500 元" /></label>
      </div>
      <label className="field">你的名字<input value={f.name} onChange={set("name")} maxLength={20} placeholder="朋友認得出來的名字" /></label>
      <PinField value={f.pin} onChange={(pin) => setF({ ...f, pin })} hint="換手機或瀏覽器時，用這組密碼找回主辦人身分。請記住它。" />
      <button className="btn primary block" disabled={busy}>{busy ? "建立中…" : "建立活動"}</button>
    </form>

    <form className="card" onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) go(joinCode.trim().toUpperCase()); }}>
      <h2>朋友給了你邀請代碼？</h2>
      <p className="muted">直接點朋友傳的連結最快。只有代碼的話，在這裡輸入。</p>
      <div className="compose">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="6 碼邀請代碼" maxLength={10} autoCapitalize="characters" aria-label="邀請代碼" />
        <button className="btn small" disabled={!joinCode.trim()}>前往</button>
      </div>
    </form>
  </>;
}

/* ───────── 還沒加入：加入活動，或找回身分 ───────── */

function JoinScreen({ code, state, reload }) {
  const notify = useContext(Notify);
  const { event, participants } = state;
  const open = event.status === "open";
  const [mode, setMode] = useState(open ? "join" : "claim");
  const [name, setName] = useState("");
  const [wish, setWish] = useState({ list: [], draft: "" });
  const [pin, setPin] = useState("");
  const [claimId, setClaimId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return notify("密碼請輸入 4 個數字", "error");
    setBusy(true);
    try {
      if (mode === "join") {
        if (!name.trim()) throw new Error("請填你的名字");
        // 打了字但忘記按「加入」的願望也一起算進去
        const draft = wish.draft.trim();
        const list = draft && !wish.list.includes(draft) ? [...wish.list, draft] : wish.list;
        await call("ss_join", { p_code: code, p_name: name, p_wishes: list.slice(0, MAX_WISHES).join("\n"), p_pin: pin });
        notify("加入成功！");
      } else {
        if (!claimId) throw new Error("請先點選你的名字");
        const r = await call("ss_claim", { p_code: code, p_participant_id: claimId, p_pin: pin });
        if (!r.ok) throw new Error(r.error);
        notify("歡迎回來！");
      }
      await reload();
    } catch (err) { notify(err.message, "error"); } finally { setBusy(false); }
  };

  return <>
    <section className="card invite-head">
      <p className="muted">{open ? "你被邀請參加" : "這場活動已經抽完籤"}</p>
      <h1>{event.title}</h1>
      <EventSummary event={event} count={participants.length} />
      {participants.length > 0 && <p className="muted">已加入：{participants.map((p) => p.name).join("、")}</p>}
    </section>

    {mode === "join" ? <form className="card" onSubmit={submit}>
      <h2>加入活動</h2>
      <label className="field">你的名字<input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="朋友認得出來的名字" /></label>
      <div className="field">想收到的禮物
        <span className="hint">只寫每個字的第一個注音。想要「香氛」就填 ㄒㄈ，送禮的人會自己猜。其他人看不到，之後還可以改。</span>
        <WishEditor value={wish} onChange={setWish} />
      </div>
      <PinField value={pin} onChange={setPin} hint="換手機或瀏覽器時，用這組密碼找回身分、看抽籤結果。請記住它。" />
      <button className="btn primary block" disabled={busy}>{busy ? "加入中…" : "加入活動"}</button>
      <button type="button" className="link" onClick={() => setMode("claim")}>之前加入過？找回我的身分</button>
    </form> : <form className="card" onSubmit={submit}>
      <h2>找回我的身分</h2>
      <p className="muted">{open ? "換了手機或瀏覽器的話，" : "不能再加入新的人了。如果你之前加入過，"}點你的名字，再輸入當時設定的密碼。</p>
      <div className="pick" role="radiogroup" aria-label="你的名字">
        {participants.map((p) => <button type="button" key={p.id} role="radio" aria-checked={claimId === p.id}
          className={"pick-item" + (claimId === p.id ? " on" : "")} onClick={() => setClaimId(p.id)}>{p.name}</button>)}
      </div>
      <PinField value={pin} onChange={setPin} label="你的 4 位數密碼" />
      <button className="btn primary block" disabled={busy}><KeyRound size={18} />{busy ? "確認中…" : "找回身分"}</button>
      {open && <button type="button" className="link" onClick={() => setMode("join")}>我是第一次來，要加入活動</button>}
    </form>}
  </>;
}

/* ───────── 已加入：活動頁 ───────── */

// 我的願望：每加一個或刪一個就自動儲存
function MyWishes({ code, initial, reload }) {
  const notify = useContext(Notify);
  const [value, setValue] = useState({ list: splitWishes(initial), draft: "" });
  const [saved, setSaved] = useState(true);
  const queue = useRef(Promise.resolve());

  const change = (next) => {
    const changed = next.list !== value.list;
    setValue(next);
    if (!changed) return;
    setSaved(false);
    queue.current = queue.current
      .then(() => call("ss_update_wishes", { p_code: code, p_wishes: next.list.join("\n") }))
      .then(() => { setSaved(true); reload(); })
      .catch((err) => notify(err.message, "error"));
  };

  return <section className="card">
    <div className="card-head"><h2>我的願望</h2><span className="saved-mark">{saved ? value.list.length > 0 && <><Check size={14} />已儲存</> : "儲存中…"}</span></div>
    <p className="muted">只寫每個字的第一個注音。想要「香氛」就填 ㄒㄈ，送禮的人會自己猜。抽籤前都可以改。</p>
    <p className="private"><LockKeyhole size={14} />現在只有你看得到。抽籤後，只有抽到你的人會看到。</p>
    <WishEditor value={value} onChange={change} />
  </section>;
}

function InviteCard({ code, title }) {
  const notify = useContext(Notify);
  const url = inviteUrl(code);
  const input = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); notify("邀請連結已複製，貼給朋友吧"); }
    catch { input.current.select(); notify("請長按上面的連結來複製"); }
  };
  const share = () => navigator.share({ title, text: `一起來玩交換禮物「${title}」！點連結填名字和願望：`, url }).catch(() => {});
  return <section className="card">
    <h2>邀請朋友</h2>
    <p className="muted">把連結傳到群組，朋友點開就能加入。邀請代碼：<strong className="code">{code}</strong></p>
    <input ref={input} className="url" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="邀請連結" />
    <div className="row">
      <button className="btn primary" onClick={copy}><Copy size={18} />複製邀請連結</button>
      {navigator.share && <button className="btn" onClick={share}><Share2 size={18} />分享</button>}
    </div>
  </section>;
}

// 抽籤結果：預設蓋住，點一下才顯示，避免旁邊的人看到
function RevealCard({ assignment }) {
  const [shown, setShown] = useState(false);
  return <section className="reveal">
    <h2>你要送禮給</h2>
    {shown ? <>
      <p className="receiver">{assignment.name}</p>
      <p className="reveal-label">對方的願望</p>
      <WishTags wishes={assignment.wishes} empty="對方沒有填願望，自由發揮吧。" />
      <button className="btn on-dark" onClick={() => setShown(false)}><EyeOff size={18} />蓋起來</button>
    </> : <>
      <button className="reveal-btn" onClick={() => setShown(true)}><Gift size={30} />點一下揭曉</button>
      <p className="reveal-note">只有你看得到。先確定旁邊沒有人在偷看。</p>
    </>}
  </section>;
}

function MemberScreen({ code, state, reload }) {
  const notify = useContext(Notify);
  const { event, participants, me, assignment } = state;
  const open = event.status === "open";
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const host = participants.find((p) => p.is_host);
  const noWish = participants.filter((p) => !p.has_wishes);

  const run = async (fn, args, okText) => {
    setBusy(true);
    try { await call(fn, args); await reload(); notify(okText); }
    catch (err) { notify(err.message, "error"); }
    finally { setBusy(false); setConfirm(null); }
  };

  return <>
    <section className="card event-head">
      <div className="card-head">
        <h1>{event.title}</h1>
        <span className={"status " + event.status}>{open ? "報名中" : "已抽籤"}</span>
      </div>
      <EventSummary event={event} count={participants.length} />
    </section>

    {!open && assignment && <RevealCard assignment={assignment} />}
    {!open && <section className="card">
      <h2>我的願望</h2>
      <p className="private"><LockKeyhole size={14} />只有你和抽到你的人看得到。</p>
      <WishTags wishes={me.wishes} empty="你沒有填願望。" />
    </section>}
    {open && <MyWishes code={code} initial={me.wishes} reload={reload} />}
    {open && <InviteCard code={code} title={event.title} />}

    <section className="card">
      <h2>參加名單</h2>
      <ul className="people">
        {participants.map((p) => <li className="person" key={p.id}>
          <span className="avatar" aria-hidden="true">{[...p.name][0]}</span>
          <div className="person-main">
            <p className="person-name">{p.name}
              {p.is_host && <span className="badge"><Crown size={12} />主辦人</span>}
              {p.is_me && <span className="badge me">你</span>}
            </p>
            {p.has_wishes ? <p className="wish-status done"><Check size={14} />已填願望</p> : <p className="wish-status">還沒填願望</p>}
          </div>
          {me.is_host && open && !p.is_host && <button className="icon-btn" aria-label={`移除 ${p.name}`}
            onClick={() => setConfirm({ kind: "remove", person: p })}><X size={18} /></button>}
        </li>)}
      </ul>
    </section>

    {open && (me.is_host ? <section className="card">
      <h2>抽籤</h2>
      <p className="muted">等大家都加入、填好願望再抽。抽完後每個人只看得到自己要送給誰和對方的願望，你也一樣。</p>
      <button className="btn primary block" disabled={participants.length < 2} onClick={() => setConfirm({ kind: "draw" })}>
        <Sparkles size={18} />開始抽籤（{participants.length} 人）
      </button>
      {participants.length < 2 && <p className="hint">至少要 2 個人才能抽籤。</p>}
    </section> : <p className="waiting"><LockKeyhole size={16} />等主辦人{host ? ` ${host.name} ` : ""}按下抽籤，這裡就會出現你要送禮的對象。</p>)}

    {!open && <p className="waiting"><LockKeyhole size={16} />抽籤結果和願望只有本人看得到，主辦人也看不到別人的。</p>}
    {!open && me.is_host && <button className="link" onClick={() => setConfirm({ kind: "reopen" })}><RotateCcw size={14} />漏了人？作廢這次結果，重新開放報名</button>}

    {confirm?.kind === "draw" && <ConfirmDialog title={`確定要抽籤嗎？共 ${participants.length} 人`} action="確定抽籤" busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => run("ss_draw", { p_code: code }, "抽籤完成！每個人都可以來看自己的結果了")}>
      <p>{participants.map((p) => p.name).join("、")}</p>
      {noWish.length > 0 && <p className="warn">還沒填願望：{noWish.map((p) => p.name).join("、")}</p>}
      <p>抽籤後，名單和願望就會鎖定。</p>
    </ConfirmDialog>}
    {confirm?.kind === "remove" && <ConfirmDialog title={`把「${confirm.person.name}」移出名單？`} action="移除" busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => run("ss_remove", { p_code: code, p_participant_id: confirm.person.id }, `已移除 ${confirm.person.name}`)}>
      <p>對方之後可以用邀請連結重新加入。</p>
    </ConfirmDialog>}
    {confirm?.kind === "reopen" && <ConfirmDialog title="作廢這次結果，重新開放報名？" action="重新開放" busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={() => run("ss_reopen", { p_code: code }, "已重新開放，準備好後再抽一次")}>
      <p>所有人目前的結果都會作廢，大家可以再加入、改願望，之後由你重新抽籤。</p>
      <p className="warn">如果已經有人照結果買了禮物，請先跟大家說一聲。</p>
    </ConfirmDialog>}
  </>;
}

function EventPage({ code, goHome }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const seq = useRef(0);

  // 每次只採用最新一次查詢的結果，避免較慢的舊回應蓋掉新資料
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const s = await call("ss_state", { p_code: code });
      if (mine !== seq.current) return;
      setState(s); setError("");
      if (s.me) rememberEvent(s.event);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(err.message);
      if (/找不到這個活動/.test(err.message)) forgetEvent(code);
    }
  }, [code]);

  // 每 5 秒更新一次名單與抽籤狀態；切回這個分頁時也立刻更新
  useEffect(() => {
    reload();
    const tick = () => { if (!document.hidden) reload(); };
    const timer = setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [reload]);

  if (!state) {
    if (!error) return <p className="loading">讀取活動中…</p>;
    return <section className="card">
      <h2>打不開這個活動</h2>
      <p className="muted">{error}</p>
      <button className="btn block" onClick={goHome}>回首頁</button>
    </section>;
  }
  return <>
    {error && <p className="offline">{error}</p>}
    {state.me ? <MemberScreen code={code} state={state} reload={reload} /> : <JoinScreen code={code} state={state} reload={reload} />}
  </>;
}

/* ───────── 外框 ───────── */

function App() {
  const [boot, setBoot] = useState({ ready: false, error: "" });
  const [code, setCode] = useState(codeFromUrl);
  const [toast, setToast] = useState(null);
  const notify = useCallback((text, kind = "ok") => setToast({ text, kind, id: Date.now() }), []);

  useEffect(() => {
    (async () => {
      if (!supabase) return setBoot({ ready: true, error: "網站還沒設定 Supabase（缺少 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY）。" });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }
        setBoot({ ready: true, error: "" });
      } catch (err) { setBoot({ ready: true, error: friendly(err) }); }
    })();
    const onPop = () => setCode(codeFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const go = (next) => {
    window.history.pushState(null, "", next ? `?code=${next}` : window.location.pathname);
    setCode(next);
    window.scrollTo(0, 0);
  };

  return <Notify.Provider value={notify}>
    <div className={"sky" + (code ? " compact" : "")}>
      <header className="topbar">
        <button className="brand" onClick={() => go("")}><span className="brand-icon"><Gift size={16} /></span>Secret Santa</button>
        <span className="topbar-note">秘密交換禮物</span>
      </header>
      <Lights />
      {code ? <Hills /> : <section className="hero">
        <p className="wordmark">Secret Santa</p>
        <Village />
      </section>}
    </div>
    <main className="main">
      {!boot.ready ? <p className="loading">準備中…</p>
        : boot.error ? <section className="card"><h2>網站暫時連不上</h2><p className="muted">{boot.error}</p><button className="btn block" onClick={() => window.location.reload()}>重新整理</button></section>
        : code ? <EventPage key={code} code={code} goHome={() => go("")} />
        : <Home go={go} />}
    </main>
    {toast && <div className={"toast " + toast.kind} role="status" key={toast.id} onClick={() => setToast(null)}>{toast.text}</div>}
  </Notify.Provider>;
}

createRoot(document.getElementById("root")).render(<App />);
