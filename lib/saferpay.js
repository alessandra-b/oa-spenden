// lib/saferpay.js — chiamate all'API JSON di Saferpay (Worldline).
// Test: test.saferpay.com, live: www.saferpay.com (variabile SAFERPAY_ENV).

const crypto = require('crypto');

const SPEC_VERSION = '1.51';

function baseUrl() {
    const mode = String(process.env.SAFERPAY_ENV || 'test').toLowerCase();
    return mode === 'live' ? 'https://www.saferpay.com/api' : 'https://test.saferpay.com/api';
}

function configured() {
    return Boolean(process.env.SAFERPAY_CUSTOMER_ID && process.env.SAFERPAY_TERMINAL_ID &&
        process.env.SAFERPAY_API_USERNAME && process.env.SAFERPAY_API_PASSWORD);
}

function header() {
    return {
        SpecVersion: SPEC_VERSION,
        CustomerId: process.env.SAFERPAY_CUSTOMER_ID,
        RequestId: crypto.randomUUID(),
        RetryIndicator: 0
    };
}

class SaferpayError extends Error {
    constructor(message, { name, behavior, status, raw, transient } = {}) {
        super(message);
        this.name = name || 'SAFERPAY_ERROR';
        this.behavior = behavior || '';
        this.status = status || 0;
        this.raw = raw;
        // transient = vale la pena riprovare piu' tardi (rete, Saferpay non raggiungibile)
        this.transient = Boolean(transient);
    }
}

async function request(path, payload) {
    const auth = Buffer.from(`${process.env.SAFERPAY_API_USERNAME}:${process.env.SAFERPAY_API_PASSWORD}`).toString('base64');
    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        response = await fetch(`${baseUrl()}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json; charset=utf-8',
                Accept: 'application/json'
            },
            body: JSON.stringify(Object.assign({ RequestHeader: header() }, payload)),
            signal: controller.signal
        });
    } catch (err) {
        throw new SaferpayError(`Saferpay non raggiungibile: ${err.message}`, { name: 'NETWORK', transient: true });
    } finally {
        clearTimeout(timer);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
        throw new SaferpayError((data && data.ErrorMessage) || `Saferpay HTTP ${response.status}`, {
            name: data && data.ErrorName,
            behavior: data && data.Behavior,
            status: response.status,
            raw: data,
            transient: response.status >= 500 || (data && data.Behavior === 'RETRY')
        });
    }
    return data;
}

// Avvia la pagina di pagamento. notifyUrl: indirizzo che Saferpay chiama (GET) server-to-server
// quando il pagamento e' riuscito, anche se il browser non torna sul sito.
function initialize({ orderId, amountCents, description, lang, returnUrl, notifyUrl, billingAddress }) {
    const payload = {
        TerminalId: process.env.SAFERPAY_TERMINAL_ID,
        Payment: {
            Amount: { Value: String(amountCents), CurrencyCode: 'CHF' },
            OrderId: orderId,
            Description: description
        },
        ReturnUrl: { Url: returnUrl },
        Payer: { LanguageCode: lang, BillingAddress: billingAddress }
    };
    if (notifyUrl) payload.Notification = { SuccessNotifyUrl: notifyUrl };
    return request('/Payment/v1/PaymentPage/Initialize', payload);
}

function assert(token) {
    return request('/Payment/v1/PaymentPage/Assert', { Token: token });
}

function capture(transactionId) {
    return request('/Payment/v1/Transaction/Capture', { TransactionReference: { TransactionId: transactionId } });
}

module.exports = { configured, initialize, assert, capture, SaferpayError, SPEC_VERSION };
