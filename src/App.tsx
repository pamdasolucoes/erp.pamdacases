import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { User } from './types/erp';
import type { CustomerContext } from './types/pamdaCore';
import { authService } from './services/auth';
import { canAccessTab } from './services/access';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginView } from './components/auth/LoginView';


// Views
const DashboardView = lazy(() => import('./views/DashboardView').then(module => ({ default: module.DashboardView })));
const CustomersView = lazy(() => import('./views/customers/CustomersView').then(module => ({ default: module.CustomersView })));
const ProductsView = lazy(() => import('./views/products/ProductsView').then(module => ({ default: module.ProductsView })));
const NewSaleView = lazy(() => import('./views/sales/NewSaleView').then(module => ({ default: module.NewSaleView })));
const SalesListView = lazy(() => import('./views/sales/SalesListView').then(module => ({ default: module.SalesListView })));
const ProductionView = lazy(() => import('./views/production/ProductionView').then(module => ({ default: module.ProductionView })));
const ReceivablesView = lazy(() => import('./views/financial/ReceivablesView').then(module => ({ default: module.ReceivablesView })));
const ClosingsView = lazy(() => import('./views/financial/ClosingsView').then(module => ({ default: module.ClosingsView })));
const DeliveriesView = lazy(() => import('./views/financial/DeliveriesView').then(module => ({ default: module.DeliveriesView })));
const ExpensesView = lazy(() => import('./views/financial/ExpensesView').then(module => ({ default: module.ExpensesView })));
const PurchasesView = lazy(() => import('./views/purchases/PurchasesView').then(module => ({ default: module.PurchasesView })));
const SalesReportView = lazy(() => import('./views/reports/SalesReportView').then(module => ({ default: module.SalesReportView })));
const ProfitabilityView = lazy(() => import('./views/managerial/ProfitabilityView').then(module => ({ default: module.ProfitabilityView })));
const UsersView = lazy(() => import('./views/managerial/UsersView').then(module => ({ default: module.UsersView })));
const AuditLogsView = lazy(() => import('./views/managerial/AuditLogsView').then(module => ({ default: module.AuditLogsView })));
const SettingsView = lazy(() => import('./views/managerial/SettingsView').then(module => ({ default: module.SettingsView })));
const InventoryView = lazy(() => import('./views/inventory/InventoryView').then(module => ({ default: module.InventoryView })));
import { ViewBoundary } from './components/common/ViewBoundary';

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
  const recoveringSession = useRef(true);

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
        let savedTab: string | null = null;
        if (recoveringSession.current) {
          try { savedTab = sessionStorage.getItem(`pamda_navigation:${import.meta.env.VITE_SUPABASE_URL}:${user.id}`); } catch {}
        }
        setCurrentTab(savedTab && canAccessTab(user, savedTab) ? savedTab as ActiveTab : 'dashboard');
        recoveringSession.current = false;
      } else if (!user && !loading) {
        recoveringSession.current = false;
        authenticatedId.current = null;
        setCustomerContext(null);
        setHistoryCustomer(null);
        setNewSaleCustomer(null);
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

  const openNewSale = async(customer: CustomerContext | null = null) => {
    setNavigationError('');
    if(customer&&currentUser){
      const {saleWorkspace}=await import('./services/saleWorkspace');
      const workspace=saleWorkspace(currentUser.id);
      if(workspace.store.getSnapshot().remote?.status&&workspace.store.getSnapshot().remote?.status!=='draft'){
        try{await workspace.newDraft();}catch(error){setNavigationError(error instanceof Error?error.message:'Não foi possível abrir outra venda.');return;}
      }
      // Apply an explicit navigation intent once, outside mount effects/HMR.
      workspace.store.update(previous=>previous.customerId===customer.id?previous:{...previous,customerId:customer.id,branchId:'',commercialDefaultsPending:true,paymentMethodId:null,paymentTermId:null,pricing:{...previous.pricing,freight:'',freightReason:'',manualFreight:false}});
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
      try{const {saleWorkspace}=await import('./services/saleWorkspace');await saleWorkspace(currentUser.id).leave();}
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
    vendas: 'Todas as Vendas',
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
          <ViewBoundary key={currentTab}><Suspense fallback={<p role="status" className="rounded-xl border bg-white p-6 text-slate-600">Carregando tela...</p>}>
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigate={navigate}
            />
          )}

          {currentTab === 'nova_venda' && (
            <NewSaleView initialCustomer={newSaleCustomer} onDiscard={()=>setNewSaleCustomer(null)} />
          )}

          {currentTab === 'vendas' && (
            <SalesListView
              customerContext={historyCustomer}
              onBackToCustomer={() => setCurrentTab('clientes')}
              onNewSaleClick={() => openNewSale(historyCustomer)}
              onContinuePending={() => { setNewSaleCustomer(null); setCurrentTab('nova_venda'); }}
            />
          )}

          {currentTab === 'clientes' && <CustomersView initialCustomerId={customerContext?.id} onSelectCustomer={setCustomerContext} onConsultSales={openCustomerSales} onNewSale={openNewSale} />}

          {(currentTab === 'produtos' || currentTab === 'kits') && (
            <ProductsView />
          )}

          {currentTab === 'estoque' && <InventoryView />}

          {currentTab === 'producao' && (
            <ProductionView />
          )}

          {currentTab === 'contas_receber' && (
            <ReceivablesView />
          )}

          {currentTab === 'fechamentos' && <ClosingsView />}

          {currentTab === 'entregas' && <DeliveriesView />}

          {currentTab === 'despesas' && <ExpensesView />}

          {(currentTab === 'compras' || currentTab === 'fornecedores') && (
            <PurchasesView suppliers={currentTab === 'fornecedores'} />
          )}

          {(currentTab === 'relatorio_vendas' || currentTab === 'relatorio_clientes') && (
            <SalesReportView />
          )}

          {currentTab === 'lucratividade' && (
            <ProfitabilityView />
          )}

          {currentTab === 'custo_estoque' && <InventoryView />}

          {currentTab === 'usuarios' && <UsersView />}

          {currentTab === 'logs' && <AuditLogsView />}

          {currentTab === 'configuracoes' && <SettingsView />}
          </Suspense></ViewBoundary>
          )}
        </main>
      </div>

    </div>
    </React.Fragment>
  );
}

export default App;
