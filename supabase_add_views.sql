-- PASO 1: Agregar columna de vistas (si no existe)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- PASO 2: Crear función RPC para incrementar vistas de forma segura
-- (Esta función bypasea RLS, por eso puede ser llamada desde el frontend)
CREATE OR REPLACE FUNCTION increment_vehicle_views(vehicle_id BIGINT)
RETURNS void AS $$
  UPDATE vehicles 
  SET views = COALESCE(views, 0) + 1 
  WHERE id = vehicle_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- PASO 3: Dar permiso a usuarios anónimos para llamar la función
GRANT EXECUTE ON FUNCTION increment_vehicle_views(BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION increment_vehicle_views(BIGINT) TO authenticated;
