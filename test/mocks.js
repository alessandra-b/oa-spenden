// test/mocks.js — Saferpay, Brevo e Redis finti (in memoria) per i test automatici.
// Nessuna chiamata esce davvero: global.fetch viene sostituito.

function jsonResponse(status, data) {
    const text = data === undefined ? '' : JSON.stringify(data);
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => (text ? JSON.parse(text) : null),
        text: async () => text
    };
}

function createMocks() {
    const state = {
        saferpay: { calls: [], tx: {}, seq: 0, failNext: {} },
        brevo: { emails: [], contacts: [], calls: [], failEmails: 0, attributes: ['EMAIL', 'NOME', 'COGNOME'], lists: [], folders: [{ id: 1, name: 'Your first folder' }] },
        redis: { data: new Map(), calls: [] }
    };

    async function saferpay(url, body) {
        const path = url.replace(/^https:\/\/(test|www)\.saferpay\.com\/api/, '');
        state.saferpay.calls.push({ path, body });
        if (state.saferpay.failNext[path]) {
            const f = state.saferpay.failNext[path];
            delete state.saferpay.failNext[path];
            if (f === 'network') throw new Error('ECONNRESET');
            return jsonResponse(f.status, f.body);
        }
        if (path === '/Payment/v1/PaymentPage/Initialize') {
            const n = ++state.saferpay.seq;
            const token = `tok${n}`;
            state.saferpay.tx[token] = {
                id: `TX${n}`, status: 'NOT_STARTED',
                amount: body.Payment.Amount.Value, orderId: body.Payment.OrderId, init: body
            };
            return jsonResponse(200, { Token: token, RedirectUrl: `https://test.saferpay.com/vt2/api/PaymentPage/${token}` });
        }
        if (path === '/Payment/v1/PaymentPage/Assert') {
            const t = state.saferpay.tx[body.Token];
            if (!t) return jsonResponse(400, { ErrorName: 'TOKEN_INVALID', Behavior: 'DO_NOT_RETRY' });
            if (t.status === 'NOT_STARTED') return jsonResponse(402, { ErrorName: 'TRANSACTION_NOT_STARTED', Behavior: 'DO_NOT_RETRY' });
            if (t.status === 'ABORTED') return jsonResponse(402, { ErrorName: 'TRANSACTION_ABORTED', Behavior: 'DO_NOT_RETRY' });
            return jsonResponse(200, {
                Transaction: { Type: 'PAYMENT', Status: t.status, Id: t.id, OrderId: t.orderId, Amount: { Value: t.amount, CurrencyCode: 'CHF' } },
                PaymentMeans: { Brand: { PaymentMethod: 'TWINT', Name: 'TWINT' }, DisplayText: 'TWINT' }
            });
        }
        if (path === '/Payment/v1/Transaction/Capture') {
            const t = Object.values(state.saferpay.tx).find((x) => x.id === body.TransactionReference.TransactionId);
            if (!t) return jsonResponse(400, { ErrorName: 'TRANSACTION_NOT_FOUND' });
            if (t.status === 'CAPTURED') return jsonResponse(400, { ErrorName: 'TRANSACTION_ALREADY_CAPTURED', Behavior: 'DO_NOT_RETRY' });
            if (t.status !== 'AUTHORIZED') return jsonResponse(400, { ErrorName: 'TRANSACTION_IN_WRONG_STATE', Behavior: 'DO_NOT_RETRY' });
            t.status = 'CAPTURED';
            return jsonResponse(200, { CaptureId: `${t.id}_c`, Status: 'CAPTURED', Date: new Date().toISOString() });
        }
        return jsonResponse(404, { ErrorName: 'NOT_FOUND' });
    }

    async function brevo(url, init) {
        const path = url.replace('https://api.brevo.com/v3', '');
        const method = init.method;
        const body = init.body ? JSON.parse(init.body) : undefined;
        state.brevo.calls.push({ method, path, body });
        if (init.headers['api-key'] !== 'brevo-test-key') return jsonResponse(401, { code: 'unauthorized', message: 'Key not found' });
        if (method === 'POST' && path === '/smtp/email') {
            if (state.brevo.failEmails > 0) { state.brevo.failEmails--; return jsonResponse(500, { message: 'temporary failure' }); }
            if (body.attachment && state.brevo.rejectAttachments) return jsonResponse(400, { code: 'invalid_parameter', message: 'attachment url unreachable' });
            state.brevo.emails.push(body);
            return jsonResponse(201, { messageId: `<msg${state.brevo.emails.length}@brevo>` });
        }
        if (method === 'GET' && path.startsWith('/contacts/lists')) return jsonResponse(200, { lists: state.brevo.lists, count: state.brevo.lists.length });
        if (method === 'GET' && path.startsWith('/contacts/folders')) return jsonResponse(200, { folders: state.brevo.folders, count: state.brevo.folders.length });
        if (method === 'POST' && path === '/contacts/folders') { const f = { id: 10 + state.brevo.folders.length, name: body.name }; state.brevo.folders.push(f); return jsonResponse(201, { id: f.id }); }
        if (method === 'POST' && path === '/contacts/lists') { const l = { id: 100 + state.brevo.lists.length, name: body.name, folderId: body.folderId }; state.brevo.lists.push(l); return jsonResponse(201, { id: l.id }); }
        if (method === 'GET' && path === '/contacts/attributes') return jsonResponse(200, { attributes: state.brevo.attributes.map((n) => ({ name: n, category: 'normal', type: 'text' })) });
        if (method === 'POST' && path.startsWith('/contacts/attributes/normal/')) { state.brevo.attributes.push(path.split('/').pop()); return jsonResponse(201, undefined); }
        if (method === 'POST' && path === '/contacts') { state.brevo.contacts.push(body); return jsonResponse(201, { id: state.brevo.contacts.length }); }
        return jsonResponse(404, { message: 'not found ' + path });
    }

    async function redis(init) {
        const args = JSON.parse(init.body);
        state.redis.calls.push(args);
        const [cmd, key, ...rest] = args;
        const d = state.redis.data;
        const now = Date.now();
        const live = (k) => { const e = d.get(k); if (e && e.exp && e.exp < now) { d.delete(k); return undefined; } return e; };
        if (cmd === 'GET') { const e = live(key); return jsonResponse(200, { result: e ? e.v : null }); }
        if (cmd === 'SET') {
            const value = rest[0];
            const exIdx = rest.indexOf('EX');
            const nx = rest.includes('NX');
            if (nx && live(key)) return jsonResponse(200, { result: null });
            d.set(key, { v: value, exp: exIdx >= 0 ? now + Number(rest[exIdx + 1]) * 1000 : 0 });
            return jsonResponse(200, { result: 'OK' });
        }
        if (cmd === 'DEL') { const had = d.delete(key); return jsonResponse(200, { result: had ? 1 : 0 }); }
        if (cmd === 'INCR') { const e = live(key); const n = (e ? Number(e.v) : 0) + 1; d.set(key, { v: String(n), exp: e ? e.exp : 0 }); return jsonResponse(200, { result: n }); }
        if (cmd === 'EXPIRE') { const e = live(key); if (e) e.exp = now + Number(rest[0]) * 1000; return jsonResponse(200, { result: e ? 1 : 0 }); }
        return jsonResponse(400, { error: 'unknown command' });
    }

    global.fetch = async (url, init = {}) => {
        if (/saferpay\.com/.test(url)) return saferpay(url, JSON.parse(init.body));
        if (/api\.brevo\.com/.test(url)) return brevo(url, init);
        if (url.startsWith('https://redis.test')) {
            if (state.redis.down) throw new Error('redis down');
            return redis(init);
        }
        throw new Error('fetch inatteso: ' + url);
    };
    return state;
}

function mockReq({ method = 'POST', body, query, headers } = {}) {
    return {
        method,
        body,
        query: query || {},
        url: '/',
        headers: Object.assign({ host: 'spenden.orchestra-aurea.ch', 'x-forwarded-proto': 'https', origin: 'https://neu.orchestra-aurea.ch', 'x-forwarded-for': '203.0.113.7' }, headers || {})
    };
}

function mockRes() {
    const res = {
        statusCode: 200, headers: {}, body: undefined, ended: false,
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; },
        getHeader(k) { return this.headers[k.toLowerCase()]; },
        status(c) { this.statusCode = c; return this; },
        json(o) { this.body = o; this.ended = true; return this; },
        send(s) { this.body = s; this.ended = true; return this; },
        writeHead(c, h) { this.statusCode = c; Object.entries(h || {}).forEach(([k, v]) => this.setHeader(k, v)); return this; },
        end(s) { if (s !== undefined) this.body = s; this.ended = true; return this; }
    };
    return res;
}

function setEnv(extra) {
    const base = {
        SAFERPAY_CUSTOMER_ID: '123456', SAFERPAY_TERMINAL_ID: '17700000', SAFERPAY_API_USERNAME: 'API_1', SAFERPAY_API_PASSWORD: 'pw-test',
        SAFERPAY_ENV: 'test', ALLOWED_ORIGIN: 'https://neu.orchestra-aurea.ch',
        RETURN_PAGE_URL: 'https://neu.orchestra-aurea.ch/{lang}/danke', BREVO_API_KEY: 'brevo-test-key',
        OA_SECRET: 'test-secret-0123456789-abcdefghij'
    };
    const keys = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'STATUTEN_URL',
        'MEMBER_RETURN_PAGE_URL', 'SITE_URL', 'BREVO_NEWSLETTER_LIST_ID', 'MEMBERSHIP_FEE_CHF', 'MAIL_TO_ADMIN'];
    keys.forEach((k) => delete process.env[k]);
    Object.assign(process.env, base, extra || {});
}

const REDIS = { KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'redis-token' };

module.exports = { createMocks, mockReq, mockRes, setEnv, REDIS };
