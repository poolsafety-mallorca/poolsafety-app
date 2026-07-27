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

  return { subir, borrar, urlPublica, BUCKET };
})();
