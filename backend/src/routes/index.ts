import { Router } from 'express';

// Import controllers
import * as suppliersController from '../controllers/suppliers.controller.js';
import * as sellersController from '../controllers/sellers.controller.js';
import * as consignmentController from '../controllers/consignment.controller.js';
import * as salesController from '../controllers/sales.controller.js';
import * as productsController from '../controllers/products.controller.js';
import * as auxiliariesController from '../controllers/auxiliaries.controller.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

// ==================== DASHBOARD ====================
router.get('/dashboard', dashboardController.getDashboard);
router.get('/dashboard/quick-stats', dashboardController.getQuickStats);
router.get('/dashboard/sales-chart', dashboardController.getSalesChart);

// ==================== FORNECEDORES ====================
router.get('/suppliers', suppliersController.getAll);
router.get('/suppliers/:id', suppliersController.getById);
router.get('/suppliers/:id/report', suppliersController.getSupplierReport);
router.post('/suppliers', suppliersController.create);
router.put('/suppliers/:id', suppliersController.update);
router.delete('/suppliers/:id', suppliersController.remove);

// ==================== VENDEDORAS ====================
router.get('/sellers', sellersController.getAll);
router.get('/sellers/:id', sellersController.getById);
router.get('/sellers/:id/commissions', sellersController.getCommissionReport);
router.post('/sellers', sellersController.create);
router.put('/sellers/:id', sellersController.update);
router.patch('/sellers/:id/toggle-active', sellersController.toggleActive);
router.post('/sellers/pay-commissions', sellersController.payCommissions);
router.delete('/sellers/:id', sellersController.remove);

// ==================== LISTAS DE CONSIGNAÇÃO ====================
router.get('/consignments', consignmentController.getAll);
router.get('/consignments/payment-report', consignmentController.getPaymentReport);
router.get('/consignments/:id', consignmentController.getById);
router.post('/consignments', consignmentController.create);
router.put('/consignments/:id', consignmentController.update);
router.patch('/consignments/:id/status', consignmentController.updateStatus);
router.patch('/consignments/:id/pay', consignmentController.markAsPaid);
router.delete('/consignments/:id', consignmentController.remove);

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

// ==================== VENDAS ====================
router.get('/sales', salesController.getAll);
router.get('/sales/daily-report', salesController.getDailySalesReport);
router.get('/sales/report', salesController.getSalesReport);
router.get('/sales/:id', salesController.getById);
router.post('/sales', salesController.create);
router.delete('/sales/:id', salesController.cancel);

// ==================== CADASTROS AUXILIARES ====================
// Todos de uma vez (para autocomplete)
router.get('/auxiliaries', auxiliariesController.getAllAuxiliaries);

// Descrições
router.get('/descriptions', auxiliariesController.getDescriptions);
router.post('/descriptions', auxiliariesController.createDescription);
router.delete('/descriptions/:id', auxiliariesController.deleteDescription);

// Cores
router.get('/colors', auxiliariesController.getColors);
router.post('/colors', auxiliariesController.createColor);
router.delete('/colors/:id', auxiliariesController.deleteColor);

// Tamanhos
router.get('/sizes', auxiliariesController.getSizes);
router.post('/sizes', auxiliariesController.createSize);
router.delete('/sizes/:id', auxiliariesController.deleteSize);

// Marcas
router.get('/brands', auxiliariesController.getBrands);
router.post('/brands', auxiliariesController.createBrand);
router.delete('/brands/:id', auxiliariesController.deleteBrand);

export default router;
