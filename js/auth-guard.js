/* ==========================================================================
   PoolSafety · Auth Guard
   Se ejecuta ANTES que cualquier otro script de la página.
   Si no hay sesión válida en Supabase → redirige a index.html
   ========================================================================== */

(function () {
  // Ejecuta comprobación asíncrona; mientras tanto oculta el body para evitar flash
  document.documentElement.style.opacity = '0';

  async function checkAuth() {
    if (!window.sb) {
      // Si el SDK aún no ha cargado, reintentamos en 100ms
      return setTimeout(checkAuth, 100);
    }
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (!session) {
        window.location.replace('index.html');
        return;
      }

      // Obtenemos el perfil del usuario
      const { data: usuario, error } = await window.sb
        .from('usuarios')
        .select('rol, empresa_id, activo, email, nombre')
        .eq('id', session.user.id)
        .single();

      if (error || !usuario || !usuario.activo) {
        await window.sb.auth.signOut();
        window.location.replace('index.html');
        return;
      }

      // Comprueba que el rol coincide con la página que intenta acceder
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

      // Exponemos la sesión para que el resto del código la use
      window.PS_SESSION = {
        userId: session.user.id,
        email: session.user.email,
        rol: usuario.rol,
        nombre: usuario.nombre,
        empresa_id: usuario.empresa_id
      };

      // También en localStorage para acceso síncrono
      localStorage.setItem('ps-session', JSON.stringify(window.PS_SESSION));

      // Muestra la página
      document.documentElement.style.opacity = '1';
    } catch (err) {
      console.error('[Auth Guard]', err);
      window.location.replace('index.html');
    }
  }

  checkAuth();
})();

/* Logout real (llamable desde cualquier parte) */
window.logoutReal = async function () {
  try {
    if (window.sb) await window.sb.auth.signOut();
  } catch (e) { /* ignore */ }
  localStorage.removeItem('ps-session');
  localStorage.removeItem('poolsafety-mock-v1');
  window.location.replace('index.html');
};
