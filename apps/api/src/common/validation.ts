import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  EMAIL_PATTERN,
  LOCATION_CODE_PATTERN,
  MAX_PAGE_SIZE,
  PHONE_PATTERN,
} from '@urban/shared-constants';
import { normalizeEmail, normalizePhone } from '@urban/shared-utils';

interface StringOptions {
  allowEmpty?: boolean;
  maxLength?: number;
  minLength?: number;
}

export function ensureObject(
  value: unknown,
  label = 'payload',
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function cleanString(
  value: unknown,
  field: string,
  options: StringOptions = {},
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (!options.allowEmpty && trimmed.length === 0) {
    throw new BadRequestException(`${field} is required.`);
  }

  if (options.minLength && trimmed.length < options.minLength) {
    throw new BadRequestException(
      `${field} must be at least ${options.minLength} characters.`,
    );
  }

  if (options.maxLength && trimmed.length > options.maxLength) {
    throw new BadRequestException(
      `${field} must be at most ${options.maxLength} characters.`,
    );
  }

  return trimmed;
}

export function requiredString(
  body: Record<string, unknown>,
  field: string,
  options: StringOptions = {},
): string {
  return cleanString(body[field], field, options);
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
  options: StringOptions = {},
): string | undefined {
  const value = body[field];

  if (value === undefined || value === null) {
    return undefined;
  }

  return cleanString(value, field, options);
}

export function requiredEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = requiredString(body, field);

  if (!values.includes(value as T)) {
    throw new BadRequestException(`${field} is invalid.`);
  }

  return value as T;
}

export function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T | undefined {
  const value = optionalString(body, field);

  if (!value) {
    return undefined;
  }

  if (!values.includes(value as T)) {
    throw new BadRequestException(`${field} is invalid.`);
  }

  return value as T;
}

export function optionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = body[field];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean.`);
  }

  return value;
}

export function requiredBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean {
  const value = body[field];

  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean.`);
  }

  return value;
}

export function optionalStringArray(
  body: Record<string, unknown>,
  field: string,
  maxItems = 10,
  maxLength = 500,
): string[] | undefined {
  const value = body[field];

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array.`);
  }

  if (value.length > maxItems) {
    throw new BadRequestException(`${field} exceeds ${maxItems} items.`);
  }

  return value.map((item, index) =>
    cleanString(item, `${field}[${index}]`, {
      allowEmpty: false,
      maxLength,
      minLength: 1,
    }),
  );
}

export function optionalQueryString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a string.`);
  }

  return cleanString(value, field);
}

export function parseEnumQuery<T extends string>(
  value: unknown,
  field: string,
  values: readonly T[],
): T | undefined {
  const raw = optionalQueryString(value, field);

  if (raw === undefined) {
    return undefined;
  }

  if (!values.includes(raw as T)) {
    throw new BadRequestException(`${field} is invalid.`);
  }

  return raw as T;
}

export function parseLocationCodeQuery(
  value: unknown,
  field: string,
): string | undefined {
  const raw = optionalQueryString(value, field);

  if (raw === undefined) {
    return undefined;
  }

  return ensureLocationCode(raw, field);
}

export function parseIsoDateQuery(
  value: unknown,
  field: string,
): string | undefined {
  const raw = optionalQueryString(value, field);

  if (raw === undefined) {
    return undefined;
  }

  if (Number.isNaN(Date.parse(raw))) {
    throw new BadRequestException(`${field} must be a valid ISO date.`);
  }

  return raw;
}

export function parseLimit(value: unknown): number {
  const raw = optionalQueryString(value, 'limit');

  if (!raw) {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer.');
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

export function parseBooleanQuery(
  value: unknown,
  field: string,
): boolean | undefined {
  const raw = optionalQueryString(value, field);

  if (raw === undefined) {
    return undefined;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  throw new BadRequestException(`${field} must be "true" or "false".`);
}

export function requirePhoneOrEmail(body: Record<string, unknown>): {
  email?: string;
  phone?: string;
} {
  const email = optionalString(body, 'email', { maxLength: 150 });
  const phone = optionalString(body, 'phone', { maxLength: 20 });

  if (!email && !phone) {
    throw new BadRequestException('Either phone or email is required.');
  }

  const normalizedPhone = phone ? normalizePhone(phone) : undefined;
  const normalizedEmail = email ? normalizeEmail(email) : undefined;

  if (normalizedPhone && !PHONE_PATTERN.test(normalizedPhone)) {
    throw new BadRequestException('phone is invalid.');
  }

  if (normalizedEmail && !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new BadRequestException('email is invalid.');
  }

  return {
    email: normalizedEmail,
    phone: normalizedPhone,
  };
}

export function ensureLocationCode(
  locationCode: string,
  field = 'locationCode',
): string {
  const normalized = locationCode.trim().toUpperCase();

  if (!LOCATION_CODE_PATTERN.test(normalized)) {
    throw new BadRequestException(`${field} is invalid.`);
  }

  return normalized;
}
