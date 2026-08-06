import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';

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
        const { url, html: providedHtml, proxyKey: providedKey, trustHtml } = req.body;
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
            result = parseCopart(html, url, trustHtml);
        } else if (url.includes('iaai.com')) {
            result = parseIAAI(html, url, trustHtml);
        } else {
            result = parseGeneric(html, url);
        }

        return res.json({ success: true, data: result });

    } catch (err) {
        console.error('Scrape Error:', err.message);
        return res.status(200).json({ success: false, message: err.message });
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
    
    const engine = getVal('engineDescription') || getVal('engineDesc') || getVal('engineType') || getVal('engine') || getVal('motor');
    if (engine && !data.engine && !/^\d+\.?\d*$/.test(String(engine).trim())) {
        data.engine = String(engine);
    }
    
    const trans = getVal('transmissionDescription') || getVal('Transmission') || getVal('tsmn') || getVal('transmission') || getVal('transmissionType');
    if (trans && !data.transmission) data.transmission = String(trans);

    const body = getVal('bodyStyleDescription') || getVal('BodyStyle') || getVal('bs') || getVal('bodyType') || getVal('bodyStyle') || getVal('body');
    if (body && !data.bodyType) data.bodyType = String(body);

    const fuel = getVal('fuelTypeDescription') || getVal('FuelType') || getVal('ft') || getVal('fuelType');
    if (fuel && !data.fuel) data.fuel = String(fuel);

    const color = getVal('Color') || getVal('clr') || getVal('exteriorColor');
    if (color && !data.color) data.color = String(color);

    const location = getVal('SellingBranch') || getVal('BranchName') || getVal('Location') || getVal('loc') || getVal('saleLocation') || getVal('branchName') || getVal('yardName');
    if (location && !data.location) data.location = String(location);

    const damage = getVal('PrimaryDamageDescription') || getVal('PrimaryDamage') || getVal('dd') || getVal('primaryDamage') || getVal('damage') || getVal('damageDescription') || getVal('lossType');
    if (damage && !data.damage) data.damage = String(damage);
    
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

function normalizeTransmission(trans) {
    if (!trans) return 'Automático';
    const s = String(trans).toLowerCase();
    if (s.includes('manual') || s.includes('mecanic') || s.includes('mecánic') || s.includes('stick') || s.includes('m/t')) return 'Manual';
    return 'Automático';
}

function normalizeFuel(fuel) {
    if (!fuel) return 'Gasolina';
    const s = String(fuel).toLowerCase();
    if (s.includes('diesel') || s.includes('diésel') || s.includes('petrol')) return 'Diésel';
    if (s.includes('hibrid') || s.includes('híbrid') || s.includes('hybrid') || s.includes('phev')) return 'Híbrido';
    if (s.includes('electr') || s.includes('eléctr') || s.includes('ev') || s.includes('bev')) return 'Eléctrico';
    return 'Gasolina';
}

function normalizeBodyType(body, title = '') {
    const s = `${body || ''} ${title || ''}`.toLowerCase();
    if (s.includes('pickup') || s.includes('truck') || s.includes('crew cab') || s.includes('double cab') || s.includes('extended cab') || s.includes('regular cab')) return 'Pickup';
    if (s.includes('suv') || s.includes('crossover') || s.includes('jeep') || s.includes('wrangler') || s.includes('4x4') || s.includes('cherokee') || s.includes('tahoe') || s.includes('suburban') || s.includes('explorer') || s.includes('rav4') || s.includes('cr-v')) return 'SUV';
    if (s.includes('hatchback') || s.includes('hatch') || s.includes('5-door')) return 'Hatchback';
    if (s.includes('convertible') || s.includes('cabrio') || s.includes('spider')) return 'Convertible';
    if (s.includes('coupe') || s.includes('coupé')) return 'Coupé';
    if (s.includes('van') || s.includes('minivan')) return 'Van';
    if (s.includes('wagon')) return 'Wagon';
    if (s.includes('sedan') || s.includes('sedán') || s.includes('4-door') || s.includes('4dr')) return 'Sedán';
    return 'SUV';
}

function extractEngine(engine, title = '', html = '') {
    const isInvalid = (e) => {
        if (!e) return true;
        const s = String(e).trim();
        if (s === 'N/A' || s === '0.0' || s === '0' || s === '1' || s === '1.0' || s === '1.0L' || s === '2.6' || s.toLowerCase().includes('unknown')) return true;
        // Reject any purely numeric engine string without letters like "2.6" or "2.0"
        if (/^\d+\.?\d*$/.test(s)) return true;
        return false;
    };
    
    if (!isInvalid(engine) && String(engine).trim().length > 2) {
        return String(engine).trim();
    }
    
    const combined = `${title} ${html}`.toUpperCase();
    
    // Explicit engine search for 1.3L up to 8.0L
    const matchLiters = combined.match(/\b((?:[1-7]\.[0-9]|8\.0)\s*L?(?:\s*(?:TURBO|V6|V8|I4|I6|HEMI|ECOBOOST|TDI|TSI|24V|DOHC|4-CYL|6-CYL))?)\b/i);
    if (matchLiters && matchLiters[1] !== '1.0' && matchLiters[1] !== '1.0L' && matchLiters[1] !== '2.6') {
        return matchLiters[1].trim();
    }

    const matchConfig = combined.match(/\b(V6|V8|I4|I6|HEMI|TURBO|ECOBOOST|TWIN TURBO)\b/i);
    if (matchConfig) return matchConfig[1].trim();

    return '2.0L Turbo';
}

function formatDamage(dmg) {
    if (!dmg) return 'Sin daño mayor reportado';
    const s = String(dmg).toUpperCase();
    if (s.includes('FRONT')) return 'Daño Frontal';
    if (s.includes('REAR')) return 'Daño Trasero';
    if (s.includes('SIDE')) return 'Daño Lateral';
    if (s.includes('ALL OVER') || s.includes('ALL-OVER')) return 'Daño General / Múltiple';
    if (s.includes('ROLLOVER')) return 'Vuelco';
    if (s.includes('WATER') || s.includes('FLOOD')) return 'Daño por Inundación / Agua';
    if (s.includes('VANDALISM')) return 'Vandalismo';
    if (s.includes('HAIL')) return 'Daño por Granizo';
    if (s.includes('MECHANICAL')) return 'Falla Mecánica';
    if (s.includes('NORMAL WEAR')) return 'Desgaste Normal (Sin Daño Estructural)';
    if (s.includes('MINOR') || s.includes('SCRATCH')) return 'Detalles / Rayones Menores';
    if (s.includes('UNDERCARRIAGE')) return 'Daño Inferior / Chasis';
    if (s.includes('BURN') || s.includes('FIRE')) return 'Daño por Fuego';
    return dmg;
}

function parseIAAI(html, url, trustHtml = false) {
    if (!trustHtml) {
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
    }

    const $ = cheerio.load(html);
    let rawData = {};
    
    // 1. Try __PRELOADED_STATE__
    const stateStr = html.match(/(?:window\.)?__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})(?:[;<\n]|$)/i)?.[1];
    if (stateStr) { try { rawData = scanForData(JSON.parse(stateStr)); } catch(e){} }

    // 2. Try __NEXT_DATA__
    const nextDataStr = html.match(/<script[^>]*id=["']?__NEXT_DATA__["']?[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (nextDataStr) { try { rawData = scanForData(JSON.parse(nextDataStr), rawData); } catch(e){} }

    // 3. Fallback: Cheerio DOM Extraction
    const getDOMValue = (keywords) => {
        let result = null;
        $('*').each((i, el) => {
            let text = $(el).text().trim().toLowerCase();
            let cleanText = text.replace(/:$/, '').trim();
            
            if ($(el).children().length <= 1) {
                if (keywords.some(kw => cleanText === kw.toLowerCase())) {
                    let val = $(el).next().text().trim();
                    if (!val && $(el).parent().next().length) val = $(el).parent().next().text().trim();
                    if (!val && $(el).nextAll('span, div, p').length) val = $(el).nextAll('span, div, p').first().text().trim();
                    if (val && val.length < 50) { 
                        result = val.replace(/&amp;/g, '&');
                        return false; 
                    }
                }
                
                const matchKw = keywords.find(kw => text.startsWith(kw.toLowerCase() + ':') || text.startsWith(kw.toLowerCase() + ' :'));
                if (matchKw && !result) {
                    const parts = $(el).text().split(':');
                    if (parts.length > 1) {
                        let val = parts.slice(1).join(':').trim();
                        if (val && val.length < 50) {
                            result = val.replace(/&amp;/g, '&');
                            return false;
                        }
                    }
                }
            }
        });
        return result;
    };

    if (!rawData.model || !rawData.year || !rawData.make) {
        const h1Text = $('h1, .vehicle-title, [class*="heading"], [class*="title"]').text().trim().toUpperCase() || $('title').text().trim().toUpperCase();
        if (h1Text) {
            const cleanH1 = h1Text.replace(/\|.*/, '').replace(/FOR SALE.*/, '').replace(/IAAI.*/, '').trim();
            const yearMatch = cleanH1.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                rawData.year = yearMatch[0];
                const afterYear = cleanH1.substring(cleanH1.indexOf(yearMatch[0]) + 4).trim();
                const parts = afterYear.split(/\s+/).filter(Boolean);
                if (parts[0]) rawData.make = parts[0];
                if (parts[1]) rawData.model = parts.slice(1, 5).join(' ');
            }
        }
    }

    if (!rawData.km) rawData.km = getDOMValue(['Odometer', 'Mileage', 'Odometer Reading']);
    if (!rawData.engine) rawData.engine = getDOMValue(['Engine Description', 'Engine', 'Engine Size', 'Motor']);
    if (!rawData.transmission) rawData.transmission = getDOMValue(['Transmission', 'Trans', 'Transmission Type']);
    if (!rawData.bodyType) rawData.bodyType = getDOMValue(['Body Style', 'Vehicle Class', 'Body']);
    if (!rawData.fuel) rawData.fuel = getDOMValue(['Fuel Type', 'Fuel']);
    if (!rawData.color) rawData.color = getDOMValue(['Exterior Color', 'Exterior/Interior', 'Color', 'Exterior']);
    if (!rawData.location) rawData.location = getDOMValue(['Selling Branch', 'Branch', 'Location', 'Sale Location', 'Yard']);
    if (!rawData.damage) rawData.damage = getDOMValue(['Primary Damage', 'Damage', 'Damage Description', 'Loss Type']);

    if (!rawData.vin) {
        let v = getDOMValue(['VIN', 'VIN (Status)', 'VIN:']);
        if (v) rawData.vin = v.split(' ')[0];
    }

    if (!rawData.price) {
        let p = getDOMValue(['Actual Cash Value', 'Estimated Repair Cost', 'ACV', 'Buy It Now', 'Current Bid']);
        if (p) rawData.price = p;
        else {
            const priceTagText = $('.price, [class*="price"], [class*="bid"], [class*="Amount"]').first().text();
            if (priceTagText) {
                const priceMatch = priceTagText.match(/\$[\d,]+/);
                if (priceMatch) rawData.price = priceMatch[0];
            }
        }
    }

    if (rawData.price && typeof rawData.price === 'string') {
        const cleanPrice = rawData.price.match(/\$[\d,]+/);
        if (cleanPrice) rawData.price = cleanPrice[0];
        else rawData.price = "Consultar";
    } else {
        rawData.price = "Consultar";
    }

    if (!rawData.make || rawData.make === 'Vehículo' || rawData.make.includes('Access Denied')) {
        if (!trustHtml) {
            throw new Error('IAAI Bloqueado. Servidor requiere Headless Browser.');
        }
        rawData.make = "Vehículo";
    }
    if (!rawData.year) rawData.year = new Date().getFullYear();

    const itemIdMatch = url.match(/\/VehicleDetail\/(\d+)/i);
    const itemId = itemIdMatch ? itemIdMatch[1] : null;

    const imgMatches = html.match(/https?:\/\/(?:vis|images|an-cdn)\.iaai\.com\/(?:inventory|resizer)[^"'\\]*/gi) || [];
    let cleanImages = [...new Set(imgMatches)].filter(img => {
        if (img.toLowerCase().includes('similar') || img.includes('thumb')) return false;
        if (itemId && !img.includes(itemId)) return false;
        return true;
    }).map(img => {
        img = img.replace(/\\u0026/g, '&');
        if (img.includes('resizer')) {
            return img.replace(/width=\d+/, 'width=1024').replace(/height=\d+/, 'height=768');
        } else {
            if (img.includes('width=')) return img.split('width=')[0] + 'width=1024';
            return img.replace(/\/\d+$/, '/1024');
        }
    });

    if (cleanImages.length === 0) {
        cleanImages = [...new Set(imgMatches)].filter(img => {
            if (img.toLowerCase().includes('similar') || img.includes('thumb')) return false;
            return true;
        }).map(img => {
            img = img.replace(/\\u0026/g, '&');
            if (img.includes('resizer')) {
                return img.replace(/width=\d+/, 'width=1024').replace(/height=\d+/, 'height=768');
            } else {
                if (img.includes('width=')) return img.split('width=')[0] + 'width=1024';
                return img.replace(/\/\d+$/, '/1024');
            }
        });
    }

    cleanImages = cleanImages.slice(0, 20);

    const formattedDamage = formatDamage(rawData.damage);
    const formattedLocation = rawData.location || 'EE. UU. (Subasta)';

    const rawTitle = `${rawData.year} ${rawData.make} ${rawData.model || ''} ${rawData.series || ''}`.trim().replace(/\s+/g, ' ');
    const fullTitle = rawTitle.replace(/\s*LIVE AUCTION.*/i, '').replace(/\s*FOR SALE.*/i, '').trim();
    const normTrans = normalizeTransmission(rawData.transmission);
    const normFuelType = normalizeFuel(rawData.fuel);
    const normBody = normalizeBodyType(rawData.bodyType, fullTitle);
    const normEng = extractEngine(rawData.engine, fullTitle, html);

    return {
        title: fullTitle,
        year: rawData.year,
        price: rawData.price,
        km: rawData.km || "0 KM",
        engine: normEng,
        transmission: normTrans,
        bodyType: normBody,
        fuel: normFuelType,
        vin: rawData.vin || "N/A",
        damage: formattedDamage,
        location: formattedLocation,
        images: cleanImages,
        description: `📋 FICHA TÉCNICA Y ESPECIFICACIONES:
• Vehículo: ${fullTitle}
• Motor: ${normEng}
• Transmisión: ${normTrans}
• Recorrido: ${rawData.km || 'N/A'}
• Tipo de Accidente / Condición: ${formattedDamage}
• Ubicación de Origen: ${formattedLocation}
• Combustible: ${normFuelType}
• Color Exterior: ${rawData.color || 'N/A'}
• Número VIN: ${rawData.vin || 'N/A'}

🚗 Importado especialmente bajo pedido. Contáctanos para cotizar impuestos y logística de importación.

[ADMIN-LINK]: ${url}`
    };
}

function parseCopart(html, url, trustHtml = false) {
    if (!trustHtml && (html.includes('Additional security check') || html.includes('captcha') || html.includes('Imperva') || html.includes('Incapsula'))) {
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

    if (!rawData.year || !rawData.make) {
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        const titleTag = (titleMatch?.[1] || "").toUpperCase();
        
        const yearMatch = titleTag.match(/\b(20\d{2}|19\d{2})\b/);
        if (yearMatch) rawData.year = yearMatch[0];
        
        if (titleMatch) {
            let cleanTitle = titleMatch[1].split(/\||Copart/i)[0].trim().replace(/\s+/g, ' ');
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

    if (!rawData.images || rawData.images.length === 0) {
        const imgReg = /https?:\/\/[^"']+\.copart\.com\/[^"']+\d+_[a-z]\.jpg/gi;
        const matches = html.match(imgReg);
        rawData.images = [...new Set(matches || [])].map(img => img.replace(/_[a-z]\.jpg/i, '_full.jpg'));
    }

    const formattedDamage = formatDamage(rawData.damage);
    const formattedLocation = rawData.location || 'EE. UU. (Copart)';
    const fullTitle = `${rawData.year} ${rawData.make} ${rawData.model || ''}`.trim().replace(/\s+/g, ' ');
    const normTrans = normalizeTransmission(rawData.transmission);
    const normFuelType = normalizeFuel(rawData.fuel);
    const normBody = normalizeBodyType(rawData.bodyType, fullTitle);
    const normEng = extractEngine(rawData.engine, fullTitle, html);

    return {
        title: fullTitle,
        year: rawData.year,
        price: rawData.price || "Consultar",
        km: rawData.km || "0 KM",
        engine: normEng,
        transmission: normTrans,
        bodyType: normBody,
        fuel: normFuelType,
        vin: rawData.vin || "N/A",
        damage: formattedDamage,
        location: formattedLocation,
        images: rawData.images || [],
        description: `📋 FICHA TÉCNICA Y ESPECIFICACIONES:
• Vehículo: ${fullTitle}
• Motor: ${normEng}
• Transmisión: ${normTrans}
• Recorrido: ${rawData.km || 'N/A'}
• Tipo de Accidente / Condición: ${formattedDamage}
• Ubicación de Origen: ${formattedLocation}
• Combustible: ${normFuelType}
• Color Exterior: ${rawData.color || 'N/A'}
• Número VIN: ${rawData.vin || 'N/A'}

🚗 Importado especialmente vía subasta Copart.

[ADMIN-LINK]: ${url}`
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
