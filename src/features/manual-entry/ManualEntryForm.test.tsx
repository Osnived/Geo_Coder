import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setPlacesProvider, setRepository, useAppStore } from '@/app/store'
import type { PlaceSuggestion, PlaceSuggestionProvider } from '@/domain/services/placeProvider'
import { createInMemoryRepository } from '@/infrastructure/storage'

import { ManualEntryForm } from './ManualEntryForm'

/** Proveedor de mentira: devuelve lo que se le diga, sin salir a la red. */
function fakeProvider(suggestions: readonly PlaceSuggestion[]): PlaceSuggestionProvider {
  return {
    name: 'falso',
    suggest: (query) => Promise.resolve(suggestions.filter((entry) => entry.kind === query.kind)),
  }
}

const BARRANQUILLA: PlaceSuggestion = {
  name: 'Barranquilla',
  kind: 'city',
  region: 'Atlántico',
  countryCode: 'CO',
  countryName: 'Colombia',
}

const INITIAL = useAppStore.getState()

beforeEach(() => {
  setRepository(createInMemoryRepository())
  useAppStore.setState({
    ...INITIAL,
    records: [],
    batches: [],
    activeManualBatchId: null,
    country: null,
  })
  setPlacesProvider(null)
})

afterEach(() => {
  setPlacesProvider(null)
})

describe('ManualEntryForm', () => {
  it('crea un registro con los datos escritos', async () => {
    const user = userEvent.setup()
    render(<ManualEntryForm />)

    await user.type(screen.getByLabelText('Cliente / cadena'), 'Toks')
    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Plaza Universidad')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    const records = useAppStore.getState().records
    expect(records).toHaveLength(1)
    expect(records[0]?.fields.client).toBe('Toks')
    expect(records[0]?.fields.location_name).toBe('Toks Plaza Universidad')
    expect(records[0]?.source).toBe('manual')
  })

  it('no permite agregar un registro completamente vacio', () => {
    render(<ManualEntryForm />)
    expect(screen.getByRole('button', { name: 'Agregar registro' })).toBeDisabled()
  })

  it('conserva cliente y tipo tras agregar, para cargas seguidas', async () => {
    const user = userEvent.setup()
    render(<ManualEntryForm />)

    await user.type(screen.getByLabelText('Cliente / cadena'), 'Olimpica')
    await user.type(screen.getByLabelText('Nombre del local'), 'Olimpica Calle 72')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    expect(screen.getByLabelText('Cliente / cadena')).toHaveValue('Olimpica')
    expect(screen.getByLabelText('Nombre del local')).toHaveValue('')
  })

  it('agrupa los registros de la sesion y lo dice al agregarlos', async () => {
    const user = userEvent.setup()
    render(<ManualEntryForm />)

    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Plaza')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    // El aviso nombra el grupo, no solo dice "hecho".
    expect(await screen.findByText(/Registro agregado al grupo Manual —/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Centro')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    const { records, batches } = useAppStore.getState()
    expect(records).toHaveLength(2)
    expect(batches).toHaveLength(1)
    expect(records[0]?.batchId).toBe(records[1]?.batchId)
  })

  it('muestra el grupo abierto con su recuento', async () => {
    const user = userEvent.setup()
    render(<ManualEntryForm />)

    // Antes del primer registro no hay grupo que ensenar.
    expect(screen.getByText(/El primer registro abrira un grupo nuevo/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Plaza')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    expect(await screen.findByText(/Grupo abierto:/)).toBeInTheDocument()
    expect(screen.getByText(/1 registro\(s\)/)).toBeInTheDocument()
  })

  it('cerrar el grupo hace que el siguiente registro abra otro', async () => {
    const user = userEvent.setup()
    render(<ManualEntryForm />)

    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Plaza')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))
    const first = useAppStore.getState().activeManualBatchId

    await user.click(await screen.findByRole('button', { name: 'Cerrar grupo' }))
    expect(useAppStore.getState().activeManualBatchId).toBeNull()

    await user.type(screen.getByLabelText('Nombre del local'), 'Toks Centro')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    const records = useAppStore.getState().records
    expect(useAppStore.getState().batches).toHaveLength(2)
    expect(records[1]?.batchId).not.toBe(first)
  })

  it('sin grupo abierto no ofrece cerrarlo', () => {
    render(<ManualEntryForm />)
    expect(screen.queryByRole('button', { name: 'Cerrar grupo' })).not.toBeInTheDocument()
  })
})

/**
 * Sugerencias de ciudad y departamento.
 *
 * Se inyecta un proveedor de mentira: lo que se prueba es que la sugerencia
 * llegue al formulario y arrastre su departamento, no la API de Photon.
 */
describe('sugerencias de lugares', () => {
  const COLOMBIA = { name: 'Colombia', code: 'CO' }

  it('sin pais fijado no sugiere y lo explica', async () => {
    const user = userEvent.setup()
    setPlacesProvider(fakeProvider([BARRANQUILLA]))
    render(<ManualEntryForm />)

    expect(screen.getAllByText(/Fija un pais en la barra lateral/).length).toBeGreaterThan(0)

    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'barran')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('sugiere ciudades del pais de la sesion', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })
    setPlacesProvider(fakeProvider([BARRANQUILLA]))
    render(<ManualEntryForm />)

    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'barran')

    expect(await screen.findByRole('option', { name: /Barranquilla/ })).toBeInTheDocument()
  })

  /** Es lo que de verdad ahorra trabajo: nadie se sabe los departamentos. */
  it('al elegir una ciudad rellena su departamento', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })
    setPlacesProvider(fakeProvider([BARRANQUILLA]))
    render(<ManualEntryForm />)

    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'barran')
    await user.click(await screen.findByRole('option', { name: /Barranquilla/ }))

    expect(screen.getByRole('combobox', { name: 'Ciudad' })).toHaveValue('Barranquilla')
    expect(screen.getByRole('combobox', { name: /Region/ })).toHaveValue('Atlántico')
  })

  it('no pisa el departamento si ya estaba escrito', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })
    setPlacesProvider(fakeProvider([BARRANQUILLA]))
    render(<ManualEntryForm />)

    await user.type(screen.getByRole('combobox', { name: /Region/ }), 'Puesto a mano')
    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'barran')
    await user.click(await screen.findByRole('option', { name: /Barranquilla/ }))

    expect(screen.getByRole('combobox', { name: /Region/ })).toHaveValue('Puesto a mano')
  })

  /** OpenStreetMap no conoce todos los municipios: hay que poder escribirlos. */
  it('deja escribir una ciudad que no esta en las sugerencias', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })
    setPlacesProvider(fakeProvider([]))
    render(<ManualEntryForm />)

    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'Un corregimiento')
    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))

    expect(useAppStore.getState().records[0]?.fields.city).toBe('Un corregimiento')
  })

  it('un fallo del proveedor no impide guardar el registro', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })
    setPlacesProvider({
      name: 'roto',
      suggest: () => Promise.reject(new Error('sin red')),
    })
    render(<ManualEntryForm />)

    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'barran')
    // Los dos campos con sugerencias avisan del fallo.
    expect((await screen.findAllByText(/Puedes escribirlo a mano/)).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Agregar registro' }))
    expect(useAppStore.getState().records).toHaveLength(1)
  })

  /** El pais escrito manda sobre el de la sesion, como en las consultas. */
  it('el pais escrito en el formulario acota las sugerencias', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ country: COLOMBIA })

    const seen: (string | null)[] = []
    setPlacesProvider({
      name: 'espia',
      suggest: (query) => {
        seen.push(query.country?.code ?? null)
        return Promise.resolve([])
      },
    })
    render(<ManualEntryForm />)

    await user.type(screen.getByLabelText('Pais'), 'Mexico')
    await user.type(screen.getByRole('combobox', { name: 'Ciudad' }), 'guadal')

    await screen.findAllByText(/Sin sugerencias/)
    expect(seen).toContain('MX')
  })
})
