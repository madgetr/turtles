// Protocol check against a running relay: node test/relay.test.mjs [ws://127.0.0.1:8787]
const URL0 = process.argv[2] || 'ws://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5200';
const rid = () => Math.random().toString(36).slice(2).padEnd(12, 'x') + Math.random().toString(36).slice(2, 10);
function player(id, origin = ORIGIN) {
  const ws = new WebSocket(`${URL0}/ws?id=${id}`, { headers: { Origin: origin } });
  const inbox = [], waiters = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); const w = waiters.findIndex(x => x.t === m.t); if (w >= 0) waiters.splice(w, 1)[0].res(m); else inbox.push(m); };
  const next = (t, ms = 2000) => { const i = inbox.findIndex(m => m.t === t); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { const w = { t, res }; waiters.push(w); setTimeout(() => { const k = waiters.indexOf(w); if (k >= 0) { waiters.splice(k, 1); rej(new Error(`${id.slice(0, 4)}: no ${t}`)); } }, ms); }); };
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; ws.onclose = e => rej(new Error('closed ' + e.code)); });
  return { id, ws, open, next, send: m => ws.send(JSON.stringify(m)), none: (t, ms = 400) => new Promise((res, rej) => setTimeout(() => inbox.some(m => m.t === t) ? rej(new Error(`unexpected ${t}`)) : res(), ms)) };
}
const ok = (c, msg) => { if (!c) throw new Error('FAIL ' + msg); console.log('ok -', msg); };

const A = player(rid()), B = player(rid()), C = player(rid());
await Promise.all([A.open, B.open, C.open]);
for (const p of [A, B, C]) p.send({ t: 'hello', friends: [] });
await Promise.all([A.next('online'), B.next('online'), C.next('online')]);

A.send({ t: 'open' }); const { code } = await A.next('code'); ok(/^\d{6}$/.test(code), 'host gets a 6-digit code');
B.send({ t: 'relay', to: A.id, data: 1 }); await B.next('relay-fail'); ok(true, 'strangers cannot relay');
C.send({ t: 'knock', code: '000000' === code ? '111111' : '000000' }); ok((await C.next('knock-fail')).why === 'no such code', 'wrong code is refused');
B.send({ t: 'knock', code }); const k = await A.next('knock'); ok(k.from === B.id && k.byCode, 'host sees the knock');
A.send({ t: 'answer', to: B.id, yes: true }); ok((await B.next('answer')).yes, 'visitor is let in');
A.send({ t: 'relay', to: B.id, data: { hi: 1 } }); ok((await B.next('relay')).data.hi === 1, 'linked players can relay');
C.send({ t: 'relay', to: B.id, data: 1 }); await C.next('relay-fail'); ok(true, 'others still cannot relay');
B.send({ t: 'leave', to: A.id }); await A.next('left'); ok(true, 'leaving tells the host');
A.send({ t: 'relay', to: B.id, data: 2 }); await A.next('relay-fail'); ok(true, 'no relay after leaving');

// friends
A.send({ t: 'hello', friends: [B.id] }); await A.next('online');
B.send({ t: 'hello', friends: [A.id] }); ok((await B.next('online')).ids.includes(A.id), 'mutual friend shows online');
ok((await A.next('online')).ids.includes(B.id), 'friend is told when the other comes online');
C.send({ t: 'hello', friends: [A.id] }); ok((await C.next('online')).ids.length === 0, 'one-sided friend sees nothing');
C.send({ t: 'knock', to: A.id }); ok((await C.next('knock-fail')).why === 'not online', 'one-sided friend cannot knock');
B.send({ t: 'knock', to: A.id }); ok((await A.next('knock')).byCode === false, 'friend can knock by id');
B.send({ t: 'relay', to: A.id, data: 'gift' }); ok((await A.next('relay')).data === 'gift', 'friends relay without a visit');
B.ws.close(); ok((await A.next('online')).ids.length === 0, 'friend going offline is noticed');

// care packages: mailbox works while the friend is away
const D = player(rid()), E = player(rid());
await Promise.all([D.open, E.open]);
D.send({ t: 'hello', friends: [E.id] }); await D.next('online');
E.send({ t: 'hello', friends: [D.id] }); await E.next('online'); await D.next('online');
C.send({ t: 'package', to: D.id }); ok((await C.next('package-fail')).why === 'not friends', 'strangers cannot send packages');
E.ws.close(); await D.next('online');
D.send({ t: 'package', to: E.id, tier: 9 }); await D.next('package-sent'); ok(true, 'package posted while friend is away');
D.send({ t: 'package', to: E.id }); ok((await D.next('package-fail')).why === 'already', 'one package per friend per day');
const E2 = player(E.id); await E2.open; E2.send({ t: 'hello', friends: [D.id] });
const mail = await E2.next('mail'); ok(mail.items.length === 1 && mail.items[0].kind === 'package' && mail.items[0].from === D.id, 'package waits for the friend');
ok(mail.items[0].tier === 3, 'package size comes through (capped at 3)');
E2.send({ t: 'ack', mid: mail.items[0].mid });
E2.send({ t: 'thanks', to: D.id }); await E2.next('thanks-sent');
const th = await D.next('mail'); ok(th.items.some(i => i.kind === 'thanks' && i.from === E.id), 'thank-you reaches the sender live');
for (const i of th.items) D.send({ t: 'ack', mid: i.mid });
E2.ws.close(); await D.next('online');
const E3 = player(E.id); await E3.open; E3.send({ t: 'hello', friends: [D.id] });
await E3.none('mail', 600); ok(true, 'acked mail is gone');
for (const p of [D, E3]) p.ws.close();

// invite links
const F = player(rid()), G = player(rid());
await Promise.all([F.open, G.open]);
F.send({ t: 'hello', friends: [] }); G.send({ t: 'hello', friends: [] }); await F.next('online'); await G.next('online');
F.send({ t: 'invite' }); const inv = await F.next('invite'); ok(typeof inv.token === 'string' && inv.token.length >= 12, 'invite token made');
F.send({ t: 'redeem', token: inv.token }); ok((await F.next('redeem-fail')).why === 'own', "can't redeem your own link");
G.send({ t: 'redeem', token: 'nope-nope-nope' }); ok((await G.next('redeem-fail')).why === 'expired', 'bad token refused');
G.send({ t: 'redeem', token: inv.token }); ok((await G.next('redeemed')).owner === F.id, 'redeemer learns who invited them');
const fr = await F.next('mail'); ok(fr.items.some(i => i.kind === 'friendreq' && i.from === G.id), 'inviter gets a friend request');
F.send({ t: 'invite' }); await F.next('invite');
G.send({ t: 'redeem', token: inv.token }); ok((await G.next('redeem-fail')).why === 'expired', 'a new link cancels the old one');
for (const p of [F, G]) p.ws.close();

// rate limit
let fails = 0; for (let i = 0; i < 8; i++) C.send({ t: 'knock', code: String(200000 + i) });
for (let i = 0; i < 8; i++) { const r = await C.next('knock-fail'); if (r.why === 'slow down') fails++; }
ok(fails >= 2, 'knocking is rate limited');

// origin check
const bad = player(rid(), 'https://evil.example');
try { await bad.open; ok(false, 'bad origin refused'); } catch { ok(true, 'bad origin refused'); }
for (const p of [A, C]) p.ws.close();
console.log('all relay checks passed');
process.exit(0);
