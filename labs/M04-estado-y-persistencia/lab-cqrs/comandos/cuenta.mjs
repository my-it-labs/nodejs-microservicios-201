// Dominio del lado de escritura. No hay columna `saldo`: el saldo se
// calcula plegando los eventos de la cuenta con `aplicar`, y `decidir`
// usa ese saldo para aceptar la orden o rechazarla. `aplicar` todavía
// no conoce `DineroRetirado`.
export class Rechazo extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Solo lo que hace falta para decidir: el saldo. El titular no entra en ninguna regla.
export function aplicar(estado, evento) {
  switch (evento.tipo) {
    case 'CuentaAbierta':
      return { saldo: 0 };
    case 'DineroIngresado':
      return { saldo: estado.saldo + evento.datos.importe };
    default:
      return estado;
  }
}

// Una orden aceptada produce un evento: un hecho en pasado que ya no se discute.
export function decidir(estado, orden) {
  switch (orden.tipo) {
    case 'abrir':
      if (estado) throw new Rechazo(409, 'la cuenta ya existe');
      if (!orden.titular) throw new Rechazo(400, 'falta el titular');
      return { tipo: 'CuentaAbierta', datos: { titular: orden.titular } };
    case 'ingresar':
      if (!estado) throw new Rechazo(404, 'no existe');
      if (!(orden.importe > 0)) throw new Rechazo(400, 'importe no valido');
      return { tipo: 'DineroIngresado', datos: { importe: orden.importe } };
    case 'retirar':
      if (!estado) throw new Rechazo(404, 'no existe');
      if (!(orden.importe > 0)) throw new Rechazo(400, 'importe no valido');
      if (orden.importe > estado.saldo) throw new Rechazo(409, 'saldo insuficiente');
      return { tipo: 'DineroRetirado', datos: { importe: orden.importe } };
    default:
      throw new Rechazo(400, 'orden desconocida');
  }
}
