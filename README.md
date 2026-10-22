# Microservicios con Node.js

[Siguiente página →](labs/M01-node-en-microservicios/00-io-no-bloqueante.md)

## Objetivo general

Al finalizar el curso, el alumno desarrolla microservicios con Node.js y los deja en condiciones de publicarse, comunicarse, persistir su estado, identificar a quien llama, desplegarse en contenedores y observarse en ejecución.

## Enfoque

El microservicio se trata como un proceso con una responsabilidad, desplegable por separado. El recorrido va del runtime de Node ante la red al API, a la comunicación entre servicios, al dato, a la identidad, al contenedor y a la señal de salud. Cada tema se cierra con un servicio que se ejecuta y con el criterio para explicar qué está ocurriendo en esa pieza.

## Dirigido a

Desarrolladores backend que ya construyen servicios HTTP y van a escribir y operar microservicios en Node.js: publicarlos, comunicarlos, persistir su estado y dejarlos en ejecución.

## Conocimientos previos

JavaScript actual (módulos, promesas, `async`/`await`), HTTP (métodos, códigos de estado y JSON) y soltura con la terminal de Linux. Haber usado Docker en alguna ocasión es suficiente para empezar. Kubernetes, gRPC y los brokers de mensajes se estudian en el curso. El flujo OAuth se realiza contra un proveedor local que implementa el mismo contrato que Google, Facebook y GitHub, de modo que no hace falta una cuenta en esos servicios.

## Objetivos específicos

- Desarrollar microservicios con Node.js y distinguir cuándo el bucle de eventos sostiene un API de red y cuándo un cálculo intensivo pide otro runtime.
- Diseñar APIs con rutas, validación, códigos HTTP y middleware.
- Comunicar servicios mediante eventos en el proceso, colas, gRPC, WebSockets, descubrimiento y un punto único de entrada.
- Persistir el dato en MongoDB o PostgreSQL, mantener una copia caliente en Redis y separar la escritura de la lectura.
- Identificar al llamante con un rol, recorrer un authorization code y cifrar una clave, un campo y el canal.
- Empaquetar el servicio en una imagen, levantarlo con varios contenedores y desplegarlo con más de una réplica.
- Aplicar monitorización y seguridad operativa: una métrica, el recorrido de una petición y un log que se puede buscar.

## Temario

- **M01 — Node.js en microservicios.** Sin laboratorio.
  - [I/O no bloqueante](labs/M01-node-en-microservicios/00-io-no-bloqueante.md)
  - [CPU, y Node frente a Java, Python y Go](labs/M01-node-en-microservicios/01-cpu-y-otros-runtimes.md)
- **M02 — APIs REST con Express**
  - [Rutas HTTP](labs/M02-apis-rest-express/00-rutas-http.md)
  - [Joi y errores](labs/M02-apis-rest-express/01-joi-y-errores.md)
  - [Middleware](labs/M02-apis-rest-express/02-middleware.md)
  - [Laboratorio: incidencias](labs/M02-apis-rest-express/lab-incidencias/README.md)
- **M03 — Comunicación, descubrimiento y entrada**
  - [EventEmitter](labs/M03-comunicacion-entre-servicios/00-event-emitter.md)
  - [RabbitMQ](labs/M03-comunicacion-entre-servicios/01-rabbitmq.md)
  - [Kafka](labs/M03-comunicacion-entre-servicios/02-kafka.md)
  - [gRPC](labs/M03-comunicacion-entre-servicios/03-grpc.md)
  - [WebSockets](labs/M03-comunicacion-entre-servicios/04-websockets.md)
  - [Consul](labs/M03-comunicacion-entre-servicios/05-consul.md)
  - [Gateway](labs/M03-comunicacion-entre-servicios/06-gateway.md)
  - [Proxy inverso](labs/M03-comunicacion-entre-servicios/07-proxy-inverso.md)
  - [Gateway con HAProxy](labs/M03-comunicacion-entre-servicios/08-gateway-haproxy.md)
- **M04 — Estado y persistencia**
  - [Mongoose](labs/M04-estado-y-persistencia/00-mongoose.md)
  - [Sequelize](labs/M04-estado-y-persistencia/01-sequelize.md)
  - [Redis](labs/M04-estado-y-persistencia/02-redis.md)
  - [CQRS y event sourcing](labs/M04-estado-y-persistencia/03-cqrs.md)
- **M05 — Seguridad**
  - [JWT](labs/M05-seguridad-y-autenticacion/00-jwt.md)
  - [OAuth y Passport](labs/M05-seguridad-y-autenticacion/01-oauth.md)
  - [Cifrado y TLS](labs/M05-seguridad-y-autenticacion/02-cifrado-y-tls.md)
- **M06 — Docker y Kubernetes**
  - [Dockerfile](labs/M06-docker-y-kubernetes/00-dockerfile.md)
  - [Compose](labs/M06-docker-y-kubernetes/01-compose.md)
  - [Kubernetes y volúmenes](labs/M06-docker-y-kubernetes/02-kubernetes.md)
  - [Helm, réplicas y autoescalado](labs/M06-docker-y-kubernetes/03-helm-y-replicas.md)
- **M07 — Monitorización y logging**
  - [Prometheus y Grafana](labs/M07-monitorizacion-y-logging/00-prometheus.md)
  - [Jaeger](labs/M07-monitorizacion-y-logging/01-jaeger.md)
  - [Logs](labs/M07-monitorizacion-y-logging/02-logs.md)

## Antes de empezar

| Requisito | Dónde |
|-----------|--------|
| Node.js 22, Docker, curl | [infra/README.md](infra/README.md) |
| kind, kubectl y Helm | Solo en las páginas de Kubernetes |
| Dejar los puertos libres | `bash scripts/limpiar-entorno.sh` |
| En un Codespace, que los contenedores de Compose se vean | `bash scripts/red-docker-codespace.sh` ([por qué](infra/README.md#codespace-contenedores-que-no-se-ven)) |

## Empieza aquí

→ **[I/O no bloqueante](labs/M01-node-en-microservicios/00-io-no-bloqueante.md)**
