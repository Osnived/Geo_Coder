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

| Script               | Qué hace                                            |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo con recarga en caliente      |
| `npm run build`      | Compilación de producción en `dist/`                |
| `npm run preview`    | Sirve `dist/` para revisar la build                 |
| `npm test`           | Tests con Vitest                                    |
| `npm run test:watch` | Tests en modo watch                                 |
| `npm run lint`       | ESLint                                              |
| `npm run typecheck`  | TypeScript sin emitir                               |
| `npm run check`      | lint + typecheck + tests + build                    |
| `npm run template`   | Regenera la plantilla de carga en `public/samples/` |

## Cómo se usa

La navegación está en una **barra lateral** a la izquierda y sigue el flujo real del trabajo:

```text
Flujo         Datos · Procesamiento · Revisión · Exportar
Herramientas  Mapa · Ajustes
```

Cada entrada lleva el recuento de lo que queda por hacer en esa etapa. El selector de país vive abajo del todo. En pantallas estrechas la barra se pliega detrás de un botón.

### 1. Datos

Todo el ingreso de información ocurre aquí, sin cambiar de pantalla. Dos pestañas eligen el método:

- **Carga masiva** — `.xlsx`, `.xlsm`, `.csv` o `.tsv`. Elige la hoja, confirma cuál fila trae los encabezados, revisa la vista previa y corrige el mapeo de columnas. La detección automática es siempre una sugerencia.

  ¿No sabes cómo estructurar el archivo? El botón **Descargar plantilla** genera un `.xlsx` con los encabezados que la aplicación reconoce sola, tres filas de ejemplo y una hoja de instrucciones. También está en [`public/samples/plantilla-geolocator.xlsx`](public/samples/plantilla-geolocator.xlsx).

  **Si al archivo le falta el cliente o el tipo de establecimiento**, el paso de mapeo te deja escribirlo una vez para toda la carga. Es el caso típico: un Excel de tiendas de una sola cadena no repite el nombre de la cadena en cada fila. Solo rellena los huecos —nunca pisa el valor que sí trae una fila— y las columnas originales del archivo no se tocan. Merece la pena: el cliente pesa un 20 % en la puntuación de la búsqueda.

- **Ingreso manual** — registros a mano, que producen exactamente el mismo modelo que los importados.

  **Ciudad y departamento se autocompletan**, acotados al país que tengas fijado. Escribe `barran` con Colombia y te ofrece Barranquilla (Atlántico), Barrancas (La Guajira), Barranca de Upía (Meta)… Al elegir una ciudad **se rellena su departamento**, que es lo que de verdad ahorra tiempo: nadie se sabe de memoria a qué departamento pertenece cada municipio.

  Siguen siendo campos de texto normales: OpenStreetMap no conoce todos los municipios, así que puedes escribir el que falte. Si no hay internet, se avisa y se escribe a mano.

  El código postal no se sugiere, y no es un olvido: una ciudad tiene cientos de códigos postales y no hay ninguno que proponer. Se rellena solo al geocodificar una dirección concreta.

A la derecha, **Registros ingresados**: lo que acabas de cargar aparece ahí en el momento, agrupado por origen.

#### Grupos

Todo registro pertenece a un **grupo**, que dice de dónde salió:

| Origen                                     | Grupo                                                 |
| ------------------------------------------ | ----------------------------------------------------- |
| `clientes_barranquilla.xlsx` con 500 filas | `clientes_barranquilla.xlsx` · 500 registros          |
| Después, `clientes_cartagena.xlsx` con 320 | `clientes_cartagena.xlsx` · 320 registros, **aparte** |
| Una tanda de 20 escritos a mano            | `Manual — 31/08/2026 08:45` · 20 registros            |

Cada archivo que cargas forma su propio grupo, incluso si es el mismo archivo dos veces. Los registros que escribes a mano seguidos van todos al mismo grupo; **Cerrar grupo** termina la tanda para que la siguiente forme otro.

Cada tarjeta de grupo muestra el origen, el nombre, la cantidad, la fecha y en qué estado va su procesamiento. **Ver registros** abre la tabla completa ya filtrada por ese grupo, y **Borrar grupo** se lleva el grupo con todos sus registros.

#### Configuración de geocodificación

En la misma pantalla, porque se decide con los datos delante:

| Ajuste                     | Por defecto | Para qué                                        |
| -------------------------- | ----------- | ----------------------------------------------- |
| Porcentaje mínimo de éxito | 40 %        | Por debajo de esto se reintenta automáticamente |
| Máximo de reintentos       | 3           | Vueltas extra, después de la pasada inicial     |

Acepta cualquier valor de 0 a 100 y de 0 a 10 reintentos, con validación. Se guarda y sobrevive a recargar la página.

### 2. Procesamiento

Muestra **exactamente** qué se va a consultar, registro por registro, antes de gastar una sola petición. Desde aquí se lanza la geocodificación, se detiene y se retoma.

Cuando termina la pasada inicial de **todos** los registros, se mide el porcentaje de éxito. Si queda por debajo del mínimo, se reintentan solo los que no obtuvieron resultado y se vuelve a medir:

```text
Resultado inicial: 35 %
El resultado quedó por debajo del mínimo configurado (40 %).
Reintentando… intento 1 de 3

Resultado: 48 %
✓ Se alcanzó el porcentaje mínimo.
```

**Mientras corre hay reloj**, porque con Nominatim a una consulta por segundo un lote grande son minutos u horas:

```text
Consultando  Éxito San Antonio  0:05

TRANSCURRIDO   RESTANTE        RITMO
0:21           ~0:35           8.5
               estimado        registros/min
```

El tiempo restante se calcula con el ritmo real de esa ejecución, no con un número fijo, así que se corrige a sí mismo; va etiquetado como estimación porque lo es. El registro que se está consultando lleva su propio contador y se marca en amarillo pasados 15 segundos, para que se vea si uno se ha quedado colgado. Al terminar, el cronómetro se congela y cada vuelta guarda su duración.

Nunca es un girador a secas: la pantalla dice en qué vuelta va, cuánto lleva procesado, el porcentaje de cada intento y por qué se detuvo. Los tres motivos posibles son que se alcanzara el mínimo, que se agotaran los reintentos, o que **no quede nada que reintentar** porque los registros que faltan ya tienen un candidato y lo que necesitan es una decisión humana.

Un registro que ya obtuvo candidato no se vuelve a pedir: la consulta sería idéntica y el proveedor devolvería lo mismo. Eso ahorra peticiones, tiempo y riesgo de tocar el límite del servicio.

### 3. Revisión

Rediseñada para trabajar, con el mapa como área principal:

```text
┌───────────────────────────────────────────────────────────┐
│ 1.240 registros · 3 grupos · 87 % geocodificados          │
│ Búsqueda: Colombia · Nominatim · acepta desde 80 %  [+]   │
├──────────────┬────────────────────────────────────────────┤
│ Filtros      │                                            │
│ y cola       │                  MAPA                      │
│ por grupo    │                                            │
│              ├────────────────────────────────────────────┤
│              │ Resultado │ Candidatos │ Datos originales   │
└──────────────┴────────────────────────────────────────────┘
```

El contexto de la búsqueda cabe en dos líneas; el resto se despliega con **Ver configuración** y no ocupa sitio de forma permanente.

A la izquierda, la cola **agrupada por origen**, con cabecera por grupo y filtros por grupo, por estado de geocodificación y por resultado. Abajo, en pestañas de alto fijo: el resultado con sus componentes geográficos separados, los candidatos, los datos originales y el historial.

Puedes aceptar, rechazar, elegir otro candidato, marcar el punto a mano o volver a buscar. **Tocar una ficha de candidato lo enseña en el mapa** sin cambiar nada: el mapa vuela hasta él y la chincheta se resalta. También funciona al revés. El registro solo cambia si pulsas **Usar este**.

Al decidir, **el registro se queda a la vista** para que compruebes el resultado y puedas cambiar de opinión. Cuando termines, **Siguiente pendiente** te lleva al próximo.

### 4. Exportar

Elige **qué grupos** exportar —todos, uno o varios—, qué registros (todos, solo los localizados, solo los verificados) y qué bloques de columnas incluir.

El `.xlsx` **conserva todas las columnas del archivo original** y añade la información geográfica en columnas separadas, con nombres que se entienden:

| Estado/Departamento | Municipio/Ciudad | Código ZIP | Dirección encontrada | Coordenadas           | Latitud | Longitud |
| ------------------- | ---------------- | ---------- | -------------------- | --------------------- | ------: | -------: |
| Atlántico           | Barranquilla     | 080001     | Calle 72 # 50-20     | -74.801200, 10.987800 | 10.9878 | -74.8012 |

La columna `Coordenadas` va siempre en **longitud, latitud**, la misma convención en toda la aplicación. Latitud y longitud van además como números independientes. El código postal se escribe como texto para no perder el cero de delante.

Después se añaden el resultado (estado, confianza, proveedor, consulta usada, verificación manual), el grupo de procedencia con su tipo y fecha, y la trazabilidad interna.

### Mapa

Todos los registros localizados en un solo mapa, que ocupa toda la pantalla junto a la lista.

Con muchos puntos las chinchetas se amontonan, así que **se agrupan por cercanía** mostrando cuántos esconde cada globo. Pinchar un grupo lo abre. Se activa solo a partir de 25 puntos y hay un interruptor **Agrupar** para forzarlo o quitarlo. El punto que tengas seleccionado nunca se esconde dentro de un grupo.

- **Tocas una tarjeta de la lista** y el mapa vuela a ese punto con zoom cercano.
- **Pinchas un marcador** y se resalta su fila, pero el mapa no se mueve: así no pierdes la panorámica mientras comparas puntos.
- **Ver todos** vuelve a encuadrar el conjunto completo.

Se puede filtrar por grupo, por verificados manualmente y por texto.

### La tabla de registros

Se llega desde **Ver registros** en una tarjeta de grupo. Tabla unificada con filtros por texto, grupo, origen y estado; edición en línea, duplicado y borrado. Cada registro muestra sus problemas de validación sin que nada se descarte, y guarda su fecha de creación y de última modificación.

Tiene **la barra horizontal arriba** además de abajo, sincronizadas, y cabecera fija.

### Espacio y accesibilidad

En pantallas anchas las vistas de trabajo **ocupan exactamente la pantalla**: la página no se desplaza, se desplazan las listas y las tablas por dentro, así que los filtros y la cabecera nunca se pierden de vista. Por debajo de 1024 px las columnas se apilan y la página se desplaza con normalidad.

Los estados **no dependen del color**: cada uno lleva su símbolo (`✓ Encontrado`, `⚠ Confianza baja`, `✕ No encontrado`, `○ Pendiente`). Todos los campos tienen etiqueta escrita, no solo texto de relleno. El foco es visible en todo lo que se puede usar, incluidos los desplegables y las pestañas, que se recorren con las flechas como un control nativo.

El autocompletado de ciudad y departamento también se maneja solo con el teclado: flechas para recorrer, Enter para aceptar, Esc para cerrar sin perder lo escrito.

## Sobre la precisión

La aplicación prefiere pedirte que revises antes que darte unas coordenadas equivocadas.

Un caso real que ilustra por qué: buscar `Toks, Ciudad de Mexico` devuelve _algún_ Toks de la cadena con todas las señales coincidiendo al 100%, porque nada en el registro distingue una sucursal de otra. En vez de aceptarlo, la confianza se limita al 75% y el registro entra en la cola de revisión con el motivo escrito.

Las dos situaciones que fuerzan revisión:

- La consulta no incluyó dirección ni código postal.
- Dos candidatos quedaron prácticamente empatados.

**Cuanto mejor sea la dirección en tu Excel, más registros se resolverán solos.** Sin dirección, espera revisar a mano.

## Proveedores y límites

| Proveedor                 | Papel              | Límite                                                 |
| ------------------------- | ------------------ | ------------------------------------------------------ |
| Nominatim (OpenStreetMap) | Principal          | **1 consulta por segundo**, impuesto por la aplicación |
| Photon                    | Respaldo, opcional | Se activa en la sección Procesamiento                  |

Un grupo de N registros tarda del orden de N a 4N segundos, porque cada registro puede necesitar varias estrategias. Las consultas repetidas salen de la cache y no cuestan nada.

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

Hay un archivo de prueba en [`public/samples/ejemplo-tiendas.xlsx`](public/samples/ejemplo-tiendas.xlsx) con casos incómodos a propósito: título suelto antes de los encabezados, columna duplicada, columna irrelevante, fila en blanco, registro casi vacío y acentos.

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md) — estructura del código y decisiones tomadas.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — qué está hecho, qué se verificó y qué queda abierto.
  #   a a a 
   
   
