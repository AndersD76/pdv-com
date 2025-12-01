import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout, FullScreenLayout } from './components/layout';

// Pages
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PDV - Tela cheia */}
        <Route
          path="/pdv"
          element={
            <FullScreenLayout>
              <PDV />
            </FullScreenLayout>
          }
        />

        {/* Outras páginas - Layout normal */}
        <Route
          path="/"
          element={
            <Layout>
              <Dashboard />
            </Layout>
          }
        />
        <Route
          path="/consignacoes"
          element={
            <Layout>
              <Consignacoes />
            </Layout>
          }
        />
        <Route
          path="/consignacoes/nova"
          element={
            <Layout>
              <NovaConsignacao />
            </Layout>
          }
        />
        <Route
          path="/consignacoes/:id"
          element={
            <Layout>
              <ConsignacaoDetalhe />
            </Layout>
          }
        />
        <Route
          path="/produtos"
          element={
            <Layout>
              <Produtos />
            </Layout>
          }
        />
        <Route
          path="/etiquetas"
          element={
            <Layout>
              <Etiquetas />
            </Layout>
          }
        />
        <Route
          path="/fornecedores"
          element={
            <Layout>
              <Fornecedores />
            </Layout>
          }
        />
        <Route
          path="/vendedoras"
          element={
            <Layout>
              <Vendedoras />
            </Layout>
          }
        />
        <Route
          path="/relatorios"
          element={
            <Layout>
              <Relatorios />
            </Layout>
          }
        />
        <Route
          path="/cadastros"
          element={
            <Layout>
              <Cadastros />
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
