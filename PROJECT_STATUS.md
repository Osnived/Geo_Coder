# Estado del proyecto

Última actualización: 2026-08-31
Rama: `main`

Los 10 MVP del plan están implementados. Nada se ha subido ni fusionado.

## Resumen

| MVP | Contenido                                    | Estado                   |
| --- | -------------------------------------------- | ------------------------ |
| 1   | Importación + normalización + entrada manual | ✅                       |
| 2   | Query Builder                                | ✅                       |
| 3   | Geocodificación con Nominatim                | ✅                       |
| 4   | Scoring + candidatos + estados               | ✅                       |
| 5   | Cache + rate limiting + reintentos           | ✅                       |
| 6   | Mapa + revisión manual                       | ✅                       |
| 7   | Corrección manual                            | ✅                       |
| 8   | Exportación Excel                            | ✅                       |
| 9   | Proveedor secundario / fallback              | ✅                       |
| 10  | IA opcional                                  | ✅ (apagada por defecto) |

Añadido después del plan original:

| Extra                              | Contenido                                                                                                               | Estado |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| Lotes                              | Agrupación por archivo/hoja o inserción manual, con fecha y hora                                                        | ✅     |
| Navegacion lateral                 | Barra lateral agrupada por etapa, con contadores y selector de pais; plegable en pantallas estrechas                    | ✅     |
| Agrupacion en el mapa              | Puntos cercanos agrupados en globos con recuento, con interruptor y apertura al pinchar                                 | ✅     |
| Vistas sin scroll de pagina        | Registros y Busqueda ocupan la pantalla y se desplazan por dentro                                                       | ✅     |
| Plantilla de carga                 | Excel de ejemplo descargable desde la aplicación, con instrucciones                                                     | ✅     |
| Tablas anchas                      | Scroll horizontal arriba sincronizado y scroll vertical interno con cabecera fija                                       | ✅     |
| Mapa global                        | Todos los registros localizados en un mapa, con selección bidireccional y vuelo con zoom al tocar una tarjeta           | ✅     |
| **Vista Datos unificada**          | Carga masiva, ingreso manual y grupos recién ingresados en una sola pestaña                                             | ✅     |
| **Grupos por origen**              | Un grupo por archivo importado y uno por sesión de entrada manual, con id propio                                        | ✅     |
| **Reintentos por lote**            | Porcentaje mínimo y número de reintentos configurables; solo se reintenta lo que falló                                  | ✅     |
| **Revisión a pantalla completa**   | Resumen de dos líneas, cola agrupada por origen con filtros, mapa dominante y detalle en pestañas                       | ✅     |
| **Exportación por grupo**          | Selección de uno, varios o todos los grupos y de qué bloques de columnas incluir                                        | ✅     |
| **Columnas geográficas separadas** | Estado/Departamento, Municipio/Ciudad, Código ZIP, Dirección encontrada, Coordenadas, Latitud, Longitud                 | ✅     |
| **Accesibilidad**                  | Estados con símbolo además de color, etiquetas visibles, foco visible, pestañas navegables con flechas, contraste 4,5:1 | ✅     |

## Verificación

| Comprobación        | Resultado                                                                           |
| ------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`      | Sin errores ni avisos                                                               |
| `npm run typecheck` | Sin errores (TS estricto, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `npm test`          | 464 tests, todos en verde                                                           |
| `npm run build`     | Correcto                                                                            |
| `npm audit`         | 0 vulnerabilidades                                                                  |

Tamaño de la build: 422 kB el bundle inicial (135 kB comprimido); ExcelJS (937 kB), Leaflet (159 kB) y la pantalla de revisión (17 kB) van en chunks aparte que solo se descargan al usarlos. El bundle inicial creció 47 kB con las vistas nuevas.

## Qué se probó de verdad, en el navegador

No solo tests unitarios. Contra el servidor de desarrollo y los servicios reales:

| Prueba                                | Resultado                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargar `samples/ejemplo-tiendas.xlsx` | 3 hojas detectadas, la vacía deshabilitada                                                                                                                                                          |
| Detección de encabezados              | Salta el título suelto, identifica la fila 3                                                                                                                                                        |
| Mapeo automático                      | 7 de 9 columnas; `VENTAS 2025` ignorada, la segunda `CIUDAD` marcada como duplicada                                                                                                                 |
| Filas en blanco                       | El botón anuncia 5 registros y crea 5, no 6                                                                                                                                                         |
| País global                           | Al fijar Colombia desaparecen los errores de país                                                                                                                                                   |
| Excel + manual                        | 5 importados y 1 manual conviven en la misma tabla                                                                                                                                                  |
| Editar / duplicar / eliminar          | Correcto; los datos originales quedan intactos                                                                                                                                                      |
| Persistencia                          | Tras recargar la página se conservan registros, ediciones y ajustes                                                                                                                                 |
| Geocodificación con Nominatim         | `Olímpica Prado` resuelto a 11.00573, -74.81393                                                                                                                                                     |
| Scoring                               | 83% con la dirección al 15%, porque OSM dice Carrera 52 y el Excel Cra. 54                                                                                                                          |
| Cache                                 | La segunda búsqueda idéntica no genera petición                                                                                                                                                     |
| Mapa                                  | Tiles de OSM cargando, marcadores visibles                                                                                                                                                          |
| Marcar punto a mano                   | Pasa a MANUALLY_VERIFIED con proveedor `manual` y confianza 100%                                                                                                                                    |
| Aceptar resultado                     | Sale de la cola de revisión                                                                                                                                                                         |
| Photon como respaldo                  | Resolvió un registro que Nominatim no; proveedor `photon` en el resultado                                                                                                                           |
| Tope por ambigüedad                   | `Toks, Ciudad de Mexico` limitado al 75% con el motivo explicado                                                                                                                                    |
| IA sin modelo escuchando              | Mensaje claro y la aplicación sigue funcionando                                                                                                                                                     |
| Lotes                                 | Cada importación crea su lote con archivo, hoja y hora; los registros previos caen en «Registros anteriores» sin romper nada; el filtro por lote muestra 3 de 6                                     |
| Mapa global                           | 3 marcadores con tiles cargando; elegir en la lista agranda el punto y elegir el punto resalta la fila                                                                                              |
| Mapa a pantalla completa              | Ambos paneles a 768 px de una ventana de 800, mapa de 671 px, sin scroll de pagina                                                                                                                  |
| Agrupacion                            | A zoom 8 un globo de 2 mas un pin suelto; a zoom 3 un unico globo de 3; pinchar el globo lo abre (zoom 3 a 6); el punto seleccionado sale del grupo y se ve aparte                                  |
| Previsualizar candidato               | Tocar la ficha vuela el mapa (zoom 15 a 17) y resalta la chincheta sin cambiar coordenadas ni estado del registro; pinchar la chincheta marca su ficha; «Volver al actual» deshace                  |
| Elegir candidato                      | El candidato pasa a «actual», cambian las coordenadas, el registro sigue visible y el historial acumula los sustituidos; rectificar y «Siguiente pendiente» verificados                             |
| Barra lateral                         | Visible siempre en escritorio; en 375 px se pliega, el boton muestra la seccion actual, el fondo cierra y navegar tambien                                                                           |
| Sin scroll de pagina                  | Ninguna de las ocho vistas desborda la pagina; en Registros la tabla se desplaza por dentro (405 de 707 px) y en Busqueda la lista (395 de 682 px)                                                  |
| Plantilla                             | Descargada desde la aplicación y vuelta a leer: 2 hojas, 8 encabezados, 3 filas de ejemplo, 20 filas de instrucciones; los 8 encabezados se auto-mapean con coincidencia exacta                     |
| Scroll de tablas                      | Barra superior aparece solo al desbordar y reacciona al redimensionar; sincronización en ambos sentidos (500↔500, 120↔120); el scroll vertical no mueve la página y la cabecera queda pegada arriba |
| Vuelo al tocar una tarjeta            | De zoom 5 a zoom 17 centrado en las coordenadas exactas del registro, en los dos registros probados; «Ver todos» vuelve a zoom 5; pinchar un marcador resalta la fila sin mover el mapa             |
| Exportación a Excel                   | Archivo descargado y vuelto a leer: 28 columnas, 3 filas, las 9 originales intactas (con `CIUDAD (2)` desambiguada) y los tres proveedores representados (`manual`, `nominatim`, `photon`)          |

### Rediseño de flujo, grupos y accesibilidad (2026-08-31)

| Prueba                            | Resultado                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Barra lateral nueva               | Flujo: Datos · Procesamiento · Revisión · Exportar; Herramientas: Mapa · Ajustes. `Registros` ya no aparece como destino                                                                                                                                                                                     |
| Vista Datos                       | Pestañas «Carga masiva» / «Ingreso manual» con el listado de grupos y la configuración a la derecha, sin salir de la pestaña                                                                                                                                                                                 |
| Grupo manual por sesión           | 2 registros seguidos → 1 grupo «Manual — 31/08/2026, 09:01»; el aviso nombra el grupo al agregar                                                                                                                                                                                                             |
| Cerrar grupo                      | Tras cerrarlo, el siguiente registro abre un grupo distinto: 2 grupos, 2 y 1 registros                                                                                                                                                                                                                       |
| Configuración de geocodificación  | Defectos 40 % y 3; `min`/`max` de los campos en 0-100 y 0-10; guardar deja «Activo: mínimo 70 % · hasta 3 reintento(s)» y sobrevive a recargar                                                                                                                                                               |
| Reintentos, camino real           | 3 registros contra Nominatim: 12 consultas reales, los 3 con candidato al 75 % limitado por poca especificidad. El bucle se detuvo en la pasada inicial con «No queda nada que reintentar: los registros que faltan ya tienen un candidato y necesitan una decisión humana» en lugar de gastar 3 vueltas más |
| Historial de vueltas              | «Pasada inicial 0/3 geocodificados · 0 %», con la barra de éxito y la marca del mínimo configurado                                                                                                                                                                                                           |
| Revisión, uso del espacio         | A 1440×900: resumen en una línea, mapa de 850×454 px, cero scroll de página                                                                                                                                                                                                                                  |
| Revisión, agrupación              | Cola partida por grupo con cabecera pegajosa: «MANUAL — 31/08/2026, 09:01 (2)» y «(1)»                                                                                                                                                                                                                       |
| Revisión, componentes geográficos | En la pestaña Resultado: Estado/Departamento `Atlántico`, Municipio/Ciudad, Código ZIP `080002`, País `Colombia`, y «Coordenadas (longitud, latitud): -74.796948, 11.001995»                                                                                                                                 |
| Pestañas con teclado              | Flecha derecha mueve selección y foco de «Resultado» a «Candidatos 2» (`aria-selected` correcto, una sola parada de tabulación)                                                                                                                                                                              |
| Ver registros desde un grupo      | Abre la tabla filtrada por ese grupo (2 de 3) con «← Volver a Datos» arriba                                                                                                                                                                                                                                  |
| Exportar, selección de grupos     | Todos → 3; un grupo → 1 («Exportar 1 registro(s)»); dos grupos → 3. Las columnas del grupo excluido desaparecen                                                                                                                                                                                              |
| Exportar, columnas                | 28 columnas, todas legibles en castellano; ningún `lat`, `lng` ni `formatted_address`                                                                                                                                                                                                                        |
| Exportar, ejecución               | Archivo `geolocator-2026-08-31-14-09-36.xlsx` generado sin errores de consola y con el aviso «Exportación completada: 3 registro(s)»                                                                                                                                                                         |
| Mapa global                       | 757 px de alto sin scroll de página; las fichas llevan grupo y estado con símbolo                                                                                                                                                                                                                            |
| Responsive a 375 px               | Sin desborde horizontal en ninguna vista; en Revisión la cola queda en 414 px y el mapa en 286 px, y la página se desplaza                                                                                                                                                                                   |
| Consola                           | Sin errores en ninguna de las vistas recorridas                                                                                                                                                                                                                                                              |

## Casos de la especificación §29

| Caso                            | Cubierto en                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Excel vacío                     | Tests de `grid` y `workbookReader`; la hoja se marca vacía y no se puede elegir |
| Columnas desconocidas           | Quedan sin sugerencia y se ignoran por defecto                                  |
| Columnas duplicadas             | Gana la de mayor certeza; la otra se marca «duplicada»                          |
| Registros incompletos           | Avisos `ONLY_CLIENT` y `NO_LOCALITY`                                            |
| Registros completamente vacíos  | Error `EMPTY_RECORD`; las filas en blanco no generan registro                   |
| Datos manuales                  | Tests de store y de formulario                                                  |
| Excel + manual                  | Test de combinación                                                             |
| Diferentes países               | Catálogo ISO completo; probado con Colombia y México                            |
| Caracteres especiales y acentos | Tests de `text`, `similarity`, `workbookReader` y el archivo de prueba          |
| Nombres repetidos               | Los topes de confianza los mandan a revisión en lugar de resolverlos mal        |

## Fallos encontrados y corregidos durante el desarrollo

Vale la pena dejarlos escritos porque explican decisiones del código:

1. **Papa Parse detecta mal el `;`** de los CSV de Excel en español. Se sustituyó por detección propia.
2. **Photon devuelve 400 con `lang=es`.** Solo admite `default`, `de`, `en`, `fr`. Se omite el parámetro.
3. **jsdom no implementa `Blob.arrayBuffer`.** Se rellena en el setup de tests, sin tocar el código de producción.
4. **Añadir el campo `notes` rompió la app al recargar** con datos ya guardados en IndexedDB. Se añadió una capa de migración en el borde de la persistencia.
5. **El botón prometía más registros de los que creaba** cuando el Excel tenía filas en blanco. Ahora cuenta las filas que realmente generan registro.
6. **Los `NOT_FOUND` se reintentaban en cada ejecución**, gastando peticiones para obtener el mismo vacío. Ahora es una acción explícita.
7. **Un Toks equivocado puntuaba 100%.** Se añadieron los topes de confianza por poca especificidad y por ambigüedad.
8. **El mapa se quedaba con un encuadre imposible** si se montaba con el contenedor sin tamaño útil: se dibujó con 2 px de alto y quedó clavado en zoom 19. Leaflet no observa su contenedor; ahora se le avisa con `invalidateSize()` y se rehace el encuadre la primera vez que hay sitio.
9. **No se podía ver un candidato antes de elegirlo.** La única acción era «Usar este», una decisión irreversible a ciegas. Ahora tocar la ficha lo enseña en el mapa sin tocar el registro.
10. **Elegir un candidato parecía no hacer nada.** El registro pasaba a verificado, dejaba de cumplir el filtro de la cola y desaparecía en el acto. Ahora el seleccionado permanece a la vista y se avanza con «Siguiente pendiente».
11. **`map.flyTo` no movía el mapa** cuando la pestaña no está pintando: su animación depende de `requestAnimationFrame`, que el navegador pausa. Se añadió una comprobación posterior que coloca el mapa sin animación si el vuelo no llegó.
12. **Dos grupos manuales creados en el mismo milisegundo compartían identificador.** El id se derivaba de la marca de tiempo, así que cerrar un grupo para empezar otro no servía de nada si se hacía rápido. Lo encontró un test al primer intento. Ahora el id es propio y la fecha solo da el nombre visible.
13. **Los componentes geográficos del proveedor se tiraban.** Nominatim y Photon ya devolvían estado, municipio y código postal separados, pero se perdían al construir el resultado y la exportación solo tenía una dirección formateada. Ahora el resultado los guarda.
14. **Con el alto completo aplicado en móvil, el mapa se dibujaba con 0 px.** A 375 px las columnas se apilan y repartir el alto de la ventana entre cuatro bloques dejaba la cola de revisión en 60 px y el mapa en nada. El alto completo se aplica ahora solo desde `lg`, y los mapas llevan alto mínimo.
15. **Los tres filtros de la tabla de registros se comprimían hasta solaparse** en pantalla estrecha (`GRUPOORIGENESTADO`). Se les dio ancho mínimo para que salten de línea en lugar de encogerse.
16. **`describeBatch` repetía el nombre en los CSV** («tiendas.csv · tiendas.csv»), porque un CSV no tiene hojas y el lector usa el nombre del archivo también como nombre de hoja.
17. **La ayuda de un campo entraba en su nombre accesible.** `Field` envolvía el control en el `<label>`, así que «Ciudad» se llamaba «Ciudad Fija un país en la barra lateral» y, con el desplegable de sugerencias, «Ciudad Buscando sugerencias». Lo destaparon los tests del formulario manual. La asociación pasó a ser explícita con `htmlFor`.
18. **La vuelta de las flechas del desplegable fallaba sin nada resaltado:** flecha arriba iba al segundo elemento en lugar de al último, porque la aritmética modular no contemplaba el estado «sin selección». Lo cazó un test al primer intento.
19. **Elegir una sugerencia disparaba otra consulta** preguntando por lo que se acababa de elegir: una petición tirada y el desplegable reabriéndose con la opción ya escogida.

## Deuda y puntos abiertos

| Tema                                            | Detalle                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pesos de scoring sin validar con volumen**    | Los valores de `shared/config/geocoding.ts` funcionan en las pruebas hechas, pero no se han calibrado contra un dataset grande y real. Es lo primero que ajustaría con datos tuyos.                                                                                                                                          |
| **Tabla sin virtualizar**                       | Con decenas de miles de registros la tabla de Registros se volverá lenta. No se ha optimizado porque aún no es un problema medido.                                                                                                                                                                                           |
| **Sin `.xls`**                                  | Decisión consciente, documentada en ARCHITECTURE.md.                                                                                                                                                                                                                                                                         |
| **IA solo con modelo local**                    | Un servicio alojado necesitaría un proxy con la clave en el servidor. La arquitectura lo permite; no está hecho.                                                                                                                                                                                                             |
| **Sin control de duplicados**                   | Si el Excel trae la misma tienda dos veces, se geocodifica dos veces (la segunda sale de cache, pero ocupa dos registros).                                                                                                                                                                                                   |
| **El reintento repite la misma consulta**       | La política decide _a quién_ reintentar, no _cómo_. Un `NOT_FOUND` se vuelve a pedir con las mismas estrategias, así que solo cambia algo si el proveedor falló por red o por cupo. Variar la consulta entre vueltas —relajar la dirección, probar sin el nombre de la cadena— es el siguiente paso natural y no está hecho. |
| **El grupo manual no sobrevive a una recarga**  | Es deliberado: una sesión de entrada termina cuando termina la sesión del navegador. Si al recargar se quisiera seguir en el mismo grupo, habría que persistir `activeManualBatchId`.                                                                                                                                        |
| **Contraste comprobado por cálculo, no medido** | Los colores se eligieron para cumplir 4,5:1 según la luminosidad de `oklch`, y se revisaron a ojo en el navegador. No se ha pasado un medidor automático sobre cada combinación real.                                                                                                                                        |
| **Volumen y Nominatim**                         | Un lote de miles de registros a 1 consulta por segundo son horas. Es un límite del servicio, no del código. Para volúmenes grandes habría que valorar una instancia propia de Nominatim o un proveedor de pago.                                                                                                              |

## Posibles siguientes pasos

Por orden de valor, si quieres continuar:

1. **Calibrar el scoring** con un Excel real tuyo y ajustar pesos y umbrales. Es lo que más movería el porcentaje de éxito: en la prueba de esta sesión los tres registros quedaron limitados al 75 % por no llevar código postal, no por estar mal encontrados.
2. **Variar la consulta en los reintentos**, para que una segunda vuelta pueda encontrar lo que la primera no.
3. **Detección de duplicados** antes de geocodificar.
4. **Reanudar lotes largos** guardando el progreso, para poder cerrar el navegador a mitad.
5. **Instancia propia de Nominatim** si el volumen lo justifica: quita el límite de 1 consulta por segundo.
6. **Backend mínimo** si se quiere compartir sesiones entre personas o usar un modelo de IA alojado.
