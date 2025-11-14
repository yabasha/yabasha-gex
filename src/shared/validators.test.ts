import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  npmRateLimiter,
  RateLimiter,
  sanitizeForMarkdown,
  validateCommandOptions,
  validateFilePath,
  validateOutputFormat,
  validatePackageName,
  validateVersion,
  ValidationError,
} from './validators.js'

describe('validators', () => {
  describe('ValidationError', () => {
    it('should create a validation error with correct name', () => {
      const error = new ValidationError('Test error')
      expect(error.name).toBe('ValidationError')
      expect(error.message).toBe('Test error')
      expect(error).toBeInstanceOf(Error)
    })
  })

  describe('validateFilePath', () => {
    it('should validate safe file paths', () => {
      const safePath = 'test.json'
      const result = validateFilePath(safePath)
      expect(result).toBe(path.resolve(safePath))
    })

    it('should reject null or undefined paths', () => {
      expect(() => validateFilePath(null as any)).toThrow(ValidationError)
      expect(() => validateFilePath(undefined as any)).toThrow(ValidationError)
    })

    it('should reject empty or whitespace-only paths', () => {
      expect(() => validateFilePath('')).toThrow(ValidationError)
      expect(() => validateFilePath('   ')).toThrow(ValidationError)
    })

    it('should reject directory traversal attempts', () => {
      expect(() => validateFilePath('../../../etc/passwd')).toThrow(ValidationError)
      expect(() => validateFilePath('..\\..\\windows\\system32')).toThrow(ValidationError)
      expect(() => validateFilePath('test/../../../secret')).toThrow(ValidationError)
    })

    it('should reject URL-encoded traversal attempts', () => {
      expect(() => validateFilePath('%2e%2e%2f%2e%2e%2fpasswd')).toThrow(ValidationError)
      expect(() => validateFilePath('%2e%2e%5c%2e%2e%5csystem32')).toThrow(ValidationError)
    })

    it('should reject null byte attacks', () => {
      expect(() => validateFilePath('test.json\0.txt')).toThrow(ValidationError)
    })
  })

  describe('validateOutputFormat', () => {
    it('should accept valid formats', () => {
      expect(validateOutputFormat('json')).toBe('json')
      expect(validateOutputFormat('md')).toBe('md')
    })

    it('should reject invalid formats', () => {
      expect(() => validateOutputFormat('html')).toThrow(ValidationError)
      expect(() => validateOutputFormat('xml')).toThrow(ValidationError)
      expect(() => validateOutputFormat('')).toThrow(ValidationError)
      expect(() => validateOutputFormat(null)).toThrow(ValidationError)
      expect(() => validateOutputFormat(123)).toThrow(ValidationError)
    })
  })

  describe('validatePackageName', () => {
    it('should accept valid package names', () => {
      expect(validatePackageName('commander')).toBe('commander')
      expect(validatePackageName('@yabasha/gex')).toBe('@yabasha/gex')
      expect(validatePackageName('package-with-dashes')).toBe('package-with-dashes')
      expect(validatePackageName('package.with.dots')).toBe('package.with.dots')
      expect(validatePackageName('package_with_underscores')).toBe('package_with_underscores')
    })

    it('should trim whitespace', () => {
      expect(validatePackageName('  commander  ')).toBe('commander')
    })

    it('should reject invalid package names', () => {
      expect(() => validatePackageName('')).toThrow(ValidationError)
      expect(() => validatePackageName('   ')).toThrow(ValidationError)
      expect(() => validatePackageName(null as any)).toThrow(ValidationError)
      expect(() => validatePackageName(undefined as any)).toThrow(ValidationError)
    })

    it('should reject package names with invalid characters', () => {
      expect(() => validatePackageName('package with spaces')).toThrow(ValidationError)
      expect(() => validatePackageName('package/with/slashes')).toThrow(ValidationError)
      expect(() => validatePackageName('package<>special')).toThrow(ValidationError)
    })

    it('should reject excessively long package names', () => {
      const longName = 'a'.repeat(215)
      expect(() => validatePackageName(longName)).toThrow(ValidationError)
    })
  })

  describe('validateVersion', () => {
    it('should accept valid semantic versions', () => {
      expect(validateVersion('1.0.0')).toBe('1.0.0')
      expect(validateVersion('0.1.2')).toBe('0.1.2')
      expect(validateVersion('10.20.30')).toBe('10.20.30')
      expect(validateVersion('1.0.0-alpha')).toBe('1.0.0-alpha')
      expect(validateVersion('1.0.0-beta.1')).toBe('1.0.0-beta.1')
      expect(validateVersion('1.0.0+build.1')).toBe('1.0.0+build.1')
    })

    it('should accept npm-style versions', () => {
      expect(validateVersion('1.0.0-beta')).toBe('1.0.0-beta')
      expect(validateVersion('next')).toBe('next')
      expect(validateVersion('latest')).toBe('latest')
    })

    it('should allow empty versions for broken packages', () => {
      expect(validateVersion('')).toBe('')
      expect(validateVersion('   ')).toBe('')
    })

    it('should trim whitespace', () => {
      expect(validateVersion('  1.0.0  ')).toBe('1.0.0')
    })

    it('should reject null or undefined versions', () => {
      expect(() => validateVersion(null as any)).toThrow(ValidationError)
      expect(() => validateVersion(undefined as any)).toThrow(ValidationError)
    })

    it('should reject versions with invalid characters', () => {
      expect(() => validateVersion('1.0.0<script>')).toThrow(ValidationError)
      expect(() => validateVersion('1.0.0;rm -rf /')).toThrow(ValidationError)
    })

    it('should reject excessively long versions', () => {
      const longVersion = '1.0.0-' + 'a'.repeat(50)
      expect(() => validateVersion(longVersion)).toThrow(ValidationError)
    })
  })

  describe('sanitizeForMarkdown', () => {
    it('should escape pipe characters', () => {
      expect(sanitizeForMarkdown('package|with|pipes')).toBe('package\\|with\\|pipes')
    })

    it('should replace newlines and carriage returns', () => {
      expect(sanitizeForMarkdown('line1\nline2')).toBe('line1 line2')
      expect(sanitizeForMarkdown('line1\rline2')).toBe('line1line2')
    })

    it('should replace tabs with spaces', () => {
      expect(sanitizeForMarkdown('word1\tword2')).toBe('word1 word2')
    })

    it('should trim whitespace', () => {
      expect(sanitizeForMarkdown('  text  ')).toBe('text')
    })

    it('should handle empty or null input', () => {
      expect(sanitizeForMarkdown('')).toBe('')
      expect(sanitizeForMarkdown(null as any)).toBe('')
      expect(sanitizeForMarkdown(undefined as any)).toBe('')
    })

    it('should handle complex markdown-breaking content', () => {
      const input = '  package|name\twith\nnewlines\rand|pipes  '
      const expected = 'package\\|name with newlinesand\\|pipes'
      expect(sanitizeForMarkdown(input)).toBe(expected)
    })
  })

  describe('validateCommandOptions', () => {
    it('should validate and return valid options', () => {
      const options = {
        outputFormat: 'json',
        outFile: 'test.json',
        fullTree: true,
        omitDev: false,
      }

      const result = validateCommandOptions(options)

      expect(result.outputFormat).toBe('json')
      expect(result.outFile).toBe(path.resolve('test.json'))
      expect(result.fullTree).toBe(true)
      expect(result.omitDev).toBe(false)
    })

    it('should reject null or non-object options', () => {
      expect(() => validateCommandOptions(null as any)).toThrow(ValidationError)
      expect(() => validateCommandOptions('string' as any)).toThrow(ValidationError)
      expect(() => validateCommandOptions(123 as any)).toThrow(ValidationError)
    })

    it('should validate nested option values', () => {
      const options = {
        outputFormat: 'invalid',
      }

      expect(() => validateCommandOptions(options)).toThrow(ValidationError)
    })

    it('should handle optional fields', () => {
      const options = {
        outputFormat: 'md',
        outFile: null,
        cwd: undefined,
      }

      const result = validateCommandOptions(options)

      expect(result.outputFormat).toBe('md')
      expect(result.outFile).toBeUndefined()
      expect(result.cwd).toBeUndefined()
    })
  })

  describe('RateLimiter', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('should throttle rapid consecutive calls', async () => {
      const rateLimiter = new RateLimiter(100) // 100ms interval
      const start = Date.now()

      const promise1 = rateLimiter.throttle()
      vi.advanceTimersByTime(0)
      await promise1

      expect(Date.now() - start).toBeLessThan(10)

      const promise2 = rateLimiter.throttle()
      vi.advanceTimersByTime(50) // Not enough time
      vi.advanceTimersByTime(50) // Complete the delay

      await promise2
      expect(Date.now() - start).toBeGreaterThanOrEqual(100)
    })

    it('should not delay calls that are naturally spaced out', async () => {
      const rateLimiter = new RateLimiter(100)

      await rateLimiter.throttle()
      vi.advanceTimersByTime(150) // More than the interval

      const start = Date.now()
      await rateLimiter.throttle()
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(10)
    })
  })

  describe('npmRateLimiter', () => {
    it('should be a global rate limiter instance', () => {
      expect(npmRateLimiter).toBeInstanceOf(RateLimiter)
    })
  })
})
