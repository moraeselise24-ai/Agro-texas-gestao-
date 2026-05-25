export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

export const normalizeDateToIso = (raw: string): string => {
  const s = String(raw ?? '').trim().slice(0, 10)

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-')

  const br4 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br4) return `${br4[3]}-${br4[2]}-${br4[1]}`

  const br4Dash = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (br4Dash) return `${br4Dash[3]}-${br4Dash[2]}-${br4Dash[1]}`

  const br4Dot = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (br4Dot) return `${br4Dot[3]}-${br4Dot[2]}-${br4Dot[1]}`

  const br2 = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
  if (br2) {
    const yy = Number(br2[3])
    const yyyy = yy < 70 ? 2000 + yy : 1900 + yy
    return `${String(yyyy)}-${br2[2]}-${br2[1]}`
  }

  return s
}
