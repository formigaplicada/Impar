import { api } from './api'

const API_URL = 'https://impar-api.formigaplicada.workers.dev'

export const auth = {
  login: () => {
    window.location.href = `${API_URL}/auth/login`
  },

  logout: async () => {
    await api.post('/auth/logout')
    window.location.href = '/login'
  },

  me: () => api.get('/me')
}