# Gym System

Sistema de gestión para gimnasios con **control de acceso por QR dinámico** y **registro de asistencia en tiempo real**. Está hecho con Next.js 16, Supabase (Auth + Postgres + Realtime), Tailwind CSS v4 y componentes de shadcn/ui.

Cada alumno tiene una credencial digital con un código QR que se renueva cada pocos segundos. El personal escanea ese QR desde la cámara del celular o la computadora. El sistema valida la membresía en el servidor y registra la asistencia del día. El alumno ve el resultado al instante.

---

## Funcionalidades

### Alumno
- **Credencial digital** con nombre, número de socio y estado de la membresía.
- **QR dinámico de un solo uso.** Se renueva automáticamente antes de vencer (por defecto cada 30 segundos) y se invalida apenas se usa o cuando se genera uno nuevo.
- **Tarjeta "Hoy"**: indica si ya registró su asistencia en el día, con la hora del primer y del último ingreso. Se actualiza en tiempo real después de escanear.
- **Historial de asistencia** con resumen mensual de días asistidos e ingresos.

### Personal (staff / profesor / dueño)
- **Control de acceso**: un escáner QR con la cámara que muestra al instante si el ingreso fue **autorizado** o **rechazado**, y el motivo (membresía vencida, suspendida, pago pendiente, QR vencido, QR ya usado, etc.).
- **Registros**: consulta de ingresos con filtros por fecha, alumno y resultado.
- Los profesores solo pueden registrar y ver la asistencia de los alumnos que tienen asignados.

### Dueño (administrador)
- **Gestión de miembros**: cambiar roles (alumno, staff, profesor, dueño), crear y editar membresías (plan, estado, fechas) y asignar alumnos a profesores.
- **Configuración del gimnasio**: zona horaria, duración del QR (de 10 a 300 segundos), si se permite el ingreso con pago pendiente y los días de gracia.
- **Código de invitación** para que los alumnos se sumen al gimnasio.

---

## Roles

| Rol       | Puede                                                                 |
| --------- | --------------------------------------------------------------------- |
| `owner`   | Todo: gestión de miembros, membresías, configuración y registros.     |
| `staff`   | Escanear QR y ver los ingresos que registró.                          |
| `teacher` | Escanear QR y ver la asistencia solo de sus alumnos asignados.        |
| `student` | Ver su credencial, generar su QR y consultar su propia asistencia.    |

### ¿Cómo me convierto en administrador?
1. Creá una cuenta en `/auth/sign-up`. La cuenta queda activa al instante, sin verificación por email.
2. En la pantalla de bienvenida elegí **"Crear un gimnasio"**. Quien crea el gimnasio queda automáticamente como **dueño (`owner`)**.
3. Desde **Gestión** copiá el código de invitación y compartilo. Quien se una con ese código entra como alumno, y desde ahí podés cambiarle el rol.

---

## Seguridad y reglas de negocio

- **El token del QR nunca se guarda en texto plano.** Se genera con 32 bytes aleatorios y en la base solo se guarda su hash SHA-256.
- **Validación atómica en la base de datos** (función `validate_access_qr`): bloquea la fila del token, así que dos escaneos simultáneos del mismo QR nunca generan dos asistencias.
- **Idempotencia.** Cada escaneo lleva un `request_id`. Si la red falla y el escáner reintenta, se devuelve el mismo resultado sin duplicar el registro.
- **Row Level Security (RLS)** en todas las tablas. Cada usuario ve solo lo que su rol permite, y los cambios sensibles (roles, configuración, tokens) se hacen únicamente con funciones `security definer`.
- **La asistencia se calcula con la zona horaria del gimnasio**, no con la del servidor ni la del navegador.
- Las respuestas del escáner no exponen datos sensibles. Si el QR es inválido, no se muestra información del alumno.

### Reglas de membresía
- `active`: puede ingresar mientras la fecha de hoy esté dentro del período.
- `pending_payment`: puede ingresar solo si el gimnasio lo permite y está dentro de los días de gracia.
- `suspended` / `expired`: ingreso rechazado.

---

## Estructura del proyecto

```
app/
  api/
    access/route.ts        Valida un QR escaneado (POST)
    qr/route.ts            Emite un nuevo QR para el alumno (POST)
    auth/sign-up/route.ts  Crea cuentas del lado del servidor
  auth/                    Login, registro y callback de Supabase
  onboarding/              Crear un gimnasio o unirse con un código
  app/
    alumno/                Panel del alumno y su historial
    acceso/                Escáner de control de acceso
    registros/             Consulta de ingresos
    gestion/               Administración (solo dueño)
components/                Componentes de UI agrupados por área
hooks/                     Suscripción en tiempo real a los ingresos propios
lib/                       Clientes de Supabase, sesión, tipos y formato
supabase/migrations/       Esquema SQL, políticas RLS y funciones
scripts/                   Migraciones y pruebas end-to-end
```

### Base de datos

| Tabla              | Descripción                                                  |
| ------------------ | ------------------------------------------------------------ |
| `gyms`             | Gimnasios con su configuración y código de invitación.       |
| `profiles`         | Perfil de cada usuario: gimnasio, rol y número de socio.     |
| `memberships`      | Membresía actual de cada alumno.                             |
| `teacher_students` | Qué alumnos tiene asignados cada profesor.                   |
| `qr_tokens`        | Tokens QR emitidos (solo el hash), con vencimiento y uso.    |
| `access_events`    | Cada intento de ingreso, autorizado o rechazado, con motivo. |
| `attendance_days`  | Una fila por alumno y por día con primer y último ingreso.   |

---

## Puesta en marcha local

### Requisitos
- Node.js 20 o superior y pnpm
- Un proyecto de Supabase

### Variables de entorno
Creá un archivo `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # solo en el servidor; se usa para crear cuentas
POSTGRES_URL_NON_POOLING=       # para correr las migraciones y las pruebas
```

> `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse al navegador ni subirse al repositorio.

### Instalación

```bash
pnpm install
node --env-file=.env.local scripts/migrate.mjs   # aplica supabase/migrations
pnpm dev
```

La app queda disponible en `http://localhost:3000`.

### Pruebas
Hay una suite end-to-end que corre contra el proyecto real de Supabase. Crea usuarios temporales, prueba los escenarios principales (QR válido, vencido, reutilizado, escaneos concurrentes, reintentos, membresías, alcance de profesores, cambio de zona horaria y tiempo real) y al final borra todo lo que creó:

```bash
node --env-file=.env.local scripts/test-attendance.mjs
```

---

## Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com): Auth, Postgres, RLS y Realtime
- [Tailwind CSS v4](https://tailwindcss.com) y [shadcn/ui](https://ui.shadcn.com)
- [SWR](https://swr.vercel.app) para el manejo de datos en el cliente
- `qrcode.react` para generar los QR y un lector QR con la cámara para el escaneo
