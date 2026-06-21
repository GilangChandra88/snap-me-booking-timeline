import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, writeBatch, doc, updateDoc, deleteField } from 'firebase/firestore';
import { getLocalYMD } from './TimelineStudio';
import type { Booking } from './TimelineStudio';
import { Users, Camera, Clock, XCircle, CalendarDays, CalendarRange, Calendar as CalendarIcon, Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { normalizePhoneNumber } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../lib/AuthContext';

const STUDIO_BAWAH_TYPES = [
    'Basic Putih',
    'Basic Abu',
    'Basic Pink',
    'Basic Putih + Tirai Merah',
    'Basic Abu + Tirai Merah',
    'Basic Pink + Tirai Merah',
];
const STUDIO_ATAS_TYPES = [
    'Basic Putih',
    'Basic Putih + Tirai Hijau',
];

const MIN_DURATION = 30;

export function Dashboard() {
    const { role, profile } = useAuth();
    const [rawBookings, setRawBookings] = useState<Booking[]>([]);
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'week' | 'month'>('today');
    const [showDeleted, setShowDeleted] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Update 'now' every second for the DP countdown
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Add Booking Dialog
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({
        customerName: '',
        customerPhone: '',
        studioType: 'bawah' as 'bawah' | 'atas',
        bookingType: STUDIO_BAWAH_TYPES[0],
        date: getLocalYMD(new Date()),
        startHour: '09',
        startMinute: '00',
        duration: '30',
    });

    // Edit Booking Dialog
    const [editBooking, setEditBooking] = useState<Booking | null>(null);
    const [editForm, setEditForm] = useState({
        customerName: '',
        customerPhone: '',
        studioType: 'bawah' as 'bawah' | 'atas',
        bookingType: '',
        startHour: '09',
        startMinute: '00',
        duration: '30',
    });

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
    const [cancelReason, setCancelReason] = useState<string>('');

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'bookings'), (snapshot) => {
            const list: Booking[] = [];
            snapshot.forEach((docSnap) => {
                const b = docSnap.data() as Booking;
                b.id = b.id || docSnap.id;
                list.push(b);
            });
            setRawBookings(list);
        });
        return () => unsubscribe();
    }, []);

    const activeBookings = useMemo(() => rawBookings.filter(b => !b.deletedAt), [rawBookings]);

    // --- Firebase write helper ---
    const saveAllBookings = async (newList: Booking[]) => {
        try {
            const batch = writeBatch(db);
            const currentIds = new Set(rawBookings.map(b => b.id));
            const newIds = new Set(newList.map(b => b.id));
            
            // Delete removed bookings
            for (const id of currentIds) {
                if (!newIds.has(id)) {
                    batch.delete(doc(db, 'bookings', id));
                }
            }
            
            const oldMap = new Map(rawBookings.map(b => [b.id, b]));
            
            // Set only remaining/new bookings THAT ACTUALLY CHANGED
            newList.forEach(b => {
                const oldB = oldMap.get(b.id);
                if (!oldB || JSON.stringify(oldB) !== JSON.stringify(b)) {
                    // Remove any undefined properties since Firestore explicitly rejects them
                    const sanitizedBooking = JSON.parse(JSON.stringify(b));
                    batch.set(doc(db, 'bookings', b.id), sanitizedBooking);
                }
            });
            
            await batch.commit();
        } catch (e) {
            console.error(e);
            alert("Gagal menyimpan bookings: " + String(e));
        }
    };

    // Find the next available time slot for a given studio on a given date
    const getNextAvailableTime = (studio: 'bawah' | 'atas', date: string): { hour: string; minute: string } => {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        let candidate = Math.ceil(nowMinutes / 30) * 30;

        const studioBookings = activeBookings
            .filter(b => b.studioType === studio && (b.date || getLocalYMD(new Date())) === date)
            .sort((a, b) => a.startTime - b.startTime);

        for (let attempt = 0; attempt < 48; attempt++) {
            const candidateEnd = candidate + MIN_DURATION;
            const hasConflict = studioBookings.some(b => {
                const bEnd = b.startTime + b.duration;
                return candidate < bEnd && candidateEnd > b.startTime;
            });
            if (!hasConflict && candidate < 24 * 60) {
                break;
            }
            candidate += 30;
        }

        if (candidate >= 24 * 60) candidate = nowMinutes;

        const hour = Math.floor(candidate / 60).toString().padStart(2, '0');
        const minute = (candidate % 60).toString().padStart(2, '0');
        return { hour, minute };
    };

    // --- CRUD handlers ---
    const handleAddBooking = () => {
        if (!addForm.customerName.trim() || !addForm.bookingType) return;
        const startTime = parseInt(addForm.startHour) * 60 + parseInt(addForm.startMinute);
        const newBooking: Booking = {
            id: Date.now().toString(),
            date: addForm.date,
            studioType: addForm.studioType,
            bookingType: addForm.bookingType,
            customerName: addForm.customerName.trim(),
            ...(addForm.customerPhone.trim() ? { customerPhone: addForm.customerPhone.trim() } : {}),
            startTime,
            duration: Math.max(MIN_DURATION, parseInt(addForm.duration) || MIN_DURATION),
        };
        const updated = [...rawBookings, newBooking];
        saveAllBookings(updated);
        setIsAddOpen(false);
        setAddForm({
            customerName: '',
            customerPhone: '',
            studioType: 'bawah',
            bookingType: STUDIO_BAWAH_TYPES[0],
            date: getLocalYMD(new Date()),
            startHour: '09',
            startMinute: '00',
            duration: '30',
        });
        toast.success(`Booking untuk ${newBooking.customerName} berhasil ditambahkan!`);
    };

    const openEditDialog = (b: Booking) => {
        setEditBooking(b);
        setEditForm({
            customerName: b.customerName,
            customerPhone: b.customerPhone || '',
            studioType: b.studioType,
            bookingType: b.bookingType,
            startHour: Math.floor(b.startTime / 60).toString().padStart(2, '0'),
            startMinute: (b.startTime % 60).toString().padStart(2, '0'),
            duration: b.duration.toString(),
        });
    };

    const handleEditSave = async () => {
        if (!editBooking || !editForm.customerName.trim()) return;
        const startTime = parseInt(editForm.startHour) * 60 + parseInt(editForm.startMinute);
        
        try {
            const updates: any = {
                customerName: editForm.customerName.trim(),
                studioType: editForm.studioType,
                bookingType: editForm.bookingType,
                startTime,
                duration: Math.max(MIN_DURATION, parseInt(editForm.duration) || MIN_DURATION),
            };
            if (editForm.customerPhone.trim()) {
                updates.customerPhone = editForm.customerPhone.trim();
            } else {
                updates.customerPhone = deleteField();
            }
            
            await updateDoc(doc(db, 'bookings', editBooking.id), updates);
            setEditBooking(null);
            toast.success('Perubahan berhasil disimpan!');
        } catch (e) {
            console.error(e);
            toast.error('Gagal menyimpan perubahan');
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await updateDoc(doc(db, 'bookings', deleteTarget.id), {
                deletedAt: Date.now(),
                cancelReason: cancelReason || 'Dibatalkan oleh Admin'
            });
            setDeleteTarget(null);
            setCancelReason('');
            toast.success('Booking berhasil dibatalkan!');
        } catch (e) {
            console.error(e);
            toast.error('Gagal membatalkan booking');
        }
    };

    const handleRestore = async (id: string) => {
        try {
            const b = rawBookings.find(x => x.id === id);
            if (!b) return;
            
            const updates: any = {
                deletedAt: deleteField(),
                cancelReason: deleteField(),
                status: 'pending' // Force reset customer status
            };
            if (b.dpStatus === 'cancelled') {
                updates.dpStatus = 'pending';
                updates.dpRequestedAt = Date.now();
            }
            
            await updateDoc(doc(db, 'bookings', id), updates);
            toast.success('Booking berhasil direstore!');
        } catch (e) {
            console.error(e);
            toast.error('Gagal merestore booking');
        }
    };

    const handleVerifyDP = async (id: string, action: 'verified' | 'cancelled' | 'pending') => {
        try {
            const updates: any = { dpStatus: action };
            if (action === 'verified') {
                updates.dpVerifiedAt = Date.now();
                updates.dpVerifiedBy = profile?.displayName || 'Admin';
                updates.deletedAt = deleteField();
                updates.cancelReason = deleteField();
            } else if (action === 'pending') {
                updates.dpVerifiedAt = deleteField();
                updates.dpVerifiedBy = deleteField();
                updates.dpRequestedAt = Date.now();
            } else {
                updates.deletedAt = Date.now();
                updates.cancelReason = 'manual';
            }
            
            await updateDoc(doc(db, 'bookings', id), updates);
            if (action === 'verified') {
                toast.success('DP berhasil diverifikasi!');
            } else if (action === 'pending') {
                toast.success('Status DP dikembalikan ke Menunggu DP.');
            } else {
                toast.success('Booking ditolak dan dibatalkan.');
            }
        } catch (e) {
            console.error(e);
            toast.error('Gagal mengubah status DP');
        }
    };

    const pendingDP = useMemo(() => {
        return activeBookings.filter(b => b.dpStatus === 'pending');
    }, [activeBookings]);

    const filteredBookings = useMemo(() => {
        const today = new Date();
        const todayYMD = getLocalYMD(today);
        const sourceBookings = showDeleted ? rawBookings : activeBookings;

        return sourceBookings.filter(b => {
            const bDate = b.date || todayYMD;
            if (filterPeriod === 'today') {
                return bDate === todayYMD;
            }
            if (filterPeriod === 'month') {
                return bDate.substring(0, 7) === todayYMD.substring(0, 7);
            }
            if (filterPeriod === 'week') {
                const dDate = new Date(bDate);
                const diffTime = today.getTime() - dDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= 7;
            }
            return true;
        }).sort((a, b) => {
            const dateA = a.date || todayYMD;
            const dateB = b.date || todayYMD;
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return b.startTime - a.startTime;
        });
    }, [rawBookings, activeBookings, filterPeriod, showDeleted]);

    // Recap Stats
    const totalBookings = filteredBookings.length;
    const totalMinutes = filteredBookings.reduce((sum, b) => sum + (b.arrived ? b.duration : 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainMinutes = totalMinutes % 60;
    const studioBawahCount = filteredBookings.filter(b => b.studioType === 'bawah').length;
    const studioAtasCount = filteredBookings.filter(b => b.studioType === 'atas').length;
    const currentDate = new Date();
    const nowMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    const todayYMDForNoShow = getLocalYMD(currentDate);
    const noShowCount = filteredBookings.filter(b => {
        if (b.deletedAt) return false;
        const bDate = b.date || todayYMDForNoShow;
        if (bDate !== todayYMDForNoShow) return false;
        const endMin = b.startTime + b.duration;
        return nowMinutes > endMin && !b.arrived;
    }).length;

    // Format time helper
    const formatTime = (minutes: number) => {
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    const getTypesForStudio = (studio: 'bawah' | 'atas') =>
        studio === 'bawah' ? STUDIO_BAWAH_TYPES : STUDIO_ATAS_TYPES;

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-auto">
            <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8">

                {/* Header & Filter */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard & Rekap</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Ringkasan aktivitas studio Snap Me</p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-1 rounded-lg inline-flex flex-wrap sm:flex-nowrap shadow-sm border border-gray-200 dark:border-gray-700 w-full md:w-auto">
                        <button
                            onClick={() => setFilterPeriod('today')}
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'today' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <CalendarIcon className="w-4 h-4" /> <span className="hidden xs:inline">Hari Ini</span>
                        </button>
                        <button
                            onClick={() => setFilterPeriod('week')}
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'week' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <CalendarDays className="w-4 h-4" /> <span className="hidden xs:inline">7 Hari</span>
                        </button>
                        <button
                            onClick={() => setFilterPeriod('month')}
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'month' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <CalendarRange className="w-4 h-4" /> <span className="hidden xs:inline">Bulan Ini</span>
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="flex flex-row overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:snap-none md:pb-0">
                    <div className="min-w-[260px] md:min-w-0 shrink-0 snap-center bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Booking</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalBookings}</p>
                            </div>
                            <div className="shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center">
                                <Users className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="min-w-[260px] md:min-w-0 shrink-0 snap-center bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Durasi (Aktif)</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                                    {totalHours}<span className="text-lg text-gray-500 ml-1">j</span> {remainMinutes}<span className="text-lg text-gray-500 ml-1">m</span>
                                </p>
                            </div>
                            <div className="shrink-0 w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center">
                                <Clock className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="min-w-[260px] md:min-w-0 shrink-0 snap-center bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Distribusi Studio</p>
                                <div className="mt-2 text-sm">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-sky-600 dark:text-sky-400">Atas</span>
                                        <span className="font-semibold text-gray-700 dark:text-gray-300 ml-4">{studioAtasCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-cyan-600 dark:text-cyan-400">Bawah</span>
                                        <span className="font-semibold text-gray-700 dark:text-gray-300 ml-4">{studioBawahCount}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center">
                                <Camera className="w-6 h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="min-w-[260px] md:min-w-0 shrink-0 snap-center bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tidak Datang</p>
                                <p className="text-3xl font-bold text-red-600 dark:text-red-500 mt-1">{noShowCount}</p>
                            </div>
                            <div className="shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full flex items-center justify-center">
                                <XCircle className="w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Panel Verifikasi DP */}
                {(role === 'admin' || role === 'owner') && pendingDP.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-900/50 p-4 sm:p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                            <Clock className="w-5 h-5 text-amber-500" /> Verifikasi Pembayaran DP
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {pendingDP.map(b => {
                                const timeoutMs = 15 * 60 * 1000;
                                const remainingMs = Math.max(0, (b.dpRequestedAt || 0) + timeoutMs - now);
                                const mins = Math.floor(remainingMs / 60000);
                                const secs = Math.floor((remainingMs % 60000) / 1000);
                                const isWarning = remainingMs < 5 * 60 * 1000;
                                
                                return (
                                    <div key={b.id} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-xs tracking-wide">
                                                <span className="relative flex h-2.5 w-2.5">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                                </span>
                                                MENUNGGU VERIFIKASI
                                            </div>
                                            <div className={`text-sm font-mono font-bold px-2 py-0.5 rounded-md ${isWarning ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 'bg-amber-200/50 text-amber-700 dark:text-amber-500'}`}>
                                                ⏱ {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
                                            </div>
                                        </div>
                                        <div className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight mb-1 truncate">{b.customerName}</div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex items-center gap-1.5 truncate">
                                            <Camera className="w-3.5 h-3.5" /> Studio {b.studioType === 'bawah' ? 'Bawah' : 'Atas'} · {b.bookingType}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-100 hover:text-amber-800 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900" onClick={() => handleVerifyDP(b.id, 'cancelled')}>Tolak</Button>
                                            <Button className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm border-none" onClick={() => handleVerifyDP(b.id, 'verified')}>Verifikasi</Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detail Booking ({filterPeriod === 'today' ? 'Hari Ini' : filterPeriod === 'week' ? '7 Hari' : 'Bulan Ini'})</h2>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                variant={showDeleted ? 'default' : 'outline'}
                                onClick={() => setShowDeleted(!showDeleted)}
                                className={`flex items-center gap-2 ${showDeleted ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:text-red-700' : ''}`}
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">{showDeleted ? 'Sembunyikan Batal/Dihapus' : 'Tampilkan Batal/Dihapus'}</span>
                            </Button>
                            <Button
                                size="sm"
                                className="bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white shadow-md flex items-center gap-1.5 shrink-0"
                                onClick={() => {
                                    const today = getLocalYMD(new Date());
                                    const recommended = getNextAvailableTime('bawah', today);
                                    setAddForm(f => ({ ...f, date: today, studioType: 'bawah', bookingType: STUDIO_BAWAH_TYPES[0], startHour: recommended.hour, startMinute: recommended.minute }));
                                    setIsAddOpen(true);
                                }}
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Tambah Booking</span>
                            </Button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400">
                                <tr>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Waktu</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Customer</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Studio</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Paket</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Durasi</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap">Status</th>
                                    <th className="px-4 py-3 font-medium whitespace-nowrap text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredBookings.length > 0 ? (
                                    filteredBookings.map((b) => (
                                        <tr key={b.id} className="hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors even:bg-gray-50/50 dark:even:bg-gray-800/30">
                                            <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{b.date || getLocalYMD(new Date())}</td>
                                            <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{formatTime(b.startTime)} - {formatTime(b.startTime + b.duration)}</td>
                                            <td className="px-4 py-4 font-bold text-gray-900 dark:text-gray-100">{b.customerName}</td>
                                            <td className="px-4 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${b.studioType === 'bawah' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300'}`}>
                                                    Studio {b.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{b.bookingType}</td>
                                            <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{b.duration} Min</td>
                                            <td className="px-4 py-4">
                                                <div className="flex flex-col gap-1.5">
                                                    {(() => {
                                                        if (b.deletedAt) {
                                                            return (
                                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 w-fit">
                                                                    Batal / Dihapus
                                                                </span>
                                                            );
                                                        }
                                                        const todayYMD = getLocalYMD(new Date());
                                                        const bDate = b.date || todayYMD;
                                                        const endMin = b.startTime + b.duration;
                                                        const isNoShow = bDate === todayYMD && (new Date().getHours() * 60 + new Date().getMinutes()) > endMin && !b.arrived;
                                                        if (isNoShow) {
                                                            return (
                                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 w-fit">
                                                                    Tidak Datang
                                                                </span>
                                                            );
                                                        }
                                                        if (b.arrived) {
                                                            return (
                                                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 w-fit">
                                                                    Datang
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 w-fit">
                                                                Belum Datang
                                                            </span>
                                                        );
                                                    })()}
                                                    
                                                    {b.dpStatus === 'pending' && !b.deletedAt && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-200 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400 w-fit">
                                                            Pending DP
                                                        </span>
                                                    )}
                                                    {b.dpStatus === 'verified' && !b.deletedAt && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-200 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400 w-fit">
                                                            DP Lunas
                                                        </span>
                                                    )}
                                                    {b.dpStatus === 'cancelled' && (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-200 text-red-800 dark:bg-red-900/40 dark:text-red-400 w-fit">
                                                            DP Timeout
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
                                                    {!b.deletedAt ? (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                                                onClick={() => openEditDialog(b)}
                                                                title="Edit Booking"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 w-8 p-0 text-red-600 hover:text-red-800 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                                                                onClick={() => setDeleteTarget(b)}
                                                                title="Hapus Booking"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-green-600 hover:text-green-800 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30"
                                                            onClick={() => handleRestore(b.id)}
                                                            title="Restore Booking"
                                                        >
                                                            <RotateCcw className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                            Belum ada data booking untuk periode ini.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ========== ADD BOOKING DIALOG ========== */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="w-[95vw] max-w-[460px] rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                            <Plus className="w-5 h-5 text-blue-600" />
                            Tambah Booking Baru
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <Label>Nama Customer</Label>
                            <Input
                                value={addForm.customerName}
                                onChange={(e) => setAddForm({ ...addForm, customerName: e.target.value })}
                                placeholder="Masukkan nama"
                            />
                        </div>
                        <div>
                            <Label>No. WhatsApp (opsional)</Label>
                            <Input
                                value={addForm.customerPhone}
                                onChange={(e) => setAddForm({ ...addForm, customerPhone: normalizePhoneNumber(e.target.value) })}
                                placeholder="Contoh: 081234567"
                            />
                        </div>
                        <div>
                            <Label>Tanggal</Label>
                            <Input
                                type="date"
                                value={addForm.date}
                                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Studio</Label>
                            <Select
                                value={addForm.studioType}
                                onValueChange={(v) => {
                                    const st = v as 'bawah' | 'atas';
                                    const types = getTypesForStudio(st);
                                    const recommended = getNextAvailableTime(st, addForm.date);
                                    setAddForm({ ...addForm, studioType: st, bookingType: types[0], startHour: recommended.hour, startMinute: recommended.minute });
                                }}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bawah">Studio Bawah</SelectItem>
                                    <SelectItem value="atas">Studio Atas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Jenis Paket</Label>
                            <Select
                                value={addForm.bookingType}
                                onValueChange={(v) => setAddForm({ ...addForm, bookingType: v })}
                            >
                                <SelectTrigger><SelectValue placeholder="Pilih jenis" /></SelectTrigger>
                                <SelectContent>
                                    {getTypesForStudio(addForm.studioType).map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <Label>Jam</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="23"
                                    value={addForm.startHour}
                                    onChange={(e) => setAddForm({ ...addForm, startHour: e.target.value.padStart(2, '0') })}
                                />
                            </div>
                            <div className="flex-1">
                                <Label>Menit</Label>
                                <Select
                                    value={addForm.startMinute}
                                    onValueChange={(v) => setAddForm({ ...addForm, startMinute: v })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="00">00</SelectItem>
                                        <SelectItem value="30">30</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex-1">
                                <Label>Durasi (min)</Label>
                                <Input
                                    type="number"
                                    min="30"
                                    step="30"
                                    value={addForm.duration}
                                    onChange={(e) => setAddForm({ ...addForm, duration: e.target.value })}
                                />
                            </div>
                        </div>
                        <Button onClick={handleAddBooking} className="w-full bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white">
                            Tambah Booking
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ========== EDIT BOOKING DIALOG ========== */}
            <Dialog open={!!editBooking} onOpenChange={(open) => { if (!open) setEditBooking(null); }}>
                <DialogContent className="w-[95vw] max-w-[460px] rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                            <Pencil className="w-5 h-5 text-blue-600" />
                            Edit Booking
                        </DialogTitle>
                    </DialogHeader>
                    {editBooking && (
                        <div className="space-y-4 py-2">
                            {/* DP Action inside Edit Form */}
                            {(editBooking.dpStatus === 'pending' || editBooking.dpStatus === 'cancelled') && (
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-amber-800">
                                            Status: {editBooking.dpStatus === 'pending' ? 'Menunggu DP' : 'Batal/Timeout DP'}
                                        </div>
                                        <div className="text-xs text-amber-600">
                                            Lakukan verifikasi untuk mengamankan jadwal.
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {editBooking.customerPhone && (
                                            <a 
                                                href={`https://wa.me/${editBooking.customerPhone.replace(/^0/, '62')}?text=Halo%20${encodeURIComponent(editBooking.customerName)},%20kami%20dari%20Snap%20Me.%20Mohon%20segera%20melakukan%20pembayaran%20DP%20untuk%20booking%20Studio%20${editBooking.studioType === 'bawah' ? 'Bawah' : 'Atas'}.`}
                                                target="_blank" 
                                                rel="noreferrer"
                                            >
                                                <Button size="sm" variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 bg-white shadow-sm">
                                                    Hubungi WA
                                                </Button>
                                            </a>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                handleVerifyDP(editBooking.id, 'verified');
                                                setEditBooking({ ...editBooking, dpStatus: 'verified', deletedAt: undefined });
                                            }}
                                            className="bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                        >
                                            Verifikasi DP
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {editBooking.dpStatus === 'verified' && (
                                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-semibold text-teal-800">
                                            Status: DP Lunas
                                        </div>
                                        <div className="text-xs text-teal-600">
                                            DP sudah diverifikasi.
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            if (!confirm('Batalkan verifikasi DP dan kembalikan ke status Menunggu DP?')) return;
                                            handleVerifyDP(editBooking.id, 'pending');
                                            setEditBooking({ ...editBooking, dpStatus: 'pending' });
                                        }}
                                        className="border-teal-600 text-teal-700 hover:bg-teal-100 bg-white shadow-sm"
                                    >
                                        Batal Verifikasi
                                    </Button>
                                </div>
                            )}
                            <div>
                                <Label>Nama Customer</Label>
                                <Input
                                    value={editForm.customerName}
                                    onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>No. WhatsApp (opsional)</Label>
                                <Input
                                    value={editForm.customerPhone}
                                    onChange={(e) => setEditForm({ ...editForm, customerPhone: normalizePhoneNumber(e.target.value) })}
                                    placeholder="Contoh: 081234567"
                                />
                            </div>
                            <div>
                                <Label>Studio</Label>
                                <Select
                                    value={editForm.studioType}
                                    onValueChange={(v) => {
                                        const st = v as 'bawah' | 'atas';
                                        const types = getTypesForStudio(st);
                                        setEditForm({ ...editForm, studioType: st, bookingType: types[0] });
                                    }}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bawah">Studio Bawah</SelectItem>
                                        <SelectItem value="atas">Studio Atas</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Jenis Paket</Label>
                                <Select
                                    value={editForm.bookingType}
                                    onValueChange={(v) => setEditForm({ ...editForm, bookingType: v })}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {getTypesForStudio(editForm.studioType).map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <Label>Jam</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={editForm.startHour}
                                        onChange={(e) => setEditForm({ ...editForm, startHour: e.target.value.padStart(2, '0') })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <Label>Menit</Label>
                                    <Select
                                        value={editForm.startMinute}
                                        onValueChange={(v) => setEditForm({ ...editForm, startMinute: v })}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="00">00</SelectItem>
                                            <SelectItem value="30">30</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex-1">
                                    <Label>Durasi (min)</Label>
                                    <Input
                                        type="number"
                                        min="30"
                                        step="30"
                                        value={editForm.duration}
                                        onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setEditBooking(null)}>
                                    Batal
                                </Button>
                                <Button onClick={handleEditSave} className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                                    Simpan Perubahan
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ========== DELETE CONFIRMATION DIALOG ========== */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { 
                if (!open) {
                    setDeleteTarget(null);
                    setCancelReason('');
                }
            }}>
                <DialogContent className="w-[95vw] max-w-[400px] rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-red-600">
                            <XCircle className="w-5 h-5" />
                            Batalkan / Hapus Booking
                        </DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4 py-2">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Apakah Anda yakin ingin membatalkan booking berikut? Booking akan dipindahkan ke status Batal.
                            </p>
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-1">
                                <p className="font-bold text-gray-900 dark:text-gray-100">{deleteTarget.customerName}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {deleteTarget.bookingType} • Studio {deleteTarget.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {formatTime(deleteTarget.startTime)} - {formatTime(deleteTarget.startTime + deleteTarget.duration)}
                                </p>
                            </div>
                            <div>
                                <Label>Alasan Pembatalan (Opsional)</Label>
                                <Input 
                                    placeholder="Contoh: Reschedule, Pelanggan membatalkan..." 
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <Button variant="outline" className="flex-1" onClick={() => {
                                    setDeleteTarget(null);
                                    setCancelReason('');
                                }}>
                                    Kembali
                                </Button>
                                <Button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                                    Ya, Batalkan
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
