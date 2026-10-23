import { ApiError } from "./http";

/**
 * Minimal schema validation for request bodies. Collects per-field messages and
 * throws a single 400 `validation_failed` error. Unknown fields are rejected so
 * clients cannot smuggle in properties such as `householdId`.
 */
export class Validator {
  readonly errors: Record<string, string> = {};
  private readonly body: Record<string, unknown>;

  constructor(input: unknown, allowedKeys: readonly string[]) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new ApiError(400, "bad_request");
    }
    this.body = input as Record<string, unknown>;
    for (const key of Object.keys(this.body)) {
      if (!allowedKeys.includes(key)) this.errors[key] = "Unexpected field.";
    }
  }

  /** Trimmed string; empty strings allowed unless `required`. Control characters other than newlines and tabs (multiline only) are rejected. */
  string(key: string, options: { max: number; required?: boolean; multiline?: boolean }): string {
    const value = this.body[key];
    if (value === undefined && !options.required) return "";
    if (typeof value !== "string") {
      this.errors[key] = "Must be text.";
      return "";
    }
    const trimmed = value.trim();
    if (options.required && trimmed.length === 0) this.errors[key] = "This field is required.";
    else if (trimmed.length > options.max) this.errors[key] = `Must be ${options.max} characters or fewer.`;
    else if (hasControlChars(trimmed, options.multiline ?? false)) this.errors[key] = "Contains invalid characters.";
    return trimmed;
  }

  /** Untrimmed secret (passwords may legitimately contain leading/trailing spaces). */
  secret(key: string, max: number): string {
    const value = this.body[key];
    if (typeof value !== "string" || value.length === 0) this.errors[key] = "This field is required.";
    else if (value.length > max) this.errors[key] = `Must be ${max} characters or fewer.`;
    return typeof value === "string" ? value : "";
  }

  boolean(key: string): boolean {
    const value = this.body[key];
    if (typeof value !== "boolean") {
      this.errors[key] = "Must be true or false.";
      return false;
    }
    return value;
  }

  integer(key: string, min: number, max: number): number {
    const value = this.body[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      this.errors[key] = `Must be a whole number from ${min} to ${max}.`;
      return min;
    }
    return value;
  }

  /** Array of non-empty trimmed names. */
  names(key: string, options: { maxItems: number; maxLength: number }): string[] {
    const value = this.body[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > options.maxItems) {
      this.errors[key] = `Must be a list of at most ${options.maxItems} names.`;
      return [];
    }
    const names: string[] = [];
    for (const item of value) {
      const name = typeof item === "string" ? item.trim() : "";
      if (name.length === 0 || name.length > options.maxLength || hasControlChars(name, false)) {
        this.errors[key] = `Each name must be 1–${options.maxLength} characters.`;
        return [];
      }
      names.push(name);
    }
    return names;
  }

  /** `null` or an opaque token string. */
  nullableToken(key: string): string | null {
    const value = this.body[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
      this.errors[key] = "Invalid value.";
      return null;
    }
    return value;
  }

  addError(key: string, message: string) {
    this.errors[key] ??= message;
  }

  /** Throws if any field failed. Call after reading all fields. */
  done(): void {
    if (Object.keys(this.errors).length > 0) throw new ApiError(400, "validation_failed", this.errors);
  }
}

function hasControlChars(value: string, allowNewlines: boolean): boolean {
  // eslint-disable-next-line no-control-regex
  return (allowNewlines ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
}

/** Parses a positive integer path parameter. */
export function parseId(value: string | undefined): number {
  if (!value || !/^[1-9][0-9]{0,9}$/.test(value)) throw new ApiError(404, "not_found");
  return Number(value);
}
