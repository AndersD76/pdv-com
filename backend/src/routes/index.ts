import express, { Router } from 'express';
import { requireAuth, requireAdmin } from '../auth.js';

// Import controllers
import * as authController from '../controllers/auth.controller.js';
import * as usersController from '../controllers/users.controller.js';
import * as suppliersController from '../controllers/suppliers.controller.js';
import * as sellersController from '../controllers/sellers.controller.js';
import * as consignmentController from '../controllers/consignment.controller.js';
import * as salesController from '../controllers/sales.controller.js';
import * as productsController from '../controllers/products.controller.js';
import * as auxiliariesController from '../controllers/auxiliaries.controller.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

// Departamento Pessoal controllers
import * as employeesController from '../controllers/employees.controller.js';
import * as timeclockController from '../controllers/timeclock.controller.js';
import * as payrollController from '../controllers/payroll.controller.js';
import * as simulatorsController from '../controllers/simulators.controller.js';
import * as customersController from '../controllers/customers.controller.js';

// IA e loja online
import * as aiController from '../controllers/ai.controller.js';
import { getStatus as getLojaStatus } from '../controllers/loja.controller.js';

const router = Router();

// IDs de rota precisam ser numéricos
for (const param of ['id', 'productId', 'lista_id']) {
  router.param(param, (req, res, next, value) => {
    if (!/^\d+$/.test(value)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    next();
  });
}

// ==================== AUTENTICAÇÃO (pública) ====================
router.post('/auth/login', authController.login);
router.post('/auth/logout', authController.logout);

// Daqui para baixo, todas as rotas exigem login
router.use(requireAuth);

router.get('/auth/me', authController.me);
router.post('/auth/change-password', authController.changePassword);

// ==================== USUÁRIOS (admin) ====================
router.get('/users', requireAdmin, usersController.getAll);
router.post('/users', requireAdmin, usersController.create);
router.put('/users/:id', requireAdmin, usersController.update);

// ==================== DASHBOARD ====================
router.get('/dashboard', dashboardController.getDashboard);
router.get('/dashboard/quick-stats', dashboardController.getQuickStats);
router.get('/dashboard/sales-chart', dashboardController.getSalesChart);

// ==================== FORNECEDORES ====================
router.get('/suppliers', suppliersController.getAll);
router.get('/suppliers/:id', suppliersController.getById);
router.get('/suppliers/:id/report', requireAdmin, suppliersController.getSupplierReport);
router.post('/suppliers', suppliersController.create);
router.put('/suppliers/:id', suppliersController.update);
router.delete('/suppliers/:id', requireAdmin, suppliersController.remove);

// ==================== VENDEDORAS ====================
router.get('/sellers', sellersController.getAll);
router.get('/sellers/:id', sellersController.getById);
router.get('/sellers/:id/commissions', requireAdmin, sellersController.getCommissionReport);
router.post('/sellers', requireAdmin, sellersController.create);
router.put('/sellers/:id', requireAdmin, sellersController.update);
router.patch('/sellers/:id/toggle-active', requireAdmin, sellersController.toggleActive);
router.post('/sellers/pay-commissions', requireAdmin, sellersController.payCommissions);
router.delete('/sellers/:id', requireAdmin, sellersController.remove);

// ==================== LISTAS DE CONSIGNAÇÃO ====================
router.get('/consignments', consignmentController.getAll);
router.get('/consignments/payment-report', requireAdmin, consignmentController.getPaymentReport);
router.get('/consignments/:id', consignmentController.getById);
router.post('/consignments', consignmentController.create);
router.put('/consignments/:id', consignmentController.update);
router.patch('/consignments/:id/status', consignmentController.updateStatus);
router.patch('/consignments/:id/pay', requireAdmin, consignmentController.markAsPaid);
router.delete('/consignments/:id', requireAdmin, consignmentController.remove);

// Produtos da lista
router.post('/consignments/:id/products', consignmentController.addProduct);
router.put('/consignments/:id/products/:productId', consignmentController.updateProduct);
router.delete('/consignments/:id/products/:productId', consignmentController.removeProduct);
router.patch('/consignments/:id/return-all', consignmentController.returnAllProducts);

// ==================== PRODUTOS ====================
router.get('/products', productsController.getAll);
router.get('/products/search', productsController.searchAvailable);
router.get('/products/barcode/:codigo', productsController.getByBarcode);
router.get('/products/labels/:lista_id', productsController.getLabelsData);
router.get('/products/:id', productsController.getById);
router.patch('/products/:productId/return', consignmentController.returnProduct);

// Foto da peça (corpo = arquivo de imagem; o limite maior só vale depois do login)
router.get('/products/:id/foto', productsController.getPhoto);
router.put(
  '/products/:id/foto',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  productsController.uploadPhoto
);
router.delete('/products/:id/foto', productsController.deletePhoto);

// ==================== IA (cadastro de peças por foto) ====================
router.get('/ai/status', aiController.status);
router.post('/ai/analisar-peca', express.json({ limit: '12mb' }), aiController.analisarPecaHandler);

// ==================== LOJA ONLINE / INSTAGRAM ====================
router.get('/loja/status', requireAdmin, getLojaStatus);

// ==================== VENDAS ====================
router.get('/sales', requireAdmin, salesController.getAll);
router.get('/sales/daily-report', requireAdmin, salesController.getDailySalesReport);
router.get('/sales/report', requireAdmin, salesController.getSalesReport);
router.get('/sales/:id', salesController.getById);
router.post('/sales', salesController.create);
router.patch('/sales/:id/cancel', requireAdmin, salesController.cancel);

// ==================== CADASTROS AUXILIARES ====================
// Todos de uma vez (para autocomplete)
router.get('/auxiliaries', auxiliariesController.getAllAuxiliaries);

// Descrições
router.get('/descriptions', auxiliariesController.getDescriptions);
router.post('/descriptions', auxiliariesController.createDescription);
router.delete('/descriptions/:id', requireAdmin, auxiliariesController.deleteDescription);

// Cores
router.get('/colors', auxiliariesController.getColors);
router.post('/colors', auxiliariesController.createColor);
router.delete('/colors/:id', requireAdmin, auxiliariesController.deleteColor);

// Tamanhos
router.get('/sizes', auxiliariesController.getSizes);
router.post('/sizes', auxiliariesController.createSize);
router.delete('/sizes/:id', requireAdmin, auxiliariesController.deleteSize);

// Marcas
router.get('/brands', auxiliariesController.getBrands);
router.post('/brands', auxiliariesController.createBrand);
router.delete('/brands/:id', requireAdmin, auxiliariesController.deleteBrand);

// ==================== DEPARTAMENTO PESSOAL ====================

// Funcionários (dados salariais: só admin; a lista resumida serve ao registro de ponto)
router.get('/employees/options', employeesController.getOptions);
router.get('/employees', requireAdmin, employeesController.getAll);
router.get('/employees/stats', requireAdmin, employeesController.getStats);
router.get('/employees/:id', requireAdmin, employeesController.getById);
router.post('/employees', requireAdmin, employeesController.create);
router.put('/employees/:id', requireAdmin, employeesController.update);
router.patch('/employees/:id/toggle-status', requireAdmin, employeesController.toggleStatus);
router.delete('/employees/:id', requireAdmin, employeesController.remove);

// Controle de Ponto (registrar e consultar: todos; ajustes: admin)
router.get('/timeclock', timeclockController.getAll);
router.get('/timeclock/resumo', requireAdmin, timeclockController.getResumo);
router.get('/timeclock/:id', timeclockController.getById);
router.post('/timeclock', timeclockController.registrar);
router.put('/timeclock/:id', requireAdmin, timeclockController.update);
router.delete('/timeclock/:id', requireAdmin, timeclockController.remove);

// Configuração de Jornada
router.get('/jornada', timeclockController.getJornada);
router.post('/jornada', requireAdmin, timeclockController.saveJornada);

// Folha de Pagamento
router.post('/folha/calcular', requireAdmin, payrollController.calcularFolha);
router.post('/folha/13-salario', requireAdmin, payrollController.calcularDecimoTerceiro);
router.post('/folha/ferias', requireAdmin, payrollController.calcularFerias);

// Simuladores
router.post('/simulador/impostos', requireAdmin, simulatorsController.simularImpostos);
router.post('/simulador/rescisao', requireAdmin, simulatorsController.simularRescisao);

// Clientes
router.get('/customers', customersController.getAll);
router.get('/customers/stats', customersController.getStats);
router.get('/customers/:id', customersController.getById);
router.post('/customers', customersController.create);
router.put('/customers/:id', customersController.update);
router.delete('/customers/:id', requireAdmin, customersController.remove);

export default router;
