export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function formFillUrl(token) {
  return `${window.location.origin}/f/${token}`
}

export function formStartUrl(formId) {
  return `${window.location.origin}/r/${formId}`
}
