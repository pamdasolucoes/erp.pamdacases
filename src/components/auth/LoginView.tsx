import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { authService } from '../../services/auth';
import { PamdaLogo } from '../common/PamdaLogo';

interface LoginViewProps {
  onLoginSuccess: () => void;
  sessionError?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, sessionError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Por favor, informe seu e-mail e senha.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const res = await authService.login(email, password);
      if (res.success) {
        onLoginSuccess();
      } else {
        setErrorMessage(res.error || 'Credenciais inválidas.');
      }
    } catch (err) {
      setErrorMessage('Ocorreu um erro ao processar o login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
        {/* Left Side: Visual Showcase matching Screen 1 */}
        <div className="lg:col-span-6 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 sm:p-12 flex flex-col justify-between text-white relative overflow-hidden">
          {/* Subtle decorative circles */}
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
          <div className="absolute -left-10 -top-10 w-60 h-60 rounded-full bg-purple-600/15 blur-2xl pointer-events-none" />

          {/* Top Brand */}
          <div className="relative z-10">
            <PamdaLogo size="lg" variant="light" />
            <p className="text-xs text-slate-300 font-medium mt-2">
              ERP Especialista B2B & Personalização DTF UV
            </p>
          </div>

          {/* Center Graphic Showcase */}
          <div className="my-8 relative z-10 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xs">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Sistema Operacional B2B
              </span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Gestão ágil de clientes, filiais, estamparia DTF UV em capas de celular,
              composição de kits personalizados, esteira de produção e emissão de recibos com Pix.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5 text-center text-xs">
              <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                <span className="block text-blue-400 font-black text-sm">100% B2B</span>
                <span className="text-[10px] text-slate-300">Lojas & Redes</span>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                <span className="block text-emerald-400 font-black text-sm">Seq. 10000</span>
                <span className="text-[10px] text-slate-300">Recibos Oficiais</span>
              </div>
              <div className="bg-white/10 rounded-xl p-2.5 border border-white/10">
                <span className="block text-purple-400 font-black text-sm">DTF UV</span>
                <span className="text-[10px] text-slate-300">Kits & Serviços</span>
              </div>
            </div>
          </div>

          {/* Bottom Info */}
          <div className="relative z-10 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Pamda Cases Indústria e Comércio</span>
            <span>Curitiba / PR</span>
          </div>
        </div>

        {/* Right Side: Simple Clean Login Form matching Screen 1 */}
        <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <div className="text-left mb-8">
              <div className="mb-4">
                <PamdaLogo size="md" variant="dark" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Bem-vindo ao PAMDA ERP
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Entre com seu <strong className="font-semibold text-slate-700">e-mail</strong> e <strong className="font-semibold text-slate-700">senha</strong> para acessar o sistema.
              </p>
            </div>

            {(errorMessage || sessionError) && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span role="alert">{errorMessage || sessionError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    autoComplete="email"
                    aria-label="E-mail"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Digite seu e-mail"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all font-medium"
                    autoFocus
                  />
                </div>
              </div>

              {/* Senha */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    name="password"
                    autoComplete="current-password"
                    aria-label="Senha"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Entrar Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer mt-6"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

          </div>
        </div>
      </div>
    </div>
  );
};
