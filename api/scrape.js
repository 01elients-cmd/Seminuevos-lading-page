/**
 * Vercel Serverless Function: Scraping API for car auctions
 * Targets: Copart, IAAI
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { url, html } = req.body;
    if (!url) return res.status(400).json({ message: 'Target URL is required' });

    try {
        let content = html;

        // If HTML not provided, try to fetch it (often blocked by protected sites)
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
    // Usually: 2023 TOYOTA TACOMA ...
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/Lot #\d+/i, '').replace(/[\r\n\t]+/g, ' ').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    // Specs
    const getSpec = (label) => {
        const regex = new RegExp(label + ':[^>]*>([^<]+)', 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    };

    data.km = getSpec('Odometer') || getSpec('KM');
    data.engine = getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || '').toLowerCase();

    // Price (Bid)
    const priceMatch = html.match(/"currentBid":([\d.]+)/) || html.match(/\$([\d,]+)/);
    if (priceMatch) data.price = priceMatch[1].startsWith('$') ? priceMatch[0] : '$' + priceMatch[1];

    // Images
    // Copart images are often listed in a script or in highResUrl
    const imgRegex = /"fullUrl":"([^"]+)"/g;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
        if (!data.images.includes(match[1])) data.images.push(match[1]);
    }

    // Fallback images from traditional img tags if script parsing fails
    if (data.images.length === 0) {
        const thumbRegex = /https:\/\/static\.copart\.com\/[^"]+-X\.JPG/g;
        const thumbs = html.match(thumbRegex) || [];
        data.images = [...new Set(thumbs)];
    }

    // Description
    data.description = "Importado vía subasta Copart. " + (getSpec('Damage') ? `Daño: ${getSpec('Damage')}. ` : "");

    return data;
}

function parseIAAI(html) {
    const data = { images: [] };

    // Title
    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (titleMatch) {
        data.title = titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim();
        const yearMatch = data.title.match(/\d{4}/);
        if (yearMatch) data.year = yearMatch[0];
    }

    // Specs
    const getSpec = (label) => {
        const regex = new RegExp(label + '[^<]*<\/span>[^<]*<span[^>]*>([^<]+)', 'i');
        const match = html.match(regex);
        return match ? match[1].trim() : null;
    };

    data.km = getSpec('Odometer');
    data.engine = getSpec('Engine');
    data.transmission = getSpec('Transmission');
    data.fuel = getSpec('Fuel');
    data.bodyType = (getSpec('Body Style') || '').toLowerCase();

    // Images
    const imgRegex = /https:\/\/vis\.iaai\.com\/[^"'\s]+Width=800/g;
    data.images = html.match(imgRegex) || [];

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
