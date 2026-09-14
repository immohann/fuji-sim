import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bakeCurve } from '../gl/curves.ts'
import { SIMULATIONS } from './simulations.ts'

/**
 * Guards the properties the film looks are built on. These are cheap to break
 * by nudging a control point, and expensive to notice by eye -- a curve that
 * dips backwards shows up as a subtle posterised band, not an obvious error.
 *
 * The colour-response checks that need a GPU live in the browser verification
 * pass; everything testable on the CPU is here.
 */

describe('curve baking', () => {
  it('reproduces an identity curve exactly', () => {
    const lut = bakeCurve([
      [0, 0],
      [1, 1],
    ])
    for (let i = 0; i < 256; i++) {
      assert.ok(Math.abs(lut[i] - i / 255) < 1e-6, `entry ${i} drifted`)
    }
  })

  it('stays monotone through control points that would make a spline overshoot', () => {
    const lut = bakeCurve([
      [0, 0],
      [0.02, 0.4],
      [0.5, 0.45],
      [0.98, 0.5],
      [1, 1],
    ])
    for (let i = 1; i < 256; i++) {
      assert.ok(lut[i] >= lut[i - 1] - 1e-7, `curve ran backwards at ${i}`)
    }
  })
})

describe('film simulations', () => {
  for (const sim of SIMULATIONS) {
    describe(sim.id, () => {
      it('has monotone, in-range curves on every channel', () => {
        for (const channel of ['r', 'g', 'b'] as const) {
          const lut = bakeCurve(sim.curves[channel])
          for (let i = 0; i < 256; i++) {
            assert.ok(lut[i] >= 0 && lut[i] <= 1, `${channel}[${i}] out of range`)
            if (i > 0) {
              assert.ok(lut[i] >= lut[i - 1] - 1e-7, `${channel} ran backwards at ${i}`)
            }
          }
        }
      })

      it('has matrix rows summing to 1 so neutrals keep no cast', () => {
        for (let row = 0; row < 3; row++) {
          const sum = sim.matrix[row * 3] + sim.matrix[row * 3 + 1] + sim.matrix[row * 3 + 2]
          assert.ok(Math.abs(sum - 1) < 1e-6, `row ${row} sums to ${sum}`)
        }
      })

      it('has panchromatic weights summing to 1', () => {
        const sum = sim.panchromatic[0] + sim.panchromatic[1] + sim.panchromatic[2]
        assert.ok(Math.abs(sum - 1) < 1e-3, `weights sum to ${sum}`)
      })
    })
  }

  it('keeps Provia neutral: identical channels, close to a straight line', () => {
    const provia = SIMULATIONS.find((s) => s.id === 'provia')
    assert.ok(provia)
    const [r, g, b] = (['r', 'g', 'b'] as const).map((c) => bakeCurve(provia.curves[c]))
    for (let i = 0; i < 256; i++) {
      assert.ok(Math.abs(r[i] - g[i]) < 1e-6 && Math.abs(r[i] - b[i]) < 1e-6, `cast at ${i}`)
      assert.ok(Math.abs(r[i] - i / 255) < 0.05, `too far from neutral at ${i}`)
    }
  })

  it('keeps the Classic Negative signature: teal shadows, warm highlights, lifted black', () => {
    const cn = SIMULATIONS.find((s) => s.id === 'classic-negative')
    assert.ok(cn)
    const [r, , b] = (['r', 'g', 'b'] as const).map((c) => bakeCurve(cn.curves[c]))
    assert.ok(b[0] > r[0] + 0.02, 'shadows should sit blue-of-red')
    assert.ok(r[255] > b[255] + 0.02, 'highlights should sit red-of-blue')
    assert.ok(r[0] > 0.03, 'blacks should be lifted, not true black')
  })
})
