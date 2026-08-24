# Estado del proyecto

Última actualización: 2026-08-23
Rama: `feature/geolocation-mvp-1`

Los 10 MVP del plan están implementados. Nada se ha subido ni fusionado.

## Resumen

| MVP | Contenido | Estado |
| --- | --- | --- |
| 1 | Importación + normalización + entrada manual | ✅ |
| 2 | Query Builder | ✅ |
| 3 | Geocodificación con Nominatim | ✅ |
| 4 | Scoring + candidatos + estados | ✅ |
| 5 | Cache + rate limiting + reintentos | ✅ |
| 6 | Mapa + revisión manual | ✅ |
| 7 | Corrección manual | ✅ |
| 8 | Exportación Excel | ✅ |
| 9 | Proveedor secundario / fallback | ✅ |
| 10 | IA opcional | ✅ (apagada por defecto) |

Añadido después del plan original:

| Extra | Contenido | Estado |
| --- | --- | --- |
| Lotes | Agrupación por archivo/hoja o inserción manual, con fecha y hora | ✅ |
| Navegacion lateral | Barra lateral agrupada por etapa, con contadores y selector de pais; plegable en pantallas estrechas | ✅ |
| Vistas sin scroll de pagina | Registros y Busqueda ocupan la pantalla y se desplazan por dentro | ✅ |
| Plantilla de carga | Excel de ejemplo descargable desde la aplicación, con instrucciones | ✅ |
| Tablas anchas | Scroll horizontal arriba sincronizado y scroll vertical interno con cabecera fija | ✅ |
| Mapa global | Todos los registros localizados en un mapa, con selección bidireccional y vuelo con zoom al tocar una tarjeta | ✅ |

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Sin errores ni avisos |
| `npm run typecheck` | Sin errores (TS estricto, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test` | 317 tests, todos en verde |
| `npm run build` | Correcto |
| `npm audit` | 0 vulnerabilidades |

Tamaño de la build: 375 kB el bundle inicial; ExcelJS (937 kB) y la pantalla de revisión con Leaflet (161 kB) van en chunks aparte que solo se descargan al usarlos.

## Qué se probó de verdad, en el navegador

No solo tests unitarios. Contra el servidor de desarrollo y los servicios reales:

| Prueba | Resultado |
| --- | --- |
| Cargar `samples/ejemplo-tiendas.xlsx` | 3 hojas detectadas, la vacía deshabilitada |
| Detección de encabezados | Salta el título suelto, identifica la fila 3 |
| Mapeo automático | 7 de 9 columnas; `VENTAS 2025` ignorada, la segunda `CIUDAD` marcada como duplicada |
| Filas en blanco | El botón anuncia 5 registros y crea 5, no 6 |
| País global | Al fijar Colombia desaparecen los errores de país |
| Excel + manual | 5 importados y 1 manual conviven en la misma tabla |
| Editar / duplicar / eliminar | Correcto; los datos originales quedan intactos |
| Persistencia | Tras recargar la página se conservan registros, ediciones y ajustes |
| Geocodificación con Nominatim | `Olímpica Prado` resuelto a 11.00573, -74.81393 |
| Scoring | 83% con la dirección al 15%, porque OSM dice Carrera 52 y el Excel Cra. 54 |
| Cache | La segunda búsqueda idéntica no genera petición |
| Mapa | Tiles de OSM cargando, marcadores visibles |
| Marcar punto a mano | Pasa a MANUALLY_VERIFIED con proveedor `manual` y confianza 100% |
| Aceptar resultado | Sale de la cola de revisión |
| Photon como respaldo | Resolvió un registro que Nominatim no; proveedor `photon` en el resultado |
| Tope por ambigüedad | `Toks, Ciudad de Mexico` limitado al 75% con el motivo explicado |
| IA sin modelo escuchando | Mensaje claro y la aplicación sigue funcionando |
| Lotes | Cada importación crea su lote con archivo, hoja y hora; los registros previos caen en «Registros anteriores» sin romper nada; el filtro por lote muestra 3 de 6 |
| Mapa global | 3 marcadores con tiles cargando; elegir en la lista agranda el punto y elegir el punto resalta la fila |
| Elegir candidato | El candidato pasa a «actual», cambian las coordenadas, el registro sigue visible y el historial acumula los sustituidos; rectificar y «Siguiente pendiente» verificados |
| Barra lateral | Visible siempre en escritorio; en 375 px se pliega, el boton muestra la seccion actual, el fondo cierra y navegar tambien |
| Sin scroll de pagina | Ninguna de las ocho vistas desborda la pagina; en Registros la tabla se desplaza por dentro (405 de 707 px) y en Busqueda la lista (395 de 682 px) |
| Plantilla | Descargada desde la aplicación y vuelta a leer: 2 hojas, 8 encabezados, 3 filas de ejemplo, 20 filas de instrucciones; los 8 encabezados se auto-mapean con coincidencia exacta |
| Scroll de tablas | Barra superior aparece solo al desbordar y reacciona al redimensionar; sincronización en ambos sentidos (500↔500, 120↔120); el scroll vertical no mueve la página y la cabecera queda pegada arriba |
| Vuelo al tocar una tarjeta | De zoom 5 a zoom 17 centrado en las coordenadas exactas del registro, en los dos registros probados; «Ver todos» vuelve a zoom 5; pinchar un marcador resalta la fila sin mover el mapa |
| Exportación a Excel | Archivo descargado y vuelto a leer: 28 columnas, 3 filas, las 9 originales intactas (con `CIUDAD (2)` desambiguada) y los tres proveedores representados (`manual`, `nominatim`, `photon`) |

## Casos de la especificación §29

| Caso | Cubierto en |
| --- | --- |
| Excel vacío | Tests de `grid` y `workbookReader`; la hoja se marca vacía y no se puede elegir |
| Columnas desconocidas | Quedan sin sugerencia y se ignoran por defecto |
| Columnas duplicadas | Gana la de mayor certeza; la otra se marca «duplicada» |
| Registros incompletos | Avisos `ONLY_CLIENT` y `NO_LOCALITY` |
| Registros completamente vacíos | Error `EMPTY_RECORD`; las filas en blanco no generan registro |
| Datos manuales | Tests de store y de formulario |
| Excel + manual | Test de combinación |
| Diferentes países | Catálogo ISO completo; probado con Colombia y México |
| Caracteres especiales y acentos | Tests de `text`, `similarity`, `workbookReader` y el archivo de prueba |
| Nombres repetidos | Los topes de confianza los mandan a revisión en lugar de resolverlos mal |

## Fallos encontrados y corregidos durante el desarrollo

Vale la pena dejarlos escritos porque explican decisiones del código:

1. **Papa Parse detecta mal el `;`** de los CSV de Excel en español. Se sustituyó por detección propia.
2. **Photon devuelve 400 con `lang=es`.** Solo admite `default`, `de`, `en`, `fr`. Se omite el parámetro.
3. **jsdom no implementa `Blob.arrayBuffer`.** Se rellena en el setup de tests, sin tocar el código de producción.
4. **Añadir el campo `notes` rompió la app al recargar** con datos ya guardados en IndexedDB. Se añadió una capa de migración en el borde de la persistencia.
5. **El botón prometía más registros de los que creaba** cuando el Excel tenía filas en blanco. Ahora cuenta las filas que realmente generan registro.
6. **Los `NOT_FOUND` se reintentaban en cada ejecución**, gastando peticiones para obtener el mismo vacío. Ahora es una acción explícita.
7. **Un Toks equivocado puntuaba 100%.** Se añadieron los topes de confianza por poca especificidad y por ambigüedad.
8. **Elegir un candidato parecía no hacer nada.** El registro pasaba a verificado, dejaba de cumplir el filtro de la cola y desaparecía en el acto. Ahora el seleccionado permanece a la vista y se avanza con «Siguiente pendiente».
9. **`map.flyTo` no movía el mapa** cuando la pestaña no está pintando: su animación depende de `requestAnimationFrame`, que el navegador pausa. Se añadió una comprobación posterior que coloca el mapa sin animación si el vuelo no llegó.

## Deuda y puntos abiertos

| Tema | Detalle |
| --- | --- |
| **Pesos de scoring sin validar con volumen** | Los valores de `shared/config/geocoding.ts` funcionan en las pruebas hechas, pero no se han calibrado contra un dataset grande y real. Es lo primero que ajustaría con datos tuyos. |
| **Tabla sin virtualizar** | Con decenas de miles de registros la tabla de Registros se volverá lenta. No se ha optimizado porque aún no es un problema medido. |
| **Sin `.xls`** | Decisión consciente, documentada en ARCHITECTURE.md. |
| **IA solo con modelo local** | Un servicio alojado necesitaría un proxy con la clave en el servidor. La arquitectura lo permite; no está hecho. |
| **Sin control de duplicados** | Si el Excel trae la misma tienda dos veces, se geocodifica dos veces (la segunda sale de cache, pero ocupa dos registros). |
| **Volumen y Nominatim** | Un lote de miles de registros a 1 consulta por segundo son horas. Es un límite del servicio, no del código. Para volúmenes grandes habría que valorar una instancia propia de Nominatim o un proveedor de pago. |

## Posibles siguientes pasos

Por orden de valor, si quieres continuar:

1. **Calibrar el scoring** con un Excel real tuyo y ajustar pesos y umbrales.
2. **Detección de duplicados** antes de geocodificar.
3. **Reanudar lotes largos** guardando el progreso, para poder cerrar el navegador a mitad.
4. **Instancia propia de Nominatim** si el volumen lo justifica: quita el límite de 1 consulta por segundo.
5. **Backend mínimo** si se quiere compartir sesiones entre personas o usar un modelo de IA alojado.
