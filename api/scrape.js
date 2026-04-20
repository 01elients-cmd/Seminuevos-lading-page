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

    const { url, html, proxyKey } = req.body;
    if (!url) return res.status(400).json({ message: 'Target URL is required' });

    try {
        let content = html;

        // If HTML not provided, try to fetch it
        if (!content) {
            let fetchUrl = url;
            if (proxyKey) {
                // Use ScraperAPI as proxy if key is provided
                fetchUrl = `https://api.scraperapi.com?api_key=${proxyKey}&url=${encodeURIComponent(url)}`;
                console.log("Using Proxy Fetch:", fetchUrl);
            }

            const response = await fetch(fetchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
                }
            });
            content = await response.text();
        }

        const site = url.includes('copart.com') ? 'copart' : url.includes('iaai.com') ? 'iaai' : 'generic';
        const data = site === 'copart' ? parseCopart(content, url) : site === 'iaai' ? parseIAAI(content, url) : parseGeneric(content, url);

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

function parseCopart(html, url = "") {
    const data = { images: [] };

    // Title / Year
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/Lot #\d+/i, '').replace(/[\r\n\t]+/g, ' ').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    const getSpec = (label) => {
        const regex = new RegExp(`${label}[\\s\\S]{0,150}?>[\\s\\S]*?([^<]{2,})<`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim().replace(/^[:\s-]+/, '').trim() : null;
    };

    data.km = getSpec('Odometer');
    data.engine = getSpec('Engine type') || getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || '').toLowerCase();

    // Price
    const priceMatch = html.match(/current-bid[^>]*>[\s]*\$?([\d,]+)/i) ||
        html.match(/"currentBid":([\d.]+)/) ||
        html.match(/item-value">\$([\d,]+)/i);
    if (priceMatch) data.price = '$' + priceMatch[1].replace(/,/g, '');

    // Images discovery
    const imgRegexes = [
        /"fullUrl":"([^"]+)"/g,
        /"highResUrl":"([^"]+)"/g,
        /https:\/\/static\.copart\.com\/[^"']+\.JPG/gi,
        /https:\/\/cs\.copart\.com\/v1\/[^"']+\.jpg/gi
    ];
    imgRegexes.forEach(reg => {
        let m;
        while ((m = reg.exec(html)) !== null) {
            const src = Array.isArray(m) ? m[m.length - 1] : m;
            if (src.includes('.jpg') || src.includes('.JPG')) {
                if (!data.images.includes(src)) data.images.push(src);
            }
        }
    });

    // Lot ID from URL if possible
    const lotIdFromUrl = url.match(/lot\/(\d+)/i);
    if (lotIdFromUrl && data.images.length === 0) {
        // Construct standard Copart image pattern
        for (let i = 1; i <= 10; i++) {
            data.images.push(`https://static.copart.com/content/resp/lotImages/full/${lotIdFromUrl[1]}_${i}.JPG`);
        }
    }

    data.images = [...new Set(data.images)].slice(0, 15);

    // Detailed Description
    let desc = `Importado vía subasta Copart.`;
    if (getSpec('Damage') || getSpec('Primary Damage')) desc += ` Daño: ${getSpec('Damage') || getSpec('Primary Damage')}.`;
    if (data.engine) desc += ` Motor: ${data.engine}.`;
    if (data.transmission) desc += ` Transmisión: ${data.transmission}.`;
    if (data.km) desc += ` Odometer: ${data.km}.`;
    data.description = desc;
    return data;
}

function parseIAAI(html, url = "") {
    const data = { images: [] };

    // Title / Year
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/[\r\n\t]+/g, ' ').replace(/Stock\s*#.*/i, '').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    const getSpec = (label) => {
        const regex = new RegExp(`${label}[\\s\\S]{0,150}?>[\\s\\S]*?([^<]{2,})<`, 'i');
        const match = html.match(regex);
        return match ? match[1].trim().replace(/^[:\s-]+/, '').replace(/\([^)]*\)/g, '').trim() : null;
    };

    data.km = getSpec('Odometer') || getSpec('Mileage');
    data.engine = getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel Type') || getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || '').toLowerCase();

    // Price
    const priceMatch = html.match(/current-bid[^>]*>[\s]*\$?([\d,]+)/i) ||
        html.match(/bid-amount">\$([\d,]+)/i) ||
        html.match(/item-value">\$([\d,]+)/i);
    if (priceMatch) data.price = '$' + priceMatch[1].replace(/,/g, '');

    // Extract Lot Number from HTML or URL
    const lotIdFromUrl = url.match(/VehicleDetail\/(\d+)/i) || url.match(/~/i) ? url.split('VehicleDetail/')[1]?.split('~')[0] : null;
    const lotMatch = html.match(/Lot\s*#\s*:?\s*(\d{8})/i) || html.match(/Stock\s*#\s*:?\s*(\d{8})/i) || html.match(/stockNumber\s*:\s*"(\d+)"/);
    const lotId = lotMatch ? lotMatch[1] : (typeof lotIdFromUrl === 'string' ? lotIdFromUrl : null);

    if (lotId) {
        for (let i = 1; i <= 12; i++) {
            data.images.push(`https://vis.iaai.com/mavp/Lot/${lotId}/${i}/1024`);
        }
    }

    data.images = [...new Set(data.images)].slice(0, 15);

    // Detailed Description
    let desc = `Importado vía subasta IAAI.`;
    if (getSpec('Primary Damage')) desc += ` Daño: ${getSpec('Primary Damage')}.`;
    if (data.engine) desc += ` Motor: ${data.engine}.`;
    if (data.transmission) desc += ` Transmisión: ${data.transmission}.`;
    if (data.km) desc += ` Odometer: ${data.km}.`;
    data.description = desc;
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
