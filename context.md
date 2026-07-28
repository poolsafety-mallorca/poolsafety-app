# PoolSafety App · Context

> **📌 IMPORTANTE PARA CLAUDE:** Este fichero es la fuente única de verdad del proyecto.
> Cuando hagas cambios significativos (nueva feature, cambio de esquema BD, decisión de arquitectura,
> nuevo dato del cliente, credencial, cambio de dependencia), **ACTUALÍZALO en el mismo commit**.
> Es lo primero que hay que leer al retomar el proyecto en una nueva sesión.

Última actualización: 2026-07-28 (cierre de jornada · batch completo del día)

---

## 1. Qué es esto

App operativa web (PWA) para **Pool Safety Des Llevant, S.L.** — empresa de socorrismo en Mallorca
con ~150 socorristas en plantilla que gestiona ~80 puestos en hoteles y piscinas de las Baleares.

Sustituye WhatsApp + Excel + papel para: fichaje con GPS, coordinación en vivo,
botiquines/DESA según normativa balear, firma digital de documentación laboral,
gestión de horarios y titulaciones (SVB, DEA, socorrismo, PRL, DNI).

**Estado:** piloto activo con 4 usuarios reales antes de rollout completo.
**Cache SW actual:** `poolsafety-v29`.

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
| Coordinadores | Alex (RRHH) + Óscar (Laboral) |
| Estacionalidad | ~150 fijos, sube a 300+ en temporada alta con 50+ hoteles cliente |

---

## 3. Stack + hosting + cuentas

| Servicio | URL/Cuenta | Notas |
|---|---|---|
| **Código** | github.com/poolsafety-mallorca/poolsafety-app | Org del cliente. Repo público (RGPD OK — sin secrets) |
| **Hosting** | poolsafety-app.netlify.app | **Netlify Pro** (upgrade 2026-07-28 tras agotar minutos build Free). Deploy automático al push main |
| **BD + Auth** | msdjsbegqpjpshnxoilh.supabase.co | Supabase Free. Región EU-West-1 (Ireland) |
| **Emails** | Resend + Supabase SMTP | **SMTP configurado** con sender `info@poolsafety.es`. Delivered OK a socorristas y coordinadores. Confirm email desactivado (evita spam). Templates HTML personalizados pegados en Supabase → Auth → Email Templates. |
| **PWA** | manifest.webmanifest + sw.js | Instalable Android + iOS + Desktop. Auto-update banner activo. |
| **Vercel** | Cuenta creada, sin usar | Abandonada por Netlify |

### Cuentas GitHub involucradas
- `poolsafety-admin` — cuenta del cliente, dueña de la org (con 2FA)
- `Origencuidadointegral` — cuenta del developer (Owner de la org)

### Cuenta Supabase
- Usuario: `info@poolsafety.es` (via GitHub `poolsafety-admin`)
- Org: `PoolSafety Mallorca`
- Proyecto: `poolsafety-app-prod`
- **URL**: `https://msdjsbegqpjpshnxoilh.supabase.co`
- **Anon key** (safe): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZGpzYmVncXBqcHNobnhvaWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjQ5NDgsImV4cCI6MjEwMDc0MDk0OH0.Ws2Fq3chqf7jgJUFQcXlAKEr63z1HkJgs08e4GrxqdI`
- Contraseña BD y service_role key: solo cliente (guardadas en su gestor)

### URL Configuration Supabase Auth (importante — se corrigió el 2026-07-28)
- **Site URL**: `https://poolsafety-app.netlify.app` (no localhost).
- **Redirect URLs**: `https://poolsafety-app.netlify.app/**` y `https://poolsafety-app.netlify.app/reset.html`.

---

## 4. Stack técnico

- **Frontend:** Vanilla HTML/CSS/JS. NO hay build step ni framework. Se despliega directamente.
- **Supabase JS SDK v2** via CDN `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **jsPDF** via CDN `cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` — genera PDFs de firmas
- **SheetJS (XLSX)** via CDN `cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js` — parse Excel de horarios
- **Sin dependencias npm.** No hay `package.json` ni `node_modules`.
- **Servidor local:** `node local-tools/server.js` — porto 8080, para probar en móvil misma WiFi
- **Estrategia SW:** network-first + `updateViaCache: 'none'` — los cambios aparecen al primer refresh, no dos.

---

## 5. Estructura de archivos

```
app poolsafety/
├── index.html                     # Login (con reset password modal)
├── socorrista.html                # Vista móvil socorrista (Inicio, Tareas, Botiquín, Docs, Perfil)
├── coordinador.html               # Dashboard admin+coordinador (menú de 8 secciones)
├── reset.html                     # Página de recuperar contraseña (recibe token de email)
├── manifest.webmanifest           # PWA
├── sw.js                          # Service Worker (cache versión: incrementar al añadir js)
├── _headers                       # Netlify: MIME types y SW-Allowed
├── vercel.json                    # (sin usar, se puede borrar)
├── assets/logo-blanco.png         # Logo (versión blanca para fondos oscuros)
├── css/styles.css                 # Todo el CSS. Contiene tema-red override
├── js/
│   ├── supabase-client.js         # Cliente + helpers PSDB
│   ├── auth-guard.js              # Protección de páginas + redirección por rol + auto-reparación cuenta huérfana + tracking ultimo_login
│   ├── theme-toggle.js            # Aplica tema rojo permanente
│   ├── pwa-install.js             # Registro SW + banner auto-update + modal instalación Android/iOS
│   ├── icons.js                   # SVG symbols (Lucide-style)
│   ├── data.js                    # kitAltaSubdocs (con texto legal completo) + EMPRESA + firmas localStorage (mocks siendo eliminados)
│   ├── titulaciones.js            # Módulo compartido PSTit (renderizado + BD)
│   ├── ps-storage.js              # Wrapper Supabase Storage (bucket empleados-media)
│   ├── ps-pdf.js                  # PDFs: generarKitAlta (texto legal completo + EPIs), generarJornadaResumen, generarJornadaOficial (formato Word inspección)
│   ├── ps-horarios.js             # Módulo compartido PSHor (CRUD tabla horarios · usado en ficha hotel + ficha empleado)
│   ├── socorrista.js              # Lógica vista socorrista (arranca sin mocks, todo desde BD real)
│   └── coordinador.js             # Lógica dashboard coordinador/admin
├── sql/
│   ├── 01-schema.sql              # Tablas + ALTER TABLE ADD COLUMN IF NOT EXISTS idempotentes al final
│   ├── 02-rls.sql                 # Row Level Security por rol
│   ├── 03-seed.sql                # Empresa + hoteles + inventario normativo
│   └── README.md
├── email-templates/               # ✨ Templates HTML branded para Supabase Auth
│   ├── reset-password.html        # 'Accede a la app de PoolSafety' con botón rojo + evidencia
│   ├── confirm-signup.html        # 'Bienvenido al equipo' con lista de features
│   └── invite-user.html           # 'Te damos acceso al equipo' con botón aceptar
├── docs-clientes/
│   ├── bienvenida-adam.{html,pdf}
│   ├── bienvenida-coordinadores.{html,pdf}
│   ├── bienvenida-socorrista.{html,pdf}
│   └── *-artifact.html            # Copias con logo en base64
├── local-tools/server.js          # Servidor local para probar en móvil
└── context.md                     # ESTE ARCHIVO
```

---

## 6. Base de datos

### Tablas principales (con columnas añadidas hoy 2026-07-28)
| Tabla | Propósito | Notas |
|---|---|---|
| `empresas` | Multi-tenant (hoy solo PoolSafety) | Insertada 1 fila |
| `usuarios` | Extiende auth.users con rol y empresa | Columnas: `nombre`, `activo`, `telefono`, `disponible` (toggle Libre coord), `ultimo_login` (tracking login) |
| `puestos` | Hoteles/piscinas con GPS y equipamiento | Columnas nuevas: `grupo_hotel`, `hora_fin_default`, `servicios_necesarios`, `notas`, `tiene_botiquin`, `tiene_desa`, `tiene_oxigeno` |
| `empleados` | Ficha del socorrista (usuario_id UNIQUE) | Columna nueva: `es_correturnos boolean`. Estados: `activo`, `baja`, `alta-pendiente`, `finiquito-pendiente`, `finiquitado`, `eliminado` |
| `horarios` | Asignación empleado→puesto con turno | Editable desde ficha hotel Y ficha empleado (PSHor). Días L M X J V S D. |
| `fichajes` | Entradas/salidas con GPS + geocerca | Guarda distancia_m y fuera_de_zona. Realtime subscription en admin. |
| `documentos_empresa` | Plantillas (kit-alta, jornada, finiquito) | |
| `firmas_documentos` | Firmas con imagen PNG del canvas + GPS + IP | Columnas nuevas: `firma_imagen text`, `ubicacion_lat/lng numeric`, `archivo_pdf_url text`. `campos_json` guarda `horas_firmadas` + `horas_reales` + `dias_trabajados` para jornadas, `epis: {id: unidades}` para kit-alta |
| `documentos_subidos` | Contratos, nóminas, DNIs subidos por coordinador O por el propio socorrista | Path Storage: `docs-socorrista/{empleado_id}/...` |
| `registro_jornada` | Registro mensual (RD-ley 8/2019) | |
| `inventario_items` | Plantilla 41 items normativa Baleares | Decreto 53/1995 + 137/2008 |
| `inventario_puesto` | Stock por hotel | 20×41 = 820 filas iniciales |
| `alertas` | Auto stock-bajo + manuales socorrista | Panel botiquín + campana notificación admin leen de aquí (real) |
| `tareas` | Del coordinador al socorrista | Vista socorrista lee de aquí (real) |
| `notas` | Mensajes informativos | Vista socorrista lee de aquí (real) |
| `actividades_coordinador` | Parte diario de Alex/Óscar | Adam las ve en timeline |
| `visitas_hoteles` | Con GPS auto-captured al llegar al hotel | |
| `titulaciones_empleado` | DNI, SVB, DEA, socorrismo, PRL, contrato, nómina | Con fechas caducidad + reciclaje. Max 20 MB por archivo. |

### Storage (Supabase Storage)
Bucket público: **`empleados-media`**
- `fotos/{empleado_id}.jpg` — foto de perfil
- `firmas/{firma_id}.pdf` — PDFs firmados (auto-generados)
- `titulaciones/{empleado_id}/{...}` — DNIs, certificados
- `docs-socorrista/{empleado_id}/{...}` — documentos subidos por el propio socorrista

### RLS (Row Level Security)
Funciones helper: `auth_rol()`, `auth_empresa()`, `auth_es_admin()`, `auth_empleado_id()`.
Reglas base: **admin ve todo de su empresa · socorrista solo su propio empleado_id**.

---

## 7. Usuarios reales del piloto

| Email | Rol | Nombre display | Notas |
|---|---|---|---|
| `info@poolsafety.es` | dueno | Adam | Cliente. Rol UI = "Administrador". Único que puede baja/finiquito/eliminar |
| `Rrhh@poolsafety.es` | coordinador | Alex | **Cuenta de prueba** — sustituir por email real del coordinador |
| `Laboral@poolsafety.es` | coordinador | Óscar | **Cuenta de prueba** — sustituir por email real del coordinador |
| `ale23fbt@gmail.com` | coordinador | Alex (real) | Email real del coordinador Alex. Reset password enviado y recibido OK. |
| `carlosbiosca24@gmail.com` | socorrista | Carlos Biosca | Developer (Origen). Puesto: Petra - Piscina Municipal. Cuenta reactivada tras SQL de reactivación. |

**Otros socorristas ya en BD (creados hoy con creación masiva)**: Ezequiel, Cristian Moralanguita, Ariadna Iglesias, Chr Sarabia, Jaime Parejo, Kirbi, Álvaro Bejarano, Alba Gil Pérez, Yahia Ali. Cuentas activas pero con `activo=false` masivo si se ejecutó el SQL de bloqueo temporal ("no queremos que entren hasta probar"). Reactivar cuando toque abrir el sistema.

**Contraseñas**: solo las conoce el usuario. Nunca en repo ni docs. Se dictan verbalmente o gestor.

**Confirmación email desactivada** en Supabase Auth → Providers → Email (crítico: si se activa, cada creación de cuenta manda email fantasma "Confirm your email").

---

## 8. Hoteles reales cargados (20 del Excel del cliente)

Todos con GPS real, horario, servicios necesarios y flags de equipamiento (DESA/O₂/botiquín).

- Palma Aquarium, Sa Rapita (Club Nautic)
- Ona Luna Park
- Cala Romani, Hotel Ankaa, Arcos Playa, Petra - Piscina Municipal, HM Mar Blau
- Portomar Apartments, Carrossa Hotel & Spa
- Inturotel: Cala Esmeralda, Esmeralda Park, Sa Marina, Drago Land, Cala Azul, Esmeralda Garden
- Gavimar: La Mirada, Ariel Chico, Cala Gran
- Hotel Monsuau

---

## 9. Features completadas (piloto listo)

### Base (previo a 2026-07-28)
- ✅ Login real Supabase Auth con roles y `nombre` custom
- ✅ Auth-guard con redirección por rol + protección de páginas
- ✅ Recuperación contraseña (email + página reset.html)
- ✅ Crear usuarios desde la app
- ✅ Empleados grid conectado a BD real
- ✅ Ficha empleado con 6 pestañas (Datos, Horario, Firmas, Titulaciones, Tareas, Acciones)
- ✅ Hoteles (20 reales) con ficha completa
- ✅ Coordinación: timeline vivo de actividades + visitas GPS
- ✅ Fichaje GPS real con haversine + geocerca según radio del puesto
- ✅ Botiquín normativa Baleares (41 items × 20 puestos)
- ✅ Firma manuscrita canvas + guarda imagen PNG + GPS
- ✅ Foto perfil en Storage (visible en todos los dispositivos)
- ✅ Excel horarios parse real (SheetJS, guarda en tabla horarios)
- ✅ Titulaciones + PRL + DNI con caducidades y alertas
- ✅ PWA instalable (Android + iOS con instrucciones + Desktop)
- ✅ Tema rojo marca (theme-red permanente)
- ✅ Responsive móvil + tablet 12"

### Sesión maratón 2026-07-28 (batch enorme, ~25 commits)
- ✅ **SMTP Resend operativo** con sender `info@poolsafety.es`. Templates HTML branded pegados en Supabase.
- ✅ **Site URL Supabase Auth** corregido (era localhost → producción).
- ✅ **Confirm email OFF** en Supabase para no mandar mails fantasma al crear cuentas.
- ✅ **Auto-update PWA** (banner + reload silente al detectar nueva versión).
- ✅ **Estrategia SW network-first** + `updateViaCache: 'none'` (cambios se aplican al primer refresh).
- ✅ **PSHor**: horarios editables por hotel Y socorrista con chips L M X J V S D + reasignación bidireccional al editar servicio.
- ✅ **Rol Correturnos**: nueva columna `es_correturnos` en `empleados`. Badge amarillo en UI.
- ✅ **Miembros del equipo** (admin only) en Coordinación.
- ✅ **Toggle Disponible/Libre** para coordinadores. Socorrista filtra por disponible.
- ✅ **Enviar email invitación** al crear cuenta (checkbox ON coord/admin, OFF socorrista).
- ✅ **Creación masiva de cuentas** con textarea `rol,nombre,email`.
- ✅ **Selectores hoteles reales** en TODOS los selects (creación usuario, servicios hotel, botiquín, visitas, horarios manuales, ficha empleado). Cero mocks.
- ✅ **Selector de puesto en pestaña Datos** de ficha empleado (antes solo se podía asignar al crear).
- ✅ **Autoreparación cuenta huérfana**: si `auth.users` existe pero falta `usuarios`/`empleados`, se auto-crea al primer login con metadatos del signUp.
- ✅ **Contactar coordinador** en socorrista lee usuarios reales (Alex + Óscar, no mock "Jaume Ferrer").
- ✅ **Badge menú Documentación** lee de BD (firmas pendientes reales, no 30 fantasma).
- ✅ **GPS "Cómo llegar"** usa GPS/dirección real del puesto asignado, no Hotel Bellamar mock.
- ✅ **Puestos en vivo** admin: lee `puestos` activos reales + `fichajes` de hoy + Realtime subscription para INSERTs.
- ✅ **KPIs cabecera admin** calculados desde datos reales de `postsCache`.
- ✅ **Panel "Estado del equipo"** admin: por socorrista → último login, kit-alta firmado, fichajes del mes, botón reenviar acceso.
- ✅ **Campana notificaciones**: admin muestra nº real de alertas abiertas (BD); socorrista muestra dot solo si tiene tareas/kit-alta pendiente.
- ✅ **Tareas + notas socorrista** desde BD real (tabla `tareas` y `notas`).
- ✅ **Alertas botiquín** desde BD real (`alertas.resuelto=false`), no del mock.
- ✅ **Firmas Kit Alta** persistidas correctamente en BD (columnas faltantes añadidas + `misFirmas()` fusiona BD + local).
- ✅ **Kit Alta texto legal completo** (extraído de Word oficial del cliente): 7 subdocumentos con texto scrollable + tabla EPIs editable.
- ✅ **PDF Kit Alta** con texto legal íntegro + firma manuscrita + EPIs ajustados.
- ✅ **PDF Registro Jornada oficial** (formato Word inspección de trabajo): tabla 31 días con entrada/salida/horas ordinarias/complementarias/firma. Descarga solo admin.
- ✅ **Vista jornada socorrista simple**: 160h/40h/sem por defecto, si trabajó menos las reales, si más solo firma 160h (extras solo admin).
- ✅ **Ficha empleado admin · 3 acciones separadas**:
  - **Cortar acceso (baja)**: `activo=false` + `estado='baja'`. Login bloqueado. Reversible.
  - **Iniciar finiquito**: doble confirmación + `estado='finiquito-pendiente'`. La app socorrista bloquea TODO excepto pantalla de firma finiquito. Solo admin puede.
  - **Eliminar permanente**: doble confirmación (nombre + palabra ELIMINAR) → borra en cascada firmas/tareas/notas/alertas/fichajes/docs/horarios/titulaciones/empleado/usuario. Auth manual desde Supabase Dashboard. Solo admin.
- ✅ **Reenviar Kit Alta para firmar** (admin) — archiva firma anterior + wizard obligatorio al reentrar.
- ✅ **Subir mi documentación** (socorrista): input file con cámara nativa `capture="environment"` para hacer foto DNI/contrato + selector tipo + guarda en `documentos_subidos`.
- ✅ **Máx 20 MB** por archivo en titulaciones (antes 5 MB era muy poco para PDFs escaneados).
- ✅ **Tracking login**: `usuarios.ultimo_login` actualizado por auth-guard en cada sesión validada.
- ✅ **Bloqueo firma jornada** si no hay fichajes reales (regresivo — restaurado a lógica simple luego).
- ✅ **Eliminados mocks**: Jaume Ferrer, María Fernández, Hotel Bellamar, KPIs falsos "22 días / 98%", "3 tareas del coordinador". Todo lee de BD real o muestra placeholder vacío.

---

## 10. Pendientes / próximos pasos

### Para retomar mañana (2026-07-29 · pruebas end-to-end)
- ⏳ **Ronda de pruebas real** con Adam + Alex + Óscar + Carlos. Verificar:
  - Login limpio con cada usuario, cada uno ve su vista correcta.
  - Carlos ve su hotel Petra sin firmas fantasma. Firma Kit Alta con texto completo. Descarga PDF.
  - Sube DNI y contrato con la cámara del móvil desde la vista Docs.
  - Adam entra y ve panel "Estado del equipo" con estado real de cada socorrista.
  - Adam prueba las 3 acciones (baja, finiquito, eliminar) en un empleado de test.
  - Alex/Óscar prueban toggle Disponible/Libre y que Carlos solo ve al que está disponible.
- ⏳ **Reactivar cuentas socorristas** si están todas en `activo=false`: `update usuarios set activo=true where rol='socorrista';` cuando estéis listos.
- ⏳ **Ejecutar SQL de constraint estado empleados** (por el nuevo `finiquito-pendiente`):
  ```sql
  alter table empleados drop constraint if exists empleados_estado_check;
  alter table empleados add constraint empleados_estado_check
    check (estado in ('activo','baja','alta-pendiente','finiquito-pendiente','finiquitado','eliminado'));
  ```
- ⏳ **Borrar cuentas prueba** `Rrhh@poolsafety.es` y `Laboral@poolsafety.es` una vez creados los coordinadores reales con sus emails.

### Features aún pendientes (siguiente sesión)
- **#13 Horas del mes con editar/borrar por lápiz** (icono edición junto a cada fichaje). Ver histórico y corregir errores.
- **Notificación push al coordinador** cuando socorrista ficha entrada/salida (hoy solo se refresca la vista en 25s + realtime).
- **Firma finiquito** (implementación completa del flujo — hoy hay pantalla exclusiva bloqueante pero el botón "Ver y firmar finiquito" muestra alert placeholder).
- **Estado del equipo campana** con nº firmas nuevas del día (hoy solo alertas botiquín).

### Nice-to-have (largo plazo)
- Formulario público para hoteles nuevos que quieran contratar
- Landing en `poolsafety.es` cuando el dominio propio esté listo
- Panel dirección con facturación por hotel/mes
- Módulo titulaciones caducadas con notificación automática por email
- Firma electrónica reconocida (Signaturit/Docusign) si el cliente lo pide expresamente

---

## 11. Decisiones importantes (histórico)

- **Netlify Pro** ($19/mes): tras agotar minutos build Free del ciclo 2026-07 con las ~25 releases del día, cliente decide upgrade. Deploys ilimitados a partir de aquí.
- **Supabase vs Firebase**: Supabase por región EU (RGPD), Postgres SQL clásico, precio Free generoso.
- **Tema rojo permanente**: cliente eligió su marca corporativa (rojo #B91C1C sobre blanco).
- **Firma con canvas + jsPDF**: MVP suficiente para RGPD. Firma electrónica reconocida oficial (Signaturit) queda para futuro.
- **PDFs en Storage vs BD**: en Storage (más eficiente que base64 en columnas).
- **Confirm email OFF** en Supabase Auth: crítico para que no se manden emails fantasma al crear cuentas desde el admin.
- **Reglas de permisos claras** (2026-07-28):
  - **Admin (dueno)** — cualquier acción incluyendo baja, finiquito, eliminación total.
  - **Coordinador** — crear socorristas, editar hoteles, asignar horarios, mandar tareas. NO puede baja/finiquito/eliminar.
  - **Socorrista** — fichar, ver botiquín, firmar sus documentos, subir su documentación, contactar coordinador.
- **Jornada socorrista simple**: siempre firma 160h/40h/sem (o reales si trabajó menos). Extras solo las ve admin en PDF oficial (formato inspección de trabajo).
- **Rol Correturnos**: socorrista sin puesto fijo que cubre suplencias. Badge amarillo visible en toda la app.
- **Toggle Disponible/Libre coordinador**: solo el que esté disponible aparece en "Contactar coordinador" del socorrista.
- **Auto-reparación cuentas huérfanas**: si al crear cuenta falla el flujo entre auth.signUp y insert en usuarios/empleados, el próximo login del usuario auto-completa las filas con metadatos del signUp.
- **Netlify network-first**: SW usa `fetch → fallback cache` en lugar de `stale-while-revalidate`. Los cambios aparecen al primer refresh siempre que haya red.
- **Textos legales del Kit Alta**: copiados literalmente de los Word oficiales del cliente (`KIT ALTA TRABAJADOR.doc` + `Documentación Empleados.docx`) — no inventados, no resumidos.

---

## 12. Comandos y flujos habituales

### Desarrollo local
```bash
node local-tools/server.js         # servidor local en :8080
# Móvil misma WiFi: http://<IP-del-PC>:8080
```

### Deploy (auto)
```bash
git add -A && git commit -m "mensaje" && git push origin main
# Netlify Pro deploya en 30-60 seg
```

### Ejecutar SQL nuevo en Supabase
Supabase → SQL Editor → New query → pegar → Run

### Cache del Service Worker
Cuando añadas/modifiques un `.js` que se cachea en `sw.js`, **incrementa** el número del cache
(`const CACHE = 'poolsafety-vX'`). Cache actual: **v29**.

### Verificar sintaxis JS antes de push
```bash
node --check js/socorrista.js && node --check js/coordinador.js && node --check js/ps-pdf.js
```
Muy útil — un `SyntaxError` en un JS bloquea toda la app.

### Test SMTP (verificar que llegan emails)
Coordinación → Miembros del equipo → icono ↗ en fila de un usuario → confirma. Revisar en Resend Dashboard → Emails.

---

## 13. Cómo continuar en una nueva sesión

Al abrir un nuevo chat con Claude, dile:

> Trabajo en la app PoolSafety. Léete `context.md` en la raíz del proyecto para ponerte al día.
> Estamos en piloto real. La empresa cliente es Pool Safety Des Llevant. La app está en producción
> en poolsafety-app.netlify.app con BD en Supabase.

Claude debería leer `context.md` y `CLAUDE.md` (que apunta aquí) y entender todo el estado.

**Cuando termines cambios importantes**, actualiza este archivo en el mismo commit.
Especialmente:
- Nuevas tablas o columnas en BD
- Nuevas dependencias CDN o archivos JS
- Cambios de arquitectura
- Nuevos usuarios reales o datos del cliente
- Decisiones que otro Claude podría cuestionar sin este contexto
- Estado del piloto (features completadas / pendientes)
- Cache SW actual (`poolsafety-vX`)
