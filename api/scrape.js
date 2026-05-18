import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

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
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(5000)
                });
                if (!response.ok) throw new Error('Direct failed');
            } catch (e) {
                if (key) {
                    const agent = new HttpsProxyAgent(`http://auto:${key}@proxy.apify.com:8000`);
                    response = await fetch(target, { agent, signal: AbortSignal.timeout(10000) });
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
            const isIAAI = url.includes('iaai.com');
            const isCopart = url.includes('copart.com');
            
            if (providedKey) {
                // Detection for common blocks
                const isBlocked = (t) => 
                    !t ||
                    t.includes('Pardon Our Interruption') || 
                    t.includes('Incapsula') || 
                    t.includes('Imperva') || 
                    t.includes('Additional security check') ||
                    t.includes('captcha') ||
                    t.includes('Access Denied') ||
                    t.includes('Reference #') ||
                    t.includes('distil') ||
                    t.length < 500;

                let text = '';
                let success = false;
                
                // Prioritize residential proxies for IAAI due to aggressive Imperva blocking
                const useResidential = isIAAI;
                
                for (let i = 0; i < 3; i++) {
                    const session = Math.random().toString(36).substring(2, 12);
                    
                    let proxyUser = 'auto';
                    if (useResidential || i === 2) {
                        proxyUser = 'groups-RESIDENTIAL';
                    }
                    
                    const proxyUrl = `http://${proxyUser},session-${session}:${providedKey}@proxy.apify.com:8000`;
                    const agent = new HttpsProxyAgent(proxyUrl);
                    
                    try {
                        const r = await fetch(url, {
                            agent,
                            headers: { 
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                                'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
                                'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                                'Sec-Ch-Ua-Mobile': '?0',
                                'Sec-Ch-Ua-Platform': '"Windows"',
                                'Sec-Fetch-Dest': 'document',
                                'Sec-Fetch-Mode': 'navigate',
                                'Sec-Fetch-Site': 'none',
                                'Sec-Fetch-User': '?1',
                                'Upgrade-Insecure-Requests': '1',
                                'Cache-Control': 'max-age=0'
                            },
                            signal: AbortSignal.timeout(15000)
                        });
                        text = await r.text();
                        if (!isBlocked(text)) {
                            success = true;
                            break;
                        }
                        console.log(`Intento ${i+1} bloqueado por el sitio.`);
                    } catch (err) {
                        console.log(`Intento ${i+1} falló:`, err.message);
                    }
                }
                
                return text;
            } else {
                const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
                return await r.text();
            }
        })();

        if (!html) throw new Error('Cargando página vacía. Verifica el link o proxy.');
        if (html.includes('Proxy Authentication Required')) throw new Error('Contraseña del Proxy de Apify inválida o sin permisos.');
        if (html.includes('ran out of credits') || html.includes('usage limit')) throw new Error('Te has quedado sin uso disponible en Apify o límite excedido.');

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
    const year = getVal('Year') || getVal('lcy') || getVal('modelYear') || getVal('vehicleYear');
    if (year && !data.year) data.year = String(year);
    
    const make = getVal('Make') || getVal('mkn') || getVal('brand') || getVal('makeName');
    if (make && !data.make) data.make = String(make);
    
    const model = getVal('Model') || getVal('lm') || getVal('modelName');
    if (model && !data.model) data.model = String(model);
    
    const series = getVal('Series') || getVal('srs') || getVal('trim') || getVal('seriesName');
    if (series && !data.series) data.series = String(series);
    
    const vin = getVal('VIN') || getVal('fv') || getVal('vin') || getVal('vinNumber');
    if (vin && !data.vin) data.vin = String(vin);
    
    const odo = getVal('ODOValue') || getVal('orr') || getVal('odometer') || getVal('mileage') || getVal('odometerReading');
    if (odo && !data.km) {
        const uom = getVal('ODOUoM') || getVal('uom') || getVal('mileageUnit') || '';
        data.km = `${odo} ${uom}`.trim();
        if (!uom && String(odo).length > 3) data.km += " mi";
    }
    
    const engine = getVal('EngineSize') || getVal('egn') || getVal('engine') || getVal('engineDescription') || getVal('motor');
    if (engine && !data.engine) data.engine = String(engine);
    
    const trans = getVal('Transmission') || getVal('tsmn') || getVal('transmission') || getVal('transmissionType');
    if (trans && !data.transmission) data.transmission = String(trans);

    const body = getVal('BodyStyle') || getVal('bs') || getVal('bodyType') || getVal('bodyStyle') || getVal('body');
    if (body && !data.bodyType) data.bodyType = String(body);

    const fuel = getVal('FuelType') || getVal('ft') || getVal('fuelType');
    if (fuel && !data.fuel) data.fuel = String(fuel);

    const color = getVal('Color') || getVal('clr') || getVal('exteriorColor');
    if (color && !data.color) data.color = String(color);

    const location = getVal('Location') || getVal('loc') || getVal('saleLocation') || getVal('branchName');
    if (location && !data.location) data.location = String(location);
    
    // Price Logic: Prefer Buy It Now, then Current Bid
    const bnp = getVal('buyNowPrice') || getVal('bnp') || getVal('buyItNowPrice');
    const bid = getVal('highBidAmount') || getVal('curm') || getVal('currentBid') || getVal('currentBidAmount');
    
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
    const isBlocked = html.includes('Additional security check') || 
                      html.includes('captcha') || 
                      html.includes('Imperva') || 
                      html.includes('Incapsula') || 
                      html.includes('Pardon Our Interruption') ||
                      html.includes('Access Denied') ||
                      html.includes('Reference #') ||
                      html.includes('distil') ||
                      html.length < 500;

    if (isBlocked) {
        throw new Error('IAAI Bloqueado. Usa Modo Manual (pega el HTML) o verifica si tu Proxy tiene créditos/antibot activado.');
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

    // Support Next.js data (IAAI new layout)
    const nextDataStr = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i)?.[1];
    if (nextDataStr) {
        try {
            const nextData = JSON.parse(nextDataStr);
            rawData = scanForData(nextData, rawData);
        } catch (e) {
            console.error("IAAI NEXT_DATA Parse Error");
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

    // Extract images with a very broad regex to catch all possible IAAI image variations
    const imgMatches = html.match(/https?:\/\/(?:vis|images|an-cdn)\.iaai\.com\/(?:inventory|resizer)[^"'\\]*/gi) || [];
    const cleanImages = [...new Set(imgMatches)]
        .map(img => {
            img = img.replace(/\\u0026/g, '&');
            if (img.includes('resizer')) {
                return img.replace(/width=\d+/, 'width=1024').replace(/height=\d+/, 'height=768');
            } else {
                if (img.includes('width=')) return img.split('width=')[0] + 'width=1024';
                return img.replace(/\/\d+$/, '/1024');
            }
        });

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''} ${rawData.series || ''}`.trim().replace(/\s+/g, ' '),
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
            // Improved title split using more separators
            const titleParts = cleanTitle.split(/[\s-]+/).filter(Boolean);
            if (titleParts.length >= 2) {
                if (!rawData.year && titleParts[0].match(/\b(19|20)\d{2}\b/)) {
                    rawData.year = titleParts[0];
                    rawData.make = titleParts[1];
                    rawData.model = titleParts.slice(2).join(' ');
                } else if (!rawData.make) {
                    rawData.make = titleParts[0];
                    rawData.model = titleParts.slice(1).join(' ');
                }
            }
        }
    }

    if (!rawData.year || !rawData.make) throw new Error('Datos no encontrados en Copart. Usa Modo Manual.');

    // Image fallback using regex if JSON images failed
    if (!rawData.images || rawData.images.length === 0) {
        const imgReg = /https?:\/\/[^"']+\.copart\.com\/[^"']+\d+_[a-z]\.jpg/gi;
        const matches = html.match(imgReg);
        rawData.images = [...new Set(matches || [])].map(img => img.replace(/_[a-z]\.jpg/i, '_full.jpg'));
    }

    return {
        title: `${rawData.year} ${rawData.make} ${rawData.model || ''}`.trim().replace(/\s+/g, ' '),
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
