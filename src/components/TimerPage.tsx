import { useState, useEffect } from 'react';
import { database } from '../lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Clock, Camera } from 'lucide-react';

interface Booking {
    id: string;
    date?: string;
    studioType: 'bawah' | 'atas';
    bookingType: string;
    customerName: string;
    startTime: number;
    duration: number;
    noShow?: boolean;
}

const getLocalYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Per-package colors for blocks
const PACKAGE_COLORS: Record<string, { gradient: string; border: string; hover: string; textDark?: boolean }> = {
    'Basic Putih': { gradient: 'from-blue-50 to-indigo-100', border: 'border-indigo-300', hover: 'hover:from-blue-100 hover:to-indigo-200', textDark: true },
    'Basic Abu': { gradient: 'from-slate-500 to-slate-600', border: 'border-slate-700', hover: 'hover:from-slate-600 hover:to-slate-700' },
    'Basic Pink': { gradient: 'from-pink-400 to-rose-500', border: 'border-rose-600', hover: 'hover:from-pink-500 hover:to-rose-600' },
    'Basic Putih + Tirai Merah': { gradient: 'from-blue-50 to-red-400', border: 'border-red-500', hover: 'hover:from-blue-100 hover:to-red-500' },
    'Basic Abu + Tirai Merah': { gradient: 'from-slate-500 to-red-500', border: 'border-red-600', hover: 'hover:from-slate-600 hover:to-red-600' },
    'Basic Pink + Tirai Merah': { gradient: 'from-pink-400 to-red-500', border: 'border-red-600', hover: 'hover:from-pink-500 hover:to-red-600' },
    'Basic Putih + Tirai Hijau': { gradient: 'from-blue-50 to-emerald-400', border: 'border-emerald-500', hover: 'hover:from-blue-100 hover:to-emerald-500' },
};

const DEFAULT_PACKAGE_COLOR = { gradient: 'from-purple-500 to-indigo-600', border: 'border-purple-700', hover: 'hover:from-purple-600 hover:to-indigo-700' };

export function TimerPage() {
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    const darkMode = typeof window !== 'undefined' ? localStorage.getItem('snapme-dark') === 'true' : false;

    const dm = {
        root: darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900',
        timerCard: darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        timerName: darkMode ? 'text-gray-100' : 'text-gray-800',
        timerSub: darkMode ? 'text-gray-400' : 'text-gray-500',
        studioTitle: darkMode ? 'text-gray-200' : 'text-gray-800',
        emptyText: darkMode ? 'text-gray-500' : 'text-gray-400',
        headerBg: darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    };

    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Listen to Firebase for real-time updates
    useEffect(() => {
        const bookingsDbRef = ref(database, 'bookings');
        const unsubscribe = onValue(bookingsDbRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setAllBookings(Object.values(data));
            } else {
                setAllBookings([]);
            }
        });
        return () => unsubscribe();
    }, []);

    const currentTimeInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const todayStr = getLocalYMD(new Date());

    const activeBookings = allBookings.filter(booking => {
        if (booking.noShow) return false;
        if (!booking.arrived) return false;
        if ((booking.date || todayStr) !== todayStr) return false;

        const bookingStart = booking.startTime;
        const bookingEnd = booking.startTime + booking.duration;
        return currentTimeInMinutes >= bookingStart && currentTimeInMinutes < bookingEnd;
    });

    const activeBawah = activeBookings.filter(b => b.studioType === 'bawah');
    const activeAtas = activeBookings.filter(b => b.studioType === 'atas');

    const renderTimerCard = (booking: Booking, studioColor: string) => {
        const endTimeInSeconds = (booking.startTime + booking.duration) * 60;
        const currentSeconds = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
        const remainingTotalSeconds = Math.max(0, endTimeInSeconds - currentSeconds);
        const hours = Math.floor(remainingTotalSeconds / 3600);
        const minutes = Math.floor((remainingTotalSeconds % 3600) / 60);
        const seconds = remainingTotalSeconds % 60;

        const pkgColors = PACKAGE_COLORS[booking.bookingType] || DEFAULT_PACKAGE_COLOR;
        const totalDurationSeconds = booking.duration * 60;
        const progressPercentage = 100 - (remainingTotalSeconds / totalDurationSeconds) * 100;

        const isDarkText = pkgColors.textDark === true;
        const textBase = isDarkText ? 'text-slate-900' : 'text-white';
        const textIcon = isDarkText ? 'text-slate-800' : 'text-white opacity-90';

        return (
            <div
                key={booking.id}
                className={`${dm.timerCard} rounded-2xl shadow-lg border-2 flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.01]`}
            >
                {/* Progress Bar Top */}
                <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 shrink-0">
                    <div
                        className={`h-full bg-gradient-to-r ${pkgColors.gradient} transition-all duration-1000 ease-linear`}
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>

                <div className="p-4 sm:p-5 lg:p-6 flex flex-col">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs sm:text-sm md:text-base font-bold uppercase tracking-wider ${studioColor}`}>
                                Studio {booking.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                            </span>
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                        </div>
                        <h3 className={`text-xl sm:text-2xl lg:text-4xl font-extrabold ${dm.timerName} mb-1 sm:mb-2 truncate`}>
                            {booking.customerName}
                        </h3>
                        <p className={`text-sm sm:text-base lg:text-xl font-medium ${dm.timerSub} truncate`}>
                            {booking.bookingType}
                        </p>
                    </div>

                    <div className={`mt-4 sm:mt-5 lg:mt-6 bg-gradient-to-br ${pkgColors.gradient} rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 shadow-inner flex flex-col items-center justify-center`}>
                        <div className={`flex items-center gap-2 mb-2 sm:mb-3 ${textIcon}`}>
                            <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
                            <p className="text-sm sm:text-base lg:text-xl font-bold tracking-wide uppercase">Sisa Waktu</p>
                        </div>
                        <p className={`text-5xl sm:text-6xl lg:text-7xl font-black tabular-nums tracking-tighter drop-shadow-sm ${textBase}`}>
                            {hours > 0 ? `${hours.toString().padStart(2, '0')}:` : ''}{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`h-full w-full flex flex-col ${dm.root}`}>
            <div className={`shrink-0 ${dm.headerBg} border-b px-4 py-3 sm:py-4 flex items-center justify-between shadow-sm`}>
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 dark:text-purple-400" />
                    <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent">
                        Live Timer
                    </h1>
                </div>
                <div className="text-right">
                    <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">
                        {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                        {currentTime.getHours().toString().padStart(2, '0')}:
                        {currentTime.getMinutes().toString().padStart(2, '0')}:
                        {currentTime.getSeconds().toString().padStart(2, '0')}
                    </p>
                </div>
            </div>

            <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 min-h-full">

                    {/* Kolom Studio Bawah */}
                    <div className="flex flex-col h-full bg-white/50 dark:bg-gray-900/50 rounded-3xl p-4 sm:p-6 border-2 border-purple-100 dark:border-purple-900/30">
                        <div className="flex items-center gap-3 mb-6 shrink-0">
                            <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/50 rounded-xl">
                                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-purple-700 dark:text-purple-400" />
                            </div>
                            <h2 className={`text-xl sm:text-3xl font-black ${dm.studioTitle} uppercase tracking-wider`}>Studio Bawah</h2>
                        </div>

                        <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto">
                            {activeBawah.length > 0 ? (
                                activeBawah.map(b => renderTimerCard(b, 'text-purple-600 dark:text-purple-400'))
                            ) : (
                                <div className={`flex flex-col items-center justify-center h-full min-h-[200px] ${dm.emptyText} border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl`}>
                                    <Clock className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-20" />
                                    <p className="text-lg sm:text-xl font-medium text-center">Tidak ada booking aktif</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Kolom Studio Atas */}
                    <div className="flex flex-col h-full bg-white/50 dark:bg-gray-900/50 rounded-3xl p-4 sm:p-6 border-2 border-cyan-100 dark:border-cyan-900/30">
                        <div className="flex items-center gap-3 mb-6 shrink-0">
                            <div className="p-2 sm:p-3 bg-cyan-100 dark:bg-cyan-900/50 rounded-xl">
                                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-700 dark:text-cyan-400" />
                            </div>
                            <h2 className={`text-xl sm:text-3xl font-black ${dm.studioTitle} uppercase tracking-wider`}>Studio Atas</h2>
                        </div>

                        <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto">
                            {activeAtas.length > 0 ? (
                                activeAtas.map(b => renderTimerCard(b, 'text-cyan-600 dark:text-cyan-400'))
                            ) : (
                                <div className={`flex flex-col items-center justify-center h-full min-h-[200px] ${dm.emptyText} border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl`}>
                                    <Clock className="w-16 h-16 sm:w-20 sm:h-20 mb-4 opacity-20" />
                                    <p className="text-lg sm:text-xl font-medium text-center">Tidak ada booking aktif</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
