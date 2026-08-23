# Geolocator

Aplicación web **local** para geolocalizar y enriquecer registros de establecimientos comerciales a partir de Excel o de ingreso manual.

Los 10 MVP del plan están implementados: importación, mapeo, entrada manual, construcción de consultas, geocodificación, scoring, cache, mapa, revisión manual, exportación, proveedor de respaldo y una capa de IA opcional.

---

## Requisitos

- Node.js 20 o superior (probado con 24.16).
- Un navegador moderno.
- Conexión a internet para consultar los geocodificadores.

No hace falta servidor propio, base de datos ni cuenta de ningún proveedor de pago.

## Puesta en marcha

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5173`.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Compilación de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para revisar la build |
| `npm test` | Tests con Vitest |
| `npm run test:watch` | Tests en modo watch |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run check` | lint + typecheck + tests + build |

## Cómo se usa

La aplicación son siete pestañas que siguen el flujo de trabajo.

### 1. Importar Excel

Carga `.xlsx`, `.xlsm`, `.csv` o `.tsv`. Elige la hoja, confirma cuál fila trae los encabezados, revisa la vista previa y corrige el mapeo de columnas. La detección automática es siempre una sugerencia.

### 2. Entrada manual

Crea registros a mano. Producen exactamente el mismo modelo que los importados y conviven en la misma tabla.

### 3. Registros

Tabla unificada con filtros por texto, **lote**, origen y estado. Edición en línea, duplicado y borrado. Cada registro muestra sus problemas de validación sin que nada se descarte.

Arriba aparece la lista de **lotes**: cada importación de una hoja es un lote propio, con el nombre del archivo, la hoja y la fecha y hora exactas. Los registros manuales se agrupan en un lote por día. Pinchando un lote se filtra la tabla; también se puede borrar un lote entero con todos sus registros.

Cada registro guarda además su propia fecha de creación y de última modificación, visibles en la tabla y presentes en la exportación.

### 4. Búsqueda

Muestra **exactamente** qué se va a consultar, registro por registro, antes de gastar una sola petición. Desde aquí se lanza la geocodificación, se detiene y se retoma.

### 5. Revisión

Cola de los registros que necesitan una decisión humana. Para cada uno: datos originales, consulta usada, resultado, desglose del score, candidatos alternativos y un mapa. Puedes aceptar, rechazar, elegir otro candidato o marcar el punto a mano.

### 6. Mapa

Todos los registros localizados en un solo mapa.

- **Tocas una tarjeta de la lista** y el mapa vuela a ese punto con zoom cercano.
- **Pinchas un marcador** y se resalta su fila, pero el mapa no se mueve: así no pierdes la panorámica mientras comparas puntos.
- **Ver todos** vuelve a encuadrar el conjunto completo.

Se puede filtrar por lote, por verificados manualmente y por texto.

### 7. Exportar

Genera un `.xlsx` que **conserva todas las columnas del archivo original** y añade los campos normalizados, las columnas de resultado y la trazabilidad: lote de procedencia, fecha del lote, y fecha de creación y modificación de cada registro.

## Sobre la precisión

La aplicación prefiere pedirte que revises antes que darte unas coordenadas equivocadas.

Un caso real que ilustra por qué: buscar `Toks, Ciudad de Mexico` devuelve *algún* Toks de la cadena con todas las señales coincidiendo al 100%, porque nada en el registro distingue una sucursal de otra. En vez de aceptarlo, la confianza se limita al 75% y el registro entra en la cola de revisión con el motivo escrito.

Las dos situaciones que fuerzan revisión:

- La consulta no incluyó dirección ni código postal.
- Dos candidatos quedaron prácticamente empatados.

**Cuanto mejor sea la dirección en tu Excel, más registros se resolverán solos.** Sin dirección, espera revisar a mano.

## Proveedores y límites

| Proveedor | Papel | Límite |
| --- | --- | --- |
| Nominatim (OpenStreetMap) | Principal | **1 consulta por segundo**, impuesto por la aplicación |
| Photon | Respaldo, opcional | Se activa en la pestaña Búsqueda |

Un lote de N registros tarda del orden de N a 4N segundos, porque cada registro puede necesitar varias estrategias. Las consultas repetidas salen de la cache y no cuestan nada.

No se promete una tasa de acierto del 100%. Depende de la calidad de tus datos y de lo que exista en OpenStreetMap.

## Asistente de IA (opcional, apagado)

En la pestaña Ajustes. Se conecta a un modelo que corre **en tu máquina** (Ollama, LM Studio) mediante su API compatible con OpenAI.

Solo actúa en dos sitios, y en ambos después de que las reglas deterministas se hayan rendido:

- Interpretar columnas que la detección automática no reconoció.
- Proponer búsquedas alternativas para un registro que no se encontró.

No se usa ningún servicio de pago: una clave de API en el navegador quedaría a la vista de cualquiera. Para un modelo alojado, apunta el endpoint a un proxy propio que guarde la clave en el servidor.

Si no hay ningún modelo escuchando, la aplicación funciona igual.

## Formatos de Excel

Se admiten `.xlsx` y `.xlsm`. **El formato antiguo `.xls` (Excel 97-2003) no se admite**: ábrelo en Excel y guárdalo como `.xlsx`. La aplicación lo detecta y te lo dice.

Para CSV se detecta automáticamente el separador (`,`, `;`, tabulador o `|`) y se recupera la codificación Windows-1252 que usa Excel en español.

## Privacidad

Los archivos se leen y procesan en tu navegador; no se suben a ningún sitio. Lo que sí sale a internet son las **consultas de texto** a Nominatim y Photon: nombre del local, dirección, ciudad y país. Nada más.

Hay un archivo de prueba en [`samples/ejemplo-tiendas.xlsx`](samples/ejemplo-tiendas.xlsx) con casos incómodos a propósito: título suelto antes de los encabezados, columna duplicada, columna irrelevante, fila en blanco, registro casi vacío y acentos.

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md) — estructura del código y decisiones tomadas.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — qué está hecho, qué se verificó y qué queda abierto.
