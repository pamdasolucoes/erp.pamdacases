import React, { useState, useEffect } from 'react';
import { User, Sale } from './types/erp';
import { authService } from './services/auth';
import { dbService } from './services/db';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';
import { ReceiptModal } from './components/receipt/ReceiptModal';

// Views
import { DashboardView } from './views/DashboardView';
import { CustomersView } from './views/customers/CustomersView';
import { ProductsView } from './views/products/ProductsView';
import { NewSaleView } from './views/sales/NewSaleView';
import { SalesListView } from './views/sales/SalesListView';
import { ProductionView } from './views/production/ProductionView';
import { ReceivablesView } from './views/financial/ReceivablesView';
import { ClosingsView } from './views/financial/ClosingsView';
import { DeliveriesView } from './views/financial/DeliveriesView';
import { ExpensesView } from './views/financial/ExpensesView';
import { PurchasesView } from './views/purchases/PurchasesView';
import { SalesReportView } from './views/reports/SalesReportView';
import { ProfitabilityView } from './views/managerial/ProfitabilityView';
import { UsersView } from './views/managerial/UsersView';
import { AuditLogsView } from './views/managerial/AuditLogsView';
import { SettingsView } from './views/managerial/SettingsView';
import { InventoryView } from './views/inventory/InventoryView';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser());
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global Receipt Modal State
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = authService.subscribe((user) => {
      setCurrentUser(user);
      if (user && user.role === 'producao') {
        setCurrentTab('producao');
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  const handleOpenReceipt = (sale: Sale) => {
    setActiveReceiptSale(sale);
    setIsReceiptModalOpen(true);
  };

  const handleSaleCreated = (sale: Sale) => {
    setActiveReceiptSale(sale);
    setIsReceiptModalOpen(true);
    setCurrentTab('vendas');
  };

  // Se não estiver logado, exibe a tela de login
  if (!currentUser) {
    return <LoginView onLoginSuccess={() => {}} />;
  }

  // Título dinâmico do cabeçalho
  const tabTitles: Record<ActiveTab, string> = {
    dashboard: 'Painel Geral de Operações B2B',
    nova_venda: 'Emissão de Nova Venda B2B',
    vendas: 'Todas as Vendas e Pedidos',
    clientes: 'Gestão de Clientes, Redes & Filiais',
    produtos: 'Catálogo de Produtos & Serviços',
    kits: 'Kits & Produtos Compostos',
    estoque: 'Controle de Estoque & Movimentações',
    producao: 'Fila de Produção & Estamparia UV',
    contas_receber: 'Financeiro: Contas a Receber & Pix',
    fechamentos: 'Fechamentos Semanais & Mensais',
    entregas: 'Fretes & Controle de Motoboys',
    despesas: 'Despesas Operacionais',
    compras: 'Compras & Entradas de Lote',
    fornecedores: 'Fornecedores Homologados',
    relatorio_vendas: 'Relatórios Comerciais de Vendas',
    relatorio_clientes: 'Análise de Vendas por Cliente',
    lucratividade: 'Demonstrativo de Lucratividade Real',
    custo_estoque: 'Custo Total de Estoque',
    usuarios: 'Controle de Usuários e Permissões',
    logs: 'Auditoria & Logs Administrativos',
    configuracoes: 'Configurações Globais & Chave Pix',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        onLogout={() => authService.logout()}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          currentUser={currentUser}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNewSaleClick={() => setCurrentTab('nova_venda')}
          title={tabTitles[currentTab] || 'PAMDA ERP'}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={setCurrentTab}
              onViewReceipt={handleOpenReceipt}
            />
          )}

          {currentTab === 'nova_venda' && (
            <NewSaleView onSaleCreated={handleSaleCreated} />
          )}

          {currentTab === 'vendas' && (
            <SalesListView
              onViewReceipt={handleOpenReceipt}
              onNewSaleClick={() => setCurrentTab('nova_venda')}
            />
          )}

          {currentTab === 'clientes' && <CustomersView />}

          {(currentTab === 'produtos' || currentTab === 'kits') && (
            <ProductsView />
          )}

          {currentTab === 'estoque' && <InventoryView />}

          {currentTab === 'producao' && (
            <ProductionView onViewReceipt={handleOpenReceipt} />
          )}

          {currentTab === 'contas_receber' && (
            <ReceivablesView onViewReceipt={handleOpenReceipt} />
          )}

          {currentTab === 'fechamentos' && <ClosingsView />}

          {currentTab === 'entregas' && <DeliveriesView />}

          {currentTab === 'despesas' && <ExpensesView />}

          {(currentTab === 'compras' || currentTab === 'fornecedores') && (
            <PurchasesView />
          )}

          {(currentTab === 'relatorio_vendas' || currentTab === 'relatorio_clientes') && (
            <SalesReportView />
          )}

          {currentTab === 'lucratividade' && (
            <ProfitabilityView onViewReceipt={handleOpenReceipt} />
          )}

          {currentTab === 'custo_estoque' && <InventoryView />}

          {currentTab === 'usuarios' && <UsersView />}

          {currentTab === 'logs' && <AuditLogsView />}

          {currentTab === 'configuracoes' && <SettingsView />}
        </main>
      </div>

      {/* Global Receipt Modal */}
      <ReceiptModal
        sale={activeReceiptSale}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
}

export default App;
