# PoolSafety App · Context

> **📌 IMPORTANTE PARA CLAUDE:** Fuente única de verdad del proyecto.
> Al terminar cambios significativos, **ACTUALIZA este archivo en el mismo commit**.
> Es lo primero que lees al retomar el proyecto en una nueva sesión.

Última actualización: 2026-07-31 (tercera jornada · piloto arrancando con socorristas reales)
**Cache SW actual: `poolsafety-v67`**

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
- **Notificación PUSH** al coordinador cuando socorrista ficha/reporta (hoy Realtime + refresh 25s + campana).
- **Editar/borrar fichajes individuales con lápiz** en Horas del mes (hoy solo se ven agrupados).
- **PDF finiquito descargable** (hoy se guarda la firma pero no genera PDF descargable).
- **Import CSV masivo horarios** para 150 socorristas.

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
