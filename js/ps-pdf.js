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

    // Agrupar fichajes por día → { dia: {entrada, salida} }
    const porDia = {};
    (fichajesMes || []).forEach(f => {
      const d = new Date(f.hora);
      const dia = d.getDate();
      porDia[dia] = porDia[dia] || {};
      if (f.tipo === 'entrada' && !porDia[dia].entrada) porDia[dia].entrada = d;
      else if (f.tipo === 'salida') porDia[dia].salida = d;
    });

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
      const entrada = d && d.entrada ? d.entrada.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
      const salida  = d && d.salida  ? d.salida.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
      let horasOrd = '', horasCompl = '';
      if (d && d.entrada && d.salida) {
        const h = Math.max(0, (d.salida - d.entrada) / 3600000);
        const ord = Math.min(8, h);
        const comp = Math.max(0, h - 8);
        horasOrd = ord.toFixed(1);
        horasCompl = comp > 0 ? comp.toFixed(1) : '';
        totalOrd += ord;
        totalCompl += comp;
        if (especial) { totalOrdFest += ord; totalComplFest += comp; }
      }

      // Marca de festivo tras las horas si aplica y hay trabajo
      let marcaFestivo = '';
      if (festivo) marcaFestivo = `FESTIVO · ${festivo}`;

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
     Storage + descarga
     ========================================================================== */
  async function generarYSubir(empleado, firma, subdocs) {
    let doc;
    if (firma.documento_codigo === 'kit-alta') doc = await generarKitAlta(empleado, firma, subdocs);
    else doc = await generarJornadaResumen(empleado, firma);
    const blob = doc.output('blob');
    const path = `firmas/${firma.id || Date.now()}.pdf`;
    const url = await window.PSStorage.subir(path, blob, 'application/pdf');
    if (firma.id) {
      await window.sb.from('firmas_documentos').update({ archivo_pdf_url: url }).eq('id', firma.id);
    }
    return url;
  }

  async function descargar(empleado, firma, subdocs, nombreArchivo) {
    let doc;
    if (firma.documento_codigo === 'kit-alta') doc = await generarKitAlta(empleado, firma, subdocs);
    else doc = await generarJornadaResumen(empleado, firma);
    doc.save(nombreArchivo || `${firma.documento_codigo}-${empleado.nombre || 'empleado'}.pdf`);
  }

  async function descargarJornadaOficial(empleado, firma, fichajesMes, mesAnio, nombreArchivo) {
    const doc = await generarJornadaOficial(empleado, firma, fichajesMes, mesAnio);
    doc.save(nombreArchivo || `jornada-oficial-${empleado.nombre || 'empleado'}-${(mesAnio||'').replace(/[^\w]/g,'-')}.pdf`);
  }

  return { generarKitAlta, generarJornadaResumen, generarJornadaOficial, generarYSubir, descargar, descargarJornadaOficial };
})();
