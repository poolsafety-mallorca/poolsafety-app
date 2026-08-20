/* PoolSafety · Importador de cuadrante semanal (formato del cliente)
   =====================================================================
   El cliente mantiene un Excel con UNA HOJA POR SEMANA. Cada hoja es
   una cuadrícula:
     · Fila cabecera: "SEMANA DE X-Y DE MES"
     · Fila cabecera 2: LUNES..DOMINGO (cols D..J)
     · Filas de datos:
         Col B → nombre hotel (o cabecera grupal tipo INTUROTEL, GAVIMAR…)
         Col C → rango horario (p.ej. "10:00 - 18:00", "10:00-14:00/16:30-20:30")
         Cols D-J → nombre socorrista por día (o vacío = libre)
     · Filas grupales (B con INTUROTEL y C vacía) se ignoran.

   Este módulo lee cualquier .xlsx con ese formato, detecta las asignaciones,
   las machea con empleados+hoteles de la BD (fuzzy match), muestra un
   preview y aplica horarios activos con fecha_desde/fecha_hasta.

   Requiere SheetJS (window.XLSX) — ya cargado por el importador anterior.
   Uso: window.PSCuadrante.openModal()
   ===================================================================== */
(function () {
  const MESES = { enero:0, ene:0, febrero:1, feb:1, marzo:2, mar:2, abril:3, abr:3, mayo:4, may:4, junio:5, jun:5,
                  julio:6, jul:6, agosto:7, ago:7, septiembre:8, sep:8, sept:8, octubre:9, oct:9,
                  noviembre:10, nov:10, diciembre:11, dic:11 };
  const DIAS_HDR = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
  // Grupos que en el Excel son cabecera y NO hoteles reales. Se ignoran.
  const GRUPOS_CABECERA = new Set(['portocolom','inturotel','gavimar','menorca']);
  // Valores que significan "sin socorrista"
  const VACIO_VALORES = new Set(['','sin servicio','sinservicio','-','x']);

  function norm(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function normNombre(s) {
    // Para matching de personas/hoteles: quita también espacios internos y símbolos raros
    return norm(s).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Parsea "SEMANA DE 10-16 DE AGOSTO" → { diaIni:10, diaFin:16, mes:7 }
  // Acepta también "SEMANA DEL 09 - 15 MARZO" y "MARZO 9-15".
  function parseSemanaLabel(raw) {
    const s = norm(raw);
    // Formato 1: "semana de 10-16 de agosto"
    let m = s.match(/(?:semana\s+d?e?l?\s+)?(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(?:de\s+)?([a-z]+)/);
    if (m) {
      const mes = MESES[m[3]];
      if (mes !== undefined) return { diaIni: +m[1], diaFin: +m[2], mes };
    }
    // Formato 2: "marzo 9-15"
    m = s.match(/([a-z]+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (m) {
      const mes = MESES[m[1]];
      if (mes !== undefined) return { diaIni: +m[2], diaFin: +m[3], mes };
    }
    return null;
  }

  // Del nombre de hoja "MARZO 9-15 " o "SEMANA 10-16" saca el rango
  function parseSheetName(name) {
    return parseSemanaLabel(name);
  }

  // Rango horario: "10:00 - 18:00", "9:30-17:30", "7:00 -15:00", "10:00-14:00/16:30-20:30"
  // Devuelve { hi, hf, es_partido, hi2, hf2 } (strings HH:MM o null)
  function parseHorario(raw) {
    if (!raw) return null;
    const s = String(raw).trim().replace(/\s+/g,' ').replace(/[–—]/g,'-');
    // Turno partido: "A-B/C-D" o "A-B / C-D"
    const partido = s.match(/(\d{1,2}[:.]?\d{0,2})\s*-\s*(\d{1,2}[:.]?\d{0,2})\s*[\/,]\s*(\d{1,2}[:.]?\d{0,2})\s*-\s*(\d{1,2}[:.]?\d{0,2})/);
    if (partido) {
      return {
        hi: fmtHora(partido[1]), hf: fmtHora(partido[2]),
        hi2: fmtHora(partido[3]), hf2: fmtHora(partido[4]),
        es_partido: true
      };
    }
    // Un solo tramo: "A - B" (permite "A :B" que aparece en el excel)
    const uno = s.match(/(\d{1,2}[:.]?\d{0,2})\s*[-:]\s*(\d{1,2}[:.]?\d{0,2})/);
    if (uno) {
      return { hi: fmtHora(uno[1]), hf: fmtHora(uno[2]), hi2: null, hf2: null, es_partido: false };
    }
    return null;
  }
  function fmtHora(t) {
    if (!t) return null;
    const s = String(t).trim().replace('.', ':');
    let hh, mm = 0;
    if (s.includes(':')) {
      const p = s.split(':');
      hh = parseInt(p[0], 10); mm = parseInt(p[1], 10) || 0;
    } else {
      hh = parseInt(s, 10);
    }
    if (isNaN(hh) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  }

  // ¿Es una fila de cabecera repetida? ("SEMANA DE...", " HOTELES", cabeceras días)
  function esCabecera(fila) {
    const col = i => norm(fila[i] || '');
    if (col(1).startsWith('semana de') || col(1).includes('hoteles') || col(1) === 'hotel') return true;
    // Fila "días de la semana"
    if (col(3) === 'lunes' && col(4).startsWith('marte')) return true;
    return false;
  }
  // ¿Es una fila de grupo (INTUROTEL, GAVIMAR…) que se debe ignorar?
  function esGrupo(fila) {
    const b = norm(fila[1] || '');
    const c = String(fila[2] || '').trim();
    // Grupo: B tiene nombre grupal + C vacía Y todas las D-J vacías o días semana
    if (GRUPOS_CABECERA.has(b) && !c) return true;
    return false;
  }

  // ========== PARSER PRINCIPAL ==========
  // Devuelve array flat de asignaciones:
  // [{ hotelRaw, horaTxt, hi, hf, hi2, hf2, es_partido, socorristaRaw, dia (0-6), fecha (Date) }, ...]
  function parseCuadranteWorkbook(wb, anioBase) {
    if (!window.XLSX) throw new Error('SheetJS (XLSX) no cargado');
    const asignaciones = [];
    const debug = { hojas: 0, filasDatos: 0, ignoradas: 0, sinHorario: 0 };
    const anio = anioBase || new Date().getFullYear();

    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name];
      if (!ws) return;
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) return;

      // Semana: primero probar por el título dentro de la hoja, si no por el nombre de hoja
      let semana = null;
      for (let r = 0; r < Math.min(rows.length, 15); r++) {
        for (let c = 0; c < (rows[r] || []).length; c++) {
          const s = parseSemanaLabel(rows[r][c]);
          if (s) { semana = s; break; }
        }
        if (semana) break;
      }
      if (!semana) semana = parseSheetName(name);
      if (!semana) return; // hoja sin semana identificable → ignorar

      debug.hojas++;
      // Construir fecha lunes de la semana (Lun = diaIni?)
      // El excel muestra por columnas D..J los días LUN..DOM.
      // diaIni corresponde al lunes (col D).
      // Usar UTC para evitar saltos de día por zona horaria al llamar
      // .toISOString() más tarde (24-agosto local → 23-agosto UTC).
      const fechaLun = new Date(Date.UTC(anio, semana.mes, semana.diaIni));
      // Iterar filas de datos
      rows.forEach((fila, idx) => {
        if (!fila || fila.every(c => !String(c || '').trim())) return;
        if (esCabecera(fila)) return;
        if (esGrupo(fila)) return;

        const hotelRaw = String(fila[1] || '').trim();
        const horaTxt = String(fila[2] || '').trim();
        if (!hotelRaw) return;
        // Si col C no tiene horario y las D-J son días semana → cabecera grupal
        const parsed = parseHorario(horaTxt);
        if (!parsed) { debug.sinHorario++; return; } // sin horario => ignorar

        for (let d = 0; d < 7; d++) {
          const cell = String(fila[3 + d] || '').trim();
          const cellN = norm(cell);
          if (!cell || VACIO_VALORES.has(cellN)) continue;
          if (cellN === 'lunes' || cellN.startsWith('marte')) continue; // seguridad
          const fecha = new Date(fechaLun.getTime() + d * 86400000);
          // Limpieza + split de nombres compartidos:
          //  · "NASSER 9" / "ALBA 6,5" → quitar horas al final (dígitos + coma/punto)
          //  · "ALVARO/ESTEBAN" / "ALBA/NASSER" → generar 2 asignaciones
          //  · "PAULA6/GUILERMO2" → separar y limpiar horas
          const partes = cell.split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
          partes.forEach(parte => {
            // Quita cifras+coma al final: "NASSER 9", "ALBA 6,5", "PAULA6"
            const limpio = parte.replace(/\s*\d+([,\.]\d+)?\s*h?\s*$/i, '').trim();
            if (!limpio || VACIO_VALORES.has(norm(limpio))) return;
            asignaciones.push({
              hotelRaw,
              horaTxt,
              hi: parsed.hi, hf: parsed.hf,
              hi2: parsed.hi2, hf2: parsed.hf2,
              es_partido: parsed.es_partido,
              socorristaRaw: limpio,
              dia: d,
              fecha
            });
            debug.filasDatos++;
          });
        }
      });
    });
    return { asignaciones, debug };
  }

  // ========== MATCHING FUZZY ==========
  // Devuelve { emp, score } o null
  function matchEmpleado(nombreRaw, empleados) {
    const q = normNombre(nombreRaw);
    if (!q) return null;
    let best = null, bestScore = 0;
    for (const e of empleados) {
      const nm = normNombre(e.nombre);
      if (!nm) continue;
      let score = 0;
      if (nm === q) score = 100;
      else if (nm.includes(q) || q.includes(nm)) score = 85;
      else {
        // Match por tokens: cada token del query debe estar en el nombre real
        const qTokens = q.split(' ').filter(t => t.length >= 3);
        if (qTokens.length && qTokens.every(t => nm.includes(t))) score = 70;
      }
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best && bestScore >= 70 ? { emp: best, score: bestScore } : null;
  }
  function matchHotel(nombreRaw, puestos) {
    const q = normNombre(nombreRaw);
    if (!q) return null;
    let best = null, bestScore = 0;
    for (const p of puestos) {
      const nm = normNombre(p.nombre);
      if (!nm) continue;
      let score = 0;
      if (nm === q) score = 100;
      else if (nm.includes(q) || q.includes(nm)) score = 85;
      else {
        const qTokens = q.split(' ').filter(t => t.length >= 3);
        if (qTokens.length && qTokens.every(t => nm.includes(t))) score = 70;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best && bestScore >= 70 ? { p: best, score: bestScore } : null;
  }

  // ========== MODAL UI ==========
  let modalEl = null;
  let ultimaData = null; // { asignaciones, resueltas: [], nomatches: {emp:[], hotel:[]}, semanas: [] }

  async function abrirModal(fileOpcional) {
    if (modalEl) modalEl.remove();
    const rol = ((window.PS_SESSION || {}).rol);
    if (rol !== 'dueno' && rol !== 'coordinador') { alert('Solo admin/coord'); return; }
    modalEl = document.createElement('div');
    modalEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:22000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px;';
    modalEl.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:900px;width:100%;display:flex;flex-direction:column;max-height:calc(100vh - 40px);">
        <div style="padding:16px 20px;background:#B91C1C;color:#fff;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.85;">Cuadrante semanal</div>
            <div style="font-size:16px;font-weight:800;margin-top:2px;">Subir cuadrante Excel del cliente</div>
          </div>
          <button onclick="window.PSCuadrante._close()" style="background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;">✕</button>
        </div>
        <div style="padding:18px 20px;overflow-y:auto;flex:1;">
          <div style="padding:12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;font-size:13px;color:#1E3A8A;margin-bottom:14px;">
            <b>Formato esperado:</b> el Excel del cliente con una hoja por semana (nombre "SEMANA X-Y" o "MARZO 9-15").
            Cada hoja: filas de hotel + horario + socorristas por día (Lun-Dom en cols D-J).
            La app detectará todo automáticamente.
          </div>

          <label style="display:block;padding:14px;border:2px dashed #B91C1C;border-radius:10px;text-align:center;cursor:pointer;background:#FEF2F2;" id="dropCuadrante">
            <input type="file" id="fileCuadrante" accept=".xlsx,.xls" style="display:none;" />
            <div style="font-size:14px;font-weight:700;color:#B91C1C;">📤 Elegir cuadrante .xlsx</div>
            <div style="font-size:12px;color:#7F1D1D;margin-top:4px;">Arrastra el archivo aquí o pulsa</div>
          </label>

          <div id="cuadranteAnio" style="margin-top:14px;display:flex;align-items:center;gap:10px;font-size:13px;">
            <label style="font-weight:700;">Año del cuadrante:</label>
            <select id="cuadranteAnioSel" style="padding:6px 10px;border:1px solid #CBD5E1;border-radius:6px;font-size:13px;">
              ${[new Date().getFullYear()-1, new Date().getFullYear(), new Date().getFullYear()+1].map(a => `<option value="${a}" ${a === new Date().getFullYear() ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
            <span style="color:#64748B;">(las hojas dicen "MARZO 9-15" pero no el año)</span>
          </div>

          <div id="cuadrantePreview" style="margin-top:14px;"></div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid #E2E8F0;display:flex;gap:10px;justify-content:flex-end;">
          <button onclick="window.PSCuadrante._close()" class="btn btn-outline">Cancelar</button>
          <button onclick="window.PSCuadrante._aplicar()" class="btn btn-primary" id="btnAplicarCuadrante" disabled style="opacity:.5;cursor:not-allowed;">Aplicar horarios</button>
        </div>
      </div>`;
    document.body.appendChild(modalEl);

    document.getElementById('fileCuadrante').addEventListener('change', e => procesarArchivo(e.target.files[0]));
    const drop = document.getElementById('dropCuadrante');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.background = '#FEE2E2'; });
    drop.addEventListener('dragleave', () => { drop.style.background = '#FEF2F2'; });
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.style.background = '#FEF2F2';
      if (e.dataTransfer.files[0]) procesarArchivo(e.dataTransfer.files[0]);
    });
    // Si se abrió con un archivo ya (drag desde fuera del modal), procesarlo
    if (fileOpcional) setTimeout(() => procesarArchivo(fileOpcional), 100);
  }

  // Enganchar drag-drop del panel principal (uploadDropCuadrante) para que
  // arrastrar el archivo directamente abra el modal y lo procese al vuelo.
  function engancharDragDropPanel() {
    const dz = document.getElementById('uploadDropCuadrante');
    if (!dz || dz._psBound) return;
    dz._psBound = true;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.background = '#FCA5A5'; });
    dz.addEventListener('dragleave', () => { dz.style.background = ''; });
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.style.background = '';
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) abrirModal(file);
    });
  }
  // Reintentar hasta que el DOM lo tenga (el panel Horarios puede tardar en renderizar)
  setTimeout(engancharDragDropPanel, 500);
  setTimeout(engancharDragDropPanel, 1500);
  setTimeout(engancharDragDropPanel, 3000);
  document.addEventListener('ps-session-updated', () => setTimeout(engancharDragDropPanel, 300));

  async function procesarArchivo(file) {
    if (!file) return;
    const prev = document.getElementById('cuadrantePreview');
    prev.innerHTML = '<div style="padding:20px;text-align:center;color:#64748B;">⏳ Leyendo Excel…</div>';
    try {
      if (!window.XLSX) throw new Error('Librería SheetJS no cargada. Recarga la página.');
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      const anio = parseInt(document.getElementById('cuadranteAnioSel').value) || new Date().getFullYear();
      const { asignaciones, debug } = parseCuadranteWorkbook(wb, anio);
      if (!asignaciones.length) {
        prev.innerHTML = `<div style="padding:20px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;color:#78350F;">
          No se han detectado asignaciones. Revisa que el Excel tenga hojas con formato semanal (SEMANA X-Y) y filas hotel+horario+socorristas.
        </div>`;
        return;
      }
      // Cargar empleados + hoteles de BD para matching
      const [empR, hotR] = await Promise.all([
        window.sb.from('empleados').select('id, nombre, dni, puesto_id, es_correturnos').eq('estado','activo'),
        window.sb.from('puestos').select('id, nombre, zona').eq('activo', true)
      ]);
      const empleados = empR.data || [];
      const puestos = hotR.data || [];
      // Matchear
      const resolved = [];
      const noMatchEmp = new Set();
      const noMatchHotel = new Set();
      const cacheEmp = {}, cacheHotel = {};
      asignaciones.forEach(a => {
        if (!(a.socorristaRaw in cacheEmp)) cacheEmp[a.socorristaRaw] = matchEmpleado(a.socorristaRaw, empleados);
        if (!(a.hotelRaw in cacheHotel)) cacheHotel[a.hotelRaw] = matchHotel(a.hotelRaw, puestos);
        const me = cacheEmp[a.socorristaRaw];
        const mh = cacheHotel[a.hotelRaw];
        if (!me) noMatchEmp.add(a.socorristaRaw);
        if (!mh) noMatchHotel.add(a.hotelRaw);
        resolved.push({ ...a, emp: me?.emp, hotel: mh?.p, ok: !!(me && mh) });
      });
      ultimaData = { asignaciones: resolved, empleados, puestos, debug };

      const okCount = resolved.filter(x => x.ok).length;
      const errCount = resolved.length - okCount;
      const semanasDetectadas = [...new Set(resolved.map(x => x.fecha.toISOString().slice(0,10)))].sort();
      const semanaMin = semanasDetectadas[0];
      const semanaMax = semanasDetectadas[semanasDetectadas.length - 1];

      prev.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
          <div style="padding:12px;background:#DCFCE7;border:1px solid #86EFAC;border-radius:10px;">
            <div style="font-size:11px;font-weight:700;color:#065F46;text-transform:uppercase;">✓ Correctas</div>
            <div style="font-size:22px;font-weight:800;color:#065F46;">${okCount}</div>
          </div>
          <div style="padding:12px;background:#FEE2E2;border:1px solid #FCA5A5;border-radius:10px;">
            <div style="font-size:11px;font-weight:700;color:#7F1D1D;text-transform:uppercase;">✗ Con errores</div>
            <div style="font-size:22px;font-weight:800;color:#7F1D1D;">${errCount}</div>
          </div>
          <div style="padding:12px;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:10px;">
            <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;">Rango</div>
            <div style="font-size:13px;font-weight:700;color:#334155;">${semanaMin} → ${semanaMax}</div>
          </div>
          <div style="padding:12px;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:10px;">
            <div style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;">Hojas / Filas</div>
            <div style="font-size:13px;font-weight:700;color:#334155;">${debug.hojas} hojas · ${debug.filasDatos} filas</div>
          </div>
        </div>

        ${noMatchEmp.size ? `<div style="padding:10px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;margin-bottom:10px;font-size:12.5px;color:#78350F;">
          <b>⚠️ Socorristas no encontrados en la BD (${noMatchEmp.size}):</b> ${[...noMatchEmp].join(', ')}
          <br><span style="font-size:11.5px;">Dales de alta antes o corrige la ortografía en el Excel.</span>
        </div>` : ''}
        ${noMatchHotel.size ? `<div style="padding:10px 12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;margin-bottom:10px;font-size:12.5px;color:#78350F;">
          <b>⚠️ Hoteles no encontrados (${noMatchHotel.size}):</b> ${[...noMatchHotel].join(', ')}
          <br><span style="font-size:11.5px;">Créalos en Hoteles antes o corrige el nombre en el Excel.</span>
        </div>` : ''}

        <div style="max-height:280px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="background:#F8FAFC;position:sticky;top:0;">
              <tr>
                <th style="padding:6px 8px;text-align:left;">Fecha</th>
                <th style="padding:6px 8px;text-align:left;">Socorrista</th>
                <th style="padding:6px 8px;text-align:left;">Hotel</th>
                <th style="padding:6px 8px;text-align:left;">Horario</th>
                <th style="padding:6px 8px;text-align:left;">✓</th>
              </tr>
            </thead>
            <tbody>
              ${resolved.slice(0, 200).map(r => `
                <tr style="border-top:1px solid #F1F5F9;background:${r.ok ? '#fff' : '#FEF2F2'};">
                  <td style="padding:5px 8px;font-family:monospace;font-size:11.5px;">${r.fecha.toISOString().slice(0,10)}</td>
                  <td style="padding:5px 8px;">${r.emp ? r.emp.nombre : `<span style="color:#DC2626;">${r.socorristaRaw}</span>`}</td>
                  <td style="padding:5px 8px;">${r.hotel ? r.hotel.nombre : `<span style="color:#DC2626;">${r.hotelRaw}</span>`}</td>
                  <td style="padding:5px 8px;font-family:monospace;font-size:11.5px;">${r.hi}-${r.hf}${r.es_partido ? ` / ${r.hi2}-${r.hf2}` : ''}</td>
                  <td style="padding:5px 8px;">${r.ok ? '✅' : '❌'}</td>
                </tr>
              `).join('')}
              ${resolved.length > 200 ? `<tr><td colspan="5" style="padding:8px;text-align:center;color:#64748B;">… ${resolved.length - 200} filas más (se aplicarán todas las OK)</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      `;
      const btnAplicar = document.getElementById('btnAplicarCuadrante');
      if (okCount > 0) {
        btnAplicar.disabled = false;
        btnAplicar.style.opacity = '1';
        btnAplicar.style.cursor = 'pointer';
        btnAplicar.textContent = `Aplicar ${okCount} horarios`;
      }
    } catch (err) {
      prev.innerHTML = `<div style="padding:20px;background:#FEE2E2;color:#7F1D1D;border-radius:10px;">Error: ${err.message}</div>`;
    }
  }

  async function aplicarHorarios() {
    if (!ultimaData) return;
    const okItems = ultimaData.asignaciones.filter(x => x.ok);
    if (!okItems.length) return;

    if (!confirm(`¿Aplicar ${okItems.length} asignaciones?\n\n` +
      `Se archivarán los horarios activos anteriores del mismo socorrista+hotel dentro de las fechas del cuadrante, ` +
      `y se crearán los nuevos con las fechas exactas.\n\nEsta acción no borra fichajes ni datos históricos.`)) return;

    const btn = document.getElementById('btnAplicarCuadrante');
    btn.disabled = true; btn.textContent = 'Aplicando…';
    const prev = document.getElementById('cuadrantePreview');

    // 1) Agrupar por (empleado_id, puesto_id, hi, hf, hi2, hf2, semana-lunes)
    // Cada grupo genera 1 horario con dias="lun,mar,..." y fecha_desde/hasta = lunes/domingo de esa semana
    const grupos = {};
    okItems.forEach(x => {
      // Todas las fechas son UTC. Semana lunes = retroceder hasta el lunes.
      const f = new Date(x.fecha);
      const jsDay = f.getUTCDay();
      const offset = jsDay === 0 ? 6 : jsDay - 1; // dom=0→6, lun=1→0, mar=2→1…
      const lunes = new Date(f.getTime() - offset * 86400000);
      const domingo = new Date(lunes.getTime() + 6 * 86400000);
      const isoDesde = lunes.toISOString().slice(0,10);
      const isoHasta = domingo.toISOString().slice(0,10);
      const key = [x.emp.id, x.hotel.id, x.hi, x.hf, x.hi2 || '', x.hf2 || '', isoDesde].join('|');
      if (!grupos[key]) {
        grupos[key] = { emp: x.emp, hotel: x.hotel, hi: x.hi, hf: x.hf, hi2: x.hi2, hf2: x.hf2, es_partido: x.es_partido,
                        fecha_desde: isoDesde,
                        fecha_hasta: isoHasta,
                        dias: new Set() };
      }
      const NOMBRES = ['dom','lun','mar','mie','jue','vie','sab'];
      grupos[key].dias.add(NOMBRES[f.getUTCDay()]);
    });

    const horariosCrear = Object.values(grupos).map(g => {
      // Orden natural lun,mar,mie,jue,vie,sab,dom
      const ORDEN = ['lun','mar','mie','jue','vie','sab','dom'];
      const diasOrd = ORDEN.filter(d => g.dias.has(d)).join(',');
      return {
        empleado_id: g.emp.id,
        puesto_id: g.hotel.id,
        hora_inicio: g.hi,
        hora_fin: g.hf,
        es_partido: g.es_partido || false,
        hora_inicio_2: g.hi2 || null,
        hora_fin_2: g.hf2 || null,
        dias: diasOrd,
        fecha_desde: g.fecha_desde,
        fecha_hasta: g.fecha_hasta,
        duracion: 8,
        activo: true
      };
    });

    let creados = 0, archivados = 0, errores = [];
    // 2) Por cada grupo: archivar horarios activos previos del mismo empleado+hotel que solapen esta semana.
    //
    // Regla de solape: un horario existente solapa la semana nueva si
    //   (fecha_desde IS NULL OR fecha_desde <= nueva.fecha_hasta)
    //   AND (fecha_hasta IS NULL OR fecha_hasta >= nueva.fecha_desde)
    //
    // Los dos .or() encadenados de supabase-js se combinan con AND entre
    // grupos, así que la expresión final cubre TODO — incluidos los
    // horarios "permanentes" sin fechas (que antes NO se archivaban y
    // provocaban duplicados: permanente activo + nuevo semanal activo).
    for (const h of horariosCrear) {
      try {
        const { error: eArc } = await window.sb.from('horarios').update({ activo: false })
          .eq('empleado_id', h.empleado_id)
          .eq('puesto_id', h.puesto_id)
          .eq('activo', true)
          .or(`fecha_desde.is.null,fecha_desde.lte.${h.fecha_hasta}`)
          .or(`fecha_hasta.is.null,fecha_hasta.gte.${h.fecha_desde}`);
        if (!eArc) archivados++;
        // Insertar el nuevo (con fallback si no existen columnas partido)
        const { error } = await window.sb.from('horarios').insert(h);
        if (error) {
          if (/es_partido|hora_inicio_2|hora_fin_2|fecha_desde|fecha_hasta/i.test(error.message)) {
            const { es_partido, hora_inicio_2, hora_fin_2, fecha_desde, fecha_hasta, ...simple } = h;
            const { error: e2 } = await window.sb.from('horarios').insert(simple);
            if (e2) throw e2;
          } else throw error;
        }
        creados++;
      } catch (e) {
        errores.push(`${h.empleado_id.slice(0,8)}…: ${e.message}`);
      }
    }

    prev.innerHTML = `<div style="padding:16px;background:#DCFCE7;border:1px solid #059669;border-radius:10px;color:#065F46;">
      <div style="font-size:15px;font-weight:800;">✅ Cuadrante aplicado</div>
      <div style="margin-top:8px;font-size:13px;">
        <b>${creados}</b> horarios creados · <b>${archivados}</b> semanas de horarios previos archivadas
        ${errores.length ? `<br><span style="color:#7F1D1D;">⚠️ ${errores.length} errores (revisar consola)</span>` : ''}
      </div>
      <div style="margin-top:10px;font-size:12px;color:#065F46;">
        Los socorristas verán su nuevo horario al abrir la app (o refrescar). El panel del admin/coord ya detecta los turnos para calcular puntualidad, ausencias y firmar horas.
      </div>
    </div>`;
    if (errores.length) console.warn('[cuadrante] errores:', errores);
    btn.textContent = '✓ Aplicado';
  }

  window.PSCuadrante = {
    openModal: abrirModal,
    _close: () => { if (modalEl) modalEl.remove(); modalEl = null; ultimaData = null; },
    _aplicar: aplicarHorarios,
    // Exportar helpers para tests / debug
    _parse: parseCuadranteWorkbook,
    _matchEmp: matchEmpleado,
    _matchHotel: matchHotel
  };
})();
