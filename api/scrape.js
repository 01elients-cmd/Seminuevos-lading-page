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
        if (html.includes('Unauthorized request')) throw new Error('Scraper API Proxy Key inválida o sin créditos.');
        if (html.includes('concurrent limit') || html.includes('ran out of credits')) throw new Error('Te has quedado sin créditos en ScraperAPI o límite excedido.');

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
 * Unified Scanner - Now case-insensitive and more robust
 */
function scanForData(obj, data = {}) {
    if (!obj || typeof obj !== 'object') return data;

    const keys = Object.keys(obj);
    const getVal = (k) => {
        const found = keys.find(key => key.toLowerCase() === k.toLowerCase());
        return found ? obj[found] : null;
    };

    // Mapping fields
    const year = getVal('Year') || getVal('lcy') || getVal('modelYear');
    if (year && !data.year) data.year = String(year);
    
    const make = getVal('Make') || getVal('mkn') || getVal('brand');
    if (make && !data.make) data.make = String(make);
    
    const model = getVal('Model') || getVal('lm') || getVal('modelName');
    if (model && !data.model) data.model = String(model);
    
    const series = getVal('Series') || getVal('srs') || getVal('trim');
    if (series && !data.series) data.series = String(series);
    
    const vin = getVal('VIN') || getVal('fv') || getVal('vin') || getVal('vinNumber');
    if (vin && !data.vin) data.vin = String(vin);
    
    const odo = getVal('ODOValue') || getVal('orr') || getVal('odometer') || getVal('mileage');
    if (odo && !data.km) {
        const uom = getVal('ODOUoM') || getVal('uom') || getVal('mileageUnit') || '';
        data.km = `${odo} ${uom}`.trim();
        if (!uom && String(odo).length > 3) data.km += " mi";
    }
    
    const engine = getVal('EngineSize') || getVal('egn') || getVal('engine') || getVal('engineDescription');
    if (engine && !data.engine) data.engine = String(engine);
    
    const trans = getVal('Transmission') || getVal('tsmn') || getVal('transmission') || getVal('transmissionType');
    if (trans && !data.transmission) data.transmission = String(trans);

    const body = getVal('BodyStyle') || getVal('bs') || getVal('bodyType') || getVal('bodyStyle');
    if (body && !data.bodyType) data.bodyType = String(body);

    const fuel = getVal('FuelType') || getVal('ft') || getVal('fuelType');
    if (fuel && !data.fuel) data.fuel = String(fuel);

    const color = getVal('Color') || getVal('clr') || getVal('exteriorColor');
    if (color && !data.color) data.color = String(color);

    const location = getVal('Location') || getVal('loc') || getVal('saleLocation');
    if (location && !data.location) data.location = String(location);
    
    // Price Logic: Prefer Buy It Now, then Current Bid
    const bnp = getVal('buyNowPrice') || getVal('bnp') || getVal('buyItNowPrice');
    const bid = getVal('highBidAmount') || getVal('curm') || getVal('currentBid');
    
    if (bnp) {
        data.price = `$${parseInt(bnp).toLocaleString()}`;
        data.isBuyNow = true;
    } else if (bid && !data.price) {
        data.price = `$${parseInt(bid).toLocaleString()}`;
        data.isBuyNow = false;
    }

    // Recursive search
    for (let k in obj) {
        if (obj[k] && typeof obj[k] === 'object' && k !== 'ancestors' && k !== 'images') {
            scanForData(obj[k], data);
        }
    }
    return data;
}

function parseIAAI(html, url) {
    if (html.includes('Additional security check') || html.includes('captcha') || html.includes('Imperva') || html.includes('Incapsula')) {
        throw new Error('IAAI Bloqueado. Usa Modo Manual.');
    }

    // Improved regex for __PRELOADED_STATE__
    const stateStr = html.match(/(?:window\.)?__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})(?:[;<\n]|$)/i)?.[1];
    let rawData = {};
    if (stateStr) { 
        try { 
            rawData = scanForData(JSON.parse(stateStr)); 
        } catch (e) { 
            console.error("IAAI JSON Parse Error");
        } 
    }

    // Text Fallback if JSON fails
    if (!rawData.year || !rawData.make) {
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        const titleTag = (titleMatch?.[1] || "").toUpperCase();
        const h1Tag = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").toUpperCase();
        const combined = titleTag + " " + h1Tag;

        const yearMatch = combined.match(/\b(20\d{2}|19\d{2})\b/);
        if (yearMatch) rawData.year = yearMatch[0];

        if (titleMatch) {
            let cleanTitle = titleMatch[1].split(/\||Insurance Auto Auctions|IAAI/i)[0].trim().replace(/\s+/g, ' ');
            const titleParts = cleanTitle.split(' ');
            if (titleParts.length >= 2) {
                if (!rawData.year && titleParts[0].match(/\b(19|20)\d{2}\b/)) rawData.year = titleParts[0];
                if (!rawData.make) rawData.make = titleParts[1].toUpperCase();
                if (!rawData.model) rawData.model = titleParts.slice(2).join(' ').toUpperCase();
            }
        }

        const commonMakes = ['TOYOTA', 'FORD', 'CHEVROLET', 'CHEVY', 'HONDA', 'NISSAN', 'HYUNDAI', 'KIA', 'BMW', 'MERCEDES', 'JEEP', 'DODGE', 'RAM', 'LEXUS', 'MAZDA', 'VOLKSWAGEN', 'VW', 'AUDI', 'SUBARU', 'GMC', 'BUICK', 'CADILLAC', 'CHRYSLER', 'MITSUBISHI', 'LAND ROVER', 'PORSCHE', 'TESLA', 'VOLVO', 'MINI', 'FIAT', 'ALFA ROMEO', 'ACURA', 'INFINITI', 'LINCOLN', 'JAGUAR'];
        if (!rawData.make) {
            for (const m of commonMakes) {
                if (combined.includes(m)) {
                    rawData.make = m;
                    break;
                }
            }
        }
        
        // Final fallback to avoid crashing batch import
        if (!rawData.year) rawData.year = new Date().getFullYear();
        if (!rawData.make && titleTag.length > 5) {
            // Just use the first big word as make
            const words = titleTag.split(' ').filter(w => w.length > 2 && !w.match(/\d/));
            if (words.length > 0) rawData.make = words[0];
        }
    }

    if (!rawData.year || !rawData.make) throw new Error('Datos no encontrados en IAAI. Usa Modo Manual o verifica si IAAI está bloqueando el bot (Pardon Our Interruption).');

    // Extract images with a broader regex to catch all IAAI variations
    const imgMatches = html.match(/https?:\/\/(?:vis|images|an-cdn)\.iaai\.com\/inventory\/[^"']*?(?:width=\d+|[0-9]{3,4}x[0-9]{3,4}|[0-9]{3,4})/gi) || [];
    const cleanImages = [...new Set(imgMatches)].map(img => {
        // Ensure high resolution
        if (img.includes('width=')) return img.split('width=')[0] + 'width=1024';
        return img;
    });

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''} ${rawData.series || ''}`.trim(),
        year: rawData.year,
        price: rawData.price || "Consultar",
        km: rawData.km || "0 KM",
        engine: rawData.engine || "N/A",
        transmission: rawData.transmission || "N/A",
        bodyType: rawData.bodyType || "N/A",
        fuel: rawData.fuel || "N/A",
        vin: rawData.vin || "N/A",
        images: cleanImages,
        description: `Importado vía subasta IAAI. VIN: ${rawData.vin || 'N/A'}. Color: ${rawData.color || 'N/A'}. Ubicación: ${rawData.location || 'USA'}.`
    };
}

function parseCopart(html, url) {
    if (html.includes('Additional security check') || html.includes('captcha') || html.includes('Imperva') || html.includes('Incapsula')) {
        throw new Error('Copart Bloqueado. Usa Modo Manual.');
    }

    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    let rawData = {};
    for (const s of scripts) {
        if (s.includes('lcy') || s.includes('mkn') || s.includes('lotDetails')) {
            const m = s.match(/\{"[a-z0-9]+"[\s\S]*?\}/g);
            if (m) { 
                for (const j of m) { 
                    try { 
                        const obj = JSON.parse(j);
                        scanForData(obj, rawData); 
                        // Specific image list extraction for Copart
                        if (obj.imagesList && obj.imagesList.fullImages) {
                            if (!rawData.images) rawData.images = [];
                            obj.imagesList.fullImages.forEach(img => {
                                if (img.url) rawData.images.push(img.url);
                            });
                        }
                    } catch (e) { } 
                } 
            }
        }
    }

    // Text Fallback
    if (!rawData.year || !rawData.make) {
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        const titleTag = (titleMatch?.[1] || "").toUpperCase();
        
        const yearMatch = titleTag.match(/\b(20\d{2}|19\d{2})\b/);
        if (yearMatch) rawData.year = yearMatch[0];
        
        if (titleMatch) {
            let cleanTitle = titleMatch[1].split(/\||Copart/i)[0].trim().replace(/\s+/g, ' ');
            const titleParts = cleanTitle.split(' ');
            if (titleParts.length >= 2) {
                if (!rawData.year && titleParts[0].match(/\b(19|20)\d{2}\b/)) rawData.year = titleParts[0];
                if (!rawData.make) rawData.make = titleParts[1].toUpperCase();
                if (!rawData.model) rawData.model = titleParts.slice(2).join(' ').toUpperCase();
            }
        }

        const commonMakes = ['TOYOTA', 'FORD', 'CHEVROLET', 'HONDA', 'NISSAN', 'HYUNDAI', 'KIA', 'BMW', 'MERCEDES', 'JEEP', 'DODGE', 'RAM', 'LEXUS', 'MAZDA'];
        if (!rawData.make) {
            for (const m of commonMakes) {
                if (titleTag.includes(m)) {
                    rawData.make = m;
                    break;
                }
            }
        }
    }

    if (!rawData.year || !rawData.make) throw new Error('Datos no encontrados en Copart. Usa Modo Manual.');

    // Image fallback using regex if JSON images failed
    if (!rawData.images || rawData.images.length === 0) {
        const imgReg = /https?:\/\/[^"']+\.copart\.com\/[^"']+\d+_(?:f|b|s|i|d|l)\.jpg/gi;
        const matches = html.match(imgReg);
        rawData.images = [...new Set(matches || [])].map(img => img.replace(/_[a-z]\.jpg/i, '_full.jpg'));
    }

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''}`.trim(),
        year: rawData.year,
        price: rawData.price || "Consultar",
        km: rawData.km || "0 KM",
        engine: rawData.engine || "N/A",
        transmission: rawData.transmission || "N/A",
        bodyType: rawData.bodyType || "N/A",
        fuel: rawData.fuel || "N/A",
        vin: rawData.vin || "N/A",
        images: rawData.images || [],
        description: `Importado vía subasta Copart. VIN: ${rawData.vin || 'N/A'}. Color: ${rawData.color || 'N/A'}. Ubicación: ${rawData.location || 'USA'}.`
    };
}

function parseGeneric(html, url) {
    const result = {
        title: 'Vehículo',
        images: []
    };

    // Try LD+JSON
    const ldJsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (ldJsonMatch) {
        for (const s of ldJsonMatch) {
            try {
                const json = JSON.parse(s.replace(/<[^>]*>/g, ''));
                if (json.name) result.title = json.name;
                if (json.image) result.images = Array.isArray(json.image) ? json.image : [json.image];
                if (json.brand) result.make = typeof json.brand === 'string' ? json.brand : json.brand.name;
                // Add more if found
            } catch (e) {}
        }
    }

    if (result.title === 'Vehículo') {
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) result.title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    if (result.images.length === 0) {
        const ogImg = html.match(/meta property="og:image" content="([^"]+)"/);
        if (ogImg) result.images = [ogImg[1]];
    }

    return result;
}
