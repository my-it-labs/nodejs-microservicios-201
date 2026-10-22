# M04 — Estado y persistencia

[← M03](../M03-comunicacion-entre-servicios/README.md) · [Siguiente página →](00-mongoose.md)

Cada dato tiene un sitio, y ese sitio no tiene por qué ser el mismo para escribir y para leer. La lectura caliente puede salir de una copia, y la consulta puede mirar otro modelo que la escritura.

| Dato | Motor | Página |
|------|-------|--------|
| Libro | MongoDB, con Mongoose | 00 |
| Butaca | PostgreSQL, con Sequelize | 01 |
| Ficha, segunda lectura | Redis delante de Mongo | 02, con laboratorio |
| Comanda | Eventos en PostgreSQL al escribir, vistas en Redis al leer, en dos servicios | 03, con laboratorio. Ahí se ven el event sourcing y la consistencia eventual |

Redis aquí es caché o lado de lectura. No es de donde se recupera el dato si se vacía la memoria: en CQRS, las vistas se rehacen con los eventos.

## Páginas

| # | Página | Después de explicarla |
|---|--------|------------------------|
| 00 | [Mongoose](00-mongoose.md) | [Ejemplo: libros](../../ejemplos/04-mongoose/README.md) |
| 01 | [Sequelize](01-sequelize.md) | [Ejemplo: butacas](../../ejemplos/04-sequelize/README.md) |
| 02 | [Redis](02-redis.md) | [Ejemplo: fichas](../../ejemplos/04-redis-cache/README.md) · [laboratorio](lab-cache/README.md) |
| 03 | [CQRS](03-cqrs.md) | [Ejemplo: comandas](../../ejemplos/04-cqrs/README.md) · [laboratorio](lab-cqrs/README.md) |

→ Empieza por **[Mongoose](00-mongoose.md)**.
