/* ==========================================================================
   PoolSafety · Helpers para Supabase Storage
   Bucket: empleados-media (público)
   Estructura:
     fotos/{empleado_id}.jpg
     firmas/{firma_id}.pdf
     titulaciones/{empleado_id}/{titulacion_id}.{ext}
   ========================================================================== */

window.PSStorage = (function () {
  const BUCKET = 'empleados-media';

  async function dataUriToBlob(uri) {
    const res = await fetch(uri);
    return await res.blob();
  }

  async function subir(path, blobOrFile, contentType) {
    if (!window.sb) throw new Error('Supabase no está cargado');
    let blob = blobOrFile;
    if (typeof blobOrFile === 'string' && blobOrFile.startsWith('data:')) {
      blob = await dataUriToBlob(blobOrFile);
      if (!contentType) contentType = blobOrFile.split(':')[1].split(';')[0];
    }
    const { error } = await window.sb.storage.from(BUCKET).upload(path, blob, {
      contentType: contentType || 'application/octet-stream',
      upsert: true
    });
    if (error) throw error;
    return window.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function borrar(path) {
    if (!window.sb) return;
    try { await window.sb.storage.from(BUCKET).remove([path]); } catch (e) {}
  }

  function urlPublica(path) {
    return window.sb ? window.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
  }

  /* ------------------------------------------------------------------
     Bucket PRIVADO para documentación laboral (DNI, contratos, nóminas,
     certificados). Separado de `empleados-media`, que es público y vale para
     fotos de perfil, pero NO para documentos personales: ahí quedarían
     accesibles a cualquiera con el enlace. Este va con políticas propias
     (sql/26) y se lee con enlaces firmados que caducan.
     ------------------------------------------------------------------ */
  const BUCKET_DOCS = 'documentos-laborales';

  async function subirDocumento(path, blobOrFile, contentType) {
    if (!window.sb) throw new Error('Supabase no está cargado');
    let blob = blobOrFile;
    if (typeof blobOrFile === 'string' && blobOrFile.startsWith('data:')) {
      blob = await dataUriToBlob(blobOrFile);
      if (!contentType) contentType = blobOrFile.split(':')[1].split(';')[0];
    }
    const { error } = await window.sb.storage.from(BUCKET_DOCS).upload(path, blob, {
      contentType: contentType || blob.type || 'application/octet-stream',
      upsert: true
    });
    if (error) throw error;
    return path;
  }

  // Enlace temporal para ver o descargar. Por defecto 5 minutos: suficiente
  // para abrirlo y lo bastante corto para que no ande circulando por ahí.
  async function urlFirmadaDocumento(path, segundos) {
    if (!window.sb) throw new Error('Supabase no está cargado');
    const { data, error } = await window.sb.storage
      .from(BUCKET_DOCS).createSignedUrl(path, segundos || 300);
    if (error) throw error;
    return data.signedUrl;
  }

  // Se descarga el fichero de vuelta para comprobar que llegó entero. Es lo que
  // permite migrar sin perder nada: hasta que esto no cuadra, no se borra el
  // original de la base de datos.
  async function verificarDocumento(path, bytesEsperados) {
    if (!window.sb) throw new Error('Supabase no está cargado');
    const { data, error } = await window.sb.storage.from(BUCKET_DOCS).download(path);
    if (error) throw error;
    if (!data) throw new Error('la descarga de comprobación vino vacía');
    if (bytesEsperados != null && data.size !== bytesEsperados) {
      throw new Error(`el fichero subido mide ${data.size} bytes y el original ${bytesEsperados}`);
    }
    return data.size;
  }

  async function borrarDocumento(path) {
    if (!window.sb) return;
    const { error } = await window.sb.storage.from(BUCKET_DOCS).remove([path]);
    if (error) throw error;
  }

  return {
    subir, borrar, urlPublica, BUCKET,
    BUCKET_DOCS, subirDocumento, urlFirmadaDocumento, verificarDocumento, borrarDocumento,
    dataUriToBlob
  };
})();
