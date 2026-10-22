// El lado de lectura también se construye con eventos. La vista de una
// cuenta es el pliegue de su historia, igual que en el servicio de
// comandos, pero guarda lo que quiere ver quien consulta: el titular y
// la lista de movimientos además del saldo. Por ahora solo conoce
// `CuentaAbierta`: el resto de eventos pasan sin cambiar la vista.
export function proyectar(vista, evento) {
  switch (evento.tipo) {
    case 'CuentaAbierta':
      return { id: evento.agregado, titular: evento.datos.titular, saldo: 0, movimientos: [] };
    default:
      return vista;
  }
}
