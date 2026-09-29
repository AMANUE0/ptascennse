# Compra, equipo y Network

## Iniciar el panel

Usar `npm run dev` durante desarrollo. En producción: `npm run build` y después `npm start`.
Ambos comandos de inicio ejecutan `server.cjs`, que sirve Next.js y WebSockets en el mismo puerto.
Si hay un proxy HTTP delante, debe reenviar Upgrade/Connection para `/ws/panel`.
El gestor de procesos requiere un único proceso Node persistente; no usar workers múltiples ni hosting serverless.

## Compra simulada

`PAYMENT_MODE=simulation` crea el servidor al confirmar y registra la orden como pagada/lista sin contactar Mercado Pago.
Se sigue necesitando Supabase correctamente configurado y su esquema existente, además de acceso al catálogo y a la descarga del software Minecraft.
La pantalla indica que no hay cobro y permite abrir el panel tras completar la compra.
Solo `PAYMENT_MODE=mercadopago` activa el flujo real anterior.

## Equipo

El catálogo de permisos se muestra localmente, antes de cargar los miembros.
Los perfiles Administrador, Manager, Operador y Observador pueden personalizarse; también se pueden agregar o quitar todos los permisos.
Los permisos se aplican al invitar y las modificaciones existentes deben guardarse.
Los colaboradores no pueden conceder permisos que no tienen ni modificar al propietario o su propio acceso.
El filtro de acceso reconoce membresías activas y servicios comprados, además del acceso administrativo y las invitaciones existentes.

## Estado compartido

El WebSocket solo admite lectura y exige una sesión válida del mismo origen.
Cada cliente recibe su lista autorizada de servidores, estados y acciones pendientes.
Hay reconexión progresiva y comprobación periódica de sesión/membresías; las operaciones publican cambios inmediatamente.
Los controles se bloquean durante operaciones simultáneas y se informa el estado de arranque hasta que Minecraft emite su mensaje de disponibilidad.

## Configuración automática de Network

Detener primero el proxy y sus destinos. Seleccionar el proxy exacto en el panel, conectar los servidores y guardar.
Se validan todos los destinos y permisos antes de escribir. Se configura `velocity.toml`, la clave compartida, `server.properties`, `spigot.yml` y los ajustes de Paper (actuales o antiguos).
Los destinos locales escuchan en 127.0.0.1 para que los jugadores entren por el proxy.
Los archivos existentes conservan ajustes ajenos a la Network; el serializador TOML puede cambiar su formato y comentarios.
Si falla una escritura se restaura la operación. Al desconectar un destino se restauran sus archivos anteriores a la primera incorporación; tenerlo en cuenta si luego se editaron manualmente esos mismos archivos.
Las copias de restauración se guardan fuera de los archivos del servidor, en `data/network-state` o en `CRAFTPANEL_DATA_DIR/network-state`.

Paper usa Modern o Legacy según la versión. Fabric y Forge requieren el mod de forwarding compatible previamente instalado; si falta, toda la operación se detiene antes de cambiar archivos.
No se instalan JARs adicionales automáticamente. Los modpacks pueden requerir ajustes propios que no se verifican mediante estos tests.

Referencias de configuración: [PaperMC](https://docs.papermc.io/velocity/player-information-forwarding/), [FabricProxy-Lite](https://github.com/OKTW-Network/FabricProxy-Lite), [Proxy Compatible Forge](https://github.com/adde0109/Proxy-Compatible-Forge).

## Verificación

`npm run lint`, `npm test` y `npm run build`.
Las pruebas de regresión usan directorios temporales y sustitutos de Supabase/procesos. Las de WebSocket abren dos clientes reales contra un servidor HTTP de prueba, con autenticación simulada.
No crean compras reales, cuentas, invitaciones ni procesos Java. Para una prueba de integración completa se necesitan cuentas de prueba en Supabase y servidores Minecraft de prueba.
