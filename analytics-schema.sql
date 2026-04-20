-- Analytics Schema Update
CREATE TABLE IF NOT EXISTS site_analytics (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'click', 'time_spent', 'session_start', 'view'
    event_data JSONB, -- { vehicle_id: 123, duration: 45, label: 'toyota-4runner' }
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE site_analytics ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS TO BE SAFE
DROP POLICY IF EXISTS "Public can insert analytics" ON site_analytics;
DROP POLICY IF EXISTS "Admin full access analytics" ON site_analytics;

-- Allow anyone to insert (public tracking)
CREATE POLICY "Public can insert analytics"
    ON site_analytics FOR INSERT TO anon WITH CHECK (true);

-- Admin full access
CREATE POLICY "Admin full access analytics"
    ON site_analytics FOR ALL TO authenticated USING (true) WITH CHECK (true);
