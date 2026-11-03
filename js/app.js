/* Sync Up UI. Accounts, data and live sync are in db.js. */
let state = null;
let me = null;           // 'A' (set the couple up) or 'B' (joined with the invite code)
let map = null, markers = {};
let watchId = null;
let myTrip = null;       // my live On The Way session while I'm sharing
let lastTripSave = 0;

const MOODS = [['😊','Good'],['😌','Calm'],['🥳','Excited'],['😴','Tired'],['😤','Stressed'],['😢','Down'],['😰','Anxious'],['🥰','Loved-up']];
const QUICK = ['In a meeting','At work','Heading out','On a call','Free right now','Studying','Grabbing food','Home now','Running late','Can\'t talk, later'];
const VERSES = [
  ['Two are better than one, because they have a good reward for their labour.','Ecclesiastes 4:9'],
  ['Love is patient, love is kind.','1 Corinthians 13:4'],
  ['This is the day which the Lord hath made; we will rejoice and be glad in it.','Psalm 118:24'],
  ['Let all that you do be done in love.','1 Corinthians 16:14'],
  ['Trust in the Lord with all thine heart.','Proverbs 3:5'],
  ['Rejoice with them that do rejoice.','Romans 12:15'],
  ['Be still, and know that I am God.','Psalm 46:10'],
  ['Above all things have fervent charity among yourselves.','1 Peter 4:8'],
  ['A cheerful heart is good medicine.','Proverbs 17:22'],
  ['Bear ye one another\'s burdens.','Galatians 6:2'],
  ['I can do all things through Christ which strengtheneth me.','Philippians 4:13'],
  ['Weeping may endure for a night, but joy cometh in the morning.','Psalm 30:5'],
  ['Give thanks in all circumstances.','1 Thessalonians 5:18'],
  ['Fear not, for I am with thee.','Isaiah 41:10']
];
const TRAVEL_MODES = {
  drive:     {icon:'🚗', label:'Driving',     speedKmh:40, radius:150},
  rideshare: {icon:'🚕', label:'Uber / Bolt',  speedKmh:40, radius:150},
  gautrain:  {icon:'🚆', label:'Gautrain',     speedKmh:80, radius:300},
  taxi:      {icon:'🚌', label:'Taxi / bus',   speedKmh:25, radius:200},
};

function dayOfYear(d){const start=new Date(d.getFullYear(),0,0); return Math.floor((d-start)/86400000);}
function fmtTime(ts){return new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});}
function todayKey(){return new Date().toLocaleDateString('en-CA');}
function fmtDayLabel(key){
  const today = todayKey();
  const d = new Date(key+'T00:00:00');
  const y = new Date(); y.setDate(y.getDate()-1);
  if(key===today) return 'Today';
  if(key===y.toLocaleDateString('en-CA')) return 'Yesterday';
  return d.toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'});
}
// Safe for both element text and attribute values (names and notes come from the other phone).
function escapeHtml(s){return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const $ = id => document.getElementById(id);
const val = id => $(id).value.trim();

function other(p){return p==='A'?'B':'A';}
function colorVar(p){return p==='A' ? getComputedStyle(document.documentElement).getPropertyValue('--a').trim() : getComputedStyle(document.documentElement).getPropertyValue('--b').trim();}
function nameOf(p){return p==='A' ? state.setup.nameA : state.setup.nameB;}

/* ---------------- saving & feedback ---------------- */
let toastTimer;
function toast(msg){
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 3500);
}

function friendlyError(e){
  const msg = (e && e.message) || '';
  if(/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Couldn't reach Sync Up. Check your connection and try again.";
  if(/Invalid login credentials/i.test(msg)) return "That email and password don't match.";
  if(/already registered|already been registered|already exists/i.test(msg)) return 'There is already an account with that email. Log in instead.';
  if(/Password should be at least/i.test(msg)) return 'Use a password of at least 6 characters.';
  if(/invalid format|validate email|valid email/i.test(msg)) return "That email address doesn't look right.";
  return msg || 'Something went wrong. Try again.';
}

// Runs a change against the backend, then refreshes. Failures show a message instead of vanishing.
async function save(fn){
  try{ await fn(); }catch(e){ console.error(e); toast(friendlyError(e)); }
  await refresh();
}

async function pushFeed(text, type, extra={}){
  await save(() => db.postFeed(text, type, extra.emoji || null));
}

let refreshing = null, refreshAgain = false;
async function refresh(){
  if(refreshing){ refreshAgain = true; return refreshing; }
  refreshing = (async () => {
    do{
      refreshAgain = false;
      try{ state = await db.loadState(); render(); }
      catch(e){ console.error('refresh failed', e); }
    }while(refreshAgain);
  })();
  try{ await refreshing; } finally{ refreshing = null; }
}

// Your partner's changes arrive as a burst of live events; reload once they settle.
let liveTimer;
function onLiveChange(){ clearTimeout(liveTimer); liveTimer = setTimeout(refresh, 250); }

/* ---------------- setup / auth ---------------- */
function setupScreen(title, sub, html){
  $('setup-screen').style.display = '';
  $('app').style.display = 'none';
  $('setup-title').textContent = title;
  $('setup-sub').textContent = sub;
  $('setup-body').innerHTML = html;
  // Enter in any field submits the screen's main button.
  $('setup-body').onkeydown = e => {
    if(e.key!=='Enter' || e.target.tagName!=='INPUT') return;
    const main = $('setup-body').querySelector('.btn:not(.btn-ghost)');
    if(main){ e.preventDefault(); main.click(); }
  };
  const first = $('setup-body').querySelector('input:not([value]), input[value=""]');
  if(first) first.focus();
}

// Disables the button while a step runs and shows any error under the form.
function onSubmit(btnId, errId, fn){
  const btn = $(btnId);
  btn.onclick = async () => {
    $(errId).textContent = '';
    btn.disabled = true;
    try{ await fn(); }
    catch(e){ console.error(e); if($(errId)) $(errId).textContent = friendlyError(e); }
    finally{ btn.disabled = false; }
  };
}

async function goBack(){ (await db.session()) ? renderNoCouple() : renderWelcome(); }

async function initSetup(){
  const joinCode = new URLSearchParams(location.search).get('join');
  try{
    if(!(await db.session())) return joinCode ? renderJoin(joinCode) : renderWelcome();
    if(!(await db.loadProfile())) return joinCode ? renderJoin(joinCode) : renderNoCouple();
    boot();
  }catch(e){
    console.error(e);
    renderWelcome();
    toast(friendlyError(e));
  }
}

function renderWelcome(){
  setupScreen('Sync Up', "A shared thread through your day: moods, plans, and check-ins, just the two of you.", `
    <button class="btn btn-full" id="go-create">Start our Sync Up</button>
    <button class="btn btn-ghost btn-full" id="go-join" style="margin-top:10px;">I have an invite code</button>
    <div class="switch-link">Already set up? <button id="go-login">Log in</button></div>
  `);
  $('go-create').onclick = () => renderCreate(false);
  $('go-join').onclick = () => renderJoin();
  $('go-login').onclick = renderLogin;
}

// The joint setup: one of you fills in both names, then shares a code with the other.
function renderCreate(signedIn){
  setupScreen('Start your Sync Up', "Set it up together, like starting a household. You'll get a code for your partner to join with.", `
    <div class="partner-block">
      <div class="tag" style="color:var(--a)">You</div>
      <div class="field"><label>Your name</label><input id="nameA" placeholder="e.g. Muzi" maxlength="40" autocomplete="given-name"></div>
      ${signedIn ? '' : `<div class="two-col">
        <div class="field"><label>Email</label><input id="emailA" type="email" placeholder="you@email.com" autocomplete="email"></div>
        <div class="field"><label>Password</label><input id="passA" type="password" placeholder="6+ characters" autocomplete="new-password"></div>
      </div>`}
    </div>
    <div class="partner-block">
      <div class="tag" style="color:var(--b)">Your partner</div>
      <div class="field"><label>Their name</label><input id="nameB" placeholder="Their name" maxlength="40"></div>
      <div class="hint">They'll set their own email and password when they join with your code.</div>
    </div>
    <div class="err" id="setup-err"></div>
    <button class="btn btn-full" id="setup-submit">Create our Sync Up</button>
    <div class="switch-link"><button id="go-back">Back</button></div>
  `);
  $('go-back').onclick = goBack;
  onSubmit('setup-submit', 'setup-err', async () => {
    const nameA = val('nameA'), nameB = val('nameB');
    if(!nameA || !nameB) throw new Error('Fill in both names to continue.');
    if(!(await db.session())){
      const email = val('emailA'), pass = $('passA').value;
      if(!email || !pass) throw new Error('Add your email and a password.');
      await db.signUp(email, pass);
    }
    const code = await db.createCouple(nameA, nameB);
    await db.loadProfile();
    renderInvite(code, nameB);
  });
}

function renderInvite(code, partnerName){
  setupScreen("You're set up 💛", `Now bring ${partnerName} in. Send them this code: they tap "I have an invite code" and enter it.`, `
    <div class="invite-code mono">${code}</div>
    <button class="btn btn-full" id="share-code">Send ${escapeHtml(partnerName)} the invite</button>
    <button class="btn btn-ghost btn-full" id="enter-app" style="margin-top:10px;">Continue to Sync Up</button>
    <div class="demo-note">You can start using Sync Up straight away. The code stays at the top of your Home screen until ${escapeHtml(partnerName)} joins.</div>
  `);
  $('share-code').onclick = () => shareInvite(code);
  $('enter-app').onclick = boot;
}

function inviteLink(code){ return `${location.origin}${location.pathname}?join=${code}`; }

async function shareInvite(code){
  const link = inviteLink(code);
  const text = `Join me on Sync Up 💛 Open ${link} or enter the code ${code}.`;
  if(navigator.share){
    try{ await navigator.share({title:'Sync Up', text}); return; }
    catch(e){ if(e.name==='AbortError') return; }
  }
  try{ await navigator.clipboard.writeText(text); toast('Invite copied. Paste it to your partner.'); }
  catch(e){ toast(`Your invite code is ${code}`); }
}

function renderJoin(prefill=''){
  setupScreen('Join your partner', 'Enter the code they sent you.', `
    <div class="field"><label>Invite code</label><input id="join-code" class="code-input" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC123" value="${escapeHtml(prefill)}"></div>
    <div class="err" id="join-err"></div>
    <button class="btn btn-full btn-b" id="join-next">Continue</button>
    <div class="switch-link"><button id="go-back">Back</button></div>
  `);
  $('go-back').onclick = goBack;
  onSubmit('join-next', 'join-err', async () => {
    const code = val('join-code').toUpperCase();
    if(code.length!==6) throw new Error('Invite codes are 6 characters long.');
    const invite = await db.previewInvite(code);
    if(!invite) throw new Error("That code didn't work. Check it with your partner.");
    renderJoinDetails(code, invite);
  });
  if(prefill) $('join-next').click();
}

async function renderJoinDetails(code, invite){
  const signedIn = !!(await db.session());
  setupScreen(`${invite.name_a} & ${invite.name_b}`, `${invite.name_a} set up your Sync Up. Check your name${signedIn ? '' : ' and create your login'}.`, `
    <div class="partner-block">
      <div class="tag" style="color:var(--b)">You</div>
      <div class="field"><label>Your name</label><input id="nameB" maxlength="40" value="${escapeHtml(invite.name_b)}"></div>
      ${signedIn ? '' : `<div class="two-col">
        <div class="field"><label>Email</label><input id="emailB" type="email" placeholder="you@email.com" autocomplete="email"></div>
        <div class="field"><label>Password</label><input id="passB" type="password" placeholder="6+ characters" autocomplete="new-password"></div>
      </div>`}
    </div>
    <div class="err" id="join-err"></div>
    <button class="btn btn-full btn-b" id="join-submit">Join ${escapeHtml(invite.name_a)}</button>
    <div class="switch-link"><button id="go-back">Back</button></div>
  `);
  $('go-back').onclick = () => renderJoin(code);
  onSubmit('join-submit', 'join-err', async () => {
    const name = val('nameB');
    if(!name) throw new Error('Add your name.');
    if(!(await db.session())){
      const email = val('emailB'), pass = $('passB').value;
      if(!email || !pass) throw new Error('Add your email and a password.');
      await db.signUp(email, pass);
    }
    await db.joinCouple(code, name);
    await db.loadProfile();
    boot();
  });
}

function renderLogin(){
  setupScreen('Welcome back', 'Log in to your Sync Up.', `
    <div class="field"><label>Email</label><input id="login-email" type="email" autocomplete="email"></div>
    <div class="field"><label>Password</label><input id="login-pass" type="password" autocomplete="current-password"></div>
    <div class="err" id="login-err"></div>
    <button class="btn btn-full" id="login-submit">Log in</button>
    <div class="switch-link">New here? <button id="go-back">Start or join a Sync Up</button></div>
  `);
  $('go-back').onclick = renderWelcome;
  onSubmit('login-submit', 'login-err', async () => {
    const email = val('login-email'), pass = $('login-pass').value;
    if(!email || !pass) throw new Error('Enter your email and password.');
    await db.logIn(email, pass);
    if(await db.loadProfile()) boot(); else renderNoCouple();
  });
}

// Logged in, but not linked to a couple yet (e.g. signed up and closed the app mid-setup).
function renderNoCouple(){
  setupScreen('Almost there', "You're logged in, but not linked to your partner yet.", `
    <button class="btn btn-full" id="go-create">Start our Sync Up</button>
    <button class="btn btn-ghost btn-full" id="go-join" style="margin-top:10px;">I have an invite code</button>
    <div class="switch-link"><button id="go-logout">Log out</button></div>
  `);
  $('go-create').onclick = () => renderCreate(true);
  $('go-join').onclick = () => renderJoin();
  $('go-logout').onclick = async () => { await db.logOut(); renderWelcome(); };
}

/* ---------------- boot ---------------- */
let booted = false;
async function boot(){
  me = db.slot;
  if(location.search) history.replaceState(null, '', location.pathname);
  $('setup-screen').style.display = 'none';
  $('app').style.display = 'block';
  if(!booted){
    booted = true;
    wireStaticControls();
    $('whoami-btn').onclick = async () => {
      if(!confirm('Log out of Sync Up on this device?')) return;
      if(myTrip) await finishTrip('Stopped sharing location');
      await db.logOut();
      location.reload();
    };
    db.onSignedOut(() => location.reload());
    db.subscribe(onLiveChange);
    // Safety nets for live updates missed while the phone slept or the network dropped.
    document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible') refresh(); });
    setInterval(refresh, 60000);
  }
  await refresh();
  resumeTrip();
}

function wireStaticControls(){
  const chipsWrap = $('quick-chips');
  chipsWrap.innerHTML = QUICK.map(q=>`<button class="chip" data-q="${q}">${q}</button>`).join('');
  chipsWrap.querySelectorAll('.chip').forEach(btn=>{ btn.onclick = () => pushFeed(btn.dataset.q, 'status'); });
  $('send-update').onclick = () => {
    const inp = $('custom-update');
    const v = inp.value.trim(); if(!v) return;
    inp.value=''; pushFeed(v,'status');
  };
  $('custom-update').addEventListener('keydown', e=>{ if(e.key==='Enter') $('send-update').click(); });
  $('add-date').onclick = addDate;
  $('recap-generate').onclick = generateRecapCard;
  $('recap-share').onclick = shareRecapCard;
  $('recap-download').onclick = downloadRecapCard;

  const toyBtn = $('toy-btn');
  toyBtn.onclick = () => {
    pushFeed('is thinking of you 💛', 'thinking');
    const original = toyBtn.textContent;
    toyBtn.textContent = 'Sent 💛';
    toyBtn.classList.add('sent');
    setTimeout(()=>{ toyBtn.textContent = original; toyBtn.classList.remove('sent'); }, 1500);
  };

  const v = VERSES[dayOfYear(new Date()) % VERSES.length];
  $('verse-text').textContent = '“' + v[0] + '”';
  $('verse-ref').textContent = v[1];
  $('verse-date').textContent = new Date().toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'});

  const h = new Date().getHours();
  const greetWord = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('greet').textContent = greetWord + ',';
}

/* ---------------- render ---------------- */
function render(){
  if(!state) return;
  const kept = keepInputs();
  $('names-label').textContent = `${state.setup.nameA} & ${state.setup.nameB}`;
  $('whoami-label').textContent = nameOf(me);
  $('whoami-dot').style.background = colorVar(me);

  renderPills();
  renderMoods();
  renderThread();
  renderJournal();
  renderPhotos();
  renderSchedule();
  renderDates();
  renderDriving();
  renderHistory();
  restoreInputs(kept);
}

// Rendering rebuilds the sections, so carry over anything half-typed (and which field had
// focus), or a live update from your partner would wipe what you're in the middle of writing.
function keepInputs(){
  const fields = [...document.querySelectorAll('#app main input[id], #app main textarea[id]')]
    .filter(el => el.type!=='file' && el.value)
    .map(el => ({id:el.id, value:el.value, start:el.selectionStart, end:el.selectionEnd}));
  const active = document.activeElement;
  const openPickers = [...document.querySelectorAll('.mood-picker.open')].map(el => el.id);
  return {fields, focused: active && active.id, openPickers};
}
function restoreInputs({fields, focused, openPickers}){
  openPickers.forEach(id => { const el = $(id); if(el) el.classList.add('open'); });
  fields.forEach(f => { const el = $(f.id); if(el && !el.value) el.value = f.value; });
  const el = focused && $(focused);
  if(el && el!==document.activeElement && /^(INPUT|TEXTAREA)$/.test(el.tagName)){
    el.focus();
    const f = fields.find(x => x.id===focused);
    if(f && f.start!=null){ try{ el.setSelectionRange(f.start, f.end); }catch(e){} }
  }
}

function renderPills(){
  const wrap = $('pill-row');
  const streak = computeStreak();
  const nextDate = (state.dates||[]).filter(d=>d.date >= todayKey()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
  let html = '';
  if(!state.partnerJoined && state.inviteCode){
    html += `<button class="pill invite" id="invite-pill">💌 Waiting for ${escapeHtml(nameOf(other(me)))} · code <span class="mono">${escapeHtml(state.inviteCode)}</span> · tap to share</button>`;
  }
  if(streak > 0) html += `<div class="pill streak">🔥 ${streak} day${streak===1?'':'s'} in sync</div>`;
  if(nextDate){
    const days = Math.max(0, Math.round((new Date(nextDate.date+'T00:00:00') - new Date(todayKey()+'T00:00:00')) / 86400000));
    html += `<div class="pill countdown">📅 ${days===0?'Today':days+' day'+(days===1?'':'s')} until ${escapeHtml(nextDate.title)}</div>`;
  }
  wrap.innerHTML = html;
  const invitePill = $('invite-pill');
  if(invitePill) invitePill.onclick = () => shareInvite(state.inviteCode);
}

// Counted on the server across your full history (days you both posted something).
function computeStreak(){
  return state.streak || 0;
}

function computeWeekRecap(){
  const days = [...Array(7)].map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(6-i)); return d.toLocaleDateString('en-CA'); });
  const daySet = new Set(days);
  const feed = state.feed || [];
  const moodByDay = {A:{}, B:{}};
  feed.filter(f=>f.type==='mood' && f.emoji).forEach(f=>{
    const key = new Date(f.ts).toLocaleDateString('en-CA');
    if(daySet.has(key) && !moodByDay[f.person][key]) moodByDay[f.person][key] = f.emoji;
  });
  const updatesCount = feed.filter(f => daySet.has(new Date(f.ts).toLocaleDateString('en-CA'))).length;
  const journal = state.journal || {};
  const journalTogether = days.filter(key => journal[key] && journal[key].A && journal[key].B).length;
  const datesThisWeek = (state.dates||[]).filter(d => daySet.has(d.date)).length;
  return { days, moodByDay, streak: computeStreak(), updatesCount, journalTogether, datesThisWeek };
}

function renderMoods(){
  const grid = $('mood-grid');
  grid.innerHTML = '';
  ['A','B'].forEach(p=>{
    const name = nameOf(p);
    const m = state.moods[p];
    const isSelf = p===me;
    const glowColor = p==='A' ? 'var(--a)' : 'var(--b)';
    const el = document.createElement('div');
    el.className = 'mood-card' + (isSelf?' self':'');
    el.style.borderColor = isSelf ? 'transparent' : '';
    el.innerHTML = `
      <div class="glow" style="background:${glowColor}"></div>
      <div class="who"><span class="dot" style="background:${glowColor};width:7px;height:7px;border-radius:50%;display:inline-block;"></span>${escapeHtml(name)}${isSelf?' (you)':''}</div>
      ${m ? `<div class="emoji">${escapeHtml(m.emoji)}</div><div class="label">${escapeHtml(m.label)}</div>${m.note?`<div class="note">${escapeHtml(m.note)}</div>`:''}<div class="ts">${fmtTime(m.ts)}</div>`
          : `<div class="empty">${isSelf?'Set your mood →':'No mood set yet'}</div>`}
      ${isSelf ? `<div class="mood-picker" id="picker-${p}">${MOODS.map(([e,l])=>`<button class="emoji-btn" data-e="${e}" data-l="${l}">${e}</button>`).join('')}<input type="text" id="mood-note-${p}" placeholder="Add a note (optional)" maxlength="80"></div>` : ''}
    `;
    if(isSelf){
      el.onclick = (ev) => { if(ev.target.closest('.mood-picker')) return; $('picker-'+p).classList.toggle('open'); };
      grid.appendChild(el);
      el.querySelectorAll('.emoji-btn').forEach(btn=>{
        btn.onclick = (ev) => {
          ev.stopPropagation();
          const noteEl = $('mood-note-'+p);
          const note = noteEl.value.trim();
          noteEl.value = '';
          $('picker-'+p).classList.remove('open');
          save(async () => {
            await db.setMood(btn.dataset.e, btn.dataset.l, note);
            await db.postFeed(`felt ${btn.dataset.l.toLowerCase()} ${btn.dataset.e}`, 'mood', btn.dataset.e);
          });
        };
      });
      el.querySelector('.mood-picker input').addEventListener('click', e=>e.stopPropagation());
    } else { grid.appendChild(el); }
  });
}

function renderThread(){
  const wrap = $('thread');
  const items = (state.feed||[]).slice(0,30);
  $('thread-count').textContent = items.length ? items.length + ' updates' : '';
  if(!items.length){ wrap.innerHTML = '<div class="empty">Nothing posted yet. Send the first update above.</div>'; return; }
  wrap.innerHTML = items.map(it=>{
    const col = it.person==='A' ? 'var(--a)' : 'var(--b)';
    const reacted = it.reactions[me];
    const count = (it.reactions.A?1:0)+(it.reactions.B?1:0);
    return `<div class="thread-item${it.type==='thinking'?' thinking':''}">
      <div class="node" style="background:${col}"></div>
      <div class="row"><span class="who" style="color:${col}">${escapeHtml(nameOf(it.person))}</span><span class="ts">${fmtTime(it.ts)}</span></div>
      <div class="txt">${escapeHtml(it.text)}</div>
      <div class="react-row"><button class="react-btn ${reacted?'active':''}" data-id="${it.id}">♥</button>${count?`<span class="react-count">${count}</span>`:''}</div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.react-btn').forEach(btn=>{
    btn.onclick = () => {
      const item = state.feed.find(f=>f.id===btn.dataset.id);
      if(item) save(() => db.setReaction(item.id, !item.reactions[me]));
    };
  });
}

// Private until you've both written: the database only hands over your partner's entry
// once yours exists. journalWritten says who has written, without revealing the text.
function renderJournal(){
  const wrap = $('journal-grid');
  const key = todayKey();
  const day = state.journal[key] || {A:null, B:null};
  const written = new Set(state.journalWritten || []);
  const bothWritten = written.has('A') && written.has('B');
  wrap.innerHTML = '';
  ['A','B'].forEach(p=>{
    const name = escapeHtml(nameOf(p));
    const isSelf = p===me;
    const entry = day[p];
    const side = document.createElement('div');
    side.className = 'journal-side';
    if(bothWritten && entry){
      side.innerHTML = `<div class="who">${name}${isSelf?' (you)':''}</div><div class="journal-entry-text">${escapeHtml(entry.text)}</div>`;
    } else if(isSelf && written.has(p)){
      side.innerHTML = `<div class="who">${name} (you)</div><div class="journal-locked"><span class="lock-emoji">✍️</span>Written. Unlocks once ${escapeHtml(nameOf(other(p)))} writes too</div>`;
    } else if(isSelf){
      side.innerHTML = `<div class="who">${name} (you)</div><textarea id="journal-input" placeholder="What was today like?"></textarea><button class="btn" id="journal-submit" style="margin-top:10px;">Save entry</button>`;
    } else if(written.has(p)){
      side.innerHTML = `<div class="who">${name}</div><div class="journal-locked"><span class="lock-emoji">✍️</span>Has written today. Write yours to unlock it</div>`;
    } else {
      side.innerHTML = `<div class="who">${name}</div><div class="journal-locked"><span class="lock-emoji">🔒</span>Hasn't written yet today</div>`;
    }
    wrap.appendChild(side);
  });
  const submitBtn = $('journal-submit');
  if(submitBtn){
    submitBtn.onclick = () => {
      const text = $('journal-input').value.trim();
      if(!text) return;
      submitBtn.disabled = true;
      save(async () => {
        await db.writeJournal(text);
        await db.postFeed('wrote in the journal today 📓', 'journal');
      });
    };
  }
}

function renderPhotos(){
  const wrap = $('photo-grid');
  const key = todayKey();
  const day = state.photos[key] || {A:null,B:null};
  wrap.innerHTML = '';
  ['A','B'].forEach(p=>{
    const name = escapeHtml(nameOf(p));
    const isSelf = p===me;
    const photo = day[p];
    const slot = document.createElement('div');
    slot.className = 'photo-slot';
    if(photo){
      slot.innerHTML = `<img src="${photo}" alt="${name}'s photo">`;
    } else {
      slot.innerHTML = `<div class="placeholder"><span class="icon">📷</span>${isSelf?'Add your photo':name+" hasn't added one"}</div>`;
    }
    if(isSelf){
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = (e) => handlePhotoUpload(e, p, key);
      slot.appendChild(input);
      slot.onclick = () => input.click();
    }
    wrap.appendChild(slot);
  });
}

function handlePhotoUpload(e, p, key){
  const file = e.target.files[0];
  if(!file) return;
  toast('Adding your photo…');
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1080;
      const scale = Math.min(1, maxW/img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width*scale; canvas.height = img.height*scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob => {
        if(!blob){ toast("Couldn't read that photo. Try another one."); return; }
        save(async () => {
          await db.uploadPhoto(blob, key);
          await db.postFeed("added today's photo 📷", 'photo');
        });
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => toast("Couldn't read that photo. Try another one.");
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function renderSchedule(){
  const wrap = $('sched-cols');
  wrap.innerHTML = '';
  ['A','B'].forEach(p=>{
    const name = escapeHtml(nameOf(p));
    const isSelf = p===me;
    const items = (state.schedule[p]||[]).slice().sort((x,y)=>x.time.localeCompare(y.time));
    const col = document.createElement('div');
    col.innerHTML = `
      <div style="font-size:12px;color:${p==='A'?'var(--a)':'var(--b)'};font-weight:700;margin-bottom:10px;">${name}${isSelf?' (you)':''}</div>
      <ul class="sched-list">${items.length ? items.map(i=>`<li><span class="time">${escapeHtml(i.time)}</span><span style="flex:1">${escapeHtml(i.activity)}</span>${isSelf?`<button class="icon-btn" data-id="${i.id}">×</button>`:''}</li>`).join('') : '<li class="empty" style="border:none;padding:0">Nothing planned</li>'}</ul>
      ${isSelf ? `<div class="add-row"><input type="time" id="sched-time-${p}"><input type="text" id="sched-act-${p}" placeholder="What's happening" maxlength="140"><button class="icon-btn" id="sched-add-${p}">+</button></div>` : ''}
    `;
    wrap.appendChild(col);
    if(isSelf){
      col.querySelector(`#sched-add-${p}`).onclick = () => {
        const t = $(`sched-time-${p}`).value;
        const a = $(`sched-act-${p}`).value.trim();
        if(!t||!a) return;
        $(`sched-act-${p}`).value='';
        $(`sched-time-${p}`).value='';
        save(async () => {
          await db.addScheduleItem(t, a);
          await db.postFeed(`Planned: ${a} at ${t}`, 'schedule');
        });
      };
      col.querySelectorAll('.icon-btn[data-id]').forEach(btn=>{
        btn.onclick = () => save(() => db.removeScheduleItem(btn.dataset.id));
      });
    }
  });
}

function addDate(){
  const title = val('date-title');
  const date = $('date-date').value;
  const time = $('date-time').value;
  if(!title||!date) return;
  $('date-title').value='';
  save(async () => {
    await db.addDate(title, date, time);
    await db.postFeed(`Added a plan: ${title} on ${date}${time?' at '+time:''}`, 'date');
  });
}

function renderDates(){
  const wrap = $('dates-list');
  const items = state.dates||[];
  if(!items.length){ wrap.innerHTML = '<div class="empty">No plans yet. Add something for the weekend below.</div>'; return; }
  wrap.innerHTML = items.map(d=>`
    <div class="date-card">
      <div><div class="title">${escapeHtml(d.title)}</div><div class="when">${escapeHtml(d.date)}${d.time?' · '+escapeHtml(d.time):''}</div></div>
      <button class="icon-btn" data-id="${d.id}">×</button>
    </div>`).join('');
  wrap.querySelectorAll('.icon-btn').forEach(btn=>{
    btn.onclick = () => save(() => db.removeDate(btn.dataset.id));
  });
}

/* ---------------- on the way ---------------- */
function haversine(lat1,lng1,lat2,lng2){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
async function geocode(place){
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`);
    const data = await res.json();
    if(data && data[0]) return {lat:parseFloat(data[0].lat), lng:parseFloat(data[0].lon)};
  }catch(e){ console.warn('geocode failed', e); }
  return null;
}

function renderDriving(){
  const statusWrap = $('drive-status');
  statusWrap.innerHTML = ['A','B'].map(p=>{
    const d = state.driving[p];
    const col = p==='A' ? 'var(--a)' : 'var(--b)';
    let statusText = 'Not on the way';
    if(d && d.active){
      const info = TRAVEL_MODES[d.mode] || TRAVEL_MODES.drive;
      statusText = `${info.icon} ${info.label}${d.destination?' to '+escapeHtml(d.destination):''} · started ${fmtTime(d.startedTs)}`;
      if(d.etaMin!=null) statusText += ` · ~${d.etaMin} min away`;
    }
    return `<div class="drive-pill ${d&&d.active?'on':''}">
      <div class="who"><span class="dot" style="background:${col};width:8px;height:8px;border-radius:50%;display:inline-block;"></span>${escapeHtml(nameOf(p))}</div>
      ${statusText}
    </div>`;
  }).join('');

  const myDrive = state.driving[me];
  const controls = $('drive-controls');
  if(myDrive && myDrive.active){
    controls.innerHTML = `<button class="btn btn-ghost" id="stop-driving">Stop sharing location</button>`;
    controls.querySelector('#stop-driving').onclick = stopDriving;
  } else {
    controls.innerHTML = `
      <div class="composer" id="mode-chips">${Object.entries(TRAVEL_MODES).map(([key,m])=>`<button class="chip mode-chip${key==='drive'?' active':''}" data-mode="${key}">${m.icon} ${m.label}</button>`).join('')}</div>
      <div class="drive-form"><input type="text" id="dest-input" placeholder="Where to? (optional)"><button class="btn" id="start-driving">Start</button></div>`;
    controls.querySelectorAll('.mode-chip').forEach(btn=>{
      btn.onclick = () => { controls.querySelectorAll('.mode-chip').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
    });
    controls.querySelector('#start-driving').onclick = startDriving;
  }

  const anyActive = (state.driving.A&&state.driving.A.active) || (state.driving.B&&state.driving.B.active);
  $('map').style.display = anyActive ? 'block' : 'none';
  if(anyActive) updateMap();
}

async function startDriving(){
  if(!navigator.geolocation){ toast("This browser can't share location."); return; }
  const controls = $('drive-controls');
  const activeChip = controls.querySelector('.mode-chip.active');
  const mode = activeChip ? activeChip.dataset.mode : 'drive';
  const info = TRAVEL_MODES[mode];
  const destination = val('dest-input');
  let destCoords = null;
  if(destination){
    destCoords = await geocode(destination);
    if(!destCoords) toast("Couldn't find that place, so sharing won't stop on its own.");
  }
  myTrip = {active:true, mode, destination, destLat:destCoords?destCoords.lat:null, destLng:destCoords?destCoords.lng:null, lat:null, lng:null, etaMin:null, startedTs:Date.now()};
  await save(async () => {
    await db.saveTrip(myTrip);
    await db.postFeed(`${info.icon} Started ${info.label.toLowerCase()}${destination?' to '+destination:''}`, 'driving');
  });
  watchTrip();
}

// Pick sharing back up if the page reloaded (or the phone slept) mid-trip.
function resumeTrip(){
  const d = state && state.driving[me];
  if(!d || !d.active || watchId!==null) return;
  myTrip = {...d};
  watchTrip();
}

function watchTrip(){
  if(watchId!==null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPosition, err=>{
    console.warn('geo error', err);
    if(err.code===err.PERMISSION_DENIED) toast('Location is blocked for Sync Up. Allow it in your browser settings.');
  }, {enableHighAccuracy:true, maximumAge:10000, timeout:15000});
}

async function onPosition(pos){
  if(!myTrip || !myTrip.active) return;
  myTrip.lat = pos.coords.latitude; myTrip.lng = pos.coords.longitude;
  const modeInfo = TRAVEL_MODES[myTrip.mode] || TRAVEL_MODES.drive;
  if(myTrip.destLat!=null && myTrip.destLng!=null){
    const dist = haversine(myTrip.lat,myTrip.lng,myTrip.destLat,myTrip.destLng);
    myTrip.etaMin = Math.max(0, Math.round(dist / (modeInfo.speedKmh*1000/60)));
    if(dist < modeInfo.radius){ await finishTrip('Arrived. Location sharing stopped automatically'); return; }
  }
  // GPS can fire several times a second; saving every few seconds is plenty for the map.
  if(Date.now() - lastTripSave < 5000) return;
  lastTripSave = Date.now();
  try{ await db.saveTrip(myTrip); }catch(e){ console.warn('location save failed', e); }
}

async function finishTrip(message){
  if(watchId!==null){ navigator.geolocation.clearWatch(watchId); watchId=null; }
  myTrip = null;
  await save(async () => {
    await db.saveTrip({active:false});
    await db.postFeed(message, 'driving');
  });
}

function stopDriving(){ return finishTrip('Arrived / stopped sharing location'); }

function updateMap(){
  const mapEl = $('map');
  if(!map){
    map = L.map(mapEl).setView([0,0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'&copy; OpenStreetMap contributors', maxZoom:19}).addTo(map);
  }
  const pts = [];
  ['A','B'].forEach(p=>{
    const d = state.driving[p];
    const col = p==='A' ? '#FF8B5E' : '#8C5CFF';
    if(d && d.active && d.lat && d.lng){
      if(markers[p]) map.removeLayer(markers[p]);
      const modeIcon = (TRAVEL_MODES[d.mode] || TRAVEL_MODES.drive).icon;
      markers[p] = L.circleMarker([d.lat,d.lng], {radius:9, color:col, fillOpacity:0.85}).addTo(map).bindTooltip(escapeHtml(nameOf(p))+' '+modeIcon);
      pts.push([d.lat,d.lng]);
    } else if(markers[p]){ map.removeLayer(markers[p]); delete markers[p]; }
  });
  if(pts.length===1){ map.setView(pts[0], 13); }
  else if(pts.length===2){ map.fitBounds(pts, {padding:[30,30]}); }
  setTimeout(()=>map.invalidateSize(), 200);
}

/* ---------------- history ---------------- */
function renderHistory(){
  const wrap = $('history-list');
  const feed = state.feed || [];
  if(!feed.length){ wrap.innerHTML = '<div class="empty">Your days will start showing up here once you use the app.</div>'; return; }
  const groups = {};
  feed.forEach(f=>{
    const key = new Date(f.ts).toLocaleDateString('en-CA');
    groups[key] = groups[key] || [];
    groups[key].push(f);
  });
  const keys = Object.keys(groups).sort().reverse().slice(0,14);
  wrap.innerHTML = keys.map(key=>{
    const items = groups[key];
    return `<div class="history-day">
      <div class="date">${fmtDayLabel(key)}</div>
      ${items.map(it=>`<div class="item"><span class="who">${escapeHtml(nameOf(it.person))}</span> · ${escapeHtml(it.text)} <span class="ts mono" style="color:var(--muted);font-size:11px;">${fmtTime(it.ts)}</span></div>`).join('')}
    </div>`;
  }).join('');
}

/* ---------------- recap card ---------------- */
let recapBlob = null;
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function wrapCenteredText(ctx,text,cx,y,maxWidth,lineHeight){
  const words = text.split(' ');
  let line = '', lines = [];
  words.forEach(word=>{
    const test = line ? line+' '+word : word;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = word; }
    else line = test;
  });
  if(line) lines.push(line);
  const startY = y - (lines.length-1)*lineHeight/2;
  lines.forEach((l,i)=> ctx.fillText(l, cx, startY + i*lineHeight));
}

function roundRectPath(ctx,x,y,w,h,r){
  if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); return; }
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function generateRecapCard(){
  const recap = computeWeekRecap();
  const colA = colorVar('A'), colB = colorVar('B');
  const nameA = state.setup.nameA, nameB = state.setup.nameB;
  const W=1080, H=1080;
  const canvas = document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');

  roundRectPath(ctx,0,0,W,H,48);
  ctx.clip();
  ctx.fillStyle = '#FFF8F0';
  ctx.fillRect(0,0,W,H);
  const grad = ctx.createLinearGradient(0,0,W,H);
  grad.addColorStop(0, 'rgba(255,139,94,0.16)');
  grad.addColorStop(1, 'rgba(140,92,255,0.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2B2438';
  ctx.font = '600 34px "Baloo 2","Segoe UI Emoji",sans-serif';
  ctx.fillText('Sync Up 💛', 64, 90);

  ctx.font = '700 52px "Baloo 2","Segoe UI Emoji",sans-serif';
  ctx.fillText(`${nameA} & ${nameB}'s week`, 64, 170);

  ctx.font = '500 24px "Plus Jakarta Sans",sans-serif';
  ctx.fillStyle = '#8D849C';
  const fmtCardDate = key => new Date(key+'T00:00:00').toLocaleDateString([], {month:'short', day:'numeric'});
  const rangeLabel = `${fmtCardDate(recap.days[0])} – ${fmtCardDate(recap.days[6])}`;
  ctx.fillText(rangeLabel, 64, 208);

  if(recap.streak > 0){
    const streakText = `🔥 ${recap.streak} day${recap.streak===1?'':'s'} in sync`;
    ctx.font = '700 28px "Baloo 2","Segoe UI Emoji",sans-serif';
    const tw = ctx.measureText(streakText).width;
    roundRectPath(ctx, 64, 232, tw+48, 56, 28);
    ctx.fillStyle = 'rgba(46,196,182,0.15)';
    ctx.fill();
    ctx.fillStyle = '#1F8F84';
    ctx.fillText(streakText, 88, 268);
  }

  const rowLabelW = 130;
  const gridTop = 340, gridLeft = 64+rowLabelW, gridW = W-128-rowLabelW, cellW = gridW/7, rowH = 150;
  ctx.font = '500 20px "Plus Jakarta Sans",sans-serif';
  ctx.fillStyle = '#8D849C';
  ctx.textAlign = 'center';
  recap.days.forEach((key,i)=>{
    const dow = DAY_LABELS[(new Date(key+'T00:00:00').getDay()+6)%7];
    ctx.fillText(dow, gridLeft + cellW*i + cellW/2, gridTop);
  });
  ['A','B'].forEach((p,row)=>{
    const y = gridTop + 56 + row*rowH;
    const col = p==='A' ? colA : colB;
    recap.days.forEach((key,i)=>{
      const cx = gridLeft + cellW*i + cellW/2;
      ctx.beginPath();
      ctx.arc(cx, y, 46, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
      const emoji = recap.moodByDay[p][key];
      ctx.font = '42px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
      ctx.fillStyle = '#2B2438';
      ctx.fillText(emoji || '·', cx, y+14);
    });
  });
  ctx.textAlign = 'left';
  ctx.font = '700 24px "Baloo 2",sans-serif';
  ctx.fillStyle = '#2B2438';
  ctx.fillText(nameA, 64, gridTop+56+8, rowLabelW-16);
  ctx.fillText(nameB, 64, gridTop+56+rowH+8, rowLabelW-16);

  const tileY = gridTop + 56 + rowH*2 + 60;
  const tiles = [
    {n: recap.updatesCount, label: recap.updatesCount===1?'update shared':'updates shared'},
    {n: recap.journalTogether, label: recap.journalTogether===1?'day journaled together':'days journaled together'},
    {n: recap.datesThisWeek, label: recap.datesThisWeek===1?'date planned':'dates planned'},
  ];
  const tileGap = 24, tileW = (W-128-tileGap*2)/3, tileH = 170;
  tiles.forEach((t,i)=>{
    const x = 64 + i*(tileW+tileGap);
    roundRectPath(ctx, x, tileY, tileW, tileH, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '700 48px "Baloo 2",sans-serif';
    ctx.fillStyle = '#2B2438';
    ctx.fillText(String(t.n), x+tileW/2, tileY+72);
    ctx.font = '500 19px "Plus Jakarta Sans",sans-serif';
    ctx.fillStyle = '#8D849C';
    wrapCenteredText(ctx, t.label, x+tileW/2, tileY+108, tileW-24, 24);
  });

  ctx.textAlign = 'center';
  ctx.font = '600 24px "Baloo 2",sans-serif';
  ctx.fillStyle = '#2B2438';
  ctx.fillText('Sync Up 💛', W/2, H-64);
  ctx.textAlign = 'left';

  const preview = $('recap-preview');
  preview.innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt="This week's Sync Up recap">`;
  canvas.toBlob(blob => { recapBlob = blob; }, 'image/png');
  $('recap-share').style.display = 'inline-flex';
  $('recap-download').style.display = 'inline-flex';
}

async function shareRecapCard(){
  if(!recapBlob) return;
  const file = new File([recapBlob], 'sync-up-week.png', {type:'image/png'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'Our Sync Up week', text:`${state.setup.nameA} & ${state.setup.nameB}'s week on Sync Up 💛`}); }
    catch(e){ /* user cancelled share sheet */ }
  } else {
    downloadRecapCard();
  }
}

function downloadRecapCard(){
  if(!recapBlob) return;
  const url = URL.createObjectURL(recapBlob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sync-up-week.png';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

initSetup();
