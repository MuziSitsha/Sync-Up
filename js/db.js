/* Sync Up data layer: accounts, loading the couple's day, saving changes and live sync,
   all through Supabase. The UI in app.js only talks to the `db` object below. */

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
})();

// Local calendar day as YYYY-MM-DD, offset by a number of days (same format as todayKey()).
function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function write(query) {
  const { error } = await query;
  if (error) throw error;
}

// Photos live in a private bucket, so they're shown through short-lived signed URLs.
// Cache them so a refresh doesn't swap every image's URL (and reload it) each time.
const photoUrls = new Map();
async function signedUrls(paths) {
  const now = Date.now();
  const missing = paths.filter((p) => !(photoUrls.get(p)?.expires > now + 5 * 60 * 1000));
  if (missing.length) {
    const { data, error } = await sb.storage.from('photos').createSignedUrls(missing, 3600);
    if (!error) data.forEach((d) => { if (d.signedUrl) photoUrls.set(d.path, { url: d.signedUrl, expires: now + 3600 * 1000 }); });
  }
  return Object.fromEntries(paths.map((p) => [p, photoUrls.get(p)?.url || null]));
}

const db = {
  coupleId: null,
  slot: null, // 'A' set the couple up, 'B' joined with the invite code

  /* ---------- accounts ---------- */

  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('Check your email to confirm your account, then log in.');
  },

  async logIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async logOut() {
    await sb.auth.signOut();
    this.coupleId = this.slot = null;
  },

  onSignedOut(fn) {
    sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') fn(); });
  },

  // Which couple and slot the signed-in person belongs to, or null if they aren't linked yet.
  async loadProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const profile = await rows(sb.from('profiles').select('couple_id, slot').eq('id', user.id).maybeSingle());
    this.coupleId = profile ? profile.couple_id : null;
    this.slot = profile ? profile.slot : null;
    return profile;
  },

  async createCouple(nameA, nameB) {
    return rows(sb.rpc('create_couple', { p_name_a: nameA, p_name_b: nameB }));
  },

  async previewInvite(code) {
    const found = await rows(sb.rpc('invite_preview', { p_code: code }));
    return found[0] || null;
  },

  async joinCouple(code, name) {
    await write(sb.rpc('join_couple', { p_code: code, p_name: name }));
  },

  /* ---------- reading ---------- */

  // Everything the screens need, in the shape app.js renders from.
  async loadState() {
    const today = localDay(0);
    const weekAgo = localDay(-7);
    const feedSince = new Date(localDay(-30) + 'T00:00:00').toISOString();
    const latest = (slot) => sb.from('moods').select('*').eq('slot', slot).order('created_at', { ascending: false }).limit(1);

    const [couple, members, moodA, moodB, feed, schedule, dates, journal, written, photos, trips, streak] = await Promise.all([
      rows(sb.from('couples').select('*').single()),
      rows(sb.from('profiles').select('slot')),
      rows(latest('A')),
      rows(latest('B')),
      rows(sb.from('feed').select('*, reactions(slot)').gte('created_at', feedSince).order('created_at', { ascending: false }).limit(500)),
      rows(sb.from('schedule_items').select('*').eq('day', today)),
      rows(sb.from('date_plans').select('*').gte('date', weekAgo).order('date').order('time')),
      rows(sb.from('journal_entries').select('*').gte('day', weekAgo)),
      rows(sb.rpc('journal_status', { p_day: today })),
      rows(sb.from('photos').select('*').eq('day', today)),
      rows(sb.from('driving_sessions').select('*')),
      sb.rpc('couple_streak', { p_tz: TZ }).then((r) => (r.error ? 0 : r.data)),
    ]);

    const urls = await signedUrls(photos.map((p) => p.path));
    const forSlot = (list, slot) => list.filter((r) => r.slot === slot);
    const mood = ([m]) => (m ? { emoji: m.emoji, label: m.label, note: m.note, ts: Date.parse(m.created_at) } : null);
    const photo = (slot) => { const p = photos.find((r) => r.slot === slot); return p ? urls[p.path] : null; };
    const trip = (slot) => {
      const t = trips.find((r) => r.slot === slot);
      return t && {
        active: t.active, mode: t.mode, destination: t.destination,
        destLat: t.dest_lat, destLng: t.dest_lng, lat: t.lat, lng: t.lng, etaMin: t.eta_min,
        startedTs: t.started_at ? Date.parse(t.started_at) : null, ts: Date.parse(t.updated_at),
      };
    };
    const journalByDay = {};
    journal.forEach((j) => {
      journalByDay[j.day] = journalByDay[j.day] || { A: null, B: null };
      journalByDay[j.day][j.slot] = { text: j.text, ts: Date.parse(j.created_at) };
    });

    return {
      setup: { nameA: couple.name_a, nameB: couple.name_b },
      inviteCode: couple.invite_code,
      partnerJoined: members.some((m) => m.slot === 'B'),
      moods: { A: mood(moodA), B: mood(moodB) },
      feed: feed.map((f) => ({
        id: f.id, person: f.slot, text: f.text, type: f.type, emoji: f.emoji, ts: Date.parse(f.created_at),
        reactions: { A: f.reactions.some((r) => r.slot === 'A'), B: f.reactions.some((r) => r.slot === 'B') },
      })),
      schedule: {
        A: forSlot(schedule, 'A').map((s) => ({ id: s.id, time: s.time, activity: s.activity })),
        B: forSlot(schedule, 'B').map((s) => ({ id: s.id, time: s.time, activity: s.activity })),
      },
      dates: dates.map((d) => ({ id: d.id, title: d.title, date: d.date, time: d.time, addedBy: d.added_by })),
      journal: journalByDay,
      journalWritten: written.map((w) => (typeof w === 'string' ? w : Object.values(w)[0])),
      photos: { [today]: { A: photo('A'), B: photo('B') } },
      driving: { A: trip('A'), B: trip('B') },
      streak: streak || 0,
    };
  },

  // Calls `fn` whenever anything in this couple's data changes, on either phone.
  subscribe(fn) {
    const tables = ['couples', 'profiles', 'moods', 'feed', 'reactions', 'schedule_items',
      'date_plans', 'journal_entries', 'photos', 'driving_sessions'];
    const channel = sb.channel('couple-' + this.coupleId);
    tables.forEach((table) => {
      const filter = table === 'couples' ? `id=eq.${this.coupleId}` : `couple_id=eq.${this.coupleId}`;
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, fn);
    });
    // Changes made while the channel was connecting (or reconnecting after the network
    // dropped) aren't replayed, so catch up every time it comes up.
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') fn();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Live sync interrupted:', status);
    });
  },

  /* ---------- writing ---------- */

  postFeed(text, type, emoji = null) {
    return write(sb.from('feed').insert({ couple_id: this.coupleId, slot: this.slot, text, type, emoji }));
  },

  setMood(emoji, label, note) {
    return write(sb.from('moods').insert({ couple_id: this.coupleId, slot: this.slot, emoji, label, note }));
  },

  setReaction(feedId, on) {
    return on
      ? write(sb.from('reactions').insert({ feed_id: feedId, slot: this.slot, couple_id: this.coupleId }))
      : write(sb.from('reactions').delete().eq('feed_id', feedId).eq('slot', this.slot));
  },

  addScheduleItem(time, activity) {
    return write(sb.from('schedule_items').insert({ couple_id: this.coupleId, slot: this.slot, day: localDay(0), time, activity }));
  },

  removeScheduleItem(id) {
    return write(sb.from('schedule_items').delete().eq('id', id));
  },

  addDate(title, date, time) {
    return write(sb.from('date_plans').insert({ couple_id: this.coupleId, added_by: this.slot, title, date, time }));
  },

  removeDate(id) {
    return write(sb.from('date_plans').delete().eq('id', id));
  },

  writeJournal(text) {
    return write(sb.from('journal_entries').upsert(
      { couple_id: this.coupleId, slot: this.slot, day: localDay(0), text },
      { onConflict: 'couple_id,slot,day' },
    ));
  },

  // One photo per person per day: a new one replaces today's old one.
  async uploadPhoto(blob, day) {
    const path = `${this.coupleId}/${this.slot}/${day}-${Date.now().toString(36)}.jpg`;
    const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    const old = await rows(sb.from('photos').select('path').eq('slot', this.slot).eq('day', day).maybeSingle());
    await write(sb.from('photos').upsert(
      { couple_id: this.coupleId, slot: this.slot, day, path },
      { onConflict: 'couple_id,slot,day' },
    ));
    if (old && old.path !== path) await sb.storage.from('photos').remove([old.path]);
  },

  saveTrip(t) {
    return write(sb.from('driving_sessions').upsert({
      couple_id: this.coupleId,
      slot: this.slot,
      active: !!t.active,
      mode: t.mode || 'drive',
      destination: t.destination || '',
      dest_lat: t.destLat ?? null,
      dest_lng: t.destLng ?? null,
      lat: t.lat ?? null,
      lng: t.lng ?? null,
      eta_min: t.etaMin ?? null,
      started_at: t.startedTs ? new Date(t.startedTs).toISOString() : null,
      updated_at: new Date().toISOString(),
    }));
  },
};
