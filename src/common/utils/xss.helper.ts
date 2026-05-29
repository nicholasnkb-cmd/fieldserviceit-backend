const HTML_TAG_RE = /<[^>]*>/g;

export function sanitizeHtml(input: string): string {
  return input.replace(HTML_TAG_RE, '');
}

export function sanitizeObject<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = sanitizeHtml(result[field] as string) as any;
    }
  }
  return result;
}
