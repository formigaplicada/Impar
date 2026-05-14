const API_URL = 'https://impar-api.formigaplicada.workers.dev'

function getToken() {
  return localStorage.getItem('session_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    },
    ...options
  })

  if (res.status === 401) {
    localStorage.removeItem('session_token')
    window.location.href = '/login'
    return
  }

  return res.json()
}

export const api = {
  get:  (path)       => request(path),
  post: (path, body) => request(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:  (path, body) => request(path, { method: 'PUT',   body: JSON.stringify(body) }),
  del:  (path)       => request(path, { method: 'DELETE' }),
}