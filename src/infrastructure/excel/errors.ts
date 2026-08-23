export type ExcelErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPT_FILE'
  | 'NO_SHEETS'
  | 'SHEET_NOT_FOUND'
  | 'EMPTY_SHEET'
  | 'NO_HEADERS'

const MESSAGES: Record<ExcelErrorCode, string> = {
  UNSUPPORTED_FORMAT:
    'Formato no soportado. Usa .xlsx o .csv. Si tienes un .xls antiguo, abrelo en Excel y guardalo como .xlsx.',
  CORRUPT_FILE: 'No se pudo leer el archivo. Puede estar danado o no ser un Excel valido.',
  NO_SHEETS: 'El archivo no contiene ninguna hoja.',
  SHEET_NOT_FOUND: 'La hoja indicada no existe en el archivo.',
  EMPTY_SHEET: 'La hoja no tiene datos.',
  NO_HEADERS: 'No se encontro una fila de encabezados con contenido.',
}

/** Error de lectura con codigo estable, para que la UI decida como mostrarlo. */
export class ExcelReadError extends Error {
  readonly code: ExcelErrorCode

  constructor(code: ExcelErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code])
    this.name = 'ExcelReadError'
    this.code = code
  }
}

export function isExcelReadError(error: unknown): error is ExcelReadError {
  return error instanceof ExcelReadError
}
