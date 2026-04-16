-- Ejecutar en Supabase SQL Editor
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
