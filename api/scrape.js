/**
 * Vercel Serverless Function: Scraping API for car auctions
 * Targets: Copart, IAAI
 */

export default async function handler(req, res) {
    // IMAGE PROXY MODE
    if (req.method === 'GET' && req.query.proxy) {
        try {
            const target = decodeURIComponent(req.query.proxy);
            const key = req.query.key;
            const isAuctionAsset = target.includes('iaai.com') || target.includes('copart.com');

            let response;
            try {
                // Try direct fetch first (faster, no cost)
                response = await fetch(target, { headers: { 'Referer': 'https://www.google.com' } });
                if (!response.ok) throw new Error('Direct blocked');
            } catch (e) {
                // Fallback to ScraperAPI if direct is blocked and we have a key
                if (key) {
                    response = await fetch(`https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(target)}&render=false`);
                } else {
                    throw e;
                }
            }

            const blob = await response.blob();
            const buffer = Buffer.from(await blob.arrayBuffer());
            res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
            return res.send(buffer);
        } catch (e) {
            return res.status(500).send('Proxy error');
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { url, html, proxyKey } = req.body;
    if (!url) return res.status(400).json({ message: 'Target URL is required' });

    try {
        let content = html;

        // If HTML not provided, try to fetch it
        if (!content) {
            let fetchUrl = url;
            let fetchOptions = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/121.0.0.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
                }
            };

            if (proxyKey) {
                // For auction sites (Copart/IAAI), JavaScript Rendering and US proxies are often required to bypass PerimeterX/Incapsula
                const isAuction = url.includes('copart') || url.includes('iaai');
                const renderParam = isAuction ? 'true' : 'false';
                fetchUrl = `https://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(url)}&render=${renderParam}&country_code=us`;
                console.log("Using Proxy Fetch:", fetchUrl);
            }

            const response = await fetch(fetchUrl, fetchOptions);
            content = await response.text();

            // Detect bot protection - but only if we truly didn't get useful data
            const isBlocked = content.includes('px-captcha') || content.includes('cloudflare-static') || content.includes('distil-captcha') || (content.includes('/_Incapsula_Resource') && content.length < 5000);

            if (isBlocked) {
                console.warn("Bot protection detected on", url);
                // If we have a proxy key and still blocked, maybe suggest residential proxies or account upgrade
                return res.status(200).json({
                    success: false,
                    message: 'Bloqueo detectado. ScraperAPI no pudo saltar la protección. Prueba el Bookmarklet (opción infalible).',
                    blocked: true
                });
            }
        }

        const site = url.includes('copart.com') ? 'copart' : url.includes('iaai.com') ? 'iaai' : 'generic';
        const data = site === 'copart' ? parseCopart(content, url) : site === 'iaai' ? parseIAAI(content, url) : parseGeneric(content, url);

        // Final validation - require at least a title to be considered success
        const hasRealTitle = data.title && data.title !== 'Vehículo Importado' && data.title.length > 5;
        const hasRealPrice = data.price && data.price !== 'Consultar' && data.price !== '$0';

        return res.status(200).json({
            success: !!(hasRealTitle && (hasRealPrice || data.images?.length > 0)),
            data,
            site
        });

    } catch (error) {
        console.error('Scrape Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

function parseCopart(html, url = "") {
    const data = { images: [] };

    // Try to find JSON metadata
    const jsonMatch = html.match(/var\s+data\s*=\s*({[\s\S]*?});/i) || html.match(/window\._b\s*=\s*({[\s\S]*?});/i);
    let jsonData = null;
    if (jsonMatch) {
        try { jsonData = JSON.parse(jsonMatch[1]); } catch (e) { /* ignore */ }
    }

    // Title / Year
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/class="lot-title"[\s\S]*?>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/Lot #\d+/i, '').replace(/[\r\n\t]+/g, ' ').replace(/<[^>]*>/g, '').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    const getSpec = (label) => {
        const patterns = [
            new RegExp(`${label}[\\s\\S]{0,120}?>[\\s\\S]*?([^<]{2,})<`, 'i'),
            new RegExp(`${label}[\\s\\S]{0,100}?:\\s*([^<\\r\\n]{2,})`, 'i'),
            new RegExp(`data-qa="${label}"[^>]*>([^<]+)`, 'i')
        ];
        for (const reg of patterns) {
            const match = html.match(reg);
            if (match && match[1]) return match[1].trim().replace(/^[:\s-]+/, '').trim();
        }
        return null;
    };

    data.km = getSpec('Odometer') || getSpec('Kilometraje') || getSpec('Mileage');
    data.engine = getSpec('Engine type') || getSpec('Engine') || getSpec('Motor');
    data.transmission = getSpec('Transmission') || getSpec('Transmisión');
    data.fuel = getSpec('Fuel') || getSpec('Combustible');
    data.bodyType = (getSpec('Body Style') || getSpec('Carrocería') || '').toLowerCase();

    // Price
    const priceMatch = html.match(/current-bid[^>]*>[\s]*\$?([\d,]+)/i) ||
        html.match(/"currentBid":([\d.]+)/) ||
        html.match(/item-value">\$([\d,]+)/i) ||
        html.match(/id="bid-amount">\$([\d,]+)/i) ||
        html.match(/\$([\d,]{3,7})\.00/);

    if (priceMatch) {
        data.price = '$' + priceMatch[1].replace(/,/g, '');
    } else if (jsonData?.lotDetails?.currentBid) {
        data.price = '$' + jsonData.lotDetails.currentBid;
    }

    if (!data.price || data.price === "$0") data.price = "Consultar";

    // Images
    const imgRegexes = [/"fullUrl":"([^"]+)"/g, /"highResUrl":"([^"]+)"/g, /https:\/\/static\.copart\.com\/[^"']+\.JPG/gi];
    imgRegexes.forEach(reg => {
        let m;
        while ((m = reg.exec(html)) !== null) {
            const src = (Array.isArray(m) ? m[m.length - 1] : m).replace(/\\/g, '');
            if (src.includes('.jpg') || src.includes('.JPG')) {
                if (!data.images.includes(src)) data.images.push(src);
            }
        }
    });

    const lotIdFromUrl = url.match(/lot\/(\d+)/i);
    if (lotIdFromUrl && data.images.length < 5) {
        for (let i = 1; i <= 10; i++) data.images.push(`https://static.copart.com/content/resp/lotImages/full/${lotIdFromUrl[1]}_${i}.JPG`);
    }

    data.images = [...new Set(data.images)].filter(s => s.startsWith('http') && !s.includes('logo')).slice(0, 15);

    // Description
    let desc = `Importado vía subasta Copart.`;
    const damage = getSpec('Damage') || getSpec('Primary Damage');
    if (damage) desc += ` Daño: ${damage}.`;
    if (data.engine) desc += ` Motor: ${data.engine}.`;
    if (data.transmission) desc += ` Transmisión: ${data.transmission}.`;
    if (data.km) desc += ` Odometer: ${data.km}.`;
    data.description = desc;
    return data;
}

function parseIAAI(html, url = "") {
    const data = { images: [] };

    // Title / Year
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/class="vehicle-title"[\s\S]*?>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/[\r\n\t]+/g, ' ').replace(/Stock\s*#.*/i, '').replace(/<[^>]*>/g, '').replace(/\|\s*IAAI/i, '').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    const getSpec = (label) => {
        const patterns = [
            new RegExp(`${label}[\\s\\S]{0,150}?>[\\s\\S]*?([^<]{2,})<`, 'i'),
            new RegExp(`${label}[\\s\\S]{0,100}?:\\s*([^<\\r\\n]{2,})`, 'i'),
            new RegExp(`data-automation="${label}"[^>]*>([^<]+)`, 'i')
        ];
        for (const reg of patterns) {
            const match = html.match(reg);
            if (match && match[1]) return match[1].trim().replace(/^[:\s-]+/, '').replace(/\([^)]*\)/g, '').trim();
        }
        return null;
    };

    // Specs
    data.km = getSpec('Odometer') || getSpec('Mileage');
    data.engine = getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel Type') || getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || getSpec('Body') || '').toLowerCase();

    // Price - search for ANY dollar amount that looks like a car price (> $500)
    const pricePatterns = [
        /data-automation="current-bid-amount"[^>]*>\$?([\d,]+)(\.?\d+)?/i,
        /data-automation="bid-amount"[^>]*>\$?([\d,]+)(\.?\d+)?/i,
        /data-qa="current-bid"[^>]*>\$?([\d,]+)(\.?\d+)?/i,
        /bid-amount[^>]*>\$?([\d,]+)(\.?\d+)?/i,
        /current-bid[^>]*>\$?([\d,]+)(\.?\d+)?/i,
        /item-value">\$?([\d,]+)(\.?\d+)?/i,
        /<span>\$([\d,]+)<\/span>/i,
        /\$([\d,]{4,6})/ // Broad fallback for $X,XXX or $XX,XXX
    ];
    for (const reg of pricePatterns) {
        const m = html.match(reg);
        if (m && m[1]) {
            const p = m[1].replace(/,/g, '');
            const val = parseInt(p);
            if (val > 500 && val < 500000) {
                data.price = '$' + p;
                break;
            }
        }
    }
    if (!data.price || data.price === "$0") data.price = "Consultar";

    // Images - discover actual high res links or JSON state
    const lotIdMatch = html.match(/Lot\s*#\s*:?\s*(\d{8})/i) || html.match(/Stock\s*#\s*:?\s*(\d{8})/i) || html.match(/stockNumber\s*:\s*"(\d{8})"/);
    const lotId = lotIdMatch ? lotIdMatch[1] : (url.match(/(\d{8})/)?.[1] || null);

    // Deep scan for high-res auction links
    const imgReg = /https?:\/\/(vis|images|an-cdn)\.iaai\.com\/[^"']+\d+\/(800|1024)[^"']*/gi;
    let imgM;
    while ((imgM = imgReg.exec(html)) !== null) {
        if (!data.images.includes(imgM[0])) data.images.push(imgM[0]);
    }

    // Try to find image list in JSON state
    const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/);
    if (stateMatch) {
        try {
            const state = JSON.parse(stateMatch[1]);
            const imgSet = state?.vehicleDetails?.imageSet || [];
            imgSet.forEach(img => {
                if (img.url && !data.images.includes(img.url)) data.images.push(img.url);
            });
        } catch (e) { }
    }

    if (lotId && data.images.length < 3) {
        const paths = [`images.iaai.com/inventory/${lotId}`, `an-cdn.iaai.com/inventory/${lotId}`, `vis.iaai.com/mavp/Lot/${lotId}`];
        for (const path of paths) {
            for (let i = 1; i <= 8; i++) {
                data.images.push(`https://${path}/${i}/1024`);
            }
        }
    }

    data.images = [...new Set(data.images)].filter(s => s.startsWith('http') && !s.includes('iaai-logo')).slice(0, 15);

    // Description
    let desc = `Importado vía subasta IAAI.`;
    const damage = getSpec('Primary Damage') || getSpec('Damage');
    if (damage) desc += ` Daño: ${damage}.`;
    if (data.engine) desc += ` Motor: ${data.engine}.`;
    if (data.transmission) desc += ` Transmisión: ${data.transmission}.`;
    if (data.km) desc += ` Odometer: ${data.km}.`;
    data.description = desc;
    return data;
}

function parseGeneric(html, url) {
    const data = { images: [] };
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    data.title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Vehículo Importado';

    // OG Image
    const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImg) data.images.push(ogImg[1]);

    // Try to find any car-looking image
    const imgs = html.match(/https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)/gi);
    if (imgs) {
        imgs.slice(0, 10).forEach(src => {
            if (!data.images.includes(src)) data.images.push(src);
        });
    }

    return data;
}
