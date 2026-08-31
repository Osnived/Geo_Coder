# Arquitectura

## Principio rector

Una sola dirección de dependencia:

```text
UI (components, features)
        │
        ▼
Aplicación (app/store)
        │
        ▼
Dominio (domain)          ◄──── no depende de nada
        ▲
        │
Infraestructura + Proveedores
```

El dominio no importa React, ni Dexie, ni ExcelJS, ni `fetch`. Esta regla no depende de la disciplina: está impuesta por ESLint en [`eslint.config.js`](eslint.config.js), que rechaza esas importaciones dentro de `src/domain/`.

## Estructura

```text
src/
├── app/
│   ├── App.tsx                    layout y navegación
│   ├── tabs.ts                    secciones, agrupadas por etapa del flujo
│   ├── navigationContext.ts       ir de una sección a otra desde dentro
│   └── store/                     estado global (Zustand) y orquestación
│       ├── assistant.ts           asistente de IA activo
│       ├── geocoder.ts            cadena de proveedores
│       ├── repository.ts          IndexedDB o memoria
│       ├── types.ts               contrato del estado, por slice
│       └── useAppStore.ts         acciones
├── components/ui/                 primitivas visuales sin lógica de negocio
├── domain/                        TypeScript puro, sin dependencias
│   ├── models/                    registro, estados, país, consulta, resultado, grupo
│   ├── rules/                     texto, similitud, detección de columnas, validación
│   └── services/                  normalizador, query builder, geocoder,
│                                  scoring, reintentos, revisión, exportación, IA
├── features/
│   ├── data/                      vista única de ingreso: pestañas + grupos
│   ├── import/  column-mapping/  manual-entry/
│   ├── results/  search/  review/  map/  export/  settings/
├── infrastructure/
│   ├── excel/                     lectura y escritura (ExcelJS, Papa Parse)
│   ├── geocoders/                 limitador, cache, reintentos
│   └── storage/                   IndexedDB (Dexie) y migraciones
├── providers/
│   ├── nominatim/  photon/        geocodificadores y sugerencias de lugares
│   └── ai/                        asistente sobre modelo local
└── shared/                        países, ids, configuración, utilidades
```

## Modelo de datos

```ts
interface EstablishmentRecord {
  id: string // identificador interno único
  source: 'excel' | 'manual'
  batchId: string // grupo en el que entró
  origin: ExcelOrigin | null // archivo, hoja y fila de procedencia
  fields: NormalizedFields // los 8 campos; '' = sin dato
  original: Record<string, unknown> // fila cruda importada, nunca se modifica
  status: RecordStatus // los 8 estados de la especificación
  result: GeocodeResult | null
  rejected?: readonly GeocodeResult[] // lo que una persona descartó
  createdAt: string
  updatedAt: string
}
```

`client`, `business_type` y `location_name` son campos distintos y se mantienen separados. La cadena («Olímpica») no es lo mismo que el nombre de la sucursal («Olímpica Calle 72»).

Un **grupo** (`ImportBatch`) es el conjunto de registros que entraron juntos: una importación concreta de una hoja de un archivo, o una sesión de entrada manual. Guarda el nombre visible, el tipo, la hoja, cuántos registros entraron y la fecha y hora. Los nombres de campo son los originales (`label`, `source`, `importedCount`) para no romper lo ya guardado en IndexedDB; conceptualmente son el `name`, el `type` y el `recordCount` del grupo.

Los registros guardados antes de que existieran los grupos se asignan en la migración a un grupo heredado («Registros anteriores»), para que sigan siendo visibles y agrupables.

El resultado guarda su propia trazabilidad: `queryUsed`, `provider`, `confidence`, `candidates`, `attempts`, `notes` y `replaced` (el resultado anterior, encadenado).

Guarda además `components`: los componentes geográficos del lugar encontrado —estado, municipio, código postal, país— tal como los dio el proveedor. Antes se descartaban al pasar del puerto del proveedor al modelo, y la exportación solo podía ofrecer una dirección formateada en una sola celda. Partir esa cadena para recuperar el municipio es adivinar; el proveedor ya los daba separados.

## Flujo de geocodificación

```text
EstablishmentRecord
       │
       ▼
  QueryBuilder ──► hasta 4 consultas, de la más específica a la más genérica
       │
       ▼
 GeocoderService ──► por cada consulta y cada proveedor:
       │                cache → reintentos → limitador → proveedor
       ▼
   ScoringService ──► una puntuación por señal, explicable
       │
       ▼
   capConfidence ──► limita si la consulta era poco específica o hay empate
       │
       ▼
   RecordStatus  ──► FOUND / LOW_CONFIDENCE / NEEDS_REVIEW / NOT_FOUND / ERROR
```

Si todas las estrategias fallan y el asistente de IA está activo, se pide una segunda ronda de consultas alternativas antes de rendirse.

## Navegación y flujo

La barra lateral sigue el trabajo real, no la estructura del código:

```text
Flujo         Datos · Procesamiento · Revisión · Exportar
Herramientas  Mapa · Ajustes
```

`Registros` existe como vista pero no como destino: se llega desde el botón «Ver registros» de una tarjeta de grupo, que además deja la tabla filtrada por ese grupo. Tenerla en la barra la convertía en una cuarta parada del ingreso de datos, y la tabla se duplicaba con el listado de grupos.

La navegación entre secciones viaja por contexto (`navigationContext.ts`) y no por props: acciones como «Ver registros» o «Ir a Datos» viven tres componentes por debajo del que conoce la sección activa.

## Decisiones tomadas

### Un grupo por sesión manual, no por día

Un grupo (`ImportBatch`) es una importación concreta o **una sesión de entrada manual**. Antes lo manual se agrupaba por día, con el identificador derivado de la fecha: dos tandas del mismo día —veinte tiendas por la mañana, treinta por la tarde— acababan en el mismo grupo aunque fueran conjuntos distintos.

Ahora el grupo manual se abre con el primer registro, se mantiene mientras se escriben los siguientes y se cierra a mano («Cerrar grupo») o al recargar la página. El identificador es un id propio, no la fecha: dos grupos creados en el mismo milisegundo compartirían id, y cerrar un grupo para empezar otro no serviría de nada. La fecha solo da el nombre visible («Manual — 31/08/2026 08:45»).

El puntero al grupo abierto (`activeManualBatchId`) vive en el estado y no se persiste: una sesión termina cuando termina la sesión del navegador.

### Los reintentos se deciden por lote, no por registro

Al terminar de procesar **todos** los registros se mide el porcentaje de éxito. Si queda por debajo del mínimo configurado, se reintentan los que lo necesitan y se vuelve a medir, hasta agotar los reintentos.

```text
Procesar todo → medir → ¿% >= mínimo? → sí: fin
                              │ no
                              ▼
                        ¿quedan reintentos? → no: fin
                              │ sí
                              ▼
                     reintentar solo los fallidos → medir → repetir
```

Decidirlo registro a registro gastaría peticiones sin saber todavía si el lote entero ha ido bien. La lógica es pura y vive en [`retryPolicy.ts`](src/domain/services/retryPolicy.ts); el store solo la ejecuta.

**Qué se reintenta.** Solo lo que no obtuvo resultado: `NOT_FOUND`, `ERROR` y `PENDING` sin coordenadas. Un registro que sí obtuvo candidato —aunque sea flojo— no se vuelve a pedir: la consulta sería idéntica y el proveedor devolvería lo mismo, así que solo se gastaría cupo. Esos casos se resuelven en la pantalla de revisión, y la interfaz lo dice con esas palabras cuando el bucle se detiene por ese motivo.

**Sobre qué se mide.** El porcentaje se calcula siempre sobre el conjunto de la pasada inicial, no sobre los que quedan por reintentar. Medirlo sobre los reintentos daría porcentajes que suben y bajan sin significar nada.

**Qué cuenta como éxito.** Solo `FOUND` y `MANUALLY_VERIFIED`. `LOW_CONFIDENCE` y `NEEDS_REVIEW` tienen coordenadas, pero la aplicación no las da por buenas: el porcentaje mide lo resuelto, no lo que aún espera a una persona.

### Valores por defecto de una carga

Un Excel de tiendas de una sola cadena rara vez repite el nombre de la cadena en cada fila: quien lo hizo ya sabía de quién era el archivo. Sin ese dato la búsqueda pierde una señal que pesa un 20 % en el scoring.

El paso de mapeo ofrece escribirlo una vez para toda la carga. La regla es la misma que ya seguía el país global, y por eso `applyDefaultCountry` se generalizó a `applyDefaults`: **solo rellena huecos**. Pisar el valor que sí trae la fila sería perder información de entrada (principio 2). El valor va a los campos normalizados, nunca a la fila cruda.

Solo se ofrece para `client` y `business_type`. `location_name` queda fuera a propósito: darle el mismo nombre a todas las sucursales destruiría lo único que permite distinguirlas, que es de donde salen los topes de confianza.

El bloque aparece tanto si no hay columna asignada como si la hay con huecos. En el segundo caso el texto dice «2 de las 3 filas de la muestra», porque la vista previa son 25 filas y no el archivo entero: prometer un total sería inventárselo.

### El reloj del procesamiento vive en la interfaz

El store guarda **marcas de tiempo** (`startedAt`, `roundStartedAt`, `currentRecordStartedAt`, `finishedAt`), no un contador. Si guardara los segundos transcurridos, cada tic volvería a renderizar todo lo suscrito al store —la tabla, la barra lateral, los filtros— para mover un número. El reloj que avanza es [`useTicker`](src/features/search/useTicker.ts), y solo lo usa el panel que lo muestra.

El tiempo restante se estima con el ritmo medido en esa misma ejecución, no con una constante: el limitador, la caché y el número de estrategias por registro cambian el ritmo entre lotes y entre máquinas. No se estima hasta tener tres muestras, porque el primer registro suele ser el más lento y anunciar «40 minutos» para corregirlo a 3 al segundo siguiente es peor que no decir nada.

La cuenta atrás es de la vuelta en curso, no del proceso entero: si al arrancar un reintento el número subiera, parecería que el programa miente.

### Sugerir lugares es otro puerto

`PlaceSuggestionProvider` está separado de `GeocoderProvider` a propósito. Geocodificar es «dame las coordenadas de este establecimiento»; sugerir es «voy escribiendo, dime qué ciudades empiezan así». Tienen ritmos, formas y errores distintos, y meterlos en la misma interfaz obligaría a que cada implementación soportara ambos.

**Cómo se acota al país.** Photon no admite filtrar por país. Se midieron tres formas contra el servicio real, buscando `barran` y contando cuántos de 10 resultados eran colombianos:

| Forma                                        | Aciertos     |
| -------------------------------------------- | ------------ |
| Sin acotar                                   | 4 de 10      |
| Con el `bbox` del país                       | 9 de 10      |
| Con el nombre del país dentro de la consulta | **10 de 10** |

Gana la tercera, y además no obliga a mantener a mano una tabla de cajas geográficas de 250 países que, mal copiada, dejaría municipios fuera. El nombre ya lo da el catálogo. El filtro definitivo lo hace `refineSuggestions` comparando el código ISO, con la misma regla que el scoring: solo se descarta cuando **ambos** códigos se conocen.

**Lo que no se puede sugerir.** El código postal. Photon devuelve `postcode` vacío para las ciudades, y no por una carencia del servicio: una ciudad tiene cientos de códigos postales y no hay ninguno que sugerir. Nominatim sí devuelve uno, pero solo al geocodificar una dirección concreta. Lo que la aplicación sí hace es guardarlo en `result.components.postalCode` cuando lo encuentra.

**Consumo.** Photon es un servicio público de uso razonable, así que el hook espera 300 ms tras la última pulsación, cachea por consulta, cancela la petición en vuelo cuando llega otra y no pregunta por debajo de tres caracteres ni por el valor que se acaba de elegir. Medido en el navegador: escribir «cartagena» son nueve letras y **una** petición.

El campo sigue siendo un campo de texto y no un desplegable cerrado: OpenStreetMap no conoce todos los municipios, y un fallo de red no debe impedir escribir a mano.

### Las etiquetas se asocian por `id`, no envolviendo el control

`Field` usa `htmlFor` y un `id` inyectado en el hijo. Envolver el control en la etiqueta parece más cómodo, pero convierte **todo** el texto de dentro en el nombre accesible del campo: la ayuda hacía que «Ciudad» se llamara «Ciudad Fija un país en la barra lateral», y el aviso del desplegable de sugerencias lo dejaba en «Ciudad Buscando sugerencias». Lo destaparon los tests del formulario manual.

Cuando el hijo no es el control en sí —un contenedor con el campo y un sufijo, por ejemplo— hay que pasar `htmlFor` y poner el `id` a mano.

### Nombres de columna legibles en la exportación

El Excel de salida no usa `lat`, `lng`, `formatted_address` ni `admin_level_1`. Usa `Estado/Departamento`, `Municipio/Ciudad`, `Código ZIP`, `Dirección encontrada`, `Coordenadas`, `Latitud`, `Longitud`. Internamente los nombres técnicos siguen igual; la traducción ocurre solo al construir la hoja.

La columna `Coordenadas` va en **longitud, latitud** con seis decimales, y la convención se fija una sola vez en [`exportBuilder.ts`](src/domain/services/exportBuilder.ts). Mezclarla entre pantallas y exportación es la forma más fácil de acabar con puntos en medio del océano. Es redundante con `Latitud` y `Longitud` a propósito: pegar una sola celda en un buscador de mapas es lo que la gente hace de verdad.

El código postal se escribe como texto, no como número: `080001` perdería el cero delante.

### La revisión es una herramienta de mapa

El mapa ocupa el espacio que sobra; el contexto va en dos líneas arriba y el detalle en pestañas de alto fijo abajo. Antes, resultado, candidatos, datos originales e historial se apilaban en paneles: el mapa quedaba fuera de la pantalla y había que desplazar la página para tomar una decisión.

Los grupos se distinguen dentro de la propia lista, con una cabecera pegajosa por grupo, en lugar de con un selector aparte: con un selector hay que mirar en dos sitios para saber de dónde es cada fila.

### El alto completo solo desde `lg`

Las vistas de trabajo ocupan exactamente la pantalla y se desplazan por dentro, pero **solo en pantallas anchas**. Por debajo de `lg` apilan sus columnas en una sola, y repartir un alto fijo entre cuatro bloques apilados los deja a todos inservibles: en la prueba a 375 px la cola de revisión quedaba en 60 px y Leaflet se dibujaba con 0 px de alto. En pantalla estrecha lo correcto es que la página se desplace, y los mapas llevan además un alto mínimo propio.

### Los estados no dependen del color

Cada estado lleva un símbolo además del color y del texto (`✓ Encontrado`, `⚠ Confianza baja`, `✕ No encontrado`, `○ Pendiente`). El color solo no basta: quien no distingue rojo de verde vería dos etiquetas iguales, y en una tabla de mil filas el estado se lee de reojo por la forma del icono antes que por el texto. Vive en un único sitio, [`statusPresentation.ts`](src/components/ui/statusPresentation.ts).

Los colores de estado están al 45 % de luminosidad y sus fondos suaves al 96,5 %, para cumplir 4,5:1 en los dos usos que tienen: texto sobre fondo suave y texto blanco sobre color pleno. `ink-faint` no cumple ese contraste a propósito y está reservado a lo decorativo; el texto secundario usa `ink-muted`.

### ExcelJS en lugar de SheetJS (`xlsx`)

La versión de `xlsx` publicada en npm arrastra vulnerabilidades sin parchear; las corregidas solo se distribuyen desde el CDN propio de SheetJS. ExcelJS está mantenido y no tiene CVEs abiertos.

El precio: **no lee el formato antiguo `.xls`**. Se descartó porque no es un caso de uso real aquí, y la aplicación explica cómo convertir el archivo.

`exceljs` depende transitivamente de `uuid` en una versión con un aviso de seguridad. Se fija `uuid@^11` mediante `overrides`; `npm audit` queda en cero.

### Detección propia del delimitador CSV

Papa Parse detecta mal el separador: con un CSV separado por `;` (lo que exporta Excel en configuración regional española) devuelve `,` y deja todo en una columna. La decisión se toma en [`csvLoader.ts`](src/infrastructure/excel/csvLoader.ts): gana el separador que produce más columnas de forma consistente.

### Detección de la fila de encabezados por densidad

No se toma «la primera fila no vacía»: los Excel reales empiezan con un título suelto en A1 y una fila en blanco. Se elige la fila más poblada de las primeras 20. Siempre modificable.

### Importación diferida de las librerías pesadas

ExcelJS (937 kB) se carga con `await import()` solo al abrir o exportar un archivo. La pantalla de revisión, que arrastra Leaflet, se carga con `React.lazy`. El bundle inicial queda en unos 375 kB.

### El país es un filtro, no una señal más

En el scoring, un candidato en otro país no puntúa peor: queda descartado. Y solo se descarta cuando **ambos** códigos ISO son conocidos, porque un país escrito a mano sin código no basta para tirar un resultado.

El país global de la sesión actúa como respaldo: rellena los registros que no lo traen y hace que dejen de marcar error, pero nunca pisa un país que venga en el archivo.

### Topes de confianza: preferir la revisión al error

El caso que lo motivó: `Toks, Ciudad de Mexico` devuelve un Toks cualquiera con todas las señales al 100%, porque el registro no tiene nada que distinga una sucursal de otra. Aceptarlo automáticamente sería asignar coordenadas equivocadas con seguridad aparente total.

Dos topes, ambos por debajo del umbral de aceptación, definidos en [`shared/config/geocoding.ts`](src/shared/config/geocoding.ts):

- **Poca especificidad** (0.75): la consulta no incluyó dirección ni código postal.
- **Ambigüedad** (0.6): dos candidatos separados por menos de 0.05.

El resultado guarda el motivo en `notes` y la interfaz lo muestra.

### Orden de los envoltorios de proveedor

```text
cache → reintentos → limitador → proveedor
```

La cache va fuera para que un acierto no espere turno ni consuma cupo. Los reintentos van dentro de la cache pero fuera del limitador, de modo que cada reintento vuelve a respetar el ritmo pactado.

### Limitaciones reales de los proveedores, comprobadas

- **Nominatim** pide identificar la aplicación por `User-Agent`, cabecera que los navegadores no dejan fijar. Desde el navegador la identificación viaja en `Referer`, que se envía solo. Por eso el cliente no intenta ponerla: sería ignorada.
- **Photon** no admite filtrar por país, y su parámetro `lang` solo acepta `default`, `de`, `en` y `fr`: pedir `es` devuelve un 400. Se omite el parámetro, con lo que responde con los nombres locales.

### La IA solo donde las reglas se rinden

La capa de IA está apagada de fábrica y solo se invoca en dos puntos concretos: columnas que la detección no reconoció y registros sin resultado. Nunca sustituye a una función determinista.

Se conecta a un modelo **local** por su API compatible con OpenAI. Motivo: la aplicación no tiene backend, y una clave de API en el frontend queda a la vista de cualquiera que abra las herramientas de desarrollo. Para un modelo alojado, lo correcto es apuntar el endpoint a un proxy propio.

Todo lo que devuelve el modelo pasa por un saneado que descarta campos inexistentes, encabezados inventados, duplicados y confianzas fuera de rango.

### El mapa global no vuelve a encuadrar al cambiar la selección

`FitBounds` depende del conjunto de coordenadas, no de cuál está seleccionada. Si dependiera de la selección, el mapa se movería bajo el ratón cada vez que el usuario recorre la lista, que es exactamente lo que no se quiere al comparar puntos.

### El repositorio es un puerto, no Dexie

`RecordRepository` es una interfaz con dos implementaciones: IndexedDB y memoria. La segunda entra cuando el navegador no expone IndexedDB, para que la aplicación siga funcionando aunque pierda la persistencia.

### Migración de lo que sale de IndexedDB

Los registros guardados por una versión anterior no tienen los campos añadidos después. [`migrations.ts`](src/infrastructure/storage/migrations.ts) los rellena en el borde de la persistencia, para que el resto del código pueda confiar en los tipos en lugar de comprobar `undefined` en cada pantalla.

Esto no es teórico: durante el desarrollo, añadir el campo `notes` rompió la aplicación al recargar con datos ya guardados.

### Zustand para el estado

El flujo importar → mapear → geocodificar → revisar comparte un único conjunto de registros que muchas pantallas leen y escriben. Context + `useReducer` se vuelve difícil de mantener con ese acoplamiento; Redux es desproporcionado para el tamaño del proyecto.

## Pruebas

579 tests con Vitest.

- **Dominio** — detección de columnas contra los ejemplos de la especificación, similitud de textos con acentos y abreviaturas, validación, normalización, construcción de consultas, scoring señal a señal, transiciones de revisión, política de reintentos, agrupación, depurado de sugerencias, exportación, saneado de la IA.
- **Infraestructura** — se generan archivos `.xlsx` y CSV reales en memoria y se vuelven a leer, incluido un ciclo completo escribir-leer. Los tests corren en jsdom, que resuelve el build de navegador de ExcelJS: si se rompiera, se detectaría aquí.
- **Proveedores** — Nominatim, Photon y las sugerencias de lugares con `fetch` simulado: traducción de respuestas, errores HTTP, cancelación. El simulacro atiende la señal de cancelación; si resolviera de todas formas, el test comprobaría el simulacro y no el código.
- **Persistencia** — el repositorio se prueba contra IndexedDB (`fake-indexeddb`) y contra memoria con la misma batería, más las migraciones.
- **Aplicación** — el recorrido completo sobre el store, con archivos reales. El bucle de reintentos se prueba con un proveedor de mentira que decide qué encuentra y en qué vuelta: así se comprueba cuándo reintenta, sobre qué registros y cuándo se rinde, sin salir a la red.
- **Exportación de verdad** — se genera el `.xlsx`, se vuelve a leer y se comprueba lo que hay dentro: columnas geográficas separadas, latitud y longitud como números, código postal con su cero delante y el filtro por grupo.
- **UI** — el formulario manual con Testing Library, incluidas la agrupación por sesión, el cierre de grupo y las sugerencias con un proveedor inyectado. El desplegable se prueba por su semántica accesible y por teclado, no por sus clases CSS.

`src/test/setup.ts` rellena dos huecos de jsdom que sí existen en todos los navegadores —`Blob.prototype.arrayBuffer` y `Element.prototype.scrollIntoView`— y registra la limpieza de Testing Library.

## Lo que queda fuera a propósito

Backend, autenticación, multiusuario, Docker, PostgreSQL y procesamiento distribuido. La arquitectura permite añadirlos —el dominio no depende de nada y la persistencia está tras un puerto— pero nada de eso hace falta para el caso de uso actual.
