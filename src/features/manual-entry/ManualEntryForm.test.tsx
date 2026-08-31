import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { setRepository, useAppStore } from '@/app/store'
import { createInMemoryRepository } from '@/infrastructure/storage'

import { ManualEntryForm } from './ManualEntryForm'

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
