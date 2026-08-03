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
    const aceptados = firma.aceptados_json || firma.aceptados || {};
    (subdocs || []).forEach(sub => {
      y += 5;
      y = checkPage(doc, y, 30);
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

    // Firma manuscrita
    y += 8;
    y = checkPage(doc, y, 70);
    doc.setDrawColor(185, 28, 28);
    doc.line(15, y, 195, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('FIRMA MANUSCRITA DEL TRABAJADOR', 15, y);
    y += 6;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 90, 34); } catch (e) {}
    }
    y += 40;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Firmado por: ' + limpiarTexto(firma.firma_nombre || empleado.nombre), 15, y); y += 5;
    doc.text('DNI: ' + (firma.dni || '—'), 15, y); y += 5;
    doc.text('Fecha y hora: ' + new Date(firma.fecha_firma).toLocaleString('es-ES'), 15, y);

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
      const cols = [{ h: 'Semana', w: 60 }, { h: 'Días', w: 20, num: true }, { h: 'H. reales', w: 30, num: true }, { h: 'H. firmadas', w: 35, num: true }, { h: 'Extras', w: 25, num: true }];
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
        const extras = Math.max(0, s.horas_reales - s.horas_firmadas);
        const valores = [s.rangoTxt || '—', String(s.dias || 0), `${s.horas_reales || 0}h`, `${s.horas_firmadas || 0}h`, extras > 0 ? `${extras}h` : '—'];
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
      const totExtras = Math.max(0, (campos.horas_reales || 0) - (campos.horas_firmadas || 0));
      const tots = [`TOTAL MES (${campos.dias_trabajados || 0} días)`, '', `${campos.horas_reales || 0}h`, `${campos.horas_firmadas || 0}h`, totExtras > 0 ? `${totExtras}h` : '—'];
      // Combinar 1ª y 2ª columna para el label
      doc.text(tots[0], 17, y + 4);
      cx = 15 + cols[0].w + cols[1].w;
      for (let i = 2; i < 5; i++) {
        doc.text(tots[i], cx + cols[i].w - 2, y + 4, { align: 'right' });
        cx += cols[i].w;
      }
      y += 8;
      doc.setFont('helvetica', 'normal');
    }

    // Resumen firma final
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`El trabajador firma ${campos.horas_firmadas || 0} h ordinarias este mes.`, 15, y);
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

    // Agrupar fichajes por día EMPAREJANDO CADA ENTRADA CON SU SALIDA.
    // Importante para turnos partidos: si alguien ficha 10:00-14:30 y
    // 16:00-20:30, hay que contar 9 h, no 10,5 h (que es lo que salía antes
    // al tomar solo la primera entrada y la última salida, metiendo dentro
    // la hora y media de descanso).
    const porDia = {};   // { 15: { tramos: [{entrada, salida}], horas: 9 } }
    (function emparejarTramos() {
      const ordenados = (fichajesMes || [])
        .slice()
        .sort((a, b) => new Date(a.hora) - new Date(b.hora));
      let abierta = null;
      ordenados.forEach(f => {
        const d = new Date(f.hora);
        const dia = d.getDate();
        if (!porDia[dia]) porDia[dia] = { tramos: [], horas: 0 };
        if (f.tipo === 'entrada') {
          abierta = d;
        } else if (f.tipo === 'salida' && abierta) {
          const diaEntrada = abierta.getDate();
          if (!porDia[diaEntrada]) porDia[diaEntrada] = { tramos: [], horas: 0 };
          porDia[diaEntrada].tramos.push({ entrada: abierta, salida: d });
          porDia[diaEntrada].horas += Math.max(0, (d - abierta) / 3600000);
          abierta = null;
        }
      });
      // Entrada sin salida (se olvidó de fichar): la dejamos visible sin horas
      if (abierta) {
        const dia = abierta.getDate();
        if (!porDia[dia]) porDia[dia] = { tramos: [], horas: 0 };
        porDia[dia].tramos.push({ entrada: abierta, salida: null });
      }
    })();

    // Detectar año y mes desde el código de la firma para saber cuántos días tiene el mes y festivos
    const mm = (firma.documento_codigo || '').match(/jornada-(\d{4})-(\d{2})/);
    const anioNum = mm ? parseInt(mm[1]) : new Date().getFullYear();
    const mesNum  = mm ? parseInt(mm[2]) - 1 : new Date().getMonth();
    const diasEnMes = new Date(anioNum, mesNum + 1, 0).getDate();
    const nombresDia = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];

    // Tabla — añadida columna "Día sem." + espacio para nombre festivo
    const cols = [
      { titulo: 'Día',                  w: 10 },
      { titulo: 'Sem.',                 w: 10 },
      { titulo: 'Hora entrada',         w: 22 },
      { titulo: 'Hora salida',          w: 22 },
      { titulo: 'Horas ord. pactadas',  w: 28 },
      { titulo: 'Complem. voluntarias', w: 30 },
      { titulo: 'Firma trabajador',     w: 58 }
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
    let totalOrd = 0, totalCompl = 0;
    let totalOrdFest = 0, totalComplFest = 0; // horas trabajadas en festivo/finde
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
        // El tope de 8 h ordinarias se aplica al TOTAL DEL DÍA, no a cada tramo
        const ord  = Math.min(8, d.horas);
        const comp = Math.max(0, d.horas - 8);
        if (d.horas > 0) {
          horasOrd = ord.toFixed(1);
          horasCompl = comp > 0 ? comp.toFixed(1) : '';
          totalOrd += ord;
          totalCompl += comp;
          if (especial) { totalOrdFest += ord; totalComplFest += comp; }
        }
      }

      // Marca de festivo o aviso de turno partido / fichaje incompleto
      let marcaFestivo = '';
      if (festivo) marcaFestivo = `FESTIVO · ${festivo}`;
      else if (d && d.tramos.length > 1) marcaFestivo = 'Turno partido';
      else if (d && d.tramos.some(t => !t.salida)) marcaFestivo = 'Sin fichar salida';

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
    doc.text(`Total horas ordinarias: ${totalOrd.toFixed(1)}h`, 15, y);
    doc.text(`Total horas complementarias: ${totalCompl.toFixed(1)}h`, 110, y);
    y += 5;
    if (totalOrdFest + totalComplFest > 0) {
      doc.setTextColor(155, 28, 28);
      doc.text(`De las cuales, en festivo/domingo: ${(totalOrdFest + totalComplFest).toFixed(1)}h`, 15, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
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
  async function generarIncidencia(inc, empleado) {
    const doc = nuevoPdf();
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
        await svgToPdf(doc, window.PSInc.siluetaSVG(zonas, false, 'front'), COL_R, y + 5, 24, 55);
        await svgToPdf(doc, window.PSInc.siluetaSVG(zonas, false, 'back'),  COL_R + 28, y + 5, 24, 55);
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
    doc.save(nombreArchivo || `PoolSafety-incidencia-${inc.numero_parte || 'sin-num'}.pdf`);
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
    doc.save(nombreArchivo || `${firma.documento_codigo}-${empleado.nombre || 'empleado'}.pdf`);
  }

  async function descargarJornadaOficial(empleado, firma, fichajesMes, mesAnio, nombreArchivo) {
    const doc = await generarJornadaOficial(empleado, firma, fichajesMes, mesAnio);
    doc.save(nombreArchivo || `jornada-oficial-${empleado.nombre || 'empleado'}-${(mesAnio||'').replace(/[^\w]/g,'-')}.pdf`);
  }

  async function descargarFiniquito(empleado, firma, nombreArchivo) {
    const doc = await generarFiniquito(empleado, firma);
    doc.save(nombreArchivo || `finiquito-${(empleado.nombre || 'empleado').replace(/\s+/g,'_')}.pdf`);
  }

  return { generarKitAlta, generarJornadaResumen, generarJornadaOficial, generarFiniquito, generarIncidencia, generarYSubir, descargar, descargarJornadaOficial, descargarFiniquito, descargarIncidencia };
})();
