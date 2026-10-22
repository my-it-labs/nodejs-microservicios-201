# PostgreSQL y Sequelize

[← Mongoose](00-mongoose.md) · [Siguiente página →](02-redis.md)

PostgreSQL guarda filas, y Sequelize es el acceso desde Node: el modelo declara las columnas, `sync` crea la tabla en este ejemplo de un solo nodo y `upsert` escribe la fila. En un servicio que ya tiene migraciones, `sync` no es el mecanismo de producción. Aquí deja la tabla lista para ver la fila sin un paso anterior. La butaca `A1` tiene una columna `fila` con valor `A`. El proceso de lectura no llama a `sync` ni a `upsert`. Si imprime `{ id: 'A1', fila: 'A' }`, el dato salió de la tabla.

La base del ejemplo se llama `sala`, el usuario es `postgres` y la clave es `lab`.

## Ejemplo

La demostración está en [PostgreSQL y Sequelize](../../ejemplos/04-sequelize/README.md). Las dos órdenes imprimen la misma butaca. La segunda no la tiene en memoria.

No hay laboratorio de Sequelize. El de CQRS usa PostgreSQL como almacén de eventos: solo se añaden filas, y ninguna consulta las lee.
