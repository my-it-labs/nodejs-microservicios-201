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
