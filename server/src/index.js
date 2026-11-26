// Turtle Yard relay: passes messages between two games. The only things it keeps are the care-package
// mailbox (for up to a week) and each game's list of friend codes (so it knows who may send to whom).
//
// Every game opens one WebSocket to /ws?id=<random device id>. All sockets live in one Durable Object
// (the "hub"), using the hibernation API so idle connections cost nothing.
//
// What a socket may do:
//   hello   { friends: [ids] }      say who your friends are (you learn which of them are online)
//   open    {}                      get a 6-digit visit code for 10 minutes
//   close   {}                      cancel your visit code
//   knock   { code } | { to: id }   ask to visit: by code (anyone), or by id (mutual friends only)
//   answer  { to, yes }             host's reply to a knock; yes = the two of you are linked until one leaves
//   relay   { to, data }            pass data to a linked player or a mutual friend
//   leave   { to }                  end a link
//   package { to, tier }            send today's care package (tier 0-3 = how big) to a friend (one per friend per day, kept up to 7 days)
//   thanks  { to }                  tell a friend you opened their package (they get a thank-you note)
//   ack     { mid }                 got this mail; delete it
//   invite  {}                      make (or replace) your invite-link token, good for 7 days
//   redeem  { token }               used a friend's invite link: they get a friend request to approve
//
// Mail arrives as { t: 'mail', items: [{ mid, kind: 'package' | 'thanks', from, at }] } on hello and as it's sent.
// Nothing here is chat: the server only carries what the game sends (yard snapshots, turtle moves, gifts).

const CODE_TTL = 10 * 60e3;
const MAX_FRIENDS = 40;
const MAX_MSG = 900_000; // Workers allow 1 MiB per WebSocket message
const KNOCKS_PER_MIN = 6; // per socket
const IP_KNOCKS_PER_MIN = 12; // per IP address, so opening many sockets doesn't help guess codes
const ID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const MAIL_DAYS = 7, MAX_MAIL = 40; // a full mailbox refuses new packages
const FRIENDS_KEEP_DAYS = 90; // a game not seen for this long is forgotten
const DAY = 86400e3;
const today = () => new Date().toISOString().slice(0, 10); // UTC day: everyone shares one daily limit

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('Turtle Yard relay 🐢', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 });
    if (!ID_RE.test(url.searchParams.get('id') || '')) return new Response('Bad id', { status: 400 });
    const hub = env.HUB.get(env.HUB.idFromName('hub'));
    return hub.fetch(req);
  },
};

export class Hub {
  constructor(state) {
    this.state = state;
    this.ipKnocks = new Map(); // ip -> [times] (in memory only; forgetting it after hibernation is fine)
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS friends (id TEXT PRIMARY KEY, list TEXT NOT NULL, seen INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS mail (mid INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, to_id TEXT NOT NULL,
      from_id TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL)`);
    // what was sent today, kept after the mail is picked up, so the daily limit holds
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sent (kind TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL, day TEXT NOT NULL,
      PRIMARY KEY (kind, from_id, to_id, day))`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS mail_to ON mail (to_id)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, owner TEXT NOT NULL, exp INTEGER NOT NULL)`);
    try { this.sql.exec('ALTER TABLE mail ADD COLUMN tier INTEGER NOT NULL DEFAULT 0'); } catch { } // package size (added later; fails once it exists)
  }

  async fetch(req) {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    for (const old of this.state.getWebSockets(id)) { // same device connected again (a reload): drop the old socket
      try { old.close(4000, 'replaced'); } catch { }
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, ip: req.headers.get('CF-Connecting-IP') || '', friends: [], links: [], code: null, codeExp: 0, knocks: [] });
    return new Response(null, { status: 101, webSocket: client });
  }

  // ----- helpers -----
  info(ws) { return ws.deserializeAttachment(); }
  save(ws, a) { ws.serializeAttachment(a); }
  sockOf(id) { return this.state.getWebSockets(id).find(w => w.readyState === 1); }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { } }
  mutual(a, b) { // both online and each lists the other as a friend
    const A = this.sockOf(a), B = this.sockOf(b);
    return !!A && !!B && this.info(A).friends.includes(b) && this.info(B).friends.includes(a);
  }
  linked(a, b) { const A = this.sockOf(a); return !!A && this.info(A).links.includes(b); }
  link(a, b, on) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const s = this.sockOf(x); if (!s) continue;
      const i = this.info(s);
      i.links = i.links.filter(v => v !== y);
      if (on) i.links.push(y);
      this.save(s, i);
    }
  }
  limited(ws, a) { // too many knocks lately?
    const now = Date.now();
    a.knocks = a.knocks.filter(t => now - t < 60e3);
    const ipList = (this.ipKnocks.get(a.ip) || []).filter(t => now - t < 60e3);
    if (a.knocks.length >= KNOCKS_PER_MIN || ipList.length >= IP_KNOCKS_PER_MIN) return true;
    a.knocks.push(now); ipList.push(now); this.ipKnocks.set(a.ip, ipList);
    this.save(ws, a);
    return false;
  }
  presence(id) { // tell each mutual friend of `id` whether they're online now
    for (const s of this.state.getWebSockets()) {
      if (s.readyState !== 1) continue;
      const o = this.info(s);
      if (o.id !== id && o.friends.includes(id)) this.send(s, { t: 'online', ids: this.onlineFriends(o) });
    }
  }
  onlineFriends(a) { return a.friends.filter(f => this.mutual(a.id, f)); }
  storedFriends(id) { // a friend list, from the live socket or (if they're away) from storage
    const s = this.sockOf(id);
    if (s) return this.info(s).friends;
    const row = this.sql.exec('SELECT list FROM friends WHERE id = ?', id).toArray()[0];
    return row ? JSON.parse(row.list) : [];
  }
  friendsBothWays(a, b) { return this.storedFriends(a).includes(b) && this.storedFriends(b).includes(a); }
  sendMail(id) { // push waiting mail to a connected game
    const s = this.sockOf(id); if (!s) return;
    const items = this.sql.exec('SELECT mid, kind, from_id AS "from", at, tier FROM mail WHERE to_id = ? ORDER BY mid', id).toArray();
    if (items.length) this.send(s, { t: 'mail', items });
  }
  post(kind, from, to, tier = 0) { // returns null, or why it couldn't be posted
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM mail WHERE to_id = ?', to).one().n;
    if (n >= MAX_MAIL) return 'full';
    const day = today();
    if (this.sql.exec('SELECT 1 FROM sent WHERE kind = ? AND from_id = ? AND to_id = ? AND day = ?', kind, from, to, day).toArray().length) return 'already';
    this.sql.exec('INSERT INTO sent (kind, from_id, to_id, day) VALUES (?, ?, ?, ?)', kind, from, to, day);
    this.sql.exec('INSERT INTO mail (kind, to_id, from_id, day, at, tier) VALUES (?, ?, ?, ?, ?, ?)', kind, to, from, day, Date.now(), tier);
    this.sendMail(to);
    return null;
  }
  tidy() {
    this.sql.exec('DELETE FROM mail WHERE at < ?', Date.now() - MAIL_DAYS * DAY);
    this.sql.exec('DELETE FROM friends WHERE seen < ?', Date.now() - FRIENDS_KEEP_DAYS * DAY);
    this.sql.exec('DELETE FROM invites WHERE exp < ?', Date.now());
    this.sql.exec('DELETE FROM sent WHERE day < ?', new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10));
  }

  // ----- messages -----
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return this.send(ws, { t: 'error', why: 'too big' });
    let m; try { m = JSON.parse(raw); } catch { return; }
    const a = this.info(ws);
    switch (m.t) {
      case 'hello': {
        a.friends = (Array.isArray(m.friends) ? m.friends : []).filter(f => typeof f === 'string' && ID_RE.test(f) && f !== a.id).slice(0, MAX_FRIENDS);
        this.save(ws, a);
        this.sql.exec('INSERT OR REPLACE INTO friends (id, list, seen) VALUES (?, ?, ?)', a.id, JSON.stringify(a.friends), Date.now());
        this.send(ws, { t: 'online', ids: this.onlineFriends(a) });
        this.presence(a.id);
        this.tidy();
        this.sendMail(a.id);
        break;
      }
      case 'open': {
        const used = new Set(this.state.getWebSockets().map(s => this.info(s)).filter(o => o.code && o.codeExp > Date.now()).map(o => o.code));
        let code; do code = String(Math.floor(100000 + Math.random() * 900000)); while (used.has(code));
        a.code = code; a.codeExp = Date.now() + CODE_TTL;
        this.save(ws, a);
        this.send(ws, { t: 'code', code, exp: a.codeExp });
        break;
      }
      case 'close': a.code = null; a.codeExp = 0; this.save(ws, a); break;
      case 'knock': {
        if (this.limited(ws, a)) return this.send(ws, { t: 'knock-fail', why: 'slow down' });
        let host = null, byCode = false;
        if (typeof m.code === 'string') {
          host = this.state.getWebSockets().find(s => { const o = this.info(s); return s.readyState === 1 && o.code === m.code && o.codeExp > Date.now() && o.id !== a.id; });
          byCode = true;
        } else if (typeof m.to === 'string' && this.mutual(a.id, m.to)) host = this.sockOf(m.to);
        if (!host) return this.send(ws, { t: 'knock-fail', why: byCode ? 'no such code' : 'not online' });
        this.send(host, { t: 'knock', from: a.id, byCode });
        break;
      }
      case 'answer': {
        const v = this.sockOf(m.to);
        if (!v || typeof m.to !== 'string') return;
        if (m.yes) this.link(a.id, m.to, true);
        this.send(v, { t: 'answer', from: a.id, yes: !!m.yes });
        break;
      }
      case 'relay': {
        if (typeof m.to !== 'string' || !(this.linked(a.id, m.to) || this.mutual(a.id, m.to))) return this.send(ws, { t: 'relay-fail', to: m.to });
        const v = this.sockOf(m.to);
        if (v) this.send(v, { t: 'relay', from: a.id, data: m.data });
        break;
      }
      case 'package':
      case 'thanks': {
        if (typeof m.to !== 'string' || !ID_RE.test(m.to) || m.to === a.id) return;
        if (!this.friendsBothWays(a.id, m.to)) return this.send(ws, { t: `${m.t}-fail`, to: m.to, why: 'not friends' });
        const tier = m.t === 'package' ? Math.max(0, Math.min(3, m.tier | 0)) : 0; // how big: the sender's game decides (0-3)
        const why = this.post(m.t, a.id, m.to, tier);
        this.send(ws, why ? { t: `${m.t}-fail`, to: m.to, why } : { t: `${m.t}-sent`, to: m.to });
        break;
      }
      case 'invite': {
        const b = crypto.getRandomValues(new Uint8Array(12));
        const token = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
        const exp = Date.now() + 7 * DAY;
        this.sql.exec('DELETE FROM invites WHERE owner = ?', a.id); // one live link each: a new one cancels the old
        this.sql.exec('INSERT INTO invites (token, owner, exp) VALUES (?, ?, ?)', token, a.id, exp);
        this.send(ws, { t: 'invite', token, exp });
        break;
      }
      case 'redeem': {
        if (this.limited(ws, a)) return this.send(ws, { t: 'redeem-fail', why: 'slow down' });
        const row = typeof m.token === 'string' ? this.sql.exec('SELECT owner FROM invites WHERE token = ? AND exp > ?', m.token, Date.now()).toArray()[0] : null;
        if (!row) return this.send(ws, { t: 'redeem-fail', why: 'expired' });
        if (row.owner === a.id) return this.send(ws, { t: 'redeem-fail', why: 'own' });
        const why = this.post('friendreq', a.id, row.owner);
        if (why === 'full') return this.send(ws, { t: 'redeem-fail', why });
        this.send(ws, { t: 'redeemed', owner: row.owner });
        break;
      }
      case 'ack': {
        if (Number.isInteger(m.mid)) this.sql.exec('DELETE FROM mail WHERE mid = ? AND to_id = ?', m.mid, a.id);
        break;
      }
      case 'leave': {
        if (typeof m.to !== 'string') return;
        const was = this.linked(a.id, m.to);
        this.link(a.id, m.to, false);
        const v = this.sockOf(m.to);
        if (v && was) this.send(v, { t: 'left', from: a.id });
        break;
      }
    }
  }

  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }
  gone(ws) {
    const a = this.info(ws);
    if (this.sockOf(a.id) && this.sockOf(a.id) !== ws) return; // replaced by a newer socket from the same device
    for (const p of a.links) {
      const v = this.sockOf(p);
      if (v) { this.send(v, { t: 'left', from: a.id }); const o = this.info(v); o.links = o.links.filter(x => x !== a.id); this.save(v, o); }
    }
    this.presence(a.id);
  }
}
