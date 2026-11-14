import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import { Gift, Snowflake, Copy, Users, CalendarDays, Sparkles, LockKeyhole, ArrowRight, RefreshCw, Heart, PartyPopper } from "lucide-react";
import "./style.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function App() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [screen, setScreen] = useState("home");
  const [event, setEvent] = useState(null);
  const [people, setPeople] = useState([]);
  const [assignment, setAssignment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ title: "2026 聖誕交換禮物", hostName: "", date: "2026-12-25", budget: "500–1000 元", code: "", name: "", wishes: "" });

  const myId = sessionStorage.getItem("ss_user_id");

  useEffect(() => {
    (async () => {
      if (!supabase) { setSessionError("尚未設定 Supabase，請先依照 README 完成設定。"); setSessionReady(true); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) setSessionError("無法建立匿名登入：" + error.message);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) sessionStorage.setItem("ss_user_id", user.id);
      setSessionReady(true);
    })();
  }, []);

  const call = async (fn, args) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先完成部署設定。");
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const run = async (fn) => {
    setBusy(true); setNotice("");
    try { await fn(); } catch (e) { setNotice(e.message || "發生錯誤，請稍後再試。"); }
    finally { setBusy(false); }
  };
  const refreshEvent = async (code) => {
    const data = await call("get_event_by_code", { p_code: code });
    setEvent(data.event); setPeople(data.participants || []);
    const mine = await call("get_my_assignment", { p_event_id: data.event.id });
    setAssignment(mine || null);
    setScreen("event");
  };
  const createEvent = () => run(async () => {
    if (!form.hostName.trim()) throw new Error("請先填寫你的名字。");
    const created = await call("create_event", { p_title: form.title, p_event_date: form.date || null, p_budget: form.budget });
    await call("join_event", { p_code: created.invite_code, p_name: form.hostName.trim(), p_wishes: "" });
    await refreshEvent(created.invite_code);
    setNotice("活動建立成功！邀請朋友使用下方網址加入。");
  });
  const joinEvent = () => run(async () => {
    if (!form.code.trim() || !form.name.trim()) throw new Error("請填寫活動代碼及你的名字。");
    await call("join_event", { p_code: form.code.trim().toUpperCase(), p_name: form.name.trim(), p_wishes: form.wishes.trim() });
    await refreshEvent(form.code.trim().toUpperCase());
    setNotice("加入成功！你的願望已儲存。");
  });
  const saveWish = () => run(async () => {
    await call("update_my_wishes", { p_event_id: event.id, p_wishes: form.wishes.trim() });
    await refreshEvent(event.invite_code);
    setNotice("願望清單已更新。");
  });
  const draw = () => {
    if (!window.confirm("確定要開始抽籤嗎？抽籤後將無法修改參加名單或重新抽籤。")) return;
    run(async () => {
      await call("draw_event", { p_event_id: event.id });
      await refreshEvent(event.invite_code);
      setNotice("抽籤完成！每個人只能看到自己的結果。");
    });
  };
  const copyInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}?code=${event.invite_code}`;
    await navigator.clipboard.writeText(url);
    setNotice("邀請網址已複製，可以傳給朋友了！");
  };

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code && sessionReady && !sessionError) {
      setForm(f => ({ ...f, code: code.toUpperCase() }));
      run(async () => {
        const preview = await call("get_invite_preview", { p_code: code.toUpperCase() });
        setEvent(preview);
        setScreen("join");
      });
    }
  }, [sessionReady]);

  const isHost = event && event.host_uid === myId;
  const inviteUrl = event ? `${window.location.origin}${window.location.pathname}?code=${event.invite_code}` : "";

  if (!sessionReady) return <main className="loading"><div className="loader">❄</div><p>正在準備你的秘密任務…</p></main>;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { setScreen("home"); setNotice(""); }}><span className="brand-icon"><Gift size={19}/></span><span>SECRET SANTA<small>THE GIFT OF GIVING</small></span></button>
      <span className="season"><Snowflake size={15}/> CHRISTMAS 2026</span>
    </header>
    <main className="main">
      <div className="hero">
        <div className="eyebrow"><span/> A LITTLE GIFT, A LITTLE SECRET <span/></div>
        <h1>把驚喜，留給<br/><em>最重要的人。</em></h1>
        <p>一場關於心意的小小交換。<br/>選好願望，剩下的交給命運。</p>
        <div className="hero-decoration"><span>✳</span><span>✦</span><span>✳</span></div>
      </div>

      {sessionError && <div className="alert error">{sessionError}</div>}
      {notice && <div className="alert"><Sparkles size={16}/>{notice}</div>}

      {screen === "home" && <section className="panel-grid">
        <article className="panel">
          <div className="panel-icon"><Gift/></div><div className="eyebrow left">FOR THE ORGANIZER</div>
          <h2>建立一場交換禮物</h2><p className="muted">你來開啟這場小小的驚喜。</p>
          <label>活動名稱<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="例如：好友聖誕交換禮物"/></label>
          <label>你的名字<input value={form.hostName} onChange={e=>setForm({...form,hostName:e.target.value})} placeholder="輸入你的名字"/></label>
          <div className="two-fields"><label>交換日期<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>禮物預算<input value={form.budget} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="例如：500–1000 元"/></label></div>
          <button className="primary" disabled={busy} onClick={createEvent}>{busy?"建立中…":"建立活動"} <ArrowRight size={17}/></button>
        </article>
        <article className="panel panel-dark">
          <div className="panel-icon light"><Users/></div><div className="eyebrow left light-text">FOR THE GUEST</div>
          <h2>加入朋友的活動</h2><p className="muted light-text">輸入邀請代碼，一起參與驚喜。</p>
          <label>活動代碼<input value={form.code} onChange={e=>setForm({...form,code:e.target.value.toUpperCase()})} placeholder="例如：A7K9Q2" maxLength="10"/></label>
          <label>你的名字<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="輸入你的名字"/></label>
          <label>想收到的禮物（可填多項）<textarea value={form.wishes} onChange={e=>setForm({...form,wishes:e.target.value})} placeholder={"例如：\nㄆ：漂亮的盤子\nㄒ：香氛蠟燭\nㄌ：旅行收納袋"} rows="4"/></label>
          <button className="secondary" disabled={busy} onClick={joinEvent}>加入活動 <ArrowRight size={17}/></button>
        </article>
      </section>}

      {screen === "join" && event && <section className="panel narrow">
        <div className="panel-icon"><Heart/></div><div className="eyebrow left">YOU ARE INVITED</div><h2>{event.title}</h2>
        <p className="muted">填寫名字與願望，讓送禮的人更了解你的喜好。</p>
        <div className="event-meta"><span><CalendarDays size={15}/>{event.event_date || "日期待定"}</span><span>預算：{event.budget || "未設定"}</span></div>
        <label>你的名字<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="輸入你的名字"/></label>
        <label>想收到的禮物（注音開頭）<textarea value={form.wishes} onChange={e=>setForm({...form,wishes:e.target.value})} rows="5" placeholder={"ㄆ：漂亮的盤子\nㄒ：香氛蠟燭\nㄌ：旅行收納袋"}/></label>
        <button className="primary" disabled={busy} onClick={joinEvent}>確認加入 <ArrowRight size={17}/></button>
      </section>}

      {screen === "event" && event && <section className="event-layout">
        <div className="panel event-head">
          <div className="event-title-row"><div><div className="eyebrow left">YOUR SECRET SANTA EVENT</div><h2>{event.title}</h2></div><span className={`status ${event.status}`}>{event.status==="drawn"?"已完成抽籤":"等待抽籤"}</span></div>
          <div className="event-meta"><span><CalendarDays size={15}/>{event.event_date || "日期待定"}</span><span>預算：{event.budget || "未設定"}</span><span><Users size={15}/>{people.length} 位參加者</span></div>
          {isHost && <div className="invite-box"><div><small>SHARE THIS INVITATION</small><strong>{event.invite_code}</strong></div><button className="outline" onClick={copyInvite}><Copy size={15}/> 複製邀請網址</button></div>}
        </div>
        {assignment && <div className="reveal-card"><div className="eyebrow">YOUR SECRET MISSION</div><PartyPopper size={27}/><h2>你要送禮給</h2><div className="receiver">{assignment.receiver_name}</div><p>這是你的小秘密，記得不要說出去！</p><div className="wish-note"><small>THEIR WISH LIST</small><p>{assignment.receiver_wishes || "對方還沒有填寫願望。"}</p></div></div>}
        {!assignment && event.status==="drawn" && <div className="panel"><LockKeyhole/><h3>你的配對結果尚未顯示</h3><p className="muted">請確認你是使用加入活動時的同一個瀏覽器。</p></div>}
        <div className="panel">
          <div className="section-heading"><div><div className="eyebrow left">THE GUEST LIST</div><h3>參加者與願望</h3></div><span className="count">{people.length} PEOPLE</span></div>
          <div className="guest-list">{people.map((p,i)=><div className="guest" key={p.id}><div className="avatar">{p.name.slice(0,1)}</div><div className="guest-info"><strong>{p.name}{p.user_id===myId?"（我）":""}</strong><p>{p.wishes || "尚未填寫願望"}</p></div></div>)}</div>
          {isHost && event.status==="open" && <div className="host-actions"><p>確認所有朋友都已加入後，再開始抽籤。抽籤後不能再新增或修改參加者。</p><button className="primary" disabled={busy || people.length<2} onClick={draw}><Sparkles size={17}/> {busy?"抽籤中…":`開始秘密抽籤（${people.length} 人）`}</button>{people.length<2&&<small>至少需要 2 位參加者才能抽籤。</small>}</div>}
          {event.status==="drawn" && <div className="drawn-note"><LockKeyhole size={16}/> 抽籤已完成。每位參加者只能查看自己的配對。</div>}
        </div>
        <button className="text-button" onClick={()=>{setScreen("home");setEvent(null);setNotice("");}}>返回首頁</button>
      </section>}
    </main>
    <footer><div className="footer-mark">✳</div><p>MADE FOR THE JOY OF GIVING</p><small>Keep the secret. Share the joy.</small></footer>
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);