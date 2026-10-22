# Laboratorio: el saldo sale de los eventos

El ejemplo de CQRS separa comandas en dos servicios. Aquí son cuentas, con el mismo reparto. **Comandos** (3001) abre cuentas y apunta ingresos y retiradas como eventos en PostgreSQL. **Consultas** (3002) lee esos eventos del stream `cuentas` y enseña el saldo desde su propio Redis (6380). Ninguno de los dos tiene una columna `saldo`: cada uno lo calcula plegando eventos.

Los dos pliegues están a medias. En comandos, `aplicar` no conoce `DineroRetirado`, así que una cuenta con 100 deja retirar 80 dos veces. En consultas, `proyectar` solo conoce `CuentaAbierta`, así que el saldo siempre es 0. Arreglas primero el lado de escritura. Después el de lectura. Por último tiras las vistas y las reconstruyes con toda la historia.

Los JSON de cada orden y de cada vista están en [contrato.json](contrato.json).

### Objetivo

409 `saldo insuficiente` en la retirada que deja la cuenta en negativo. La vista de `C-1` con el mismo saldo que la suma de sus eventos en PostgreSQL, y con todos sus movimientos, también los de antes de arreglar la proyección.

### Punto de partida

```bash
bash scripts/limpiar-entorno.sh
cd labs/M04-estado-y-persistencia/lab-cqrs
docker compose up -d
until docker exec ms-lab-eventos pg_isready -U postgres; do sleep 2; done
npm install
npm run comandos
```

En otra terminal, desde la misma carpeta:

```bash
npm run consultas
```

En una tercera, abre la cuenta y pregunta por ella enseguida, y otra vez pasados dos segundos:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas \
  -H 'content-type: application/json' -d '{"id":"C-1","titular":"Ana"}'
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/cuentas/C-1
sleep 2
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/cuentas/C-1
```

201 con `version` `1`, 404 `aun no proyectado` y 200 con `saldo` `0`. El hueco entre la orden y la vista es la consistencia eventual.

Ingresa 100 y retira 80 dos veces:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/ingresos \
  -H 'content-type: application/json' -d '{"importe":100}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/retiradas \
  -H 'content-type: application/json' -d '{"importe":80}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/retiradas \
  -H 'content-type: application/json' -d '{"importe":80}'
sleep 2
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/cuentas/C-1
docker exec ms-lab-eventos psql -U postgres -d cuentas -c 'select version, tipo, datos from eventos;'
```

Las tres órdenes responden 201, con versiones de 2 a 4. La vista sigue en `saldo` `0` y `movimientos` vacío. El `select` enseña los cuatro eventos: la cuenta ha sacado 160 de 100.

Al guardar un fichero, el servicio que lo importa se recarga solo. No hace falta Ctrl+C. Los eventos siguen en PostgreSQL, las vistas y su `posicion` siguen en Redis.

Las mismas peticiones están en `peticiones.http`. Ábrelo y pulsa Send Request encima de la que quieras (extensión REST Client).

### 1 — El estado del comando es el pliegue de sus eventos

**Acción:** en `comandos/cuenta.mjs`, dentro de `aplicar`, añade el caso que falta antes de `default`.

```js
    // Sin este caso, una retirada no restaba y `decidir` veía siempre el saldo de los ingresos.
    case 'DineroRetirado':
      return { saldo: estado.saldo - evento.datos.importe };
```

Guarda. Retira 10, ingresa 100 y retira 50:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/retiradas \
  -H 'content-type: application/json' -d '{"importe":10}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/ingresos \
  -H 'content-type: application/json' -d '{"importe":100}'
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/retiradas \
  -H 'content-type: application/json' -d '{"importe":50}'
```

**Por qué:** no hay ninguna fila con el saldo que corregir. Cada orden vuelve a leer la historia y la pliega con el `aplicar` de ahora, así que el arreglo vale también para los eventos que ya estaban: 100 − 80 − 80 da −60 y no deja sacar 10. Lo que no cambia es la historia. La segunda retirada de 80 sigue en la tabla, porque un almacén de eventos no se edita. El descubierto se compensa con otro evento, el ingreso de 100.

**Resultado esperado:** 409 `saldo insuficiente`, 201 con `version` `5`, y otra vez 409 `saldo insuficiente`, porque −60 + 100 deja 40.

### 2 — La vista también se pliega

**Acción:** en `consultas/proyeccion.mjs`, dentro de `proyectar`, añade los dos casos antes de `default`.

```js
    // La vista guarda más que el comando: además del saldo, cada movimiento con su signo.
    case 'DineroIngresado':
      return {
        ...vista,
        saldo: vista.saldo + evento.datos.importe,
        movimientos: [...vista.movimientos, evento.datos.importe],
      };
    case 'DineroRetirado':
      return {
        ...vista,
        saldo: vista.saldo - evento.datos.importe,
        movimientos: [...vista.movimientos, -evento.datos.importe],
      };
```

Guarda. En la terminal de consultas sale `proyector desde 5-0`. Ingresa 10 y pregunta:

```bash
curl -s -w '\n%{http_code}\n' -X POST http://127.0.0.1:3001/cuentas/C-1/ingresos \
  -H 'content-type: application/json' -d '{"importe":10}'
sleep 2
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/cuentas/C-1
```

**Por qué:** el proyector sigue desde la `posicion` que guardó en Redis. Los cinco eventos anteriores ya pasaron por la versión vieja de `proyectar`, que los dejó sin tocar la vista. Solo el ingreso de 10 llega a la nueva. Arreglar una proyección no arregla lo que ya proyectó.

**Resultado esperado:** 201 con `version` `6`, y 200 con `saldo` `10`, `movimientos` `[10]` y `version` `6`. El saldo de verdad es 50.

### 3 — Reconstruir la vista desde el principio

**Acción:** en la terminal de consultas, Ctrl+C. Vacía su Redis y arráncalo de nuevo.

```bash
docker exec ms-lab-vistas redis-cli flushall
npm run consultas
```

En la tercera terminal:

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:3002/cuentas/C-1
docker exec ms-lab-eventos psql -U postgres -d cuentas -c "
  select sum(case tipo when 'DineroIngresado' then (datos->>'importe')::int
                       when 'DineroRetirado' then -(datos->>'importe')::int
                       else 0 end) as saldo
  from eventos where agregado = 'C-1';"
```

**Por qué:** sin `posicion`, el proyector empieza en `0` y vuelve a leer el stream entero con el `proyectar` de ahora. La vista es una consecuencia de los eventos, no un dato propio: se puede tirar sin perder nada. Esos eventos ya tienen más de un segundo y medio, así que se aplican sin esperar.

**Resultado esperado:** en la terminal de consultas, `proyector desde 0` y seis líneas `proyectado`. El GET responde 200 con `saldo` `50`, `movimientos` `[100,-80,-80,100,10]` y `version` `6`. El `select` también da 50.

## Así se ve

409 `saldo insuficiente` en el paso 1, `saldo` `10` en el paso 2 y `saldo` `50` con los cinco movimientos tras reconstruir.

![resultado del laboratorio](resultado.png)

## Comprueba tu entendimiento

**Consultas caído no para los comandos**
Para consultas con Ctrl+C. Retira 50, que es todo el saldo. Arranca consultas de nuevo y, pasados dos segundos, pregunta.
→ La retirada responde 201 con `version` `7`, porque comandos no depende del lado de lectura. Al arrancar sale `proyector desde 6-0` y una sola línea `proyectado 7-0`. El GET da `saldo` `0`.

**La vista no tiene la última palabra**
Con la vista ya en `saldo` `0`, retira 1.
→ 409 `saldo insuficiente`. Comandos no pregunta a consultas: decide con su propio pliegue de los eventos.

## Reto

### 1 — Una vista nueva sobre la historia vieja

Añade `GET /cuentas` en consultas, con todas las cuentas ordenadas de más a menos saldo: `[{ "id": "C-2", "saldo": 30 }, ...]`. Abre `C-2` con un ingreso de 30 y comprueba la lista. Después haz que aparezca también `C-1`, que no ha vuelto a recibir eventos, sin tocar el servicio de comandos.

<details>
<summary>Ver solución</summary>

En `consultas/proyector.mjs`, cada vez que se escribe una vista, apunta también su saldo en un conjunto ordenado:

```js
      if (vista) {
        tx.set(clave, JSON.stringify({ ...vista, version: evento.version }));
        tx.zadd('saldos', vista.saldo, evento.agregado);
      }
```

En `consultas/server.mjs`, antes de `app.listen`:

```js
// Otra vista sobre los mismos eventos: todas las cuentas, de más a menos saldo.
app.get('/cuentas', async (req, res) => {
  const plano = await vistas.zrevrange('saldos', 0, -1, 'WITHSCORES');
  const lista = [];
  for (let i = 0; i < plano.length; i += 2) {
    lista.push({ id: plano[i], saldo: Number(plano[i + 1]) });
  }
  res.json(lista);
});
```

Guarda y abre `C-2`:

```bash
curl -s -X POST http://127.0.0.1:3001/cuentas \
  -H 'content-type: application/json' -d '{"id":"C-2","titular":"Luis"}'
curl -s -X POST http://127.0.0.1:3001/cuentas/C-2/ingresos \
  -H 'content-type: application/json' -d '{"importe":30}'
sleep 2
curl -s http://127.0.0.1:3002/cuentas
```

Solo sale `C-2`: el conjunto `saldos` empezó a llenarse al guardar. Para que salga `C-1`, reconstruye como en el paso 3 (Ctrl+C en consultas, `flushall`, `npm run consultas`). La lista pasa a ser `C-2` con 30 y `C-1` con 0. Una vista nueva sale de la historia que ya estaba guardada.

</details>

## Errores frecuentes

| Síntoma | Causa probable | Cómo arreglarlo |
|---------|----------------|-----------------|
| Abrir `C-1` responde 409 `la cuenta ya existe` | Quedan eventos de un intento anterior | `docker compose down` y `docker compose up -d`, o usa otro id |
| El paso 1 sigue aceptando la retirada de 10 | `aplicar` no tiene el caso o comandos no se recargó | Mira que la terminal de comandos imprima `Restarting` al guardar |
| El GET se queda en 404 pasados dos segundos | Consultas no está arrancado o el proyector no llega al bus | Mira `proyector desde` en su terminal y que `ms-lab-bus` esté arriba |
| Tras el paso 3 el saldo sigue en 10 | Se vació otro Redis o consultas no se rearrancó | `flushall` en `ms-lab-vistas` (6380), no en `ms-lab-bus`, y después `npm run consultas` |
