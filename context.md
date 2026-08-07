# PoolSafety App · Context

> **📌 IMPORTANTE PARA CLAUDE:** Fuente única de verdad del proyecto.
> Al terminar cambios significativos, **ACTUALIZA este archivo en el mismo commit**.
> Es lo primero que lees al retomar el proyecto en una nueva sesión.

Última actualización: 2026-08-07 (v108 · sesión 6ª · hotfix salida sin GPS + radio 100m + visitas entrada/salida + tarde real + 2ª firma incidencia)
**Cache SW actual: `poolsafety-v108`**

## ⚡ SQL PENDIENTES DE EJECUTAR EN SUPABASE (por orden)
Estado a fecha 2026-08-07. Todos son idempotentes (`create if not exists` / `if not exists`).
Ejecutar con **Role postgres** en el SQL Editor de Supabase.

- ✅ `sql/06-incidencias.sql` — tabla incidencias + trigger nº parte + RLS + Realtime
- ✅ `sql/07-fix-ultimo-login.sql` — arregla el bug "Sin entrar" en el panel
- ✅ `sql/08-limpiar-desa.sql` — DESA solo 4 items reales
- ✅ `sql/09-limpiar-oxigenoterapia.sql` — limpieza oxigenoterapia
- ✅ `sql/11-empleados-para-coord.sql` — ficha empleado para coord/dueño
- ✅ `sql/12-cambiar-email-admin.sql` — RPC admin_cambiar_email()
- ✅ `sql/13-accuracy-fichajes.sql` — columna accuracy_m en fichajes
- ✅ `sql/14-unidades-material.sql` — múltiples botiquines por hotel (ejecutado 2026-08-07)
- ✅ `sql/15-ajuste-guedel-pediatrica.sql` — Guedel pediátrica mín 1 (ejecutado 2026-08-07)
- ⏳ `sql/10-asignaciones-temporales.sql` — cobertura del día (feature en curso, no urge)
- ⏳ `sql/16-ampliar-radio-gps.sql` — sube gps_radio_m a 100m en todos los hoteles activos EXCEPTO los que están exactamente a 30m. Reduce muchos falsos "fuera de zona". Si Hotel Ankaa (Artá) o Carrossa siguen dando problemas, subir esos a 150m con update manual.
- ⏳ `sql/17-visitas-entrada-salida.sql` — añade `fecha_hora_salida`, `gps_lat_salida`, `gps_lng_salida` a `visitas_hoteles` + índice. Sin él el botón "Registrar salida del hotel" da error.
- ⏳ `sql/18-incidencia-firma-testigo.sql` — añade 6 columnas a `incidencias` para segunda firma (tipo, nombre, dni, relacion, imagen, motivo_ausencia). Sin él el paso 6 del wizard funciona pero la segunda firma se descarta silenciosamente (fallback con warning en consola).

## 🚨 Bugs conocidos abiertos (no bloquean pero atender)
- **Fichajes históricos con puesto_id null** de correturnos: si aparecen más, usar SQL de rescate por GPS (docs abajo).
- **Hotel de Artá con GPS impreciso**: puede necesitar radio 150m manual o corregir coords GPS del pin del hotel desde admin.

---

## 1. Qué es esto

App operativa web (PWA) para **Pool Safety Des Llevant, S.L.** — empresa de socorrismo en Mallorca con ~150 socorristas y ~80 puestos en hoteles y piscinas de las Baleares.

Sustituye WhatsApp + Excel + papel para: fichaje con GPS, coordinación en vivo, botiquines/DESA según normativa balear, firma digital de documentación laboral, gestión de horarios y titulaciones (SVB, DEA, socorrismo, PRL, DNI), reportar faltas de material.

**Estado:** piloto activo con usuarios reales (~10 socorristas creados + 2 coordinadores + admin). En pruebas antes de rollout completo a 150 socorristas.

---

## 2. Datos del cliente

| Campo | Valor |
|---|---|
| Razón social | Pool Safety Des Llevant, S.L. |
| CIF | B75828418 |
| CCC | 07132352204 (Seguridad Social) |
| Domicilio | C/ Hernán Cortés, 8, 2º Dcha., 07670 Portocolom, Baleares |
| Email corporativo | info@poolsafety.es |
| Dominio | poolsafety.es (registrado en IONOS) |
| Interlocutor | Adam (dirección) |
| Coordinadores | Alex (RRHH) `ale23fbt@gmail.com` + Óscar (Laboral) |

---

## 3. Stack + hosting + cuentas

| Servicio | URL/Cuenta | Notas |
|---|---|---|
| **Código** | github.com/poolsafety-mallorca/poolsafety-app | Org del cliente. Repo público (RGPD OK — sin secrets) |
| **Hosting** | poolsafety-app.netlify.app | **Netlify Pro** (upgrade 2026-07-28). Deploys ilimitados. Auto al push main. |
| **BD + Auth** | msdjsbegqpjpshnxoilh.supabase.co | Supabase Free. Región EU-West-1 (Ireland) |
| **Emails** | Resend + Supabase SMTP | Sender `info@poolsafety.es`. Delivered OK. Templates HTML branded pegados en Supabase → Auth → Email Templates. |
| **PWA** | manifest.webmanifest + sw.js | Instalable Android + iOS + Desktop. Auto-update activo (network-first). |

### Cuenta Supabase
- Proyecto: `poolsafety-app-prod`
- URL: `https://msdjsbegqpjpshnxoilh.supabase.co`
- Anon key (safe, embedida en JS): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI`
- Passwords y service_role_key: solo cliente.

### Supabase Auth · URL Configuration crítica
- **Site URL**: `https://poolsafety-app.netlify.app` (NO localhost)
- **Redirect URLs**: `https://poolsafety-app.netlify.app/**` y `https://poolsafety-app.netlify.app/reset.html`
- **Confirm email**: **OFF** (crítico — si se activa manda emails fantasma al crear cuentas)

---

## 4. Stack técnico

- **Frontend:** Vanilla HTML/CSS/JS. Sin build step, sin framework.
- **Supabase JS SDK v2** via CDN.
- **jsPDF 2.5.1** via CDN → PDFs firmados y descargas.
- **SheetJS** via CDN → parse Excel horarios.
- Cero deps npm. No hay `package.json`.
- **SW strategy**: network-first para app propia, bypass total para Supabase/CDNs. `updateViaCache: 'none'`. Cambios se aplican al primer refresh.

---

## 5. Estructura de archivos

```
app poolsafety/
├── index.html                    # Login + modal reset password
├── socorrista.html               # Vista móvil (Inicio, Tareas, Botiquín, Docs, Perfil)
├── coordinador.html              # Dashboard admin+coord (8 secciones)
├── reset.html                    # Formulario nueva contraseña (link de email)
├── manifest.webmanifest          # PWA
├── sw.js                         # Service Worker (incrementar CACHE al añadir js)
├── _headers                      # Netlify: MIME types + SW-Allowed
├── assets/logo-blanco.png        # Logo blanco sobre fondo rojo
├── css/styles.css                # Todo el CSS (theme rojo permanente)
├── js/
│   ├── supabase-client.js        # Cliente + helpers PSDB
│   ├── auth-guard.js             # Protección + redirección rol + auto-reparación cuenta huérfana + tracking ultimo_login
│   ├── theme-toggle.js           # Aplica theme-red por defecto
│   ├── pwa-install.js            # Registro SW + auto-update banner + prompt instalación
│   ├── icons.js                  # SVG symbols (Lucide-style)
│   ├── data.js                   # kitAltaSubdocs (con texto legal COMPLETO) + EMPRESA + mocks residuales (que ya casi no se usan)
│   ├── titulaciones.js           # Módulo PSTit compartido
│   ├── ps-storage.js             # Wrapper Supabase Storage
│   ├── ps-pdf.js                 # PDFs: generarKitAlta (texto legal + EPIs), generarJornadaResumen, generarJornadaOficial (Word inspección 31 días)
│   ├── ps-horarios.js            # Módulo PSHor: horarios editables por hotel/socorrista con turnos partidos (hora_fin + es_partido + hora_inicio_2/hora_fin_2)
│   ├── socorrista.js             # Lógica vista socorrista (BD real, cero mocks visibles)
│   └── coordinador.js            # Lógica dashboard coord/admin
├── sql/
│   ├── 01-schema.sql             # Tablas + ALTER TABLE ADD COLUMN IF NOT EXISTS al final para migraciones
│   ├── 02-rls.sql                # Row Level Security por rol (incluye usuarios_delete crítico)
│   ├── 03-seed.sql               # Empresa + hoteles + inventario normativo
│   └── README.md
├── email-templates/              # HTML branded para pegar en Supabase Auth
│   ├── reset-password.html
│   ├── confirm-signup.html
│   └── invite-user.html
├── docs-clientes/                # PDFs bienvenida Admin/Coord/Socorrista
├── local-tools/server.js         # Server local :8080 para probar en móvil misma WiFi
└── context.md                    # ESTE ARCHIVO
```

---

## 6. Base de datos

### Tablas y columnas clave

| Tabla | Columnas notables (añadidas hoy en cursiva) |
|---|---|
| `empresas` | id, nombre |
| `usuarios` | id, empresa_id, rol (dueno/coordinador/socorrista), email, nombre, *telefono*, *activo*, *disponible* (toggle Libre coord), *ultimo_login* |
| `puestos` | id, empresa_id, nombre, zona, direccion, hora_inicio_default, *hora_fin_default*, *servicios_necesarios*, *notas*, gps_lat/lng/radio_m, contacto_hotel_nombre/tel, *tiene_botiquin*, *tiene_desa*, *tiene_oxigeno*, activo, *grupo_hotel* |
| `empleados` | id, usuario_id UNIQUE, empresa_id, nombre, dni, email, telefono, dirección, numero_ss, fecha_alta, fecha_baja, tipo_contrato, estado, foto_url, puesto_id, *es_correturnos*. Estados: activo, baja, alta-pendiente, finiquito-pendiente, finiquitado, eliminado |
| `horarios` | id, empleado_id, puesto_id, hora_inicio, *hora_fin*, duracion, *es_partido*, *hora_inicio_2*, *hora_fin_2*, dias, fecha_desde/hasta, activo |
| `fichajes` | id, empleado_id, puesto_id, tipo (entrada/salida), hora, gps_lat/lng, gps_ok, fuera_de_zona, distancia_m |
| `firmas_documentos` | id, empleado_id, documento_codigo, firma_nombre, dni, dispositivo, aceptados_json, campos_json, *firma_imagen (base64 PNG)*, *ubicacion_lat/lng*, archivo_pdf_url, fecha_firma. `campos_json` guarda para jornadas: horas_firmadas + horas_reales + dias_trabajados; para kit-alta: aceptados por subdoc + epis: {id: unidades} |
| `documentos_subidos` | id, empleado_id, subido_por, tipo, nombre_archivo, url_storage, pendiente_firma, firmado_el |
| `inventario_items` | Catálogo maestro 41 items normativa Baleares (Decreto 53/1995 + 137/2008) |
| `inventario_puesto` | Stock por hotel. Poblado 2026-07-29 con SQL cross join (23 hoteles × 41 items = 943 filas) |
| `alertas` | Auto stock-bajo + manuales socorrista + mensajes al coordinador (tipo='otro') |
| `tareas` | Del coordinador al socorrista (real). Rellenada al usar "Solicitar firma Kit Alta" también |
| `notas` | Mensajes coordinador → socorrista (con autor_nombre) |
| `titulaciones_empleado` | DNI, SVB, DEA, socorrismo, PRL, contrato, nómina. Max 20 MB por archivo |

### Storage (bucket público `empleados-media`)
- `fotos/{empleado_id}.jpg` — foto perfil
- `firmas/{firma_id}.pdf` — PDFs firmados
- `titulaciones/{empleado_id}/...` — DNIs, certificados
- `docs-socorrista/{empleado_id}/...` — docs subidos por el propio socorrista
- `docs-coordinador/{userId}/...` — docs subidos por admin/coord desde su perfil

### RLS (Row Level Security)
Funciones helper: `auth_rol()`, `auth_empresa()`, `auth_es_admin()`, `auth_empleado_id()`.
Reglas base: admin/coord ven todo de su empresa · socorrista solo su propio empleado_id.
**Crítico**: `usuarios_delete` (añadida 2026-07-29) — sin esta política los DELETE en usuarios devuelven 0 filas silenciosamente.

---

## 7. Usuarios reales del piloto

| Email | Rol | Nombre | Notas |
|---|---|---|---|
| `info@poolsafety.es` | dueno | Adam | Único que puede baja/finiquito/eliminar total |
| `ale23fbt@gmail.com` | coordinador | Alex | Real |
| (email de Óscar) | coordinador | Óscar | Pendiente crear con email real |
| `carlosbiosca24@gmail.com` | socorrista | Carlos Biosca | Developer (Origen). Puesto: Petra - Piscina Municipal |
| Otros ~10 socorristas | socorrista | Ezequiel, Cristian, Ariadna, Chr Sarabia, Jaime Parejo, Kirbi, Álvaro Bejarano, Alba Gil, Yahia, Adán Ros, otros | Creados 2026-07-28/29 |

Cuentas de PRUEBA de coordinación pendientes borrar: `Rrhh@poolsafety.es`, `Laboral@poolsafety.es` (usar SQL `usuarios_delete` + Dashboard Auth).

Contraseñas: solo las conoce el usuario. Nunca en repo ni docs.

---

## 8. Hoteles reales (23 activos)

Palma Aquarium, Sa Rapita (Club Nautic), Ona Luna Park, Cala Romani, Hotel Ankaa, Arcos Playa, Petra - Piscina Municipal, HM Mar Blau, Portomar Apartments, Carrossa Hotel & Spa, Inturotel (Cala Esmeralda, Esmeralda Park, Sa Marina, Drago Land, Cala Azul, Esmeralda Garden), Gavimar (La Mirada, Ariel Chico, Cala Gran), Hotel Monsuau, y +2 nuevos.

---

## 9. Features completadas · TODAS reales, sin mocks

### Sesión 2026-07-28 (maratón inicial, ~25 commits)
Ver commits: SMTP Resend, auto-update PWA, PSHor horarios editables, Correturnos, Miembros del equipo, Toggle Disponible/Libre coord, Enviar email invitación, Creación masiva, Autoreparación cuentas huérfanas, Contactar coordinador real, Badge Documentación real, GPS "Cómo llegar" real, Puestos en vivo con Realtime, Estado del equipo admin, Campana con alertas reales, Kit Alta texto legal completo, PDF Kit Alta, PDF Jornada oficial (formato Word inspección), 3 acciones ficha empleado (baja/finiquito/eliminar), Reenviar Kit Alta, Subir docs socorrista, Máx 20 MB, tracking ultimo_login.

### Sesión 2026-07-29 (segunda jornada, muchos fixes de flujos reales)
- ✅ **Botiquín socorrista lee de BD real** (no mock). Items del inventario_puesto del hotel asignado. Checkbox revisado → UPDATE en BD.
- ✅ **Poblado inventario completo**: 23 hoteles × 41 items = 943 filas en inventario_puesto (Decreto 53/1995).
- ✅ **Reportar falta material real**: modal abre siempre + INSERT en alertas con tipo='manual', origen='socorrista', criticidad calculada por cantidad.
- ✅ **Mensaje socorrista → coordinador**: nuevo botón "Enviar mensaje al coordinador" en la lista contactar coord. Guarda en alertas tipo='otro' con prefijo `[Mensaje de X]`.
- ✅ **Asignar tarea o nota (admin/coord)**: modal reescrito para INSERT real en `tareas` o `notas` según tipo. Antes solo hacía toast.
- ✅ **Panel Documentación admin lee BD real**: lista empleados con estado kit-alta y jornada del mes desde firmas_documentos. Botón "Firmar en tablet" y "Ver ficha".
- ✅ **Firmar Kit Alta en tablet (admin + coord)**: modal `tabletKitModal` con los 7 subdocs desplegables (texto legal completo scrollable), input nombre+DNI, canvas firma. INSERT en firmas_documentos con dispositivo='tablet coordinador · X'.
- ✅ **Enviar/reenviar Kit Alta EN LA APP** (no email): archiva firma anterior + INSERT tarea en `tareas` con título "Firmar Kit Alta pendiente" → aparece en Tareas socorrista + campana.
- ✅ **Wizard Kit Alta obligatorio lee BD real** (no mock). Al entrar el socorrista, si no hay firma en `firmas_documentos` con documento_codigo='kit-alta', abre wizard bloqueante.
- ✅ **Empleado descarga su Kit Alta firmado**: botón "Descargar PDF firmado" en su vista Docs.
- ✅ **Turnos partidos + minutos exactos** (PSHor): checkbox "Turno partido" en editor. Se muestra "10:00-14:30 · 16:00-20:30". Ya no pierde los 30 min por `duracion int`.
- ✅ **Alta empleados**: al crear (individual + masiva) → estado='activo' directamente. Botón "Dar de alta ahora" para los pendientes que quedaron colgados. Función `darDeAltaMasivo()` global.
- ✅ **Finiquito completo**: pantalla exclusiva bloqueante al socorrista con texto legal → firma con canvas → INSERT firmas_documentos + estado='baja' + usuarios.activo=false → pantalla verde de éxito. **Nota clave**: pasa a 'baja' (NO 'finiquitado') para poder reactivar el año siguiente.
- ✅ **Reactivar empleado** desde ficha Acciones → botón "Reactivar" cuando estado='baja'.
- ✅ **3 acciones ficha empleado (admin only)**: Cortar acceso / Iniciar finiquito / Eliminar permanente. Doble confirmación (tecleo del nombre + palabra ELIMINAR).
- ✅ **Miembros del equipo**: eliminar coord permanentemente con doble confirmación (requiere política `usuarios_delete` en RLS — SQL en context).
- ✅ **Perfil admin/coord editable**: modal desde chip usuario. Edita nombre + teléfono. Sube docs propios (DNI, título) con cámara del móvil.
- ✅ **Cabecera Panel Operativo con stats reales**: `X puestos activos · Y socorristas · Z coordinadores` desde BD, refresh cada 2 min.
- ✅ **Horas del mes real**: calcula desde fichajes reales (pares entrada+salida), cap 8h/día ordinarias, resto extras. Botón descargar informe CSV.
- ✅ **Exportar parte diario**: CSV UTF-8 con separador ; (para Excel español). Por hotel: socorrista, DNI, hora entrada, GPS, hora salida, alertas. Detalle alertas al final.
- ✅ **Panel Estado del equipo**: quién ha entrado app, quién firmó Kit Alta, fichajes del mes por socorrista.
- ✅ **Cero mocks visibles**: María Fernández, Hotel Bellamar, Jaume Ferrer, KPIs falsos, "3 tareas coord", listados PS.socorristas — TODO eliminado o reemplazado por BD real.

### Sesión 2026-07-30/31 (tercera jornada · piloto arrancando con socorristas reales · v42→v67)

**Fixes críticos descubiertos con socorristas reales:**
- ✅ **BUG BLOQUEANTE `miPuesto is not defined`** en socorrista.js:897 — crasheaba TODO el JS del socorrista → wizard Kit Alta no aparecía y muchos otros flujos rotos. Arreglado.
- ✅ **BUG BLOQUEANTE schema tareas desincronizado**: código usaba `completada` y `fecha_limite`, BD real tiene `hecha` y `fecha`. Todas las queries daban 400. Todo el código actualizado a los nombres reales.
- ✅ **BUG BLOQUEANTE window.PS no se exponía**: `const PS = (function(){})();` en data.js declara PS en scope léxico pero NO en window. Por eso el PDF del Kit Alta salía sin texto legal. Añadido `window.PS = PS;` al final de data.js.
- ✅ **BUG CRÍTICO fichaje mostraba turno del día anterior**: el estado (fichado, horaEntrada, horaSalida) se guardaba en localStorage y no se reseteaba al cambiar de día. Ahora se reconstruye desde fichajes REALES de HOY en BD al arrancar, al recuperar foco y cada 60s.
- ✅ **Wizard Kit Alta bug `nombreLogueado is not defined`**: al pulsar "Firmar ahora" no se abría el modal por error en paso final. Arreglado.
- ✅ **Reenviar Kit Alta desde admin** no llegaba al socorrista (solo archivaba firma). Ahora crea tarea "Firmar Kit Alta pendiente" → Realtime dispara wizard al momento.

**Nuevas features:**
- ✅ **Botón "Fichar por el empleado"** en Ficha > Acciones — para cuando la app del socorrista no responde. Prompt hora + motivo + confirm. INSERT en fichajes con `origen_manual=true`, `registrado_por`, `motivo_manual`.
- ✅ **Editor de fichajes existentes** (bloque amarillo en Ficha > Acciones): botón "Últimos 7 días" / "Mes actual", cada fichaje con hora, tipo, GPS, motivo, botones ✏️editar y ✕borrar. Auditoría con prefijo `[Editado <fecha>]` en motivo_manual.
- ✅ **Botón Llamar directo** en cada tarjeta del panel general (icono teléfono redondo, rojo si fuera de zona / verde si OK). `href="tel:+34..."` — abre app de llamadas nativa. Normaliza teléfonos ES de 9 dígitos.
- ✅ **Marca visible fichaje manual** 📌 junto al nombre + aviso azul en modal detalle con motivo.
- ✅ **Botón "Añadir a todos los hoteles"** en Botiquín (admin/coord) — INSERT masivo evitando duplicados. Toast informa cuántos hoteles se actualizaron.
- ✅ **Solicitar firma registro mensual** desde admin — botón "Mandar horas para firmar ahora" en Ficha > Docs. Calcula horas hasta hoy, crea tarea, socorrista lo ve al momento (Realtime).
- ✅ **Registro mensual REAL por semanas** con cap 40h/sem (antes firmaba 160h siempre). Nueva función `calcularSemanasMes` agrupa fichajes por semana ISO (lunes-domingo). Modal firma + PDF muestran tabla con cada semana: rango dd/mm–dd/mm, días, horas reales, horas firmadas, extras no firmadas.
- ✅ **Informe oficial inspección** con columna día semana (Lu/Ma/…/Do) + festivos amber + finde gris + total "en festivo/domingo". Cálculo festivos: fijos nacionales + Illes Balears (1 marzo, Lunes de Pascua) + Semana Santa con algoritmo de Gauss (funciona cualquier año).
- ✅ **Filtro tareas socorrista**: chips Pendientes / Realizadas / Todas. Por defecto Pendientes. Hechas se tachan con fecha completado.
- ✅ **Campana admin** con badge sobresaliente + panel dropdown de alertas reales (tipo, criticidad con color, puesto, empleado, "hace X min"). Botón Resolver por alerta + "Marcar todas resueltas".
- ✅ **Multi-selección modal reportar falta** — checkbox + cantidad por cada producto, envía UN INSERT por producto.
- ✅ **Stock editable en botiquín socorrista** con − / + / input + botón Guardar + "Marcar todo comprobado" al final.
- ✅ **Métricas mes socorrista REALES** — antes "22/25 laborables" y "98% puntualidad" hardcodeados. Ahora Días trabajados + Horas trabajadas del mes desde fichajes reales.
- ✅ **Notice "Revisar botiquín"** en Inicio socorrista solo aparece si quedan items sin revisar HOY. Muestra progreso "X/Y revisados".
- ✅ **Cabecera Documentación** cuenta pendientes REALES (Kit Alta + tareas jornada), no mocks.
- ✅ **Placeholders neutros en HTML** — antes si el JS tardaba se veía "María Fernández", "Jaume Ferrer", "62/80". Ahora "Cargando…" o "—" honestos.
- ✅ **Realtime en firmas_documentos + tareas del empleado** — wizard Kit Alta aparece al momento cuando admin solicita firma. Polling reducido a 10s como fallback.
- ✅ **Tarjetas de puesto ahora clickables** en panel general — antes tenían `data-post` pero nadie escuchaba clicks.

**Kit Alta reescrito según feedback del despacho legal** (departamento protección datos + laboral):
- ✅ **Nuevo subdoc "Marco laboral aplicable"** (paso 1 del wizard): cita expresa del Convenio colectivo del sector de Vigilancia y Socorrismo de las Illes Balears + categoría profesional (Socorrista acuático) + datos empresa.
- ✅ **Política privacidad reescrita** con bases jurídicas separadas: ejecución contrato (6.1.b) / obligación legal (6.1.c) / interés legítimo (6.1.f) / consentimiento (6.1.a) SOLO para imagen y WhatsApp.
- ✅ **Geolocalización** con bloque "Cómo funciona" (solo al fichar, no rastreo continuo) + uso a efectos disciplinarios con fórmula legal correcta.
- ✅ **Documentación electrónica** — quitada la afirmación amplia "todo envío = recepción fehaciente". Ahora distingue sensibles (nómina/sanciones → acuse o vías reforzadas) vs ordinarios.
- ✅ **Vigilancia salud** reescrita: VOLUNTARIEDAD como regla general, excepciones tasadas. Radio SÍ/NO obligatorio elegir (wizardNext bloquea si no eligió). Decisión aparece destacada en PDF.
- ✅ **Desconexión digital** presentado como acuse de recibo (no sustituye política interna completa).
- ✅ **EPIs vs uniforme separados** en 2 tablas distintas (RD 773/1997 vs convenio) tanto en wizard como en PDF.

**Kit Alta PDF:**
- ✅ **Firma reducida al pie de CADA hoja** (obligación legal — cada hoja rubricada). Se omite la última porque ya lleva la firma grande. `checkPage` reserva 55mm de margen inferior.
- ✅ **Fallback robusto** si `window.PS.kitAltaSubdocs` no carga — reintenta hasta 2s + alert claro con instrucción Ctrl+Shift+R.
- ✅ **Orden scripts** reorganizado: data.js antes de ps-pdf.js en socorrista.html y coordinador.html.

**Otras mejoras:**
- ✅ **22 productos reales cargados** en el botiquín de todos los hoteles vía SQL (Agua oxigenada, Alcohol 70º, Clorhexidina, Povidona, Steri-Strip, Diclofenaco, Tensoplast, Maletín, etc.). Se pobló con INSERT masivo idempotente.
- ✅ **Botón "Horas del mes"** en Acciones rápidas admin — antes hacía scrollTo a sección oculta; ahora click en tab horas.
- ✅ **Nombre y DNI autorellenados** en modales de firma (antes eran placeholders gris confundían).

---

## 10. Pendientes / próximos pasos

### Para verificar en próxima jornada
- ⏳ Firmas Kit Alta según nuevo formato legal + 8 pasos.
- ⏳ Editor de fichajes: probar editar/borrar y ver que auditoría queda en motivo_manual.
- ⏳ Botón Llamar en móvil real (Android/iOS) → debe abrir dialer directo.
- ⏳ Piloto con 4 socorristas: Luis Cantón, Alejandro Hidalgo (=Sergio Hidalgo Capote en BD), Iván Carrillo Valdibia (con B), Manuel Pérez Guerrero — todos activos, esperando envío email de acceso individual.

---

### Sesión 2026-08-02/03 · cuarta jornada · v68→v77 · AUDITORÍA + arranque real

**AUDITORÍA de seguridad y funcionalidad (`sql/04-auditoria-fixes.sql` en 9 bloques):**
- 🔴 **BUGS EN SILENCIO por RLS incompleto**: faltaban políticas UPDATE/DELETE en `fichajes` (editor no funcionaba), UPDATE en `firmas_documentos` (reenviar Kit Alta no archivaba, PDFs no guardaban su URL), INSERT self en `documentos_subidos` (socorrista no podía subir docs). Postgres devolvía 0 filas sin error → todo aparentaba funcionar.
- 🟠 **Coordinador tenía permisos de dueño en BD**: `auth_es_admin()` daba true para ambos. Nueva función `auth_es_dueno()` + policy `usuarios_delete` restringida al dueño. Trigger `usuarios_proteger_rol` impide que un coord se auto-promocione a dueño o se auto-reactive por consola.
- 🟠 **Socorrista podía reactivarse solo**: trigger `empleados_proteger_campos` que impide cambiar estado, puesto, empresa, contrato, activo desde su cuenta.
- 🟠 **`alertas_insert` abierto**: cualquiera podía crear alertas en nombre de otro. Cerrado a `empleado_id = auth_empleado_id() or auth_es_admin()`.
- 🟠 **Sin aislamiento entre empresas**: horarios, tareas, notas, docs, fichajes, firmas → añadido filtro por `empresa_id` en todas las políticas (necesario ANTES del segundo cliente).
- 🟠 **`titulaciones_empleado` y `visitas_hoteles` sin RLS**: añadidas.
- 🟢 **Índices que faltaban**: `fichajes(hora)`, `fichajes(puesto_id, hora)`, `alertas(fecha_creacion) where not resuelto`, `tareas(empleado_id) where not hecha`, `firmas_documentos(empleado_id, documento_codigo)`, `inventario_puesto(item_id)`.
- 🟢 **Schema sincronizado**: `usuarios` +nombre/telefono/disponible/ultimo_login, `fichajes` +origen_manual/registrado_por/motivo_manual, tablas nuevas `titulaciones_empleado` y `visitas_hoteles` documentadas.

**Descubierto por la auditoría (y arreglado en app):**
- ✅ **Campana rota desde v50**: usaba `created_at` y `resuelto_el` cuando las columnas reales son `fecha_creacion` y `fecha_resolucion`. El panel NUNCA mostró alertas y Resolver fallaba en silencio. Fix + muestra el error si algo peta en vez de tragárselo.
- ✅ **Bug de acceso invisible (caso Francisco Sierra Vaca + 19 más)**: `empleados.estado='activo'` y `usuarios.activo=false` son campos independientes. Se ven 20 empleados en verde mientras auth-guard les expulsa. Ahora `cargarEmpleadosDB` trae también `usuarios.activo` y `ultimo_login`, badge rojo "Sin acceso" en la tarjeta, banner ámbar "N figuran activos pero no pueden entrar · Reparar todos" y tarjeta roja en la ficha con botón "Restaurar acceso".

**Nuevas funciones para el arranque real con plantilla:**
- ✅ **Panel "Enviar accesos a socorristas"** (botón rojo en Coordinación): lista con estado real por socorrista (verde=ya entró/no necesita email, ámbar=nunca entró/lo necesita, rojo=sin cuenta/sin email deshabilitado). Preselección solo de los que nunca han entrado. Envío secuencial con 1,2 s de pausa entre emails para no chocar con rate limit de Resend. Barra de progreso + log en vivo con éxito o error por cada envío.
- ✅ **Manual del socorrista** `docs-clientes/manual-socorrista.html` con 9 secciones + FAQ. Botón "Descargar en PDF" con jsPDF (texto real seleccionable, portada roja, salto de página respetando bloques) y botón "Compartir por WhatsApp" (navigator.share en móvil, wa.me en desktop) + copiar enlace.
- ✅ **Alerta de titulaciones caducadas** (nuevo tab "Titulaciones" en menú): 4 bloques (caducadas / caducan este mes / caducan en 3 meses / obligatoria sin subir), badge rojo en menú con nº crítico, botón de llamada por fila, exportar CSV, click abre ficha directo en pestaña titulaciones. En socorrista: aviso rojo/ámbar en Inicio si tiene algo caducado o próximo.

**Fixes de flujos:**
- ✅ **Turno partido reactivado**: tras fichar salida seguía apareciendo "Turno finalizado" sin botón. Ahora se lee el día como LISTA de tramos, aparece "Fichar nueva entrada" y chips visuales con todos los tramos del día ("10:00–14:30 · 16:00–20:30") + total acumulado. Soporta N tramos, no solo 2.
- ✅ **Cálculo horas con turnos partidos**: dos bugs graves. En `generarJornadaOficial` (PDF inspección) se tomaba solo la primera entrada y la última salida → contaba 10:00–20:30=10,5h en vez de 4,5+4,5=9h (metía la hora y media de descanso dentro de la jornada). Ahora empareja tramos. Y el tope de 8h ordinarias se aplicaba POR TRAMO en vez de POR DÍA en "Horas del mes" y en el CSV → un turno partido de 4,5+4,5 contaba 9h ordinarias. Ahora se acumula el día y luego se reparte.
- ✅ **Alertas mostraban solo el producto** (no la nota del socorrista): `itemNombre = producto || mensaje` → siempre ganaba el producto. Nueva `extraerNotaDeAlerta` que entiende los dos formatos ("Falta 3× X — nota (Hotel)" y "[Mensaje de X] texto"). Nota destacada en ámbar en widget y campana. Alertas ahora clicables → modal detalle con producto, puesto, criticidad, nota, quién y cuándo lo reportó, botón llamada, mensaje íntegro, botón resolver.
- ✅ **Subida de documentos forzaba cámara**: `capture="environment"` en los inputs → el móvil abría directo la cámara. Quitado + accept ampliado a Word y HEIC → ahora sale el selector nativo con Archivos/Galería/Cámara.
- ✅ **KPIs de la cabecera clicables**: los 4 KPIs (Operativos/Tarde/Fuera/Sin fichar) ahora filtran la lista de puestos y hacen scroll a ella. El badge "N abiertas" de Alertas de botiquín lleva a la sección Botiquín.
- ✅ **Panel Fichajes por día** (nuevo tab en menú): selector de fecha (default hoy), navegación anterior/hoy/siguiente, agrupa por empleado con avatar clicable, botón llamar y botón "ver horas del mes" que abre ficha en pestaña Acciones con editor de fichajes cargado.
- ✅ **Editor de fichajes existentes** en Ficha > Acciones (bloque amarillo): "Últimos 7 días" / "Mes actual", cada fichaje con hora, tipo, GPS, chip 📌 manual, botones ✏️editar y ✕borrar con auditoría en `motivo_manual`.
- ✅ **Fichar por empleado desde admin** (bloque azul en Ficha > Acciones): prompt hora + motivo + confirm. INSERT con `origen_manual=true`, `registrado_por`, `motivo_manual`. Chip 📌 visible en el panel general para saber que fue manual.
- ✅ **Botón Llamar directo** en cada tarjeta del panel (redondo, rojo si fuera de zona, verde si OK) con `tel:+34…` normalizado. Badge gris tachado si el empleado no tiene teléfono en su ficha.

**Botiquín:**
- ✅ **Carga real de los 22 productos** que usa la empresa (`sql/05-limpiar-inventario-antiguo.sql` para quitar los antiguos de plantilla). Ahora cada hotel tiene exactamente esos 22.
- ✅ **Botón "Añadir producto a TODOS los hoteles"** en Botiquín + DESA, con banner azul indicando modo masivo y contador de hoteles afectados.

**Kit Alta:**
- ✅ **Marca visible de fichaje manual** 📌 en el panel + aviso azul en modal de detalle con el motivo.
- (De la sesión anterior sigue vigente): 8 pasos con textos revisados por el despacho legal, radio SI/NO reconocimiento médico obligatorio, EPIs separados de uniforme, firma en cada hoja del PDF.

**SQLs de esta sesión (ver `sql/04-auditoria-fixes.sql` y `sql/05-limpiar-inventario-antiguo.sql`):**
```sql
-- Auditoría (04) — ejecutar bloque por bloque, en Supabase SQL Editor.
-- Bloques 1-4 = críticos, 5 antes de segundo cliente, 6-8 esta semana, 9 verificación.

-- Limpieza inventario antiguo (05) — 3 pasos:
-- 1) SELECT para revisar qué se va a borrar
-- 2) DELETE en inventario_puesto
-- 3) DELETE en inventario_items
-- Con verificación final: cada hotel debe quedar con 22 items de botiquín.
```

---

---

### Sesión 2026-08-04 · DÍA DE ARRANQUE REAL · v85 → v102 · 17 versiones en un solo día
Cliente empezó a fichar con 27 socorristas repartidos por hoteles Inturotel + Gavimar + otros.
Muchos bugs descubiertos con uso real y arreglados en caliente. Cronología resumida:

**Correturnos + panel multi-socorrista (v98) — el bug crítico del arranque:**
- ⚠️ **Panel del coord mostraba solo 1 fichaje por hotel**: en Cala Romani entraron 3 socorristas pero solo aparecía 1. Causa: `ultPorPuesto[puesto_id] = f` solo si no existía → descartaba N-1. **Fix**: agrupación por (puesto, empleado); tarjeta lista TODOS los socorristas del hotel + "N socorristas hoy". Estado del puesto = peor estado de sus socorristas.
- ⚠️ **Correturnos ficha con puesto_id null**: no tenían puesto principal → los fichajes quedaban huérfanos, no aparecían en ningún hotel. **Fix**: `insertarFichaje` ahora abre modal-hotel si el empleado es correturnos o no tiene puesto; lista todos los hoteles ordenados por cercanía GPS (más cerca arriba con "📍 32 m" verde). El hotel elegido se guarda en `sessionStorage.psHotelHoy_<empId>` para que la salida vaya al mismo hotel sin volver a preguntar.
- ⚠️ **Fichajes NULL de rescate**: para Antonio Gabriel y otros que ficharon con app antigua sin puesto, SQL de rescate que asigna automáticamente el hotel más cercano por GPS (Postgres `power()`). Usado en el chat con éxito.

**GPS accuracy + reintento (v98):**
- `obtenerGPS()` con reintento inteligente: si primer intento >300m accuracy (síntoma de fallback A-GPS por celda que tira el pin al mar), reintenta 1 vez más y se queda con el mejor. Reduce muchos "fuera de zona" fantasma.
- Guarda `accuracy_m` en el fichaje (con fallback silencioso si la columna aún no existe).

**Puntualidad por horario del socorrista (v99):**
- Antes: `renderRankingPuntualidad` comparaba contra `puestos.hora_inicio_default` (único por hotel) → si 2 socorristas entran al mismo hotel a distintas horas, uno salía "tarde" falsamente.
- Ahora: consulta `horarios` del socorrista y elige la hora prevista según empleado_id + puesto_id + día de la semana. Parser flexible reconoce "Lun-Vie", "L-S", "Lun,Mie,Vie", "Dom", turnos partidos. Fallback a `hora_inicio_default` si no hay horario configurado.

**Ubicación verificada (v92):**
- Botón verde "✓ Ubicación verificada" en modal del puesto y en editor de fichajes (admin+coord). Un fichaje fuera de zona puede marcarse como correcto (con motivo opcional) → `fuera_de_zona=false` + `motivo_manual` con marca `[GPS verificado DD/MM · admin|coord]`.

**Parte de incidencias digital (v83, v85, v86, v93, v94, v96):**
- Nueva tabla `incidencias` con RLS + trigger nº parte auto (INC-2026-0001) + Realtime. **`sql/06-incidencias.sql` autosuficiente** (crea auth_es_dueno, etc. si no existen).
- Botón rojo "Incidencia" en tabbar del socorrista (no en inicio) → wizard 6 pasos: (1) tipo+circunstancias+hotel autodetectado, (2) víctima+menor+familiar, (3) estado+silueta cuerpo, (4) actuación+técnicas+material, (5) derivación+ambulancia, (6) firma canvas.
- **Silueta anatómica realista**: usa `assets/mapa-dolor.png` (ChatGPT-generated 1536×1024) con `<image>` dentro del SVG + `preserveAspectRatio="none"` para recortar exacto el cuerpo. Coordenadas de zonas en `ZONAS_CUERPO` (~46 zonas cliqueables).
- **Fix listener duplicado**: `engancharSilueta` usa flag `__psSiluetaBound` para no re-adjuntar listeners en cada render → ahora deja multi-marcar y deseleccionar. Añadido `touchend` explícito con preventDefault para móvil.
- Material del botiquín → descuenta stock automáticamente via RPC `descontar_material_incidencia` (fallback en cliente).
- PDF `PSPdf.generarIncidencia` a UNA hoja A4 (layout 2 columnas). Silueta `siluetaParaPDF()` con SVG puro sin PNG (jsPDF no puede embeber imágenes vía svgToPdf).
- Tab "Incidencias" en admin con Realtime + push local + filtros + CSV export + detalle con silueta + botón descargar PDF.

**Kit Alta para coordinadores (v95):**
- Los coord/dueño también son trabajadores → deben firmar Kit Alta.
- `sql/11-empleados-para-coord.sql` crea ficha empleado idempotente para todo dueno/coordinador que no la tenga.
- `auth-guard.js` auto-crea ficha empleado en cada login si falta (cualquier rol).
- Banner rojo grande en cabecera del coord si no ha firmado. Botón lleva a `socorrista.html?kit=1&volver=coord`. Tras firmar redirige de vuelta.
- El PDF del Kit Alta (v89) **cada apartado en HOJA NUEVA** (`doc.addPage()` al inicio) — ya no se corta ningún apartado a la mitad. Firma final SIEMPRE en hoja propia grande con GPS.

**Cambiar email empleado desde admin (v97):**
- `sql/12-cambiar-email-admin.sql`: RPC `admin_cambiar_email(empleado_id, nuevo_email)` con `security definer`. Valida internamente que el llamador es dueño y sincroniza en cascada auth.users + auth.identities + usuarios + empleados.
- En la ficha del empleado, al cambiar el email y guardar detecta el cambio y llama a la RPC (con confirm previo). Elimina el paso manual por Supabase Dashboard.

**Múltiples botiquines/oxígenos por hotel (v101 + v102):**
- Nueva tabla `unidades_material` (puesto_id, seccion, nombre, numero, activo). `inventario_puesto.unidad_id` apunta a la unidad concreta. Backfill: "Botiquín 1 / DESA 1 / Oxígeno 1" para todos los hoteles existentes.
- RPC `duplicar_unidad_material(puesto_id, seccion, nombre)` copia items+minimos con stock=minimo.
- `sql/14` auto-crea las unidades pedidas por el cliente:
  - Cala Gran (Gavimar): +Botiquín 2 +Oxígeno 2
  - Cala Romani: +Botiquín 2 +Botiquín 3
  - Ona Luna Park: +Botiquín 2 +Oxígeno 2
  - Esmeralda Park: +Botiquín 2 +Oxígeno 2
  - Cala Esmeralda: +Botiquín 2 +Oxígeno 2
- **Socorrista**: si hay >1 unidad en la sección actual, aparece selector desplegable "📋 Elige cuál estás revisando" con marca ✓ de las ya revisadas hoy. Guardar revisión solo afecta a la unidad activa. La sección se considera revisada cuando TODAS las unidades del hotel están OK.
- **Admin (v102)**: barra `unidadesBar` encima de la lista de items con chip por cada unidad + ✏️ renombrar (prompt) + 🗑 eliminar (doble confirmación por tecleo) + botón "+ Añadir botiquín/DESA/oxígeno" (usa la RPC).
- Solo `dueno` puede gestionar unidades.

**Fix Guedel pediátrica (v102 / sql/15):**
- Baja mínimo a 1 (antes 2) en catálogo y en TODOS los hoteles, incluidas unidades duplicadas. Baja stock si estaba en el default 2.

**Toggle Disponible/Libre en cabecera (v90):**
- Chip verde 🟢 "Disponible" siempre visible junto al user-chip del dueño/coord (cualquier tab). Un clic → ámbar 🟡 "Libre". Mientras Libre: socorristas no le ven, no le llegan alertas.
- Panel de notificaciones (campana) responsive: bottom-sheet full-width en móvil ≤720px con top=62px bajo la nav (antes se salía por los lados).

**Push local mejorado (v93):**
- `PSNotif.notify()` ahora dispara SIEMPRE toast in-app + beep sintético (sine 880+1200 Hz) además de la Notification API nativa. Óscar (coord) con la app abierta ya se entera de las alertas aunque el SO no dispare push (por diseño Notification solo dispara si documento no visible).
- Banner naranja persistente arriba del dashboard si el permiso del navegador no está concedido y el rol es dueño/coord: "Activa los avisos para no perder alertas" con botón "Activar ahora".

**Filtro Documentación mejorado (v91):**
- 4 opciones: "Kit Alta pendiente" (default), "Cualquier pendiente", "Todos", "Solo al día". Antes "Solo pendientes" mezclaba kit sin firmar con jornada pendiente y confundía.
- Badge Kit Alta ✓ ahora muestra la fecha corta ("Kit Alta ✓ · 03 ago") + tooltip con fecha y hora completa.

**Otros arreglos:**
- **v88**: fix `ultimo_login` con RPC `marcar_ultimo_login()` security definer (arregla "Sin entrar" para todos). Ranking de puntualidad en el inicio del socorrista con card gradient según nivel.
- **v87**: modal editar coordinador (nombre, email, tel, rol) en Miembros del equipo.
- **v94**: hotel autodetectado en paso 1 del parte de incidencia (bloque azul con puestoReal).
- **v100**: fix del mapa "sin coordenadas GPS" en modal openPostModal (usaba row.fichaje singular que dejó de existir con la nueva estructura row.fichajes[]). Lista de "otros socorristas del hotel hoy" con mini-mapa por cada uno.

---

### Sesión 2026-08-03 · quinta jornada · v77→v78 · los 4 pendientes cerrados

**Push local (Notification API + Realtime) para el coordinador:**
- ✅ Nuevo módulo `js/ps-notifications.js` (`window.PSNotif`). Pide permiso al usuario con prompt nativo, guarda en localStorage. Suscribe canales Realtime `alertas` (INSERT) y `fichajes` (INSERT) y dispara `new Notification(...)` con vibración cuando la app está en background. Si está visible no molesta (solo suena si se pide `forceVisible`).
- ✅ Banner integrado dentro del panel de la campana con estados verde/azul/rojo. Botón "Activar" pide permiso, "Silenciar" desactiva sin borrar el permiso, "Denied" instruye a ir a los ajustes del navegador.
- ✅ Anti-spam: `notifiedIds` en memoria + marca de tiempo de arranque para no notificar el histórico al abrir la pestaña.
- ✅ Tipos de aviso: rojo (fichaje fuera de zona), silent (fichaje normal), color por criticidad (alertas), formato distinto para mensajes de socorrista (`tipo='otro'`).
- ⚠ Es push LOCAL — llega mientras la PWA está abierta o backgrounded, NO si el usuario cerró la pestaña del todo. Para eso haría falta Web Push con VAPID + backend, decisión aplazada.

**Editar/borrar fichajes con lápiz en "Horas del mes" (solo admin=dueno):**
- ✅ Nueva columna "Editar" en la tabla de Horas del mes por socorrista. Aparece solo si `rol==='dueno'`.
- ✅ Botón lápiz por fila abre modal ligero `abrirEditorHorasMes(empId)` que reutiliza `cargarFichajesEditables` con los mismos botones ✏️/✕ que ya existían en Ficha > Acciones.
- ✅ Añadido botón "＋ Añadir fichaje" en el modal (invoca `ficharPorEmpleado` pidiendo entrada/salida).
- ✅ Restringido `editarFichaje` y `borrarFichaje` en runtime a rol `dueno` (defensa en profundidad — RLS es la barrera real). En `cargarFichajesEditables` los botones ✏️/✕ se ocultan para coord.
- ✅ Al cerrar el modal se recarga `renderHours` para reflejar horas actualizadas.
- ✅ `borrarFichaje` ahora usa `.select()` tras el `.delete()` para detectar RLS silencioso.

**PDF finiquito descargable:**
- ✅ Nueva función `PSPdf.generarFiniquito(empleado, firma)` — recibo de saldo y finiquito según art. 49.2 ET, con cabecera roja, datos empresa/empleado, tabla económica con 7 conceptos + total (líneas en blanco para la gestoría, o rellenadas si `firma.campos_json.importes` trae valores), cláusula legal, firma incrustada + hueco para sello de empresa, evidencia técnica (dispositivo, GPS al firmar).
- ✅ `firmarFiniquitoAhora` (socorrista) ahora inserta con `.select().single()` y llama a `PSPdf.generarYSubir` en el mismo flujo → el PDF queda en Storage con URL guardada en `firmas_documentos.archivo_pdf_url` desde el momento cero.
- ✅ Ficha del empleado (admin) muestra bloque rojo por cada finiquito firmado con "Descargar PDF finiquito" + link al PDF ya guardado en Storage.
- ✅ `descargarPdfFirma` reforzado: si el código empieza por `finiquito-`, enriquece automáticamente el empleado con `fecha_alta`, `fecha_baja`, `tipo_contrato`, `puestos.nombre` desde BD (no basta con el cache local para el PDF).
- ✅ Nueva función helper `PSPdf.descargarFiniquito(empleado, firma)` y router `generarDocSegunTipo` para no repetir el switch en cada punto de descarga.

**Import Excel/CSV horarios v2 (superset del v1):**
- ✅ Parser reescrito: reconoce columnas `nombre`, `dni`, `hotel`, `hora_inicio`, `hora_fin`, `hora_inicio_2`, `hora_fin_2`, `dias`. Cabecera detectable en cualquiera de las 5 primeras filas. Fallback al formato viejo `horario="10:00-18:00"` si no vienen columnas separadas. Detecta también el 2º tramo dentro de un texto "10:00-14:30 / 16:00-20:30".
- ✅ **Match por DNI PRIMERO** (mucho más fiable que nombre). Si no hay DNI, match por nombre normalizado (todos los tokens del nombre buscado tienen que aparecer en el empleado). Antes hacía match débil por "primer nombre incluido" y podía enganchar a otro Alberto.
- ✅ Turno partido: parsea 4 horas y guarda en `horarios.es_partido = true` + `hora_inicio_2` + `hora_fin_2`. Fallback automático si la BD no tiene esas columnas (schema antiguo).
- ✅ Parser de horas robusto: acepta `10:00`, `10.00`, `10`, `10h`, y números decimales de Excel (0.416666... = 10:00).
- ✅ **Preview separa filas OK vs errores** con motivo específico ("Empleado no encontrado: Juan Pérez. Debe estar dado de alta antes.", "Puesto no encontrado: Hotel X", "Horas de entrada/salida no válidas"). Las filas con error NO se aplican; el botón "Aplicar" muestra el nº real.
- ✅ **Botón "Descargar plantilla Excel"**: genera plantilla `PoolSafety-plantilla-horarios.xlsx` con cabeceras + 2 filas de ejemplo (turno normal + turno partido) usando datos de empleados reales si existen. Anchuras de columna cómodas + notas al pie con recordatorios de formato.
- ✅ **Modal "Ayuda de formato"**: tabla con todas las columnas reconocidas + qué debe contener cada una + consejos + botón de descargar plantilla.
- ✅ `aplicarImportHorario` con doble intento: primero con todas las columnas nuevas, si BD antigua falla por columna → reintento sin ellas. Errores individuales se acumulan y se muestran en `alert()` final si los hay (máx 8 detalles).
- ✅ El JSON no se serializa como atributo HTML (rompía con comillas). Guardado en `window.__horariosParaAplicar` y consumido por `aplicarImportHorarioReal()`.

**Otros:**
- ✅ SW `poolsafety-v79`, `ps-notifications.js` añadido al CORE cache.
- ✅ Se restringe en runtime `editar/borrar fichaje` a dueño (defensa en profundidad además del RLS de la BD).

**Parte de incidencias digital (v83) — REQUIERE ejecutar `sql/06-incidencias.sql` primero:**
- ✅ Botón rojo "Registrar parte de incidencia" en Inicio del socorrista → wizard 6 pasos.
- ✅ Pasos: (1) Tipo+circunstancias+ubicación+testigos, (2) Datos víctima+menor+familiar, (3) Estado+silueta cuerpo cliqueable (frontal y espalda), (4) Actuación+técnicas+material del botiquín, (5) Derivación+ambulancia, (6) Firma canvas + declaración.
- ✅ Silueta SVG propia (frontal y posterior) con círculos cliqueables por zona anatómica (~30 zonas: cabeza, cuello, hombros, tórax, abdomen, brazos, manos, muslos, rodillas, piernas, pies + nuca, espalda, glúteos posteriores).
- ✅ Material usado: lista del inventario_puesto del hotel con − / + / input. Al enviar se **descuenta stock automáticamente** via RPC `descontar_material_incidencia`, fallback en cliente si RPC no disponible.
- ✅ Nueva tabla `incidencias` con RLS (empleado ve solo los suyos, admin/coord de la empresa todos). Trigger auto-genera `numero_parte` tipo `INC-2026-0001`. Realtime activado.
- ✅ PDF generado con `PSPdf.generarIncidencia`: cabecera roja PoolSafety, todos los bloques del wizard, silueta con zonas marcadas en rojo, tabla de material, firma incrustada, GPS al firmar. Se sube a Storage `incidencias/{id}.pdf` y url guardada en `archivo_pdf_url`.
- ✅ **Nuevo tab "Incidencias"** en menú del admin/coord con badge (nº de partes de las últimas 48 h). Panel con filtro por tipo + fecha, exportación CSV, botón "Ver detalle" con silueta y todos los datos, botón "Descargar PDF" (rojo).
- ✅ **Realtime + push local**: cuando el socorrista firma un parte, el admin/coord recibe notificación nativa 🚨 al momento (si tiene los avisos activados) y aparece la fila en el panel sin refresh.
- ✅ Módulo compartido `js/ps-incidencias.js` con `PSInc.TIPOS_INCIDENTE`, `TECNICAS`, `DERIVACIONES`, `ZONAS_CUERPO`, `siluetaSVG()`, `engancharSilueta()`.
- ⚠️ **SQL a ejecutar antes**: `sql/06-incidencias.sql` en Supabase SQL Editor. Sin él el panel del admin muestra un error explícito indicando qué SQL falta.

**Revisión por sección + auto-reset diario + observaciones + limpiar inicio socorrista (v82):**
- ✅ **Botón único "Guardar revisión de <sección>"** grande al final de cada tab (Botiquín / DESA / Oxigenoterapia) — reemplaza al antiguo "Marcar todo comprobado". Pide observaciones por prompt.
- ✅ **Estado "revisado hoy" calculado desde `ultima_revision`** (no del boolean `revisado_hoy`). Al llegar el día siguiente los ticks se resetean solos sin cron. El boolean queda como caché opcional.
- ✅ **UI bloqueada tras guardar**: banner verde con ✅ "<Sección> revisado hoy · última revisión HH:MM · N/N artículos · Mañana volverá a aparecer la revisión pendiente" + botón secundario "Revisar de nuevo ahora" (por si el coord pide segunda comprobación en el mismo turno).
- ✅ **Observaciones al coord**: si el socorrista escribe algo no vacío, se inserta como `alertas` (tipo='otro', origen='socorrista', criticidad='baja', mensaje `[Revisión BOTIQUÍN] X/Y artículos · Observaciones: ...`). Si están vacías, NO se genera alerta (evita ensuciar el feed del coord con "todo OK" x22 hoteles/día).
- ✅ Aviso claro si se guarda con revisión parcial (X marcados de Y): "⚠️ Solo has marcado X de Y artículos. Se guardará como revisión igualmente".
- ✅ **Quitado bloque "Mi mes · Días trabajados / Horas trabajadas"** del inicio del socorrista. Los cálculos de horas siguen usándose para el registro mensual (jornada firmada) y el perfil, solo se ocultó de la pantalla de inicio. Función `renderMetricasMes` sigue existiendo pero no encuentra los DOM ids y retorna sin ruido.

**Mapa real del punto donde ficha el socorrista (v81):**
- ✅ Placeholder SVG de calles falsas SUSTITUIDO por iframe OpenStreetMap con marcador en las coordenadas EXACTAS del fichaje (`fichajes.gps_lat/gps_lng`). Sin API key, sin CSP problems.
- ✅ Función pura `renderMapaFichaje({puestoLat, puestoLng, fichLat, fichLng, radio, esManual})` reutilizable desde cualquier vista.
- ✅ En el modal detalle del puesto: mapa aparece automáticamente en el mismo hueco donde antes salía el dibujo genérico. Debajo, coords en texto + botones "Google Maps" (abre app nativa en móvil) y "Ver ampliado" (OSM full).
- ✅ Cálculo Haversine de distancia entre punto fichado y centro del puesto → mensaje ✓ verde "Dentro del radio" o ⚠ rojo "N m del centro" con contexto del radio permitido.
- ✅ Botón nuevo 📍 (verde) en cada fila del editor de fichajes (Ficha > Acciones / modal Horas del mes) → toggle inline del mismo mini-mapa. Cache global `window.__fichajesCache` para no refetchear si ya vino en la lista.
- ✅ Botón 📍 visible también para coord (no solo admin) — ver el mapa es informativo, no destructivo.
- ✅ Fichajes manuales sin GPS (los que crea el admin desde Registrar entrada/salida) muestran banner azul "sin coordenadas GPS (fichaje manual del admin)" + mapa centrado en el puesto para no dejar el bloque vacío.
- ✅ SELECTs de `renderPosts` y `cargarFichajesEditables` ahora traen `gps_lat`, `gps_lng` (fichaje) y `puestos.gps_lat/gps_lng/gps_radio_m`.

**Fichaje manual con día elegible (v80):**
- ✅ `ficharPorEmpleado(empId, nombre, tipo, fechaPredeterminada)` ahora pide FECHA antes que hora (YYYY-MM-DD, default = hoy). Permite meter fichajes de días pasados (útil para altas retroactivas u olvidos de fichaje). Bloquea fechas futuras. Si el día es pasado propone hora sensata (10:00 entrada / 18:00 salida).
- ✅ Si se invoca sin `tipo` se pide con prompt (soporte para llamadas antiguas del wrapper).
- ✅ Botones separados "＋ Entrada" (verde) y "＋ Salida" (ámbar) en el editor del modal Horas del mes — ya no hay que teclear el tipo.
- ✅ Los botones existentes en Ficha > Acciones ("Registrar entrada" / "Registrar salida") pasan el `tipo` y ahora también permiten fecha pasada.
- ✅ Tras insertar refresca renderFicha + renderPosts + renderEstadoEquipo + renderHours + el editor de fichajes si está abierto.

**Fix panel Documentación (v79) — jornada del mes solo cuando toca:**
- 🐛 Antes: mostraba "Jornada del mes pendiente" (naranja) para TODOS los empleados durante todo el mes → 40 falsas alertas no accionables (la jornada solo se firma a fin de mes o al dar de baja).
- ✅ Nueva regla: la firma de jornada se considera "pendiente accionable" SOLO si (a) estamos en los últimos 4 días del mes, o (b) el empleado está en `finiquito-pendiente`/`baja`. Fuera de eso, se muestra badge gris "Jornada · fin de mes" (informativo, sin acción).
- ✅ Contador de la cabecera (`X/Y al día · Z pendientes`) recalculado con la regla real. Añadida coletilla contextual: "últimos N días del mes: toca firmar jornadas" o "jornadas se firman al final del mes".
- ✅ Filtro "Solo pendientes" ya no incluye jornadas fuera de ventana.
- ✅ Botón nuevo "Solicitar firma" (color ámbar) por fila cuando toca firmar jornada, invoca `solicitarRegistroMensual`.
- ✅ Banner explicativo del panel reescrito: "Kit Alta: una sola vez. Jornada del mes: último día del mes o baja."
- ✅ Empleados en salida (finiquito-pendiente / baja) muestran badge "Firmar jornada de baja" para diferenciar del cierre mensual ordinario.

---

### Sesión 2026-08-07 · sexta jornada · v103→v108 · GPS, visitas, tarde y 2ª firma

**HOTFIX v103 — Fichar salida sin GPS (bloqueante en producción):**
Alba Gil llevaba desde las 7 de la tarde sin poder fichar salida porque Safari le pedía permiso GPS y ella lo tenía denegado. `insertarFichaje()` hacía `throw` si `obtenerGPS()` fallaba y el turno quedaba abierto. Ahora si el GPS falla aparece un `confirm()` con el motivo real ("Has bloqueado el permiso…") y la opción de fichar SIN GPS. Se guarda con `gps_lat/lng = null`, `gps_ok = false`, `fuera_de_zona = true`, `motivo_manual = '[Sin GPS] …'`. El coord ve el fichaje marcado con el motivo (badge rojo "🚫 SIN GPS" bien visible tanto en panel de puestos como en editor de fichajes).

**v104 — GPS radio 100m + botón Comprobar GPS:**
- `sql/16-ampliar-radio-gps.sql` sube gps_radio_m a 100m en todos los hoteles activos EXCEPTO los que están exactamente a 30m (respeta lo que pidió el cliente). Reduce falsos "fuera de zona" causados por precisión GPS típica del móvil (±30-80m interior).
- Nuevo botón **"Comprobar mi GPS"** en Perfil > Ajustes del socorrista. Diagnostica el estado del permiso (`navigator.permissions.query`) y muestra instrucciones específicas iOS/Android para: (a) permiso denegado, (b) permiso "prompt" que va a preguntar cada vez, (c) recomendación de instalar PWA cuando Safari va a resetear el permiso al cerrar.
- Aclaración importante: **el permiso "para siempre" no lo puede forzar la app**. Es decisión del navegador. Safari en iOS resetea el permiso al cerrar la pestaña salvo que la app esté instalada como PWA (Compartir → Añadir a pantalla de inicio). Se recomienda propagarlo a los socorristas por WhatsApp.

**v105 — Coord gestiona unidades material + foto empleado centrada:**
- Los coordinadores ya pueden ✏️ renombrar, 🗑 eliminar y ➕ añadir botiquines/DESAs/oxígenos igual que el dueño. La RLS de BD ya lo permitía (`auth_es_admin()` cubre ambos roles); solo faltaba quitar el check `rol === 'dueno'` de 4 puntos del JS.
- Bug foto perfil empleado descentrada en ficha admin: `.emp-card-photo.has-photo { background: #ddd; }` reseteaba con el shorthand el `background-size: cover` y `background-position: center` de la clase base. Se veía el recorte superior-izquierdo (fondo/hombro) en vez de la cara. Cambiado a `background-color: #ddd`.

**v106 — Visitas coord con entrada + salida + duración visible:**
- `sql/17-visitas-entrada-salida.sql` añade a `visitas_hoteles`: `fecha_hora_salida`, `gps_lat_salida`, `gps_lng_salida` + índice de visitas abiertas.
- El modal "Visita a hotel" pasa a llamarse **"Registrar entrada al hotel"** y ya no exige rellenar actividades (se rellenan al cerrar la visita).
- Cada visita abierta aparece con borde verde + badge **"🟢 EN CURSO · Xm"** con cronómetro en tiempo real y botón rojo **"🚪 Registrar salida del hotel"** en el timeline del propio coord.
- Al cerrar: captura hora + GPS de salida, prompt "¿qué has hecho?" (actividades_realizadas), prompt "¿nota para Adam?" (opcional).
- Timeline admin muestra visitas cerradas como `10:23 → 11:45 · 1h 22m` — hora entrada, hora salida y duración total para ver de un vistazo cuánto tiempo estuvo cada coord en cada hotel.

**v107 — Detección real de fichajes tarde en admin:**
- Bug histórico: chip "Tarde" y KPI "Tarde" del panel de puestos estaban **hardcodeados a 0** (`coordinador.js:141,149` con comentario "no tenemos lógica todavía"). Por eso Alba Gil llegó 10 min tarde y aparecía 0 en el panel.
- Ahora `renderPosts` trae los horarios activos de todos los empleados que han fichado hoy y calcula la hora prevista de cada entrada según su turno real (soporta turnos partidos: elige la hora más cercana al fichaje). Fallback al `hora_inicio_default` del hotel si no hay horario configurado.
- Tolerancia 5 min. A partir de eso el fichaje recibe `_llegoTarde + _retrasoMin`.
- Estado del puesto añade nivel `tarde` entre `fuera` y `ok`. Chip y KPI cuentan puestos con socorrista tarde. Cada fila de socorrista muestra badge amarillo **"⏰ 10m tarde"**. Filtro "Tarde" ya funciona.
- Requisito: el socorrista debe tener horario configurado en tabla `horarios` para que se compare contra su hora real. Sin horario cae al default del hotel.

**v108 — Segunda firma testigo en parte de incidencia:**
- `sql/18-incidencia-firma-testigo.sql` añade 6 columnas a `incidencias`: `firma_testigo_tipo`, `firma_testigo_nombre`, `firma_testigo_dni`, `firma_testigo_relacion`, `firma_testigo_imagen` (base64), `firma_testigo_motivo_ausencia`.
- El wizard del parte pasa de 6 → **7 pasos**. Nuevo **Paso 6 · Firma del cliente o testigo** con selector radio de 5 opciones:
  - 🟢 La persona atendida firma (recomendado) — autocompleta nombre+DNI de la víctima
  - 🔵 Firma familiar/acompañante (pide relación: esposa, tutor legal…)
  - 🟣 Firma responsable hotel/recepción (pide cargo)
  - 🔵 Firma otro testigo (rol opcional)
  - 🔴 No hay firma posible → justificación obligatoria
- Segunda canvas independiente con su propio ctx y limpiar.
- Fallback en insert: si sql/18 no está ejecutado, reintenta sin las columnas para no bloquear el parte (warning en consola).
- PDF: nuevo bloque "SEGUNDA FIRMA · [ROL]" debajo de la firma del socorrista con firma + nombre + DNI + rol. Si no hay firma, bloque "SIN SEGUNDA FIRMA · JUSTIFICACIÓN" con el motivo. Refuerza el valor probatorio del parte para reclamaciones o inspección.

**Aprendizajes de esta sesión:**
1. **GPS != cobertura móvil**. GPS es satélite. A-GPS necesita datos para acelerar el fix inicial pero el GPS puro funciona sin cobertura. Las causas reales de que falle en navegador: permiso denegado (código 1, más común), ubicación OFF en iOS/Android, interior de edificio sin ventanas, modo ahorro batería agresivo.
2. **Safari iOS resetea permisos al cerrar**. La única forma de que se guarden es instalar como PWA (Compartir → Añadir a pantalla de inicio). Recomendar propagarlo a plantilla.
3. **Fichaje de salida NUNCA debe bloquearse**. Es más importante que el socorrista pueda cerrar turno (aunque sea sin GPS) que la evidencia GPS. Guardar sin coords y marcar el motivo.
4. **Chip/KPI con `= 0` hardcodeado** era un TODO histórico que se pasó por alto. Grep periódico de `= 0;` en render funcs para detectar deudas técnicas.
5. **Radios GPS por defecto de 50m son muy justos**. La precisión típica del GPS móvil en piscina (con sombra de edificios) es 30-80m. 100m es un buen valor general; algunos hoteles necesitarán 150m.

---

### Aprendizajes clave de esta sesión (para no volver a caer)

1. **RLS falla en silencio**: sin política Postgres devuelve 0 filas afectadas SIN error. Si algo "no guarda" pero no da error → probablemente falta policy. Añadir `.select()` tras el `.delete()`/`.update()` para detectarlo.

2. **Dos campos "activo" pueden desincronizarse**: `empleados.estado` y `usuarios.activo`. Auth-guard usa el segundo. Mantener siempre coherentes o mostrar la desincronía.

3. **`auth_es_admin() = dueno OR coordinador`**: no vale como policy de operaciones peligrosas. Usar `auth_es_dueno()` para borrar cuentas, cambiar roles, activar/desactivar. Restricciones en JS no cuentan (F12 las salta).

4. **Turnos partidos rompen todo cálculo naive**: emparejar tramos. Cap por día, no por tramo. Test siempre con un caso 10:00-14:30 + 16:00-20:30.

5. **`capture="environment"` fuerza la cámara**: si quieres archivos también, quítalo.

6. **Cambios de nombre de columna son bombas**: `completada`→`hecha`, `created_at`→`fecha_creacion`. Cada rename necesita SEARCH exhaustivo en JS. Los tests reales lo pillan.

7. **`window.PS` no se expone con `const PS = ...`**: hay que hacer `window.PS = PS` explícito. Const en top-level no crea propiedad de window.

### SQLs manuales pendientes (si los del día no se ejecutaron)
```sql
-- Política usuarios_delete (crítica para eliminar coord)
drop policy if exists usuarios_delete on usuarios;
create policy usuarios_delete on usuarios
  for delete using (auth_es_admin() and empresa_id = auth_empresa());

-- Constraint estado empleados (para finiquito-pendiente)
alter table empleados drop constraint if exists empleados_estado_check;
alter table empleados add constraint empleados_estado_check
  check (estado in ('activo','baja','alta-pendiente','finiquito-pendiente','finiquitado','eliminado'));

-- Columnas nuevas horarios (turnos partidos)
alter table horarios add column if not exists hora_fin       time;
alter table horarios add column if not exists es_partido     boolean default false;
alter table horarios add column if not exists hora_inicio_2  time;
alter table horarios add column if not exists hora_fin_2     time;

-- Columnas nuevas usuarios (perfil coord)
alter table usuarios add column if not exists telefono   text;
alter table usuarios add column if not exists disponible boolean default true;
alter table usuarios add column if not exists ultimo_login timestamptz;

-- Columnas nuevas firmas_documentos
alter table firmas_documentos add column if not exists firma_imagen text;
alter table firmas_documentos add column if not exists ubicacion_lat numeric(10,7);
alter table firmas_documentos add column if not exists ubicacion_lng numeric(10,7);
alter table firmas_documentos add column if not exists archivo_pdf_url text;

-- Columnas nuevas empleados
alter table empleados add column if not exists es_correturnos boolean default false;

-- Columnas nuevas puestos
alter table puestos add column if not exists grupo_hotel text;
alter table puestos add column if not exists hora_fin_default time default '18:00';
alter table puestos add column if not exists servicios_necesarios int default 1;
alter table puestos add column if not exists notas text;
alter table puestos add column if not exists tiene_botiquin boolean default true;
alter table puestos add column if not exists tiene_desa boolean default false;
alter table puestos add column if not exists tiene_oxigeno boolean default false;

-- SESIÓN 2026-07-30/31 · Columnas de auditoría de fichaje manual
alter table fichajes add column if not exists origen_manual boolean default false;
alter table fichajes add column if not exists registrado_por uuid references usuarios(id);
alter table fichajes add column if not exists motivo_manual text;

-- Realtime para wizard Kit Alta instantáneo (si aún no está)
alter publication supabase_realtime add table tareas;
alter publication supabase_realtime add table firmas_documentos;
```

### Features aún no implementadas
- **Web Push real (VAPID)** al coordinador aunque la PWA esté cerrada (hoy hay push LOCAL solo si la app está abierta/backgrounded).
- **Editor de importes** en el PDF de finiquito (hoy quedan líneas en blanco que rellena la gestoría sobre papel).

### Nice-to-have
- Landing pública en `poolsafety.es` para captación hoteles.
- Panel dirección con facturación por hotel/mes.
- Firma electrónica reconocida (Signaturit/Docusign).
- Módulo titulaciones caducadas con email automático de renovación.

---

## 11. Decisiones importantes (histórico)

- **Netlify Pro** ($19/mes): tras agotar minutos build Free 2026-07 con ~50 releases. Deploys ilimitados.
- **Supabase** por región EU (RGPD), Postgres SQL clásico.
- **Tema rojo permanente** (marca cliente): `#B91C1C` sobre blanco.
- **Firma con canvas + jsPDF**: MVP suficiente para RGPD.
- **PDFs en Storage** vs base64 en BD.
- **Confirm email OFF** en Supabase Auth (evita emails fantasma al crear cuentas desde admin).
- **Site URL a producción**: NO localhost (aprendido tras enviar reset a Alex con link roto).
- **Reglas permisos**:
  - **Admin (dueno)**: cualquier acción incluyendo baja, finiquito, eliminación total, borrar coord, editar cualquier ficha.
  - **Coordinador**: crear socorristas, editar hoteles, asignar horarios, mandar tareas/notas, firmar Kit Alta en tablet. NO puede baja/finiquito/eliminar empleados ni borrar coord.
  - **Socorrista**: fichar GPS, ver botiquín, reportar falta material, firmar sus documentos, subir su documentación, contactar/mensaje coordinador.
- **Jornada socorrista simple**: siempre firma máx 40h/sem (o menos si trabajó menos). Extras solo admin las ve en PDF oficial inspección.
- **Rol Correturnos**: socorrista sin puesto fijo, badge amarillo visible.
- **Toggle Disponible/Libre coord**: solo disponibles aparecen en "Contactar coordinador" del socorrista.
- **Auto-reparación cuentas huérfanas**: si auth existe pero falta fila en usuarios/empleados, se auto-crea al primer login con metadatos del signUp.
- **Estado 'baja' no 'finiquitado'**: al firmar finiquito el empleado pasa a 'baja' para poder reactivar el año siguiente.
- **Alertas para todo tipo de aviso**: reportar falta material + mensajes socorrista→coord + auto stock bajo. Coord las ve todas juntas en el widget "Alertas de botiquín" + campana.
- **Textos legales Kit Alta**: extraídos literalmente de Word oficial del cliente (`KIT ALTA TRABAJADOR.doc` + `Documentación Empleados.docx`).
- **SW network-first + updateViaCache: 'none'**: cambios visibles al primer refresh con red.
- **RLS usuarios_delete**: sin esta política DELETE no falla pero no borra nada (bug silencioso descubierto 2026-07-29).

---

## 12. Comandos habituales

### Desarrollo local
```bash
node local-tools/server.js         # :8080, móvil misma WiFi
```

### Deploy (auto tras push)
```bash
git add -A && git commit -m "mensaje" && git push origin main
# Netlify Pro deploya en 30-60 seg
```

### Verificar sintaxis JS antes de push (crítico)
```bash
node --check js/socorrista.js && node --check js/coordinador.js && node --check js/ps-pdf.js && node --check js/ps-horarios.js
```
Un SyntaxError en cualquier JS bloquea toda la app. Ya pasó una vez.

### Ejecutar SQL en Supabase
Supabase → SQL Editor → New query → pegar → Run

### Cache Service Worker
Al añadir/modificar `.js` que se cachea, **incrementar** `const CACHE = 'poolsafety-vX'` en `sw.js`. Actual: **v41**.

### Test SMTP
Coordinación → Miembros del equipo → icono ↗ en una fila → confirma → revisar Resend Dashboard.

---

## 13. Cómo continuar en una nueva sesión

Al abrir nuevo chat con Claude, dile:

> Trabajo en la app PoolSafety. Léete `context.md` en la raíz del proyecto para ponerte al día.
> Estamos en piloto real. La empresa cliente es Pool Safety Des Llevant. La app está en producción en poolsafety-app.netlify.app con BD en Supabase.

Claude debería leer `context.md` y `CLAUDE.md` y entender todo el estado.

**Cuando termines cambios importantes**, actualiza este archivo en el mismo commit:
- Cambios de schema BD
- Nuevas dependencias/archivos JS
- Cambios de arquitectura
- Nuevas decisiones que otro Claude podría cuestionar sin este contexto
- Nueva versión del SW cache

### Reglas duras (grabadas en memoria de Claude también)
- **Admin puede TODO lo que puede coordinador y más.** Verificar paridad en cada cambio.
- **Schema del repo sincronizado con BD real.** Ya rompió el guardado del hotel una vez.
- **NO mocks visibles al usuario.** Todo desde BD real. Placeholder "Cargando…" mientras.
- **Verificar `node --check` antes de push.** Un JS roto tumba la app.

---

## 14. Trucos de debug rápidos

**App bloqueada / muestra datos mock (María Fernández, etc.):**
1. F12 → Console → mirar si hay SyntaxError.
2. F12 → Application → Storage → Clear site data → recargar.

**"No me deja eliminar/actualizar en BD":**
1. Verificar si hay policy RLS que permita el DELETE/UPDATE.
2. En el JS usar `.select()` tras `.delete()` para ver cuántas filas se afectan.
3. Si son 0 sin error → falta policy RLS.

**"No llegan los emails":**
1. Confirm email OFF en Supabase Auth.
2. SMTP configurado con sender info@poolsafety.es.
3. Site URL a producción (no localhost).

**"Los cambios no llegan a los móviles":**
1. Incrementaste `CACHE` en sw.js?
2. Auto-update salta en 60s con banner.
3. Manualmente: Ctrl+Shift+R o cerrar/abrir PWA.
