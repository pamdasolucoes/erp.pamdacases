import React, { useState } from 'react';
import { Settings, Save, QrCode, Building, CheckCircle2 } from 'lucide-react';
import { dbService } from '../../services/db';
import { AppSettings } from '../../types/erp';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(dbService.getSettings());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dbService.updateSettings(settings);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Configurações do Sistema Pamda Cases
        </h1>
        <p className="text-xs text-slate-500">
          Chave Pix oficial para recibos, dados da matriz e parâmetros globais
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Configurações salvas com sucesso! Todos os novos recibos usarão estes dados.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        {/* Chave Pix e Pagamento */}
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-blue-600" />
            <span>Configuração do Pix nos Recibos</span>
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Esta chave Pix é gerada e exibida nos recibos com pendência financeira para escaneamento imediato
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-medium">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Chave Pix Oficial da Pamda *
              </label>
              <input
                type="text"
                required
                value={settings.pixKey}
                onChange={(e) => setSettings({ ...settings, pixKey: e.target.value })}
                placeholder="Ex: capaspix@gmail.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Tipo da Chave Pix
              </label>
              <select
                value={settings.pixKeyType}
                onChange={(e) => setSettings({ ...settings, pixKeyType: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none bg-white"
              >
                <option value="email">E-mail</option>
                <option value="cnpj">CNPJ</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Chave Aleatória</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Nome do Beneficiário (Razão Social no Pix)
              </label>
              <input
                type="text"
                value={settings.pixBeneficiaryName}
                onChange={(e) => setSettings({ ...settings, pixBeneficiaryName: e.target.value })}
                placeholder="PAMDA CASES IND E COM"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Dados da Empresa */}
        <div className="pt-4 border-t border-slate-200">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Building className="w-4 h-4 text-slate-600" />
            <span>Dados da Empresa (Impressão do Recibo)</span>
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Informações que saem no cabeçalho do Recibo Oficial B2B
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
            <div>
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Nome Fantasia
              </label>
              <input
                type="text"
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                CNPJ
              </label>
              <input
                type="text"
                value={settings.cnpj}
                onChange={(e) => setSettings({ ...settings, cnpj: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Telefone de Atendimento
              </label>
              <input
                type="text"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold uppercase text-[11px] mb-1">
                Valor Padrão de Frete (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={settings.defaultDeliveryFee}
                onChange={(e) => setSettings({ ...settings, defaultDeliveryFee: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Configurações</span>
          </button>
        </div>
      </form>
    </div>
  );
};
