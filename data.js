/**
 * ============================================
 *  DATOS DEL INVENTARIO DE VEHÍCULOS - SEMINUEVO
 * ============================================
 * 
 * Este archivo ahora sirve como estructura base. 
 * El inventario real se gestiona desde el Panel de Administración (Supabase).
 */

const vehiclesSeminuevos = [];
const vehicles0km = [];

// Combinación para compatibilidad
const allVehicles = [];

/**
 *  NÚMERO DE WHATSAPP PARA CONSULTAS
 */
const WHATSAPP_NUMBER = "584147977832";

/**
 *  INFORMACIÓN DE LA EMPRESA
 */
const COMPANY_INFO = {
    name: "SemiNuevos Agency",
    slogan: "Conduce a Otro Nivel",
    phone: "+58 414-797-7832",
    email: "info@seminuevosagency.com",
    address: "Porlamar, Isla de Margarita, Venezuela",
    hours: "Lun - Sáb: 9:00 AM - 7:00 PM",
    socialMedia: {
        facebook: "#",
        instagram: "https://www.instagram.com/seminuevosagency/",
        tiktok: "#",
        youtube: "#"
    }
};

/**
 *  LABELS PARA LOS FILTROS
 */
const BODY_TYPE_LABELS = {
    sedan: "Sedán",
    suv: "SUV",
    pickup: "Pickup",
    deportivo: "Deportivo",
    coupe: "Coupé",
    hatchback: "Hatchback"
};

const ORIGIN_LABELS = {
    nacional: "Nacional",
    importado: "Importado"
};

const CONDITION_LABELS = {
    seminuevo: "Seminuevo",
    "0km": "0 KM"
};

const AVAILABILITY_LABELS = {
    entrega_inmediata: "Entrega Inmediata",
    por_pedido: "Por Pedido"
};
