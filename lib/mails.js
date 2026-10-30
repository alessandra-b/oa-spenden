// lib/mails.js — testi e impaginazione delle email (DE / EN / IT).
//
// Email ai soci e ai donatori: nella lingua del sito da cui hanno pagato.
// Email all'associazione (info@): sempre in tedesco, con tutti i dati.
// Impaginazione semplice a tabelle (compatibile con Outlook), testo minimo 16px.

const config = require('./config');

const LOCALES = { de: 'de-CH', en: 'en-GB', it: 'it-CH' };
const COLORS = { bg: '#f9f5ec', card: '#ffffff', ink: '#1c1a17', gold: '#8a6a2a', line: '#ebddc1' };
const FONT = 'Helvetica, Arial, sans-serif';

// ---- Formati ----------------------------------------------------------------------

function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(amount) {
    return 'CHF ' + new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function longDate(date, lang) {
    return new Intl.DateTimeFormat(LOCALES[lang] || 'de-CH', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich'
    }).format(date);
}

function dateTime(date) {
    return new Intl.DateTimeFormat('de-CH', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich'
    }).format(date) + ' Uhr';
}

function birthDate(iso, lang) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    return new Intl.DateTimeFormat(LOCALES[lang] || 'de-CH', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
}

function countryName(code, lang) {
    try {
        return new Intl.DisplayNames([LOCALES[lang] || 'de-CH'], { type: 'region' }).of(code) || code;
    } catch (e) {
        return code;
    }
}

function fullName(p) {
    return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

function addressLines(p, lang) {
    const lines = [p.address, [p.postalCode, p.city].filter(Boolean).join(' ')];
    if (p.country) lines.push(countryName(p.country, lang));
    return lines.filter(Boolean);
}

function paymentMethod(tx) {
    const means = tx && tx.PaymentMeans;
    return (means && means.Brand && (means.Brand.Name || means.Brand.PaymentMethod)) || '';
}

// ---- Testi ------------------------------------------------------------------------

const T = {
    de: {
        greeting: (name) => `Guten Tag ${name}`,
        greetingAnon: 'Guten Tag',
        regards: 'Herzliche Grüsse',
        member: {
            subject: 'Willkommen im Verein Orchestra Aurea',
            welcome: (year) => `Herzlich willkommen im Verein Orchestra Aurea! Wir haben Ihren Jahresbeitrag ${year} erhalten. Damit sind Sie Mitglied des Vereins.`,
            benefits: 'Als Mitglied werden Sie zur jährlichen Mitgliederversammlung eingeladen, bestimmen über die Entwicklung des Vereins mit und erfahren als Erste von unseren Projekten.',
            statutesAttached: 'Im Anhang finden Sie die Statuten des Vereins.',
            statutesLink: 'Statuten herunterladen (PDF)',
            statutesOnRequest: 'Die Statuten des Vereins senden wir Ihnen gerne zu: Antworten Sie einfach auf diese E-Mail.',
            correction: 'Stimmt etwas nicht? Antworten Sie einfach auf diese E-Mail, wir korrigieren es gerne.',
            signature: 'Verein Orchestra Aurea'
        },
        donation: {
            subject: 'Vielen Dank für Ihre Spende',
            thanks: 'Herzlichen Dank für Ihre Spende an das Orchestra Aurea. Ihre Unterstützung ermöglicht zusätzliche Proben, Gäste und Aufnahmen.',
            tierText: (tier) => `Ihre Spende gehört zur Stufe ${tier}. Was diese Stufe umfasst, lesen Sie auf unserer Website:`,
            echoText: 'Ihre Spende ist ein ECHO, ein Beitrag nach Ihrem Mass.',
            tierLink: 'Spendenstufen ansehen',
            keep: 'Diese E-Mail dient als Bestätigung Ihrer Zahlung. Bei Fragen antworten Sie einfach auf diese E-Mail.',
            signature: 'Orchestra Aurea'
        },
        labels: {
            details: 'Ihre Angaben', payment: 'Zahlung', name: 'Name', address: 'Adresse', birthDate: 'Geburtsdatum',
            email: 'E-Mail', phone: 'Telefon', fee: (y) => `Jahresbeitrag ${y}`, amount: 'Betrag', tier: 'Stufe',
            date: 'Datum', method: 'Zahlungsart', reference: 'Referenz'
        },
        newsletter: {
            subject: 'Bitte bestätigen Sie Ihre Newsletter-Anmeldung',
            intro: 'Vielen Dank für Ihr Interesse am Newsletter von Orchestra Aurea. Bitte bestätigen Sie Ihre Anmeldung mit einem Klick auf den folgenden Button:',
            button: 'Anmeldung bestätigen',
            validity: 'Der Link ist 7 Tage gültig. Falls Sie sich nicht angemeldet haben, ignorieren Sie diese E-Mail einfach: Sie erhalten dann keine weiteren Nachrichten von uns.',
            fallback: 'Funktioniert der Button nicht? Kopieren Sie diesen Link in Ihren Browser:',
            signature: 'Orchestra Aurea'
        },
        pages: {
            confirmTitle: 'Newsletter-Anmeldung bestätigen',
            confirmText: (email) => `Bitte bestätigen Sie, dass Sie den Newsletter von Orchestra Aurea an ${email} erhalten möchten.`,
            confirmButton: 'Anmeldung bestätigen',
            doneTitle: 'Vielen Dank!',
            doneText: 'Ihre Anmeldung ist bestätigt. Sie erhalten ab jetzt den Newsletter von Orchestra Aurea.',
            invalidTitle: 'Link ungültig',
            invalidText: 'Dieser Link ist ungültig oder abgelaufen. Bitte melden Sie sich auf unserer Website erneut an.',
            errorTitle: 'Etwas ist schiefgelaufen',
            errorText: 'Ihre Anmeldung konnte nicht bestätigt werden. Bitte versuchen Sie es später erneut.',
            toSite: 'Zur Website'
        }
    },
    en: {
        greeting: (name) => `Dear ${name},`,
        greetingAnon: 'Hello,',
        regards: 'Kind regards',
        member: {
            subject: 'Welcome to the Orchestra Aurea association',
            welcome: (year) => `Welcome to the Orchestra Aurea association! We have received your annual membership fee for ${year}, and you are now a member of the association.`,
            benefits: 'As a member, you are invited to the annual general meeting, have a say in the association’s development and are the first to hear about our projects.',
            statutesAttached: 'Please find the Articles of Association attached.',
            statutesLink: 'Download the Articles of Association (PDF)',
            statutesOnRequest: 'We will gladly send you the Articles of Association: simply reply to this email.',
            correction: 'Is something incorrect? Simply reply to this email and we will correct it.',
            signature: 'Orchestra Aurea association'
        },
        donation: {
            subject: 'Thank you for your donation',
            thanks: 'Thank you very much for your donation to Orchestra Aurea. Your support makes additional rehearsals, guest artists and recordings possible.',
            tierText: (tier) => `Your donation belongs to the ${tier} tier. You can read what this tier includes on our website:`,
            echoText: 'Your donation is an ECHO, a contribution on your terms.',
            tierLink: 'See the donation tiers',
            keep: 'This email serves as confirmation of your payment. If you have any questions, simply reply to this email.',
            signature: 'Orchestra Aurea'
        },
        labels: {
            details: 'Your details', payment: 'Payment', name: 'Name', address: 'Address', birthDate: 'Date of birth',
            email: 'Email', phone: 'Phone', fee: (y) => `Annual fee ${y}`, amount: 'Amount', tier: 'Tier',
            date: 'Date', method: 'Payment method', reference: 'Reference'
        },
        newsletter: {
            subject: 'Please confirm your newsletter subscription',
            intro: 'Thank you for your interest in the Orchestra Aurea newsletter. Please confirm your subscription by clicking the button below:',
            button: 'Confirm subscription',
            validity: 'The link is valid for 7 days. If you did not sign up, simply ignore this email: you will not receive any further messages from us.',
            fallback: 'If the button does not work, copy this link into your browser:',
            signature: 'Orchestra Aurea'
        },
        pages: {
            confirmTitle: 'Confirm your newsletter subscription',
            confirmText: (email) => `Please confirm that you would like to receive the Orchestra Aurea newsletter at ${email}.`,
            confirmButton: 'Confirm subscription',
            doneTitle: 'Thank you!',
            doneText: 'Your subscription is confirmed. You will now receive the Orchestra Aurea newsletter.',
            invalidTitle: 'Invalid link',
            invalidText: 'This link is invalid or has expired. Please sign up again on our website.',
            errorTitle: 'Something went wrong',
            errorText: 'Your subscription could not be confirmed. Please try again later.',
            toSite: 'Go to the website'
        }
    },
    it: {
        greeting: (name, first) => `Ciao ${first || name},`,
        greetingAnon: 'Buongiorno,',
        regards: 'Un caro saluto',
        member: {
            subject: 'Iscrizione all’associazione Orchestra Aurea confermata',
            welcome: (year) => `Ti diamo il benvenuto nell’associazione Orchestra Aurea! Abbiamo ricevuto la tua quota annuale ${year}: da questo momento fai parte dell’associazione.`,
            benefits: 'Riceverai l’invito all’assemblea annuale dei soci, potrai partecipare alle decisioni sullo sviluppo dell’associazione e conoscerai in anteprima i nostri progetti.',
            statutesAttached: 'In allegato trovi lo statuto dell’associazione.',
            statutesLink: 'Scarica lo statuto (PDF)',
            statutesOnRequest: 'Saremo lieti di inviarti lo statuto dell’associazione: basta rispondere a questa email.',
            correction: 'Qualcosa non è corretto? Rispondi semplicemente a questa email e lo correggeremo.',
            signature: 'Associazione Orchestra Aurea'
        },
        donation: {
            subject: 'Grazie per la tua donazione',
            thanks: 'Grazie di cuore per la tua donazione a Orchestra Aurea. Il tuo sostegno rende possibili prove aggiuntive, ospiti e registrazioni.',
            tierText: (tier) => `La tua donazione rientra nel livello ${tier}. Sul nostro sito trovi che cosa comprende questo livello:`,
            echoText: 'La tua donazione è un ECHO, un contributo su misura.',
            tierLink: 'Vedi i livelli di donazione',
            keep: 'Questa email vale come conferma del tuo pagamento. Per qualsiasi domanda, rispondi semplicemente a questa email.',
            signature: 'Orchestra Aurea'
        },
        labels: {
            details: 'I tuoi dati', payment: 'Pagamento', name: 'Nome', address: 'Indirizzo', birthDate: 'Data di nascita',
            email: 'Email', phone: 'Telefono', fee: (y) => `Quota annuale ${y}`, amount: 'Importo', tier: 'Livello',
            date: 'Data', method: 'Metodo di pagamento', reference: 'Riferimento'
        },
        newsletter: {
            subject: 'Conferma la tua iscrizione alla newsletter',
            intro: 'Grazie per l’interesse per la newsletter di Orchestra Aurea. Conferma la tua iscrizione con un clic sul pulsante qui sotto:',
            button: 'Conferma l’iscrizione',
            validity: 'Il link è valido 7 giorni. Se non hai richiesto l’iscrizione, ignora semplicemente questa email: non riceverai altri messaggi da noi.',
            fallback: 'Se il pulsante non funziona, copia questo link nel browser:',
            signature: 'Orchestra Aurea'
        },
        pages: {
            confirmTitle: 'Conferma l’iscrizione alla newsletter',
            confirmText: (email) => `Conferma che desideri ricevere la newsletter di Orchestra Aurea all’indirizzo ${email}.`,
            confirmButton: 'Conferma l’iscrizione',
            doneTitle: 'Grazie!',
            doneText: 'La tua iscrizione è confermata. Da ora riceverai la newsletter di Orchestra Aurea.',
            invalidTitle: 'Link non valido',
            invalidText: 'Questo link non è valido o è scaduto. Iscriviti di nuovo sul nostro sito.',
            errorTitle: 'Qualcosa è andato storto',
            errorText: 'Non è stato possibile confermare l’iscrizione. Riprova più tardi.',
            toSite: 'Vai al sito'
        }
    }
};

function texts(lang) {
    return T[config.normalizeLang(lang)];
}

// ---- Impaginazione HTML ------------------------------------------------------------

function p(text, extra) {
    return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:${COLORS.ink};${extra || ''}">${text}</p>`;
}

function link(href, label) {
    return `<a href="${esc(href)}" style="color:${COLORS.gold};text-decoration:underline;">${esc(label)}</a>`;
}

function button(href, label) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>` +
        `<td style="border-radius:8px;background:${COLORS.gold};">` +
        `<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:1.2;color:#ffffff;text-decoration:none;letter-spacing:.05em;text-transform:uppercase;border-radius:8px;">${esc(label)}</a>` +
        `</td></tr></table>`;
}

// rows: [[label, valore (testo semplice, \n = a capo)]]
function table(title, rows) {
    const body = rows.filter((r) => r && r[1]).map(([label, value]) =>
        `<tr><td valign="top" width="40%" style="padding:8px 16px 8px 0;font-family:${FONT};font-size:16px;line-height:1.45;color:${COLORS.gold};white-space:nowrap;border-top:1px solid ${COLORS.line};">${esc(label)}</td>` +
        `<td valign="top" style="padding:8px 0;font-family:${FONT};font-size:16px;line-height:1.45;color:${COLORS.ink};border-top:1px solid ${COLORS.line};">${esc(value).replace(/\n/g, '<br>')}</td></tr>`
    ).join('');
    return `<p style="margin:24px 0 8px;font-family:${FONT};font-size:16px;line-height:1.3;color:${COLORS.gold};letter-spacing:.05em;text-transform:uppercase;font-weight:bold;">${esc(title)}</p>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;border-bottom:1px solid ${COLORS.line};">${body}</table>`;
}

// Logo come nella navbar del sito: 180 px di larghezza. PNG (le email non mostrano SVG),
// disegnato a doppia risoluzione per gli schermi retina, su fondo bianco come la card.
const LOGO = { file: 'email/orchestra-aurea-logo.png', width: 180, height: 43 };

function logoHtml(lang) {
    const site = `${config.siteUrl()}/${config.normalizeLang(lang)}/`;
    return `<a href="${esc(site)}" style="text-decoration:none;border:0;">` +
        `<img src="${esc(config.assetsUrl() + '/' + LOGO.file)}" width="${LOGO.width}" height="${LOGO.height}" alt="Orchestra Aurea" ` +
        `style="display:block;width:${LOGO.width}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:16px;color:${COLORS.ink};"></a>`;
}

function layout(lang, subject, inner) {
    const a = config.association;
    const site = config.siteUrl();
    return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>` +
        `<body style="margin:0;padding:0;background:${COLORS.bg};">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};"><tr><td align="center" style="padding:32px 12px;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLORS.card};border-radius:8px;">` +
        `<tr><td style="padding:32px 32px 8px;">${logoHtml(lang)}</td></tr>` +
        `<tr><td style="padding:16px 32px 16px;">${inner}</td></tr>` +
        `</table>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;"><tr><td style="padding:20px 32px;font-family:${FONT};font-size:16px;line-height:1.5;color:${COLORS.ink};">` +
        `${esc(a.name)}<br>${esc(a.address)}<br>${link('mailto:' + a.email, a.email)} · ${link(site, site.replace(/^https?:\/\//, ''))}` +
        `</td></tr></table>` +
        `</td></tr></table></body></html>`;
}

function textFooter() {
    const a = config.association;
    return `\n--\n${a.name}\n${a.address}\n${a.email} · ${config.siteUrl()}\n`;
}

function textTable(title, rows) {
    return `\n${title.toUpperCase()}\n` + rows.filter((r) => r && r[1])
        .map(([l, v]) => `${l}: ${String(v).replace(/\n/g, ', ')}`).join('\n') + '\n';
}

// ---- Email al socio -----------------------------------------------------------------

function memberEmail({ ctx, tx, paidAt, statutesUrl }) {
    const lang = config.normalizeLang(ctx.lang);
    const t = texts(lang);
    const p0 = ctx.person;
    const L = t.labels;
    const details = [
        [L.name, fullName(p0)],
        [L.address, addressLines(p0, lang).join('\n')],
        [L.birthDate, birthDate(p0.birthDate, lang)],
        [L.email, p0.email],
        [L.phone, p0.phone]
    ];
    const payment = [
        [L.fee(ctx.year), money(ctx.amount)],
        [L.date, longDate(paidAt, lang)],
        [L.method, paymentMethod(tx)],
        [L.reference, ctx.orderId]
    ];
    const statutesHtml = statutesUrl
        ? p(`${esc(t.member.statutesAttached)} ${link(statutesUrl, t.member.statutesLink)}`)
        : p(esc(t.member.statutesOnRequest));
    const html = layout(lang, t.member.subject,
        p(esc(t.greeting(fullName(p0), p0.firstName))) +
        p(esc(t.member.welcome(ctx.year))) +
        p(esc(t.member.benefits)) +
        statutesHtml +
        table(L.details, details) +
        table(L.payment, payment) +
        p(esc(t.member.correction)) +
        p(`${esc(t.regards)}<br>${esc(t.member.signature)}`, 'margin-bottom:0;'));
    const text = `${t.greeting(fullName(p0), p0.firstName)}\n\n${t.member.welcome(ctx.year)}\n\n${t.member.benefits}\n\n` +
        (statutesUrl ? `${t.member.statutesAttached}\n${t.member.statutesLink}: ${statutesUrl}\n` : `${t.member.statutesOnRequest}\n`) +
        textTable(L.details, details) + textTable(L.payment, payment) +
        `\n${t.member.correction}\n\n${t.regards}\n${t.member.signature}\n` + textFooter();
    return { subject: t.member.subject, html, text };
}

// ---- Email al donatore --------------------------------------------------------------

function donationEmail({ ctx, tx, paidAt }) {
    const lang = config.normalizeLang(ctx.lang);
    const t = texts(lang);
    const p0 = ctx.person;
    const L = t.labels;
    const tiersUrl = `${config.siteUrl()}/${lang}/spenden`;
    const payment = [
        [L.amount, money(ctx.amount)],
        [L.tier, ctx.level],
        [L.date, longDate(paidAt, lang)],
        [L.method, paymentMethod(tx)],
        [L.reference, ctx.orderId]
    ];
    const details = [
        [L.name, fullName(p0)],
        [L.address, addressLines(p0, lang).join('\n')],
        [L.email, p0.email]
    ];
    const tierHtml = ctx.level === 'ECHO'
        ? p(esc(t.donation.echoText))
        : p(`${esc(t.donation.tierText(ctx.level))} ${link(tiersUrl, t.donation.tierLink)}`);
    const html = layout(lang, t.donation.subject,
        p(esc(t.greeting(fullName(p0), p0.firstName))) +
        p(esc(t.donation.thanks)) +
        tierHtml +
        table(L.payment, payment) +
        table(L.details, details) +
        p(esc(t.donation.keep)) +
        p(`${esc(t.regards)}<br>${esc(t.donation.signature)}`, 'margin-bottom:0;'));
    const text = `${t.greeting(fullName(p0), p0.firstName)}\n\n${t.donation.thanks}\n\n` +
        (ctx.level === 'ECHO' ? `${t.donation.echoText}\n` : `${t.donation.tierText(ctx.level)} ${tiersUrl}\n`) +
        textTable(L.payment, payment) + textTable(L.details, details) +
        `\n${t.donation.keep}\n\n${t.regards}\n${t.donation.signature}\n` + textFooter();
    return { subject: t.donation.subject, html, text };
}

// ---- Email all'associazione (sempre in tedesco) -------------------------------------

const LANG_NAMES = { de: 'Deutsch', en: 'Englisch', it: 'Italienisch' };

function adminEmail({ ctx, tx, paidAt, statutesUrl, newsletterRequested }) {
    const p0 = ctx.person;
    const isMember = ctx.type === 'member';
    const subject = isMember
        ? `Neues Mitglied: ${fullName(p0)}`
        : `Neue Spende: ${money(ctx.amount)} (${ctx.level}) von ${fullName(p0)}`;
    const intro = isMember
        ? 'Über die Website hat sich ein neues Mitglied angemeldet und den Jahresbeitrag bezahlt. Die Bestätigung wurde automatisch an die Person geschickt.'
        : 'Über die Website ist eine neue Spende eingegangen. Die Dankes-E-Mail wurde automatisch an die Person geschickt.';
    const person = [
        ['Vorname', p0.firstName],
        ['Nachname', p0.lastName],
        ['Adresse', addressLines(p0, 'de').join('\n')],
        isMember ? ['Geburtsdatum', birthDate(p0.birthDate, 'de')] : null,
        ['E-Mail', p0.email],
        isMember ? ['Telefon', p0.phone || '–'] : null,
        ['Sprache', LANG_NAMES[ctx.lang] || ctx.lang],
        ['Newsletter', newsletterRequested ? 'Ja – Bestätigungs-E-Mail (Double-Opt-In) verschickt' : 'Nein']
    ];
    const payment = [
        [isMember ? `Jahresbeitrag ${ctx.year}` : 'Betrag', money(ctx.amount)],
        isMember ? null : ['Stufe', ctx.level],
        ['Bezahlt am', dateTime(paidAt)],
        ['Zahlungsart', paymentMethod(tx)],
        ['Referenz', ctx.orderId],
        ['Saferpay-Transaktion', tx && tx.Transaction && tx.Transaction.Id],
        isMember ? ['Statuten mitgeschickt', statutesUrl ? 'Ja' : 'Nein (STATUTEN_URL auf Vercel fehlt)'] : null
    ];
    const html = layout('de', subject,
        p(esc(intro)) +
        table(isMember ? 'Mitglied' : 'Spender/in', person) +
        table('Zahlung', payment) +
        p('Mit «Antworten» schreiben Sie direkt an die Person.', 'margin-bottom:0;'));
    const text = `${intro}\n` + textTable(isMember ? 'Mitglied' : 'Spender/in', person) + textTable('Zahlung', payment) + textFooter();
    return { subject, html, text };
}

// ---- Conferma newsletter (double opt-in) ---------------------------------------------

function newsletterEmail({ lang, name, firstName, confirmUrl }) {
    const t = texts(lang);
    const html = layout(config.normalizeLang(lang), t.newsletter.subject,
        p(esc(name ? t.greeting(name, firstName) : t.greetingAnon)) +
        p(esc(t.newsletter.intro)) +
        button(confirmUrl, t.newsletter.button) +
        p(esc(t.newsletter.validity)) +
        p(`${esc(t.newsletter.fallback)}<br><span style="word-break:break-all;">${link(confirmUrl, confirmUrl)}</span>`) +
        p(`${esc(t.regards)}<br>${esc(t.newsletter.signature)}`, 'margin-bottom:0;'));
    const text = `${name ? t.greeting(name, firstName) : t.greetingAnon}\n\n${t.newsletter.intro}\n\n${confirmUrl}\n\n${t.newsletter.validity}\n\n${t.regards}\n${t.newsletter.signature}\n` + textFooter();
    return { subject: t.newsletter.subject, html, text };
}

// ---- Pagine HTML della conferma newsletter (servite da /api/newsletter) -------------

function page(lang, { title, text, form, siteLink }) {
    const l = config.normalizeLang(lang);
    const t = texts(l);
    const site = `${config.siteUrl()}/${l}/`;
    return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="robots" content="noindex,nofollow"><title>${esc(title)} – Orchestra Aurea</title>` +
        `<style>body{margin:0;background:${COLORS.bg};color:${COLORS.ink};font-family:"Switzer Variable",${FONT};font-size:1.125rem;line-height:1.55}` +
        `main{box-sizing:border-box;max-width:36rem;margin:0 auto;padding:clamp(2rem,8vw,5rem) 1.25rem}` +
        `.brand{margin:0 0 2.5rem}.brand img{display:block;width:180px;height:auto}` +
        `h1{margin:0 0 1rem;color:${COLORS.gold};font-size:1rem;letter-spacing:.05em;text-transform:uppercase;font-weight:500}` +
        `p{margin:0 0 1.5rem}` +
        `.btn{display:inline-block;padding:.875rem 2rem;border:1px solid ${COLORS.gold};border-radius:8px;background:${COLORS.gold};color:#fff;font:inherit;font-size:1rem;letter-spacing:.05em;text-transform:uppercase;text-decoration:none;cursor:pointer}` +
        `.btn:hover{background:#fff;color:${COLORS.gold}}.link{color:${COLORS.gold}}` +
        `.btn:focus-visible,.link:focus-visible{outline:2px solid ${COLORS.gold};outline-offset:2px}</style></head>` +
        `<body><main><p class="brand"><a href="${esc(site)}"><img src="${esc(config.assetsUrl())}/email/orchestra-aurea-logo.svg" width="180" height="43" alt="Orchestra Aurea"></a></p><h1>${esc(title)}</h1><p>${esc(text)}</p>` +
        (form ? `<form method="post" action="${esc(form.action)}"><input type="hidden" name="t" value="${esc(form.token)}"><button class="btn" type="submit">${esc(form.button)}</button></form>` : '') +
        (siteLink ? `<p><a class="link" href="${esc(site)}">${esc(t.pages.toSite)}</a></p>` : '') +
        `</main></body></html>`;
}

module.exports = { LOGO, memberEmail, donationEmail, adminEmail, newsletterEmail, page, texts, money, fullName };
