/* PoolSafety · Cálculo ÚNICO de jornada laboral
   ==========================================================================
   Este módulo es la ÚNICA fuente de verdad para convertir fichajes en horas.
   Lo usan, con los mismos datos de entrada:

     · El modal de firma del socorrista  (js/socorrista.js)
     · La hoja mensual oficial de inspección (js/ps-pdf.js)
     · La hoja de cálculo de nómina del admin (js/coordinador.js)

   Antes cada uno hacía su propia cuenta y NO coincidían: el socorrista firmaba
   con tope de 40 h/semana y la hoja de inspección repartía con tope de 8 h/día.
   Con 6 días de 7 h el trabajador firmaba 40 h y el documento que lee la
   inspección decía 42 h ordinarias. Dos papeles firmados que se contradicen.

   REGLA ÚNICA (la que pidió el cliente):
     - Se suman las horas REALES de cada semana natural (lunes a domingo).
     - Hasta 40 h son ordinarias. Lo que pase de ahí es complementario.
     - Una semana incompleta (alta a mitad de semana, o corte de mes) se trata
       igual: se suman sus horas reales con el mismo tope de 40.
     - En la tabla día a día el tope se reparte en orden cronológico dentro de
       cada semana, de forma que la suma de los días cuadra con la semana.
   ========================================================================== */
(function () {
  'use strict';

  var TOPE_SEMANAL = 40;

  function dosDig(n) { return String(n).padStart(2, '0'); }

  // Clave estable de día natural: 'YYYY-MM-DD' en hora local (NO ISO/UTC, que
  // desplazaría los turnos de noche al día siguiente).
  function claveDia(d) {
    return d.getFullYear() + '-' + dosDig(d.getMonth() + 1) + '-' + dosDig(d.getDate());
  }

  // Lunes 00:00 de la semana a la que pertenece la fecha.
  function lunesDe(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dia = (x.getDay() + 6) % 7;   // 0=lunes … 6=domingo
    x.setDate(x.getDate() - dia);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function ddmm(d) { return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1); }

  // Redondeo a 1 decimal. Se aplica SIEMPRE en el mismo sitio para que las tres
  // hojas impriman exactamente la misma cifra y no aparezcan descuadres de
  // décimas entre un documento y otro.
  function r1(h) { return Math.round(h * 10) / 10; }

  // Formato humano: 40 → "40", 40.5 → "40,5"
  function fmtH(h) {
    var v = r1(h || 0);
    return (Math.abs(v % 1) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ','));
  }

  /* ------------------------------------------------------------------
     Empareja cada entrada con SU salida.
     Devuelve además los `incompletos`: entradas que se quedaron sin salida
     (el socorrista se olvidó de fichar). Antes estas entradas se perdían en
     silencio — una entrada nueva pisaba la anterior — y el día desaparecía
     de la hoja de inspección como si no se hubiera trabajado.
     ------------------------------------------------------------------ */
  function emparejarTramos(fichajes) {
    var ordenados = (fichajes || []).slice()
      .sort(function (a, b) { return new Date(a.hora) - new Date(b.hora); });
    var tramos = [], incompletos = [], duplicados = [], abierta = null;
    ordenados.forEach(function (f) {
      var d = new Date(f.hora);
      if (f.tipo === 'entrada') {
        if (abierta) {
          // Dos entradas seguidas sin salida entre medias. Hay que distinguir
          // dos cosas que NO son lo mismo:
          //
          //  a) DOBLE ENTRADA el mismo día: el socorrista pulsó dos veces (a
          //     veces con 2 minutos de diferencia, a veces porque creyó que no
          //     se había registrado). El turno empezó en la PRIMERA. Antes se
          //     conservaba la segunda y se tiraba la primera, así que se le
          //     quitaban horas trabajadas: a Victoria el 11/8 le contaba 6,9 h
          //     en vez de 8,1 h, y encima el día salía como "sin fichar salida".
          //
          //  b) DÍA ANTERIOR SIN CERRAR: se fue sin fichar salida y la siguiente
          //     entrada es ya de otro día. Ahí sí falta el dato y hay que avisar.
          var mismaJornada = claveDia(abierta) === claveDia(d) &&
                             (d - abierta) < 12 * 3600000;
          if (mismaJornada) {
            duplicados.push({ entrada: d, conservada: abierta });   // se descarta
          } else {
            incompletos.push({ entrada: abierta });
            abierta = d;
          }
        } else {
          abierta = d;
        }
      } else if (f.tipo === 'salida') {
        if (abierta) {
          tramos.push({ entrada: abierta, salida: d });
          abierta = null;
        }
        // Salida sin entrada previa: se ignora (no se puede medir).
      }
    });
    if (abierta) incompletos.push({ entrada: abierta });
    return { tramos: tramos, incompletos: incompletos, duplicados: duplicados };
  }

  /* ------------------------------------------------------------------
     Cálculo completo.
       fichajes : [{ tipo:'entrada'|'salida', hora: ISO }]
       opts.hasta : ISO opcional. Corta el cálculo en esa fecha (se usa cuando
                    el coordinador pide la firma a mitad de mes, para que la
                    hoja de inspección refleje lo mismo que se firmó).
     Devuelve { porDia, semanas, horasReales, horasFirmadas, horasComplementarias,
                diasTrabajados, incompletos }
     ------------------------------------------------------------------ */
  function calcular(fichajes, opts) {
    opts = opts || {};
    var corte = opts.hasta ? new Date(opts.hasta) : null;

    var lista = (fichajes || []).filter(function (f) {
      return !corte || new Date(f.hora) < corte;
    });

    var par = emparejarTramos(lista);

    // 1) Agrupar tramos por DÍA DE LA ENTRADA (un turno de noche que cruza
    //    medianoche cuenta entero en el día en que empezó).
    var porDia = {};
    function slot(d) {
      var k = claveDia(d);
      if (!porDia[k]) {
        porDia[k] = {
          fecha: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          tramos: [], horas: 0, ordinarias: 0, complementarias: 0,
          incompleto: false, duplicado: false
        };
      }
      return porDia[k];
    }
    par.tramos.forEach(function (t) {
      var s = slot(t.entrada);
      s.tramos.push({ entrada: t.entrada, salida: t.salida });
      s.horas += Math.max(0, (t.salida - t.entrada) / 3600000);
    });
    // Los días con entrada sin salida quedan MARCADOS y visibles (0 h, pero el
    // día existe y se puede avisar), en vez de desaparecer.
    par.incompletos.forEach(function (t) {
      var s = slot(t.entrada);
      s.tramos.push({ entrada: t.entrada, salida: null });
      s.incompleto = true;
    });
    // Marca informativa para el admin: ese día hubo un fichaje de entrada
    // repetido que se ha descartado. No es un error de datos ni resta horas,
    // así que NO se saca en la hoja de inspección.
    par.duplicados.forEach(function (t) {
      var s = slot(t.conservada);
      s.duplicado = true;
    });
    // Los tramos se pintan en orden de reloj (los incompletos se añaden al
    // final del array y podían salir desordenados: "11:11 / 09:57").
    Object.keys(porDia).forEach(function (k) {
      porDia[k].tramos.sort(function (a, b) { return a.entrada - b.entrada; });
    });

    // 2) Agrupar días en semanas naturales y aplicar el tope de 40 h.
    var mapSem = {};
    Object.keys(porDia).forEach(function (k) {
      var lun = lunesDe(porDia[k].fecha);
      var kl = claveDia(lun);
      if (!mapSem[kl]) mapSem[kl] = { lunes: lun, claves: [] };
      mapSem[kl].claves.push(k);
    });

    var semanas = Object.keys(mapSem).sort().map(function (kl) {
      var sem = mapSem[kl];
      var claves = sem.claves.sort();       // orden cronológico dentro de la semana
      var reales = 0;
      claves.forEach(function (k) { reales += porDia[k].horas; });

      // Reparto del tope día a día, en orden: lo que cabe por debajo de las
      // 40 h acumuladas es ordinario; lo que pasa, complementario. Así la suma
      // de la columna de días cuadra exactamente con el total de la semana.
      var acum = 0;
      claves.forEach(function (k) {
        var d = porDia[k];
        var margen = Math.max(0, TOPE_SEMANAL - acum);
        d.ordinarias = r1(Math.min(d.horas, margen));
        d.complementarias = r1(Math.max(0, d.horas - d.ordinarias));
        d.horas = r1(d.horas);
        acum += d.horas;
      });

      var dom = new Date(sem.lunes); dom.setDate(dom.getDate() + 6);
      var diasConHoras = claves.filter(function (k) { return porDia[k].horas > 0; });
      return {
        lunes: claveDia(sem.lunes),
        domingo: claveDia(dom),
        rangoTxt: ddmm(sem.lunes) + '–' + ddmm(dom),
        dias: diasConHoras.length,
        horas_reales: r1(reales),
        horas_firmadas: r1(Math.min(TOPE_SEMANAL, reales)),
        horas_complementarias: r1(Math.max(0, reales - TOPE_SEMANAL)),
        // Días de esta semana con entrada sin salida (para avisar en el modal)
        incompletos: claves.filter(function (k) { return porDia[k].incompleto; })
      };
    });

    var horasReales = 0, horasFirmadas = 0, horasCompl = 0, dias = 0;
    semanas.forEach(function (s) {
      horasReales += s.horas_reales;
      horasFirmadas += s.horas_firmadas;
      horasCompl += s.horas_complementarias;
      dias += s.dias;
    });

    return {
      porDia: porDia,
      semanas: semanas,
      horasReales: r1(horasReales),
      horasFirmadas: r1(horasFirmadas),
      horasComplementarias: r1(horasCompl),
      diasTrabajados: dias,
      incompletos: par.incompletos,
      duplicados: par.duplicados
    };
  }

  /* Compatibilidad con la firma antigua usada en socorrista.js.
     El año y el mes ya no hacen falta (las semanas salen de los propios
     fichajes) pero se aceptan para no romper llamadas existentes. */
  function calcularSemanasMes(fichajes, anio, mesIdx, opts) {
    return calcular(fichajes, opts);
  }

  window.PSJornada = {
    TOPE_SEMANAL: TOPE_SEMANAL,
    calcular: calcular,
    calcularSemanasMes: calcularSemanasMes,
    emparejarTramos: emparejarTramos,
    claveDia: claveDia,
    lunesDe: lunesDe,
    fmtH: fmtH,
    r1: r1
  };
})();
