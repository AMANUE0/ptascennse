# Arquitectura de CraftPanel

## Entrada y navegación

- `app/page.tsx`: página pública y entrada de la aplicación.
- `app/auth/page.tsx`: inicio de sesión, registro y recuperación del enlace.
- `app/auth/callback/route.ts`: recibe el callback de Supabase y redirige al destino validado.
- `app/auth/reset/page.tsx`: establece una contraseña nueva después de validar la sesión de recuperación.
- `app/panel/page.tsx`: composición de la experiencia del workspace y del gestor de un servidor seleccionado.
- `app/panel/notificaciones/page.tsx`: lista y marca notificaciones del usuario.
- `app/panel/soporte/page.tsx`: creación y consulta de tickets de soporte.
- `app/planes/page.tsx`: selección del plan y checkout.
- `app/planes/resultado/page.tsx`: consulta del resultado y estado de una orden.
- `app/usuarios/page.tsx`: administración de usuarios para perfiles autorizados.
- `app/admin/page.tsx`: operaciones administrativas y métricas globales.

## Componentes y presentación

- `components/ui.tsx`: primitivas visuales compartidas como estados, tarjetas y métricas.
- `app/globals.css`: tokens de color, tipografía, layout, estados y responsive.
- `lib/minecraft-console.ts`: conversión segura de colores Minecraft y secuencias ANSI a HTML renderizable.
- `lib/panel-types.ts`: contrato compartido de los servidores que consume la UI.
- `lib/panel-access.ts`: guardias de permisos para evitar acciones imposibles desde la interfaz.

## Dominio y seguridad

- `lib/server-manager.ts`: persistencia local, descarga de JARs, procesos Java, consola, métricas y rutas seguras de archivos.
- `lib/backup-manager.ts`: creación, listado y descarga de backups dentro del directorio real del servidor.
- `lib/network-manager.ts`: persistencia y validación de redes Velocity.
- `lib/permissions.ts`: catálogo y normalización de permisos por servidor.
- `lib/server-permissions.ts`: autenticación, propiedad, membresías y respuestas 401/403/404.
- `lib/server-auth.ts`: lectura segura del usuario actual desde la sesión SSR de Supabase.
- `lib/admin-auth.ts`: única comprobación compartida para privilegios administrativos.
- `lib/supabase.ts`: cliente Supabase del navegador y configuración pública.
- `lib/supabase-admin.ts`: cliente de servicio exclusivo para rutas de servidor.
- `lib/payments.ts`: selección de modo de pago y disponibilidad de Mercado Pago.
- `lib/plans.ts`: catálogo de planes comerciales.
- `lib/checkout-draft.ts`: persistencia temporal del checkout en el navegador.
- `lib/server-access.ts`: operaciones de acceso relacionadas con servidores.

## API

- `app/api/servers/route.ts`: lista servidores visibles y evita que el cliente cree servidores sin compra.
- `app/api/servers/[id]/route.ts`: lectura, ciclo de vida, comandos y eliminación de un servidor.
- `app/api/servers/[id]/files/route.ts`: listado, lectura, escritura, subida y borrado de archivos.
- `app/api/servers/[id]/metrics/route.ts`: métricas y salida reciente.
- `app/api/servers/[id]/status/route.ts`: estado resumido con autorización.
- `app/api/servers/[id]/config/route.ts`: configuración de ejecución y `server.properties`.
- `app/api/servers/[id]/network/route.ts`: configuración de proxies Velocity.
- `app/api/servers/[id]/backups/route.ts`: listado y creación de backups.
- `app/api/servers/[id]/backups/[name]/route.ts`: descarga validada de un backup.
- `app/api/servers/[id]/members/route.ts`: miembros y permisos del servidor.
- `app/api/resources/[id]/subusers/`: compatibilidad para administrar subusuarios.
- `app/api/catalog/versions/route.ts`: catálogo remoto de versiones compatibles.
- `app/api/orders/route.ts`: creación y consulta de órdenes propias.
- `app/api/payments/mercadopago/webhook/route.ts`: confirmación idempotente y provisionamiento posterior al pago.
- `app/api/notifications/route.ts`: lectura y marcado de notificaciones.
- `app/api/tickets/route.ts`: tickets propios y operaciones de soporte.
- `app/api/networks/`: gestión administrativa de redes globales.
- `app/api/admin/`: endpoints exclusivos del panel administrativo.

## Datos y ejecución

- `data/servers.json`: registros locales de servidores.
- `data/networks.json`: redes Velocity locales.
- `managed-servers/`: directorios de JARs, mundos, configuraciones, logs y backups.
- `supabase/schema.sql`: tablas, índices, RLS y catálogo de permisos.
- `middleware.ts`: protección de rutas, sesión SSR y redirecciones.
- `tsconfig.json`: compilación estricta y alias `@/*`.
- `package.json`: scripts y dependencias del proyecto.

## Regla de evolución

Las rutas API validan identidad y permisos antes de mutar datos. Los componentes solo reflejan esos permisos; nunca son la única barrera. La lógica pura debe vivir en `lib/`, la composición de pantalla en `app/` y las primitivas reutilizables en `components/`.