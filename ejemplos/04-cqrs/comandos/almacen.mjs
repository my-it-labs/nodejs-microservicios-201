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
