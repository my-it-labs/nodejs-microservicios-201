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
