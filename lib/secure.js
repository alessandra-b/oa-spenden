// lib/secure.js — cifratura e firma.
//
// Chiave: OA_SECRET (consigliata, una stringa casuale lunga, impostata su Vercel).
// Se manca, la chiave si ricava dalla password API di Saferpay: funziona, ma se un giorno la
// password cambia, i link di conferma newsletter non ancora cliccati smettono di valere.
//
// - encrypt/decrypt: i dati personali di un pagamento in corso (salvati nel database o nel
//   cookie di riserva) sono cifrati con AES-256-GCM: chi vede il database non li legge.
// - sign/verify: firma dell'id ordine negli indirizzi di ritorno e di notifica di Saferpay.
// - signToken/verifyToken: link di conferma della newsletter (double opt-in), con scadenza.

const crypto = require('crypto');

function masterKey() {
    const secret = process.env.OA_SECRET;
    if (secret && secret.trim().length >= 16) {
        return crypto.createHash('sha256').update(secret.trim()).digest();
    }
    const pw = process.env.SAFERPAY_API_PASSWORD;
    if (pw) {
        const salt = String(process.env.SAFERPAY_CUSTOMER_ID || 'oa');
        return Buffer.from(crypto.hkdfSync('sha256', pw, salt, 'oa-spenden-master-v1', 32));
    }
    throw new Error('OA_SECRET mancante (e nessuna SAFERPAY_API_PASSWORD da cui ricavarla)');
}

function subKey(purpose) {
    return Buffer.from(crypto.hkdfSync('sha256', masterKey(), Buffer.alloc(0), `oa-${purpose}-v1`, 32));
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

function encrypt(obj) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', subKey('enc'), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    return b64u(Buffer.concat([iv, cipher.getAuthTag(), data]));
}

function decrypt(text) {
    try {
        const raw = fromB64u(text);
        if (raw.length < 29) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', subKey('enc'), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        const out = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
        return JSON.parse(out.toString('utf8'));
    } catch (e) {
        return null;
    }
}

function sign(value) {
    return b64u(crypto.createHmac('sha256', subKey('sig')).update(String(value)).digest()).slice(0, 32);
}

function verify(value, signature) {
    if (!value || !signature) return false;
    const a = Buffer.from(sign(value));
    const b = Buffer.from(String(signature));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload, ttlSeconds) {
    const body = b64u(JSON.stringify(Object.assign({}, payload, { exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
    return `${body}.${sign('tok:' + body)}`;
}

function verifyToken(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !verify('tok:' + parts[0], parts[1])) return null;
    try {
        const payload = JSON.parse(fromB64u(parts[0]).toString('utf8'));
        if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return { expired: true };
        return payload;
    } catch (e) {
        return null;
    }
}

function hash(value) {
    return crypto.createHmac('sha256', subKey('hash')).update(String(value).toLowerCase()).digest('hex').slice(0, 32);
}

module.exports = { encrypt, decrypt, sign, verify, signToken, verifyToken, hash };
