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

### Módulos de gestión (implementados en las migraciones y pantallas del dueño, profesor y alumno)
- **Planes y membresías** con renovación (desde el vencimiento o desde hoy), historial de períodos y saldo pendiente.
- **Pagos**: el alumno sube el comprobante a un almacenamiento privado (solo enlaces firmados de 2 minutos); el dueño aprueba o rechaza, y puede anular un pago aprobado sin borrarlo. Un pago se aplica una sola vez.
- **Rutinas y ejercicios** versionados, **entrenamientos** registrados sobre una copia de la rutina y **medidas corporales** privadas (las ve el alumno y sus profesores asignados; el dueño queda excluido a propósito).
- **Notificaciones** dentro de la app, idempotentes (`dedupe_key`).
- **Auditoría** de cambios en las tablas principales.
- **Elegir plan (alumno)**: en `/app/alumno/planes` el alumno ve los planes activos del dueño y elige uno. Queda como *pendiente de pago* por el precio del plan. No puede reemplazar una membresía vigente, ni borrar un saldo o un pago parcial, ni cambiar de plan con un comprobante en revisión (lo valida la base de datos en `student_select_plan`). La membresía empieza a contar desde el día en que se paga por completo.
- **Pago con Mercado Pago** (Checkout Pro, por API): el monto sale de la base de datos, nunca del navegador. La membresía se acredita **solo cuando el webhook confirma** el pago: el servidor consulta el pago a Mercado Pago con el Access Token, verifica referencia, monto y moneda, y lo aplica de forma atómica e idempotente. Los reembolsos y contracargos anulan el pago y devuelven el saldo. Si llega un pago que ya no corresponde (plan cambiado o pago duplicado), se avisa al dueño en vez de acreditarlo.
- **Pago por transferencia**: el alumno sube el comprobante y el dueño lo aprueba o rechaza; recién ahí se acredita.
- **Roles**: el dueño busca por nombre, email o número de socio y cambia el rol (alumno, profesor, personal o dueño) con confirmación. No puede cambiar su propio rol.
- **Reportes** (`/app/reportes`, solo dueño): ingresos confirmados por medio, pagos por estado, asistencia por día, alumnos con más asistencias, altas. Exportación a CSV (`pagos`, `asistencias`, `alumnos`) y vista imprimible.
- **Invitaciones** (Configuración → *Invitar persona*): crea la cuenta dentro del gimnasio del dueño y devuelve un enlace de un solo uso. **El sistema no envía el email**; el dueño comparte el enlace.
- **Recuperación de contraseña** por email (`/auth/forgot-password`). Requiere que Supabase tenga SMTP configurado.
- **Avisos de vencimiento programados**: `/api/cron/notices`, ejecutado una vez al día por Vercel Cron (`vercel.json`).

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
    members/invite/        Invitaciones (solo dueño)
    export/[kind]/         Exportación CSV (solo dueño)
    cron/notices/          Avisos de vencimiento (Vercel Cron)
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
CRON_SECRET=                    # secreto del cron de avisos (cadena larga y aleatoria)
MP_ACCESS_TOKEN=                # Mercado Pago (opcional), solo servidor
MP_WEBHOOK_SECRET=              # firma de webhooks de Mercado Pago (recomendada)
NEXT_PUBLIC_SITE_URL=           # URL pública, p. ej. https://tu-gimnasio.vercel.app
```

Hay una plantilla en `.env.example`. `SUPABASE_URL` es opcional: si falta se usa `NEXT_PUBLIC_SUPABASE_URL`.

> `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse al navegador ni subirse al repositorio.

### Instalación

```bash
pnpm install
node --env-file=.env.local scripts/migrate.mjs   # aplica supabase/migrations
pnpm dev
```

La app queda disponible en `http://localhost:3000`.

### Pruebas

```bash
pnpm test        # pruebas unitarias (Node, sin base de datos): CSV, reportes y totales
pnpm typecheck   # tsc --noEmit
pnpm lint
pnpm db:migrate  # aplica supabase/migrations al proyecto de Supabase
pnpm test:e2e    # asistencia end-to-end contra el proyecto real de Supabase
```

La suite e2e (`scripts/test-attendance.mjs`) crea usuarios temporales, prueba QR válido, vencido, reutilizado, escaneos concurrentes, reintentos, membresías, alcance de profesores, zona horaria y tiempo real, y al final borra lo que creó. **Usá un proyecto de Supabase de desarrollo, no el de producción.**

> Cobertura actual: la asistencia por QR tiene pruebas e2e. Pagos, rutinas, permisos entre gimnasios, invitaciones y recuperación de contraseña **no tienen pruebas automáticas todavía**: verificalos a mano antes de usar datos reales (ver la lista de abajo).

---

## Mercado Pago

1. Creá una aplicación en *Mercado Pago Developers* → Tus integraciones, con Checkout Pro.
2. Copiá el **Access Token** a `MP_ACCESS_TOKEN` (usá el de prueba para probar y el de producción para cobrar de verdad).
3. En Webhooks configurá la URL `https://TU-DOMINIO/api/mercadopago/webhook` con el evento **Pagos** y copiá la clave secreta a `MP_WEBHOOK_SECRET`.
4. Definí `NEXT_PUBLIC_SITE_URL` con la URL pública. Mercado Pago no puede avisar a `localhost`: en local el pago se completa pero la membresía no se acredita sola.
5. La moneda del gimnasio (Configuración) debe coincidir con la de la cuenta de Mercado Pago (por ejemplo `ARS`).

Qué sigue sin estar verificado: el flujo completo contra Mercado Pago (preferencia, pago de prueba, webhook real) **no se ejecutó**; solo están probadas las funciones auxiliares (firma, monto, armado de la preferencia).

---

## Ejecución local (sin Vercel)

1. Creá un proyecto de Supabase y ejecutá `pnpm db:migrate` con `POSTGRES_URL_NON_POOLING`.
2. En Supabase → Authentication → URL Configuration: poné la URL de producción como *Site URL* y agregá `https://TU-DOMINIO/auth/callback` y `https://TU-DOMINIO/auth/confirm` a las *Redirect URLs*.
3. Configurá SMTP propio en Supabase (el SMTP por defecto tiene un límite muy bajo) para la recuperación de contraseña.
4. Ejecutá `pnpm dev` y usá la aplicación en `http://localhost:3000`.
5. Ejecutá `pnpm cron:notices` una vez por día desde el Programador de tareas de Windows o un cron externo. El comando llama a `/api/cron/notices` con `CRON_SECRET`.
6. Para Mercado Pago en local, usá una URL HTTPS pública mediante un túnel y colocala en `NEXT_PUBLIC_SITE_URL`; Mercado Pago no puede llamar a `localhost`.
7. Activá copias de seguridad en Supabase (plan Pro: backups diarios y PITR).

El archivo `vercel.json` es opcional y solo configura el cron si más adelante se usa Vercel. La aplicación, las APIs y Supabase no dependen de Vercel.

### Revocar el acceso de una persona
Configuración → Miembros → desactivar la cuenta (`account_status = inactive`). Las pantallas la redirigen a "cuenta inactiva" y no puede registrar ni consultar nada. Para eliminar la sesión por completo, borrá o bloqueá el usuario desde Supabase → Authentication.

### Antes de usar datos reales
- [ ] Probar en dos gimnasios distintos que uno no ve datos del otro (alumnos, pagos, comprobantes, rutinas).
- [ ] Probar el flujo completo de un pago: subir comprobante, aprobar, rechazar, anular, pago parcial.
- [ ] Probar el lector QR en celulares reales (permiso de cámara y HTTPS).
- [ ] Probar invitación, recuperación de contraseña y cron en el entorno desplegado.
- [ ] Revisar las políticas del bucket `receipts` en Supabase Storage.

---

## Limitaciones conocidas
- No se envían emails de invitación ni de avisos: las notificaciones son solo dentro de la app.
- El limitador de registros (`/api/auth/sign-up`) es por instancia y en memoria: sirve como freno básico, no como protección fuerte.
- La PWA es instalable (manifest e íconos) pero no tiene service worker: no funciona sin conexión.
- Un alumno con membresía vigente no puede elegir otro plan hasta que venza; las renovaciones anticipadas las hace el dueño.
- Los reportes leen hasta 20.000 filas por consulta y limitan el rango a 366 días.

---

## Stack

- [Next.js 16](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com): Auth, Postgres, RLS y Realtime
- [Tailwind CSS v4](https://tailwindcss.com) y [shadcn/ui](https://ui.shadcn.com)
- [SWR](https://swr.vercel.app) para el manejo de datos en el cliente
- `qrcode.react` para generar los QR y un lector QR con la cámara para el escaneo
