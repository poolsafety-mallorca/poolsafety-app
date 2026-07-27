/* ==========================================================================
   PoolSafety · Generación de PDFs firmados (Kit Alta, Jornada, otros)
   Requiere jsPDF cargado antes por CDN → window.jspdf.jsPDF
   ========================================================================== */

window.PSPdf = (function () {

  const EMPRESA = {
    razonSocial: 'Pool Safety Des Llevant, S.L.',
    cif: 'B75828418',
    domicilio: 'C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares',
    email: 'info@poolsafety.es'
  };

  function nuevoPdf() {
    if (!window.jspdf) throw new Error('jsPDF no está cargado');
    return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  }

  function header(doc, titulo, subtitulo) {
    // Barra roja arriba
    doc.setFillColor(185, 28, 28); // #B91C1C
    doc.rect(0, 0, 210, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('PoolSafety', 15, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(EMPRESA.razonSocial + ' · CIF ' + EMPRESA.cif, 15, 21);
    doc.text(EMPRESA.domicilio, 15, 26);
    // Título documento
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(titulo, 15, 44);
    if (subtitulo) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(subtitulo, 15, 51);
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
    if (y + needed > h - 25) {
      doc.addPage();
      return 20;
    }
    return y;
  }

  function limpiarTexto(txt) {
    // jsPDF no soporta bien emojis y algunos chars unicode; los quitamos
    return (txt || '').replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[❤️⚡✓✗]/g, '');
  }

  /* --- KIT ALTA --- */
  async function generarKitAlta(empleado, firma, subdocs) {
    const doc = nuevoPdf();
    header(doc, 'Kit Alta Empresa',
      'Documentación laboral inicial firmada por el empleado');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    let y = 65;
    doc.text('DATOS DEL EMPLEADO', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${empleado.nombre || '—'}`, 15, y); y += 5;
    doc.text(`DNI: ${firma.dni || empleado.dni || '—'}`, 15, y); y += 5;
    doc.text(`Email: ${empleado.email || firma.campos_json?.emailPersonal || '—'}`, 15, y); y += 5;
    doc.text(`Teléfono: ${empleado.telefono || firma.campos_json?.telefonoPersonal || '—'}`, 15, y); y += 5;

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('EVIDENCIA DE FIRMA', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date(firma.fecha_firma).toLocaleString('es-ES')}`, 15, y); y += 5;
    doc.text(`Dispositivo: ${firma.dispositivo || 'móvil'}`, 15, y); y += 5;
    if (firma.ubicacion_lat && firma.ubicacion_lng) {
      doc.text(`Ubicación GPS: ${(+firma.ubicacion_lat).toFixed(5)}, ${(+firma.ubicacion_lng).toFixed(5)}`, 15, y);
      y += 5;
    }
    if (firma.ip_firma) { doc.text(`IP registrada: ${firma.ip_firma}`, 15, y); y += 5; }

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('DOCUMENTOS ACEPTADOS', 15, y);
    y += 6;
    doc.setFontSize(9);
    const aceptados = firma.aceptados_json || {};
    (subdocs || []).forEach(sub => {
      y = checkPage(doc, y, 18);
      const ok = aceptados[sub.id];
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(ok ? 0 : 150, ok ? 100 : 30, ok ? 0 : 30);
      doc.text((ok ? '[ACEPTADO] ' : '[NO ACEPTADO] ') + limpiarTexto(sub.titulo), 15, y);
      y += 4;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(limpiarTexto(sub.resumen), 175);
      lines.forEach(line => {
        y = checkPage(doc, y, 5);
        doc.text(line, 20, y);
        y += 4;
      });
      if (sub.norma) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text('Normativa: ' + limpiarTexto(sub.norma), 20, y);
        y += 4;
        doc.setTextColor(0, 0, 0);
      }
      doc.setFontSize(9);
      y += 3;
    });

    // Firma
    y = checkPage(doc, y, 60);
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('FIRMA MANUSCRITA', 15, y);
    y += 6;
    if (firma.firma_imagen) {
      try {
        doc.addImage(firma.firma_imagen, 'PNG', 15, y, 90, 34);
      } catch (e) { console.warn('firma img:', e); }
    }
    y += 40;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Firmado por: ' + limpiarTexto(firma.firma_nombre || empleado.nombre), 15, y);
    y += 5;
    doc.text('DNI: ' + (firma.dni || '—'), 15, y);
    y += 5;
    doc.text('Fecha y hora: ' + new Date(firma.fecha_firma).toLocaleString('es-ES'), 15, y);

    // Numeración de páginas
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      footer(doc, i, total);
    }
    return doc;
  }

  /* --- JORNADA MENSUAL --- */
  async function generarJornada(empleado, firma) {
    const doc = nuevoPdf();
    header(doc, 'Registro Mensual de Jornada Laboral',
      firma.documento_codigo + ' · Firmado por el empleado');

    let y = 65;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLEADO', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${empleado.nombre}`, 15, y); y += 5;
    doc.text(`DNI: ${empleado.dni || '—'}`, 15, y); y += 5;
    doc.text(`Puesto: ${empleado.puesto_nombre || '—'}`, 15, y); y += 5;

    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('EVIDENCIA DE FIRMA', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date(firma.fecha_firma).toLocaleString('es-ES')}`, 15, y); y += 5;
    doc.text(`Dispositivo: ${firma.dispositivo || 'móvil'}`, 15, y); y += 5;
    if (firma.ubicacion_lat) {
      doc.text(`GPS: ${(+firma.ubicacion_lat).toFixed(5)}, ${(+firma.ubicacion_lng).toFixed(5)}`, 15, y);
      y += 5;
    }

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA MANUSCRITA', 15, y); y += 6;
    if (firma.firma_imagen) {
      try { doc.addImage(firma.firma_imagen, 'PNG', 15, y, 90, 34); } catch (e) {}
    }
    y += 40;
    doc.setFont('helvetica', 'normal');
    doc.text('Firmado por: ' + firma.firma_nombre, 15, y); y += 5;
    doc.text('En cumplimiento del RD-ley 8/2019 sobre registro horario', 15, y);

    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); footer(doc, i, total); }
    return doc;
  }

  async function generarYSubir(empleado, firma, subdocs) {
    let doc;
    if (firma.documento_codigo === 'kit-alta') {
      doc = await generarKitAlta(empleado, firma, subdocs);
    } else {
      doc = await generarJornada(empleado, firma);
    }
    const blob = doc.output('blob');
    // Subir a Supabase Storage
    const path = `firmas/${firma.id || Date.now()}.pdf`;
    const url = await window.PSStorage.subir(path, blob, 'application/pdf');
    // Actualizar la firma con la URL del PDF
    if (firma.id) {
      await window.sb.from('firmas_documentos').update({ archivo_pdf_url: url }).eq('id', firma.id);
    }
    return url;
  }

  async function descargar(empleado, firma, subdocs, nombreArchivo) {
    let doc;
    if (firma.documento_codigo === 'kit-alta') {
      doc = await generarKitAlta(empleado, firma, subdocs);
    } else {
      doc = await generarJornada(empleado, firma);
    }
    doc.save(nombreArchivo || `${firma.documento_codigo}-${empleado.nombre || 'empleado'}.pdf`);
  }

  return { generarKitAlta, generarJornada, generarYSubir, descargar };
})();
