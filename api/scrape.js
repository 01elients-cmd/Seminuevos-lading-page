export default async function handler(req, res) {
    // IMAGE PROXY MODE
    if (req.method === 'GET' && req.query.proxy) {
        try {
            const target = decodeURIComponent(req.query.proxy).trim();
            const key = (req.query.key || '').trim();

            if (!target.startsWith('http')) return res.status(400).send('Invalid Target');

            let response;
            try {
                response = await fetch(target, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com' },
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) throw new Error('Direct failed');
            } catch (e) {
                if (key) {
                    const sUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(target)}&country_code=us`;
                    response = await fetch(sUrl, { signal: AbortSignal.timeout(10000) });
                } else return res.status(403).send('Blocked');
            }

            if (!response.ok) return res.status(404).send('Not found');
            const arrayBuffer = await response.arrayBuffer();
            res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(Buffer.from(arrayBuffer));
        } catch (e) {
            return res.status(500).send(e.message);
        }
    }

    // SCRAPER MODE
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    try {
        const { url, html: providedHtml, proxyKey: providedKey } = req.body;
        if (!url) return res.status(400).json({ message: 'URL required' });

        const html = providedHtml || await (async () => {
            if (providedKey) {
                const sUrl = `https://api.scraperapi.com?api_key=${providedKey}&url=${encodeURIComponent(url)}&render=true&country_code=us`;
                const r = await fetch(sUrl);
                return await r.text();
            } else {
                const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                return await r.text();
            }
        })();

        if (!html) throw new Error('Cargando página vacía. Verifica el link.');

        let result;
        if (url.includes('copart.com')) {
            result = parseCopart(html, url);
        } else if (url.includes('iaai.com')) {
            result = parseIAAI(html, url);
        } else {
            result = parseGeneric(html, url);
        }

        return res.json({ success: true, data: result });

    } catch (err) {
        console.error('Scrape Error:', err.message);
        return res.status(400).json({ success: false, message: err.message });
    }
}

/**
 * Unified Scanner
 */
function scanForData(obj, data = {}) {
    if (!obj || typeof obj !== 'object') return data;

    // IAAI
    if (obj.Year && !data.year) data.year = obj.Year;
    if (obj.Make && !data.make) data.make = obj.Make;
    if (obj.Model && !data.model) data.model = obj.Model;
    if (obj.Series && !data.series) data.series = obj.Series;
    if (obj.VIN && !data.vin) data.vin = obj.VIN;
    if (obj.ODOValue && !data.km) data.km = `${obj.ODOValue} ${obj.ODOUoM || ''}`.trim();
    if (obj.EngineSize && !data.engine) data.engine = obj.EngineSize;
    if (obj.Transmission && !data.transmission) data.transmission = obj.Transmission;
    if (obj.buyNowPrice && !data.price) data.price = `$${parseInt(obj.buyNowPrice).toLocaleString()}`;
    if (obj.highBidAmount && !data.price) data.price = `$${parseInt(obj.highBidAmount).toLocaleString()}`;

    // Copart
    if (obj.lcy && !data.year) data.year = obj.lcy;
    if (obj.mkn && !data.make) data.make = obj.mkn;
    if (obj.lm && !data.model) data.model = obj.lm;
    if (obj.orr && !data.km) data.km = `${parseInt(obj.orr).toLocaleString()} mi`;
    if (obj.fv && !data.vin) data.vin = obj.fv;
    if (obj.egn && !data.engine) data.engine = obj.egn;
    if (obj.tsmn && !data.transmission) data.transmission = obj.tsmn;
    if (obj.bnp && !data.price) data.price = `$${parseInt(obj.bnp).toLocaleString()}`;
    if (obj.curm && !data.price) data.price = `$${parseInt(obj.curm).toLocaleString()}`;

    for (let k in obj) {
        if (typeof obj[k] === 'object') scanForData(obj[k], data);
    }
    return data;
}

function parseIAAI(html, url) {
    if (html.includes('Additional security check') || html.includes('captcha') || html.includes('Imperva') || html.includes('Incapsula')) {
        throw new Error('IAAI Bloqueado. Usa Modo Manual.');
    }
    const stateStr = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/i)?.[1];
    let rawData = {};
    if (stateStr) { try { rawData = scanForData(JSON.parse(stateStr)); } catch (e) { } }

    if (!rawData.year || !rawData.make) throw new Error('Datos no encontrados. Usa Modo Manual.');

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''} ${rawData.series || ''}`.trim(),
        year: rawData.year,
        price: rawData.price || "Consultar",
        km: rawData.km || "0 KM",
        engine: rawData.engine,
        transmission: rawData.transmission,
        vin: rawData.vin,
        images: (html.match(/https?:\/\/(vis|images|an-cdn)\.iaai\.com\/inventory\/[^"']*?(1024|800)[^"']*/gi) || []),
        description: `Importado vía subasta IAAI. VIN: ${rawData.vin || 'N/A'}`
    };
}

function parseCopart(html, url) {
    if (html.includes('Additional security check') || html.includes('captcha') || html.includes('Imperva') || html.includes('Incapsula')) {
        throw new Error('Copart Bloqueado. Usa Modo Manual.');
    }
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    let rawData = {};
    for (const s of scripts) {
        if (s.includes('lcy') || s.includes('mkn')) {
            const m = s.match(/\{"lcy"[\s\S]*?\}/g);
            if (m) { for (const j of m) { try { scanForData(JSON.parse(j), rawData); } catch (e) { } } }
        }
    }

    if (!rawData.year || !rawData.make) throw new Error('Datos no encontrados en Copart. Usa Modo Manual.');

    const imgReg = /https?:\/\/[^"']+\.copart\.com\/[^"']+\d+_(?:f|b|s|i|d|l)\.jpg/gi;
    const matches = html.match(imgReg);

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''}`.trim(),
        year: rawData.year,
        price: rawData.price || "Consultar",
        km: rawData.km || "0 KM",
        engine: rawData.engine,
        transmission: rawData.transmission,
        vin: rawData.vin,
        images: [...new Set(matches || [])].map(img => img.replace(/_[a-z]\.jpg/i, '_full.jpg')),
        description: `Importado vía subasta Copart. VIN: ${rawData.vin || 'N/A'}`
    };
}

function parseGeneric(html, url) {
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const ogImg = html.match(/meta property="og:image" content="([^"]+)"/);
    return {
        title: titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Vehículo',
        images: ogImg ? [ogImg[1]] : []
    };
}
