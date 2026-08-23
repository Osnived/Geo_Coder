import { useRef, useState, type DragEvent } from 'react'

import { cx } from '@/shared/cx'

const ACCEPT = '.xlsx,.xlsm,.csv,.tsv'

export function FileDropzone({
  onFile,
  isLoading,
}: {
  onFile: (file: File) => void
  isLoading: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isOver, setIsOver] = useState(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setIsOver(true)
      }}
      onDragLeave={() => {
        setIsOver(false)
      }}
      onDrop={handleDrop}
      className={cx(
        'rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
        isOver ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-muted',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          // Permite volver a elegir el mismo archivo tras corregirlo.
          event.target.value = ''
        }}
      />
      <p className="text-sm font-medium">
        {isLoading ? 'Leyendo archivo...' : 'Arrastra un archivo o eligelo'}
      </p>
      <p className="text-ink-muted mt-1 text-xs">
        Formatos admitidos: .xlsx, .xlsm, .csv, .tsv. Los .xls antiguos deben guardarse como .xlsx.
      </p>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => inputRef.current?.click()}
        className="border-border-strong bg-surface mt-3 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-45"
      >
        Elegir archivo
      </button>
    </div>
  )
}
