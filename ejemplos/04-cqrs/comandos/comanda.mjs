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
