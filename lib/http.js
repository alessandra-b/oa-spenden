// lib/http.js — piccoli aiuti comuni alle function (CORS, errori, cookie, indirizzo base).

const config = require('./config');

// CORS per le chiamate dal sito Webflow. credentials=true serve a /api/session e
// /api/membership (cookie di riserva quando il database non c'e').
function setCors(req, res, { methods = 'POST, OPTIONS', credentials = true } = {}) {
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    const allowed = config.allowedOrigins();
    const origin = String(req.headers.origin || '').replace(/\/+$/, '');
    if (allowed.length === 0) {
        // Nessuna origine configurata: solo per i test (niente cookie cross-origin).
        res.setHeader('Access-Control-Allow-Origin', '*');
        return;
    }
    if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
}

function fail(res, status, error, extra) {
    res.status(status).json(Object.assign({ error }, extra || {}));
}

function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    String(header).split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        try {
            cookies[key] = decodeURIComponent(pair.slice(idx + 1).trim());
        } catch (e) {
            cookies[key] = pair.slice(idx + 1).trim();
        }
    });
    return cookies;
}

// https://spenden.orchestra-aurea.ch (o l'indirizzo dell'anteprima Vercel)
function baseUrl(req) {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return `${proto}://${host}`;
}

function clientIp(req) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || String(req.headers['x-real-ip'] || '') || 'unknown';
}

function query(req) {
    if (req.query) return req.query;
    try {
        return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    } catch (e) {
        return {};
    }
}

function redirect(res, url, cookies) {
    if (cookies && cookies.length) res.setHeader('Set-Cookie', cookies);
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(302, { Location: url });
    res.end();
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isValidEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.trim().length <= 100;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

module.exports = { setCors, fail, parseCookies, baseUrl, clientIp, query, redirect, isNonEmptyString, isValidEmail, clean };
