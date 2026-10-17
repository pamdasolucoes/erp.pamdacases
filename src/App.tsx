import React, { useState, useEffect, useRef } from 'react';
import { User, Sale } from './types/erp';
import type { CustomerContext } from './types/pamdaCore';
import { authService } from './services/auth';
import { canAccessTab } from './services/access';
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
import {saleWorkspace} from './services/saleWorkspace';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(authService.getCurrentUser());
  const [authReady, setAuthReady] = useState(!authService.isLoading());
  const [sessionError, setSessionError] = useState<string | null>(authService.getError());
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customerContext, setCustomerContext] = useState<CustomerContext | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<CustomerContext | null>(null);
  const [newSaleCustomer, setNewSaleCustomer] = useState<CustomerContext | null>(null);
  const [navigationError,setNavigationError]=useState('');
  const authenticatedId = useRef<string | null>(null);

  // Global Receipt Modal State
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = authService.subscribe((user, loading, error) => {
      setCurrentUser(user);
      setSessionError(error);
      if (!loading) setAuthReady(true);
      if (user && authenticatedId.current !== user.id) {
        authenticatedId.current = user.id;
        setCustomerContext(null);
        setHistoryCustomer(null);
        setNewSaleCustomer(null);
        setActiveReceiptSale(null);
        setIsReceiptModalOpen(false);
        setCurrentTab('dashboard');
      } else if (!user && !loading) {
        authenticatedId.current = null;
        setCustomerContext(null);
        setHistoryCustomer(null);
        setNewSaleCustomer(null);
        setActiveReceiptSale(null);
        setIsReceiptModalOpen(false);
        setMobileMenuOpen(false);
      }
    });
    void authService.initialize();
    const revalidate=()=>{if(authService.getCurrentUser()) void authService.refresh();};
    const visible=()=>{if(document.visibilityState==='visible') revalidate();};
    window.addEventListener('online',revalidate);
    window.addEventListener('focus',revalidate);
    document.addEventListener('visibilitychange',visible);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('online',revalidate);
      window.removeEventListener('focus',revalidate);
      document.removeEventListener('visibilitychange',visible);
    };
  }, []);

  useEffect(()=>{
    if(!currentUser) return;
    try{sessionStorage.setItem(`pamda_navigation:${import.meta.env.VITE_SUPABASE_URL}:${currentUser.id}`,currentTab);}catch{}
  },[currentTab,currentUser?.id]);

  const handleOpenReceipt = (sale: Sale) => {
    setActiveReceiptSale(sale);
    setIsReceiptModalOpen(true);
  };

  const openNewSale = async(customer: CustomerContext | null = null) => {
    setNavigationError('');
    if(customer&&currentUser){
      const workspace=saleWorkspace(currentUser.id);
      if(workspace.store.getSnapshot().remote?.status&&workspace.store.getSnapshot().remote?.status!=='draft'){
        try{await workspace.newDraft();}catch(error){setNavigationError(error instanceof Error?error.message:'Não foi possível abrir outra venda.');return;}
      }
      // Apply an explicit navigation intent once, outside mount effects/HMR.
      workspace.store.update(previous=>previous.customerId===customer.id?previous:{...previous,customerId:customer.id,branchId:'',pricing:{...previous.pricing,freight:'',freightReason:'',manualFreight:false}});
    }
    setNewSaleCustomer(customer);
    if (customer) setCustomerContext(customer);
    setCurrentTab('nova_venda');
  };
  const openCustomerSales = (customer: CustomerContext) => {
    setCustomerContext(customer);
    setHistoryCustomer(customer);
    setCurrentTab('vendas');
  };
  const navigate = async(tab: ActiveTab) => {
    if(currentTab==='nova_venda'&&tab!=='nova_venda'&&currentUser){
      setNavigationError('');
      try{await saleWorkspace(currentUser.id).leave();}
      catch(error){setNavigationError(error instanceof Error?error.message:'Não foi possível concluir a saída da venda.');return;}
    }
    if (tab === 'nova_venda') { openNewSale(); return; }
    if (tab === 'vendas') setHistoryCustomer(null);
    setCurrentTab(tab);
  };

  // Se não estiver logado, exibe a tela de login
  if (!authReady) {
    return <div role="status" className="min-h-screen flex items-center justify-center bg-slate-50">Validando sessão...</div>;
  }
  if (!currentUser) {
    return <LoginView onLoginSuccess={() => {}} sessionError={sessionError} />;
  }
  // Título dinâmico do cabeçalho
  const tabTitles: Record<ActiveTab, string> = {
    dashboard: 'Painel Geral de Operações B2B',
    nova_venda: 'Emissão de Nova Venda B2B',
    vendas: 'Todas as Vendas e Pedidos',
    clientes: 'Clientes e Unidades — PAMDA CORE',
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
    <React.Fragment key={currentUser.id}>
    {sessionError && <div role="alertdialog" aria-modal="true" aria-label="Validação da sessão pendente" className="fixed inset-0 z-[100] bg-slate-50 flex items-center justify-center p-6"><div className="max-w-lg space-y-4"><h1 className="text-xl font-bold">Não foi possível revalidar seu acesso</h1><p>{sessionError}</p><p className="text-sm text-slate-600">A preparação foi preservada nesta aba. Valide a sessão para continuar.</p><div className="flex gap-4"><button type="button" onClick={()=>{void authService.refresh();}} className="bg-blue-600 text-white rounded-xl px-4 py-2">Tentar validar novamente</button><button type="button" onClick={()=>{void authService.logout();}} className="underline">Sair</button></div></div></div>}
    <div inert={!!sessionError} aria-hidden={!!sessionError || undefined} className="min-h-screen bg-slate-50 flex w-full">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={navigate}
        currentUser={currentUser}
        onLogout={() => { void authService.logout(); }}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          currentUser={currentUser}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onNewSaleClick={() => openNewSale()}
          title={tabTitles[currentTab] || 'PAMDA ERP'}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {navigationError&&<p role="alert" className="mb-4 text-sm text-rose-800">{navigationError}</p>}
          {!canAccessTab(currentUser, currentTab) ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Acesso não autorizado a este módulo.</p>
          ) : (
          <>
          {currentTab !== 'clientes' && currentTab !== 'usuarios' && currentTab !== 'nova_venda' && currentTab !== 'produtos' && currentTab !== 'kits' && currentTab !== 'vendas' && (
            <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Módulo de demonstração. Os dados desta tela são locais; os clientes oficiais do PAMDA CORE são consultados em Clientes e Unidades.
            </p>
          )}
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={navigate}
              onViewReceipt={handleOpenReceipt}
            />
          )}

          {currentTab === 'nova_venda' && (
            <NewSaleView initialCustomer={newSaleCustomer} onDiscard={()=>setNewSaleCustomer(null)} />
          )}

          {currentTab === 'vendas' && (
            <SalesListView
              onViewReceipt={handleOpenReceipt}
              customerContext={historyCustomer}
              onBackToCustomer={() => setCurrentTab('clientes')}
              onNewSaleClick={() => openNewSale(historyCustomer)}
            />
          )}

          {currentTab === 'clientes' && <CustomersView initialCustomerId={customerContext?.id} onSelectCustomer={setCustomerContext} onConsultSales={openCustomerSales} onNewSale={openNewSale} />}

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
          </>
          )}
        </main>
      </div>

      {/* Global Receipt Modal */}
      <ReceiptModal
        sale={activeReceiptSale}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
    </React.Fragment>
  );
}

export default App;
