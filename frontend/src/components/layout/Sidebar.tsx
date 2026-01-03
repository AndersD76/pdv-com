import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  UserCheck,
  ClipboardList,
  Tags,
  FileText,
  Settings,
  Store,
  Briefcase,
  Clock,
  DollarSign,
  Calculator,
  UserMinus,
  Contact
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ShoppingCart, label: 'PDV', path: '/pdv' },
  { icon: ClipboardList, label: 'Consignacoes', path: '/consignacoes' },
  { icon: Package, label: 'Produtos', path: '/produtos' },
  { icon: Tags, label: 'Etiquetas', path: '/etiquetas' },
  { icon: Users, label: 'Fornecedores', path: '/fornecedores' },
  { icon: UserCheck, label: 'Vendedoras', path: '/vendedoras' },
  { icon: FileText, label: 'Relatorios', path: '/relatorios' },
  { icon: Settings, label: 'Cadastros', path: '/cadastros' },
];

const dpMenuItems = [
  { icon: Briefcase, label: 'Funcionarios', path: '/funcionarios' },
  { icon: Clock, label: 'Ponto', path: '/ponto' },
  { icon: DollarSign, label: 'Folha', path: '/folha' },
  { icon: Calculator, label: 'Simulador Impostos', path: '/simulador-impostos' },
  { icon: UserMinus, label: 'Simulador Rescisao', path: '/simulador-rescisao' },
  { icon: Contact, label: 'Clientes', path: '/clientes' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-200">
        <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
          <Store className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-gray-900">PDV COM</h1>
          <p className="text-xs text-gray-500">Sistema de Controle</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-100 text-primary-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* Divisor DP */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Departamento Pessoal
          </p>
          {dpMenuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Apega Desapega Brechó
        </p>
      </div>
    </aside>
  );
}
