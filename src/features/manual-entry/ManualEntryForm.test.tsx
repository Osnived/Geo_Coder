import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { setRepository, useAppStore } from '@/app/store'
import { createInMemoryRepository } from '@/infrastructure/storage'

import { ManualEntryForm } from './ManualEntryForm'

const INITIAL = useAppStore.getState()

beforeEach(() => {
  setRepository(createInMemoryRepository())
  useAppStore.setState({ ...INITIAL, records: [], country: null })
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
})
