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
│   └── store/                     estado global (Zustand) y orquestación
│       ├── assistant.ts           asistente de IA activo
│       ├── geocoder.ts            cadena de proveedores
│       ├── repository.ts          IndexedDB o memoria
│       ├── types.ts               contrato del estado, por slice
│       └── useAppStore.ts         acciones
├── components/ui/                 primitivas visuales sin lógica de negocio
├── domain/                        TypeScript puro, sin dependencias
│   ├── models/                    registro, estados, país, consulta, resultado
│   ├── rules/                     texto, similitud, detección de columnas, validación
│   └── services/                  normalizador, query builder, geocoder,
│                                  scoring, revisión, exportación, IA
├── features/
│   ├── import/  column-mapping/  manual-entry/
│   ├── results/  search/  review/  map/  export/  settings/
├── infrastructure/
│   ├── excel/                     lectura y escritura (ExcelJS, Papa Parse)
│   ├── geocoders/                 limitador, cache, reintentos
│   └── storage/                   IndexedDB (Dexie) y migraciones
├── providers/
│   ├── nominatim/  photon/        geocodificadores
│   └── ai/                        asistente sobre modelo local
└── shared/                        países, ids, configuración, utilidades
```

## Modelo de datos

```ts
interface EstablishmentRecord {
  id: string                        // identificador interno único
  source: 'excel' | 'manual'
  origin: ExcelOrigin | null        // archivo, hoja y fila de procedencia
  fields: NormalizedFields          // los 8 campos; '' = sin dato
  original: Record<string, unknown> // fila cruda importada, nunca se modifica
  status: RecordStatus              // los 8 estados de la especificación
  result: GeocodeResult | null
  rejected?: readonly GeocodeResult[] // lo que una persona descartó
  createdAt: string
  updatedAt: string
}
```

`client`, `business_type` y `location_name` son campos distintos y se mantienen separados. La cadena («Olímpica») no es lo mismo que el nombre de la sucursal («Olímpica Calle 72»).

El resultado guarda su propia trazabilidad: `queryUsed`, `provider`, `confidence`, `candidates`, `attempts`, `notes` y `replaced` (el resultado anterior, encadenado).

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

## Decisiones tomadas

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

### El repositorio es un puerto, no Dexie

`RecordRepository` es una interfaz con dos implementaciones: IndexedDB y memoria. La segunda entra cuando el navegador no expone IndexedDB, para que la aplicación siga funcionando aunque pierda la persistencia.

### Migración de lo que sale de IndexedDB

Los registros guardados por una versión anterior no tienen los campos añadidos después. [`migrations.ts`](src/infrastructure/storage/migrations.ts) los rellena en el borde de la persistencia, para que el resto del código pueda confiar en los tipos en lugar de comprobar `undefined` en cada pantalla.

Esto no es teórico: durante el desarrollo, añadir el campo `notes` rompió la aplicación al recargar con datos ya guardados.

### Zustand para el estado

El flujo importar → mapear → geocodificar → revisar comparte un único conjunto de registros que muchas pantallas leen y escriben. Context + `useReducer` se vuelve difícil de mantener con ese acoplamiento; Redux es desproporcionado para el tamaño del proyecto.

## Pruebas

302 tests con Vitest.

- **Dominio** — detección de columnas contra los ejemplos de la especificación, similitud de textos con acentos y abreviaturas, validación, normalización, construcción de consultas, scoring señal a señal, transiciones de revisión, exportación, saneado de la IA.
- **Infraestructura** — se generan archivos `.xlsx` y CSV reales en memoria y se vuelven a leer, incluido un ciclo completo escribir-leer. Los tests corren en jsdom, que resuelve el build de navegador de ExcelJS: si se rompiera, se detectaría aquí.
- **Proveedores** — Nominatim y Photon con `fetch` simulado: traducción de respuestas, errores HTTP, cancelación.
- **Persistencia** — el repositorio se prueba contra IndexedDB (`fake-indexeddb`) y contra memoria con la misma batería, más las migraciones.
- **Aplicación** — el recorrido completo sobre el store, con archivos reales.
- **UI** — el formulario manual con Testing Library.

`src/test/setup.ts` rellena `Blob.prototype.arrayBuffer`, que jsdom no implementa pero sí existe en todos los navegadores actuales, y registra la limpieza de Testing Library.

## Lo que queda fuera a propósito

Backend, autenticación, multiusuario, Docker, PostgreSQL y procesamiento distribuido. La arquitectura permite añadirlos —el dominio no depende de nada y la persistencia está tras un puerto— pero nada de eso hace falta para el caso de uso actual.
