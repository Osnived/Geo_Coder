import { useAppStore } from '@/app/store'
import { Select } from '@/components/ui/primitives'
import { COUNTRIES, findCountryByCode } from '@/shared/countries'

/**
 * Selector de pais global (spec seccion 8). Se guarda nombre y codigo ISO,
 * y se aplica a los registros que no traen pais propio.
 */
export function CountrySelector() {
  const country = useAppStore((state) => state.country)
  const requireCountry = useAppStore((state) => state.requireCountry)
  const setCountry = useAppStore((state) => state.setCountry)
  const setRequireCountry = useAppStore((state) => state.setRequireCountry)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-ink-muted">Pais</span>
        <Select
          aria-label="Pais por defecto"
          className="w-56"
          value={country?.code ?? ''}
          onChange={(event) => {
            setCountry(event.target.value === '' ? null : findCountryByCode(event.target.value))
          }}
        >
          <option value="">Sin definir</option>
          {COUNTRIES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name} ({option.code})
            </option>
          ))}
        </Select>
      </label>

      <label className="text-ink-muted flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={requireCountry}
          onChange={(event) => {
            setRequireCountry(event.target.checked)
          }}
        />
        Exigir pais
      </label>
    </div>
  )
}
