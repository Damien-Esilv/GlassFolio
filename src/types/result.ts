/**
 * Result<T, E> Pattern — GlassFolio
 *
 * Replaces unpredictable try/catch and ambiguous null returns
 * with fully-typed discriminated unions.
 */

// ============================================================================
// ERROR HIERARCHY
// ============================================================================

export type AppErrorCode =
    | 'VALIDATION_ERROR'
    | 'STORAGE_ERROR'
    | 'IMPORT_PARSE_ERROR'
    | 'NETWORK_ERROR'
    | 'NOT_FOUND'
    | 'UNKNOWN_ERROR';

export interface AppError {
    code: AppErrorCode;
    message: string;
    field?: string;
    details?: unknown;
}

export class ValidationError implements AppError {
    readonly code: AppErrorCode = 'VALIDATION_ERROR';
    constructor(
        public message: string,
        public field?: string,
        public details?: unknown
    ) {}
}

export class StorageError implements AppError {
    readonly code: AppErrorCode = 'STORAGE_ERROR';
    constructor(
        public message: string,
        public details?: unknown
    ) {}
}

export class ImportParseError implements AppError {
    readonly code: AppErrorCode = 'IMPORT_PARSE_ERROR';
    constructor(
        public message: string,
        public field?: string,
        public details?: unknown
    ) {}
}

export class NetworkError implements AppError {
    readonly code: AppErrorCode = 'NETWORK_ERROR';
    constructor(
        public message: string,
        public details?: unknown
    ) {}
}

export class NotFoundError implements AppError {
    readonly code: AppErrorCode = 'NOT_FOUND';
    constructor(
        public message: string,
        public field?: string
    ) {}
}

// ============================================================================
// RESULT TYPE
// ============================================================================

export type Ok<T> = { readonly success: true; readonly value: T };
export type Err<E extends AppError = AppError> = { readonly success: false; readonly error: E };

export type Result<T, E extends AppError = AppError> = Ok<T> | Err<E>;

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates a successful Result wrapping a value.
 */
export function ok<T>(value: T): Ok<T> {
    return { success: true, value };
}

/**
 * Creates a failed Result wrapping an error.
 */
export function err<E extends AppError>(error: E): Err<E> {
    return { success: false, error };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isOk<T, E extends AppError>(result: Result<T, E>): result is Ok<T> {
    return result.success === true;
}

export function isErr<T, E extends AppError>(result: Result<T, E>): result is Err<E> {
    return result.success === false;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Unwraps a Result value, throwing if it's an error.
 * Use in testing or when failure is truly unexpected.
 */
export function unwrap<T, E extends AppError>(result: Result<T, E>): T {
    if (isErr(result)) {
        throw new Error(`[unwrap] Result is Err: ${result.error.code} — ${result.error.message}`);
    }
    return result.value;
}

/**
 * Unwraps a Result error, throwing if it's a success.
 * Useful in tests to assert on the error.
 */
export function unwrapErr<T, E extends AppError>(result: Result<T, E>): E {
    if (isOk(result)) {
        throw new Error(`[unwrapErr] Result is Ok: ${JSON.stringify(result.value)}`);
    }
    return result.error;
}

/**
 * Transforms the value of a successful Result via a mapping function.
 */
export function mapOk<T, U, E extends AppError>(
    result: Result<T, E>,
    fn: (value: T) => U
): Result<U, E> {
    if (isOk(result)) return ok(fn(result.value));
    return result;
}

/**
 * Recovers from an error Result by applying a fallback function.
 */
export function mapErr<T, E extends AppError, F extends AppError>(
    result: Result<T, E>,
    fn: (error: E) => Result<T, F>
): Result<T, F> {
    if (isErr(result)) return fn(result.error);
    return result as unknown as Result<T, F>;
}

/**
 * Chains Results: if Ok, calls the next function returning a Result.
 */
export function flatMap<T, U, E extends AppError>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>
): Result<U, E> {
    if (isOk(result)) return fn(result.value);
    return result;
}

/**
 * Wraps an async operation that may throw into a Result.
 */
export async function tryCatch<T>(
    fn: () => Promise<T>,
    onError?: (e: unknown) => AppError
): Promise<Result<T>> {
    try {
        const value = await fn();
        return ok(value);
    } catch (e) {
        if (onError) return err(onError(e));
        const msg = e instanceof Error ? e.message : String(e);
        return err({ code: 'UNKNOWN_ERROR', message: msg });
    }
}
