/* ==========================================================================
   PoolSafety · Auth Guard
   Se ejecuta ANTES que cualquier otro script de la página.
   Si no hay sesión válida en Supabase → redirige a index.html
   ========================================================================== */

(function () {
  // 1. SÍNCRONO: cargamos sesión cacheada de localStorage para que
  //    otros scripts que corren después nos vean listos.
  const cached = localStorage.getItem('ps-session');
  if (cached) {
    try { window.PS_SESSION = JSON.parse(cached); } catch (e) {}
  }

  // 2. Ocultamos página hasta terminar auth check
  document.documentElement.style.opacity = '0';

  // Si ya teníamos cache, mostramos la página YA (evita flash blanco)
  if (window.PS_SESSION) {
    document.documentElement.style.opacity = '1';
  }

  async function checkAuth() {
    if (!window.sb) return setTimeout(checkAuth, 100);
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (!session) {
        localStorage.removeItem('ps-session');
        window.location.replace('index.html');
        return;
      }

      let { data: usuario, error } = await window.sb
        .from('usuarios')
        .select('rol, empresa_id, activo, email, nombre')
        .eq('id', session.user.id)
        .single();

      // AUTO-REPARACIÓN: si hay auth válido pero NO existe fila en usuarios,
      // significa que la creación en su momento falló a la mitad (cuenta huérfana).
      // Recuperamos rol y nombre de los metadatos del signUp original y creamos la fila.
      if (error && error.code === 'PGRST116') {
        const meta = session.user.user_metadata || {};
        const rolMeta = ['dueno','coordinador','socorrista'].includes(meta.rol) ? meta.rol : 'socorrista';
        const nombreMeta = (meta.nombre || session.user.email.split('@')[0]).trim();
        // Empresa por defecto: la primera visible (con RLS es la única accesible)
        const { data: empresas } = await window.sb.from('empresas').select('id').limit(1);
        const empresaId = (empresas && empresas[0] && empresas[0].id) || null;
        if (empresaId) {
          const { error: insErr } = await window.sb.from('usuarios').insert({
            id: session.user.id, email: session.user.email,
            rol: rolMeta, nombre: nombreMeta,
            empresa_id: empresaId, activo: true
          });
          if (!insErr) {
            console.info('[Auth Guard] Cuenta huérfana auto-reparada:', session.user.email);
            // También crea fila empleado si es socorrista y no la tiene
            if (rolMeta === 'socorrista') {
              await window.sb.from('empleados').insert({
                usuario_id: session.user.id, empresa_id: empresaId,
                nombre: nombreMeta, email: session.user.email,
                estado: 'alta-pendiente'
              }).select().maybeSingle();
            }
            const { data: reload } = await window.sb.from('usuarios')
              .select('rol, empresa_id, activo, email, nombre')
              .eq('id', session.user.id).single();
            usuario = reload;
            error = null;
          }
        }
      }

      if (error || !usuario || !usuario.activo) {
        await window.sb.auth.signOut();
        localStorage.removeItem('ps-session');
        window.location.replace('index.html');
        return;
      }

      const path = window.location.pathname.toLowerCase();
      const isSocorristaPage = path.includes('socorrista');
      const isCoordPage = path.includes('coordinador');
      if (isSocorristaPage && usuario.rol !== 'socorrista') {
        window.location.replace('coordinador.html');
        return;
      }
      if (isCoordPage && !['dueno','coordinador'].includes(usuario.rol)) {
        window.location.replace('socorrista.html');
        return;
      }

      // Actualiza PS_SESSION con datos frescos de la BD
      window.PS_SESSION = {
        userId: session.user.id,
        email: session.user.email,
        rol: usuario.rol,
        nombre: usuario.nombre,
        empresa_id: usuario.empresa_id
      };
      localStorage.setItem('ps-session', JSON.stringify(window.PS_SESSION));

      // Notifica a los scripts de página para que refresquen cabecera con nombre real
      document.dispatchEvent(new CustomEvent('ps-session-updated', { detail: window.PS_SESSION }));

      document.documentElement.style.opacity = '1';
    } catch (err) {
      console.error('[Auth Guard]', err);
      window.location.replace('index.html');
    }
  }

  checkAuth();
})();

/* Logout real */
window.logoutReal = async function () {
  try { if (window.sb) await window.sb.auth.signOut(); } catch (e) {}
  localStorage.removeItem('ps-session');
  localStorage.removeItem('poolsafety-mock-v1');
  window.location.replace('index.html');
};
