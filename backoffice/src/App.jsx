import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Backoffice from './pages/Backoffice'
import Ocorrencias from './pages/Ocorrencias'
import Limpezas from './pages/Limpezas'
import Condominios from './pages/Condominios'
import Lojas from './pages/Lojas'
import Dashboard from './pages/Dashboard'
import Prestadores from './pages/Prestadores'
import OcorrenciaDetalhe from './pages/OcorrenciaDetalhe'
import Eventos from './pages/Eventos'
import Suporte from './pages/Suporte'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/backoffice" element={<Backoffice page="" />} />
        <Route path="/backoffice/propostas" element={<Backoffice page="propostas" />} />
        <Route path="/backoffice/ocorrencias" element={<Backoffice page="ocorrencias" />} />
        <Route path="/backoffice/ocorrencias/:id" element={<Backoffice page="ocorrencia_detalhe" />} />
        <Route path="/backoffice/limpezas" element={<Backoffice page="limpezas" />} />
        <Route path="/backoffice/condominios" element={<Backoffice page="condominios" />} />
        <Route path="/backoffice/prestadores" element={<Backoffice page="prestadores" />} />
        <Route path="/backoffice/eventos" element={<Backoffice page="eventos" />} />
        <Route path="/backoffice/lojas" element={<Backoffice page="lojas" />} />
        <Route path="/suporte" element={<Suporte />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  )
}