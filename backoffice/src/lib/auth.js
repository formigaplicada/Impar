const API_URL = 'https://impar-api.formigaplicada.workers.dev'

export const auth = {
  login: () => {
    window.location.href = `${API_URL}/auth/login`
  },

  logout: async () => {
    // Se estiver em impersonate, termina primeiro
    const impersonating = localStorage.getItem('admin_token')
    if (impersonating) {
      await auth.stopImpersonate()
      return
    }
    const { api } = await import('./api')
    await api.post('/auth/logout')
    localStorage.removeItem('session_token')
    window.location.href = '/login'
  },

  me: () => {
    const { api } = import('./api').then(m => m.api.get('/me'))
    return fetch(`${API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        'Content-Type': 'application/json'
      }
    }).then(r => r.json())
  },

  startImpersonate: async (utilizadorId) => {
    const { api } = await import('./api')
    const res = await api.post(`/admin/impersonate/${utilizadorId}`)
    if (res?.ok) {
      localStorage.setItem('admin_token', localStorage.getItem('session_token'))
      localStorage.setItem('session_token', res.token)
      window.location.href = '/backoffice'
    }
    return res
  },

  stopImpersonate: async () => {
    const { api } = await import('./api')
    await api.post('/admin/impersonate/stop')
    const adminToken = localStorage.getItem('admin_token')
    localStorage.setItem('session_token', adminToken)
    localStorage.removeItem('admin_token')
    window.location.href = '/backoffice'
  },

  isImpersonating: () => !!localStorage.getItem('admin_token')
}