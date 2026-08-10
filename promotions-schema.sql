-- ==========================================
--  SEMINUEVOS AGENCY - PROMOTIONS TABLE
--  Run this in Supabase SQL Editor
-- ==========================================

CREATE TABLE IF NOT EXISTS promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    subtitle text,
    description text,
    badge_text text DEFAULT 'OFERTA',
    discount_text text,
    cta_text text DEFAULT 'Ver Oferta',
    cta_url text,
    image_url text,
    bg_color text DEFAULT '#275CEA',
    is_featured boolean DEFAULT false,
    status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    expires_at timestamptz,
    created_at timestamptz DEFAULT now(),
    sort_order int DEFAULT 0
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read promotions" ON promotions FOR SELECT USING (true);
CREATE POLICY "Admin all promotions" ON promotions FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO promotions (title, subtitle, description, badge_text, discount_text, cta_text, cta_url, bg_color, is_featured, sort_order) VALUES
('Toyota Camry 2024', 'Precio Especial de Lanzamiento', 'Financiamiento disponible con cuota inicial desde $5,000. Entrega inmediata en Margarita.', 'OFERTA ESPECIAL', '$2,000 OFF', 'Ver Oferta', '/catalogo', '#275CEA', true, 1),
('Importacion Express', 'Tu vehiculo en 45 dias', 'Trae tu vehiculo favorito desde USA con documentacion completa y soporte MasterTech incluido.', 'SERVICIO PREMIUM', 'Sin Comision', 'Cotizar Ahora', '#contacto', '#1a45b8', false, 2),
('Revision MasterTech', 'Inspeccion de Compra', 'Revision tecnica completa con 50 puntos de inspeccion para tu seminuevo.', 'GRATIS', 'Valor: $150', 'Agendar Cita', '#contacto', '#0f3a9e', false, 3);
