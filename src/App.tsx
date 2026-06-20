import { useState, useEffect } from 'react';
import './index.css';
import { TimelineStudio } from './components/TimelineStudio';
import { Dashboard } from './components/Dashboard';
import { TimerPage } from './components/TimerPage';
import { LayoutDashboard, CalendarClock, Timer, Wallet, Settings, Printer, LayoutTemplate, TrendingUp, Users, LogOut, Loader2 } from 'lucide-react';
import { CashierPage } from './components/CashierPage';
import { SettingsPage } from './components/SettingsPage';
import { PrintPage } from './components/PrintPage';
import { TemplateMakerPage } from './components/TemplateMakerPage';
import { GlobalDriveService } from './components/GlobalDriveService';
import { GoogleTokenKeepAlive } from './components/GoogleTokenKeepAlive';
import { Toaster } from 'sonner';

// New auth & pages
import { AuthProvider, useAuth, canAccess } from './lib/AuthContext';
import { LoginPage } from './components/LoginPage';
import { EmployeePage } from './components/EmployeePage';
import { AnalysisPage } from './components/AnalysisPage';

function AppContent() {
  const { user, profile, role, loading, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<'timeline' | 'dashboard' | 'timer' | 'kasir' | 'setting' | 'print' | 'template_maker' | 'analisis' | 'karyawan'>('timeline');

  // If role changes and they can't access current page, redirect to timeline
  useEffect(() => {
    if (role && !canAccess(role, currentPage)) {
      setCurrentPage('timeline');
    }
  }, [role, currentPage]);

  if (loading) {
      return (
          <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          </div>
      );
  }

  if (!user) {
      return (
          <>
            <LoginPage />
            <Toaster position="top-right" richColors closeButton />
          </>
      );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950 print:h-auto print:w-auto print:overflow-visible print:block">
      {/* Navbar */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 z-50 print:hidden">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <span className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent">
                SNAP ME
              </span>
              <div className="ml-4 sm:ml-8 flex space-x-2 sm:space-x-4">
                {canAccess(role, 'timeline') && (
                <button
                  onClick={() => setCurrentPage('timeline')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'timeline'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <CalendarClock className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Timeline Booking</span>
                </button>
                )}
                {canAccess(role, 'dashboard') && (
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'dashboard'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <LayoutDashboard className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Dashboard & Rekap</span>
                </button>
                )}
                {canAccess(role, 'timer') && (
                <button
                  onClick={() => setCurrentPage('timer')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'timer'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Timer className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Timer Live</span>
                </button>
                )}
                {canAccess(role, 'kasir') && (
                <button
                  onClick={() => setCurrentPage('kasir')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'kasir'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Wallet className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Kasir</span>
                </button>
                )}
                {canAccess(role, 'setting') && (
                <button
                  onClick={() => setCurrentPage('setting')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'setting'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Settings className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Setting</span>
                </button>
                )}
                {canAccess(role, 'print') && (
                <button
                  onClick={() => setCurrentPage('print')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'print'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Printer className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Studio Cetak</span>
                </button>
                )}
                {canAccess(role, 'template_maker') && (
                <button
                  onClick={() => setCurrentPage('template_maker')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'template_maker'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <LayoutTemplate className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Pembuat Template</span>
                </button>
                )}
                {canAccess(role, 'analisis') && (
                <button
                  onClick={() => setCurrentPage('analisis')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'analisis'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <TrendingUp className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Analisis</span>
                </button>
                )}
                {canAccess(role, 'karyawan') && (
                <button
                  onClick={() => setCurrentPage('karyawan')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'karyawan'
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Users className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Karyawan</span>
                </button>
                )}
              </div>
            </div>
            {/* User Info & Logout */}
            <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                    <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{profile?.displayName}</p>
                    <p className="text-xs text-gray-500 capitalize">{role}</p>
                </div>
                <button 
                    onClick={signOut}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Logout"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative border-t border-gray-100 dark:border-gray-800 print:overflow-visible print:border-none print:static print:block">
        {currentPage === 'timeline' && <TimelineStudio />}
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'timer' && <TimerPage />}
        {currentPage === 'kasir' && <CashierPage />}
        {currentPage === 'setting' && <SettingsPage />}
        {currentPage === 'print' && <PrintPage />}
        {currentPage === 'template_maker' && <TemplateMakerPage />}
        {currentPage === 'analisis' && <AnalysisPage />}
        {currentPage === 'karyawan' && <EmployeePage />}
      </main>
      <GlobalDriveService />
      <GoogleTokenKeepAlive />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}
