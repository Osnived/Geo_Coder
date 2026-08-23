# Geolocator

Aplicación web **local** para geolocalizar y enriquecer registros de establecimientos comerciales a partir de Excel o de ingreso manual.

Estado actual: **MVP 1 — importación, mapeo, entrada manual y normalización**. Todavía no geocodifica.

---

## Requisitos

- Node.js 20 o superior (probado con 24.16).
- Un navegador moderno.

No hace falta servidor, base de datos ni cuenta de ningún proveedor. Todo corre en tu máquina.

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

## Qué se puede hacer hoy

1. Cargar un archivo `.xlsx`, `.xlsm`, `.csv` o `.tsv`.
2. Elegir la hoja y ajustar cuál fila trae los encabezados.
3. Ver una vista previa de los datos tal como están en el archivo.
4. Revisar y corregir el mapeo de columnas a los campos normalizados.
5. Crear registros manualmente.
6. Combinar registros importados y manuales en una sola tabla.
7. Editar, duplicar y eliminar registros.
8. Filtrar por texto, origen, estado y por registros con problemas.
9. Definir un país global que restringe las búsquedas.
10. Cerrar y reabrir el navegador sin perder la sesión (IndexedDB).

Hay un archivo de prueba en [`samples/ejemplo-tiendas.xlsx`](samples/ejemplo-tiendas.xlsx) con casos incómodos a propósito: título suelto antes de los encabezados, columna duplicada, columna irrelevante, fila en blanco, registro casi vacío y acentos.

## Qué **no** hace todavía

Geocodificación, scoring, mapa, revisión manual de candidatos, exportación a Excel, IA. Están planificados en los MVP siguientes: ver [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Formatos de Excel

Se admiten `.xlsx` y `.xlsm`. **El formato antiguo `.xls` (Excel 97-2003) no se admite**: ábrelo en Excel y guárdalo como `.xlsx`. La aplicación lo detecta y te lo dice.

Para CSV se detecta automáticamente el separador (`,`, `;`, tabulador o `|`) y se recupera la codificación Windows-1252 que usa Excel en español.

## Privacidad

Los archivos se leen y procesan en tu navegador. No se suben a ningún servidor. Cuando lleguen los MVP de geocodificación, sí se enviarán consultas de texto a proveedores externos (Nominatim, Photon), y eso quedará indicado en la interfaz.

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md) — estructura del código y decisiones tomadas.
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — qué está hecho y qué sigue.
