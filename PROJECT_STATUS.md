# Estado del proyecto

Última actualización: 2026-08-23
Rama: `feature/geolocation-mvp-1`

## MVP 1 — completado

Importación, mapeo, entrada manual y normalización.

### Criterios de aceptación (spec §25)

| # | Criterio | Estado |
| --- | --- | --- |
| 1 | Abrir la aplicación localmente | ✅ `npm run dev` |
| 2 | Cargar un Excel | ✅ `.xlsx`, `.xlsm`, `.csv`, `.tsv` |
| 3 | Seleccionar una hoja | ✅ con nº de filas y columnas; las vacías se deshabilitan |
| 4 | Ver sus columnas | ✅ |
| 5 | Ver una preview | ✅ primeras 25 filas, con la numeración real del archivo |
| 6 | Mapear las columnas | ✅ sugerencia automática con nivel de certeza |
| 7 | Corregir manualmente el mapeo | ✅ incluido «ignorar columna» |
| 8 | Crear registros manualmente | ✅ |
| 9 | Combinar manuales e importados | ✅ mismo modelo, misma tabla |
| 10 | Ver todos los registros normalizados | ✅ con filtros |
| 11 | Editar registros | ✅ edición en línea |
| 12 | Eliminar registros | ✅ individual y por selección múltiple |
| 13 | Validar datos incompletos | ✅ errores y avisos, sin descartar nada |
| 14 | Preparar para el MVP de geocodificación | ✅ modelos, estados y configuración ya definidos |

### Verificación

- `npm run lint` — sin errores ni avisos.
- `npm run typecheck` — sin errores (TypeScript estricto, con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`).
- `npm test` — 123 tests, todos en verde.
- `npm run build` — correcto. 351 KB el bundle principal, 937 KB ExcelJS en un chunk aparte que solo se descarga al abrir un archivo.
- `npm audit` — 0 vulnerabilidades.

### Casos probados de la spec §29

| Caso | Cubierto en |
| --- | --- |
| Excel vacío | tests de `grid` y `workbookReader`; la hoja se marca «vacía» y no se puede elegir |
| Columnas desconocidas | quedan sin sugerencia y se ignoran por defecto |
| Columnas duplicadas | gana la de mayor certeza; la otra se marca «duplicada» |
| Registros incompletos | validación con avisos `ONLY_CLIENT` y `NO_LOCALITY` |
| Registros completamente vacíos | error `EMPTY_RECORD`; las filas en blanco del archivo no generan registro |
| Datos manuales | tests de store y de formulario |
| Excel + manual | test de combinación |
| Diferentes países | catálogo ISO completo; el archivo de prueba trae Colombia y México |
| Caracteres especiales y acentos | tests de `text`, `workbookReader` y el archivo de prueba |
| Nombres repetidos | la tabla los admite; los duplicados reales se abordarán con el scoring |

### Prueba manual realizada

Con [`samples/ejemplo-tiendas.xlsx`](samples/ejemplo-tiendas.xlsx) en el navegador:

- Se detectan las 3 hojas y se deshabilita la vacía.
- Se salta el título suelto y se identifica la fila 3 como encabezado.
- Se mapean 7 de 9 columnas; `VENTAS 2025` se ignora y la segunda `CIUDAD` se marca duplicada.
- La fila en blanco no genera registro: el botón anuncia 5 y se crean 5.
- Al fijar Colombia como país global, los errores de país desaparecen.
- Se agrega un registro manual y convive con los importados (5 + 1).
- Editar, duplicar y eliminar funcionan.
- Tras recargar la página se conservan los 6 registros, la edición y el país.

## Deuda y puntos abiertos

| Tema | Detalle |
| --- | --- |
| Tabla sin virtualizar | Con decenas de miles de registros la tabla se volverá lenta. Se resolverá cuando aparezca el problema, no antes. |
| Pesos de scoring sin validar | Los valores de `shared/config/geocoding.ts` son un punto de partida. Deben ajustarse con datos reales en el MVP 4. |
| Sin `.xls` | Decisión consciente, documentada en ARCHITECTURE.md. |
| Sin exportación | Llega en el MVP 8. Los datos originales ya se conservan para poder reconstruir el archivo. |

## Próximo: MVP 2 — Query Builder

Construir las consultas geográficas a partir de los campos disponibles, con estrategias alternativas cuando falten datos (spec §6).

Trabajo previsto:

- `domain/services/queryBuilder.ts`: genera una lista ordenada de consultas por registro.
- Estrategias en cascada, de la más específica a la más genérica.
- Vista previa en la interfaz: qué se buscará exactamente para cada registro, antes de gastar una sola petición.
- Tests con registros completos, parciales y ambiguos.

No requiere red ni proveedores todavía.

## Plan por MVP

| MVP | Contenido | Estado |
| --- | --- | --- |
| 1 | Importación + normalización + entrada manual | ✅ completado |
| 2 | Query Builder | pendiente |
| 3 | Geocodificación con Nominatim | pendiente |
| 4 | Scoring + candidatos + estados | pendiente |
| 5 | Cache + rate limiting + reintentos | pendiente |
| 6 | Mapa + revisión manual | pendiente |
| 7 | Corrección manual | pendiente |
| 8 | Exportación Excel | pendiente |
| 9 | Proveedor secundario / fallback | pendiente |
| 10 | IA opcional | pendiente |
