export default async function handler(req, res) {
    // IMAGE PROXY MODE
    if (req.method === 'GET' && req.query.proxy) {
        try {
            const target = decodeURIComponent(req.query.proxy).trim();
            const key = (req.query.key || '').trim();

            if (!target.startsWith('http')) {
                return res.status(400).send('Invalid Target URL');
            }

            let response;
            try {
                // Try direct fetch with common headers
                response = await fetch(target, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.google.com' },
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) throw new Error(`Direct failed: ${response.status}`);
            } catch (e) {
                // Fallback to ScraperAPI
                if (key) {
                    const scraperUrl = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(target)}&country_code=us`;
                    response = await fetch(scraperUrl, { signal: AbortSignal.timeout(10000) });
                } else {
                    return res.status(403).send('Directly blocked and no proxy key provided');
                }
            }

            if (!response.ok) return res.status(response.status).send('Asset not found');

            const contentType = response.headers.get('Content-Type') || 'image/jpeg';
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(buffer);
        } catch (e) {
            console.error('Proxy Error:', e.message);
            return res.status(500).send('Proxy error: ' + e.message);
        }
    }

    // SCRAPER MODE
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    try {
        const { url, html: providedHtml, proxyKey: providedKey } = req.body;
        if (!url) return res.status(400).json({ message: 'URL required' });

        const html = providedHtml || await (async () => {
            if (providedKey) {
                const sUrl = `https://api.scraperapi.com?api_key=${providedKey}&url=${encodeURIComponent(url)}&render=false&country_code=us`;
                const r = await fetch(sUrl);
                return await r.text();
            } else {
                const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                return await r.text();
            }
        })();

        if (!html) throw new Error('Could not retrieve HTML');

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
        return res.status(500).json({ success: false, message: err.message });
    }
}

function parseIAAI(html, url) {
    const data = { images: [] };

    // 1. Try to get structured JSON first (Most reliable)
    const jsonMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i);
    let state = null;
    if (jsonMatch) {
        try {
            state = JSON.parse(jsonMatch[1]);
            const details = state.inventoryDetail?.inventoryView?.attributes || {};
            const bid = state.inventoryDetail?.auctionInformation?.biddingInformation || {};

            data.title = `${details.Year || ''} ${details.Make || ''} ${details.Model || ''} ${details.Series || ''}`.trim();
            data.year = details.Year;
            data.price = bid.buyNowPrice ? `$${bid.buyNowPrice}` : (details.MinimumBidAmount ? `$${details.MinimumBidAmount}` : null);
            data.vin = details.VIN;
            data.km = `${details.ODOValue || ''} ${details.ODOUoM || ''}`.trim();
            data.engine = (details.EngineInformation || details.EngineSize || '').replace(/\s+/g, ' ').trim();
            data.transmission = details.Transmission;
            data.bodyType = (details.BodyStyleName || details.VehicleClass || '').toLowerCase();
            data.fuel = details.FuelTypeDesc || details.FuelTypeCode;

            if (state.inventoryDetail?.imageDimensions?.keys?.$values) {
                const keys = state.inventoryDetail.imageDimensions.keys.$values;
                data.images = keys.map(k => `https://vis.iaai.com/dimensions?imageKeys=${k.k}&width=${k.w}&height=${k.h}`);
            }
        } catch (e) {
            console.warn("JSON State parse error", e.message);
        }
    }

    // Helpers
    const getSpec = (label) => {
        const patterns = [
            new RegExp(`data-automation="${label.toLowerCase().replace(/\s+/g, '-')}"[^>]*>\\s*([^<]+)`, 'i'),
            new RegExp(`>${label}:?<[\\s\\S]{0,50}?>\\s*([^<\\r\\n]{2,})`, 'i'),
            new RegExp(`${label}:\\s*([^<\\r\\n]{2,})`, 'i')
        ];
        for (const reg of patterns) {
            const match = html.match(reg);
            if (match && match[1]) {
                const val = match[1].replace(/<[^>]*>/g, '').trim();
                if (val.length > 1 && !val.includes('{') && !val.includes('img') && val.length < 100) return val;
            }
        }
        return null;
    };

    // Fallbacks
    if (!data.title) {
        const tMatch = html.match(/<h1[^>]*data-automation="vehicle-title"[^>]*>([\s\S]*?)<\/h1>/i);
        data.title = tMatch ? tMatch[1].replace(/<[^>]*>/g, '').trim() : 'Vehículo IAAI';
    }
    if (!data.year) data.year = data.title.match(/\b(19|20)\d{2}\b/)?.[0];

    if (!data.price) {
        const buyNow = html.match(/buy-now-price">\$?([\d,]+)/i);
        if (buyNow) data.price = `$${buyNow[1]}`;
        else {
            const auctionMatch = html.match(/\$(\d{1,3}(,\d{3})*(\.\d+)?)/g);
            if (auctionMatch) {
                const prices = auctionMatch.map(p => parseInt(p.replace(/[$,]/g, ''))).filter(p => p > 500);
                if (prices.length) data.price = `$${Math.max(...prices).toLocaleString()}`;
            }
        }
    }

    data.km = data.km || getSpec('Odometer');
    data.engine = data.engine || getSpec('Engine');
    data.transmission = data.transmission || getSpec('Transmission');
    data.bodyType = data.bodyType || getSpec('Body Style') || getSpec('Body') || 'suv';
    data.fuel = data.fuel || getSpec('Fuel Type') || 'Gasolina';

    if (!data.images.length) {
        const imgReg = /https?:\/\/(vis|images|an-cdn)\.iaai\.com\/inventory\/[^"']*?(1024|800)[^"']*/gi;
        const matches = html.match(imgReg);
        if (matches) data.images = [...new Set(matches)];
    }

    data.description = `Importado vía subasta IAAI. Daño: ${getSpec('Primary Damage') || 'Ver fotos'} · Odómetro: ${data.km || 'No especificado'}`;
    return data;
}

function parseCopart(html, url) {
    const data = { images: [] };
    const getSpec = (label) => {
        const reg = new RegExp(`data-qa="${label}"[^>]*>([^<]+)`, 'i');
        const m = html.match(reg);
        return m ? m[1].trim() : null;
    };

    const titleMatch = html.match(/<h1[^>]*data-qa="lot-title"[^>]*>([\s\S]*?)<\/h1>/i);
    data.title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Vehículo Copart';
    data.year = data.title.match(/\d{4}/)?.[0];
    data.price = getSpec('buy-now-price') || getSpec('current-bid') || "Consultar";
    data.km = getSpec('odometer-reading');
    data.engine = getSpec('engine-type');
    data.transmission = getSpec('transmission-type');
    data.fuel = getSpec('fuel-type');
    data.bodyType = (getSpec('body-style') || '').toLowerCase();

    const imgReg = /https?:\/\/[^"']+\.copart\.com\/[^"']+\d+_(?:f|b|s|i|d|l)\.jpg/gi;
    const matches = html.match(imgReg);
    if (matches) data.images = [...new Set(matches)].map(img => img.replace(/_[a-z]\.jpg/i, '_full.jpg'));

    data.description = `Importado vía subasta Copart. Daño: ${getSpec('damage-description') || 'Ver fotos'}`;
    return data;
}

function parseGeneric(html, url) {
    const data = { images: [] };
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    data.title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Vehículo';
    const ogImg = html.match(/meta property="og:image" content="([^"]+)"/);
    if (ogImg) data.images.push(ogImg[1]);
    return data;
}
