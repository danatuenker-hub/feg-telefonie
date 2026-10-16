// Kurze Hinweis-Meldung unten in der Mitte, verschwindet nach ein paar Sekunden.
export function toast(text, kind = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.textContent = text
  document.body.appendChild(el)
  setTimeout(() => el.remove(), kind === 'ok' ? 4000 : 8000)
}
