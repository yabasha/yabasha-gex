import path from 'node:path'
import { setTimeout } from 'node:timers'

import type { OutputFormat } from './types.js'

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validates and sanitizes file paths to prevent directory traversal attacks
 */
export function validateFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new ValidationError('File path must be a non-empty string')
  }

  if (filePath.trim().length === 0) {
    throw new ValidationError('File path cannot be empty or whitespace only')
  }

  const suspiciousPatterns = [
    /\.\.\//g, // Parent directory references
    /\.\.\\+/g, // Windows parent directory references
    /%2e%2e%2f/gi, // URL-encoded parent directory references
    /%2e%2e%5c/gi, // URL-encoded Windows parent directory references
    /\0/g, // Null bytes
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(filePath)) {
      throw new ValidationError('File path contains suspicious characters or patterns')
    }
  }

  const resolvedPath = path.resolve(filePath)
  const cwd = process.cwd()

  if (!resolvedPath.startsWith(cwd) && !path.isAbsolute(filePath)) {
    throw new ValidationError('File path attempts to access files outside the current directory')
  }

  return resolvedPath
}

/**
 * Validates output format
 */
export function validateOutputFormat(format: unknown): OutputFormat {
  if (format !== 'json' && format !== 'md') {
    throw new ValidationError('Output format must be "json" or "md"')
  }
  return format
}

/**
 * Validates and sanitizes package names
 */
export function validatePackageName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Package name must be a non-empty string')
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new ValidationError('Package name cannot be empty or whitespace only')
  }

  const packageNamePattern = /^(@[a-z0-9-_]+\/)?[a-z0-9-_.]+$/i
  if (!packageNamePattern.test(trimmed)) {
    throw new ValidationError('Package name contains invalid characters')
  }

  if (trimmed.length > 214) {
    throw new ValidationError('Package name is too long')
  }

  return trimmed
}

/**
 * Validates semantic version strings
 */
export function validateVersion(version: string): string {
  if (typeof version !== 'string') {
    throw new ValidationError('Version must be a string')
  }

  const trimmed = version.trim()
  if (trimmed.length === 0) {
    return '' // Allow empty versions for broken packages
  }

  const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-_.]+))?(?:\+([a-zA-Z0-9-_.]+))?$/
  const relaxedPattern = /^[a-zA-Z0-9-_.+]+$/ // More permissive for npm's various formats

  if (!semverPattern.test(trimmed) && !relaxedPattern.test(trimmed)) {
    throw new ValidationError('Version contains invalid characters')
  }

  if (trimmed.length > 50) {
    throw new ValidationError('Version string is too long')
  }

  return trimmed
}

/**
 * Sanitizes text for safe inclusion in markdown tables
 */
export function sanitizeForMarkdown(text: string): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return text
    .replace(/\|/g, '\\|') // Escape pipe characters that could break table formatting
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\r/g, '') // Remove carriage returns
    .replace(/\t/g, ' ') // Replace tabs with spaces
    .trim()
}

/**
 * Validates command options object
 */
export function validateCommandOptions(options: Record<string, unknown>): Record<string, unknown> {
  if (!options || typeof options !== 'object') {
    throw new ValidationError('Options must be an object')
  }

  const validatedOptions: Record<string, unknown> = {}

  if ('outputFormat' in options) {
    validatedOptions.outputFormat = validateOutputFormat(options.outputFormat)
  }

  if ('outFile' in options && options.outFile != null) {
    validatedOptions.outFile = validateFilePath(options.outFile as string)
  }

  if ('cwd' in options && options.cwd != null) {
    validatedOptions.cwd = validateFilePath(options.cwd as string)
  }

  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(validatedOptions, key)) {
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        validatedOptions[key] = value
      }
    }
  }

  return validatedOptions
}

/**
 * Rate limiting utility for npm operations
 */
export class RateLimiter {
  private lastCall: number = 0
  private readonly minInterval: number

  constructor(minIntervalMs: number = 100) {
    this.minInterval = minIntervalMs
  }

  /**
   * Ensures minimum time between operations
   */
  async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCall

    if (elapsed < this.minInterval) {
      const delay = this.minInterval - elapsed
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }

    this.lastCall = Date.now()
  }
}

/**
 * Global rate limiter instance for npm operations
 */
export const npmRateLimiter = new RateLimiter(50) // 50ms minimum between npm calls
