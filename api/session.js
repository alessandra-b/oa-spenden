// api/session.js
//
// Avvia una sessione di pagamento Saferpay (PaymentPage/Initialize) e risponde
// con l'URL a cui il browser deve andare per pagare. Chiamata dal form
// (donation-form.js) con fetch POST.
//
// Il token della sessione NON viene restituito al browser come dato da
// rimandare indietro: resta in un cookie httpOnly, che api/return.js legge
// quando Saferpay riporta l'utente sul sito.

const crypto = require('crypto');
const { subscribeNewsletter } = require('../lib/newsletter');

// Il livello dipende SOLO dall'importo (CHF): >= 1000 RESONANCE, >= 500 FLOW, >= 100 PULSE,
// altrimenti ECHO. Stesse soglie di public/donation-form.js. Il livello scelto nel form
// viene ignorato: il browser puo' essere manomesso, il server ricalcola.
const TIERS_DESC = [['RESONANCE', 1000], ['FLOW', 500], ['PULSE', 100]];
const MIN_AMOUNT = 1;

function tierFor(amount) {
    const hit = TIERS_DESC.find(([, min]) => amount >= min);
    return hit ? hit[0] : 'ECHO';
}

// Tetto tecnico per donazione singola. Da confermare con Saferpay/Fausto.
const MAX_AMOUNT = Number(process.env.MAX_DONATION_CHF) || 100000;

const LANGUAGES = ['de', 'en', 'it'];

// ALLOWED_ORIGIN: una o piu' origini separate da virgola, senza slash finale
// (es. https://www.orchestra-aurea.ch,https://orchestra-aurea.ch).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);

function setCorsHeaders(req, res) {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    const origin = (req.headers.origin || '').replace(/\/+$/, '');
    if (ALLOWED_ORIGINS.length === 0) {
        // Nessuna origine configurata: solo per i test (senza cookie cross-origin).
        res.setHeader('Access-Control-Allow-Origin', '*');
        return;
    }
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
}

function getSaferpayBaseUrl() {
    const mode = (process.env.SAFERPAY_ENV || 'test').toLowerCase();
    return mode === 'live' ? 'https://www.saferpay.com/api' : 'https://test.saferpay.com/api';
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const clean = (value, max) => String(value).trim().slice(0, max);

function fail(res, status, error, extra) {
    res.status(status).json(Object.assign({ error }, extra || {}));
}

module.exports = async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    if (req.method !== 'POST') {
        fail(res, 405, 'Method not allowed');
        return;
    }

    try {
        const body = req.body || {};
        const donor = body.donor || {};

        // ---- Validazione --------------------------------------------------
        const rawAmount = Number(body.amount);
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
            fail(res, 400, 'Invalid amount.', { code: 'INVALID_AMOUNT' });
            return;
        }
        const amount = Math.round(rawAmount * 100) / 100;
        if (amount < MIN_AMOUNT) {
            fail(res, 400, 'Amount below minimum.', { code: 'AMOUNT_TOO_LOW', min: MIN_AMOUNT });
            return;
        }
        const level = tierFor(amount);
        if (amount > MAX_AMOUNT) {
            fail(res, 400, 'Amount above maximum.', { code: 'AMOUNT_TOO_HIGH', max: MAX_AMOUNT });
            return;
        }

        const currency = String(body.currency || 'CHF').toUpperCase();
        if (currency !== 'CHF') {
            fail(res, 400, 'Invalid currency.', { code: 'INVALID_CURRENCY' });
            return;
        }

        if (body.termsAccepted !== true) {
            fail(res, 400, 'Terms must be accepted.', { code: 'TERMS_NOT_ACCEPTED' });
            return;
        }

        const required = ['firstName', 'lastName', 'address', 'postalCode', 'city', 'email'];
        if (!required.every((key) => isNonEmptyString(donor[key]))) {
            fail(res, 400, 'Missing donor details.', { code: 'MISSING_DONOR' });
            return;
        }
        if (!isValidEmail(donor.email.trim())) {
            fail(res, 400, 'Invalid email.', { code: 'INVALID_EMAIL' });
            return;
        }

        const lang = LANGUAGES.includes(String(body.lang || '').toLowerCase())
            ? String(body.lang).toLowerCase()
            : 'de';

        const donorClean = {
            firstName: clean(donor.firstName, 100),
            lastName: clean(donor.lastName, 100),
            address: clean(donor.address, 200),
            postalCode: clean(donor.postalCode, 20),
            city: clean(donor.city, 100),
            email: clean(donor.email, 200),
            newsletter: donor.newsletter === true
        };

        // ---- Configurazione ----------------------------------------------
        const customerId = process.env.SAFERPAY_CUSTOMER_ID;
        const terminalId = process.env.SAFERPAY_TERMINAL_ID;
        const username = process.env.SAFERPAY_API_USERNAME;
        const password = process.env.SAFERPAY_API_PASSWORD;

        if (!customerId || !terminalId || !username || !password) {
            console.error('Mancano le variabili SAFERPAY_* su Vercel');
            fail(res, 500, 'Server configuration incomplete.', { code: 'CONFIG' });
            return;
        }

        const proto = req.headers['x-forwarded-proto'] || 'https';
        const returnUrl = `${proto}://${req.headers.host}/api/return`;
        const reference = `donation-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

        const payload = {
            RequestHeader: {
                SpecVersion: '1.51',
                CustomerId: customerId,
                RequestId: crypto.randomUUID(),
                RetryIndicator: 0
            },
            TerminalId: terminalId,
            Payment: {
                Amount: {
                    Value: String(Math.round(amount * 100)),
                    CurrencyCode: currency
                },
                OrderId: reference,
                Description: `Orchestra Aurea donation (${level})`
            },
            ReturnUrl: { Url: returnUrl },
            Payer: {
                LanguageCode: lang,
                BillingAddress: {
                    FirstName: donorClean.firstName,
                    LastName: donorClean.lastName,
                    Street: donorClean.address,
                    Zip: donorClean.postalCode,
                    City: donorClean.city,
                    CountryCode: 'CH', // come nel form attuale: il form non chiede il paese
                    Email: donorClean.email
                }
            }
        };

        const authToken = Buffer.from(`${username}:${password}`).toString('base64');
        const spResponse = await fetch(`${getSaferpayBaseUrl()}/Payment/v1/PaymentPage/Initialize`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authToken}`,
                'Content-Type': 'application/json; charset=utf-8',
                Accept: 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await spResponse.json().catch(() => null);

        if (!spResponse.ok || !data || !data.RedirectUrl) {
            console.error('Saferpay Initialize fallita', spResponse.status, JSON.stringify(data));
            fail(res, 502, 'Payment provider error.', { code: 'PROVIDER' });
            return;
        }

        // Cookie: token (httpOnly) + lingua (serve a return.js per scegliere la pagina "Danke").
        const cookies = [];
        if (data.Token) {
            cookies.push(`oa_donation_token=${data.Token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`);
        }
        cookies.push(`oa_donation_lang=${lang}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`);
        res.setHeader('Set-Cookie', cookies);

        // Newsletter (Mailchimp, double opt-in). Un errore qui non deve mai bloccare il pagamento.
        if (donorClean.newsletter) {
            try {
                await subscribeNewsletter({
                    email: donorClean.email,
                    firstName: donorClean.firstName,
                    lastName: donorClean.lastName,
                    lang
                });
            } catch (err) {
                console.error('Iscrizione newsletter fallita', err.message);
            }
        }

        res.status(200).json({ redirectUrl: data.RedirectUrl });
    } catch (err) {
        console.error('Errore in /api/session', err);
        fail(res, 500, 'Internal error.', { code: 'INTERNAL' });
    }
};
