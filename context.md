# PoolSafety App · Context

> **📌 IMPORTANTE PARA CLAUDE:** Este fichero es la fuente única de verdad del proyecto.
> Cuando hagas cambios significativos (nueva feature, cambio de esquema BD, decisión de arquitectura,
> nuevo dato del cliente, credencial, cambio de dependencia), **ACTUALÍZALO en el mismo commit**.
> Es lo primero que hay que leer al retomar el proyecto en una nueva sesión.

Última actualización: 2026-07-28

---

## 1. Qué es esto

App operativa web (PWA) para **Pool Safety Des Llevant, S.L.** — empresa de socorrismo en Mallorca
con ~150 socorristas en plantilla que gestiona ~80 puestos en hoteles y piscinas de las Baleares.

Sustituye WhatsApp + Excel + papel para: fichaje con GPS, coordinación en vivo,
botiquines/DESA según normativa balear, firma digital de documentación laboral,
gestión de horarios y titulaciones (SVB, DEA, socorrismo, PRL, DNI).

**Estado:** piloto activo con 4 usuarios reales antes de rollout completo.

---

## 2. Datos del cliente

| Campo | Valor |
|---|---|
| Razón social | Pool Safety Des Llevant, S.L. |
| CIF | B75828418 |
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
| **Hosting** | poolsafety-app.netlify.app | Netlify Free. Deploy automático al push main |
| **BD + Auth** | msdjsbegqpjpshnxoilh.supabase.co | Supabase Free. Región EU-West-1 (Ireland) |
| **Emails** | Resend | DNS de `poolsafety.es` propagados en IONOS (MX + SPF + DKIM ✅). Pendiente: verificar dominio en Resend, crear API key y configurar SMTP en Supabase con sender `no-reply@poolsafety.es` |
| **PWA** | manifest.webmanifest + sw.js | Instalable Android + iOS + Desktop |
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

---

## 4. Stack técnico

- **Frontend:** Vanilla HTML/CSS/JS. NO hay build step ni framework. Se despliega directamente.
- **Supabase JS SDK v2** via CDN `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **jsPDF** via CDN `cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` — genera PDFs de firmas
- **SheetJS (XLSX)** via CDN `cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js` — parse Excel de horarios
- **Sin dependencias npm.** No hay `package.json` ni `node_modules`.
- **Servidor local:** `node local-tools/server.js` — porto 8080, para probar en móvil misma WiFi

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
│   ├── auth-guard.js              # Protección de páginas y redirección por rol
│   ├── theme-toggle.js            # Aplica tema rojo permanente
│   ├── pwa-install.js             # Modal instalación Android/iOS
│   ├── icons.js                   # SVG symbols (Lucide-style)
│   ├── data.js                    # Datos mock originales + EMPRESA + kitAltaSubdocs + firmas localStorage
│   ├── titulaciones.js            # Módulo compartido PSTit (renderizado + BD)
│   ├── ps-storage.js              # Wrapper Supabase Storage (bucket empleados-media)
│   ├── ps-pdf.js                  # Genera PDFs firmados (Kit Alta, Jornada) con jsPDF
│   ├── socorrista.js              # Lógica vista socorrista
│   └── coordinador.js             # Lógica dashboard coordinador/admin
├── sql/
│   ├── 01-schema.sql              # 15 tablas iniciales
│   ├── 02-rls.sql                 # Row Level Security por rol
│   ├── 03-seed.sql                # Empresa + hoteles + inventario normativo
│   └── README.md
├── docs-clientes/
│   ├── bienvenida-adam.{html,pdf}
│   ├── bienvenida-coordinadores.{html,pdf}
│   ├── bienvenida-socorrista.{html,pdf}
│   └── *-artifact.html            # Copias con logo en base64 (para publicar como artifact)
├── local-tools/server.js          # Servidor local para probar en móvil
└── context.md                     # ESTE ARCHIVO
```

---

## 6. Base de datos (17 tablas + Storage)

### Tablas principales
| Tabla | Propósito | Notas |
|---|---|---|
| `empresas` | Multi-tenant (hoy solo PoolSafety) | Insertada 1 fila |
| `usuarios` | Extiende auth.users con rol y empresa | Tiene columna `nombre` añadida a posteriori |
| `puestos` | Hoteles/piscinas con GPS y equipamiento | 20 hoteles reales cargados |
| `empleados` | Ficha del socorrista (usuario_id UNIQUE) | 1 real: Carlos Biosca |
| `horarios` | Asignación empleado→puesto con turno | Rellenado por Excel |
| `fichajes` | Entradas/salidas con GPS + geocerca | Guarda distancia_m y fuera_de_zona |
| `documentos_empresa` | Plantillas (kit-alta, jornada, finiquito) | 3 filas |
| `firmas_documentos` | Firmas con imagen PNG del canvas + GPS + IP | `archivo_pdf_url` para PDF descargable |
| `documentos_subidos` | Contratos, nóminas subidos por coordinador | |
| `registro_jornada` | Registro mensual (RD-ley 8/2019) | |
| `inventario_items` | Plantilla 41 items normativa Baleares | Decreto 53/1995 + 137/2008 |
| `inventario_puesto` | Stock por hotel | 20×41 = 820 filas iniciales |
| `alertas` | Auto stock-bajo + manuales socorrista | |
| `tareas` | Del coordinador al socorrista | |
| `notas` | Mensajes informativos | |
| `actividades_coordinador` | Parte diario de Alex/Óscar | Adam las ve en timeline |
| `visitas_hoteles` | Con GPS auto-captured al llegar al hotel | |
| `titulaciones_empleado` | DNI, SVB, DEA, socorrismo, PRL, contrato, nómina | Con fechas caducidad + reciclaje |

### Storage (Supabase Storage)
Bucket público: **`empleados-media`**
- `fotos/{empleado_id}.jpg` — foto de perfil
- `firmas/{firma_id}.pdf` — PDFs firmados
- `titulaciones/{empleado_id}/{...}` — DNIs, certificados

### RLS (Row Level Security)
Funciones helper: `auth_rol()`, `auth_empresa()`, `auth_es_admin()`, `auth_empleado_id()`.
Reglas base: **admin ve todo de su empresa · socorrista solo su propio empleado_id**.

---

## 7. Usuarios reales del piloto

| Email | Rol | Nombre display | Notas |
|---|---|---|---|
| `info@poolsafety.es` | dueno | Adam | Cliente. Rol UI = "Administrador" |
| `Rrhh@poolsafety.es` | coordinador | Alex | Coordinador RRHH |
| `Laboral@poolsafety.es` | coordinador | Óscar | Coordinador Laboral |
| `carlosbiosca24@gmail.com` | socorrista | Carlos Biosca | Developer (Origen Cuidado Integral). Puesto: Petra - Piscina Municipal |

**Contraseñas**: solo las conoce el usuario. Nunca en repo ni docs. Se dictan verbalmente o gestor.

**Confirmación email desactivada** en Supabase Auth para permitir crear cuentas desde la app sin verificar email.

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

- ✅ Login real Supabase Auth con roles y `nombre` custom
- ✅ Auth-guard con redirección por rol + protección de páginas
- ✅ Recuperación contraseña (email + página reset.html) — DNS Resend ya OK, pendiente solo conectar SMTP en Supabase
- ✅ Crear usuarios (admin: cualquiera / coord: solo socorristas) desde la app
- ✅ Empleados grid conectado a BD real
- ✅ Ficha empleado con 6 pestañas (Datos, Horario, Firmas, Titulaciones, Tareas, Acciones)
- ✅ Hoteles (20 reales) con ficha completa
- ✅ Coordinación: timeline vivo de actividades + visitas GPS
- ✅ Fichaje GPS real con haversine + geocerca según radio del puesto
- ✅ Botiquín normativa Baleares (41 items × 20 puestos)
- ✅ Firma manuscrita canvas + guarda imagen PNG + GPS
- ✅ **PDF descargable de firmas** (jsPDF, guardado en Storage)
- ✅ **Foto perfil en Storage** (visible en todos los dispositivos)
- ✅ **Excel horarios parse real** (SheetJS, guarda en tabla horarios)
- ✅ Titulaciones + PRL + DNI con caducidades y alertas
- ✅ Módulo Empleados / Hoteles / Coordinación / Horarios / Botiquín / Docs / Empleados / Horas
- ✅ PWA instalable (Android + iOS con instrucciones + Desktop)
- ✅ Tema rojo marca (theme-red permanente)
- ✅ Responsive móvil + tablet 12"
- ✅ Docs de bienvenida PDF (Admin + Coordinadores + Socorrista)

---

## 10. Pendientes / próximos pasos

### Bloqueantes inmediatos
- ⏳ **Resend → Supabase SMTP** (DNS de `poolsafety.es` ya OK en IONOS: MX `send` → `feedback-smtp.eu-west-1.amazonses.com`, SPF `send` → `v=spf1 include:amazonses.com ~all`, DKIM `resend._domainkey` publicado). Faltan tres pasos manuales:
  1. Resend Dashboard → Domains → `poolsafety.es` → **Verify DNS Records**.
  2. Resend → API Keys → crear key `supabase-auth` (Sending access, dominio `poolsafety.es`).
  3. Supabase → Auth → Emails → SMTP Settings: enable Custom SMTP, sender `no-reply@poolsafety.es`, host `smtp.resend.com`, port `465`, user `resend`, password = API key.
  4. Probar con reset password desde la app y confirmar que el email llega desde `no-reply@poolsafety.es` en vez de `onboarding@resend.dev`.

### Después del piloto (iteración)
- Feedback real de Adam/Alex/Óscar/Carlos durante 1-2 semanas
- Prueba fichaje GPS presencial en Petra (miércoles siguiente, Carlos)
- Ajustes de UX según feedback
- Migrar tabla `notas` y `tareas` a BD real (aún usan mock en socorrista.js)
- Import CSV masivo de los 150 socorristas cuando cliente pase el listado

### Nice-to-have
- Formulario público para hoteles nuevos que quieran contratar
- Landing en poolsafety.es cuando dominio propio esté listo
- Panel dirección con facturación por hotel/mes
- Módulo de titulaciones caducadas con notificación automática por email (Resend)

---

## 11. Decisiones importantes (histórico)

- **Netlify vs Vercel**: Vercel pide Pro ($20/mes) para hospedar repos privados de orgs. Netlify también, pero Netlify Free acepta repo público → usamos Netlify + repo público (no hay secrets ahí, RGPD OK).
- **Supabase vs Firebase**: Supabase por región EU (RGPD), Postgres SQL clásico, precio Free generoso.
- **Tema rojo permanente**: cliente eligió su marca corporativa (rojo #B91C1C sobre blanco). Aplicado con `.theme-red` en `<html>` por defecto vía `js/theme-toggle.js`.
- **Firma con canvas + jsPDF**: MVP suficiente para RGPD (firma manuscrita + timestamp + GPS + IP). Firma electrónica reconocida oficial (Signaturit/Docusign) queda para futuro si el cliente lo pide expresamente.
- **PDFs en Storage vs BD**: en Storage (más eficiente que base64 en columnas).
- **Confirmación email OFF en Supabase Auth**: para permitir que admin/coord creen cuentas desde la app y el usuario entre al momento (sin ir a Gmail).
- **`nombre` en usuarios**: no venía en el schema inicial, se añadió después con `alter table usuarios add column nombre text` + updates manuales.

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
# Netlify deploya en 30-60 seg
```

### Ejecutar SQL nuevo en Supabase
Supabase → SQL Editor → New query → pegar → Run

### Generar PDFs de bienvenida
```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
& $chrome --headless=new --disable-gpu --no-margins --print-to-pdf="out.pdf" --print-to-pdf-no-header "file:///path/to.html"
```

### Cache del Service Worker
Cuando añadas/modifiques un `.js` que se cachea en `sw.js`, **incrementa** el número del cache
(`const CACHE = 'poolsafety-vX'`) para forzar refresh en dispositivos ya instalados.

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
