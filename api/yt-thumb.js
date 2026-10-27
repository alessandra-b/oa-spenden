// api/yt-thumb.js
//
// Anteprima dei video YouTube senza contattare Google dal browser del visitatore.
// Il sito chiede l'immagine qui (spenden.orchestra-aurea.ch/api/yt-thumb?id=ID_VIDEO);
// e' questa function a scaricarla da YouTube, quindi l'indirizzo IP del visitatore
// non arriva a Google prima del consenso. L'immagine resta in cache sulla CDN di Vercel.
//
// Prova prima la versione grande (maxresdefault), poi quella standard (hqdefault).

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SIZES = ['maxresdefault', 'hqdefault'];

module.exports = async (req, res) => {
    const id = String((req.query && req.query.id) || '');
    if (!ID_PATTERN.test(id)) {
        res.statusCode = 400;
        res.end('invalid id');
        return;
    }

    for (const size of SIZES) {
        try {
            const r = await fetch(`https://i.ytimg.com/vi/${id}/${size}.jpg`);
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            // YouTube restituisce un'immagine grigia di 120 px quando la versione grande non esiste
            if (size === 'maxresdefault' && buf.length < 5000) continue;
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.statusCode = 200;
            res.end(buf);
            return;
        } catch (e) {
            // prova la dimensione successiva
        }
    }
    res.statusCode = 404;
    res.end('not found');
};
