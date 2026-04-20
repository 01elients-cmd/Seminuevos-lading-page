/**
 *  SemiNuevo - Main JavaScript
 *  Handles: Hero slider, Navbar, Catalog tabs, Rendering, Filters, Modal, 
 *  Stats counter, Scroll animations, Contact form
 */

// Global Constants
window.WHATSAPP_NUMBER = "584147977832"; // Default fallback

document.addEventListener('DOMContentLoaded', () => {
    // ===== ANALYTICS TRACKING =====
    let modalStartTime = 0;
    let currentVehicleId = null;
    let currentVehicleTitle = '';

    async function logAnalyticsEvent(type, data = {}) {
        try {
            await supabaseClient.from('site_analytics').insert([{
                event_type: type,
                event_data: data,
                url: window.location.pathname
            }]);
        } catch (e) {
            console.warn('Analytics error:', e);
        }
    }

    // Initial page view
    logAnalyticsEvent('page_view', { referrer: document.referrer });

    // ===== HERO SLIDER =====
    const heroSlider = {
        slides: document.querySelectorAll('.hero-slide'),
        dotsContainer: document.getElementById('heroDots'),
        prevBtn: document.getElementById('heroPrev'),
        nextBtn: document.getElementById('heroNext'),
        currentIndex: 0,
        interval: null,
        delay: 5000,

        init() {
            if (!this.slides.length) return;
            this.createDots();
            this.startAutoplay();
            this.prevBtn?.addEventListener('click', () => this.prev());
            this.nextBtn?.addEventListener('click', () => this.next());
        },

        createDots() {
            this.slides.forEach((_, i) => {
                const dot = document.createElement('div');
                dot.classList.add('hero-dot');
                if (i === 0) dot.classList.add('active');
                dot.addEventListener('click', () => this.goTo(i));
                this.dotsContainer.appendChild(dot);
            });
        },

        goTo(index) {
            this.slides[this.currentIndex].classList.remove('active');
            this.dotsContainer.children[this.currentIndex]?.classList.remove('active');
            this.currentIndex = index;
            this.slides[this.currentIndex].classList.add('active');
            this.dotsContainer.children[this.currentIndex]?.classList.add('active');
            this.resetAutoplay();
        },

        next() {
            const nextIndex = (this.currentIndex + 1) % this.slides.length;
            this.goTo(nextIndex);
        },

        prev() {
            const prevIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
            this.goTo(prevIndex);
        },

        startAutoplay() {
            this.interval = setInterval(() => this.next(), this.delay);
        },

        resetAutoplay() {
            clearInterval(this.interval);
            this.startAutoplay();
        }
    };

    heroSlider.init();

    // ===== NAVBAR SCROLL =====
    const navbar = document.getElementById('navbar');
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');

    window.addEventListener('scroll', () => {
        // Navbar background
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }

        // Active nav link
        let current = '';
        sections.forEach(section => {
            const top = section.offsetTop - 150;
            if (window.scrollY >= top) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });

    // ===== MOBILE MENU =====
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');

    navToggle?.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('open');
        document.body.style.overflow = navMenu.classList.contains('open') ? 'hidden' : '';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle?.classList.remove('active');
            navMenu?.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    // ===== CATALOG MAIN TABS (3 tabs) =====
    const mainTabs = document.querySelectorAll('.catalog-main-tab');
    const seminuevosPanel = document.getElementById('seminuevos-panel');
    const porpedidoPanel = document.getElementById('porpedido-panel');
    const zerokmPanel = document.getElementById('zerokm-panel');
    const allPanels = [seminuevosPanel, porpedidoPanel, zerokmPanel];

    mainTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mainTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            allPanels.forEach(p => p && p.classList.remove('active'));
            const section = tab.dataset.section;
            if (section === 'seminuevos') seminuevosPanel?.classList.add('active');
            else if (section === 'porpedido') porpedidoPanel?.classList.add('active');
            else if (section === '0km') zerokmPanel?.classList.add('active');
            observeAnimations();
        });
    });

    function showGridLoading(grid) {
        if (!grid) return;
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><div class="loader-spinner"></div><p style="color: var(--outline); margin-top: 15px;">Conectando con el inventario...</p></div>`;
    }

    // ===== RENDER VEHICLES =====
    const seminuevosGrid = document.getElementById('seminuevosGrid');
    const porpedidoGrid = document.getElementById('porpedidoGrid');
    const zerokmGrid = document.getElementById('zerokmGrid');

    // Sort helper
    function parsePrice(priceStr) {
        if (!priceStr || priceStr === 'Consultar') return Infinity;
        return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || Infinity;
    }

    function sortVehicles(arr) {
        const sortSelect = document.getElementById('catalogSort');
        const sortVal = sortSelect ? sortSelect.value : 'default';
        if (sortVal === 'default') return arr;
        const sorted = [...arr];
        switch (sortVal) {
            case 'price_asc': return sorted.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
            case 'price_desc': return sorted.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
            case 'year_desc': return sorted.sort((a, b) => b.year - a.year);
            case 'year_asc': return sorted.sort((a, b) => a.year - b.year);
            default: return sorted;
        }
    }

    function renderVehicles(dataSource, gridElement, typeConditionFilter = 'todos', brandFilter = 'todos') {
        if (!gridElement) return;
        let filtered = dataSource;
        if (typeConditionFilter !== 'todos') {
            filtered = filtered.filter(v => v.condition === typeConditionFilter || v.bodyType === typeConditionFilter);
        }
        if (brandFilter !== 'todos') {
            filtered = filtered.filter(v => v.title.toLowerCase().includes(brandFilter));
        }
        filtered = sortVehicles(filtered);
        gridElement.innerHTML = '';
        if (filtered.length === 0) {
            gridElement.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;"><i class="fas fa-car" style="font-size: 3rem; color: var(--outline); margin-bottom: 20px; display: block;"></i><p style="font-size: 1.2rem; color: var(--on-surface-variant);">No hay vehículos en esta categoría aún.</p><p style="color: var(--outline); margin-top: 8px;">Escríbenos por WhatsApp para consultar disponibilidad.</p></div>`;
            return;
        }
        filtered.forEach((car, index) => {
            const card = document.createElement('div');
            card.classList.add('vehicle-card', 'animate-on-scroll');
            card.style.cursor = 'pointer';
            card.style.transitionDelay = `${index * 0.08}s`;
            const priceDisplay = car.price === 'Consultar' ? `<span class="price-consult">Consultar Precio</span>` : car.price;
            const availabilityClass = car.availability === 'entrega_inmediata' ? 'available' : 'order';
            const availabilityText = car.availability === 'entrega_inmediata' ? 'Entrega Inmediata' : 'Por Pedido';
            const availabilityIcon = car.availability === 'entrega_inmediata' ? 'fa-bolt' : 'fa-clock';
            const originBadge = car.origin === 'importado' ? `<span class="origin-badge importado"><i class="fas fa-globe"></i> Importado</span>` : `<span class="origin-badge nacional"><i class="fas fa-flag"></i> Nacional</span>`;
            const viewCount = car.views || 0;
            const viewsBadge = viewCount > 0 ? `<span class="views-badge" id="views-card-${car.id}"><i class="fas fa-eye"></i> ${viewCount} vista${viewCount !== 1 ? 's' : ''}</span>` : `<span class="views-badge" id="views-card-${car.id}" style="display:none;"></span>`;
            card.innerHTML = `
                <div class="vehicle-card-image"><img src="${car.images[0]}" alt="${car.title}" loading="lazy">${car.badge ? `<span class="vehicle-badge">${car.badge}</span>` : ''}${viewsBadge}<div class="vehicle-card-tags">${originBadge}</div></div>
                <div class="vehicle-card-body"><div class="vehicle-card-header"><h3 class="vehicle-card-title">${car.title}</h3><span class="vehicle-availability ${availabilityClass}"><i class="fas ${availabilityIcon}"></i> ${availabilityText}</span></div><p class="vehicle-card-price">${priceDisplay}</p><div class="vehicle-card-specs"><span class="spec-item"><i class="fas fa-calendar"></i> ${car.year}</span><span class="spec-item"><i class="fas fa-road"></i> ${car.km}</span><span class="spec-item"><i class="fas fa-gas-pump"></i> ${car.fuel}</span><span class="spec-item"><i class="fas fa-gears"></i> ${car.transmission}</span></div></div>
                <div class="vehicle-card-footer"><a href="#" class="view-details" data-id="${car.id}"><i class="fas fa-eye"></i> Ver detalles</a><a href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, me interesa el ${car.title} (${car.year}) - ${car.availability === 'por_pedido' ? 'Por Pedido' : car.price}. ¿Me pueden cotizar?`)}" class="track-whatsapp" data-title="${car.title}" target="_blank"><i class="fab fa-whatsapp"></i> Cotiza</a></div>
            `;
            gridElement.appendChild(card);
        });
        observeAnimations();
    }

    // Sort dropdown listener
    const catalogSort = document.getElementById('catalogSort');
    catalogSort?.addEventListener('change', () => renderAllPanels());

    let appVehiclesSeminuevos = [];
    let appVehiclesPorPedido = [];
    let appVehicles0km = [];

    function renderAllPanels() {
        renderVehicles(appVehiclesSeminuevos, seminuevosGrid, filtersState.seminuevos.type, filtersState.seminuevos.brand);
        renderVehicles(appVehiclesPorPedido, porpedidoGrid, filtersState.porpedido.type, filtersState.porpedido.brand);
        renderVehicles(appVehicles0km, zerokmGrid, filtersState.zerokm.type, filtersState.zerokm.brand);

        // Featured grid population
        const featuredGrid = document.getElementById('featuredVehiclesGrid');
        if (featuredGrid) {
            let allVehicles = [...appVehiclesSeminuevos, ...appVehicles0km, ...appVehiclesPorPedido];
            // Sort by views descending to show the most popular cars
            allVehicles.sort((a, b) => (b.views || 0) - (a.views || 0));
            renderVehicles(allVehicles.slice(0, 3), featuredGrid, 'todos', 'todos');
        }
    }

    // ===== FILTER STATE =====
    const filtersState = {
        seminuevos: { type: 'todos', brand: 'todos' },
        porpedido: { type: 'todos', brand: 'todos' },
        zerokm: { type: 'todos', brand: 'todos' }
    };

    function setupFilters(filterBtnsSelector, brandSelectId, stateKey, gridEl, getDataSource) {
        const filterBtns = document.querySelectorAll(filterBtnsSelector);
        const brandSelect = document.getElementById(brandSelectId);
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtersState[stateKey].type = btn.dataset.filter;
                renderVehicles(getDataSource(), gridEl, filtersState[stateKey].type, filtersState[stateKey].brand);
            });
        });
        brandSelect?.addEventListener('change', (e) => {
            filtersState[stateKey].brand = e.target.value;
            renderVehicles(getDataSource(), gridEl, filtersState[stateKey].type, filtersState[stateKey].brand);
        });
    }

    setupFilters('#seminuevosFilters .filter-btn', 'seminuevosBrandFilter', 'seminuevos', seminuevosGrid, () => appVehiclesSeminuevos);
    setupFilters('#porpedidoFilters .filter-btn', 'porpedidoBrandFilter', 'porpedido', porpedidoGrid, () => appVehiclesPorPedido);
    setupFilters('#zerokmFilters .filter-btn', 'zerokmBrandFilter', 'zerokm', zerokmGrid, () => appVehicles0km);

    // ===== SUPABASE DATA FETCH =====
    async function initSupabaseData() {
        try {
            // Load vehicles
            const { data: vDataRaw } = await supabaseClient.from('vehicles').select('*').eq('status', 'active');
            if (vDataRaw && vDataRaw.length > 0) {
                const vData = vDataRaw.map(v => ({ ...v, bodyType: v.bodyType || v.body_type }));
                appVehiclesSeminuevos = vData.filter(v => v.catalog === 'seminuevos');
                appVehiclesPorPedido = vData.filter(v => v.catalog === 'importados');
                appVehicles0km = vData.filter(v => v.catalog === '0km');
            } else {
                // Fallback to data.js if db is empty
                if (typeof vehiclesSeminuevos !== 'undefined') appVehiclesSeminuevos = vehiclesSeminuevos;
                if (typeof vehicles0km !== 'undefined') {
                    appVehiclesPorPedido = vehicles0km.filter(v => v.condition !== '0km');
                    appVehicles0km = vehicles0km.filter(v => v.condition === '0km');
                }
            }

            // Load settings
            const { data: sData } = await supabaseClient.from('site_settings').select('*');
            if (sData) {
                const map = {};
                sData.forEach(s => map[s.key] = JSON.parse(s.value));
                if (map.whatsapp_number) window.WHATSAPP_NUMBER = map.whatsapp_number;

                // Update UI visually
                if (map.company_name) document.querySelectorAll('.logo-text').forEach(el => el.textContent = map.company_name);

                const fFb = document.querySelector('a[title="Facebook"]');
                const fIg = document.querySelector('a[title="Instagram"]');
                const fTt = document.querySelector('a[title="TikTok"]');
                const fYt = document.querySelector('a[title="YouTube"]');

                if (map.social_facebook && fFb) fFb.href = map.social_facebook;
                if (map.social_instagram && fIg) fIg.href = map.social_instagram;
                if (map.social_tiktok && fTt) fTt.href = map.social_tiktok;
                if (map.social_youtube && fYt) fYt.href = map.social_youtube;
            }
        } catch (e) { console.error('Error fetching CMS data', e); }

        renderAllPanels();
    }

    initSupabaseData();

    // ===== VEHICLE MODAL =====
    const modal = document.getElementById('vehicleModal');
    const modalClose = document.getElementById('modalClose');

    // Gallery slider state
    const modalGallery = {
        images: [],
        currentIndex: 0,

        init(images) {
            this.images = images || [];
            this.currentIndex = 0;
            this.render();
        },

        render() {
            const slider = document.getElementById('modalSlider');
            const dots = document.getElementById('modalDots');
            const counter = document.getElementById('modalCounter');

            // Build images
            slider.innerHTML = this.images.map((src, i) =>
                `<img src="${src}" alt="Foto ${i + 1}" class="${i === 0 ? 'active' : ''}" loading="lazy">`
            ).join('');

            // Build dots (max 15 visible)
            const maxDots = Math.min(this.images.length, 15);
            dots.innerHTML = Array.from({ length: maxDots }, (_, i) =>
                `<div class="modal-gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>`
            ).join('');

            // Counter
            counter.textContent = `1 / ${this.images.length}`;

            // Dot clicks
            dots.querySelectorAll('.modal-gallery-dot').forEach(dot => {
                dot.addEventListener('click', () => this.goTo(parseInt(dot.dataset.index)));
            });
        },

        goTo(index) {
            if (index < 0) index = this.images.length - 1;
            if (index >= this.images.length) index = 0;

            const slider = document.getElementById('modalSlider');
            const dots = document.getElementById('modalDots');
            const counter = document.getElementById('modalCounter');

            // Update images
            slider.querySelectorAll('img').forEach((img, i) => {
                img.classList.toggle('active', i === index);
            });

            // Update dots
            const maxDots = Math.min(this.images.length, 15);
            if (index < maxDots) {
                dots.querySelectorAll('.modal-gallery-dot').forEach((dot, i) => {
                    dot.classList.toggle('active', i === index);
                });
            }

            // Update counter
            counter.textContent = `${index + 1} / ${this.images.length}`;
            this.currentIndex = index;
        },

        next() { this.goTo(this.currentIndex + 1); },
        prev() { this.goTo(this.currentIndex - 1); }
    };

    // Gallery arrow clicks
    document.getElementById('modalPrev')?.addEventListener('click', () => modalGallery.prev());
    document.getElementById('modalNext')?.addEventListener('click', () => modalGallery.next());

    async function openModal(carIdStr) {
        const carId = String(carIdStr);
        const allVehs = [...appVehiclesSeminuevos, ...appVehiclesPorPedido, ...appVehicles0km];
        const car = allVehs.find(v => String(v.id) === carId);
        if (!car) return;

        // Analytics Tracking
        modalStartTime = performance.now();
        currentVehicleId = car.id;
        currentVehicleTitle = car.title;
        logAnalyticsEvent('vehicle_view', { vehicle_id: car.id, title: car.title });

        // === INCREMENT VIEW COUNT (via RPC para evitar problemas de RLS) ===
        try {
            const newViews = (car.views || 0) + 1;
            car.views = newViews; // actualiza cache local inmediatamente
            // Llama la función del servidor que bypasea RLS
            supabaseClient.rpc('increment_vehicle_views', { vehicle_id: car.id })
                .then(({ error }) => {
                    if (error) console.warn('Views RPC error:', error.message);
                });
            // Actualiza el badge en la tarjeta en vivo
            const cardBadge = document.getElementById(`views-card-${car.id}`);
            if (cardBadge) {
                cardBadge.style.display = '';
                cardBadge.innerHTML = `<i class="fas fa-eye"></i> ${newViews} vista${newViews !== 1 ? 's' : ''}`;
            }
        } catch (e) { console.warn('Views update error:', e); }

        // Verify BODY_TYPE_LABELS is defined, otherwise fallback gracefully
        const fallbackBodyType = typeof BODY_TYPE_LABELS !== 'undefined' && BODY_TYPE_LABELS[car.bodyType] ? BODY_TYPE_LABELS[car.bodyType] : car.bodyType || 'Vehículo';
        const fallbackOrigin = typeof ORIGIN_LABELS !== 'undefined' && ORIGIN_LABELS[car.origin] ? ORIGIN_LABELS[car.origin] : car.origin || 'N/A';

        // Init gallery with all images
        modalGallery.init(car.images);

        document.getElementById('modalCategory').textContent = fallbackBodyType.toUpperCase();
        document.getElementById('modalTitle').textContent = car.title;
        document.getElementById('modalPrice').textContent = car.price === 'Consultar' ? 'Consultar Precio' : car.price;
        document.getElementById('modalDescription').textContent = car.description;

        // Availability info
        const availabilityClass = car.availability === 'entrega_inmediata' ? 'available' : 'order';
        const availabilityText = car.availability === 'entrega_inmediata' ? 'Entrega Inmediata' : 'Por Pedido';
        const availabilityIcon = car.availability === 'entrega_inmediata' ? 'fa-bolt' : 'fa-clock';

        const specsContainer = document.getElementById('modalSpecs');
        specsContainer.innerHTML = `
            <div class="modal-spec"><i class="fas fa-calendar"></i> ${car.year}</div>
            <div class="modal-spec"><i class="fas fa-road"></i> ${car.km}</div>
            <div class="modal-spec"><i class="fas fa-engine"></i> ${car.engine}</div>
            <div class="modal-spec"><i class="fas fa-gears"></i> ${car.transmission}</div>
            <div class="modal-spec"><i class="fas fa-gas-pump"></i> ${car.fuel}</div>
            <div class="modal-spec"><i class="fas fa-car"></i> ${fallbackBodyType}</div>
            <div class="modal-spec modal-availability ${availabilityClass}">
                <i class="fas ${availabilityIcon}"></i> ${availabilityText}
            </div>
            <div class="modal-spec modal-origin">
                <i class="fas ${car.origin === 'importado' ? 'fa-globe' : 'fa-flag'}"></i> ${fallbackOrigin}
            </div>
        `;

        const whatsappLink = document.getElementById('modalWhatsapp');
        const priceText = car.price === 'Consultar' ? 'Consultar precio' : car.price;
        whatsappLink.href = `https://wa.me/${window.WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, me interesa el ${car.title} (${car.year}) - ${priceText}. ¿Me pueden cotizar?`)}`;
        whatsappLink.classList.add('track-whatsapp');
        whatsappLink.dataset.title = car.title;
        whatsappLink.innerHTML = '<i class="fab fa-whatsapp"></i> Cotiza tu vehículo';

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if (modal.classList.contains('active') && currentVehicleId) {
            const duration = Math.round((performance.now() - modalStartTime) / 1000);
            if (duration > 1) {
                logAnalyticsEvent('time_spent', {
                    vehicle_id: currentVehicleId,
                    title: currentVehicleTitle,
                    duration_seconds: duration
                });
            }
        }
        modal.classList.remove('active');
        document.body.style.overflow = '';
        currentVehicleId = null;
    }

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
        if (modal.classList.contains('active')) {
            if (e.key === 'ArrowLeft') modalGallery.prev();
            if (e.key === 'ArrowRight') modalGallery.next();
        }
    });

    document.addEventListener('click', (e) => {
        const waBtn = e.target.closest('.track-whatsapp');
        if (waBtn) {
            logAnalyticsEvent('whatsapp_click', { vehicle: waBtn.dataset.title });
        }

        const viewBtn = e.target.closest('.view-details');
        const vehicleCard = e.target.closest('.vehicle-card');

        if (viewBtn) {
            e.preventDefault();
            openModal(viewBtn.dataset.id);
        } else if (vehicleCard && !e.target.closest('a') && !e.target.closest('button')) {
            const viewLink = vehicleCard.querySelector('.view-details');
            if (viewLink) {
                openModal(viewLink.dataset.id);
            }
        }

        // Info Modal links
        const infoBtn = e.target.closest('.open-info-modal');
        if (infoBtn) {
            e.preventDefault();
            openInfoModal(infoBtn.dataset.info);
        }
    });

    // ===== INFO MODAL LOGIC =====
    const infoModal = document.getElementById('infoModal');
    const infoModalClose = document.getElementById('infoModalClose');

    const infoContent = {
        mastertech: {
            title: 'Soporte Técnico MasterTech',
            icon: '<i class="fas fa-wrench"></i>',
            body: 'MasterTech es nuestro centro de servicio especializado y aliado estratégico. Contamos con tecnología de diagnóstico de última generación, técnicos certificados y un amplio stock de repuestos para garantizar que tu vehículo importado reciba el mejor cuidado posible. Desde mantenimientos preventivos hasta reparaciones complejas, MasterTech es el respaldo que tu inversión merece.',
            cta: 'Consultar Servicio'
        },
        mtwash: {
            title: 'MT Wash Detailing',
            icon: '<i class="fas fa-droplet"></i>',
            body: 'MT Wash ofrece servicios de estética automotriz premium. Utilizamos productos de alta gama y técnicas de detallado profesional para proteger la pintura de tu vehículo, limpiar profundamente el interior y mantener ese brillo de salón por mucho más tiempo. Es el complemento ideal para que tu SemiNuevo luzca siempre como el primer día.',
            cta: 'Agendar Lavado'
        }
    };

    function openInfoModal(type) {
        const content = infoContent[type];
        if (!content) return;

        document.getElementById('infoModalIcon').innerHTML = content.icon;
        document.getElementById('infoModalTitle').textContent = content.title;
        document.getElementById('infoModalBody').textContent = content.body;
        document.getElementById('infoModalCta').innerHTML = `<i class="fab fa-whatsapp"></i> ${content.cta}`;

        infoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeInfoModal() {
        infoModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    infoModalClose?.addEventListener('click', closeInfoModal);
    infoModal?.addEventListener('click', (e) => {
        if (e.target === infoModal) closeInfoModal();
    });

    // ===== STATS COUNTER =====
    const statNumbers = document.querySelectorAll('.stat-number');
    let statsAnimated = false;

    function animateStats() {
        if (statsAnimated) return;
        statsAnimated = true;

        statNumbers.forEach(el => {
            const target = parseInt(el.dataset.target);
            const duration = 2000;
            const start = performance.now();

            function update(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out quad
                const eased = 1 - (1 - progress) * (1 - progress);
                el.textContent = Math.floor(eased * target);
                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    el.textContent = target;
                }
            }

            requestAnimationFrame(update);
        });
    }

    // ===== SCROLL ANIMATIONS =====
    function observeAnimations() {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
        );

        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            observer.observe(el);
        });
    }

    // Add animations to static elements
    document.querySelectorAll('.service-card, .testimonial-card, .stat-item, .value-item').forEach(el => {
        el.classList.add('animate-on-scroll');
    });

    observeAnimations();

    // Stats animation on scroll
    const statsSection = document.querySelector('.stats-bar');
    if (statsSection) {
        const statsObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        animateStats();
                        statsObserver.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );
        statsObserver.observe(statsSection);
    }

    // ===== CONTACT FORM =====
    const contactForm = document.getElementById('contactForm');
    contactForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = contactForm.querySelector('button[type="submit"]');
        if (!submitBtn) return;
        const originalText = submitBtn.innerHTML;

        const name = document.getElementById('formName').value;
        const phone = document.getElementById('formPhone').value;
        const email = document.getElementById('formEmail').value;
        const service = document.getElementById('formService').value;
        const message = document.getElementById('formMessage').value;

        // 1. Save to Supabase (Async background)
        const formData = {
            name, phone, email, service,
            message: message || 'Interesado en ' + service,
            status: 'new'
        };

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

            // Attempt to save to DB but don't block WhatsApp if it's slow
            const { error } = await supabaseClient.from('inquiries').insert([formData]);
            if (error) console.warn("Supabase insert error:", error);

            // 2. Open WhatsApp
            const waMessage = `¡Hola! Soy *${name}*.\n\n` +
                `📧 Email: ${email}\n` +
                `📱 Teléfono: ${phone}\n` +
                `🔧 Servicio: ${service}\n\n` +
                `💬 Mensaje: ${message || 'Sin mensaje adicional'}`;

            const waUrl = `https://wa.me/${window.WHATSAPP_NUMBER}?text=${encodeURIComponent(waMessage)}`;
            window.open(waUrl, '_blank');

            alert('¡Gracias! Hemos recibido tu mensaje y te estamos redirigiendo a WhatsApp.');
            contactForm.reset();
        } catch (err) {
            console.error('Error in contact flow:', err);
            // Fallback to pure WhatsApp
            window.open(`https://wa.me/${window.WHATSAPP_NUMBER}?text=${encodeURIComponent(name + " - Consulta")}`, '_blank');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });

    // ===== SMOOTH SCROLL ENHANCEMENT =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            // Skip links inside modals, card footers, or non-section anchors
            if (this.closest('.vehicle-card-footer') || this.closest('.modal') || this.classList.contains('view-details')) return;
            const targetId = this.getAttribute('href');
            if (!targetId || targetId === '#' || targetId.length < 2) return;
            // Validate it's a proper CSS ID selector
            try {
                const target = document.querySelector(targetId);
                if (target) {
                    e.preventDefault();
                    const navHeight = navbar.offsetHeight;
                    const targetPos = target.offsetTop - navHeight - 20;
                    window.scrollTo({
                        top: targetPos,
                        behavior: 'smooth'
                    });
                }
            } catch (err) {
                // Invalid selector, let the browser handle it normally
            }
        });
    });

    // ===== COST CALCULATOR (Puerto Libre / Nacional) =====
    const calcStatus = document.getElementById('calcStatus');
    const calcFieldsPL = document.getElementById('calcFieldsPL');
    const calcNacionalNotice = document.getElementById('calcNacionalNotice');
    const calcResults = document.getElementById('calcResults');

    calcStatus?.addEventListener('change', () => {
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

    function updateCalc() {
        const baseCost = parseFloat(document.getElementById('calcBaseCost').value) || 0;
        const fmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Math.round(val));

        // Reset all to $0 if no base cost
        if (baseCost <= 0) {
            const ids = ['resBase', 'resBuyFee', 'resInternetFee', 'resAuctionServiceFee', 'resEnvFee',
                'resTitleFee', 'resStateTax', 'resBrokerFee', 'resServiceFee', 'resFlete',
                'resAduana', 'resDocVzla', 'resTraslado', 'resRepuesto', 'resKit', 'resWarranty',
                'resTotal', 'resTotalMax'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '$0'; });
            return;
        }

        // === TARIFAS DE SUBASTA ===
        const buyFee = baseCost * 0.10;       // Tarifa de compra de subasta: 10%
        const internetFee = 160;              // Tarifa de oferta por internet: $160
        const auctionServiceFee = 95;         // Tarifa de servicio de subasta: $95
        const envFee = 15;                    // Tarifas ambientales: $15
        const titleFee = 20;                  // Trámite de título in USA: $20
        const stateTax = baseCost * 0.07;     // Impuestos del estado: 7%
        const brokerFee = 500;                // Tarifa broker: $500
        const serviceFee = 900;               // Tarifa de servicio: $900

        const flete = 3500;
        const aduana = 3500;
        const docVzla = 1000;
        // costTraslado viene directo del select (ya incluye el costo base de la grúa por ubicación)
        const costTraslado = parseFloat(document.getElementById('calcState').value) || 0;
        const includeRepairs1 = document.getElementById('calcRepairs1').checked;
        const includeRepairs2 = document.getElementById('calcRepairs2').checked;
        const repuesto = (includeRepairs1 ? baseCost * 0.12 : 0) + (includeRepairs2 ? baseCost * 0.20 : 0);
        const includeKit = document.getElementById('calcMaintenanceKit').checked;
        const kit = includeKit ? 300 : 0;
        const includeWarranty = document.getElementById('calcWarranty') ? document.getElementById('calcWarranty').checked : false;
        const warranty = includeWarranty ? 1500 : 0;

        const total = baseCost + buyFee + internetFee + auctionServiceFee + envFee + titleFee + stateTax + brokerFee + serviceFee + flete + aduana + docVzla + costTraslado + repuesto + kit + warranty;
        const totalMax = total * 1.10;

        document.getElementById('resBase').textContent = fmt(baseCost);
        document.getElementById('resBuyFee').textContent = fmt(buyFee);
        document.getElementById('resInternetFee').textContent = fmt(internetFee);
        document.getElementById('resAuctionServiceFee').textContent = fmt(auctionServiceFee);
        document.getElementById('resEnvFee').textContent = fmt(envFee);
        document.getElementById('resTitleFee').textContent = fmt(titleFee);
        document.getElementById('resStateTax').textContent = fmt(stateTax);
        document.getElementById('resBrokerFee').textContent = fmt(brokerFee);
        document.getElementById('resServiceFee').textContent = fmt(serviceFee);
        document.getElementById('resFlete').textContent = fmt(flete);
        document.getElementById('resAduana').textContent = fmt(aduana);
        document.getElementById('resDocVzla').textContent = fmt(docVzla);
        document.getElementById('resTraslado').textContent = fmt(costTraslado);
        document.getElementById('resRepuesto').textContent = fmt(repuesto);
        document.getElementById('resKit').textContent = fmt(kit);
        document.getElementById('resWarranty').textContent = fmt(warranty);
        document.getElementById('resTotal').textContent = fmt(total);
        document.getElementById('resTotalMax').textContent = fmt(totalMax);
    }

    const btnCalculateCost = document.getElementById('btnCalculateCost');
    btnCalculateCost?.addEventListener('click', updateCalc);

    document.getElementById('calcRepairs1')?.addEventListener('change', updateCalc);
    document.getElementById('calcRepairs2')?.addEventListener('change', updateCalc);
    document.getElementById('calcMaintenanceKit')?.addEventListener('change', updateCalc);
    document.getElementById('calcWarranty')?.addEventListener('change', updateCalc);
    document.getElementById('calcBaseCost')?.addEventListener('input', updateCalc);
    document.getElementById('calcState')?.addEventListener('change', updateCalc);

    // ===== TESTIMONIALS CAROUSEL =====
    const testimonialTrack = document.getElementById('testimonialTrack');
    const testimonialPrev = document.getElementById('testimonialPrev');
    const testimonialNext = document.getElementById('testimonialNext');
    const testimonialDots = document.getElementById('testimonialDots');

    if (testimonialTrack) {
        const slides = testimonialTrack.querySelectorAll('.carousel-slide');
        let currentSlide = 0;
        let autoplayInterval;

        // Create dots
        slides.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.classList.add('carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToSlide(i));
            testimonialDots.appendChild(dot);
        });

        function goToSlide(index) {
            currentSlide = index;
            testimonialTrack.style.transform = `translateX(-${index * 100}%)`;
            testimonialDots.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === index));
        }

        testimonialPrev?.addEventListener('click', () => {
            goToSlide((currentSlide - 1 + slides.length) % slides.length);
            resetAutoplay();
        });
        testimonialNext?.addEventListener('click', () => {
            goToSlide((currentSlide + 1) % slides.length);
            resetAutoplay();
        });

        function startAutoplay() { autoplayInterval = setInterval(() => goToSlide((currentSlide + 1) % slides.length), 5000); }
        function resetAutoplay() { clearInterval(autoplayInterval); startAutoplay(); }
        startAutoplay();
    }

    // ===== PARALLAX EFFECT ON HERO =====
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        const heroContent = document.querySelectorAll('.hero-content');
        heroContent.forEach(content => {
            content.style.transform = `translateY(${scrolled * 0.15}px)`;
            content.style.opacity = 1 - scrolled / 800;
        });
    });


    // ===== AUCTION PUSH FORM =====
    const btnSubmitBid = document.getElementById('btnSubmitBid');
    if (btnSubmitBid) {
        btnSubmitBid.addEventListener('click', () => {
            const link = document.getElementById('auctionLink').value;
            const maxBid = document.getElementById('auctionMaxBid').value;

            if (!link) {
                alert('Por favor inserta el enlace o VIN del lote para continuar.');
                return;
            }

            const message = `Hola, quiero participar en una subasta.%0A%0A*Lote/VIN:* ${link}%0A*Mi puja máxima estimada es:* $${maxBid ? maxBid : 'A discutir con el equipo'}%0A%0A¿Cuáles son los siguientes pasos para gestionar el depósito y habilitar la puja real?`;
            window.open(`https://wa.me/${window.WHATSAPP_NUMBER}?text=${message}`, '_blank');
        });
    }

});

// ===== 0KM HERO VEHICLE INFO MODAL =====
window.openVehicleInfoModal = function (vehicleKey) {
    const overlay = document.getElementById('vehicleInfoModal');
    if (overlay) {
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeVehicleInfoModal = function () {
    const overlay = document.getElementById('vehicleInfoModal');
    if (overlay) {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }
};

// Escape key for vehicle info modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('vehicleInfoModal');
        if (overlay && overlay.classList.contains('open')) {
            window.closeVehicleInfoModal();
        }
    }
});

