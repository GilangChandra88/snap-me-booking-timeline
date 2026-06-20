import { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Clock, Camera, Volume2, VolumeX, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { playStartSound, playEndSound, initAudioContext } from '../lib/audio';
import type { Booking } from './TimelineStudio';
import { getLocalYMD } from './TimelineStudio';
import { useAuth, type WorkSchedule } from '../lib/AuthContext';
import { PRESET_PALETTE, type AppSettings, type BookingPackage } from './SettingsPage';

const isTodayNoShow = (booking: Booking, now: Date) => {
    const todayStr = getLocalYMD(now);
    const bDate = booking.date || todayStr;
    if (bDate !== todayStr) return false;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return nowMinutes > booking.startTime + booking.duration && !booking.arrived;
};

const fmtTime = (mins: number) => {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
};

export function TimerPage() {
    const { role, profile } = useAuth();
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [mySchedule, setMySchedule] = useState<WorkSchedule | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [audioEnabled, setAudioEnabled] = useState(false);
    const playedStartSoundRef = useRef<Set<string>>(new Set());
    const playedEndSoundRef   = useRef<Set<string>>(new Set());

    const darkMode = typeof window !== 'undefined' ? localStorage.getItem('snapme-dark') === 'true' : false;

    const dm = {
        root:       darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900',
        timerCard:  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        timerName:  darkMode ? 'text-gray-100' : 'text-gray-800',
        timerSub:   darkMode ? 'text-gray-400' : 'text-gray-500',
        sideName:   darkMode ? 'text-gray-300' : 'text-gray-800',
        studioTitle:darkMode ? 'text-gray-200' : 'text-gray-800',
        emptyText:  darkMode ? 'text-gray-500' : 'text-gray-400',
        headerBg:   darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    };

    const handleEnableAudio = async () => {
        try { await initAudioContext(); setAudioEnabled(true); }
        catch (err) { console.error('Failed to init audio', err); }
    };

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now);
            if (!audioEnabled) return;

            const nowSec  = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
            const todayStr = getLocalYMD(now);

            allBookings.forEach(b => {
                if (isTodayNoShow(b, now) || !b.arrived) return;
                if ((b.date || todayStr) !== todayStr) return;

                const startSec = b.startTime * 60;
                const endSec   = (b.startTime + b.duration) * 60;

                if (nowSec >= startSec && nowSec <= startSec + 5 && !playedStartSoundRef.current.has(b.id)) {
                    playedStartSoundRef.current.add(b.id);
                    playStartSound();
                }
                if (nowSec >= endSec && nowSec <= endSec + 5 && !playedEndSoundRef.current.has(b.id)) {
                    playedEndSoundRef.current.add(b.id);
                    playEndSound();
                }
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [allBookings, audioEnabled]);

    useEffect(() => {
        const unsubBookings = onSnapshot(collection(db, 'bookings'), snap => {
            const list: Booking[] = [];
            snap.forEach(d => list.push(d.data() as Booking));
            setAllBookings(list);
        });
        const unsubSettings = onSnapshot(doc(db, 'settings', 'appSettings'), snap => {
            if (snap.exists()) setSettings(snap.data() as AppSettings);
        });
        const unsubSchedules = onSnapshot(collection(db, 'schedules'), snap => {
            const todayStr = getLocalYMD(new Date());
            const scheds = snap.docs.map(d => d.data() as WorkSchedule);
            const mine = scheds.find(s => s.staffUid === profile?.uid && s.date === todayStr);
            setMySchedule(mine || null);
        });
        return () => { unsubBookings(); unsubSettings(); unsubSchedules(); };
    }, [profile?.uid]);

    const allPackageMap = useMemo(() => {
        const map = new Map<string, BookingPackage>();
        if (!settings?.packages) return map;
        settings.packages.forEach(pkg => map.set(pkg.name, pkg));
        return map;
    }, [settings]);

    const getPackageStyle = (pkg?: BookingPackage) => {
        if (!pkg) return { background: 'linear-gradient(135deg, #a855f7, #4f46e5)', color: '#ffffff', border: '#7e22ce' };
        const p = PRESET_PALETTE[pkg.colorKey] || PRESET_PALETTE['sky'] || PRESET_PALETTE['blue'];
        return {
            background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
            color: p.text,
            border: p.border
        };
    };

    const nowMins  = currentTime.getHours() * 60 + currentTime.getMinutes();
    const todayStr = getLocalYMD(new Date());
    const todayBks = allBookings.filter(b => (b.date || todayStr) === todayStr);

    const activeBookings = todayBks.filter(b => {
        if (isTodayNoShow(b, new Date()) || !b.arrived) return false;
        return nowMins >= b.startTime && nowMins < b.startTime + b.duration;
    });

    const activeBawah = activeBookings.filter(b => b.studioType === 'bawah');
    const activeAtas  = activeBookings.filter(b => b.studioType === 'atas');

    // Selesai terakhir per studio
    const getLastFinished = (studio: 'bawah' | 'atas') =>
        todayBks
            .filter(b => b.studioType === studio && b.arrived && (b.startTime + b.duration) <= nowMins)
            .sort((a, b) => (b.startTime + b.duration) - (a.startTime + a.duration))[0] ?? null;

    // Berikutnya per studio
    const getNextBooking = (studio: 'bawah' | 'atas') =>
        todayBks
            .filter(b => b.studioType === studio && !b.arrived && b.startTime > nowMins)
            .sort((a, b) => a.startTime - b.startTime)[0] ?? null;

    // ── Timer Card ──────────────────────────────────────────────────────────
    const renderTimerCard = (
        booking: Booking,
        prev: Booking | null,
        next: Booking | null,
    ) => {
        const endSec  = (booking.startTime + booking.duration) * 60;
        const curSec  = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
        const remain  = Math.max(0, endSec - curSec);
        const hours   = Math.floor(remain / 3600);
        const minutes = Math.floor((remain % 3600) / 60);
        const seconds = remain % 60;

        const pkg = allPackageMap.get(booking.bookingType);
        const pkgStyle = getPackageStyle(pkg);
        const progress   = 100 - (remain / (booking.duration * 60)) * 100;
        const textBase   = pkgStyle.color === '#1f2937' ? 'text-slate-900' : 'text-white';
        const textMuted  = pkgStyle.color === '#1f2937' ? 'text-slate-700/70' : 'text-white/70';

        return (
            <div key={booking.id} className={`${dm.timerCard} rounded-2xl shadow-lg border-2 flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.01]`}>

                {/* Progress bar */}
                <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 shrink-0">
                    <div
                        className="h-full transition-all duration-1000 ease-linear"
                        style={{ width: `${progress}%`, background: pkgStyle.background }}
                    />
                </div>

                <div className="p-4 sm:p-5 lg:p-6 flex flex-col gap-4">

                    {/* ── 3-kolom nama: sebelumnya | sekarang | berikutnya ── */}
                    <div className="flex items-center gap-2">

                        {/* Kiri: customer sebelumnya */}
                        <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
                            {prev ? (
                                <>
                                    <div className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                        <ChevronLeft className="w-3 h-3 shrink-0" />
                                        <span>Sebelum</span>
                                    </div>
                                    <p className={`text-sm sm:text-base font-bold ${dm.sideName} truncate w-full leading-tight`}>
                                        {prev.customerName}
                                    </p>
                                    <p className={`text-[10px] sm:text-xs ${dm.sideName} truncate w-full leading-tight`}>
                                        {fmtTime(prev.startTime + prev.duration)}
                                    </p>
                                </>
                            ) : <div className="h-10" />}
                        </div>

                        {/* Tengah: customer sekarang (menonjol) */}
                        <div className="shrink-0 flex flex-col items-center text-center px-2">
                            <span className="flex h-2.5 w-2.5 mb-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                            </span>
                            <h3 className={`text-xl sm:text-2xl lg:text-4xl font-extrabold ${dm.timerName} leading-tight`}>
                                {booking.customerName}
                            </h3>
                            <p className={`text-xs sm:text-sm font-medium ${dm.timerSub} mt-0.5`}>
                                {booking.bookingType}
                            </p>
                        </div>

                        {/* Kanan: customer berikutnya */}
                        <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
                            {next ? (
                                <>
                                    <div className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                        <span>Berikut</span>
                                        <ChevronRight className="w-3 h-3 shrink-0" />
                                    </div>
                                    <p className={`text-sm sm:text-base font-bold ${dm.sideName} truncate w-full text-right leading-tight`}>
                                        {next.customerName}
                                    </p>
                                    <p className={`text-[10px] sm:text-xs ${dm.sideName} truncate w-full text-right leading-tight`}>
                                        {fmtTime(next.startTime)}
                                    </p>
                                </>
                            ) : <div className="h-10" />}
                        </div>
                    </div>

                    {/* ── Countdown timer ── */}
                    <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 lg:p-6 shadow-inner flex flex-col items-center justify-center" style={{ background: pkgStyle.background }}>
                        <div className={`flex items-center gap-2 mb-2 sm:mb-3 ${textMuted}`}>
                            <Clock className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
                            <p className="text-sm sm:text-base lg:text-xl font-bold tracking-wide uppercase">Sisa Waktu</p>
                        </div>
                        <p className={`text-5xl sm:text-6xl lg:text-7xl font-black tabular-nums tracking-tighter drop-shadow-sm ${textBase}`}>
                            {hours > 0 ? `${hours.toString().padStart(2, '0')}:` : ''}
                            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    // ── Empty state card: tetap tampilkan sebelumnya & berikutnya ──────────
    const renderEmptyCard = (prev: Booking | null, next: Booking | null) => (
        <div className={`${dm.timerCard} rounded-2xl shadow-sm border-2 border-dashed flex flex-col overflow-hidden`}>
            <div className="p-4 sm:p-5 lg:p-6">
                <div className="flex items-center gap-2">

                    {/* Kiri: sebelumnya */}
                    <div className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
                        {prev ? (
                            <>
                                <div className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                    <ChevronLeft className="w-3 h-3 shrink-0" />
                                    <span>Sebelum</span>
                                </div>
                                <p className={`text-sm sm:text-base font-bold ${dm.sideName} truncate w-full leading-tight`}>
                                    {prev.customerName}
                                </p>
                                <p className={`text-[10px] sm:text-xs ${dm.sideName} truncate w-full`}>
                                    {fmtTime(prev.startTime)}–{fmtTime(prev.startTime + prev.duration)}
                                </p>
                            </>
                        ) : <div className="h-10" />}
                    </div>

                    {/* Tengah: kosong */}
                    <div className="shrink-0 flex flex-col items-center text-center px-2">
                        <Clock className={`w-8 h-8 sm:w-10 sm:h-10 mb-1.5 opacity-20 ${dm.emptyText}`} />
                        <p className={`text-sm sm:text-base font-semibold ${dm.emptyText}`}>Tidak ada</p>
                        <p className={`text-xs ${dm.emptyText}`}>booking aktif</p>
                    </div>

                    {/* Kanan: berikutnya */}
                    <div className="flex-1 min-w-0 flex flex-col items-end gap-0.5">
                        {next ? (
                            <>
                                <div className="flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                                    <span>Berikut</span>
                                    <ChevronRight className="w-3 h-3 shrink-0" />
                                </div>
                                <p className={`text-sm sm:text-base font-bold ${dm.sideName} truncate w-full text-right leading-tight`}>
                                    {next.customerName}
                                </p>
                                <p className={`text-[10px] sm:text-xs ${dm.sideName} truncate w-full text-right`}>
                                    {fmtTime(next.startTime)}
                                </p>
                            </>
                        ) : <div className="h-10" />}
                    </div>
                </div>
            </div>
        </div>
    );


    return (
        <div className={`h-full w-full flex flex-col ${dm.root}`}>

            {/* Header */}
            <div className={`shrink-0 ${dm.headerBg} border-b px-4 py-3 sm:py-4 flex items-center justify-between shadow-sm`}>
                <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-sky-600 dark:text-sky-400" />
                    <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent">
                        Live Timer
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    {!audioEnabled ? (
                        <button
                            onClick={handleEnableAudio}
                            className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-sky-100/50 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-700 dark:text-sky-300 rounded-lg text-sm font-semibold transition-colors border border-sky-200 dark:border-sky-800 animate-pulse"
                        >
                            <VolumeX className="w-4 h-4" />
                            <span className="hidden sm:inline">Aktifkan Suara</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-green-100/50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm font-semibold border border-green-200 dark:border-green-800">
                            <Volume2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Suara Aktif</span>
                        </div>
                    )}

                    <div className="text-right border-l border-gray-200 dark:border-gray-800 pl-4">
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
            </div>

            {/* Staff Schedule Banner */}
            {role === 'staff' && mySchedule && (
                <div className="px-4 pt-4 sm:px-6 lg:px-8">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                            <CalendarIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-emerald-900">Jadwal Kerja Anda Hari Ini</p>
                            <p className="text-xs text-emerald-700 mt-0.5">
                                Shift: {mySchedule.shiftStart} - {mySchedule.shiftEnd}
                                {mySchedule.note && ` • Catatan: ${mySchedule.note}`}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Grid */}
            <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 min-h-full">

                    {/* Studio Atas */}
                    <div className="flex flex-col h-full bg-white/50 dark:bg-gray-900/50 rounded-3xl p-4 sm:p-6 border-2 border-cyan-100 dark:border-cyan-900/30">
                        <div className="flex items-center gap-3 mb-6 shrink-0">
                            <div className="p-2 sm:p-3 bg-cyan-100 dark:bg-cyan-900/50 rounded-xl">
                                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-700 dark:text-cyan-400" />
                            </div>
                            <h2 className={`text-xl sm:text-3xl font-black ${dm.studioTitle} uppercase tracking-wider`}>Studio Atas</h2>
                        </div>

                        <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto">
                            {activeAtas.length > 0 ? (
                                activeAtas.map(b => renderTimerCard(b, getLastFinished('atas'), getNextBooking('atas')))
                            ) : (
                                renderEmptyCard(getLastFinished('atas'), getNextBooking('atas'))
                            )}
                        </div>
                    </div>

                    {/* Studio Bawah */}
                    <div className="flex flex-col h-full bg-white/50 dark:bg-gray-900/50 rounded-3xl p-4 sm:p-6 border-2 border-sky-100 dark:border-sky-900/30">
                        <div className="flex items-center gap-3 mb-6 shrink-0">
                            <div className="p-2 sm:p-3 bg-sky-100 dark:bg-sky-900/50 rounded-xl">
                                <Camera className="w-6 h-6 sm:w-8 sm:h-8 text-sky-700 dark:text-sky-400" />
                            </div>
                            <h2 className={`text-xl sm:text-3xl font-black ${dm.studioTitle} uppercase tracking-wider`}>Studio Bawah</h2>
                        </div>

                        <div className="flex-1 flex flex-col gap-4 sm:gap-6 overflow-y-auto">
                            {activeBawah.length > 0 ? (
                                activeBawah.map(b => renderTimerCard(b, getLastFinished('bawah'), getNextBooking('bawah')))
                            ) : (
                                renderEmptyCard(getLastFinished('bawah'), getNextBooking('bawah'))
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
