import { NavLink, Link } from 'react-router-dom';
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
  Contact,
  ShieldCheck,
  LogOut,
  KeyRound,
  Globe
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// adminOnly: itens visíveis apenas para o perfil administrador
const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ShoppingCart, label: 'PDV', path: '/pdv' },
  { icon: ClipboardList, label: 'Consignacoes', path: '/consignacoes' },
  { icon: Package, label: 'Produtos', path: '/produtos' },
  { icon: Tags, label: 'Etiquetas', path: '/etiquetas' },
  { icon: Globe, label: 'Loja Online', path: '/loja-online', adminOnly: true },
  { icon: Users, label: 'Fornecedores', path: '/fornecedores' },
  { icon: UserCheck, label: 'Vendedoras', path: '/vendedoras', adminOnly: true },
  { icon: FileText, label: 'Relatorios', path: '/relatorios', adminOnly: true },
  { icon: Settings, label: 'Cadastros', path: '/cadastros' },
  { icon: ShieldCheck, label: 'Usuarios', path: '/usuarios', adminOnly: true },
];

const dpMenuItems = [
  { icon: Briefcase, label: 'Funcionarios', path: '/funcionarios', adminOnly: true },
  { icon: Clock, label: 'Ponto', path: '/ponto' },
  { icon: DollarSign, label: 'Folha', path: '/folha', adminOnly: true },
  { icon: Calculator, label: 'Simulador Impostos', path: '/simulador-impostos', adminOnly: true },
  { icon: UserMinus, label: 'Simulador Rescisao', path: '/simulador-rescisao', adminOnly: true },
  { icon: Contact, label: 'Clientes', path: '/clientes' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
    isActive
      ? 'bg-primary-100 text-primary-700 font-medium'
      : 'text-gray-700 hover:bg-gray-100'
  }`;

export function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const visible = <T extends { adminOnly?: boolean }>(items: T[]) => items.filter((item) => !item.adminOnly || isAdmin);

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
        {visible(menuItems).map((item) => (
          <NavLink key={item.path} to={item.path} className={linkClass}>
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}

        {/* Divisor DP */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Departamento Pessoal
          </p>
          {visible(dpMenuItems).map((item) => (
            <NavLink key={item.path} to={item.path} className={linkClass}>
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Usuário logado */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="text-sm">
          <p className="font-medium text-gray-900 truncate">{user?.nome}</p>
          <p className="text-xs text-gray-500">{isAdmin ? 'Administrador' : 'Operador'}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/trocar-senha"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <KeyRound className="w-3.5 h-3.5" /> Senha
          </Link>
          <button
            onClick={() => logout()}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs text-red-600 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">Apega Desapega Brechó</p>
      </div>
    </aside>
  );
}
