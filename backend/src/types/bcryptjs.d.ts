declare module 'bcryptjs' {
  export function hash(data: string | Buffer, salt: number | string): string;
  export function compare(data: string | Buffer, hash: string): boolean;
  export function genSaltSync(rounds?: number, seed?: string): string;
  export function hashSync(data: string | Buffer, salt: number | string): string;
  export function compareSync(data: string | Buffer, hash: string): boolean;
  export function hash(data: string | Buffer, salt: number | string, callback: (err: Error | null, hash: string) => void): void;
  export function compare(data: string | Buffer, hash: string, callback: (err: Error | null, success: boolean) => void): void;
  export function genSalt(rounds?: number, callback?: (err: Error | null, salt: string) => void): void;
}
