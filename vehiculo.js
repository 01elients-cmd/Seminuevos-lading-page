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
    window.currentCarImages = car.images || [];
    window.currentImageIndex = 0;

    const fallbackBodyType = (typeof BODY_TYPE_LABELS !== 'undefined' && BODY_TYPE_LABELS[car.bodyType]) ? BODY_TYPE_LABELS[car.bodyType] : car.bodyType || 'Vehículo';
    const fallbackOrigin = (typeof ORIGIN_LABELS !== 'undefined' && ORIGIN_LABELS[car.origin]) ? ORIGIN_LABELS[car.origin] : car.origin || 'N/A';
    
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
                <div id="mainVehicleImageContainer" onclick="openVehicleLightbox(window.currentImageIndex)" style="width: 100%; height: 620px; border-radius: var(--radius-lg); background: #080808; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; border: 1px solid var(--ghost-border); cursor: zoom-in; transition: transform 0.3s ease;">
                    <div id="mainVehicleBgBlur" style="position: absolute; inset: 0; background-image: url('${car.images[0]}'); background-size: cover; background-position: center; filter: blur(40px) brightness(0.3); opacity: 0.85; transform: scale(1.15);"></div>
                    <img id="mainVehicleImage" src="${car.images[0]}" style="position: relative; z-index: 2; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; transition: opacity 0.3s; box-shadow: 0 12px 45px rgba(0,0,0,0.7);" alt="${car.title}">
                    <div style="position: absolute; bottom: 15px; right: 15px; z-index: 10; background: rgba(10,10,10,0.75); backdrop-filter: blur(12px); padding: 8px 16px; border-radius: var(--radius-full); border: 1px solid rgba(255,255,255,0.18); color: #fff; font-size: 0.82rem; font-weight: 500; pointer-events: none; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                        <i class="fas fa-expand-alt" style="color: var(--primary);"></i> Ver pantalla completa
                    </div>
                </div>
                <div class="vehicle-thumbnails" style="display: flex; gap: 12px; margin-top: 15px; overflow-x: auto; padding-bottom: 10px;">
                    ${car.images.map((img, i) => `<img src="${img}" class="v-thumb" style="width: 110px; height: 80px; object-fit: cover; border-radius: var(--radius-sm); cursor: pointer; opacity: ${i===0?'1':'0.5'}; border: 2px solid ${i===0?'var(--primary)':'transparent'}; transition: 0.3s;" onclick="changeMainVehicleImage('${img}', ${i}, this)">`).join('')}
                </div>
            </div>
        `;
    }

    const html = `
        <div class="vehicle-grid-container" style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 40px; align-items: start;">
            <div class="vehicle-page-left">
                ${imagesHtml}
            </div>
            <div class="vehicle-page-right" style="background: var(--surface-container); padding: 32px; border-radius: var(--radius-lg); border: 1px solid var(--ghost-border);">
                <span class="section-tag" style="display: inline-block; padding: 6px 14px; border-radius: 4px; background: rgba(39,92,234,0.1); color: var(--primary); font-size: 0.8rem; font-weight: 600; margin-bottom: 15px;">${fallbackBodyType.toUpperCase()}</span>
                <h1 style="font-family: var(--font-display); font-size: 2.3rem; margin-bottom: 10px;">${car.title}</h1>
                <p style="font-size: 1.9rem; font-weight: bold; color: var(--primary); margin-bottom: 25px;">${priceText}</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-calendar" style="color: var(--primary);"></i> <span>Año: <strong>${car.year}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-road" style="color: var(--primary);"></i> <span>Recorrido: <strong>${car.km}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-engine" style="color: var(--primary);"></i> <span>Motor: <strong>${car.engine || 'N/A'}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gear" style="color: var(--primary);"></i> <span>Transmisión: <strong>${car.transmission || 'Automático'}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-gas-pump" style="color: var(--primary);"></i> <span>Combustible: <strong>${car.fuel || 'Gasolina'}</strong></span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface-container-low); padding: 14px; border-radius: var(--radius-sm);">
                        <i class="fas fa-globe" style="color: var(--primary);"></i> <span>Origen: <strong>${car.origin || 'Importado'}</strong></span>
                    </div>
                </div>

                <div style="background: rgba(37,211,102,0.1); border: 1px solid rgba(37,211,102,0.3); border-radius: var(--radius-md); padding: 15px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px;">
                    <i class="fas fa-bolt" style="color: #25D366; font-size: 1.2rem;"></i>
                    <span style="color: #25D366; font-weight: 600; font-size: 0.95rem;">Entrega Inmediata disponible</span>
                </div>

                <div style="margin-bottom: 30px;">
                    <h3 style="font-size: 1.25rem; margin-bottom: 12px; font-family: var(--font-display);">Descripción del Vehículo</h3>
                    <p style="color: var(--on-surface-variant); line-height: 1.7; white-space: pre-line; font-size: 0.98rem;">${cleanDesc || 'Sin descripción detallada.'}</p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <a href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, estoy interesado en la ${car.title} año ${car.year} (${car.price}) vista en la página web.`)}" target="_blank" class="btn btn-whatsapp btn-block" style="padding: 16px; font-size: 1.05rem; justify-content: center; font-weight: 700;">
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
        container.style.maxWidth = '1400px';
        container.style.width = '95%';
    }

    // Make responsive using JS
    const applyLayout = () => {
        const grid = document.querySelector('.vehicle-grid-container');
        const imgContainer = document.getElementById('mainVehicleImageContainer');
        if (!grid) return;
        if (window.innerWidth <= 900) {
            grid.style.gridTemplateColumns = '1fr';
            if (imgContainer) imgContainer.style.height = '380px';
        } else if (window.innerWidth <= 1200) {
            grid.style.gridTemplateColumns = '1fr 1fr';
            if (imgContainer) imgContainer.style.height = '520px';
        } else {
            grid.style.gridTemplateColumns = '1.15fr 0.85fr';
            if (imgContainer) imgContainer.style.height = '620px';
        }
    };
    applyLayout();
    window.addEventListener('resize', applyLayout);
});


window.changeMainVehicleImage = function(src, index, thumbElement) {
    window.currentImageIndex = index;
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
    
    document.querySelectorAll('.v-thumb').forEach((t, idx) => {
        t.style.opacity = idx === index ? '1' : '0.5';
        t.style.borderColor = idx === index ? 'var(--primary)' : 'transparent';
    });
};

// Fullscreen Lightbox Modal
window.openVehicleLightbox = function(index) {
    const images = window.currentCarImages || [];
    if (!images || images.length === 0) return;
    
    window.currentImageIndex = index || 0;
    
    let modal = document.getElementById('vehicleLightboxModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vehicleLightboxModal';
        modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.95); backdrop-filter:blur(25px); display:flex; align-items:center; justify-content:center; flex-direction:column;';
        modal.innerHTML = `
            <button onclick="closeVehicleLightbox()" style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:1.5rem; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10001; transition:0.3s;"><i class="fas fa-times"></i></button>
            <button onclick="navVehicleLightbox(-1)" style="position:absolute; left:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:1.5rem; width:54px; height:54px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10001; transition:0.3s;"><i class="fas fa-chevron-left"></i></button>
            <button onclick="navVehicleLightbox(1)" style="position:absolute; right:20px; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; font-size:1.5rem; width:54px; height:54px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10001; transition:0.3s;"><i class="fas fa-chevron-right"></i></button>
            <div style="max-width:92vw; max-height:86vh; display:flex; align-items:center; justify-content:center;">
                <img id="lightboxImg" src="" style="max-width:92vw; max-height:86vh; object-fit:contain; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.9); transition: opacity 0.25s ease;" alt="Vehículo">
            </div>
            <div id="lightboxCounter" style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-top:16px; font-family:var(--font-display); letter-spacing:2px;"></div>
        `;
        document.body.appendChild(modal);
        
        document.addEventListener('keydown', (e) => {
            if (modal.style.display !== 'flex') return;
            if (e.key === 'Escape') closeVehicleLightbox();
            if (e.key === 'ArrowLeft') navVehicleLightbox(-1);
            if (e.key === 'ArrowRight') navVehicleLightbox(1);
        });
    }
    
    updateLightboxContent();
    modal.style.display = 'flex';
};

window.closeVehicleLightbox = function() {
    const modal = document.getElementById('vehicleLightboxModal');
    if (modal) modal.style.display = 'none';
};

window.navVehicleLightbox = function(dir) {
    const images = window.currentCarImages || [];
    if (!images || images.length === 0) return;
    
    window.currentImageIndex = (window.currentImageIndex + dir + images.length) % images.length;
    updateLightboxContent();
};

function updateLightboxContent() {
    const images = window.currentCarImages || [];
    const idx = window.currentImageIndex || 0;
    const imgEl = document.getElementById('lightboxImg');
    const counterEl = document.getElementById('lightboxCounter');
    
    if (imgEl && images[idx]) {
        imgEl.style.opacity = '0.4';
        imgEl.onload = () => { imgEl.style.opacity = '1'; };
        imgEl.src = images[idx];
    }
    if (counterEl) {
        counterEl.textContent = `${idx + 1} / ${images.length}`;
    }
}
