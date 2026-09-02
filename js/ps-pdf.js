/* ==========================================================================
   PoolSafety · Generación de PDFs firmados (Kit Alta, Jornada, otros)
   Requiere jsPDF cargado antes por CDN → window.jspdf.jsPDF
   ========================================================================== */

window.PSPdf = (function () {

  const EMPRESA = {
    razonSocial: 'Pool Safety Des Llevant, S.L.',
    cif: 'B75828418',
    domicilio: 'C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares',
    email: 'info@poolsafety.es',
    ccc: '07132352204'
  };

  /* ==========================================================================
     GUARDAR UN PDF QUE TAMBIÉN FUNCIONE EN EL IPHONE
     jsPDF guarda con un <a download>. En iOS con la app instalada en la pantalla
     de inicio (modo standalone) ese atributo se ignora y además no hay pestañas
     donde abrir el archivo: el botón de descargar parecía no hacer NADA.
     Fuera de ese caso se descarga como siempre.
     ========================================================================== */
  function esIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function esStandalone() {
    return window.navigator.standalone === true ||
           (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  async function guardarPdf(doc, nombre) {
    if (!(esIOS() && esStandalone())) { doc.save(nombre); return; }

    const blob = doc.output('blob');
    // 1) Hoja de compartir de iOS: incluye "Guardar en Archivos", que es
    //    exactamente lo que el usuario entiende por descargar.
    try {
      const archivo = new File([blob], nombre, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // canceló: no es un fallo
      console.warn('[pdf] compartir no disponible:', err.message);
    }
    // 2) Abrirlo en una ventana nueva: iOS lo enseña con su visor de PDF, que
    //    ya trae su propio botón de compartir y guardar.
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      // 3) Ventanas emergentes bloqueadas: navegar en la propia app. Se pierde
      //    la pantalla en la que estaba, pero es mejor que un botón inerte.
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Los CSV se descargan con el mismo <a download>, así que en el iPhone
  // instalado fallan igual. Se expone para que el resto de la app lo use.
  async function guardarArchivo(blob, nombre) {
    if (!(esIOS() && esStandalone())) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    try {
      const archivo = new File([blob], nombre, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: nombre });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function nuevoPdf() {
    if (!window.jspdf) throw new Error('jsPDF no está cargado');
    return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  }

  function limpiarTexto(txt) {
    return (txt || '')
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[❤️⚡✓✗☑☐]/g, '');
  }

  function header(doc, titulo, subtitulo) {
    doc.setFillColor(185, 28, 28);
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('PoolSafety', 15, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(EMPRESA.razonSocial + ' · CIF ' + EMPRESA.cif, 15, 21);
    doc.text(EMPRESA.domicilio, 15, 26);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(titulo, 15, 44);
    if (subtitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 100, 100);
      doc.text(subtitulo, 15, 50);
      doc.setTextColor(0, 0, 0);
    }
  }

  function footer(doc, page, totalPages) {
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 220, 220);
    doc.line(15, h - 18, 195, h - 18);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`${EMPRESA.razonSocial} · Documento generado el ${new Date().toLocaleString('es-ES')}`, 15, h - 12);
    doc.text(`Página ${page}/${totalPages}`, 180, h - 12);
    doc.setTextColor(0, 0, 0);
  }

  function checkPage(doc, y, needed = 20) {
    const h = doc.internal.pageSize.getHeight();
    // Reserva más espacio abajo (52mm) para firma+footer en cada página
    if (y + needed > h - 55) { doc.addPage(); return 20; }
    return y;
  }

  function numerarPaginas(doc) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); footer(doc, i, total); }
  }

  // Añade en cada página una firma reducida al pie (obligatorio legal: firma por hoja)
  // Excluye la ÚLTIMA página si el flag skipUltima está activo — ahí ya va la firma grande.
  function firmarCadaPagina(doc, firma, empleado, opts) {
    const skipUltima = opts && opts.skipUltima;
    const total = doc.internal.getNumberOfPages();
    const h = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= total; i++) {
      if (skipUltima && i === total) continue;
      doc.setPage(i);
      // Recuadro para la firma al pie
      const yTop = h - 52;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(15, yTop, 195, yTop);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Firma del trabajador en esta hoja:', 15, yTop + 4);
      // Firma manuscrita reducida
      if (firma.firma_imagen) {
        try { doc.addImage(firma.firma_imagen, 'PNG', 15, yTop + 6, 45, 18); } catch (e) {}
      }
      // Datos al lado
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(limpiarTexto(firma.firma_nombre || empleado.nombre || '—'), 70, yTop + 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`DNI ${firma.dni || empleado.dni || '—'}`, 70, yTop + 17);
      doc.text(`Fecha: ${new Date(firma.fecha_firma).toLocaleDateString('es-ES')}`, 70, yTop + 22);
      doc.setFontSize(6.5);
      doc.setTextColor(140, 140, 140);
      doc.text('Firmado electrónicamente. Copia legal, cada hoja rubricada.', 70, yTop + 27);
      doc.setTextColor(0, 0, 0);
    }
  }

  /* ==========================================================================
     KIT ALTA · texto legal completo + tabla EPIs + firma
     ========================================================================== */
  async function generarKitAlta(empleado, firma, subdocs) {
    // Fallback robusto: si no llegan subdocs, léelos de window.PS
    // Con reintentos por si data.js aún no cargó
    if (!subdocs || subdocs.length === 0) {
      for (let i = 0; i < 20; i++) {
        subdocs = (window.PS && window.PS.kitAltaSubdocs) || [];
        if (subdocs.length > 0) break;
        await new Promise(r => setTimeout(r, 100));
      }
    }
    if (!subdocs || subdocs.length === 0) {
      console.error('[PSPdf] ERROR: PS.kitAltaSubdocs sigue vacío tras 2s. El PDF NO tendrá texto legal.');
      alert('Error: no se ha podido cargar el texto legal (data.js no disponible). Recarga la app con Ctrl+Shift+R y vuelve a intentarlo.');
    }
    const doc = nuevoPdf();
    header(doc, 'Kit Alta Empresa · Documentación laboral firmada',
      'Firmado electrónicamente por el trabajador con evidencia GPS');

    let y = 58;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL TRABAJADOR', 15, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Nombre: ${limpiarTexto(empleado.nombre || '—')}`, 15, y); y += 4.5;
    doc.text(`DNI: ${firma.dni || empleado.dni || '—'}`, 15, y); y += 4.5;
    const campos = firma.campos_json || firma.campos || {};
    if (campos.emailPersonal || empleado.email)
      { doc.text(`Email: ${campos.emailPersonal || empleado.email}`, 15, y); y += 4.5; }
    if (campos.telefonoPersonal || empleado.telefono)
      { doc.text(`Teléfono: ${campos.telefonoPersonal || empleado.telefono}`, 15, y); y += 4.5; }

    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.text('EVIDENCIA DE FIRMA ELECTRÓNICA', 15, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha y hora: ${new Date(firma.fecha_firma).toLocaleString('es-ES')}`, 15, y); y += 4.5;
    doc.text(`Dispositivo: ${firma.dispositivo || 'móvil del empleado'}`, 15, y); y += 4.5;
    if (firma.ubicacion_lat && firma.ubicacion_lng) {
      doc.text(`Ubicación GPS: ${(+firma.ubicacion_lat).toFixed(5)}, ${(+firma.ubicacion_lng).toFixed(5)}`, 15, y);
      y += 4.5;
    }
    if (firma.ip_firma) { doc.text(`IP: ${firma.ip_firma}`, 15, y); y += 4.5; }

    // Texto legal completo de cada subdocumento aceptado
    // REGLA: cada subdoc empieza en HOJA NUEVA (no se cortan por la mitad).
    // Puede ocupar varias hojas si el texto es largo, y el pie de cada hoja
    // lleva firma (obligación legal). No mezclamos dos apartados en una hoja.
    const aceptados = firma.aceptados_json || firma.aceptados || {};
    (subdocs || []).forEach((sub, idx) => {
      // Nueva página siempre — así ningún apartado se corta por la mitad
      doc.addPage();
      y = 20;
      doc.setDrawColor(185, 28, 28);
      doc.setLineWidth(0.4);
      doc.line(15, y, 195, y);
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(185, 28, 28);
      doc.text(limpiarTexto(sub.titulo).toUpperCase(), 15, y);
      y += 4;
      if (sub.norma) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(limpiarTexto(sub.norma), 15, y);
        y += 4;
      }
      // Estado aceptación
      const ok = aceptados[sub.id];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(ok ? 5 : 155, ok ? 122 : 28, ok ? 85 : 28);
      doc.text(ok ? '[ACEPTADO POR EL TRABAJADOR]' : '[NO ACEPTADO · OPCIONAL]', 15, y);
      y += 6;
      doc.setTextColor(0, 0, 0);

      // Texto completo del documento
      if (sub.textoCompleto) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const parrafos = sub.textoCompleto.split('\n');
        for (const p of parrafos) {
          const t = limpiarTexto(p).trim();
          if (!t) { y += 2; continue; }
          // Detectar encabezados en mayúsculas
          if (/^[A-ZÁÉÍÓÚÑ0-9· ,\.\(\)\/]+$/.test(t) && t.length < 90 && t.length > 4) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
          }
          const lines = doc.splitTextToSize(t, 180);
          for (const line of lines) {
            y = checkPage(doc, y, 4);
            doc.text(line, 15, y);
            y += 3.6;
          }
        }
      }

      // Decisión reconocimiento médico (solo en el subdoc de salud)
      if (sub.id === 'ka-vigilancia-salud') {
        y += 4;
        y = checkPage(doc, y, 22);
        const dec = campos.reconocimientoMedico;
        const decLabel = dec === 'si' ? 'SÍ deseo realizarme el reconocimiento médico'
                       : dec === 'no' ? 'NO deseo realizarme el reconocimiento médico (renuncia expresa)'
                       : 'Sin decisión (pendiente)';
        const decColor = dec === 'si' ? [5, 122, 85] : dec === 'no' ? [155, 28, 28] : [120, 120, 120];
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(245, 158, 11);
        doc.rect(15, y, 180, 14, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(120, 60, 0);
        doc.text('DECISIÓN DEL TRABAJADOR SOBRE EL RECONOCIMIENTO MÉDICO:', 18, y + 5);
        doc.setTextColor(decColor[0], decColor[1], decColor[2]);
        doc.setFontSize(9.5);
        doc.text(decLabel, 18, y + 11);
        doc.setTextColor(0, 0, 0);
        y += 18;
      }

      // Tablas EPIs / uniforme si aplica
      if (sub.esListaEpis) {
        const cantidades = (campos.epis) || {};
        const anchoCols = [65, 40, 40, 25];
        const totalAncho = anchoCols.reduce((a,b)=>a+b, 0);
        const xInicio = 15;
        const dibujarTabla = (titulo, cabecera, items) => {
          if (!items.length) return;
          y += 4;
          y = checkPage(doc, y, 20);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text(titulo, 15, y); y += 5;
          // Header
          doc.setFillColor(240, 240, 240);
          doc.setDrawColor(200, 200, 200);
          doc.rect(xInicio, y, totalAncho, 6, 'FD');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          cabecera.forEach((h,i) => {
            const xh = xInicio + anchoCols.slice(0,i).reduce((a,b)=>a+b, 0) + 2;
            doc.text(h, xh, y + 4);
          });
          y += 6;
          doc.setFont('helvetica', 'normal');
          for (const e of items) {
            y = checkPage(doc, y, 6);
            doc.rect(xInicio, y, totalAncho, 5.5, 'D');
            const fila = [
              limpiarTexto(e.nombre),
              limpiarTexto(e.color),
              limpiarTexto(e.modelo),
              String((cantidades[e.id] != null) ? cantidades[e.id] : e.unidades)
            ];
            fila.forEach((v,i) => {
              const xh = xInicio + anchoCols.slice(0,i).reduce((a,b)=>a+b, 0) + 2;
              doc.text(v, xh, y + 4);
            });
            y += 5.5;
          }
        };
        const epis = (sub.epis || []).filter(e => (e.tipo || 'epi') === 'epi');
        const uniforme = (sub.epis || []).filter(e => e.tipo === 'uniforme');
        dibujarTabla('EQUIPOS DE PROTECCIÓN INDIVIDUAL (RD 773/1997)', ['Equipo','Color','Modelo','Unidades'], epis);
        dibujarTabla('UNIFORME / ROPA DE TRABAJO', ['Prenda','Color','Modelo','Unidades'], uniforme);
      }
    });

    // Firma manuscrita — SIEMPRE en hoja propia al final (no compartir hoja con subdoc)
    doc.addPage();
    y = 20;
    doc.setDrawColor(185, 28, 28);
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(185, 28, 28);
    doc.text('FIRMA MANUSCRITA DEL TRABAJADOR', 15, y);
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Con la firma abajo, el trabajador confirma haber leído y aceptado los apartados marcados', 15, y);
    y += 5;
    doc.text('como "ACEPTADO POR EL TRABAJADOR" en las hojas anteriores.', 15, y);
    y += 10;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 100, 40); } catch (e) {}
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.rect(15, y, 100, 40, 'D');
    }
    y += 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Firmado por: ' + limpiarTexto(firma.firma_nombre || empleado.nombre), 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text('DNI: ' + (firma.dni || '—'), 15, y); y += 5;
    doc.text('Fecha y hora: ' + new Date(firma.fecha_firma).toLocaleString('es-ES'), 15, y); y += 5;
    if (firma.ubicacion_lat) {
      doc.setFontSize(9); doc.setTextColor(100,100,100);
      doc.text('Evidencia GPS: ' + (+firma.ubicacion_lat).toFixed(5) + ', ' + (+firma.ubicacion_lng).toFixed(5), 15, y);
      doc.setTextColor(0,0,0); doc.setFontSize(10);
    }

    // Firma reducida al pie de CADA hoja (obligación legal: cada hoja rubricada)
    // Se omite la última página porque ya lleva la firma grande arriba.
    firmarCadaPagina(doc, firma, empleado, { skipUltima: true });
    numerarPaginas(doc);
    return doc;
  }

  /* ==========================================================================
     JORNADA · RESUMEN MENSUAL (lo que ve y firma el trabajador)
     Formato simple: 40h/sem · 160h/mes (o reales si < 40h)
     ========================================================================== */
  async function generarJornadaResumen(empleado, firma) {
    const doc = nuevoPdf();
    // Título con mes en formato legible si el código es jornada-YYYY-MM
    const mm = (firma.documento_codigo || '').match(/jornada-(\d{4})-(\d{2})/);
    const subtHeader = mm
      ? new Date(parseInt(mm[1]), parseInt(mm[2]) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      : firma.documento_codigo;
    header(doc, 'Registro Mensual de Jornada', subtHeader);

    let y = 58;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS', 15, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Trabajador: ${limpiarTexto(empleado.nombre || '')}`, 15, y); y += 4.5;
    doc.text(`DNI: ${empleado.dni || '—'}`, 15, y); y += 4.5;
    if (empleado.puesto_nombre) { doc.text(`Puesto: ${empleado.puesto_nombre}`, 15, y); y += 4.5; }

    const campos = firma.campos_json || {};
    const fmtH = window.PSJornada.fmtH;
    const semanas = Array.isArray(campos.semanas) ? campos.semanas : [];

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('DESGLOSE SEMANAL DE HORAS TRABAJADAS', 15, y); y += 8;

    if (semanas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('Sin fichajes registrados este mes.', 15, y); y += 6;
      doc.setTextColor(0, 0, 0);
    } else {
      // Tabla desglose semanal
      // Este es el documento del TRABAJADOR: solo lo que firma, con el tope de
      // 40 h/semana ya aplicado. Ni horas reales por encima del tope ni extras:
      // eso solo existe en la hoja de nómina del administrador.
      const cols = [{ h: 'Semana', w: 85 }, { h: 'Días', w: 30, num: true }, { h: 'Horas', w: 55, num: true }];
      // Header
      doc.setFillColor(240, 240, 240);
      doc.setDrawColor(200, 200, 200);
      const anchoTot = cols.reduce((a, c) => a + c.w, 0);
      doc.rect(15, y, anchoTot, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      let cx = 15;
      cols.forEach(c => { doc.text(c.h, cx + (c.num ? c.w - 2 : 2), y + 4, c.num ? { align: 'right' } : {}); cx += c.w; });
      y += 6;
      doc.setFont('helvetica', 'normal');
      semanas.forEach(s => {
        y = checkPage(doc, y, 6);
        doc.rect(15, y, anchoTot, 5.5, 'D');
        cx = 15;
        const valores = [s.rangoTxt || '—', String(s.dias || 0), `${fmtH(s.horas_firmadas)}h`];
        valores.forEach((v, i) => {
          const c = cols[i];
          doc.text(v, cx + (c.num ? c.w - 2 : 2), y + 4, c.num ? { align: 'right' } : {});
          cx += c.w;
        });
        y += 5.5;
      });
      // Total
      doc.setFillColor(254, 226, 226);
      doc.rect(15, y, anchoTot, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      cx = 15;
      // Label ocupando las dos primeras columnas + total de horas firmadas
      doc.text(`TOTAL MES (${campos.dias_trabajados || 0} días)`, 17, y + 4);
      doc.text(`${fmtH(campos.horas_firmadas)}h`, 15 + cols[0].w + cols[1].w + cols[2].w - 2, y + 4, { align: 'right' });
      y += 8;
      doc.setFont('helvetica', 'normal');
    }

    // Resumen firma final
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`El trabajador firma ${fmtH(campos.horas_firmadas)} h ordinarias este mes (tope 40 h por semana natural).`, 15, y);
    y += 6;

    // Evidencia
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('EVIDENCIA DE FIRMA', 15, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date(firma.fecha_firma).toLocaleString('es-ES')}`, 15, y); y += 4.5;
    doc.text(`Dispositivo: ${firma.dispositivo || 'móvil'}`, 15, y); y += 4.5;
    if (firma.ubicacion_lat) { doc.text(`GPS: ${(+firma.ubicacion_lat).toFixed(5)}, ${(+firma.ubicacion_lng).toFixed(5)}`, 15, y); y += 4.5; }

    // Firma manuscrita
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DEL TRABAJADOR', 15, y); y += 6;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 90, 34); } catch (e) {}
    }
    y += 40;
    doc.setFont('helvetica', 'normal');
    doc.text('Firmado por: ' + limpiarTexto(firma.firma_nombre || empleado.nombre), 15, y); y += 5;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('En cumplimiento del RD-ley 8/2019, de 8 de marzo, sobre registro horario obligatorio.', 15, y);

    numerarPaginas(doc);
    return doc;
  }

  /* ==========================================================================
     JORNADA · OFICIAL formato inspección (solo admin descarga)
     Tabla mensual día a día con entrada, salida, horas ordinarias
     y complementarias, replicando el formato del Word del cliente.
     ========================================================================== */
  // ---- Festivos ES + Baleares (Palma) ----
  // Devuelve nombre corto del festivo (p.ej. "Navidad") o null si el día es laborable.
  // Cubre festivos nacionales fijos + autonómicos Illes Balears + Semana Santa (Gauss).
  function pascuaGregoriana(anio) {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19*a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2*e + 2*i - h - k) % 7;
    const m = Math.floor((a + 11*h + 22*l) / 451);
    const mes = Math.floor((h + l - 7*m + 114) / 31); // 3=marzo, 4=abril
    const dia = ((h + l - 7*m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
  }
  function nombreFestivo(anio, mesIdx, dia) {
    // Fijos nacionales + autonómicos Baleares
    const key = `${mesIdx}-${dia}`;
    const fijos = {
      '0-1': 'Año Nuevo',
      '0-6': 'Reyes',
      '2-1': 'Día Illes Balears',
      '4-1': 'Día del Trabajo',
      '7-15': 'Asunción',
      '9-12': 'Fiesta Nacional',
      '10-1': 'Todos los Santos',
      '11-6': 'Día Constitución',
      '11-8': 'Inmaculada',
      '11-25': 'Navidad',
      '11-26': 'S. Esteban (2ª Pascua)'
    };
    if (fijos[key]) return fijos[key];
    // Semana Santa: Jueves y Viernes Santo (viernes es nacional; jueves es autonómico)
    const pascua = pascuaGregoriana(anio);
    const jueves = new Date(pascua); jueves.setDate(pascua.getDate() - 3);
    const viernes = new Date(pascua); viernes.setDate(pascua.getDate() - 2);
    const lunesPascua = new Date(pascua); lunesPascua.setDate(pascua.getDate() + 1);
    const target = new Date(anio, mesIdx, dia);
    const eq = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (eq(target, jueves)) return 'Jueves Santo';
    if (eq(target, viernes)) return 'Viernes Santo';
    if (eq(target, lunesPascua)) return 'L. Pascua (Baleares)';
    return null;
  }

  async function generarJornadaOficial(empleado, firma, fichajesMes, mesAnio) {
    const doc = nuevoPdf();

    // Cabecera oficial
    doc.setFillColor(185, 28, 28);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('REGISTRO DIARIO DE JORNADA LABORAL', 15, 12);
    doc.setFontSize(9);
    doc.text(mesAnio, 195, 12, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Datos empresa + empleado
    let y = 28;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Empresa:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${EMPRESA.razonSocial} · CIF ${EMPRESA.cif} · CCC ${EMPRESA.ccc}`, 32, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Trabajador:', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${limpiarTexto(empleado.nombre || '')} · DNI ${empleado.dni || '—'}`, 35, y);
    if (empleado.puesto_nombre) {
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('Centro:', 15, y);
      doc.setFont('helvetica', 'normal');
      doc.text(limpiarTexto(empleado.puesto_nombre), 32, y);
    }
    y += 8;

    // Detectar año y mes desde el código de la firma para saber cuántos días tiene el mes y festivos
    const mm = (firma.documento_codigo || '').match(/jornada-(\d{4})-(\d{2})/);
    const anioNum = mm ? parseInt(mm[1]) : new Date().getFullYear();
    const mesNum  = mm ? parseInt(mm[2]) - 1 : new Date().getMonth();
    const diasEnMes = new Date(anioNum, mesNum + 1, 0).getDate();

    // Horas: se calculan con el módulo ÚNICO window.PSJornada, el mismo que usa
    // el modal donde firma el socorrista. Es lo que garantiza que este documento
    // y el que él firmó digan exactamente lo mismo. NO calcular aquí las horas
    // por tu cuenta: antes esta hoja repartía con tope de 8 h/día mientras el
    // socorrista firmaba con tope de 40 h/semana, y con 6 días de 7 h uno decía
    // 42 h ordinarias y el otro 40 h.
    // `hasta` limita el cálculo al mismo corte que se firmó (firma a mitad de
    // mes solicitada por el coordinador).
    const PSJ = window.PSJornada;
    const calc = PSJ.calcular(fichajesMes || [], {
      hasta: (firma.campos_json || {}).hasta || null
    });
    // Reindexar por número de día para pintar la tabla del mes.
    const porDia = {};
    Object.keys(calc.porDia).forEach(k => {
      const d = calc.porDia[k];
      if (d.fecha.getFullYear() === anioNum && d.fecha.getMonth() === mesNum) {
        porDia[d.fecha.getDate()] = d;
      }
    });
    const nombresDia = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];

    // Tabla — añadida columna "Día sem." + espacio para nombre festivo
    const cols = [
      { titulo: 'Día',                  w: 10 },
      { titulo: 'Sem.',                 w: 10 },
      { titulo: 'Hora entrada',         w: 22 },
      { titulo: 'Hora salida',          w: 22 },
      { titulo: 'Horas ord. pactadas',  w: 28 },
      { titulo: 'Complem. voluntarias', w: 30 },
      // Antes esta columna se titulaba "Firma trabajador" pero lo que se
      // imprimía dentro era "FESTIVO ..." o "Turno partido". En una hoja que
      // lee la inspección eso no puede llamarse firma.
      { titulo: 'Observaciones',        w: 58 }
    ];
    const totalAncho = cols.reduce((a,c) => a + c.w, 0);
    const xInicio = 15;

    // Cabecera tabla
    doc.setFillColor(240, 240, 240);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.rect(xInicio, y, totalAncho, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    let xh = xInicio;
    cols.forEach(c => {
      doc.text(c.titulo, xh + c.w/2, y + 5, { align: 'center' });
      xh += c.w;
    });
    y += 8;

    // Filas
    doc.setFontSize(7.5);
    let totalOrd = 0;
    let totalOrdFest = 0; // horas ordinarias en festivo/domingo
    for (let dia = 1; dia <= diasEnMes; dia++) {
      y = checkPage(doc, y, 8);
      const fecha = new Date(anioNum, mesNum, dia);
      const diaSemIdx = fecha.getDay(); // 0=Do..6=Sa
      const esDomingo = diaSemIdx === 0;
      const esSabado = diaSemIdx === 6;
      const festivo = nombreFestivo(anioNum, mesNum, dia);
      const especial = festivo || esDomingo; // domingo también es no laborable
      // Fondo: festivo = amber; sábado/domingo = gris muy claro
      if (festivo) doc.setFillColor(254, 243, 199);
      else if (esSabado || esDomingo) doc.setFillColor(241, 245, 249);
      else doc.setFillColor(255, 255, 255);
      doc.rect(xInicio, y, totalAncho, 6, 'FD');

      const d = porDia[dia];
      const hhmm = (x) => x ? x.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
      let entrada = '', salida = '', horasOrd = '', horasCompl = '';

      if (d && d.tramos.length) {
        // Turno partido: se listan todas las entradas y todas las salidas
        entrada = d.tramos.map(t => hhmm(t.entrada)).join(' / ');
        salida  = d.tramos.map(t => t.salida ? hhmm(t.salida) : '—').join(' / ');
        // Ordinarias/complementarias YA vienen repartidas por PSJornada con el
        // tope de 40 h/semana, igual que en el modal de firma del socorrista.
        // La hoja de inspección refleja SOLO jornada ordinaria, con el tope de
        // 40 h/semana ya aplicado. La columna de complementarias se mantiene
        // porque forma parte del formato oficial, pero va SIEMPRE VACÍA: el
        // exceso sobre 40 h no aparece en este documento, solo en la hoja de
        // nómina del administrador.
        if (d.ordinarias > 0) {
          horasOrd = PSJ.fmtH(d.ordinarias);
          horasCompl = '';
          totalOrd += d.ordinarias;
          if (especial) totalOrdFest += d.ordinarias;
        }
      }

      // Marca de festivo o aviso de turno partido / fichaje incompleto
      let marcaFestivo = '';
      if (festivo) marcaFestivo = `FESTIVO · ${festivo}`;
      else if (d && d.incompleto) marcaFestivo = 'SIN FICHAR SALIDA';
      // Salida reconstruida a mano: el registro tiene que decir que esa hora es
      // una estimación y no una medición. Ocultarlo sería falsear el documento.
      else if (d && d.salidaManual) marcaFestivo = 'Salida estimada';
      else if (d && d.tramos.length > 1) marcaFestivo = 'Turno partido';

      const valores = [String(dia), nombresDia[diaSemIdx], entrada, salida, horasOrd, horasCompl, marcaFestivo];
      xh = xInicio;
      // Colores: festivo rojo, sabdo/dom gris más oscuro
      cols.forEach((c, i) => {
        if (festivo && i === 6) { doc.setTextColor(155, 28, 28); doc.setFont('helvetica', 'bold'); }
        else if (festivo && i <= 1) { doc.setTextColor(155, 28, 28); doc.setFont('helvetica', 'bold'); }
        else if ((esSabado || esDomingo) && i <= 1) { doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold'); }
        else { doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); }
        doc.text(valores[i], xh + c.w/2, y + 4, { align: 'center' });
        xh += c.w;
      });
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    }

    // Leyenda + Totales
    y += 3;
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Leyenda:', 15, y);
    doc.setFillColor(254, 243, 199); doc.rect(30, y - 2.5, 4, 3, 'FD');
    doc.text('festivo', 35, y);
    doc.setFillColor(241, 245, 249); doc.rect(52, y - 2.5, 4, 3, 'FD');
    doc.text('sábado/domingo', 57, y);
    doc.setTextColor(0, 0, 0);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Total horas ordinarias: ${PSJ.fmtH(totalOrd)}h`, 15, y);
    doc.text('Total horas complementarias: 0h', 110, y);
    y += 5;
    if (totalOrdFest > 0) {
      doc.setTextColor(155, 28, 28);
      doc.text(`De las cuales, en festivo/domingo: ${PSJ.fmtH(totalOrdFest)}h`, 15, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    }
    // Criterio, para que quien lea la hoja sepa de dónde salen las cifras
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Jornada ordinaria con maximo de 40 h por semana natural (lunes a domingo). Esta hoja recoge unicamente jornada ordinaria.', 15, y);
    doc.setTextColor(0, 0, 0);
    y += 4;
    if (calc.incompletos.length) {
      doc.setTextColor(180, 83, 9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Atencion: ${calc.incompletos.length} dia(s) con entrada sin salida fichada. Esas horas NO estan computadas.`, 15, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      y += 4;
    }
    y += 3;

    // Firma
    y = checkPage(doc, y, 50);
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('FIRMA DEL TRABAJADOR', 15, y);
    doc.text('Firmado empresa', 130, y);
    y += 4;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 80, 32); } catch (e) {}
    }
    // Firma empresa (placeholder texto)
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text('Sello y firma pendiente', 130, y + 20);
    y += 36;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Fdo: ' + limpiarTexto(firma.firma_nombre || empleado.nombre), 15, y);
    y += 4;
    doc.text('DNI: ' + (empleado.dni || firma.dni || '—'), 15, y);
    y += 4;
    doc.text('En Portocolom (Felanitx), a ' + new Date(firma.fecha_firma).toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }), 15, y);

    numerarPaginas(doc);
    return doc;
  }

  /* ==========================================================================
     FINIQUITO · recibo saldo y finiquito (art. 49.2 ET)
     El detalle económico (indemnización, prorratas, vacaciones no disfrutadas)
     lo cumplimenta la gestoría manualmente sobre el PDF o desde su ERP; aquí
     dejamos un cuadro con líneas listas para el cálculo, para que el papel valga
     como acuse de recibo firmado por el trabajador — que es lo que exige la ley.
     Si en el futuro se guardan importes en firma.campos_json.importes, se pintan
     automáticamente en lugar de las líneas en blanco.
     ========================================================================== */
  async function generarFiniquito(empleado, firma) {
    const doc = nuevoPdf();
    header(doc, 'Recibo de saldo y finiquito', 'Art. 49.2 Estatuto de los Trabajadores');

    const fechaFirma = firma.fecha_firma ? new Date(firma.fecha_firma) : new Date();
    const fechaBaja  = empleado.fecha_baja ? new Date(empleado.fecha_baja) : fechaFirma;
    const fechaAlta  = empleado.fecha_alta ? new Date(empleado.fecha_alta) : null;
    const importes   = (firma.campos_json && firma.campos_json.importes) || {};

    let y = 58;

    // Bloque partes
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('REUNIDOS', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const lineas = [
      `De una parte, ${EMPRESA.razonSocial}, con CIF ${EMPRESA.cif}, domicilio en`,
      `${EMPRESA.domicilio}, en calidad de EMPRESA.`,
      '',
      `De otra parte, ${limpiarTexto(empleado.nombre || firma.firma_nombre || '')}, con DNI/NIE`,
      `${empleado.dni || firma.dni || '—'}, en calidad de TRABAJADOR/A.`
    ];
    lineas.forEach(t => { doc.text(t, 15, y); y += 4.6; });
    y += 4;

    // Datos contrato
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE LA RELACIÓN LABORAL', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const puesto = empleado.puestos?.nombre || empleado.puesto_nombre || '—';
    const tipo   = empleado.tipo_contrato || '—';
    doc.text(`Puesto:                ${puesto}`, 15, y); y += 4.6;
    doc.text(`Categoría:             Socorrista acuático`, 15, y); y += 4.6;
    doc.text(`Tipo de contrato:      ${tipo}`, 15, y); y += 4.6;
    doc.text(`Fecha de alta:         ${fechaAlta ? fechaAlta.toLocaleDateString('es-ES') : '—'}`, 15, y); y += 4.6;
    doc.text(`Fecha de baja:         ${fechaBaja.toLocaleDateString('es-ES')}`, 15, y); y += 4.6;
    y += 4;

    // Bloque económico
    doc.setFont('helvetica', 'bold');
    doc.text('LIQUIDACIÓN ECONÓMICA', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('El detalle de cantidades lo cumplimenta la administración de la empresa. El trabajador recibe copia sellada con el desglose definitivo.', 15, y, { maxWidth: 180 });
    y += 10;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    const conceptos = [
      ['Salario base pendiente', importes.salario_base],
      ['Prorrata paga extra verano', importes.prorrata_verano],
      ['Prorrata paga extra Navidad', importes.prorrata_navidad],
      ['Vacaciones no disfrutadas', importes.vacaciones],
      ['Horas extra pendientes', importes.horas_extra],
      ['Indemnización (si procede)', importes.indemnizacion],
      ['Otros conceptos', importes.otros]
    ];

    const anchoLbl = 110, anchoImp = 40, altoFila = 6.5;
    doc.setDrawColor(200, 200, 200);
    conceptos.forEach(([lbl, val]) => {
      doc.rect(15, y, anchoLbl, altoFila, 'D');
      doc.rect(15 + anchoLbl, y, anchoImp, altoFila, 'D');
      doc.text(lbl, 17, y + 4.5);
      if (val !== undefined && val !== null && val !== '') {
        doc.text(`${val} €`, 15 + anchoLbl + anchoImp - 2, y + 4.5, { align: 'right' });
      }
      y += altoFila;
    });
    // Total
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(185, 28, 28);
    doc.rect(15, y, anchoLbl, altoFila + 1, 'FD');
    doc.rect(15 + anchoLbl, y, anchoImp, altoFila + 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL LÍQUIDO A PERCIBIR', 17, y + 5);
    if (importes.total !== undefined && importes.total !== null && importes.total !== '') {
      doc.text(`${importes.total} €`, 15 + anchoLbl + anchoImp - 2, y + 5, { align: 'right' });
    }
    y += altoFila + 5;
    doc.setFont('helvetica', 'normal');

    // Cláusula de saldo y finiquito
    y = checkPage(doc, y, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('DECLARACIÓN', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const clausula = 'El trabajador declara recibida la cantidad total consignada, quedando totalmente saldado y finiquitado por todos los conceptos derivados de la relación laboral, sin que tenga nada más que reclamar a la empresa. La firma del presente documento produce efectos liberatorios en los términos del art. 49.2 del Estatuto de los Trabajadores, sin perjuicio del derecho del trabajador a solicitar la presencia de un representante legal en el acto de la firma. La empresa comunicará a la Tesorería General de la Seguridad Social la baja del trabajador dentro del plazo reglamentario.';
    const wrapped = doc.splitTextToSize(clausula, 180);
    doc.text(wrapped, 15, y);
    y += wrapped.length * 4.6 + 6;

    // Firma manuscrita
    y = checkPage(doc, y, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('FIRMA DEL TRABAJADOR', 15, y); y += 6;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 90, 34); } catch (e) {}
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.rect(15, y, 90, 34, 'D');
    }
    // Bloque firma empresa a la derecha
    doc.setDrawColor(180, 180, 180);
    doc.rect(115, y, 80, 34, 'D');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Sello y firma de la empresa', 118, y + 30);
    doc.setTextColor(0, 0, 0);
    y += 40;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Fdo: ' + limpiarTexto(firma.firma_nombre || empleado.nombre || ''), 15, y); y += 4.5;
    doc.text('DNI: ' + (empleado.dni || firma.dni || '—'), 15, y); y += 4.5;
    doc.text('En Portocolom (Felanitx), a ' + fechaFirma.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }), 15, y);

    // Evidencia técnica
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`Evidencia: firma capturada el ${fechaFirma.toLocaleString('es-ES')} · dispositivo: ${firma.dispositivo || 'móvil empleado'}`, 15, y);
    if (firma.ubicacion_lat) {
      y += 4;
      doc.text(`GPS al firmar: ${(+firma.ubicacion_lat).toFixed(5)}, ${(+firma.ubicacion_lng).toFixed(5)}`, 15, y);
    }
    doc.setTextColor(0, 0, 0);

    numerarPaginas(doc);
    return doc;
  }

  /* ==========================================================================
     PARTE DE INCIDENCIA (accidente/atención) — PDF a UNA hoja siempre que sea
     posible. Layout compacto en 2 columnas + siluetas en la derecha.
     Si el texto libre desborda pasa a página 2 en formato reducido.
     ========================================================================== */
  async function generarIncidencia(inc, empleado, opts) {
    opts = opts || {};
    // Se le puede pasar un documento ya empezado (opts.doc) para encadenar
    // varios partes en un solo PDF — es lo que usa la descarga por hotel.
    // Cada parte arranca en hoja nueva; el resto del dibujo no cambia porque
    // jsPDF trabaja siempre sobre la página actual.
    const doc = opts.doc || nuevoPdf();
    if (opts.doc) doc.addPage();
    const fechaInc = inc.fecha_incidente ? new Date(inc.fecha_incidente) : new Date();

    // Cabecera compacta (no usa header() estándar, más pequeña)
    doc.setFillColor(185, 28, 28);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('PoolSafety · Parte de incidencia', 12, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(EMPRESA.razonSocial + ' · CIF ' + EMPRESA.cif + ' · ' + EMPRESA.email, 12, 15);
    doc.setFontSize(9);
    doc.text('Nº ' + (inc.numero_parte || '—'), 198, 10, { align: 'right' });
    doc.text(fechaInc.toLocaleString('es-ES'), 198, 15, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Layout: columna izquierda ancha (texto), columna derecha estrecha (siluetas)
    const COL_L = 12, COL_L_W = 128, COL_R = 145, COL_R_W = 53;
    let y = 27;
    const zonas = Array.isArray(inc.dolor_zonas) ? inc.dolor_zonas : [];

    // --------- DERECHA: siluetas (arriba) ---------
    if (window.PSInc) {
      try {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text('Zonas afectadas', COL_R + COL_R_W/2, y + 3, { align: 'center' });
        await svgToPdf(doc, window.PSInc.siluetaParaPDF(zonas, 'front'), COL_R, y + 5, 24, 55);
        await svgToPdf(doc, window.PSInc.siluetaParaPDF(zonas, 'back'),  COL_R + 28, y + 5, 24, 55);
        doc.setFontSize(6.5);
        doc.text('Frontal', COL_R + 12, y + 63, { align: 'center' });
        doc.text('Espalda', COL_R + 40, y + 63, { align: 'center' });
      } catch (_) {}
    }

    // --------- IZQUIERDA: datos incidencia (compacto) ---------
    doc.setFontSize(8);
    const kvL = (lbl, val, yPos) => {
      doc.setFont('helvetica', 'bold'); doc.text(lbl, COL_L, yPos);
      doc.setFont('helvetica', 'normal'); doc.text(limpiarTexto(val || '—'), COL_L + 22, yPos);
    };

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setFillColor(254, 226, 226); doc.rect(COL_L, y, COL_L_W, 4.5, 'F');
    doc.text('INCIDENCIA', COL_L + 1.5, y + 3.3);
    y += 6;
    doc.setFontSize(8.2);
    kvL('Tipo:', window.PSInc ? window.PSInc.formatTipo(inc.tipo_incidente) : (inc.tipo_incidente || '—'), y); y += 4;
    kvL('Puesto:', empleado?.puesto_nombre || '—', y); y += 4;
    if (inc.ubicacion_descripcion) { kvL('Ubicación:', inc.ubicacion_descripcion, y); y += 4; }
    if (inc.testigos) { kvL('Testigos:', inc.testigos, y); y += 4; }
    y += 1;

    // Circunstancias (texto libre, ancho columna izquierda)
    doc.setFont('helvetica', 'bold'); doc.text('Circunstancias:', COL_L, y); y += 3.5;
    doc.setFont('helvetica', 'normal');
    const circ = doc.splitTextToSize(limpiarTexto(inc.circunstancias || '—'), COL_L_W);
    doc.text(circ, COL_L, y); y += circ.length * 3.6 + 2;

    // Víctima (bloque coloreado)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setFillColor(219, 234, 254); doc.rect(COL_L, y, COL_L_W, 4.5, 'F');
    doc.text('VÍCTIMA' + (inc.es_menor ? '  · ⚠ MENOR DE EDAD' : ''), COL_L + 1.5, y + 3.3);
    y += 6;
    doc.setFontSize(8.2);
    kvL('Nombre:', inc.victima_nombre, y); y += 4;
    doc.setFont('helvetica', 'bold'); doc.text('Edad:', COL_L, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${inc.victima_edad != null ? inc.victima_edad + ' años' : '—'}  ·  Sexo: ${inc.victima_sexo || '—'}  ·  DNI: ${inc.victima_dni || '—'}`, COL_L + 12, y);
    y += 4;
    if (inc.victima_telefono || inc.victima_nacionalidad) {
      doc.setFont('helvetica', 'bold'); doc.text('Contacto:', COL_L, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${inc.victima_telefono || '—'} · ${inc.victima_nacionalidad || 'nac. ns'}${inc.victima_hotel_habitacion ? ' · ' + inc.victima_hotel_habitacion : ''}`, COL_L + 18, y);
      y += 4;
    } else if (inc.victima_hotel_habitacion) {
      kvL('Hotel:', inc.victima_hotel_habitacion, y); y += 4;
    }
    if (inc.familiar_avisado) {
      const t = inc.familiar_hora ? ' a las ' + new Date(inc.familiar_hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
      kvL('Familiar:', (inc.familiar_nombre || 'avisado') + t, y); y += 4;
    }

    // Estado a la llegada
    y += 1;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setFillColor(220, 252, 231); doc.rect(COL_L, y, COL_L_W, 4.5, 'F');
    doc.text('ESTADO A LA LLEGADA', COL_L + 1.5, y + 3.3);
    y += 6;
    doc.setFontSize(8.2); doc.setFont('helvetica', 'normal');
    const b = v => v === true ? 'Sí' : v === false ? 'No' : '—';
    doc.text(`Consciente: ${b(inc.consciente)}   ·   Respira: ${b(inc.respira)}   ·   Sangrado: ${b(inc.sangrado)}`, COL_L, y);
    y += 4;
    if (zonas.length) {
      const zTxt = 'Zonas marcadas: ' + zonas.map(z => window.PSInc?.zonaLabel(z) || z).join(', ');
      const zW = doc.splitTextToSize(zTxt, COL_L_W);
      doc.text(zW, COL_L, y); y += zW.length * 3.6;
    }
    if (inc.observaciones_medicas) {
      const om = doc.splitTextToSize('Obs. médicas: ' + limpiarTexto(inc.observaciones_medicas), COL_L_W);
      doc.text(om, COL_L, y); y += om.length * 3.6;
    }
    y += 1;

    // Actuación (puede desbordar → puede pasar a 2 páginas si es muy largo)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.setFillColor(254, 243, 199); doc.rect(COL_L, y, COL_L_W, 4.5, 'F');
    doc.text('ACTUACIÓN', COL_L + 1.5, y + 3.3);
    y += 6;
    doc.setFontSize(8.2); doc.setFont('helvetica', 'normal');
    const act = doc.splitTextToSize(limpiarTexto(inc.actuacion || '—'), COL_L_W);
    doc.text(act, COL_L, y); y += act.length * 3.6 + 1;

    if (Array.isArray(inc.tecnicas_aplicadas) && inc.tecnicas_aplicadas.length) {
      doc.setFont('helvetica', 'bold'); doc.text('Técnicas:', COL_L, y);
      doc.setFont('helvetica', 'normal');
      const tec = doc.splitTextToSize(inc.tecnicas_aplicadas.map(t => window.PSInc?.formatTecnica(t) || t).join(' · '), COL_L_W - 16);
      doc.text(tec, COL_L + 16, y); y += tec.length * 3.6 + 1;
    }

    // Derivación
    doc.setFont('helvetica', 'bold'); doc.text('Derivación:', COL_L, y);
    doc.setFont('helvetica', 'normal');
    let dtxt = window.PSInc?.formatDerivacion(inc.derivacion) || (inc.derivacion||'—');
    if (inc.ambulancia_numero) dtxt += ` · Amb. ${inc.ambulancia_numero}`;
    if (inc.hospital) dtxt += ` · ${inc.hospital}`;
    const dW = doc.splitTextToSize(dtxt, COL_L_W - 20);
    doc.text(dW, COL_L + 20, y); y += dW.length * 3.6 + 2;

    // ---------- DERECHA (parte inferior): material + firma ----------
    let yR = 95; // debajo de las siluetas
    if (Array.isArray(inc.material_usado) && inc.material_usado.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setFillColor(254, 243, 199); doc.rect(COL_R, yR, COL_R_W, 4.5, 'F');
      doc.text('MATERIAL USADO', COL_R + 1.5, yR + 3.3);
      yR += 5.5;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.setDrawColor(220, 220, 220);
      inc.material_usado.forEach(m => {
        if (yR > 195) return; // no cabe más — el resto irá en la 2ª página
        doc.rect(COL_R, yR, COL_R_W, 3.8, 'D');
        const nombreCorto = limpiarTexto(m.nombre || '—').slice(0, 26);
        doc.text(nombreCorto, COL_R + 1, yR + 2.8);
        doc.text(`${m.cantidad || 0}${m.unidad ? ' '+m.unidad : ''}`, COL_R + COL_R_W - 1, yR + 2.8, { align: 'right' });
        yR += 3.8;
      });
      doc.setFontSize(6); doc.setTextColor(120, 120, 120);
      doc.text('Descontado del inventario', COL_R, yR + 3);
      doc.setTextColor(0, 0, 0);
      yR += 6;
    }

    // Firma del socorrista — la ponemos en la parte baja del PDF, ancho completo
    // Elegimos el mayor entre y (col izq) y yR (col der) + margen
    let yFirma = Math.max(y, yR, 200);
    // Si no cabe la firma (necesitamos ~50mm), pasamos a página 2
    const pageH = doc.internal.pageSize.getHeight();
    if (yFirma + 55 > pageH - 12) { doc.addPage(); yFirma = 20; }

    doc.setDrawColor(200, 200, 200);
    doc.line(COL_L, yFirma - 2, 210 - COL_L, yFirma - 2);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('FIRMA DEL SOCORRISTA', COL_L, yFirma + 4);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Declaro que los datos son ciertos y he prestado la atención conforme a mi formación.', COL_L, yFirma + 8);

    // Rectángulo firma
    const firmaX = COL_L, firmaY = yFirma + 12, firmaW = 80, firmaH = 32;
    if (inc.firma_imagen) {
      try { doc.addImage(inc.firma_imagen, 'PNG', firmaX, firmaY, firmaW, firmaH); } catch (_) {}
    } else {
      doc.setDrawColor(180, 180, 180); doc.rect(firmaX, firmaY, firmaW, firmaH, 'D');
    }
    // Datos firmante a la derecha del recuadro
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold'); doc.text('Fdo:', firmaX + firmaW + 4, firmaY + 4);
    doc.setFont('helvetica', 'normal'); doc.text(limpiarTexto(inc.firma_nombre || empleado?.nombre || ''), firmaX + firmaW + 14, firmaY + 4);
    doc.setFont('helvetica', 'bold'); doc.text('DNI:', firmaX + firmaW + 4, firmaY + 9);
    doc.setFont('helvetica', 'normal'); doc.text(inc.firma_dni || empleado?.dni || '—', firmaX + firmaW + 14, firmaY + 9);
    doc.setFontSize(7); doc.setTextColor(100, 100, 100);
    doc.text('Firmado: ' + new Date(inc.fecha_creado || new Date()).toLocaleString('es-ES'), firmaX + firmaW + 4, firmaY + 14);
    if (inc.firma_gps_lat) {
      doc.text(`GPS: ${(+inc.firma_gps_lat).toFixed(4)}, ${(+inc.firma_gps_lng).toFixed(4)}`, firmaX + firmaW + 4, firmaY + 18);
    }
    doc.setTextColor(0, 0, 0);

    // Segunda firma (cliente/familiar/hotel/otro testigo) - si existe
    const TIPO_TXT = {
      victima:  'PERSONA ATENDIDA',
      familiar: 'FAMILIAR / ACOMPAÑANTE',
      hotel:    'RESPONSABLE DEL HOTEL',
      otro:     'TESTIGO'
    };
    if (inc.firma_testigo_tipo && inc.firma_testigo_tipo !== 'ninguno') {
      let yT = yFirma + 55;
      if (yT + 45 > pageH - 12) { doc.addPage(); yT = 20; }
      doc.setDrawColor(200, 200, 200);
      doc.line(COL_L, yT - 2, 210 - COL_L, yT - 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(14, 116, 144);
      doc.text('SEGUNDA FIRMA · ' + (TIPO_TXT[inc.firma_testigo_tipo] || 'TESTIGO'), COL_L, yT + 4);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text('Firma añadida como testigo del parte. Refuerza el valor probatorio del documento.', COL_L, yT + 8);
      const tX = COL_L, tY = yT + 12, tW = 80, tH = 32;
      if (inc.firma_testigo_imagen) {
        try { doc.addImage(inc.firma_testigo_imagen, 'PNG', tX, tY, tW, tH); } catch (_) {}
      } else {
        doc.setDrawColor(180, 180, 180); doc.rect(tX, tY, tW, tH, 'D');
      }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold'); doc.text('Fdo:', tX + tW + 4, tY + 4);
      doc.setFont('helvetica', 'normal'); doc.text(limpiarTexto(inc.firma_testigo_nombre || '—'), tX + tW + 14, tY + 4);
      if (inc.firma_testigo_dni) {
        doc.setFont('helvetica', 'bold'); doc.text('DNI:', tX + tW + 4, tY + 9);
        doc.setFont('helvetica', 'normal'); doc.text(inc.firma_testigo_dni, tX + tW + 14, tY + 9);
      }
      if (inc.firma_testigo_relacion) {
        doc.setFont('helvetica', 'bold'); doc.text('Rol:', tX + tW + 4, tY + 14);
        doc.setFont('helvetica', 'normal'); doc.text(limpiarTexto(inc.firma_testigo_relacion), tX + tW + 14, tY + 14);
      }
    } else if (inc.firma_testigo_tipo === 'ninguno' && inc.firma_testigo_motivo_ausencia) {
      let yT = yFirma + 55;
      if (yT + 20 > pageH - 12) { doc.addPage(); yT = 20; }
      doc.setDrawColor(200, 200, 200);
      doc.line(COL_L, yT - 2, 210 - COL_L, yT - 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(180, 30, 30);
      doc.text('SIN SEGUNDA FIRMA · JUSTIFICACIÓN', COL_L, yT + 4);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(limpiarTexto(inc.firma_testigo_motivo_ausencia), 180);
      doc.text(lines, COL_L, yT + 10);
    }

    // Footer mini
    doc.setFontSize(6.5); doc.setTextColor(150, 150, 150);
    doc.text(`${EMPRESA.razonSocial} · Documento generado por PoolSafety el ${new Date().toLocaleString('es-ES')}`, 105, pageH - 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    return doc;
  }

  // Convierte un fragmento SVG a imagen y lo pinta en el PDF. Async porque
  // Image.onload es asíncrono. Si algo falla no rompe la generación del PDF.
  function svgToPdf(doc, svgHtml, x, y, w, h) {
    return new Promise((resolve, reject) => {
      try {
        const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 400; canvas.height = 800;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, w, h);
            URL.revokeObjectURL(url); resolve();
          } catch (e) { URL.revokeObjectURL(url); reject(e); }
        };
        img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      } catch (e) { reject(e); }
    });
  }

  async function descargarIncidencia(inc, empleado, nombreArchivo) {
    const doc = await generarIncidencia(inc, empleado);
    await guardarPdf(doc, nombreArchivo || `PoolSafety-incidencia-${inc.numero_parte || 'sin-num'}.pdf`);
  }

  /* ==========================================================================
     TODOS LOS PARTES DE UN HOTEL EN UN SOLO PDF
     --------------------------------------------------------------------------
     Un único fichero, no diez: así se adjunta de una vez a un correo o se
     manda por WhatsApp sin ir parte por parte. Empieza con una hoja índice
     que resume qué lleva dentro, para que quien lo reciba sepa de un vistazo
     el periodo, cuántos partes hay y cuáles acabaron en ambulancia.

       partes : array de incidencias, ya ordenadas como se quieran imprimir
       info   : { hotel, desde, hasta, empleadoDe(parte) -> {nombre,dni,puesto_nombre} }
     ========================================================================== */
  async function generarInformesHotel(partes, info) {
    info = info || {};
    const lista = partes || [];
    if (!lista.length) throw new Error('No hay partes que descargar.');

    const doc = nuevoPdf();
    const hotel = info.hotel || '—';

    // ---------------- Hoja índice ----------------
    doc.setFillColor(185, 28, 28);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Partes de incidencia', 12, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(limpiarTexto(hotel), 12, 17.5);
    doc.setFontSize(7.5);
    doc.text(EMPRESA.razonSocial + ' · CIF ' + EMPRESA.cif + ' · ' + EMPRESA.email, 12, 22.5);
    doc.setTextColor(0, 0, 0);

    let y = 34;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const periodo = info.desde || info.hasta
      ? 'Periodo: ' + (info.desde ? new Date(info.desde).toLocaleDateString('es-ES') : 'inicio') +
        ' a ' + (info.hasta ? new Date(info.hasta).toLocaleDateString('es-ES') : 'hoy')
      : 'Periodo: todos los partes registrados';
    doc.text(periodo, 12, y); y += 5;
    doc.text('Partes incluidos: ' + lista.length, 12, y); y += 5;
    doc.text('Documento generado el ' + new Date().toLocaleString('es-ES'), 12, y); y += 8;

    // Tabla resumen
    doc.setFillColor(241, 245, 249);
    doc.rect(12, y - 4, 186, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('Nº parte', 14, y);
    doc.text('Fecha', 45, y);
    doc.text('Tipo', 78, y);
    doc.text('Desenlace', 132, y);
    y += 6;
    doc.setFont('helvetica', 'normal');

    const pageH = doc.internal.pageSize.getHeight();
    lista.forEach((inc) => {
      if (y > pageH - 22) { doc.addPage(); y = 20; }
      const f = inc.fecha_incidente ? new Date(inc.fecha_incidente) : null;
      const grave = inc.derivacion === 'ambulancia' || inc.derivacion === 'hospital';
      if (grave) { doc.setTextColor(185, 28, 28); doc.setFont('helvetica', 'bold'); }
      doc.text(limpiarTexto(inc.numero_parte || '—'), 14, y);
      doc.text(f ? f.toLocaleDateString('es-ES') + ' ' + f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—', 45, y);
      doc.text(limpiarTexto((window.PSInc ? window.PSInc.formatTipo(inc.tipo_incidente) : inc.tipo_incidente) || '—').slice(0, 32), 78, y);
      doc.text(limpiarTexto((window.PSInc ? window.PSInc.formatDerivacion(inc.derivacion) : inc.derivacion) || '—').slice(0, 34), 132, y);
      doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
      y += 4.6;
    });

    y += 6;
    if (y > pageH - 30) { doc.addPage(); y = 20; }
    doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    const aviso = doc.splitTextToSize(
      'CONFIDENCIAL. Este documento contiene datos personales y de salud de las personas ' +
      'atendidas (art. 9 RGPD). Entréguese únicamente a quien tenga que conocerlos, no lo ' +
      'reenvíe fuera de ese círculo y consérvelo sólo el tiempo necesario.', 186);
    doc.text(aviso, 12, y);
    doc.setTextColor(0, 0, 0);

    // ---------------- Un parte por hoja ----------------
    for (const inc of lista) {
      const emp = info.empleadoDe ? info.empleadoDe(inc) : {};
      await generarIncidencia(inc, emp, { doc: doc });
    }

    // Numeración al pie, ya sabiendo cuántas hojas han salido.
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(120, 130, 145);
      doc.text('Página ' + i + ' de ' + total, 198, pageH - 6, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }
    return doc;
  }

  function nombreArchivoInformes(hotel, desde, hasta) {
    const limpio = (hotel || 'hotel').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const tramo = desde || hasta
      ? '_' + (desde || 'inicio') + '_a_' + (hasta || 'hoy')
      : '_completo';
    return `PoolSafety-partes-${limpio}${tramo}.pdf`;
  }

  async function descargarInformesHotel(partes, info) {
    const doc = await generarInformesHotel(partes, info);
    await guardarPdf(doc, nombreArchivoInformes((info || {}).hotel, (info || {}).desde, (info || {}).hasta));
  }

  /* ==========================================================================
     Storage + descarga
     ========================================================================== */
  function esFiniquito(firma) {
    return typeof firma.documento_codigo === 'string' && firma.documento_codigo.startsWith('finiquito-');
  }

  async function generarDocSegunTipo(empleado, firma, subdocs) {
    if (firma.documento_codigo === 'kit-alta') return generarKitAlta(empleado, firma, subdocs);
    if (esFiniquito(firma))                    return generarFiniquito(empleado, firma);
    return generarJornadaResumen(empleado, firma);
  }

  async function generarYSubir(empleado, firma, subdocs) {
    const doc = await generarDocSegunTipo(empleado, firma, subdocs);
    const blob = doc.output('blob');
    const path = `firmas/${firma.id || Date.now()}.pdf`;
    const url = await window.PSStorage.subir(path, blob, 'application/pdf');
    if (firma.id) {
      await window.sb.from('firmas_documentos').update({ archivo_pdf_url: url }).eq('id', firma.id);
    }
    return url;
  }

  async function descargar(empleado, firma, subdocs, nombreArchivo) {
    const doc = await generarDocSegunTipo(empleado, firma, subdocs);
    await guardarPdf(doc, nombreArchivo || `${firma.documento_codigo}-${empleado.nombre || 'empleado'}.pdf`);
  }

  async function descargarJornadaOficial(empleado, firma, fichajesMes, mesAnio, nombreArchivo) {
    const doc = await generarJornadaOficial(empleado, firma, fichajesMes, mesAnio);
    await guardarPdf(doc, nombreArchivo || `jornada-oficial-${empleado.nombre || 'empleado'}-${(mesAnio||'').replace(/[^\w]/g,'-')}.pdf`);
  }

  async function descargarFiniquito(empleado, firma, nombreArchivo) {
    const doc = await generarFiniquito(empleado, firma);
    await guardarPdf(doc, nombreArchivo || `finiquito-${(empleado.nombre || 'empleado').replace(/\s+/g,'_')}.pdf`);
  }

  /* ==========================================================================
     HORAS DE SERVICIO POR HOTEL · el papel que se adjunta a la factura
     Lo genera la pestaña "Horas y facturación" de la ficha del hotel.
     Lleva SIEMPRE las dos cifras separadas — facturadas y de control — porque
     son cosas distintas: una es lo que se cobra (horario contratado) y la otra
     lo que registró la app. Si un hotel discute la factura, este papel es el
     que la sostiene.
     ========================================================================== */
  function generarHorasHotel(datos) {
    const doc = nuevoPdf();
    const fmtH = window.PSJornada.fmtH;
    header(doc, 'Horas de servicio de socorrismo', `${limpiarTexto(datos.hotel)} · ${datos.nombreMes}`);

    let y = 60;

    // Destinatario: este documento sale de la empresa y va al hotel, así que
    // tiene que decir a quién va dirigido.
    if (datos.contacto) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text('A la atencion de: ' + limpiarTexto(datos.contacto), 15, y - 4);
      doc.setTextColor(0, 0, 0);
    }

    // Resumen destacado arriba: lo primero que mira quien recibe la factura
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.5);
    doc.rect(15, y, 180, 22, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('HORAS TOTALES FACTURADAS', 20, y + 8);
    doc.setFontSize(16);
    doc.text(`${fmtH(datos.totFacturado)} h`, 190, y + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(6, 95, 70);
    doc.text('Horas de control y fichaje', 20, y + 17);
    doc.setFont('helvetica', 'bold');
    doc.text(`${fmtH(datos.totFichado)} h`, 190, y + 17, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 27;

    if (datos.totImputado > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14);
      doc.text(`De las facturadas, ${fmtH(datos.totImputado)} h corresponden a dias sin fichaje, imputados por el horario contratado.`, 15, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    }
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Criterio: se factura el tiempo de servicio dentro del horario contratado del hotel. Los minutos fuera de ese horario no se facturan.', 15, y);
    doc.setTextColor(0, 0, 0);
    y += 7;

    // Tabla día a día
    const cols = [
      { t: 'Dia',    w: 16 },
      { t: 'Socorr.', w: 16, num: true },
      { t: 'Horario contratado', w: 44 },
      { t: 'Fichaje real', w: 48 },
      { t: 'Control', w: 18, num: true },
      { t: 'Facturado', w: 22, num: true },
      { t: 'Estado', w: 16 }
    ];
    const ancho = cols.reduce((a, c) => a + c.w, 0);

    function cabecera() {
      doc.setFillColor(240, 240, 240);
      doc.setDrawColor(170, 170, 170);
      doc.setLineWidth(0.2);
      doc.rect(15, y, ancho, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      let x = 15;
      cols.forEach(c => {
        doc.text(c.t, c.num ? x + c.w - 2 : x + 2, y + 4.6, c.num ? { align: 'right' } : {});
        x += c.w;
      });
      y += 7;
      doc.setFont('helvetica', 'normal');
    }
    cabecera();

    doc.setFontSize(7);
    datos.filas.forEach(f => {
      if (f.estado === 'vacio' && !f.socorristas) return;   // días sin servicio: no ensucian el papel
      const antes = y;
      y = checkPage(doc, y, 6);
      if (y !== antes) cabecera();

      if (f.estado === 'imputada') doc.setFillColor(254, 243, 199);
      else doc.setFillColor(255, 255, 255);
      doc.rect(15, y, ancho, 5.5, 'FD');

      const valores = [
        String(f.dia).padStart(2, '0') + ' ' + f.diaSem,
        String(f.socorristas || 0),
        limpiarTexto(f.horarioTxt || '—'),
        limpiarTexto(f.fichadoTxt || '—'),
        f.fichado ? fmtH(f.fichado) : '—',
        f.facturado ? fmtH(f.facturado) : '—',
        f.estado === 'fichado' ? 'Fichado' : f.estado === 'imputada' ? 'Imputada' : ''
      ];
      let x = 15;
      cols.forEach((c, i) => {
        let txt = valores[i];
        // Recorta lo que no quepa en la celda en vez de pisar la siguiente
        while (txt.length > 4 && doc.getTextWidth(txt) > c.w - 3) txt = txt.slice(0, -2) + '…';
        doc.text(txt, c.num ? x + c.w - 2 : x + 2, y + 3.7, c.num ? { align: 'right' } : {});
        x += c.w;
      });
      y += 5.5;
    });

    // Fila de totales
    y = checkPage(doc, y, 10);
    doc.setFillColor(29, 78, 216);
    doc.rect(15, y, ancho, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`TOTAL ${datos.nombreMes.toUpperCase()}`, 17, y + 5.4);
    let xt = 15 + cols[0].w + cols[1].w + cols[2].w + cols[3].w;
    doc.text(fmtH(datos.totFichado), xt + cols[4].w - 2, y + 5.4, { align: 'right' });
    xt += cols[4].w;
    doc.text(fmtH(datos.totFacturado), xt + cols[5].w - 2, y + 5.4, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 14;

    // Leyenda
    y = checkPage(doc, y, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Como leer este documento', 15, y); y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    [
      'Facturado: tiempo de servicio prestado dentro del horario contratado del hotel. Es la cifra que se factura.',
      'Control: horas efectivamente registradas por los socorristas en la aplicacion, con GPS y hora de entrada y salida.',
      'Imputada: dia sin registro en la aplicacion, facturado por el horario contratado.',
      'Las dos cifras no coinciden por definicion: los minutos trabajados fuera del horario contratado no se facturan al hotel.'
    ].forEach(t => { doc.text('- ' + t, 15, y); y += 4; });
    doc.setTextColor(0, 0, 0);
    y += 8;

    // Conformidad del hotel. Un parte de horas que el cliente devuelve firmado
    // vale mucho mas que uno que solo enviamos: si mas adelante discute la
    // factura, la conformidad ya esta dada por escrito.
    y = checkPage(doc, y, 42);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(15, y, 180, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CONFORME · ' + limpiarTexto(datos.hotel), 20, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text('Firma y sello del hotel dando conformidad a las horas de servicio detalladas.', 20, y + 12);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(190, 190, 190);
    doc.line(20, y + 27, 95, y + 27);
    doc.line(115, y + 27, 190, y + 27);
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text('Nombre y cargo', 20, y + 31);
    doc.text('Fecha, firma y sello', 115, y + 31);
    doc.setTextColor(0, 0, 0);

    numerarPaginas(doc);
    return doc;
  }

  function nombreArchivoHoras(datos) {
    const limpio = (datos.hotel || 'hotel').replace(/[^a-zA-Z0-9]+/g, '-');
    return `PoolSafety-Horas-${limpio}-${datos.mes}.pdf`;
  }

  async function descargarHorasHotel(datos) {
    await guardarPdf(generarHorasHotel(datos), nombreArchivoHoras(datos));
  }

  // Blob del PDF, para poder compartirlo por WhatsApp o correo desde el móvil
  // en vez de tener que descargarlo y buscarlo luego en el teléfono.
  function blobHorasHotel(datos) {
    return { blob: generarHorasHotel(datos).output('blob'), nombre: nombreArchivoHoras(datos) };
  }

  return { generarKitAlta, generarJornadaResumen, generarJornadaOficial, generarFiniquito, generarIncidencia, generarInformesHotel, generarHorasHotel, generarYSubir, descargar, descargarJornadaOficial, descargarFiniquito, descargarIncidencia, descargarInformesHotel, nombreArchivoInformes, descargarHorasHotel, blobHorasHotel, guardarArchivo };
})();
