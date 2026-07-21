import { describe, expect, it } from 'vitest'
import {
  SIGNAL_HINTS,
  SIGNAL_TARGETS,
  evaluateSignal,
  evaluateSignals,
  formatHours,
  formatSignalValue,
  needsAttention,
  rankContributions,
  rankSignals,
  signalDistance,
  signalLevel,
  type EvaluatedSignal,
  type SignalThreshold,
} from './signals'

const HIGHER: SignalThreshold = {
  label: 'Higher is better',
  direction: 'higher',
  target: 95,
  alert: 90,
  unit: 'percent',
}

const LOWER: SignalThreshold = {
  label: 'Lower is better',
  direction: 'lower',
  target: 10,
  alert: 20,
  unit: 'count',
}

describe('the signal table', () => {
  // The ⓘ is the only thing standing between a reader and a number they do not
  // understand, so a new signal without one is a defect, not an omission.
  it('explains every signal it defines', () => {
    expect(Object.keys(SIGNAL_HINTS).sort()).toEqual(Object.keys(SIGNAL_TARGETS).sort())
  })

  it('gives each explanation all three parts', () => {
    for (const [key, hint] of Object.entries(SIGNAL_HINTS)) {
      expect(hint.what, `${key}.what`).toBeTruthy()
      expect(hint.why, `${key}.why`).toBeTruthy()
      expect(hint.moves, `${key}.moves`).toBeTruthy()
    }
  })

  it('bands every signal so that meeting the target is good', () => {
    for (const [key, t] of Object.entries(SIGNAL_TARGETS)) {
      expect(signalLevel(t.target, t), key).toBe('good')
      expect(signalLevel(t.alert, t), key).toBe(t.target === t.alert ? 'good' : 'watch')
    }
  })
})

describe('formatHours', () => {
  it('renders nothing for a missing reading', () => {
    expect(formatHours(null)).toBe('—')
  })

  it('uses minutes under an hour', () => {
    expect(formatHours(0.5)).toBe('30m')
  })

  it('uses hours up to two days', () => {
    expect(formatHours(30)).toBe('30.0h')
  })

  it('uses days beyond two', () => {
    expect(formatHours(96)).toBe('4d')
  })
})

describe('formatSignalValue', () => {
  it('renders nothing for a missing reading', () => {
    expect(formatSignalValue(null, 'percent')).toBe('—')
  })

  it('formats each unit', () => {
    expect(formatSignalValue(91.25, 'percent')).toBe('91.3%')
    expect(formatSignalValue(2, 'hours')).toBe('2.0h')
    expect(formatSignalValue(2.5, 'ratio')).toBe('2.50×')
    expect(formatSignalValue(1234, 'count')).toMatch(/1[\s,]?234/)
    expect(formatSignalValue(48000, 'currency')).toContain('48')
  })
})

describe('signalLevel', () => {
  it('is neutral when there is no reading — not risk', () => {
    expect(signalLevel(null, HIGHER)).toBe('neutral')
    expect(signalLevel(null, LOWER)).toBe('neutral')
  })

  it('bands a higher-is-better metric', () => {
    expect(signalLevel(96, HIGHER)).toBe('good')
    expect(signalLevel(95, HIGHER)).toBe('good')
    expect(signalLevel(92, HIGHER)).toBe('watch')
    expect(signalLevel(90, HIGHER)).toBe('watch')
    expect(signalLevel(89.9, HIGHER)).toBe('risk')
  })

  it('bands a lower-is-better metric', () => {
    expect(signalLevel(5, LOWER)).toBe('good')
    expect(signalLevel(10, LOWER)).toBe('good')
    expect(signalLevel(15, LOWER)).toBe('watch')
    expect(signalLevel(20, LOWER)).toBe('watch')
    expect(signalLevel(21, LOWER)).toBe('risk')
  })
})

describe('signalDistance', () => {
  it('is zero for a missing reading, so it cannot outrank a real one', () => {
    expect(signalDistance(null, HIGHER)).toBe(0)
  })

  it('is zero on or past target in either direction', () => {
    expect(signalDistance(95, HIGHER)).toBe(0)
    expect(signalDistance(99, HIGHER)).toBe(0)
    expect(signalDistance(10, LOWER)).toBe(0)
    expect(signalDistance(2, LOWER)).toBe(0)
  })

  it('scores one alert band out as 1.0 whatever the unit', () => {
    expect(signalDistance(90, HIGHER)).toBe(1)
    expect(signalDistance(20, LOWER)).toBe(1)
  })

  it('scales beyond the band', () => {
    expect(signalDistance(85, HIGHER)).toBe(2)
    expect(signalDistance(30, LOWER)).toBe(2)
  })

  it('falls back to the target magnitude when the band has no width', () => {
    const zeroBand: SignalThreshold = { ...LOWER, target: 10, alert: 10 }
    expect(signalDistance(20, zeroBand)).toBe(1)
  })

  it('falls back to 1 when target and alert are both zero', () => {
    const zeroTarget: SignalThreshold = { ...LOWER, target: 0, alert: 0 }
    expect(signalDistance(3, zeroTarget)).toBe(3)
  })
})

describe('evaluateSignal', () => {
  it('reads its band from the shared target table', () => {
    const s = evaluateSignal({ key: 'onTime', value: 88.4, prior: 91.6 })
    expect(s.label).toBe(SIGNAL_TARGETS.onTime.label)
    expect(s.level).toBe('risk')
    expect(s.display).toBe('88.4%')
    expect(s.targetDisplay).toBe('95.0%')
    expect(s.delta).toBeCloseTo(-3.2)
    expect(s.deltaGood).toBe(false)
  })

  it('has no delta without a prior reading', () => {
    expect(evaluateSignal({ key: 'onTime', value: 95 }).delta).toBeNull()
    expect(evaluateSignal({ key: 'onTime', value: null, prior: 90 }).delta).toBeNull()
    expect(evaluateSignal({ key: 'onTime', value: 95, prior: null }).deltaGood).toBe(false)
  })

  it('judges a rise good for a rate and bad for a duration', () => {
    expect(evaluateSignal({ key: 'onTime', value: 95, prior: 90 }).deltaGood).toBe(true)
    expect(evaluateSignal({ key: 'cycleP90', value: 90, prior: 60 }).deltaGood).toBe(false)
    expect(evaluateSignal({ key: 'cycleP90', value: 60, prior: 90 }).deltaGood).toBe(true)
  })

  it('attaches the plain-English explanation', () => {
    expect(evaluateSignal({ key: 'reverts', value: 9 }).hint).toBe(SIGNAL_HINTS.reverts)
  })

  it('carries the action and context through untouched', () => {
    const s = evaluateSignal({ key: 'reverts', value: 9, action: 'Talk to dispatch', context: 'last 7 days' })
    expect(s.action).toBe('Talk to dispatch')
    expect(s.context).toBe('last 7 days')
  })

  it('maps a list', () => {
    expect(evaluateSignals([{ key: 'onTime', value: 99 }, { key: 'reverts', value: 0 }])).toHaveLength(2)
  })
})

describe('rankSignals', () => {
  const build = (): EvaluatedSignal[] =>
    evaluateSignals([
      { key: 'firstTimeRight', value: 99 }, // good
      { key: 'onTime', value: 80 }, // risk, 3 bands out
      { key: 'podCompliance', value: 96 }, // watch
      { key: 'tailRatio', value: null }, // neutral
      { key: 'cycleP90', value: 200 }, // risk, further out
    ])

  it('puts risk first, then watch, then good, then neutral', () => {
    expect(rankSignals(build()).map((s) => s.level)).toEqual(['risk', 'risk', 'watch', 'good', 'neutral'])
  })

  it('orders within a level by distance from target', () => {
    const [first, second] = rankSignals(build())
    expect(first.distance).toBeGreaterThan(second.distance)
  })

  it('does not mutate the input', () => {
    const input = build()
    const before = input.map((s) => s.key)
    rankSignals(input)
    expect(input.map((s) => s.key)).toEqual(before)
  })

  it('keeps declaration order for equally-placed signals', () => {
    const tied = evaluateSignals([
      { key: 'unassignedLocation', value: 0 },
      { key: 'stockOuts', value: 0 },
    ])
    expect(rankSignals(tied).map((s) => s.key)).toEqual(['unassignedLocation', 'stockOuts'])
  })
})

describe('needsAttention', () => {
  it('keeps only what is off target, worst first', () => {
    const signals = evaluateSignals([
      { key: 'firstTimeRight', value: 99 },
      { key: 'podCompliance', value: 96 },
      { key: 'onTime', value: 70 },
    ])
    expect(needsAttention(signals).map((s) => s.key)).toEqual(['onTime', 'podCompliance'])
  })

  it('is empty when everything is on target', () => {
    expect(needsAttention(evaluateSignals([{ key: 'onTime', value: 99 }]))).toEqual([])
  })

  it('never surfaces a signal that has no reading', () => {
    expect(needsAttention(evaluateSignals([{ key: 'onTime', value: null }]))).toEqual([])
  })
})

describe('rankContributions', () => {
  it('drops causes that cost nothing and sorts the rest largest first', () => {
    expect(
      rankContributions([
        { key: 'late', label: 'Late', points: 2.4 },
        { key: 'pod', label: 'POD', points: 0 },
        { key: 'returned', label: 'Returned', points: 5.1 },
      ]).map((c) => c.key),
    ).toEqual(['returned', 'late'])
  })

  it('scales the bars against the largest cause', () => {
    const [first, second] = rankContributions([
      { key: 'late', label: 'Late', points: 2 },
      { key: 'returned', label: 'Returned', points: 4 },
    ])
    expect(first.share).toBe(100)
    expect(second.share).toBe(50)
  })

  it('is empty when nothing was lost', () => {
    expect(rankContributions([{ key: 'late', label: 'Late', points: 0 }])).toEqual([])
  })
})
