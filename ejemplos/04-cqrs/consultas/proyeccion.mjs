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
