import { useState, type FormEvent } from 'react'

import { useAppStore } from '@/app/store'
import { Button, Callout, Field, Select, TextInput } from '@/components/ui/primitives'
import { COUNTRIES } from '@/shared/countries'

/**
 * Descubrir locales de una marca en OpenStreetMap.
 *
 * Primero se buscan y se muestran; solo al confirmar se guardan como un grupo
 * nuevo. Mientras se completan las direcciones con Nominatim no se puede guardar,
 * para no crear un grupo a medio llenar sin querer.
 */

const DEFAULT_BRAND = 'Soriana'
const DEFAULT_COUNTRY_CODE = 'MX'
/** Locales que se listan en la vista previa. El resto entra igual al guardar. */
const PREVIEW_LIMIT = 50

function streetOf(street: string, houseNumber: string): string {
  return `${street} ${houseNumber}`.trim()
}

export function DiscoveryPanel() {
  const sessionCountry = useAppStore((state) => state.country)
  const status = useAppStore((state) => state.discoveryStatus)
  const query = useAppStore((state) => state.discoveryQuery)
  const places = useAppStore((state) => state.discoveredPlaces)
  const error = useAppStore((state) => state.discoveryError)
  const progress = useAppStore((state) => state.discoveryProgress)
  const searchPlaces = useAppStore((state) => state.searchPlaces)
  const importDiscoveredPlaces = useAppStore((state) => state.importDiscoveredPlaces)
  const stopEnrichment = useAppStore((state) => state.stopEnrichment)
  const clearDiscovery = useAppStore((state) => state.clearDiscovery)

  const [brand, setBrand] = useState(DEFAULT_BRAND)
  const [countryCode, setCountryCode] = useState(sessionCountry?.code ?? DEFAULT_COUNTRY_CODE)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isSearching = status === 'searching'
  const isEnriching = status === 'enriching'
  const isBusy = isSearching || isEnriching
  const hasResults = query !== null && places.length > 0

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavedCount(null)
    void searchPlaces(brand, countryCode)
  }

  const handleImport = () => {
    setIsSaving(true)
    void importDiscoveredPlaces()
      .then((count) => {
        setSavedCount(count)
      })
      .finally(() => {
        setIsSaving(false)
      })
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleSearch}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <Field
          label="Marca"
          hint="Escrita igual que en OpenStreetMap, con mayúsculas. Ejemplo: Soriana."
        >
          <TextInput
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value)
            }}
            maxLength={60}
            required
          />
        </Field>

        <Field label="País">
          <Select
            value={countryCode}
            onChange={(event) => {
              setCountryCode(event.target.value)
            }}
          >
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" variant="primary" disabled={isBusy}>
          {isSearching ? 'Buscando...' : 'Buscar en OpenStreetMap'}
        </Button>
      </form>

      {isSearching ? (
        <p role="status" className="text-ink-muted text-sm">
          Consultando OpenStreetMap. Puede tardar hasta un minuto.
        </p>
      ) : null}

      {isEnriching ? (
        <div className="border-border-subtle flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
          <p role="status" className="text-sm">
            Completando direcciones con Nominatim:{' '}
            <span className="font-semibold tabular-nums">{String(progress.done)}</span> de{' '}
            {String(progress.total)}. Va a una petición por segundo, así que puede tardar varios
            minutos.
          </p>
          <Button variant="ghost" onClick={stopEnrichment}>
            Detener
          </Button>
        </div>
      ) : null}

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {savedCount !== null ? (
        <Callout tone="ok">
          {savedCount === 1
            ? 'Se agregó 1 local como grupo nuevo en Datos.'
            : `Se agregaron ${String(savedCount)} locales como grupo nuevo en Datos.`}
        </Callout>
      ) : null}

      {status === 'ready' && query !== null && places.length === 0 ? (
        <Callout tone="warn">
          OpenStreetMap no tiene locales de «{query.brand}» en {query.country.name}. Puede que
          ningún colaborador los haya mapeado todavía.
        </Callout>
      ) : null}

      {hasResults && !isSearching ? (
        <section aria-label="Locales encontrados" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{places.length}</span> local(es) de «
              {query.brand}» en {query.country.name}.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={clearDiscovery} disabled={isSaving || isEnriching}>
                Descartar
              </Button>
              <Button variant="primary" onClick={handleImport} disabled={isSaving || isBusy}>
                {isSaving ? 'Guardando...' : `Agregar ${String(places.length)} como grupo`}
              </Button>
            </div>
          </div>

          <div className="border-border-subtle max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Locales encontrados en OpenStreetMap</caption>
              <thead className="bg-surface-muted text-ink-muted sticky top-0 text-xs">
                <tr>
                  <th scope="col" className="px-2.5 py-1.5 font-medium">
                    Nombre
                  </th>
                  <th scope="col" className="px-2.5 py-1.5 font-medium">
                    Dirección
                  </th>
                  <th scope="col" className="px-2.5 py-1.5 font-medium">
                    Ciudad
                  </th>
                  <th scope="col" className="px-2.5 py-1.5 font-medium">
                    Estado/Departamento
                  </th>
                  <th scope="col" className="px-2.5 py-1.5 font-medium">
                    Coordenadas
                  </th>
                </tr>
              </thead>
              <tbody>
                {places.slice(0, PREVIEW_LIMIT).map((place) => (
                  <tr key={place.osmId} className="border-border-subtle border-t">
                    <td className="px-2.5 py-1.5">{place.name || '(sin nombre)'}</td>
                    <td className="px-2.5 py-1.5">
                      {streetOf(place.components.street, place.components.houseNumber) || '—'}
                    </td>
                    <td className="px-2.5 py-1.5">{place.components.city || '—'}</td>
                    <td className="px-2.5 py-1.5">{place.components.region || '—'}</td>
                    <td className="text-ink-muted px-2.5 py-1.5 tabular-nums">
                      {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {places.length > PREVIEW_LIMIT ? (
            <p className="text-ink-muted text-xs">
              Mostrando {String(PREVIEW_LIMIT)} de {places.length}. Los demás se guardan igual.
            </p>
          ) : null}

          <p className="text-ink-muted text-xs">
            Datos © colaboradores de OpenStreetMap, licencia ODbL. Direcciones completadas con
            Nominatim cuando la fuente no las traía. La exportación incluye la atribución.
          </p>
        </section>
      ) : null}
    </div>
  )
}
