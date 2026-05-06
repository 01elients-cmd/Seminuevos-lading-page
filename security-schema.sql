-- =============================================
-- SemiNuevo Agency - Security & Monitoring Schema
-- =============================================

-- 1. Security Logs table
CREATE TABLE IF NOT EXISTS security_logs (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'auth_failure', 'xss_attempt', 'sqli_attempt', 'brute_force', 'unauthorized_access'
    severity TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
    ip_address TEXT,
    details TEXT,
    user_agent TEXT,
    metadata JSONB, -- { path: '/admin', attempts: 5 }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. IP Blacklist table
CREATE TABLE IF NOT EXISTS ip_blacklist (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 3. Enable RLS
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_blacklist ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Allow public to insert security logs (so the app can log even if not logged in)
DROP POLICY IF EXISTS "Public can insert security logs" ON security_logs;
CREATE POLICY "Public can insert security logs"
    ON security_logs FOR INSERT TO anon WITH CHECK (true);

-- Only Admin can read logs
DROP POLICY IF EXISTS "Admin full access security logs" ON security_logs;
CREATE POLICY "Admin full access security logs"
    ON security_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Admin full access to blacklist
DROP POLICY IF EXISTS "Admin full access ip_blacklist" ON ip_blacklist;
CREATE POLICY "Admin full access ip_blacklist"
    ON ip_blacklist FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Helper Function for real-time views
CREATE OR REPLACE FUNCTION get_security_stats()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'critical_events', (SELECT count(*) FROM security_logs WHERE severity = 'critical' AND created_at > NOW() - INTERVAL '24 hours'),
        'total_events_24h', (SELECT count(*) FROM security_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
        'blocked_ips', (SELECT count(*) FROM ip_blacklist WHERE expires_at IS NULL OR expires_at > NOW())
    ) INTO result;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
