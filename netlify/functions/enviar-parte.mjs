/* ==========================================================================
   PoolSafety · Envío de un parte de incidencia al correo del hotel
   --------------------------------------------------------------------------
   POST /.netlify/functions/enviar-parte
     Cabecera : Authorization: Bearer <token de sesión de Supabase>
     Cuerpo   : { "incidencia_id": "uuid" }

   POR QUÉ EXISTE ESTO
   La app es una web estática: el navegador del socorrista NO puede mandar
   correos, y meter una clave de correo en el código sería publicarla (el
   repositorio es público). Esta función se ejecuta en el servidor de Netlify,
   que sí guarda claves en secreto.

   QUÉ COMPRUEBA ANTES DE MANDAR NADA
     1. Que quien llama tiene sesión iniciada de verdad.
     2. Que el parte es de SU empresa, y que es suyo o es coordinador/dueño.
     3. Que el parte está firmado (los borradores no se mandan).
     4. Que el hotel tiene correo puesto.
     5. Que no se ha mandado ya (un correo no se puede desenviar).

   DOS MODOS DE ENVÍO — se elige con la variable PARTES_MODO en Netlify:
     · operativo (POR DEFECTO) → resumen de lo ocurrido y de la actuación, SIN
       nombre, DNI, teléfono ni habitación de la persona atendida.
     · integro → además adjunta el parte completo en PDF, con los datos
       identificativos y de salud de la víctima.
   El modo íntegro manda datos de salud (categoría especial, art. 9 RGPD) a un
   tercero: sólo debe activarse si el contrato con el hotel lo ampara.

   VARIABLES DE ENTORNO (Netlify → Site settings → Environment variables)
     RESEND_API_KEY             obligatoria
     PARTES_REMITENTE           obligatoria, p.ej. "PoolSafety <partes@tudominio.es>"
     SUPABASE_SERVICE_ROLE_KEY  obligatoria
     SUPABASE_URL               opcional (hay valor por defecto)
     SUPABASE_ANON_KEY          opcional (hay valor por defecto)
     PARTES_MODO                opcional: "operativo" (defecto) | "integro"
     PARTES_COPIA               opcional: correo en copia oculta (la empresa)
   ========================================================================== */

const SUPABASE_URL_DEF = 'https://msdjsbegqpjpshnxoilh.supabase.co';
const SUPABASE_ANON_DEF = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI';

const TIPOS = {
  ahogamiento: 'Ahogamiento / sumersión', caida: 'Caída / traumatismo',
  corte: 'Corte / herida sangrante', golpe: 'Golpe / contusión',
  insolacion: 'Insolación / golpe de calor', quemadura: 'Quemadura (sol o química)',
  picadura: 'Picadura / mordedura', alergia: 'Reacción alérgica',
  crisis: 'Crisis (epilepsia, diabetes…)', lipotimia: 'Lipotimia / mareo',
  malestar: 'Malestar / dolor', otros: 'Otros'
};
const TECNICAS = {
  rcp: 'RCP (masaje cardiaco)', desa: 'DESA / desfibrilador', oxigeno: 'Oxigenoterapia',
  ambu: 'Ambú / ventilación asistida', via_aerea: 'Apertura vía aérea',
  posicion_seguridad: 'Posición lateral de seguridad', hemostasia: 'Presión / hemostasia',
  vendaje: 'Vendaje / cura', inmovilizacion: 'Inmovilización de zona',
  traslado: 'Traslado seguro fuera del agua', observacion: 'Observación / vigilancia',
  aviso_112: 'Aviso al 112', aviso_familia: 'Aviso a familia'
};
const DERIVACIONES = {
  atendida_puesto: 'Atendida en el puesto — se retira por su pie',
  traslado_propio: 'Se traslada por medios propios',
  ambulancia: 'Traslado en ambulancia (llamada al 112)',
  hospital: 'Traslado directo a hospital',
  rechaza_atencion: 'Rechaza la atención (firma renuncia aparte)'
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });

const fallo = (codigo, mensaje, status) => json({ ok: false, codigo, error: mensaje }, status);

function fechaLarga(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid'
  });
}

function listaDe(arr, mapa) {
  if (!Array.isArray(arr) || !arr.length) return '—';
  return arr.map((v) => mapa[v] || v).join(', ');
}

/* ---------- Llamadas a la API REST de Supabase con la clave de servicio ---------- */
function restUrl(base, path) { return base.replace(/\/+$/, '') + '/rest/v1/' + path; }

async function sbSelect(base, key, path) {
  const r = await fetch(restUrl(base, path), {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function sbUpdate(base, key, path, cuerpo) {
  const r = await fetch(restUrl(base, path), {
    method: 'PATCH',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', Prefer: 'return=minimal'
    },
    body: JSON.stringify(cuerpo)
  });
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

/* ---------- Cuerpo del correo ---------- */
function construirEmail(inc, hotel, socorristaNombre, modo) {
  const tipo = TIPOS[inc.tipo_incidente] || inc.tipo_incidente || 'Incidencia';
  const cabecera = inc.derivacion === 'ambulancia' || inc.derivacion === 'hospital'
    ? '#B91C1C' : '#0F766E';

  const filas = [];
  const fila = (k, v) => { if (v && v !== '—') filas.push([k, v]); };

  fila('Parte nº', inc.numero_parte);
  fila('Fecha y hora', fechaLarga(inc.fecha_incidente));
  fila('Instalación', hotel.nombre);
  fila('Lugar exacto', inc.ubicacion_descripcion);
  fila('Tipo', tipo);
  if (inc.es_menor) fila('Persona atendida', 'Menor de edad');
  fila('Qué ocurrió', inc.circunstancias);
  fila('Estado al llegar el socorrista', [
    inc.consciente === false ? 'inconsciente' : inc.consciente === true ? 'consciente' : null,
    inc.respira === false ? 'no respiraba' : inc.respira === true ? 'respiraba' : null,
    inc.sangrado === true ? 'con sangrado' : null
  ].filter(Boolean).join(', '));
  fila('Actuación', inc.actuacion);
  fila('Técnicas aplicadas', listaDe(inc.tecnicas_aplicadas, TECNICAS));
  fila('Desenlace', DERIVACIONES[inc.derivacion] || inc.derivacion);
  fila('Ambulancia', inc.ambulancia_numero);
  fila('Hospital', inc.hospital);
  fila('Socorrista', socorristaNombre);

  if (modo === 'integro') {
    fila('Persona atendida', [
      inc.victima_nombre, inc.victima_edad ? inc.victima_edad + ' años' : null,
      inc.victima_hotel_habitacion ? 'hab. ' + inc.victima_hotel_habitacion : null
    ].filter(Boolean).join(' · '));
  }

  const tabla = filas.map(([k, v]) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #E2E8F0;color:#475569;font-size:13px;width:38%;vertical-align:top;">${esc(k)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:13.5px;font-weight:600;">${esc(v)}</td>
    </tr>`).join('');

  const nota = modo === 'integro'
    ? `Se adjunta el parte completo firmado en PDF. Contiene datos personales y de
       salud de la persona atendida: trátelo de forma confidencial y consérvelo
       únicamente el tiempo necesario.`
    : `Por protección de datos no se incluyen el nombre, DNI, teléfono ni la
       habitación de la persona atendida. Si necesita el parte completo para un
       parte al seguro o una reclamación, solicítelo a PoolSafety y se lo
       facilitaremos por el cauce que corresponda.`;

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:18px 12px;">
    <div style="background:${cabecera};color:#fff;border-radius:12px 12px 0 0;padding:18px 20px;">
      <div style="font-size:11px;letter-spacing:.6px;text-transform:uppercase;opacity:.85;">PoolSafety · Parte de incidencia</div>
      <div style="font-size:19px;font-weight:700;margin-top:4px;">${esc(tipo)}</div>
      <div style="font-size:13px;opacity:.9;margin-top:3px;">${esc(hotel.nombre || '')} · ${esc(fechaLarga(inc.fecha_incidente))}</div>
    </div>
    <div style="background:#fff;padding:6px 0 0;">
      <table style="width:100%;border-collapse:collapse;">${tabla}</table>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:14px 20px 18px;">
      <div style="font-size:12.5px;color:#64748B;line-height:1.5;">${nota}</div>
    </div>
    <div style="text-align:center;color:#94A3B8;font-size:11.5px;margin-top:14px;line-height:1.5;">
      Enviado automáticamente por PoolSafety Des Llevant, S.L. al firmarse el parte.<br>
      Este correo es una comunicación de servicio, no requiere respuesta.
    </div>
  </div></body></html>`;

  const texto = filas.map(([k, v]) => k + ': ' + v).join('\n') + '\n\n' + nota.replace(/\s+/g, ' ').trim();

  return {
    asunto: `Parte de incidencia ${inc.numero_parte || ''} · ${hotel.nombre || ''} · ${tipo}`.replace(/\s+/g, ' ').trim(),
    html,
    texto
  };
}

/* ========================================================================== */
export default async (req) => {
  if (req.method !== 'POST') return fallo('metodo', 'Usa POST.', 405);

  const SUPABASE_URL = process.env.SUPABASE_URL || SUPABASE_URL_DEF;
  const ANON = process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_DEF;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND = process.env.RESEND_API_KEY;
  const REMITENTE = process.env.PARTES_REMITENTE;
  const MODO = (process.env.PARTES_MODO || 'operativo').toLowerCase() === 'integro' ? 'integro' : 'operativo';
  const COPIA = process.env.PARTES_COPIA || '';

  // Sin configurar todavía: se responde con claridad y NO se toca nada. La app
  // trata este caso en silencio, para que al socorrista no le salte un error
  // por algo que no depende de él.
  if (!RESEND || !REMITENTE || !SERVICE) {
    const faltan = [
      !RESEND ? 'RESEND_API_KEY' : null,
      !REMITENTE ? 'PARTES_REMITENTE' : null,
      !SERVICE ? 'SUPABASE_SERVICE_ROLE_KEY' : null
    ].filter(Boolean).join(', ');
    return fallo('sin_configurar',
      'El envío de partes por correo aún no está activado. Faltan variables en Netlify: ' + faltan, 503);
  }

  let cuerpo;
  try { cuerpo = await req.json(); } catch (_) { cuerpo = null; }
  const incidenciaId = cuerpo && cuerpo.incidencia_id;
  if (!incidenciaId || !/^[0-9a-f-]{36}$/i.test(incidenciaId)) {
    return fallo('id_invalido', 'Falta el identificador del parte.', 400);
  }

  // ---- 1) ¿Quién llama? ----------------------------------------------------
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return fallo('sin_sesion', 'Hay que iniciar sesión.', 401);

  const rUser = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
    headers: { apikey: ANON, Authorization: 'Bearer ' + token }
  });
  if (!rUser.ok) return fallo('sin_sesion', 'La sesión ha caducado. Vuelve a entrar.', 401);
  const usuarioAuth = await rUser.json();

  try {
    // ---- 2) Rol y empresa del que llama -----------------------------------
    const usuarios = await sbSelect(SUPABASE_URL, SERVICE,
      `usuarios?id=eq.${usuarioAuth.id}&select=id,rol,empresa_id&limit=1`);
    const yo = usuarios[0];
    if (!yo) return fallo('sin_permiso', 'Tu usuario no está dado de alta en ninguna empresa.', 403);

    // ---- 3) El parte -------------------------------------------------------
    const incs = await sbSelect(SUPABASE_URL, SERVICE,
      `incidencias?id=eq.${incidenciaId}&select=*,empleados(id,nombre,usuario_id),puestos(id,nombre,email_direccion)&limit=1`);
    const inc = incs[0];
    if (!inc) return fallo('no_encontrada', 'Ese parte no existe.', 404);
    if (inc.empresa_id !== yo.empresa_id) return fallo('sin_permiso', 'Ese parte no es de tu empresa.', 403);

    const esAdmin = yo.rol === 'dueno' || yo.rol === 'coordinador';
    const esSuyo = inc.empleados && inc.empleados.usuario_id === usuarioAuth.id;
    if (!esAdmin && !esSuyo) return fallo('sin_permiso', 'Sólo puedes enviar tus propios partes.', 403);

    // ---- 4) Comprobaciones antes de mandar ---------------------------------
    if (inc.estado !== 'firmada') {
      return fallo('no_firmada', 'El parte todavía no está firmado, no se envía.', 409);
    }
    if (inc.email_enviado_at) {
      return json({ ok: true, codigo: 'ya_enviado', enviado_a: inc.email_enviado_a, enviado_at: inc.email_enviado_at });
    }
    const hotel = inc.puestos || {};
    const destino = (hotel.email_direccion || '').trim();
    if (!destino || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(destino)) {
      return fallo('sin_correo',
        'El hotel "' + (hotel.nombre || '—') + '" no tiene correo de dirección puesto en su ficha.', 409);
    }

    // ---- 5) Adjunto (sólo en modo íntegro) ---------------------------------
    const adjuntos = [];
    if (MODO === 'integro' && inc.archivo_pdf_url) {
      try {
        const rPdf = await fetch(inc.archivo_pdf_url);
        if (rPdf.ok) {
          const buf = Buffer.from(await rPdf.arrayBuffer());
          if (buf.length > 0 && buf.length < 15 * 1024 * 1024) {
            adjuntos.push({
              filename: `Parte-${inc.numero_parte || inc.id.slice(0, 8)}.pdf`,
              content: buf.toString('base64')
            });
          }
        }
      } catch (_) { /* si el PDF no se puede bajar, se manda el resumen igual */ }
    }

    // ---- 6) Enviar ---------------------------------------------------------
    const email = construirEmail(inc, hotel, (inc.empleados || {}).nombre || '', MODO);
    const carga = {
      from: REMITENTE,
      to: [destino],
      subject: email.asunto,
      html: email.html,
      text: email.texto
    };
    if (adjuntos.length) carga.attachments = adjuntos;
    if (COPIA) carga.bcc = [COPIA];

    const rSend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify(carga)
    });
    const respuesta = await rSend.json().catch(() => ({}));

    if (!rSend.ok) {
      const motivo = (respuesta && (respuesta.message || respuesta.error)) || ('HTTP ' + rSend.status);
      // Se deja anotado el motivo para poder verlo desde el panel sin abrir logs.
      try {
        await sbUpdate(SUPABASE_URL, SERVICE, `incidencias?id=eq.${inc.id}`,
          { email_error: String(motivo).slice(0, 400) });
      } catch (_) {}
      return fallo('resend_error', 'El servidor de correo rechazó el envío: ' + motivo, 502);
    }

    // ---- 7) Dejar constancia ----------------------------------------------
    await sbUpdate(SUPABASE_URL, SERVICE, `incidencias?id=eq.${inc.id}`, {
      email_enviado_at: new Date().toISOString(),
      email_enviado_a: destino,
      email_modo: MODO,
      email_error: null
    });

    return json({ ok: true, codigo: 'enviado', enviado_a: destino, modo: MODO, adjunto: adjuntos.length > 0 });
  } catch (err) {
    return fallo('error', String((err && err.message) || err), 500);
  }
};
