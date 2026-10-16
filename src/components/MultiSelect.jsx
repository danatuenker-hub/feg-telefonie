import { useEffect, useRef, useState } from 'react'

// Dropdown mit Checkboxen. value: Array der gewählten Werte.
export default function MultiSelect({ options, value, onChange, placeholder = 'Alle' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const text = value.length === 0 ? placeholder
    : value.length <= 2 ? value.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(', ')
    : `${value.length} ausgewählt`

  return (
    <div className="multi" ref={ref}>
      <button type="button" className="multi-btn" onClick={() => setOpen(!open)}>{text}</button>
      {open && (
        <div className="multi-menu">
          {opts.length === 0 && <div className="muted small">Keine Werte</div>}
          {opts.map((o) => (
            <label key={o.value}>
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          {value.length > 0 && <button type="button" className="link small" onClick={() => onChange([])}>Auswahl leeren</button>}
        </div>
      )}
    </div>
  )
}
