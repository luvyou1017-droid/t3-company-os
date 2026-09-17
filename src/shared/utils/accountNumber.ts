export function sanitizeAccountNumberInput(value: string) {
  return value.replace(/[‐‑‒–—−]/g, '-').replace(/[^0-9-]/g, '')
}
