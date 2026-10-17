import { useRef, useState } from 'react'

const LENGTH = 6

/** Six single-digit boxes. Calls onComplete once the code is full. */
export default function TotpCodeInput({ onComplete, disabled = false }) {
  const [digits, setDigits] = useState(() => Array(LENGTH).fill(''))
  const inputs = useRef([])
  const sent = useRef(false)

  const focusAt = (index) => {
    const box = inputs.current[Math.max(0, Math.min(index, LENGTH - 1))]
    box?.focus()
    box?.select()
  }

  const commit = (next) => {
    setDigits(next)
    if (sent.current || next.some((digit) => !digit)) return
    sent.current = true
    onComplete(next.join(''))
  }

  const writeFrom = (index, raw) => {
    const incoming = String(raw).replace(/\D/g, '')
    if (!incoming) {
      const next = [...digits]
      next[index] = ''
      setDigits(next)
      return
    }
    const next = [...digits]
    incoming.slice(0, LENGTH - index).split('').forEach((char, offset) => {
      next[index + offset] = char
    })
    focusAt(index + incoming.length)
    commit(next)
  }

  const onKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = [...digits]
      if (next[index]) {
        next[index] = ''
        setDigits(next)
        return
      }
      if (index > 0) {
        next[index - 1] = ''
        setDigits(next)
        focusAt(index - 1)
      }
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusAt(index - 1)
    }
    if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      event.preventDefault()
      focusAt(index + 1)
    }
  }

  return (
    <div className="totp-code" role="group" aria-label="Six-digit code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { inputs.current[index] = node }}
          className="paper-input totp-code__digit"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1}`}
          value={digit}
          disabled={disabled}
          autoFocus={index === 0}
          onChange={(event) => writeFrom(index, event.target.value)}
          onKeyDown={(event) => onKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          onPaste={(event) => {
            event.preventDefault()
            writeFrom(index, event.clipboardData.getData('text'))
          }}
        />
      ))}
    </div>
  )
}
