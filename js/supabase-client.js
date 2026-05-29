const SUPABASE_URL = 'https://iielilbntkihneypuywk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWxpbGJudGtpaG5leXB1eXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTI4NzUsImV4cCI6MjA5NTYyODg3NX0.4yKu94Wy6ksL_t33x6M7ARCXmrQzZi1C6yjsbZAuFMg';

// Carga el SDK de Supabase desde CDN (compatible con HTML puro, sin bundler)
// Este archivo se incluye con <script> antes de cualquier otro JS de la app

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
