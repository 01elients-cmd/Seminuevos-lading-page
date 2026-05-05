/**
 * Supabase Configuration
 * =====================
 */
const SUPABASE_URL = 'https://gfvmugsbizmvlziljxir.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g0Iw9r4zRCBadMPtiF5kNA_x8_n4p8v';

// Initialize Supabase client (use window._supabase to avoid name conflict with CDN)
const _sb = window.supabase;
const supabaseClient = _sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
