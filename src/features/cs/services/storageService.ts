export const storageService = {
  get<T>(key: string, fallback: T): T {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('t3-storage-updated', { detail: { key } }))
  },
}
