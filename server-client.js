// Supabase 网络层（main 进程用）——纯 fetch 实现，不依赖 supabase-js 的 WebSocket。
// 只用 auth 登录 + 调 Edge Function，客户端只拿黑盒结果，不含密码链规则。

import fs from 'node:fs';

const URL = 'https://asfhegiiqhgaodpmqvlh.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzZmhlZ2lpcWhnYW9kcG1xdmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDU0MDAsImV4cCI6MjEwNTcyMTQwMH0._iFe4e77vDLX6vreQE8jci7az8_t1_U1sdnspmiALbQ';

let accessToken = null;
let refreshToken = null;
let sessionEmail = null;
let sessionFile = null;

export function initSession(file) {
  sessionFile = file;
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    accessToken = s.access_token || null;
    refreshToken = s.refresh_token || null;
    sessionEmail = s.email || null;
  } catch { /* first run */ }
}

function saveSession() {
  if (!sessionFile) return;
  try {
    fs.writeFileSync(sessionFile, JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      email: sessionEmail,
    }));
  } catch { /* ignore */ }
}

function decodeJwt(token) {
  if (!token) return null;
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function jwtExp() {
  const p = decodeJwt(accessToken);
  return p ? (Number(p.exp) || 0) : 0;
}

async function ensureToken() {
  if (!accessToken) return false;
  if (jwtExp() > Date.now() / 1000 + 30) return true;
  if (!refreshToken) {
    accessToken = null;
    return false;
  }
  try {
    const res = await fetchTimeout(`${URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      accessToken = null;
      refreshToken = null;
      saveSession();
      return false;
    }
    accessToken = data.access_token;
    if (data.refresh_token) refreshToken = data.refresh_token;
    if (data.user && data.user.email) sessionEmail = data.user.email;
    saveSession();
    return true;
  } catch {
    return false;
  }
}

function fetchTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  const timeout = new Promise((_, rej) => {
    const err = new Error('超时');
    err.timeout = true;
    setTimeout(() => rej(err), 8000);
  });
  return Promise.race([
    fetch(url, { ...opts, signal: ctrl.signal }),
    timeout,
  ]).finally(() => clearTimeout(t)).catch((e) => {
    if (e && (e.timeout || e.name === 'AbortError' || e.code === 'ABORT_ERR')) {
      const err = new Error('超时');
      err.timeout = true;
      throw err;
    }
    throw e;
  });
}

export async function signIn(email, password) {
  let res;
  try {
    res = await fetchTimeout(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '登录超时' : (e.message || '登录失败') };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return { ok: false, error: data.error_description || data.error_description || data.msg || '登录失败' };
  }
  accessToken = data.access_token;
  refreshToken = data.refresh_token || null;
  sessionEmail = (data.user && data.user.email) || '';
  saveSession();
  return { ok: true, email: sessionEmail };
}

export async function signOut() {
  accessToken = null;
  refreshToken = null;
  sessionEmail = null;
  if (sessionFile) {
    try { fs.unlinkSync(sessionFile); } catch { /* ignore */ }
  }
  return { ok: true };
}

export async function currentUser() {
  const ok = await ensureToken();
  return ok ? { ok: true, email: sessionEmail } : { ok: false };
}

async function call(name, body) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || name + ' 失败') };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || data.error || (name + ' 失败') };
  return { ok: true, data };
}

export async function spawnFly() {
  const r = await call('spawn-fly');
  return r.ok ? { ok: true, fly: r.data } : r;
}

export async function breed(a, b) {
  const r = await call('breed', { fly_a: a, fly_b: b });
  return r.ok ? { ok: true, fly: r.data } : r;
}

export async function submitRecord(timeMs) {
  return call('submit-record', { time_ms: timeMs });
}

export async function submitMutation(flyId) {
  return call('submit-mutation', { fly_id: flyId });
}

export async function getLeaderboard() {
  return call('leaderboard');
}

export async function addPoint(n) {
  return call('add-point', { n });
}

function tokenUser() {
  const p = decodeJwt(accessToken);
  if (!p || !p.sub) return null;
  return { id: p.sub, email: p.email || sessionEmail || '' };
}

function authHeaders(extra) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

export async function createListing(kind, flyIds, note, want, instar, color) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  const me = tokenUser();
  if (!me) return { ok: false, error: '未登录' };
  const ids = Array.isArray(flyIds) ? flyIds.filter(Boolean) : [];
  if (!ids.length) return { ok: false, error: '参数不对' };
  let res;
  try {
    const open = await fetchTimeout(`${URL}/rest/v1/listings?status=eq.open&seller_id=eq.${me.id}&select=fly_id,fly_ids`, {
      headers: authHeaders(),
    });
    const rows = await open.json().catch(() => []);
    const taken = new Set();
    for (const row of rows || []) {
      if (row.fly_id) taken.add(row.fly_id);
      for (const x of row.fly_ids || []) taken.add(x);
    }
    if (ids.some((id) => taken.has(id))) return { ok: false, error: '已经上架过了' };
    res = await fetchTimeout(`${URL}/rest/v1/listings`, {
      method: 'POST',
      headers: authHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        seller_id: me.id,
        seller_email: me.email,
        kind,
        fly_id: ids[0],
        fly_ids: ids,
        quantity: ids.length,
        instar: instar || null,
        color: color || 'wild',
        note: String(note || '').trim(),
        want: want || 'any',
        status: 'open',
      }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '上架失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || err.error || '上架失败' };
  }
  return { ok: true, data: { ok: true } };
}

export async function listListings() {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  const me = tokenUser();
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/listings?status=eq.open&select=id,seller_id,seller_email,kind,color,note,want,quantity,fly_id,fly_ids,instar,created_at&order=created_at.desc&limit=50`, {
      headers: authHeaders(),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '商店加载失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || '商店加载失败' };
  }
  const rows = await res.json().catch(() => []);
  const listings = (rows || []).map((l) => ({
    ...l,
    mine: !!(me && (l.seller_id === me.id || l.seller_email === me.email)),
  }));
  return { ok: true, data: { listings } };
}

export async function unlistListing(id) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/listings?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'closed' }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '下架失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || err.error || '下架失败' };
  }
  const rows = await res.json().catch(() => []);
  const row = rows[0] || {};
  const ids = (Array.isArray(row.fly_ids) && row.fly_ids.length) ? row.fly_ids : (row.fly_id ? [row.fly_id] : []);
  const items = ids.map((fid) => ({
    kind: row.kind || 'fly',
    serverId: fid,
    color: row.color || 'wild',
    codon: '',
    instar: row.instar || 1,
  }));
  return { ok: true, data: { ok: true, items } };
}

export async function createOffer(listingId, kind, flyIds, note, color, instar) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  const me = tokenUser();
  if (!me) return { ok: false, error: '未登录' };
  const ids = Array.isArray(flyIds) ? flyIds.filter(Boolean) : [];
  if (!listingId || !ids.length) return { ok: false, error: '先在瓶子里选中要换的' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/offers`, {
      method: 'POST',
      headers: authHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        listing_id: listingId,
        buyer_id: me.id,
        buyer_email: me.email,
        kind,
        fly_id: ids[0],
        fly_ids: ids,
        quantity: ids.length,
        color: color || 'wild',
        note: String(note || '').trim(),
        status: 'pending',
      }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '报价失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || err.error || '报价失败' };
  }
  return { ok: true, data: { ok: true } };
}

export async function listOffers() {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/offers?select=id,listing_id,buyer_id,buyer_email,kind,color,note,quantity,fly_id,fly_ids,status,created_at,listings(kind,color,fly_id,fly_ids,note)&status=in.(pending,accepted)&order=created_at.desc&limit=50`, {
      headers: authHeaders(),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '报价加载失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || '报价加载失败' };
  }
  const rows = await res.json().catch(() => []);
  return { ok: true, data: { offers: rows || [] } };
}

export async function acceptOffer(id) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/rpc/accept_offer`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ p_offer_id: id }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '接受失败') };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || data.error || '接受失败' };
  return { ok: true, data };
}

export async function rejectOffer(id) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/offers?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'rejected' }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '拒绝失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || '拒绝失败' };
  }
  return { ok: true };
}

export async function claimOffer(id) {
  if (!(await ensureToken())) return { ok: false, error: '未登录' };
  let res;
  try {
    res = await fetchTimeout(`${URL}/rest/v1/offers?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'claimed' }),
    });
  } catch (e) {
    return { ok: false, error: e.timeout ? '请求超时' : (e.message || '领取失败') };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.message || '领取失败' };
  }
  return { ok: true };
}

export async function getPoints() {
  return call('get-points');
}
