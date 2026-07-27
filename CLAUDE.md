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

## 🎯 Prioridades del proyecto

1. **Piloto real en marcha** con 4 usuarios (Adam admin, Alex + Óscar coordinadores, Carlos socorrista)
2. **Sin romper producción**: la app está en poolsafety-app.netlify.app con datos reales
3. **Cliente quiere lanzar y cobrar** — evitar sobre-ingeniería, priorizar cosas útiles
4. **Cumplimiento normativa Baleares** (Decreto 53/1995 botiquín, 137/2008 DESA, RGPD, RD-ley 8/2019 registro horario)

## ⚠️ Cuidado con

- `sw.js` (Service Worker): al añadir/modificar archivos JS cacheados, incrementar `const CACHE = 'poolsafety-vX'` para forzar refresh en dispositivos ya instalados
- Cambios de esquema de BD: siempre `alter table ... add column if not exists` para ser idempotente
- Passwords y service_role key de Supabase: NUNCA en el repo (es público)
- Cambios en RLS: pueden romper acceso silenciosamente — probar con cuenta socorrista tras cada cambio
