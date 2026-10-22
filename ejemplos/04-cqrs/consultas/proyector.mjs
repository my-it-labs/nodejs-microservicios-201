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
