# Arquitectura

## Principio rector

La aplicación se organiza en capas con una sola dirección de dependencia:

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
Infraestructura (infrastructure, providers)
```

El dominio no importa React, ni Dexie, ni ExcelJS, ni `fetch`. Esta regla no depende de la disciplina: está impuesta por ESLint en [`eslint.config.js`](eslint.config.js), que rechaza esas importaciones dentro de `src/domain/`.

## Estructura

```text
src/
├── app/
│   ├── App.tsx                    layout y navegación entre pestañas
│   └── store/                     estado global (Zustand) y orquestación
│       ├── repository.ts          elige IndexedDB o memoria
│       ├── types.ts               contrato del estado, dividido por slice
│       └── useAppStore.ts         acciones: leer archivo, normalizar, persistir
├── components/ui/                 primitivas visuales sin lógica de negocio
├── domain/                        TypeScript puro, sin dependencias
│   ├── models/                    EstablishmentRecord, estados, país, resultado
│   ├── rules/                     texto, detección de columnas, validación
│   └── services/                  normalizador Excel ↔ manual
├── features/
│   ├── import/                    dropzone, selector de hoja, vista previa
│   ├── column-mapping/            mapeo columna → campo
│   ├── manual-entry/              formulario de alta
│   ├── results/                   tabla, filtros, edición
│   └── settings/                  selector de país
├── infrastructure/
│   ├── excel/                     adaptadores de lectura (ExcelJS, Papa Parse)
│   └── storage/                   repositorio sobre IndexedDB (Dexie)
├── shared/                        países, ids, configuración central, utilidades
└── test/                          setup y factories
```

Las carpetas `providers/` (Nominatim, Photon) y las features `search`, `geocoding`, `map` y `export` se crearán en sus MVP correspondientes. No se dejan vacías.

## Modelo de datos

Un registro es siempre esta forma, venga de Excel o del formulario:

```ts
interface EstablishmentRecord {
  id: string                      // identificador interno único
  source: 'excel' | 'manual'
  origin: ExcelOrigin | null      // archivo, hoja y fila de procedencia
  fields: NormalizedFields        // los 8 campos; '' = sin dato
  original: Record<string, unknown> // fila cruda importada, nunca se modifica
  status: RecordStatus
  result: GeocodeResult | null
  createdAt: string
  updatedAt: string
}
```

`client`, `business_type` y `location_name` son campos distintos y se mantienen separados. La cadena («Olímpica») no es lo mismo que el nombre de la sucursal («Olímpica Calle 72»).

`original` guarda la fila completa, incluidas las columnas que el usuario decidió ignorar. Editar un registro nunca la toca.

## Decisiones tomadas

### ExcelJS en lugar de SheetJS (`xlsx`)

La versión de `xlsx` publicada en el registro npm arrastra vulnerabilidades sin parchear; las versiones corregidas solo se distribuyen desde el CDN propio de SheetJS. ExcelJS está mantenido y no tiene CVEs abiertos.

El precio: **ExcelJS no lee el formato antiguo `.xls`**. Se descartó porque no es un caso de uso real aquí, y la aplicación explica al usuario cómo convertir el archivo.

`exceljs` depende transitivamente de `uuid` en una versión con un aviso de seguridad. Se fija `uuid@^11` mediante `overrides` en `package.json`; `npm audit` queda en cero.

### Detección propia del delimitador CSV

Papa Parse detecta el separador de forma poco fiable: con un CSV separado por `;` (lo que exporta Excel en configuración regional española) devuelve `,` y deja todo en una sola columna. La detección se hace en [`csvLoader.ts`](src/infrastructure/excel/csvLoader.ts): gana el separador que produce más columnas de forma consistente en las primeras líneas.

### Detección de la fila de encabezados por densidad

No se toma «la primera fila no vacía»: los Excel reales suelen empezar con un título suelto en A1 y una fila en blanco. Se elige la fila más poblada de las primeras 20, y en empate la más alta. Siempre es una propuesta modificable por el usuario.

### Importación diferida de ExcelJS

ExcelJS pesa unos 937 KB minificado. Se importa con `await import('exceljs')` para que quede en un chunk aparte y solo se descargue cuando el usuario abre un archivo.

### Zustand para el estado

El flujo importar → mapear → normalizar → geocodificar comparte un único conjunto de registros que muchas pantallas leen y escriben. Context + `useReducer` se vuelve difícil de mantener con ese acoplamiento; Redux es desproporcionado para el tamaño del proyecto.

### El repositorio es un puerto, no Dexie

`RecordRepository` es una interfaz. Hay dos implementaciones: IndexedDB (Dexie) y memoria. La segunda entra en juego cuando el navegador no expone IndexedDB, para que la aplicación siga funcionando aunque pierda la persistencia entre recargas.

Esto también permite mover la persistencia a un backend más adelante sin tocar la UI ni el dominio.

### El país global es un respaldo, no un dato del registro

El país que se elige en la cabecera restringe las búsquedas de toda la sesión. Se usa de dos maneras:

- Al normalizar, rellena el campo `country` de los registros que no traen uno.
- Al validar, un registro sin país deja de considerarse incompleto si la sesión tiene país definido.

Nunca sobrescribe un país que venga en el archivo.

### Configuración centralizada desde ahora

[`src/shared/config/geocoding.ts`](src/shared/config/geocoding.ts) define límites de peticiones, reintentos, tiempos de espera y pesos de scoring. Todavía no lo consume nadie: existe para que esos valores no acaben dispersos por componentes React cuando lleguen los MVP 3-5.

Los pesos son un punto de partida y deben validarse con datos reales.

## Pruebas

123 tests con Vitest. Cobertura por capas:

- **Dominio** — detección de columnas contra los ejemplos de la especificación, normalización de texto y acentos, validación, normalizador Excel ↔ manual.
- **Infraestructura** — se generan archivos `.xlsx` y CSV reales en memoria y se vuelven a leer. Los tests corren en jsdom, que resuelve el build de navegador de ExcelJS: si ese build se rompiera, se detectaría aquí.
- **Persistencia** — el repositorio se prueba contra IndexedDB (`fake-indexeddb`) y contra memoria con la misma batería, incluida la recuperación tras «recargar».
- **Aplicación** — el recorrido completo del MVP 1 sobre el store, con archivos reales.
- **UI** — el formulario manual con Testing Library.

`src/test/setup.ts` rellena `Blob.prototype.arrayBuffer`, que jsdom no implementa pero sí existe en todos los navegadores actuales. Es una carencia del entorno de pruebas, no del código de producción.

## Preparado para los siguientes MVP

Ya están definidos, sin implementar:

- `GeocodeCandidate`, `GeocodeResult` y `GeocodeQuery` en [`domain/models/geocode.ts`](src/domain/models/geocode.ts), con campo `replaced` para conservar el resultado anterior cuando el usuario corrige a mano.
- Los ocho estados de `RecordStatus`, ya filtrables en la interfaz.
- Políticas de rate limit por proveedor y umbrales de confianza.
