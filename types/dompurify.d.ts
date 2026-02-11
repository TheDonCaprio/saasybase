declare module 'dompurify' {
  export default function createDOMPurify(window: unknown): {
    sanitize(input: string, options?: unknown): string;
  };
}
