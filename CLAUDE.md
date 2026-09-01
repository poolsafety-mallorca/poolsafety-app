# CLAUDE.md — Instrucciones automáticas

## 📖 Antes de nada, lee `context.md`

Es la fuente única de verdad del proyecto. Contiene todo el estado actual:
- Qué es PoolSafety y quién es el cliente
- Stack (Vanilla JS + Supabase + Netlify)
- Credenciales y URLs
- Estructura de archivos
- 17 tablas de BD + Storage bucket
- Features completadas y pendientes
- Decisiones importantes ya tomadas
- Comandos habituales

## 📝 Regla de oro

**Cuando hagas cambios significativos, ACTUALIZA `context.md` en el mismo commit.**

Especialmente cuando:
- Añadas/modifiques tablas o columnas en Supabase
- Añadas nuevos archivos JS o dependencias CDN
- Cambies arquitectura (auth, storage, deploy…)
- Añadas nuevos datos del cliente o usuarios reales
- Cambies estado del piloto (feature completada, bloqueada, etc.)
- Tomes una decisión que otro Claude podría cuestionar sin saber el porqué

## 🚀 Despliegue: fusiona tú, no le pidas permiso

**Adam (el cliente) autorizó expresamente el 2026-08-31 que fusiones y despliegues tú
mismo, sin pedirle confirmación cada vez.** No es técnico: dejarle PRs abiertos
esperando su visto bueno le bloqueaba el trabajo sin que él supiera que estaba
bloqueado (llegó a preguntar "¿a qué te refieres con PR?").

Flujo por defecto, de principio a fin y sin parar a preguntar:
1. Rama → cambios → **comprobaciones reales** (no "debería funcionar")
2. Push → PR con la explicación en castellano llano
3. **Fusionar tú mismo el PR** (Netlify despliega solo en 30-60 s)
4. Contarle en el chat qué ha salido y qué tiene que hacer él (avisar al equipo de
   que cierren y reabran la app si cambia `sw.js`, ejecutar SQL si lo hay, etc.)

Sigue haciendo PR aunque lo vayas a fusionar tú: deja el historial y la explicación
por escrito, que es lo que hace que otro Claude (o él dentro de tres meses) entienda
por qué se hizo algo.

**Sí párate a preguntar ANTES de fusionar, sólo en estos casos:**
- Puede **destruir o corromper datos reales** (borrados, migraciones no idempotentes,
  cambios de RLS que puedan dejar a alguien sin acceso)
- Afecta a **documentos ya firmados** por un trabajador o a cómo se calculan las horas
  de un registro horario ya cerrado
- Toca **dinero, nóminas o datos personales** de forma no reversible
- Puede **romper la app a media jornada** para gente que está fichando ahora mismo
- La petición admite lecturas muy distintas y equivocarse cuesta rehacer trabajo suyo

Fuera de eso: hazlo y cuéntaselo después.

## 🗣️ Cómo explicarle las cosas a Adam

No es programador. Nada de jerga sin traducir: ni "PR", ni "rama", ni "merge", ni
"deploy" a secas. Si hay que usar el término, explícalo la primera vez. Lo que él
necesita saber siempre es: **qué falla, por qué, qué has hecho y qué tiene que hacer
él ahora**. Ya está.

## 🎯 Prioridades del proyecto

1. **YA NO ES UN PILOTO DE 4 PERSONAS.** A 2026-08-31 el panel de Documentación cuenta
   **51 empleados activos** (sin baja ni eliminados). Adam sigue siendo el admin y Alex y
   Óscar los coordinadores, pero la plantilla real es de decenas de socorristas repartidos
   por los hoteles. Tenlo presente al estimar volúmenes: cualquier consulta que traiga
   datos "de todo el equipo" se multiplica por 51, no por 4. Ahí se fue la cuota de Egress.
2. **Sin romper producción**: la app está en poolsafety-app.netlify.app con datos reales
3. **Cliente quiere lanzar y cobrar** — evitar sobre-ingeniería, priorizar cosas útiles
4. **Cumplimiento normativa Baleares** (Decreto 53/1995 botiquín, 137/2008 DESA, RGPD, RD-ley 8/2019 registro horario)

## ⚠️ Cuidado con

- `sw.js` (Service Worker): al añadir/modificar archivos JS cacheados, incrementar `const CACHE = 'poolsafety-vX'` para forzar refresh en dispositivos ya instalados
- Cambios de esquema de BD: siempre `alter table ... add column if not exists` para ser idempotente
- Passwords y service_role key de Supabase: NUNCA en el repo (es público)
- Cambios en RLS: pueden romper acceso silenciosamente — probar con cuenta socorrista tras cada cambio
