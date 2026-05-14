import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Backoffice from './pages/Backoffice'
import Ocorrencias from './pages/Ocorrencias'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/backoffice" element={<Backoffice />} />
        <Route path="/backoffice/ocorrencias" element={<Backoffice page="ocorrencias" />} />
        <Route path="/backoffice/limpezas" element={<Backoffice page="limpezas" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}