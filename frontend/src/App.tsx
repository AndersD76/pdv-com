import { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, FullScreenLayout } from './components/layout';
import { RequireAuth } from './components/auth/RequireAuth';

// Pages
import Login from './pages/auth/Login';
import TrocarSenha from './pages/auth/TrocarSenha';
import Dashboard from './pages/Dashboard';
import PDV from './pages/pdv/PDV';
import Consignacoes from './pages/consignacao/Consignacoes';
import ConsignacaoDetalhe from './pages/consignacao/ConsignacaoDetalhe';
import NovaConsignacao from './pages/consignacao/NovaConsignacao';
import Produtos from './pages/Produtos';
import Etiquetas from './pages/etiquetas/Etiquetas';
import Fornecedores from './pages/cadastros/Fornecedores';
import Vendedoras from './pages/cadastros/Vendedoras';
import Relatorios from './pages/relatorios/Relatorios';
import Cadastros from './pages/cadastros/Cadastros';
import Usuarios from './pages/cadastros/Usuarios';
import LojaOnline from './pages/loja/LojaOnline';

// Departamento Pessoal Pages
import Funcionarios from './pages/dp/Funcionarios';
import Ponto from './pages/dp/Ponto';
import Folha from './pages/dp/Folha';
import SimuladorImpostos from './pages/dp/SimuladorImpostos';
import SimuladorRescisao from './pages/dp/SimuladorRescisao';
import Clientes from './pages/dp/Clientes';

// Página protegida: exige login (e perfil admin, se indicado) e aplica o layout
function page(element: ReactNode, options: { admin?: boolean; fullScreen?: boolean } = {}) {
  return (
    <RequireAuth admin={options.admin}>
      {options.fullScreen ? <FullScreenLayout>{element}</FullScreenLayout> : <Layout>{element}</Layout>}
    </RequireAuth>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Acesso */}
        <Route path="/login" element={<Login />} />
        <Route path="/trocar-senha" element={<TrocarSenha />} />

        {/* PDV - Tela cheia */}
        <Route path="/pdv" element={page(<PDV />, { fullScreen: true })} />

        {/* Outras páginas - Layout normal */}
        <Route path="/" element={page(<Dashboard />)} />
        <Route path="/consignacoes" element={page(<Consignacoes />)} />
        <Route path="/consignacoes/nova" element={page(<NovaConsignacao />)} />
        <Route path="/consignacoes/:id" element={page(<ConsignacaoDetalhe />)} />
        <Route path="/produtos" element={page(<Produtos />)} />
        <Route path="/etiquetas" element={page(<Etiquetas />)} />
        <Route path="/fornecedores" element={page(<Fornecedores />)} />
        <Route path="/vendedoras" element={page(<Vendedoras />, { admin: true })} />
        <Route path="/relatorios" element={page(<Relatorios />, { admin: true })} />
        <Route path="/cadastros" element={page(<Cadastros />)} />
        <Route path="/usuarios" element={page(<Usuarios />, { admin: true })} />
        <Route path="/loja-online" element={page(<LojaOnline />, { admin: true })} />

        {/* Departamento Pessoal */}
        <Route path="/funcionarios" element={page(<Funcionarios />, { admin: true })} />
        <Route path="/ponto" element={page(<Ponto />)} />
        <Route path="/folha" element={page(<Folha />, { admin: true })} />
        <Route path="/simulador-impostos" element={page(<SimuladorImpostos />, { admin: true })} />
        <Route path="/simulador-rescisao" element={page(<SimuladorRescisao />, { admin: true })} />
        <Route path="/clientes" element={page(<Clientes />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
