-- =============================================
-- SemiNuevo Agency - Supabase Database Schema
-- =============================================
-- Safe to run multiple times (uses IF NOT EXISTS)

-- 1. Vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    price TEXT NOT NULL,
    year INTEGER NOT NULL,
    km TEXT DEFAULT '0 KM',
    engine TEXT DEFAULT '',
    transmission TEXT DEFAULT 'Automático',
    fuel TEXT DEFAULT 'Gasolina',
    body_type TEXT DEFAULT 'suv',
    condition TEXT DEFAULT 'seminuevo',
    availability TEXT DEFAULT 'entrega_inmediata',
    origin TEXT DEFAULT 'importado',
    badge TEXT,
    description TEXT DEFAULT '',
    images TEXT[] DEFAULT '{}',
    catalog TEXT DEFAULT 'seminuevos',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Site settings table
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    service TEXT,
    message TEXT,
    vehicle_id BIGINT REFERENCES vehicles(id),
    status TEXT DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies (safe cleanup)
DROP POLICY IF EXISTS "Public can read active vehicles" ON vehicles;
DROP POLICY IF EXISTS "Public can read settings" ON site_settings;
DROP POLICY IF EXISTS "Public can insert inquiries" ON inquiries;
DROP POLICY IF EXISTS "Admin full access vehicles" ON vehicles;
DROP POLICY IF EXISTS "Admin full access settings" ON site_settings;
DROP POLICY IF EXISTS "Admin full access inquiries" ON inquiries;
DROP POLICY IF EXISTS "Public can view images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete images" ON storage.objects;

-- 6. Recreate policies
CREATE POLICY "Public can read active vehicles"
    ON vehicles FOR SELECT USING (status = 'active');

CREATE POLICY "Public can read settings"
    ON site_settings FOR SELECT TO anon USING (true);

CREATE POLICY "Public can insert inquiries"
    ON inquiries FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Admin full access vehicles"
    ON vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access settings"
    ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access inquiries"
    ON inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vehicles_updated_at ON vehicles;
CREATE TRIGGER vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 8. Storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('vehicle-images', 'vehicle-images', true)
ON CONFLICT DO NOTHING;

-- 9. Storage policies
CREATE POLICY "Public can view images"
    ON storage.objects FOR SELECT TO anon USING (bucket_id = 'vehicle-images');

CREATE POLICY "Authenticated users can upload images"
    ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vehicle-images');

CREATE POLICY "Authenticated users can delete images"
    ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'vehicle-images');

-- 10. Default settings
INSERT INTO site_settings (key, value) VALUES
    ('whatsapp_number', '"584147977832"'),
    ('company_name', '"SemiNuevo"'),
    ('company_slogan', '"Compra, Consigue, Accede"'),
    ('company_address', '"Porlamar, Isla de Margarita"'),
    ('company_hours', '"Lun - Sáb: 9:00 AM - 6:00 PM"'),
    ('social_facebook', '"https://www.facebook.com"'),
    ('social_instagram', '"https://www.instagram.com"'),
    ('social_tiktok', '"https://www.tiktok.com"'),
    ('social_youtube', '"https://www.youtube.com"')
ON CONFLICT (key) DO NOTHING;
