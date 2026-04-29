-- CRM & Lead Tracking Schema
ALTER TABLE site_analytics ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS visitor_id TEXT;

-- New table for CRM Leads
CREATE TABLE IF NOT EXISTS site_leads (
    id BIGSERIAL PRIMARY KEY,
    visitor_id TEXT UNIQUE NOT NULL,
    email TEXT,
    name TEXT,
    phone TEXT,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    tags TEXT[] DEFAULT '{}', -- ['interesado_toyota', 'alto_valor']
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE site_leads ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Public can update leads" ON site_leads;
CREATE POLICY "Public can update leads"
    ON site_leads FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access leads" ON site_leads;
CREATE POLICY "Admin full access leads"
    ON site_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function to sync leads from inquiries
CREATE OR REPLACE FUNCTION sync_inquiry_to_leads()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO site_leads (visitor_id, email, name, phone, last_active)
    VALUES (NEW.visitor_id, NEW.email, NEW.name, NEW.phone, NOW())
    ON CONFLICT (visitor_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        last_active = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_inquiry_to_leads ON inquiries;
CREATE TRIGGER tr_sync_inquiry_to_leads
    AFTER INSERT ON inquiries
    FOR EACH ROW EXECUTE FUNCTION sync_inquiry_to_leads();
