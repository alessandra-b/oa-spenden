// test/backend.test.js — test automatici del backend (node --test test/)
// Saferpay, Brevo e Redis sono finti (test/mocks.js): nessun pagamento o email reale.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMocks, mockReq, mockRes, setEnv, REDIS } = require('./mocks');

const session = require('../api/session');
const membership = require('../api/membership');
const ret = require('../api/return');
const notify = require('../api/notify');
const nlApi = require('../api/newsletter');
const brevo = require('../lib/brevo');
const secure = require('../lib/secure');

const MEMBER = {
    firstName: 'Anna', lastName: 'Muster', address: 'Bahnhofstrasse 1', postalCode: '6003', city: 'Luzern',
    country: 'CH', birthDate: '1958-04-23', email: 'anna@example.ch', phone: '+41 79 123 45 67', newsletter: true
};
const DONOR = { firstName: 'Bruno', lastName: 'Rossi', address: 'Via Roma 2', postalCode: '6900', city: 'Lugano', email: 'bruno@example.ch', newsletter: false };

function memberBody(over) {
    return Object.assign({ lang: 'de', member: Object.assign({}, MEMBER), statutesAccepted: true, termsAccepted: true }, over || {});
}

async function call(handler, reqOpts) {
    const res = mockRes();
    await handler(mockReq(reqOpts), res);
    return res;
}

function returnQuery(redirectUrl) {
    // ReturnUrl passato a Saferpay -> query dell'indirizzo di ritorno
    return Object.fromEntries(new URL(redirectUrl).searchParams);
}

function lastInit(state) {
    const calls = state.saferpay.calls.filter((c) => c.path.endsWith('/Initialize'));
    return calls[calls.length - 1].body;
}

function pay(state, token, status = 'AUTHORIZED') {
    state.saferpay.tx[token].status = status;
}

test.beforeEach(() => brevo.resetCache());

// ---------------------------------------------------------------------------------------

test('membership GET: quota, anno e statuti dalle variabili', async () => {
    setEnv({ STATUTEN_URL: 'https://cdn.example/statuten.pdf' });
    createMocks();
    const res = await call(membership, { method: 'GET', query: { lang: 'it' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.fee, 100);
    assert.equal(res.body.currency, 'CHF');
    assert.equal(res.body.year, new Date().getFullYear());
    assert.equal(res.body.statutesUrl, 'https://cdn.example/statuten.pdf');
});

test('membership POST: controlli sui dati', async () => {
    setEnv();
    createMocks();
    const cases = [
        [{ member: Object.assign({}, MEMBER, { email: 'x' }) }, 'INVALID_EMAIL'],
        [{ member: Object.assign({}, MEMBER, { birthDate: '1960-02-30' }) }, 'INVALID_BIRTHDATE'],
        [{ member: Object.assign({}, MEMBER, { birthDate: '2999-01-01' }) }, 'INVALID_BIRTHDATE'],
        [{ member: Object.assign({}, MEMBER, { country: 'XX' }) }, 'INVALID_COUNTRY'],
        [{ member: Object.assign({}, MEMBER, { phone: 'abc' }) }, 'INVALID_PHONE'],
        [{ member: Object.assign({}, MEMBER, { city: ' ' }) }, 'MISSING_DETAILS'],
        [{ statutesAccepted: false }, 'STATUTES_NOT_ACCEPTED'],
        [{ termsAccepted: false }, 'TERMS_NOT_ACCEPTED']
    ];
    for (const [over, code] of cases) {
        const res = await call(membership, { body: memberBody(over) });
        assert.equal(res.statusCode, 400, code);
        assert.equal(res.body.code, code);
    }
    // telefono facoltativo
    const ok = await call(membership, { body: memberBody({ member: Object.assign({}, MEMBER, { phone: '' }) }) });
    assert.equal(ok.statusCode, 200);
});

test('membership con database: notifica + ritorno quasi insieme -> un solo incasso, email una volta', async () => {
    setEnv(Object.assign({ STATUTEN_URL: 'https://cdn.example/statuten.pdf', MEMBERSHIP_FEE_CHF: '100' }, REDIS));
    const state = createMocks();

    const start = await call(membership, { body: memberBody({ lang: 'it', amount: 1 /* ignorato */ }) });
    assert.equal(start.statusCode, 200);
    assert.ok(start.body.redirectUrl.startsWith('https://test.saferpay.com/'));
    assert.equal(start.headers['set-cookie'], undefined, 'con il database nessun cookie');

    const init = lastInit(state);
    assert.equal(init.Payment.Amount.Value, '10000', 'importo deciso dal server');
    assert.equal(init.Payer.BillingAddress.CountryCode, 'CH');
    assert.equal(init.Payer.LanguageCode, 'it');
    assert.match(init.Payment.OrderId, /^OAM-\d{8}-[A-F0-9]{8}$/);
    assert.match(init.ReturnUrl.Url, /^https:\/\/spenden\.orchestra-aurea\.ch\/api\/return\?o=OAM-/);
    assert.match(init.Notification.SuccessNotifyUrl, /^https:\/\/spenden\.orchestra-aurea\.ch\/api\/notify\?o=OAM-/);
    assert.equal(init.RequestHeader.SpecVersion, '1.51');

    // dati personali cifrati nel database
    const stored = [...state.redis.data.keys()].find((k) => k.startsWith('order:'));
    assert.ok(stored);
    assert.ok(!state.redis.data.get(stored).v.includes('Muster'), 'nel database i dati sono cifrati');

    pay(state, 'tok1');
    const q = returnQuery(init.Notification.SuccessNotifyUrl);
    const [n, r] = await Promise.all([
        call(notify, { method: 'GET', query: q }),
        call(ret, { method: 'GET', query: returnQuery(init.ReturnUrl.Url) })
    ]);
    assert.equal(n.statusCode, 200, 'notify ok');
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/it/willkommen?status=success');

    const captures = state.saferpay.calls.filter((c) => c.path.endsWith('/Capture'));
    assert.ok(captures.length >= 1 && captures.length <= 2);
    assert.equal(state.saferpay.tx.tok1.status, 'CAPTURED');

    const toMember = state.brevo.emails.filter((e) => e.to[0].email === 'anna@example.ch' && e.tags.includes('oa-member'));
    const toAdmin = state.brevo.emails.filter((e) => e.to[0].email === 'info@orchestra-aurea.ch');
    const optIn = state.brevo.emails.filter((e) => e.tags.includes('oa-newsletter-optin'));
    assert.equal(toMember.length, 1, 'email al socio una volta');
    assert.equal(toAdmin.length, 1, 'email a info@ una volta');
    assert.equal(optIn.length, 1, 'conferma newsletter una volta');

    // contenuti
    assert.equal(toMember[0].sender.email, 'info@orchestra-aurea.ch');
    assert.match(toMember[0].subject, /Orchestra Aurea/);
    assert.match(toMember[0].htmlContent, /Ciao Anna,/);
    assert.match(toMember[0].htmlContent, /CHF 100\.00/);
    assert.match(toMember[0].htmlContent, /23 aprile 1958/);
    assert.deepEqual(toMember[0].attachment, [{ url: 'https://cdn.example/statuten.pdf', name: 'Statuten-Orchestra-Aurea.pdf' }]);
    assert.equal(toAdmin[0].replyTo.email, 'anna@example.ch');
    assert.match(toAdmin[0].subject, /^Neues Mitglied: Anna Muster/);
    assert.match(toAdmin[0].htmlContent, /\+41 79 123 45 67/);
    assert.match(toAdmin[0].htmlContent, /TX1/);
    assert.match(toAdmin[0].htmlContent, /Italienisch/);
    assert.equal(optIn[0].sender.email, 'newsletter@orchestra-aurea.ch');

    // notifica ripetuta da Saferpay: nessun doppione
    const again = await call(notify, { method: 'GET', query: q });
    assert.equal(again.statusCode, 200);
    assert.equal(state.brevo.emails.length, 3);
});

test('notifica: firma sbagliata -> 400, ordine sconosciuto -> 200', async () => {
    setEnv(REDIS);
    createMocks();
    const bad = await call(notify, { method: 'GET', query: { o: 'OAM-20261030-ABCDEF12', s: 'x' } });
    assert.equal(bad.statusCode, 400);
    const unknown = await call(notify, { method: 'GET', query: { o: 'OAM-20261030-ABCDEF12', s: secure.sign('OAM-20261030-ABCDEF12') } });
    assert.equal(unknown.statusCode, 200);
});

test('notifica: Brevo giu\' -> 500 (Saferpay riprova), al nuovo tentativo partono solo le email mancanti', async () => {
    setEnv(REDIS);
    const state = createMocks();
    const start = await call(membership, { body: memberBody({ member: Object.assign({}, MEMBER, { newsletter: false }) }) });
    assert.equal(start.statusCode, 200);
    const init = lastInit(state);
    pay(state, 'tok1');
    state.brevo.failEmails = 1; // la prima email fallisce
    const q = returnQuery(init.Notification.SuccessNotifyUrl);
    const first = await call(notify, { method: 'GET', query: q });
    assert.equal(first.statusCode, 500);
    assert.equal(state.brevo.emails.length, 1);
    const second = await call(notify, { method: 'GET', query: q });
    assert.equal(second.statusCode, 200);
    assert.equal(state.brevo.emails.length, 2, 'ora anche la seconda email e\' partita');
    const third = await call(notify, { method: 'GET', query: q });
    assert.equal(third.statusCode, 200);
    assert.equal(state.brevo.emails.length, 2, 'nessun doppione');
});

test('senza database: cookie di riserva, ritorno incassa e manda le email; nessuna notifica registrata', async () => {
    setEnv();
    const state = createMocks();
    const start = await call(membership, { body: memberBody({ lang: 'en' }) });
    assert.equal(start.statusCode, 200);
    const cookie = start.headers['set-cookie'][0];
    assert.match(cookie, /^oa_o_OAM-[^=]+=tok1~/);
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
    const init = lastInit(state);
    assert.equal(init.Notification, undefined);
    pay(state, 'tok1');
    const r = await call(ret, { method: 'GET', query: returnQuery(init.ReturnUrl.Url), headers: { cookie: cookie.split(';')[0] } });
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/en/willkommen?status=success');
    assert.match(r.headers['set-cookie'][0], /Max-Age=0/);
    assert.equal(state.brevo.emails.length, 3);
    const m = state.brevo.emails.find((e) => e.tags.includes('oa-member'));
    assert.match(m.htmlContent, /Dear Anna Muster,/);
    assert.match(m.htmlContent, /reply to this email/);
    assert.equal(m.attachment, undefined, 'senza STATUTEN_URL nessun allegato');
});

test('pagamento annullato -> incomplete, nessuna email', async () => {
    setEnv(REDIS);
    const state = createMocks();
    await call(membership, { body: memberBody() });
    const init = lastInit(state);
    pay(state, 'tok1', 'ABORTED');
    const r = await call(ret, { method: 'GET', query: returnQuery(init.ReturnUrl.Url) });
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/de/willkommen?status=incomplete');
    assert.equal(state.brevo.emails.length, 0);
});

test('ritorno con firma alterata -> error', async () => {
    setEnv(REDIS);
    const state = createMocks();
    await call(membership, { body: memberBody() });
    const q = returnQuery(lastInit(state).ReturnUrl.Url);
    q.s = q.s.slice(0, -2) + 'xx';
    const r = await call(ret, { method: 'GET', query: q });
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/de/willkommen?status=error');
});

test('donazione: livello ricalcolato, email al donatore e a info@, pagina Danke', async () => {
    setEnv(REDIS);
    const state = createMocks();
    const start = await call(session, { body: { amount: 520, currency: 'CHF', membership: 'PULSE', lang: 'de', donor: DONOR, termsAccepted: true } });
    assert.equal(start.statusCode, 200);
    const init = lastInit(state);
    assert.equal(init.Payment.Amount.Value, '52000');
    assert.equal(init.Payment.Description, 'Orchestra Aurea donation (FLOW)');
    assert.match(init.Payment.OrderId, /^OAD-/);
    pay(state, 'tok1');
    const r = await call(ret, { method: 'GET', query: returnQuery(init.ReturnUrl.Url) });
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/de/danke?status=success');
    const donor = state.brevo.emails.find((e) => e.tags.includes('oa-donation'));
    const admin = state.brevo.emails.find((e) => e.tags.includes('oa-donation-admin'));
    assert.match(donor.htmlContent, /Guten Tag Bruno Rossi/);
    assert.match(donor.htmlContent, /Stufe FLOW/);
    assert.match(donor.htmlContent, /CHF 520\.00/);
    assert.match(admin.subject, /^Neue Spende: CHF 520\.00 \(FLOW\) von Bruno Rossi/);
    assert.equal(state.brevo.emails.length, 2, 'niente newsletter se non richiesta');
    // la notifica arrivata dopo non manda altro
    await call(notify, { method: 'GET', query: returnQuery(init.Notification.SuccessNotifyUrl) });
    assert.equal(state.brevo.emails.length, 2);
});

test('donazione: controlli invariati (minimo, massimo, termini)', async () => {
    setEnv();
    createMocks();
    let res = await call(session, { body: { amount: 0.5, donor: DONOR, termsAccepted: true } });
    assert.equal(res.body.code, 'AMOUNT_TOO_LOW');
    res = await call(session, { body: { amount: 200000, donor: DONOR, termsAccepted: true } });
    assert.equal(res.body.code, 'AMOUNT_TOO_HIGH');
    assert.equal(res.body.max, 100000);
    res = await call(session, { body: { amount: 50, donor: DONOR, termsAccepted: false } });
    assert.equal(res.body.code, 'TERMS_NOT_ACCEPTED');
});

test('vecchio flusso (cookie oa_donation_token, senza ?o=) funziona ancora', async () => {
    setEnv();
    const state = createMocks();
    state.saferpay.tx.oldtok = { id: 'TXOLD', status: 'AUTHORIZED', amount: '5000', orderId: 'donation-1' };
    const r = await call(ret, { method: 'GET', query: {}, headers: { cookie: 'oa_donation_token=oldtok; oa_donation_lang=it' } });
    assert.equal(r.headers.location, 'https://neu.orchestra-aurea.ch/it/danke?status=success');
    assert.equal(state.saferpay.tx.oldtok.status, 'CAPTURED');
});

test('allegato statuti non scaricabile: l\'email parte comunque senza allegato', async () => {
    setEnv(Object.assign({ STATUTEN_URL: 'https://cdn.example/statuten.pdf' }, REDIS));
    const state = createMocks();
    state.brevo.rejectAttachments = true;
    await call(membership, { body: memberBody({ member: Object.assign({}, MEMBER, { newsletter: false }) }) });
    const init = lastInit(state);
    pay(state, 'tok1');
    await call(ret, { method: 'GET', query: returnQuery(init.ReturnUrl.Url) });
    const m = state.brevo.emails.find((e) => e.tags.includes('oa-member'));
    assert.ok(m, 'email al socio partita');
    assert.equal(m.attachment, undefined);
    assert.match(m.htmlContent, /statuten\.pdf/);
});

test('newsletter dal footer: email di conferma, pagina di conferma, contatto in Brevo', async () => {
    setEnv(REDIS);
    const state = createMocks();
    const res = await call(nlApi, { body: { email: 'carla@example.it', lang: 'it' } });
    assert.equal(res.statusCode, 200);
    assert.equal(state.brevo.emails.length, 1);
    const mail = state.brevo.emails[0];
    assert.equal(mail.sender.email, 'newsletter@orchestra-aurea.ch');
    assert.match(mail.subject, /newsletter/i);
    assert.equal(state.brevo.contacts.length, 0, 'prima della conferma nessun contatto');
    const link = mail.htmlContent.match(/href="(https:\/\/spenden\.orchestra-aurea\.ch\/api\/newsletter\?t=[^"]+)"/)[1].replace(/&amp;/g, '&');
    const t = decodeURIComponent(new URL(link).searchParams.get('t'));

    const page = await call(nlApi, { method: 'GET', query: { t } });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Conferma l’iscrizione/);
    assert.match(page.body, /carla@example\.it/);
    assert.match(page.body, /method="post"/);
    assert.equal(state.brevo.contacts.length, 0, 'aprire il link non basta: serve il bottone');

    const done = await call(nlApi, { method: 'POST', body: { t } });
    assert.equal(done.statusCode, 200);
    assert.match(done.body, /Grazie!/);
    assert.equal(state.brevo.contacts.length, 1);
    const c = state.brevo.contacts[0];
    assert.equal(c.email, 'carla@example.it');
    assert.deepEqual(c.listIds, [100]);
    assert.equal(c.updateEnabled, true);
    assert.equal(c.emailBlacklisted, false);
    assert.equal(c.attributes.SPRACHE, 'it');
    assert.equal(state.brevo.lists[0].name, 'Newsletter Orchestra Aurea');
});

test('newsletter: nomi attributi localizzati (NOME/COGNOME) e lista da variabile', async () => {
    setEnv(Object.assign({ BREVO_NEWSLETTER_LIST_ID: '7' }, REDIS));
    const state = createMocks();
    const token = secure.signToken({ e: 'd@example.ch', f: 'Dora', l: 'Keller', lg: 'de', src: 'member' }, 3600);
    const done = await call(nlApi, { method: 'POST', body: { t: token } });
    assert.equal(done.statusCode, 200);
    const c = state.brevo.contacts[0];
    assert.deepEqual(c.listIds, [7]);
    assert.equal(c.attributes.NOME, 'Dora');
    assert.equal(c.attributes.COGNOME, 'Keller');
});

test('newsletter: token scaduto o falso, bot, limite richieste', async () => {
    setEnv(REDIS);
    const state = createMocks();
    const expired = secure.signToken({ e: 'x@example.ch', lg: 'de' }, -10);
    let r = await call(nlApi, { method: 'GET', query: { t: expired } });
    assert.equal(r.statusCode, 400);
    assert.match(r.body, /Link ungültig/);
    r = await call(nlApi, { method: 'GET', query: { t: 'abc.def' } });
    assert.equal(r.statusCode, 400);
    r = await call(nlApi, { body: { email: 'bot@example.ch', website: 'http://spam' } });
    assert.equal(r.statusCode, 200);
    assert.equal(state.brevo.emails.length, 0, 'il bot non fa partire email');
    for (let i = 0; i < 3; i++) await call(nlApi, { body: { email: 'same@example.ch', lang: 'de' } });
    r = await call(nlApi, { body: { email: 'same@example.ch', lang: 'de' } });
    assert.equal(r.statusCode, 429);
    r = await call(nlApi, { body: { email: 'nope', lang: 'de' } });
    assert.equal(r.statusCode, 400);
});

test('database non raggiungibile all\'avvio: si ripiega sul cookie', async () => {
    setEnv(REDIS);
    const state = createMocks();
    state.redis.down = true;
    const start = await call(membership, { body: memberBody() });
    assert.equal(start.statusCode, 200);
    assert.match(start.headers['set-cookie'][0], /^oa_o_OAM-/);
});

test('CORS: solo le origini configurate', async () => {
    setEnv();
    createMocks();
    const ok = await call(membership, { method: 'OPTIONS' });
    assert.equal(ok.statusCode, 204);
    assert.equal(ok.headers['access-control-allow-origin'], 'https://neu.orchestra-aurea.ch');
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');
    const other = await call(membership, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.equal(other.headers['access-control-allow-origin'], undefined);
});

test('pagina Willkommen: MEMBER_RETURN_PAGE_URL esplicita e ricavata', async () => {
    const config = require('../lib/config');
    setEnv({ RETURN_PAGE_URL: 'https://www.orchestra-aurea.ch/{lang}/danke' });
    assert.equal(config.memberReturnPageUrl(), 'https://www.orchestra-aurea.ch/{lang}/willkommen');
    setEnv({ RETURN_PAGE_URL: 'https://x.vercel.app/test-danke.html?lang={lang}' });
    assert.equal(config.memberReturnPageUrl(), 'https://x.vercel.app/test-danke.html?lang={lang}');
    setEnv({ MEMBER_RETURN_PAGE_URL: 'https://a.b/{lang}/w' });
    assert.equal(config.memberReturnPageUrl(), 'https://a.b/{lang}/w');
    assert.equal(config.siteUrl(), 'https://neu.orchestra-aurea.ch');
});

test('cifratura: senza OA_SECRET la chiave si ricava dalla password Saferpay', async () => {
    setEnv();
    delete process.env.OA_SECRET;
    const enc = secure.encrypt({ a: 1 });
    assert.deepEqual(secure.decrypt(enc), { a: 1 });
    assert.equal(secure.decrypt(enc.slice(0, -3) + 'AAA'), null);
});
