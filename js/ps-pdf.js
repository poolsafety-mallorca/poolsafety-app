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
    if (y + needed > h - 25) { doc.addPage(); return 20; }
    return y;
  }

  function numerarPaginas(doc) {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); footer(doc, i, total); }
  }

  /* ==========================================================================
     KIT ALTA · texto legal completo + tabla EPIs + firma
     ========================================================================== */
  async function generarKitAlta(empleado, firma, subdocs) {
    // Fallback robusto: si no llegan subdocs, léelos de window.PS
    if (!subdocs || subdocs.length === 0) {
      subdocs = (window.PS && window.PS.kitAltaSubdocs) || [];
    }
    if (subdocs.length === 0) {
      console.warn('[PSPdf.generarKitAlta] Sin subdocs — el PDF no incluirá el texto legal');
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

      // Tabla EPIs si aplica
      if (sub.esListaEpis) {
        y += 4;
        y = checkPage(doc, y, 40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('EQUIPOS DE PROTECCIÓN INDIVIDUAL ENTREGADOS', 15, y); y += 5;

        const cantidades = (campos.epis) || {};
        const filas = (sub.epis || []).map(e => [
          limpiarTexto(e.nombre),
          limpiarTexto(e.color),
          limpiarTexto(e.modelo),
          String((cantidades[e.id] != null) ? cantidades[e.id] : e.unidades)
        ]);
        // Tabla manual
        const anchoCols = [65, 40, 40, 25];
        const totalAncho = anchoCols.reduce((a,b)=>a+b, 0);
        const xInicio = 15;
        // Header
        doc.setFillColor(240, 240, 240);
        doc.setDrawColor(200, 200, 200);
        doc.rect(xInicio, y, totalAncho, 6, 'FD');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        ['Equipo','Color','Modelo','Unidades'].forEach((h,i) => {
          const xh = xInicio + anchoCols.slice(0,i).reduce((a,b)=>a+b, 0) + 2;
          doc.text(h, xh, y + 4);
        });
        y += 6;
        // Filas
        doc.setFont('helvetica', 'normal');
        for (const fila of filas) {
          y = checkPage(doc, y, 6);
          doc.rect(xInicio, y, totalAncho, 5.5, 'D');
          fila.forEach((v,i) => {
            const xh = xInicio + anchoCols.slice(0,i).reduce((a,b)=>a+b, 0) + 2;
            doc.text(v, xh, y + 4);
          });
          y += 5.5;
        }
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

    numerarPaginas(doc);
    return doc;
  }

  /* ==========================================================================
     JORNADA · RESUMEN MENSUAL (lo que ve y firma el trabajador)
     Formato simple: 40h/sem · 160h/mes (o reales si < 40h)
     ========================================================================== */
  async function generarJornadaResumen(empleado, firma) {
    const doc = nuevoPdf();
    header(doc, 'Registro Mensual de Jornada', firma.documento_codigo);

    let y = 58;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS', 15, y); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Trabajador: ${limpiarTexto(empleado.nombre || '')}`, 15, y); y += 4.5;
    doc.text(`DNI: ${empleado.dni || '—'}`, 15, y); y += 4.5;
    if (empleado.puesto_nombre) { doc.text(`Puesto: ${empleado.puesto_nombre}`, 15, y); y += 4.5; }

    const campos = firma.campos_json || {};
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('HORAS DECLARADAS ESTE MES', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Horas ordinarias (40h/sem · 160h/mes máx): ${campos.horas_firmadas || 160}h`, 15, y); y += 5;
    if (campos.horas_reales && campos.horas_reales > (campos.horas_firmadas || 160)) {
      doc.setTextColor(120, 120, 120);
      doc.text(`(Horas reales trabajadas registradas por el sistema: ${campos.horas_reales}h — solo visible para administración)`, 15, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    }

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

    // Tabla 31 días
    const cols = [
      { titulo: 'Día',                  w: 12 },
      { titulo: 'Hora entrada',         w: 25 },
      { titulo: 'Hora salida',          w: 25 },
      { titulo: 'Horas ord. pactadas',  w: 30 },
      { titulo: 'Complem. voluntarias', w: 32 },
      { titulo: 'Firma trabajador',     w: 56 }
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    let totalOrd = 0, totalCompl = 0;
    for (let dia = 1; dia <= 31; dia++) {
      y = checkPage(doc, y, 7);
      doc.rect(xInicio, y, totalAncho, 6, 'D');
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
      }
      const valores = [String(dia), entrada, salida, horasOrd, horasCompl, ''];
      xh = xInicio;
      cols.forEach((c, i) => {
        doc.text(valores[i], xh + c.w/2, y + 4, { align: 'center' });
        xh += c.w;
      });
      y += 6;
    }

    // Totales
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Total horas ordinarias: ${totalOrd.toFixed(1)}h`, 15, y);
    doc.text(`Total horas complementarias: ${totalCompl.toFixed(1)}h`, 110, y);
    y += 8;

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
