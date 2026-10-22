// Servicio de comandos. Acepta órdenes y no responde consultas: no hay
// ningún GET. Cada orden lee la historia de la cuenta, la pliega para
// saber su saldo, decide y añade un evento al almacén.
import express from 'express';
import { leer, anadir } from './almacen.mjs';
import { aplicar, decidir, Rechazo } from './cuenta.mjs';
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
  // La respuesta no trae el saldo: eso es una consulta y la contesta el otro servicio.
  res.status(201).json({ id, version, evento: evento.tipo });
}

app.post('/cuentas', (req, res) => {
  const { id, titular } = req.body ?? {};
  return ejecutar(id, { tipo: 'abrir', titular }, res);
});

app.post('/cuentas/:id/ingresos', (req, res) => {
  return ejecutar(req.params.id, { tipo: 'ingresar', importe: req.body?.importe }, res);
});

app.post('/cuentas/:id/retiradas', (req, res) => {
  return ejecutar(req.params.id, { tipo: 'retirar', importe: req.body?.importe }, res);
});

app.use((err, req, res, next) => {
  if (!(err instanceof Rechazo)) return next(err);
  res.status(err.status).json({ error: err.message });
});

app.listen(3001, () => console.log('comandos en 3001'));
publicar();
