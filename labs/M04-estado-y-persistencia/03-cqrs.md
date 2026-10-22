# CQRS y event sourcing

[← Redis](02-redis.md) · [Siguiente página →](../M05-seguridad-y-autenticacion/00-jwt.md)

CQRS separa las órdenes de las preguntas. Una orden, como «añade sopa a la comanda C-1», cambia algo y puede ser rechazada. Una pregunta, como «qué lleva la comanda C-1», solo lee. Aquí cada lado es un servicio propio, con su puerto y su almacén. **Comandos** solo tiene POST y no contesta a ninguna pregunta. **Consultas** solo tiene GET y no conoce la base de datos de comandos.

Separarlos tiene sentido porque cada lado necesita una forma distinta del dato. Para decidir si entra otro plato, comandos solo necesita saber si la comanda está abierta. La cocina quiere ver todas las abiertas con sus platos por nombre. Con un solo modelo, uno de los dos sale perdiendo.

## Event sourcing

Comandos no guarda la comanda. Guarda lo que le pasó: `ComandaAbierta`, `PlatoAnadido`, `PlatoAnadido`, `ComandaCerrada`. Cada uno es una fila en la tabla `eventos` de PostgreSQL, con su `agregado` y su `version`, y la tabla solo crece: no hay `update` ni `delete`.

El estado se calcula. Ante cada orden, comandos lee la historia de esa comanda y la pliega con `aplicar`, un `reduce` que empieza en `null` y pasa evento a evento. Con ese estado, `decidir` acepta la orden y devuelve un evento nuevo, o la rechaza con 409. Si dos órdenes leen la versión 3 a la vez, las dos intentan escribir la 4. `unique (agregado, version)` deja pasar solo a la primera.

Lo que se gana es la historia completa. Un error en `aplicar` se arregla y el estado sale bien al momento, porque no hay ninguna columna que corregir. Lo que no se puede es borrar lo que pasó. Un evento equivocado se compensa con otro.

## El lado de lectura también va por eventos

Un publicador copia cada evento nuevo de la tabla al stream `comandas` de Redis, con la secuencia de la tabla como id. Consultas lee ese stream y pliega los mismos eventos con `proyectar`, pero sale otra forma: la mesa, los platos por su nombre y el conjunto `cocina` con las comandas abiertas. Esas vistas viven en su propio Redis, junto con la `posicion` del stream hasta la que llegó.

Las vistas no son un dato propio. Si se vacía ese Redis, consultas empieza en `0`, lee la historia entera y las vistas salen iguales. Una vista nueva, o una proyección corregida, se rellena igual: tirar y reconstruir.

## Consistencia eventual

Entre el 201 de la orden y la vista hay un hueco. Aquí está escrito en el código: cada evento se proyecta 1,5 segundos después de su `fecha`. En ese hueco el evento ya está en la tabla y el GET responde 404 `aun no proyectado`. Pasado el plazo, la vista lo alcanza.

El sistema no promete que la lectura vea la escritura al instante. Promete que la verá. Por eso comandos nunca pregunta a consultas antes de decidir. La respuesta del POST trae la `version` escrita, y la vista enseña la `version` hasta la que llegó. Quien necesite saber si ya ve su cambio compara las dos.

Si consultas se cae, comandos sigue aceptando órdenes. Al volver, consultas continúa desde su `posicion`. Si se cae el bus, los eventos siguen en la tabla y el publicador los copia cuando vuelve.

## Ejemplo

La demostración está en [CQRS](../../ejemplos/04-cqrs/README.md). El POST responde 201 y el GET inmediato 404. Dos segundos después el GET responde 200. Con la comanda cerrada, el plato siguiente recibe 409 aunque no haya ninguna columna `estado`. Tras vaciar las vistas, consultas las rehace desde el stream.

## Laboratorio

[Cuentas](lab-cqrs/README.md). Los dos pliegues están a medias. El de comandos no resta las retiradas, así que deja sacar 160 de 100. El de consultas no conoce los ingresos ni las retiradas, así que el saldo siempre es 0. Arreglas los dos y después reconstruyes la vista para que recoja también los movimientos de antes del arreglo.
