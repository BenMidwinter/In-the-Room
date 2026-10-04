import { scaleUsesButtons } from '../../lib/formModel'

function ScaleButtons({ min, max, value, onPick }) {
  const numbers = []
  for (let number = min; number <= max; number += 1) numbers.push(number)
  return (
    <div className="form-scale" role="group">
      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className={`form-scale__btn${value === number ? ' form-scale__btn--on' : ''}`}
          aria-pressed={value === number}
          onClick={() => onPick(number)}
        >
          {number}
        </button>
      ))}
    </div>
  )
}

function NumberScore({ min, max, value, onPick }) {
  return (
    <input
      className="paper-input form-score-number"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value
        onPick(raw === '' ? '' : Number(raw))
      }}
    />
  )
}

export default function ScoreFields({ schema, value, onChange, readOnly = false }) {
  const buttons = scaleUsesButtons(schema)
  if (schema.kind === 'overall') {
    const current = value && typeof value === 'object' ? value.score : ''
    return (
      <div className="form-question">
        <p className="form-question__label">Score</p>
        {readOnly ? (
          <p className="form-question__answer">{current === '' || current == null ? '—' : current}</p>
        ) : buttons ? (
          <ScaleButtons
            min={schema.min}
            max={schema.max}
            value={current}
            onPick={(number) => onChange({ score: number })}
          />
        ) : (
          <NumberScore
            min={schema.min}
            max={schema.max}
            value={current}
            onPick={(number) => onChange({ score: number })}
          />
        )}
      </div>
    )
  }

  const bag = value && typeof value === 'object' ? value : {}
  return (
    <div>
      {schema.items.map((item) => (
        <div key={item.id} className="form-question">
          <p className="form-question__label">{item.label}</p>
          {readOnly ? (
            <p className="form-question__answer">{bag[item.id] ?? '—'}</p>
          ) : buttons ? (
            <ScaleButtons
              min={schema.min}
              max={schema.max}
              value={bag[item.id]}
              onPick={(number) => onChange({ ...bag, [item.id]: number })}
            />
          ) : (
            <NumberScore
              min={schema.min}
              max={schema.max}
              value={bag[item.id]}
              onPick={(number) => onChange({ ...bag, [item.id]: number })}
            />
          )}
        </div>
      ))}
    </div>
  )
}
