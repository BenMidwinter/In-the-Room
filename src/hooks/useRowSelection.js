import { useCallback, useMemo, useState } from 'react'

/** Checkbox selection for RecordTable bulk actions. */
export function useRowSelection() {
  const [selected, setSelected] = useState({})

  const clear = useCallback(() => setSelected({}), [])

  const isSelected = useCallback((row) => Boolean(selected[row.id]), [selected])

  const onToggle = useCallback((row) => {
    setSelected((current) => {
      const next = { ...current }
      if (next[row.id]) delete next[row.id]
      else next[row.id] = true
      return next
    })
  }, [])

  const onToggleVisible = useCallback((visibleRows, selectAll) => {
    setSelected((current) => {
      const next = { ...current }
      visibleRows.forEach((row) => {
        if (selectAll) next[row.id] = true
        else delete next[row.id]
      })
      return next
    })
  }, [])

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  )

  const selection = useMemo(() => ({
    isSelected,
    onToggle,
    onToggleVisible,
  }), [isSelected, onToggle, onToggleVisible])

  return { selectedIds, selection, clear, count: selectedIds.length }
}
