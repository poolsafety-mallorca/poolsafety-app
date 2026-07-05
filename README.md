# PoolSafety · Prototipo v0.2

Prototipo navegable de la app operativa de **PoolSafety Socorrismo** (Mallorca):
fichaje con GPS, control de horas, coordinación de puestos y gestión del botiquín.

> Es un **mockup navegable con datos simulados**. Sirve para presentar la propuesta
> visual y el flujo. No hay backend, GPS real ni base de datos.

---

## Cómo probarlo en el móvil (RECOMENDADO)

1. Abrir una **PowerShell** o **CMD** en la carpeta `app poolsafety`.
2. Ejecutar:
   ```
   node server.js
   ```
3. El servidor imprimirá la URL. En tu configuración es:

   **En tu móvil (misma WiFi):** `http://192.168.1.47:8080`

4. Abrir esa URL en el navegador del teléfono (Chrome o Safari).
   Para instalarla como icono en el escritorio del móvil:
   - iPhone (Safari): botón compartir → *Añadir a pantalla de inicio*
   - Android (Chrome): menú (⋮) → *Añadir a pantalla de inicio*

   Aparece como una app real, sin barra de navegador. Perfecta para la demo.

Cuando termines: `Ctrl+C` en la terminal para parar el servidor.

---

## Cómo probarlo en el ordenador (rápido, sin servidor)

Doble clic en **`index.html`** → se abre en Chrome/Edge.
Para simular vista de móvil: `F12` → icono de móvil → iPhone 14 Pro.

---

## Roles

| Rol         | Qué ve                                                                                                                             |
|-------------|------------------------------------------------------------------------------------------------------------------------------------|
| Socorrista  | Fichaje con GPS, notas del coordinador, tareas del día, botiquín y reporte de material que falta, perfil y horas del mes.          |
| Coordinador | Dashboard con estado en vivo de 80 puestos, KPIs, filtros, alertas de botiquín, asignación de tareas, tabla de horas.              |
| Dirección   | El mismo dashboard (se puede ampliar con facturación y rentabilidad por cliente cuando pases a producción).                        |

---

## Estructura

```
app poolsafety/
├── index.html            ← Splash + selección de rol
├── socorrista.html       ← App del socorrista (móvil)
├── coordinador.html      ← Panel del coordinador / dueño
├── server.js             ← Servidor local para móvil
├── css/styles.css        ← Sistema visual (paleta PoolSafety)
├── js/
│   ├── icons.js          ← Librería de iconos SVG (Lucide-style)
│   ├── data.js           ← Datos simulados (150 socorristas, 30 puestos…)
│   ├── socorrista.js
│   └── coordinador.js
├── assets/logo-blanco.png
└── README.md
```

---

## Marca

Colores extraídos del universo PoolSafety (azul mar profundo · aqua piscina):

- `#0A1E3F` Azul mar profundo (base, cabeceras)
- `#0F2C5F` Océano
- `#0EA5E9` Azul principal (CTAs)
- `#22D3EE` Cyan piscina
- `#67E8F9` Laguna (acentos)
- `#10B981` Éxito (verde)
- `#F59E0B` Aviso (ámbar)
- `#EF4444` Alerta (rojo)

Tipografía: **Inter** + **Inter Tight** (para números y titulares).
Iconos: **Lucide** (SVG stroke, no emojis).

---

## Guión para la demo con el cliente

1. **Abre `index.html`** o la URL en el móvil. Enseña el splash: marca en azul profundo, tres roles claros.
2. Pulsa **Soy socorrista**.
   - Enseña la tarjeta de fichaje con GPS ("Comprobando ubicación…" al pulsar).
   - Baja a los KPIs mensuales: horas normales, extras, días, puntualidad.
   - Muestra el mapa del puesto con radio de tolerancia.
3. Ve a **Tareas** → notas del coordinador y checklist.
4. Ve a **Botiquín** → reporta falta de material → toast confirma envío al coordinador.
5. Vuelve al inicio, cierra sesión.
6. Entra como **Coordinador**.
   - KPIs con tendencia (sparkline).
   - Filtros de puestos por estado.
   - Pulsa un puesto en rojo → modal con detalle GPS + acción "enviar tarea".
   - Enseña las **alertas de botiquín** en la barra lateral.
   - Baja a la tabla de horas del mes por socorrista con filtro de horas extra.
7. Cierra con la propuesta: pasar de este mockup a app real en **~8 semanas** con backend y GPS auténtico.

---

## Próximos pasos (cuando el cliente diga que sí)

1. **PWA + Supabase** como stack de producción (funciona en iOS y Android sin app store, GPS real, alertas push).
2. **Geocerca por puesto** con radio configurable (30–60m).
3. **Módulo de partes diarios en PDF** al cierre del turno.
4. **Export mensual de horas** para la gestoría (formato compatible con nómina).
5. **Módulo de titulaciones** (SVB, DEA, socorrismo acuático) con caducidades y avisos.
6. **Panel dirección** con rentabilidad por cliente/puesto.

---

## Cambios en v0.2

- Rediseño completo del sistema visual: tipografía Inter, iconos SVG reales (Lucide), paleta marítima refinada.
- Nueva tabbar flotante con efecto vidrio.
- Cards con sombras suaves y gradientes marítimos.
- Mapa SVG simulado en detalle de puesto (con radio de tolerancia animado).
- Sparklines en KPIs del dashboard.
- Servidor Node incluido para probar en móvil sin configurar nada.
