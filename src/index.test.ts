import { describe, it, expect } from 'vitest'

import { greet } from './index'

describe('greet', () => {
  it('greets the provided name', () => {
    expect(greet('Yabasha')).toBe('Hello, Yabasha!')
  })
})
