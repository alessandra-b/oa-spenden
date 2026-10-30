// test/e2e-server.js — server locale per provare i form nel browser con le function vere.
// Saferpay, Brevo e Redis sono finti (test/mocks.js). La "pagina di pagamento Saferpay" e'
// simulata da /__saferpay/<token> con i bottoni "Bezahlen" e "Abbrechen".
//   node test/e2e-server.js  -> http://localhost:4173/test-member.html

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createMocks, setEnv, REDIS } = require('./mocks');

function start(port = 4173, opts = {}) {
    setEnv(Object.assign({
        ALLOWED_ORIGIN: `http://localhost:${port}`,
        RETURN_PAGE_URL: `http://localhost:${port}/test-danke.html?lang={lang}`,
        STATUTEN_URL: opts.statutes === false ? '' : `http://localhost:${port}/statuten.pdf`
    }, opts.redis === false ? {} : REDIS));
    const state = createMocks();
    const realFetch = global.fetch;
    // la pagina finta di Saferpay al posto del dominio vero
    global.fetch = (url, init) => realFetch(url, init).then((r) => {
        if (/PaymentPage\/Initialize/.test(url)) {
            return r.json().then((d) => {
                d.RedirectUrl = `http://localhost:${port}/__saferpay/${d.Token}`;
                return { ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) };
            });
        }
        return r;
    });

    const handlers = {
        '/api/session': require('../api/session'),
        '/api/membership': require('../api/membership'),
        '/api/return': require('../api/return'),
        '/api/notify': require('../api/notify'),
        '/api/newsletter': require('../api/newsletter')
    };

    function adapt(req, res, body) {
        const u = new URL(req.url, `http://localhost:${port}`);
        req.query = Object.fromEntries(u.searchParams);
        req.headers['x-forwarded-proto'] = 'http';
        const ct = String(req.headers['content-type'] || '');
        if (body) {
            if (ct.includes('application/json')) { try { req.body = JSON.parse(body); } catch (e) { req.body = {}; } }
            else if (ct.includes('urlencoded')) req.body = Object.fromEntries(new URLSearchParams(body));
            else req.body = body;
        }
        res.status = (c) => { res.statusCode = c; return res; };
        res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
        res.send = (s) => { res.end(s); return res; };
    }

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', async () => {
            const u = new URL(req.url, `http://localhost:${port}`);
            try {
                if (handlers[u.pathname]) {
                    adapt(req, res, body);
                    await handlers[u.pathname](req, res);
                    return;
                }
                const pay = /^\/__saferpay\/(\w+)/.exec(u.pathname);
                if (pay) {
                    const tx = state.saferpay.tx[pay[1]];
                    if (u.searchParams.has('do')) {
                        tx.status = u.searchParams.get('do') === 'pay' ? 'AUTHORIZED' : 'ABORTED';
                        // Saferpay: prima la notifica (se registrata), poi il browser torna al sito
                        const notifyUrl = tx.init.Notification && tx.init.Notification.SuccessNotifyUrl;
                        if (notifyUrl && tx.status === 'AUTHORIZED' && opts.notifyFirst !== false) {
                            await realFetchLocal(notifyUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${port}`));
                        }
                        res.writeHead(302, { Location: tx.init.ReturnUrl.Url.replace(/^https?:\/\/[^/]+/, `http://localhost:${port}`) });
                        res.end();
                        return;
                    }
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(`<!doctype html><title>Saferpay (finto)</title><h1>Saferpay TEST</h1><p>CHF ${tx.amount / 100}</p>` +
                        `<a id="pay" href="?do=pay">Bezahlen</a> <a id="cancel" href="?do=cancel">Abbrechen</a>`);
                    return;
                }
                if (u.pathname === '/statuten.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end('%PDF-1.4 test'); return; }
                if (u.pathname === '/__state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ emails: state.brevo.emails, contacts: state.brevo.contacts, tx: state.saferpay.tx })); return; }
                const file = path.join(__dirname, '..', 'public', u.pathname === '/' ? 'test-member.html' : u.pathname);
                const testFile = path.join(__dirname, u.pathname);
                const f = fs.existsSync(file) ? file : fs.existsSync(testFile) ? testFile : null;
                if (!f) { res.statusCode = 404; res.end('not found'); return; }
                res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
                res.end(fs.readFileSync(f));
            } catch (err) {
                console.error(err);
                res.statusCode = 500;
                res.end(String(err));
            }
        });
    });

    // chiamata interna (notifica) senza passare dal fetch finto
    function realFetchLocal(url) {
        return new Promise((resolve) => {
            http.get(url, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); }).on('error', () => resolve(0));
        });
    }

    return new Promise((resolve) => server.listen(port, () => resolve({ server, state, port })));
}

if (require.main === module) start().then(({ port }) => console.log(`http://localhost:${port}/test-member.html`));

module.exports = { start };
