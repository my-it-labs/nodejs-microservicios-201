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
