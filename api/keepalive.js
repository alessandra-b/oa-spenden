// api/keepalive.js — tiene attivo il database Upstash (piano gratuito).
// Upstash archivia i database senza traffico per qualche settimana; con poche donazioni al mese
// potrebbe succedere anche con il sito online. Vercel chiama questo indirizzo una volta al giorno
// (vercel.json -> crons). Se CRON_SECRET e' impostata su Vercel, risponde solo a Vercel.

const store = require('../lib/store');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        res.statusCode = 401;
        res.end('unauthorized');
        return;
    }
    if (!store.enabled()) {
        res.statusCode = 200;
        res.end('no database');
        return;
    }
    try {
        await store.setJson('keepalive', { t: new Date().toISOString() }, 8 * 24 * 3600);
        const v = await store.getJson('keepalive');
        res.statusCode = 200;
        res.end('ok ' + (v && v.t));
    } catch (err) {
        console.error('Keepalive: database non raggiungibile', err.message);
        res.statusCode = 500;
        res.end('database error');
    }
};
