/**
 * Vercel Serverless Function: Scraping API for car auctions
 * Targets: Copart, IAAI
 */

export default async function handler(req, res) {
    // IMAGE PROXY MODE
    if (req.method === 'GET' && req.query.proxy) {
        try {
            const target = decodeURIComponent(req.query.proxy);
            const response = await fetch(target);
            const blob = await response.blob();
            const buffer = Buffer.from(await blob.arrayBuffer());
            res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(buffer);
        } catch (e) {
            return res.status(500).send('Proxy error');
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { url, html } = req.body;
    if (!url) return res.status(400).json({ message: 'Target URL is required' });

    try {
        let content = html;

        // If HTML not provided, try to fetch it
        if (!content) {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
                }
            });
            content = await response.text();
        }

        const site = url.includes('copart.com') ? 'copart' : url.includes('iaai.com') ? 'iaai' : 'generic';
        const data = site === 'copart' ? parseCopart(content) : site === 'iaai' ? parseIAAI(content) : parseGeneric(content, url);

        return res.status(200).json({
            success: !!(data.title || data.images?.length),
            data,
            site
        });

    } catch (error) {
        console.error('Scrape Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

function parseCopart(html) {
    const data = { images: [] };

    // Title / Year
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/Lot #\d+/i, '').replace(/[\r\n\t]+/g, ' ').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    // Specs - Using more robust patterns (handles data-uname and labels)
    const getSpec = (label) => {
        const regex = new RegExp(`${label}[\\s\\S]{0,150}?>[\\s\\S]*?([^<]{2,})<`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim().replace(/^[:\s-]+/, '') : null;
    };

    data.km = getSpec('Odometer');
    data.engine = getSpec('Engine type') || getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel');

    const bodyMatch = getSpec('Body Style') || getSpec('Body Style :');
    data.bodyType = bodyMatch ? bodyMatch.toLowerCase() : null;

    // Price
    const priceMatch = html.match(/current-bid[^>]*>[\s]*\$?([\d,]+)/i) || html.match(/"currentBid":([\d.]+)/);
    if (priceMatch) data.price = '$' + priceMatch[1].replace(/,/g, '');

    // Images
    const imgRegexes = [
        /"fullUrl":"([^"]+)"/g,
        /"highResUrl":"([^"]+)"/g,
        /https:\/\/static\.copart\.com\/[^"']+-X\.JPG/g,
        /https:\/\/cs\.copart\.com\/v1\/[^"']+\.jpg/g
    ];

    imgRegexes.forEach(reg => {
        let m;
        while ((m = reg.exec(html)) !== null) {
            const url = Array.isArray(m) ? m[m.length - 1] : m;
            if (!data.images.includes(url) && url.includes('.jpg')) data.images.push(url);
        }
    });

    data.images = [...new Set(data.images)].slice(0, 15);
    data.description = "Importado vía subasta Copart. " + (getSpec('Damage') ? `Daño: ${getSpec('Damage')}. ` : "");

    return data;
}

function parseIAAI(html) {
    const data = { images: [] };

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    const getSpec = (label) => {
        const regex = new RegExp(`${label}[\\s\\S]{0,100}?>[\\s\\S]*?([^<]{2,})<`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim().replace(/^[:\s-]+/, '') : null;
    };

    data.km = getSpec('Odometer');
    data.engine = getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || '').toLowerCase();

    const imgRegex = /https:\/\/vis\.iaai\.com\/[^"'\s]+Width=800/g;
    data.images = [...new Set(html.match(imgRegex) || [])].slice(0, 15);
    data.description = "Importado vía subasta IAAI.";

    return data;
}

function parseGeneric(html, url) {
    const data = { images: [] };
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    data.title = titleMatch ? titleMatch[1].trim() : 'Vehículo Importado';
    const imgRegex = /<meta property="og:image" content="([^"]+)"/i;
    const imgMatch = html.match(imgRegex);
    if (imgMatch) data.images.push(imgMatch[1]);
    return data;
}
