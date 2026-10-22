# CQRS con event sourcing

El concepto está en [CQRS y event sourcing](../../labs/M04-estado-y-persistencia/03-cqrs.md).

## Dónde poner el foco

Hay dos servicios y ninguno hace el trabajo del otro. **Comandos** (3001) solo tiene POST: abre comandas, añade platos y las cierra. **Consultas** (3002) solo tiene GET y nunca abre PostgreSQL.

Comandos no guarda la comanda: guarda lo que le pasó, como filas de la tabla `eventos`, y no las actualiza ni las borra nunca. Para decidir si acepta un plato, lee la historia de esa comanda y la pliega con `aplicar`. Si el último evento es `ComandaCerrada`, responde 409. Un publicador copia cada evento nuevo al stream `comandas` de Redis.

Consultas lee ese stream y pliega los mismos eventos con `proyectar`, pero sale otra forma: la mesa, los platos por su nombre y la lista de la cocina. Guarda en su propio Redis las vistas y la posición del stream hasta la que llegó. Si se vacía ese Redis, vuelve a leer el stream desde el principio y las vistas salen iguales.

```text
POST ──► comandos ──insert──► PostgreSQL `eventos` ──publicador──► stream `comandas` (6379)
                                                                         │
GET  ◄── consultas ◄── vistas `comanda:*`, `cocina`, `posicion` (6380) ◄─┘ proyector
```

## Archivos

| Archivo | Servicio | Papel |
|---------|----------|-------|
| `comandos/server.mjs` | comandos | Rutas POST: lee la historia, decide y añade un evento |
| `comandos/comanda.mjs` | comandos | `aplicar` pliega eventos en estado y `decidir` acepta o rechaza la orden |
| `comandos/almacen.mjs` | comandos | Tabla `eventos` en PostgreSQL, solo con insert, y con `unique (agregado, version)` |
| `comandos/publicador.mjs` | comandos | Copia los eventos nuevos al stream `comandas` |
| `consultas/server.mjs` | consultas | Rutas GET sobre las vistas |
| `consultas/proyector.mjs` | consultas | Lee el stream desde `posicion` y escribe las vistas |
| `consultas/proyeccion.mjs` | consultas | `proyectar` pliega eventos en la vista que se enseña |
| `docker-compose.yml` | — | PostgreSQL `ms-cqrs-eventos` en 5432, Redis bus `ms-cqrs-bus` en 6379 y Redis de vistas `ms-cqrs-vistas` en 6380 |
| `package.json` | — | Scripts `comandos` y `consultas`; dependencias `express`, `ioredis` y `pg` |

## El código

### `comandos/comanda.mjs`

```js
// Dominio del lado de escritura. No hay tabla con el estado actual de la
// comanda: el estado se calcula plegando sus eventos con `aplicar`, y
// `decidir` usa ese estado para aceptar la orden o rechazarla.
export class Rechazo extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Solo lo que hace falta para decidir. La mesa y el nombre de los platos
// no entran en ninguna regla, así que este estado no los guarda.
export function aplicar(estado, evento) {
  switch (evento.tipo) {
    case 'ComandaAbierta':
      return { abierta: true, platos: 0 };
    case 'PlatoAnadido':
      return { ...estado, platos: estado.platos + 1 };
    case 'ComandaCerrada':
      return { ...estado, abierta: false };
    default:
      return estado;
  }
}

// Una orden aceptada produce un evento: un hecho en pasado que ya no se discute.
export function decidir(estado, orden) {
  switch (orden.tipo) {
    case 'abrir':
      if (estado) throw new Rechazo(409, 'la comanda ya existe');
      if (!orden.mesa) throw new Rechazo(400, 'falta la mesa');
      return { tipo: 'ComandaAbierta', datos: { mesa: orden.mesa } };
    case 'anadir':
      if (!estado) throw new Rechazo(404, 'no existe');
      if (!estado.abierta) throw new Rechazo(409, 'comanda cerrada');
      if (!orden.plato) throw new Rechazo(400, 'falta el plato');
      return { tipo: 'PlatoAnadido', datos: { plato: orden.plato } };
    case 'cerrar':
      if (!estado) throw new Rechazo(404, 'no existe');
      if (!estado.abierta) throw new Rechazo(409, 'comanda cerrada');
      if (estado.platos === 0) throw new Rechazo(409, 'comanda sin platos');
      return { tipo: 'ComandaCerrada', datos: {} };
    default:
      throw new Rechazo(400, 'orden desconocida');
  }
}
```

### `comandos/almacen.mjs`

```js
// Almacén de eventos del servicio de comandos. Solo se añade: no hay
// update ni delete. `unique (agregado, version)` es el control de
// concurrencia: si dos órdenes leen la versión 2 a la vez, las dos
// intentan escribir la 3 y la segunda falla.
import pg from 'pg';
import { Rechazo } from './comanda.mjs';

const pool = new pg.Pool({ connectionString: 'postgres://postgres:lab@127.0.0.1:5432/comandas' });

await pool.query(`create table if not exists eventos (
  secuencia bigserial primary key,
  agregado  text not null,
  version   int not null,
  tipo      text not null,
  datos     jsonb not null,
  fecha     timestamptz not null default now(),
  unique (agregado, version)
)`);

// La historia de una comanda, en el orden en que pasó.
export async function leer(agregado) {
  const { rows } = await pool.query(
    'select tipo, datos from eventos where agregado = $1 order by version',
    [agregado],
  );
  return rows;
}

export async function anadir(agregado, version, evento) {
  try {
    await pool.query(
      'insert into eventos (agregado, version, tipo, datos) values ($1, $2, $3, $4)',
      [agregado, version, evento.tipo, evento.datos],
    );
  } catch (err) {
    if (err.code === '23505') throw new Rechazo(409, 'conflicto de version');
    throw err;
  }
}

// Todos los eventos, de cualquier comanda, a partir de una secuencia. Lo usa el publicador.
export async function desde(secuencia, limite = 100) {
  const { rows } = await pool.query(
    'select * from eventos where secuencia > $1 order by secuencia limit $2',
    [secuencia, limite],
  );
  return rows;
}
```

### `comandos/publicador.mjs`

```js
// Lleva al bus lo que ya está en el almacén. La tabla es la verdad: si
// Redis está caído, el insert ya se hizo y la orden respondió 201; este
// bucle lo vuelve a intentar y publica en cuanto el bus vuelva.
// El id de cada entrada del stream es la secuencia del evento (`7-0`):
// el stream sigue el orden de la tabla y la última entrada dice hasta
// dónde se ha publicado, sin guardar nada en memoria.
import Redis from 'ioredis';
import { desde } from './almacen.mjs';

const bus = new Redis('redis://127.0.0.1:6379');
const STREAM = 'comandas';

export async function publicar() {
  for (;;) {
    try {
      const [ultima] = await bus.xrevrange(STREAM, '+', '-', 'COUNT', 1);
      const publicada = ultima ? Number(ultima[0].split('-')[0]) : 0;
      for (const fila of await desde(publicada)) {
        const evento = {
          secuencia: Number(fila.secuencia),
          agregado: fila.agregado,
          version: fila.version,
          tipo: fila.tipo,
          datos: fila.datos,
          fecha: fila.fecha,
        };
        await bus.xadd(STREAM, `${evento.secuencia}-0`, 'evento', JSON.stringify(evento));
        console.log('publicado', evento.secuencia, evento.tipo, evento.agregado);
      }
    } catch (err) {
      console.error('publicador:', err.message);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}
```

### `comandos/server.mjs`

```js
// Servicio de comandos. Acepta órdenes y no responde consultas: no hay
// ningún GET. Cada orden lee la historia de la comanda, la pliega para
// saber en qué estado está, decide y añade un evento al almacén.
import express from 'express';
import { leer, anadir } from './almacen.mjs';
import { aplicar, decidir, Rechazo } from './comanda.mjs';
import { publicar } from './publicador.mjs';

const app = express();
app.use(express.json());

async function ejecutar(id, orden, res) {
  if (!id) throw new Rechazo(400, 'falta el id');
  const historia = await leer(id);
  const estado = historia.reduce(aplicar, null);
  const evento = decidir(estado, orden);
  // La versión que se espera escribir. Si otro llegó antes, el insert falla con 409.
  const version = historia.length + 1;
  await anadir(id, version, evento);
  // La respuesta no trae la comanda: eso es una consulta y la contesta el otro servicio.
  res.status(201).json({ id, version, evento: evento.tipo });
}

app.post('/comandas', (req, res) => {
  const { id, mesa } = req.body ?? {};
  return ejecutar(id, { tipo: 'abrir', mesa }, res);
});

app.post('/comandas/:id/platos', (req, res) => {
  return ejecutar(req.params.id, { tipo: 'anadir', plato: req.body?.plato }, res);
});

app.post('/comandas/:id/cerrar', (req, res) => {
  return ejecutar(req.params.id, { tipo: 'cerrar' }, res);
});

app.use((err, req, res, next) => {
  if (!(err instanceof Rechazo)) return next(err);
  res.status(err.status).json({ error: err.message });
});

app.listen(3001, () => console.log('comandos en 3001'));
publicar();
```

### `consultas/proyeccion.mjs`

```js
// El lado de lectura también se construye con eventos. La vista de una
// comanda es el pliegue de su historia, igual que en el servicio de
// comandos, pero guarda otra cosa: lo que quiere ver quien consulta
// (la mesa, los platos por su nombre), no lo que hace falta para decidir.
export function proyectar(vista, evento) {
  switch (evento.tipo) {
    case 'ComandaAbierta':
      return { id: evento.agregado, mesa: evento.datos.mesa, platos: [], estado: 'abierta' };
    case 'PlatoAnadido':
      return { ...vista, platos: [...vista.platos, evento.datos.plato] };
    case 'ComandaCerrada':
      return { ...vista, estado: 'cerrada' };
    default:
      return vista;
  }
}
```

### `consultas/proyector.mjs`

```js
// Lee el stream del bus desde la última posición que guardó y aplica
// cada evento a las vistas. La posición vive en el mismo Redis que las
// vistas y se escribe en la misma transacción que ellas: tras un corte,
// el proyector sigue justo después del último evento aplicado. Si ese
// Redis está vacío no hay posición, empieza en `0` y rehace las vistas
// con toda la historia.
import Redis from 'ioredis';
import { proyectar } from './proyeccion.mjs';

// El hueco está escrito a propósito, para poder ver el 404 antes de la
// copia: cada evento se aplica 1,5 s después de su `fecha`. Uno viejo,
// al reconstruir, ya pasó ese plazo y se aplica sin esperar.
const RETRASO_MS = 1500;
const STREAM = 'comandas';

const bus = new Redis('redis://127.0.0.1:6379');
export const vistas = new Redis('redis://127.0.0.1:6380');

export async function proyectarSiempre() {
  let posicion = (await vistas.get('posicion')) ?? '0';
  console.log('proyector desde', posicion);
  for (;;) {
    // BLOCK 0: espera sin límite a que haya algo después de `posicion`.
    const [[, entradas]] = await bus.xread('BLOCK', 0, 'STREAMS', STREAM, posicion);
    for (const [id, campos] of entradas) {
      const evento = JSON.parse(campos[1]);
      const espera = Date.parse(evento.fecha) + RETRASO_MS - Date.now();
      if (espera > 0) await new Promise((r) => setTimeout(r, espera));
      const clave = `comanda:${evento.agregado}`;
      const vista = proyectar(JSON.parse(await vistas.get(clave)), evento);
      const tx = vistas.multi();
      if (vista) {
        tx.set(clave, JSON.stringify({ ...vista, version: evento.version }));
        // Segunda vista, para la cocina: el conjunto de comandas abiertas.
        if (vista.estado === 'abierta') tx.sadd('cocina', evento.agregado);
        else tx.srem('cocina', evento.agregado);
      }
      await tx.set('posicion', id).exec();
      posicion = id;
      console.log('proyectado', id, evento.tipo, evento.agregado);
    }
  }
}
```

### `consultas/server.mjs`

```js
// Servicio de consultas. No conoce PostgreSQL ni acepta órdenes: solo
// GET. Lo que responde sale de sus propias vistas, en el Redis del
// puerto 6380, que el proyector construye con los eventos del bus.
import express from 'express';
import { vistas, proyectarSiempre } from './proyector.mjs';

const app = express();

app.get('/comandas/:id', async (req, res) => {
  const crudo = await vistas.get(`comanda:${req.params.id}`);
  if (!crudo) {
    res.status(404).json({ error: 'aun no proyectado' });
    return;
  }
  res.json(JSON.parse(crudo));
});

// La cocina no pregunta por una comanda: quiere todas las abiertas de una vez.
app.get('/cocina', async (req, res) => {
  const ids = (await vistas.smembers('cocina')).sort();
  const crudas = ids.length ? await vistas.mget(ids.map((id) => `comanda:${id}`)) : [];
  res.json(crudas.map((c) => JSON.parse(c)));
});

app.listen(3002, () => console.log('consultas en 3002'));
proyectarSiempre();
```

## Qué hacer

Libera 3001, 3002, 5432, 6379 y 6380 si otro ejemplo los usa (`scripts/limpiar-entorno.sh` para los contenedores, y Ctrl+C en el `npm start` que siga abierto).

```bash
cd ejemplos/04-cqrs
docker compose up -d
until docker exec ms-cqrs-eventos pg_isready -U postgres; do sleep 2; done
npm install
npm run comandos
```

En otra terminal, desde la misma carpeta:

```bash
npm run consultas
```

En una tercera terminal, abre la comanda y pregunta enseguida, y otra vez pasados dos segundos:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/comandas \
  -H 'content-type: application/json' -d '{"id":"C-1","mesa":4}'
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/comandas/C-1
sleep 2
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/comandas/C-1
```

Añade dos platos, cierra la comanda e intenta añadir otro plato:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/comandas/C-1/platos \
  -H 'content-type: application/json' -d '{"plato":"sopa"}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/comandas/C-1/platos \
  -H 'content-type: application/json' -d '{"plato":"pan"}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/comandas/C-1/cerrar
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/comandas/C-1/platos \
  -H 'content-type: application/json' -d '{"plato":"flan"}'
sleep 2
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/comandas/C-1
```

Mira el mismo historial en el almacén y en el bus:

```bash
docker exec ms-cqrs-eventos psql -U postgres -d comandas \
  -c 'select secuencia, agregado, version, tipo, datos from eventos;'
docker exec ms-cqrs-bus redis-cli xrange comandas - +
```

Por último, tira las vistas y reconstrúyelas. Para consultas con Ctrl+C y después:

```bash
docker exec ms-cqrs-vistas redis-cli flushall
npm run consultas
```

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/comandas/C-1
```

Para empezar de cero, `docker compose down` y otra vez `docker compose up -d`. Sin eso, `C-1` ya existe y abrirla otra vez responde 409.

## Qué observar

El POST responde 201 con `version` `1` y no trae la comanda: contestar qué hay es cosa de consultas. El GET inmediato responde 404 `aun no proyectado`. Pasados dos segundos responde 200 con `mesa` `4` y `platos` vacío.

Tras los dos platos y el cierre, el plato `flan` recibe 409 `comanda cerrada`. Comandos no tiene ninguna columna `estado` que mirar: lo sabe porque el último de los cuatro eventos es `ComandaCerrada`. La vista enseña `platos` `["sopa","pan"]`, `estado` `cerrada` y `version` `4`.

La tabla y el stream tienen las mismas cuatro filas en el mismo orden. La entrada `1-0` del stream es la fila con secuencia `1`.

Al rearrancar consultas sobre un Redis vacío, la terminal imprime `proyector desde 0` y una línea `proyectado` por evento, sin esperar el segundo y medio, porque esos eventos ya tienen más de 1,5 s. El GET devuelve lo mismo que antes del `flushall`.

## Qué validar

- 201, 404 `aun no proyectado` y 200, en ese orden.
- 409 `comanda cerrada` en el plato que llega después de `cerrar`.
- `select` con cuatro eventos de `C-1`, versiones de 1 a 4, y ningún `update`.
- Después del `flushall` y el rearranque, la misma vista con `version` `4`.

![404 y luego 200](../img/04-cqrs.png)
