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
                <div id="mainVehicleImageContainer" style="width: 100%; height: 500px; border-radius: var(--radius-lg); background: #080808; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; border: 1px solid var(--ghost-border);">
                    <div id="mainVehicleBgBlur" style="position: absolute; inset: 0; background-image: url('${car.images[0]}'); background-size: cover; background-position: center; filter: blur(35px) brightness(0.35); opacity: 0.85; transform: scale(1.15);"></div>
                    <img id="mainVehicleImage" src="${car.images[0]}" style="position: relative; z-index: 2; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; transition: opacity 0.3s; box-shadow: 0 10px 40px rgba(0,0,0,0.6);" alt="${car.title}">
                </div>
                <div class="vehicle-thumbnails" style="display: flex; gap: 10px; margin-top: 15px; overflow-x: auto; padding-bottom: 10px;">
                    ${car.images.map((img, i) => `<img src="${img}" class="v-thumb" style="width: 100px; height: 75px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer; opacity: ${i===0?'1':'0.5'}; border: 2px solid ${i===0?'var(--primary)':'transparent'}; transition: 0.3s;" onclick="changeMainVehicleImage('${img}', this)">`).join('')}
                </div>
            </div>
        `;
    }

    const html = `
        <div class="vehicle-grid-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start;">
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
                        <i class="fas fa-engine" style="color: var(--on-surface-variant);"></i> <span>${car.engine || 'N/A'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gear" style="color: var(--on-surface-variant);"></i> <span>${car.transmission || 'Automático'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gas-pump" style="color: var(--on-surface-variant);"></i> <span>${car.fuel || 'Gasolina'}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 12px; border-radius: var(--radius-sm);">
                        <i class="fas fa-globe" style="color: var(--on-surface-variant);"></i> <span>${car.origin || 'Importado'}</span>
                    </div>
                </div>

                <div style="background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: var(--radius-md); padding: 15px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px;">
                    <i class="fas fa-bolt" style="color: #25D366; font-size: 1.2rem;"></i>
                    <span style="color: #25D366; font-weight: 600; font-size: 0.9rem;">Entrega Inmediata disponible</span>
                </div>

                <div style="margin-bottom: 30px;">
                    <h3 style="font-size: 1.2rem; margin-bottom: 10px;">Descripción</h3>
                    <p style="color: var(--on-surface-variant); line-height: 1.6; white-space: pre-line;">${cleanDesc || 'Sin descripción detallada.'}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <a href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, estoy interesado en la ${car.title} año ${car.year} (${car.price}) vista en la página web.`)}" target="_blank" class="btn btn-whatsapp btn-block" style="padding: 16px; font-size: 1.05rem; justify-content: center;">
                        <i class="fab fa-whatsapp"></i> COTIZA TU VEHÍCULO
                    </a>
                    <button class="btn btn-outline btn-block" onclick="navigator.clipboard.writeText(window.location.href); alert('Enlace copiado al portapapeles');" style="padding: 14px; font-size: 0.9rem; justify-content: center;">
                        <i class="fas fa-share-alt"></i> COMPARTIR VEHÍCULO
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('carDetailContainer').innerHTML = html;
    
    // Override container width for this specific page
    const container = document.getElementById('carDetailContainer');
    if (container) {
        container.style.maxWidth = '1300px';
        container.style.width = '95%';
    }

    // Make responsive using JS
    const applyLayout = () => {
        const grid = document.querySelector('.vehicle-grid-container');
        const imgContainer = document.getElementById('mainVehicleImageContainer');
        if (!grid) return;
        if (window.innerWidth <= 900) {
            grid.style.gridTemplateColumns = '1fr';
            if (imgContainer) imgContainer.style.height = '340px';
        } else {
            grid.style.gridTemplateColumns = '1fr 1fr';
            if (imgContainer) imgContainer.style.height = '500px';
        }
    };
    applyLayout();
    window.addEventListener('resize', applyLayout);
});


window.changeMainVehicleImage = function(src, thumbElement) {
    const mainImg = document.getElementById('mainVehicleImage');
    const mainBg = document.getElementById('mainVehicleBgBlur');
    if (mainImg) {
        mainImg.style.opacity = '0.3';
        mainImg.onload = function() {
            mainImg.style.opacity = '1';
        };
        mainImg.src = src;
    }
    if (mainBg) {
        mainBg.style.backgroundImage = `url('${src}')`;
    }
    
    document.querySelectorAll('.v-thumb').forEach(t => {
        t.style.opacity = '0.5';
        t.style.borderColor = 'transparent';
    });
    if (thumbElement) {
        thumbElement.style.opacity = '1';
        thumbElement.style.borderColor = 'var(--primary)';
    }
};
