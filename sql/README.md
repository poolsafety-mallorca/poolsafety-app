# SQL Setup PoolSafety

## Cómo aplicar

En Supabase → **SQL Editor** → **New query** → pegar y ejecutar en este orden:

1. **`01-schema.sql`** — crea todas las tablas
2. **`02-rls.sql`** — activa la seguridad por rol
3. **`03-seed.sql`** — mete PoolSafety, 5 puestos de muestra y el inventario normativo Baleares

## Tablas creadas

| Tabla | Uso |
|---|---|
| `empresas` | Datos de la empresa cliente |
| `usuarios` | Cuentas de acceso (linked a auth.users) con rol |
| `puestos` | Hoteles/piscinas con GPS y turno por defecto |
| `empleados` | Ficha completa: nombre, DNI, SS, foto, contrato, estado |
| `horarios` | Asignaciones empleado → puesto con hora y días |
| `fichajes` | Entradas/salidas con GPS y validación de geocerca |
| `documentos_empresa` | Plantillas: Kit Alta, jornada mensual, finiquito |
| `firmas_documentos` | Firmas del empleado (con dispositivo, IP, JSON de aceptaciones) |
| `documentos_subidos` | Contratos, nóminas, PRL que sube el coordinador |
| `registro_jornada` | Un registro por empleado/mes con horas ordinarias y firma |
| `inventario_items` | Plantilla global (41 items Decreto 53/1995 + 137/2008) |
| `inventario_puesto` | Stock por puesto con caducidades y carga de bala |
| `alertas` | Automáticas (stock bajo) + manuales (socorrista) |
| `tareas` | Del coordinador al socorrista |
| `notas` | Mensajes informativos |

## Seguridad (RLS)

- **Dueño** y **Coordinador**: ven y editan todo lo de SU empresa
- **Socorrista**: solo sus propios datos + puestos + plantilla de inventario
- **Empleado** puede subir su foto y actualizar sus datos personales
