import { useState } from 'react';
import './index.css';
import { TimelineStudio } from './components/TimelineStudio';
import { Dashboard } from './components/Dashboard';
import { TimerPage } from './components/TimerPage';
import { LayoutDashboard, CalendarClock, Timer } from 'lucide-react';

function App() {
  const [currentPage, setCurrentPage] = useState<'timeline' | 'dashboard' | 'timer'>('timeline');

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* Navbar */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 z-50">
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
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative border-t border-gray-100 dark:border-gray-800">
        {currentPage === 'timeline' && <TimelineStudio />}
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'timer' && <TimerPage />}
      </main>
    </div>
  );
}

export default App;
