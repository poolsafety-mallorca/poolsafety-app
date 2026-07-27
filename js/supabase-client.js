/* ==========================================================================
   PoolSafety · Cliente Supabase (conexión a la BD real)
   La anon key es pública por diseño — RLS protege los datos por rol.
   ========================================================================== */

const SUPABASE_URL = 'https://msdjsbegqpjpshnxoilh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI';

// El SDK viene por CDN antes de este script y expone window.supabase.createClient
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

/* Test de conexión — al cargar cualquier página se comprueba en consola */
(async function testConnection() {
  try {
    const { data, error } = await window.sb.from('_supabase_check').select('*').limit(1);
    // Si la tabla no existe (esperado antes del schema), sale error 42P01 = tabla no existe
    if (error && error.code === '42P01') {
      console.log('%c[Supabase] ✅ Conectado a poolsafety-app-prod · falta aplicar el schema SQL', 'color:#0EA5E9;font-weight:bold');
    } else if (error) {
      console.warn('[Supabase] Conectado pero:', error.message);
    } else {
      console.log('%c[Supabase] ✅ Conectado y schema aplicado', 'color:#10B981;font-weight:bold');
    }
  } catch (e) {
    console.error('[Supabase] ❌ No se pudo conectar', e);
  }
})();

/* Helpers globales para el resto del código de la app */
window.PSDB = {
  client: window.sb,

  // Auth
  async signIn(email, password) {
    return await window.sb.auth.signInWithPassword({ email, password });
  },
  async signUp(email, password, metadata = {}) {
    return await window.sb.auth.signUp({ email, password, options: { data: metadata } });
  },
  async signOut() {
    return await window.sb.auth.signOut();
  },
  async currentUser() {
    const { data } = await window.sb.auth.getUser();
    return data.user;
  },

  // CRUD genérico
  async list(table, filter = {}) {
    let q = window.sb.from(table).select('*');
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async get(table, id) {
    const { data, error } = await window.sb.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async insert(table, row) {
    const { data, error } = await window.sb.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async update(table, id, patch) {
    const { data, error } = await window.sb.from(table).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async remove(table, id) {
    const { error } = await window.sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },

  // Storage (para fotos y PDFs firmados)
  async uploadFile(bucket, path, file) {
    const { data, error } = await window.sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) throw error;
    return window.sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
};
