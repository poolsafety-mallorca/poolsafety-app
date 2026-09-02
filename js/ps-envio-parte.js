/* ==========================================================================
   PoolSafety · Envío de un parte de incidencia al correo del hotel (cliente)
   --------------------------------------------------------------------------
   Habla con /.netlify/functions/enviar-parte, que es quien manda el correo de
   verdad. Aquí sólo se pone el token de la sesión y se traducen los códigos de
   error a algo que se entienda sin ser informático.

   Uso:
     const r = await PSEnvioParte.enviar(id);        // lanza error si falla
     const r = await PSEnvioParte.enviarSilencioso(id); // nunca lanza
   ========================================================================== */
(function () {
  'use strict';

  const ENDPOINT = '/.netlify/functions/enviar-parte';

  // Códigos que NO son un fallo del que está usando la app: el envío aún no
  // está activado, o al hotel le falta el correo. Se anotan en consola y se
  // sigue; no tiene sentido asustar a un socorrista con esto.
  const NO_ES_CULPA_TUYA = ['sin_configurar', 'sin_correo', 'ya_enviado'];

  const MENSAJES = {
    sin_configurar: 'El envío automático al hotel todavía no está activado.',
    sin_correo:     'Ese hotel no tiene correo de dirección en su ficha. Ponlo en Hoteles → ficha del hotel → Datos.',
    ya_enviado:     'Ese parte ya se había enviado.',
    no_firmada:     'El parte no está firmado todavía.',
    sin_permiso:    'No tienes permiso para enviar ese parte.',
    no_encontrada:  'No se encuentra ese parte.',
    sin_sesion:     'Se ha cerrado la sesión. Vuelve a entrar.',
    resend_error:   'El servidor de correo rechazó el envío.'
  };

  async function enviar(incidenciaId) {
    if (!window.sb) throw new Error('Supabase no está cargado');
    const { data } = await window.sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { const e = new Error(MENSAJES.sin_sesion); e.codigo = 'sin_sesion'; throw e; }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ incidencia_id: incidenciaId })
    });

    let cuerpo = {};
    try { cuerpo = await res.json(); } catch (_) {}

    // 404 del propio Netlify = la función no está desplegada todavía.
    if (res.status === 404 && !cuerpo.codigo) {
      const e = new Error(MENSAJES.sin_configurar); e.codigo = 'sin_configurar'; e.leve = true; throw e;
    }
    if (!res.ok) {
      const cod = cuerpo.codigo || 'error';
      const e = new Error(cuerpo.error || MENSAJES[cod] || ('Error ' + res.status));
      e.codigo = cod;
      e.leve = NO_ES_CULPA_TUYA.indexOf(cod) >= 0;
      throw e;
    }
    return cuerpo;   // { ok, codigo:'enviado'|'ya_enviado', enviado_a, modo, adjunto }
  }

  // Para el momento en que el socorrista firma: si esto falla, el parte YA está
  // guardado y el coordinador lo tiene. El envío al hotel se puede reintentar
  // después desde el panel, así que aquí no se interrumpe nada.
  async function enviarSilencioso(incidenciaId) {
    try {
      const r = await enviar(incidenciaId);
      console.log('[parte→hotel]', r.codigo, r.enviado_a || '');
      return r;
    } catch (err) {
      console.warn('[parte→hotel] no se envió:', err.codigo || '', err.message);
      return { ok: false, codigo: err.codigo || 'error', error: err.message };
    }
  }

  function mensaje(codigo) { return MENSAJES[codigo] || 'No se pudo enviar.'; }

  window.PSEnvioParte = { enviar, enviarSilencioso, mensaje, ENDPOINT };
})();
