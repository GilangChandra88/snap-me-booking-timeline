import { useState } from 'react';
import './index.css';
import { TimelineStudio } from './components/TimelineStudio';
import { Dashboard } from './components/Dashboard';
import { TimerPage } from './components/TimerPage';
import { LayoutDashboard, CalendarClock, Timer, Wallet, Settings, Printer, LayoutTemplate } from 'lucide-react';
import { CashierPage } from './components/CashierPage';
import { SettingsPage } from './components/SettingsPage';
import { PrintPage } from './components/PrintPage';
import { TemplateMakerPage } from './components/TemplateMakerPage';
import { GlobalDriveService } from './components/GlobalDriveService';
import { Toaster } from 'sonner';

function App() {
  const [currentPage, setCurrentPage] = useState<'timeline' | 'dashboard' | 'timer' | 'kasir' | 'setting' | 'print' | 'template_maker'>('timeline');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950 print:h-auto print:w-auto print:overflow-visible print:block">
      {/* Navbar */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 z-50 print:hidden">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                SNAP ME
              </span>
              <div className="ml-4 sm:ml-8 flex space-x-2 sm:space-x-4">
                <button
                  onClick={() => setCurrentPage('timeline')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'timeline'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <CalendarClock className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Timeline Booking</span>
                </button>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'dashboard'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <LayoutDashboard className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Dashboard & Rekap</span>
                </button>
                <button
                  onClick={() => setCurrentPage('timer')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'timer'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Timer className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Timer Live</span>
                </button>
                <button
                  onClick={() => setCurrentPage('kasir')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'kasir'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Wallet className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Kasir</span>
                </button>
                <button
                  onClick={() => setCurrentPage('setting')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'setting'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Settings className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Setting</span>
                </button>
                <button
                  onClick={() => setCurrentPage('print')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'print'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <Printer className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Studio Cetak</span>
                </button>
                <button
                  onClick={() => setCurrentPage('template_maker')}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === 'template_maker'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                    }`}
                >
                  <LayoutTemplate className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Pembuat Template</span>
                </button>
              </div>
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
      </main>
      <GlobalDriveService />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

export default App;
