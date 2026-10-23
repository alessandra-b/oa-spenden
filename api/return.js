// api/return.js
//
// Saferpay riporta qui il browser dopo il pagamento. Questa function fa Assert
// (verifica l'esito) e, se autorizzato, Capture (incassa), poi reindirizza
// l'utente alla pagina "Danke" del sito Webflow, nella sua lingua. Non mostra
// nulla lei stessa. Il dettaglio delle risposte Saferpay finisce nei log della
// function (Vercel -> Deployments -> Functions -> Logs).
//
// Il token arriva dal cookie httpOnly impostato da api/session.js (Saferpay non
// lo aggiunge all'URL di ritorno).

const crypto = require('crypto');

// Pagina di destinazione. Puo' contenere {lang}, sostituito con de / en / it:
//   https://www.orchestra-aurea.ch/{lang}/danke
// Senza {lang} viene usato l'URL cosi' com'e'.
const RETURN_PAGE_URL = process.env.RETURN_PAGE_URL || 'https://REPLACE-WITH-SITE-DOMAIN/{lang}/danke';

const LANGUAGES = ['de', 'en', 'it'];

function getSaferpayBaseUrl() {
    const mode = (process.env.SAFERPAY_ENV || 'test').toLowerCase();
    return mode === 'live' ? 'https://www.saferpay.com/api' : 'https://test.saferpay.com/api';
}

function buildHeader() {
    return {
        SpecVersion: '1.51',
        CustomerId: process.env.SAFERPAY_CUSTOMER_ID,
        RequestId: crypto.randomUUID(),
        RetryIndicator: 0
    };
}

async function saferpayRequest(path, payload) {
    const username = process.env.SAFERPAY_API_USERNAME;
    const password = process.env.SAFERPAY_API_PASSWORD;
    const authToken = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(`${getSaferpayBaseUrl()}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${authToken}`,
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
        const error = new Error((data && data.ErrorMessage) || 'Errore Saferpay');
        error.raw = data;
        throw error;
    }
    return data;
}

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    });
    return cookies;
}

function redirectTo(res, status, lang) {
    // I cookie hanno fatto il loro lavoro: li puliamo sempre, a prescindere dall'esito.
    res.setHeader('Set-Cookie', [
        'oa_donation_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        'oa_donation_lang=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    ]);
    const base = RETURN_PAGE_URL.replace('{lang}', lang);
    const url = `${base}${base.includes('?') ? '&' : '?'}status=${encodeURIComponent(status)}`;
    res.writeHead(302, { Location: url });
    res.end();
}

module.exports = async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = req.query.token || req.query.Token || cookies.oa_donation_token;
    const lang = LANGUAGES.includes(cookies.oa_donation_lang) ? cookies.oa_donation_lang : 'de';

    if (!token) {
        console.warn('Return endpoint: nessun token (ne in query ne in cookie)');
        redirectTo(res, 'error', lang);
        return;
    }

    try {
        const assertData = await saferpayRequest('/Payment/v1/PaymentPage/Assert', {
            RequestHeader: buildHeader(),
            Token: token
        });
        console.log('Assert response', JSON.stringify(assertData));

        const status = assertData.Transaction && assertData.Transaction.Status;
        const transactionId = assertData.Transaction && assertData.Transaction.Id;

        let finalStatus = status;

        if (status === 'AUTHORIZED' && transactionId) {
            const captureData = await saferpayRequest('/Payment/v1/Transaction/Capture', {
                RequestHeader: buildHeader(),
                TransactionReference: { TransactionId: transactionId }
            });
            console.log('Capture response', JSON.stringify(captureData));
            // La risposta di Capture e' "piatta": Status sta al livello principale.
            finalStatus = (captureData.Transaction && captureData.Transaction.Status) || captureData.Status;
        }

        const isSuccess = finalStatus === 'CAPTURED';
        const isIncomplete = finalStatus === 'PENDING' || finalStatus === 'WAITING' || finalStatus === 'INITIATED';

        redirectTo(res, isSuccess ? 'success' : isIncomplete ? 'incomplete' : 'error', lang);
    } catch (err) {
        console.error('Return endpoint error', err.message, err.raw || '');
        const message = err.message || '';
        const isIncompleteError = message.includes('TRANSACTION_NOT_STARTED') || message.includes('TRANSACTION_ABORTED');
        redirectTo(res, isIncompleteError ? 'incomplete' : 'error', lang);
    }
};
