import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Combobox, type ComboboxOption } from './Combobox'

const OPTIONS: ComboboxOption[] = [
  { value: 'Barranquilla', detail: 'Atlántico' },
  { value: 'Barrancas', detail: 'La Guajira' },
  { value: 'Barranca de Upía', detail: 'Meta' },
]

/** Envoltorio con estado, que es como se usa de verdad. */
function Harness({
  options = OPTIONS,
  onSelect = vi.fn(),
  ...rest
}: {
  options?: ComboboxOption[]
  onSelect?: (option: ComboboxOption) => void
  isLoading?: boolean
  error?: string | null
  emptyMessage?: string
}) {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="ciudad">Ciudad</label>
      <Combobox
        id="ciudad"
        value={value}
        onChange={setValue}
        onSelect={(option) => {
          setValue(option.value)
          onSelect(option)
        }}
        options={options}
        {...rest}
      />
    </>
  )
}

const input = () => screen.getByRole('combobox', { name: 'Ciudad' })

describe('semantica accesible', () => {
  it('se expone como combobox con lista', () => {
    render(<Harness />)

    expect(input()).toHaveAttribute('aria-expanded', 'false')
    expect(input()).toHaveAttribute('aria-autocomplete', 'list')
  })

  it('anuncia que se abrio al escribir', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')

    expect(input()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('senala la opcion resaltada con aria-activedescendant', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{ArrowDown}')

    const active = input().getAttribute('aria-activedescendant')
    expect(active).not.toBeNull()
    expect(document.getElementById(active ?? '')).toHaveAttribute('aria-selected', 'true')
  })

  it('sin nada resaltado no apunta a ninguna opcion', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')

    expect(input()).not.toHaveAttribute('aria-activedescendant')
  })

  it('cuenta las sugerencias para quien no ve la pantalla', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')

    expect(screen.getByRole('status')).toHaveTextContent('3 sugerencia(s) disponibles')
  })
})

describe('teclado', () => {
  it('las flechas recorren la lista', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{ArrowDown}{ArrowDown}')

    expect(screen.getByRole('option', { name: /Barrancas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  /** Quedarse clavado en la ultima opcion es una molestia gratuita. */
  it('da la vuelta al pasar del final', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}')

    expect(screen.getByRole('option', { name: /Barranquilla/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('la flecha arriba desde el principio va al final', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{ArrowUp}')

    expect(screen.getByRole('option', { name: /Barranca de Upía/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('Enter acepta la resaltada', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.type(input(), 'barran')
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onSelect).toHaveBeenCalledWith({ value: 'Barranquilla', detail: 'Atlántico' })
    expect(input()).toHaveValue('Barranquilla')
  })

  /** Sin nada resaltado, Enter debe poder enviar el formulario. */
  it('Enter sin resaltado no elige nada', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.type(input(), 'barran')
    await user.keyboard('{Enter}')

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('Escape cierra la lista sin borrar lo escrito', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input()).toHaveValue('barran')
  })

  it('la flecha abajo vuelve a abrir una lista cerrada', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(input(), 'barran')
    await user.keyboard('{Escape}')
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})

describe('raton', () => {
  it('pinchar una opcion la elige', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.type(input(), 'barran')
    await user.click(screen.getByRole('option', { name: /Barrancas/ }))

    expect(onSelect).toHaveBeenCalledWith({ value: 'Barrancas', detail: 'La Guajira' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('el detalle desambigua los homonimos', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        options={[
          { value: 'Barranquilla', detail: 'Atlántico' },
          { value: 'Barranquilla', detail: 'Tolima' },
        ]}
      />,
    )

    await user.type(input(), 'barran')

    expect(screen.getByText('Atlántico')).toBeInTheDocument()
    expect(screen.getByText('Tolima')).toBeInTheDocument()
  })
})

describe('estados', () => {
  it('el campo sigue siendo escribible sin sugerencias', async () => {
    const user = userEvent.setup()
    render(<Harness options={[]} />)

    await user.type(input(), 'Un municipio que OSM no conoce')

    expect(input()).toHaveValue('Un municipio que OSM no conoce')
  })

  it('avisa mientras busca', () => {
    render(<Harness isLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Buscando sugerencias')
  })

  it('muestra el mensaje de lista vacia', async () => {
    const user = userEvent.setup()
    render(<Harness options={[]} emptyMessage="Sin sugerencias." />)

    await user.type(input(), 'zzz')

    expect(screen.getByText('Sin sugerencias.')).toBeInTheDocument()
  })

  /** Un fallo de red no debe impedir escribir a mano. */
  it('un error se avisa sin bloquear el campo', async () => {
    const user = userEvent.setup()
    render(<Harness options={[]} error="No se pudieron cargar las sugerencias." />)

    expect(screen.getByText(/No se pudieron cargar/)).toBeInTheDocument()

    await user.type(input(), 'Cali')
    expect(input()).toHaveValue('Cali')
  })
})
