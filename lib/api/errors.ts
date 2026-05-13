export type Ok<T> = { ok: true; data: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = ApiError> = Ok<T> | Err<E>;

export type ApiError =
  | { kind: 'NO_SESSION' }
  | { kind: 'HTTP'; status: number; message: string }
  | { kind: 'NETWORK'; message: string }
  | { kind: 'PARSE'; message: string };

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
