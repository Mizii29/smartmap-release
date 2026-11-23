export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const url = new URL(input instanceof Request ? input.url : input.toString(), location.href)
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return window.fetch(input, init)
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
  const token = localStorage.getItem('token')
  if (token && !headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token)
  return window.fetch(input, { ...init, headers, redirect: 'error' })
}
