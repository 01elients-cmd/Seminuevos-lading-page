document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const carId = urlParams.get('id');

    if (!carId) {
        document.getElementById('carDetailContainer').innerHTML = '<h2 style="color:white; text-align:center;">Vehículo no encontrado</h2>';
        return;
    }

    let car = null;

    try {
        // Fetch from Supabase
        const { data: vDataRaw } = await supabaseClient.from('vehicles').select('*').eq('id', carId).maybeSingle();
        if (vDataRaw) {
            car = { ...vDataRaw, bodyType: vDataRaw.bodyType || vDataRaw.body_type };
            
            // Increment views
            const newViews = (car.views || 0) + 1;
            supabaseClient.rpc('increment_vehicle_views', { vehicle_id: car.id })
                .then(({ error }) => {
                    if (error) console.warn('Views RPC error:', error.message);
                });
        }
    } catch (e) {
        console.warn('Error fetching car:', e);
    }

    if (!car) {
        // Fallback to data.js if db is empty or failed
        const allVehs = [];
        if (typeof vehiclesSeminuevos !== 'undefined') allVehs.push(...vehiclesSeminuevos);
        if (typeof vehicles0km !== 'undefined') allVehs.push(...vehicles0km);
        car = allVehs.find(v => String(v.id) === String(carId));
    }

    if (!car) {
        document.getElementById('carDetailContainer').innerHTML = '<h2 style="color:white; text-align:center;">Vehículo no encontrado</h2>';
        return;
    }

    const fallbackBodyType = (typeof BODY_TYPE_LABELS !== 'undefined' && BODY_TYPE_LABELS[car.bodyType]) ? BODY_TYPE_LABELS[car.bodyType] : car.bodyType || 'Vehículo';
    const fallbackOrigin = (typeof ORIGIN_LABELS !== 'undefined' && ORIGIN_LABELS[car.origin]) ? ORIGIN_LABELS[car.origin] : car.origin || 'N/A';
    const availabilityClass = car.availability === 'entrega_inmediata' ? 'available' : 'order';
    const availabilityText = car.availability === 'entrega_inmediata' ? 'Entrega Inmediata' : 'Por Pedido';
    const availabilityIcon = car.availability === 'entrega_inmediata' ? 'fa-bolt' : 'fa-clock';
    
    // Configs
    let whatsappNumber = "584248700438";
    try {
        const { data: sData } = await supabaseClient.from('site_settings').select('value').eq('key', 'whatsapp_number').maybeSingle();
        if (sData && sData.value) {
            whatsappNumber = String(JSON.parse(sData.value)).replace(/[^0-9]/g, '');
        }
    } catch (e) {}

    const priceText = car.price === 'Consultar' ? 'Consultar precio' : car.price;
    const cleanDesc = car.description ? car.description.split('\n\n[ADMIN-LINK]:')[0] : '';
    
    // Photos
    let imagesHtml = '';
    if (car.images && car.images.length > 0) {
        imagesHtml = `
            <div class="vehicle-page-gallery" style="margin-bottom: 30px;">
                <img id="mainVehicleImage" src="${car.images[0]}" style="width: 100%; border-radius: var(--radius-lg); height: 500px; object-fit: cover; transition: opacity 0.3s;" alt="${car.title}">
                <div class="vehicle-thumbnails" style="display: flex; gap: 10px; margin-top: 15px; overflow-x: auto; padding-bottom: 10px;">
                    ${car.images.map((img, i) => `<img src="${img}" class="v-thumb" style="width: 100px; height: 75px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer; opacity: ${i===0?'1':'0.5'}; border: 2px solid ${i===0?'var(--primary)':'transparent'}; transition: 0.3s;" onclick="changeMainVehicleImage('${img}', this)">`).join('')}
                </div>
            </div>
        `;
    }

    const html = `
        <div class="vehicle-grid-container" style="display: grid; grid-template-columns: 1fr 380px; gap: 30px; align-items: start;">
            <div class="vehicle-page-left">
                ${imagesHtml}
            </div>
            <div class="vehicle-page-right" style="background: var(--surface-container); padding: 30px; border-radius: var(--radius-lg); border: 1px solid var(--ghost-border);">
                <span class="section-tag" style="display: inline-block; padding: 6px 12px; border-radius: 4px; background: rgba(39,92,234,0.1); color: var(--primary); font-size: 0.8rem; font-weight: 600; margin-bottom: 15px;">${fallbackBodyType.toUpperCase()}</span>
                <h1 style="font-family: var(--font-display); font-size: 2.2rem; margin-bottom: 10px;">${car.title}</h1>
                <p style="font-size: 1.8rem; font-weight: bold; color: var(--primary); margin-bottom: 25px;">${priceText}</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-calendar" style="color: var(--on-surface-variant);"></i> <span>${car.year}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-road" style="color: var(--on-surface-variant);"></i> <span>${car.km}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-engine" style="color: var(--on-surface-variant);"></i> <span>${car.engine}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gears" style="color: var(--on-surface-variant);"></i> <span>${car.transmission}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gas-pump" style="color: var(--on-surface-variant);"></i> <span>${car.fuel}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas ${car.origin === 'importado' ? 'fa-globe' : 'fa-flag'}" style="color: var(--on-surface-variant);"></i> <span>${fallbackOrigin}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm); grid-column: 1 / -1;">
                        <i class="fas ${availabilityIcon}" style="color: var(--on-surface-variant);"></i> <span class="vehicle-availability ${availabilityClass}">${availabilityText}</span>
                    </div>
                </div>

                <div style="margin-bottom: 30px;">
                    <h3 style="font-family: var(--font-display); font-size: 1.2rem; margin-bottom: 10px;">Descripción</h3>
                    <p style="color: var(--on-surface-variant); white-space: pre-line;">${cleanDesc || 'Sin descripción detallada.'}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 40px;">
                    <a href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, me interesa el ${car.title} (${car.year}) - ${priceText}. ¿Me pueden cotizar?`)}" class="btn btn-whatsapp btn-lg btn-block" target="_blank" style="width: 100%; justify-content: center;">
                        <i class="fab fa-whatsapp"></i> Cotiza tu vehículo
                    </a>
                    <a href="javascript:void(0)" onclick="navigator.clipboard.writeText(window.location.href); alert('Enlace copiado al portapapeles!');" class="btn btn-outline btn-block" style="width: 100%; justify-content: center;">
                        <i class="fas fa-share-nodes"></i> Compartir Vehículo
                    </a>
                </div>
            </div>

            <!-- INJECTED CALCULATOR -->
            <div class="vehicle-page-calculator" style="position: sticky; top: 100px;">
                <div class="calculator-wrapper" style="margin-top: 0; box-shadow: none; border: 1px solid var(--ghost-border); border-radius: var(--radius-lg); background: var(--surface-container-low); padding: 20px;">
                    <h3 style="font-family: var(--font-display); font-size: 1.2rem; margin-bottom: 20px; text-align: center;"><i class="fas fa-calculator" style="color: var(--primary);"></i> Estimador de Importación</h3>
                    <div class="calculator-inputs" style="grid-template-columns: 1fr;">
                        <div class="form-group">
                            <label for="calcStatus">Estatus del vehículo</label>
                            <select id="calcStatus" class="calc-select">
                                <option value="puerto_libre">Puerto Libre</option>
                                <option value="nacional">Nacional</option>
                                <option value="eeuu">Estados Unidos</option>
                            </select>
                        </div>
                        <div id="calcNacionalNotice" class="calc-nacional-notice" style="display:none; margin-bottom: 15px;">
                            <i class="fas fa-info-circle"></i>
                            <span>Para vehículos de estatus Nacional, favor <strong>consultar directamente</strong> con un asesor.</span>
                        </div>
                        <div id="calcFieldsPL">
                            <div class="form-group">
                                <label for="calcBaseCost">Costo de compra ($)</label>
                                <input type="number" id="calcBaseCost" placeholder="Ej. 15000">
                            </div>
                            <div class="form-group">
                                <label for="calcOrigin">Ubicación Origin (USA)</label>
                                <select id="calcOrigin" class="calc-select">
                                    <option value="FL">Florida</option>
                                    <option value="TX">Texas</option>
                                    <option value="CA">California</option>
                                    <option value="custom">Otro (Manual)</option>
                                </select>
                            </div>
                            <div class="form-group" id="customTransportGroup" style="display:none;">
                                <label for="calcCustomTransport">Grúa manual ($)</label>
                                <input type="number" id="calcCustomTransport" placeholder="1200">
                            </div>
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="calcDestination">Destino</label>
                                <select id="calcDestination" class="calc-select" disabled>
                                    <option value="FL_MIAMI">Florida / Miami Warehouse</option>
                                </select>
                            </div>
                            <div class="form-group checkbox-group">
                                <input type="checkbox" id="calcRepairs1">
                                <label for="calcRepairs1">Reparaciones grado 1</label>
                            </div>
                            <div class="form-group checkbox-group">
                                <input type="checkbox" id="calcRepairs2">
                                <label for="calcRepairs2">Reparaciones grado 2</label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="calculator-results" id="calcResults" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--ghost-border); font-size: 0.85rem;">
                        <div class="calc-row" style="font-size:0.85rem;"><span>Costo de Compra</span><span id="resBase">$0</span></div>
                        
                        <div class="calc-row" id="toggleAuctionFees" style="cursor: pointer; font-size:0.85rem;">
                            <span>Tarifa de Subasta <i class="fas fa-chevron-down" style="font-size: 0.75rem; margin-left: 4px; transition: transform 0.3s;"></i></span>
                            <span id="resTotalAuctionFees">$0</span>
                        </div>
                        <div id="auctionFeesDetails" style="display: none; padding-left: 10px; border-left: 2px solid var(--ghost-border); margin-bottom: 8px;">
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Tarifa de compra</span><span id="resBuyFee">$0</span></div>
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Tarifa por internet</span><span id="resInternetFee">$0</span></div>
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Tarifa de servicio</span><span id="resAuctionServiceFee">$0</span></div>
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Tarifas ambientales</span><span id="resEnvFee">$0</span></div>
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Trámite de título in USA</span><span id="resTitleFee">$0</span></div>
                            <div class="calc-row detailed-fee" style="font-size: 0.78rem; margin-bottom: 3px;"><span>Impuestos del estado</span><span id="resStateTax">$0</span></div>
                        </div>

                        <div class="calc-row detailed-fee" style="font-size:0.85rem;"><span>Tarifa broker</span><span id="resBrokerFee">$0</span></div>
                        <div class="calc-row" style="font-size:0.85rem;"><span>Tarifa de servicio</span><span id="resServiceFee">$0</span></div>
                        <div class="calc-row" style="font-size:0.85rem;"><span>Traslado / Grúa</span><span id="resTraslado">$0</span></div>
                        <div class="calc-row vzla-fee-row" style="font-size:0.85rem;"><span>Flete Marítimo</span><span id="resFlete">$0</span></div>
                        <div class="calc-row vzla-fee-row" style="font-size:0.85rem;"><span>Gastos de Aduana</span><span id="resAduana">$0</span></div>
                        <div class="calc-row vzla-fee-row" style="font-size:0.85rem;"><span>Doc. en VZLA</span><span id="resDocVzla">$0</span></div>
                        <div class="calc-row" style="font-size:0.85rem;"><span>Reparaciones (Est.)</span><span id="resRepuesto">$0</span></div>
                        <div class="calc-divider"></div>
                        <div class="calc-row total-range" style="font-size:0.9rem;">
                            <span>ESTIMADO TOTAL</span>
                            <span class="total-range-values">
                                <span id="resTotal" class="text-accent">$0</span>
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    document.getElementById('carDetailContainer').innerHTML = html;
    
    // Bind calculator events for this newly injected calculator
    setTimeout(() => {
        const attachCalc = (id, event) => {
            const el = document.getElementById(id);
            if (el && typeof window.updateCalculatorLogic === 'function') {
                el.addEventListener(event, window.updateCalculatorLogic);
            }
        };

        attachCalc('calcStatus', 'change');
        attachCalc('calcOrigin', 'change');
        attachCalc('calcDestination', 'change');
        attachCalc('calcCustomTransport', 'input');
        attachCalc('calcBaseCost', 'input');
        attachCalc('calcRepairs1', 'change');
        attachCalc('calcRepairs2', 'change');
        
        // Also handle the display logic for PL vs Nacional vs origin custom
        const calcStatus = document.getElementById('calcStatus');
        const calcFieldsPL = document.getElementById('calcFieldsPL');
        const calcNacionalNotice = document.getElementById('calcNacionalNotice');
        const calcResults = document.getElementById('calcResults');
        const calcOrigin = document.getElementById('calcOrigin');
        const customTransportGroup = document.getElementById('customTransportGroup');

        if (calcStatus) {
            calcStatus.addEventListener('change', () => {
                if (calcStatus.value === 'nacional') {
                    calcFieldsPL.style.display = 'none';
                    calcNacionalNotice.style.display = 'flex';
                    calcResults.style.display = 'none';
                } else {
                    calcFieldsPL.style.display = 'block';
                    calcNacionalNotice.style.display = 'none';
                    calcResults.style.display = 'block';
                }
            });
        }
        
        if (calcOrigin) {
            calcOrigin.addEventListener('change', () => {
                if (calcOrigin.value === 'custom') {
                    customTransportGroup.style.display = 'block';
                } else {
                    customTransportGroup.style.display = 'none';
                }
            });
        }
        
        // Let's manually add the basic event listeners that the accordion needs
        const toggleAuctionFees = document.getElementById('toggleAuctionFees');
        if (toggleAuctionFees) {
            toggleAuctionFees.addEventListener('click', () => {
                const details = document.getElementById('auctionFeesDetails');
                const icon = toggleAuctionFees.querySelector('i');
                if (details.style.display === 'none') {
                    details.style.display = 'block';
                    if (icon) icon.style.transform = 'rotate(180deg)';
                } else {
                    details.style.display = 'none';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                }
            });
        }
        
        // Re-attach calculator logic locally if updateCalc isn't accessible
        if (typeof window.updateCalculatorLogic === 'function') {
            window.updateCalculatorLogic();
        }
    }, 100);
    
    // Override container width for this specific page
    const container = document.getElementById('carDetailContainer');
    if (container) {
        container.style.maxWidth = '1300px';
        container.style.width = '95%';
    }

    // Make responsive using JS
    const applyLayout = () => {
        const grid = document.querySelector('.vehicle-grid-container');
        if (!grid) return;
        if (window.innerWidth <= 900) {
            grid.style.gridTemplateColumns = '1fr';
            const img = document.getElementById('mainVehicleImage');
            if (img) img.style.height = '260px';
        } else {
            grid.style.gridTemplateColumns = '1fr 380px';
            const img = document.getElementById('mainVehicleImage');
            if (img) img.style.height = '460px';
        }
    };
    applyLayout();
    window.addEventListener('resize', applyLayout);
});


window.changeMainVehicleImage = function(src, thumbElement) {
    const mainImg = document.getElementById('mainVehicleImage');
    mainImg.style.opacity = '0.3';
    mainImg.onload = function() {
        mainImg.style.opacity = '1';
    };
    mainImg.src = src;
    
    document.querySelectorAll('.v-thumb').forEach(t => {
        t.style.opacity = '0.5';
        t.style.borderColor = 'transparent';
    });
    thumbElement.style.opacity = '1';
    thumbElement.style.borderColor = 'var(--primary)';
};

