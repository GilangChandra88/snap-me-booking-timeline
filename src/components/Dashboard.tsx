import { useState, useEffect, useMemo } from 'react';
import { database } from '../lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { getLocalYMD } from './TimelineStudio';
import type { Booking } from './TimelineStudio';
import { Users, Camera, Clock, XCircle, CalendarDays, CalendarRange, Calendar as CalendarIcon, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'week' | 'month'>('today');

    // Add Booking Dialog
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState({
        customerName: '',
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
        studioType: 'bawah' as 'bawah' | 'atas',
        bookingType: '',
        startHour: '09',
        startMinute: '00',
        duration: '30',
    });

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);

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

    // --- Firebase write helper ---
    const saveAllBookings = (newList: Booking[]) => {
        const bookingsDbRef = ref(database, 'bookings');
        const map: Record<string, Booking> = {};
        newList.forEach(b => { map[b.id] = b; });
        set(bookingsDbRef, map);
    };

    // Find the next available time slot for a given studio on a given date
    const getNextAvailableTime = (studio: 'bawah' | 'atas', date: string): { hour: string; minute: string } => {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        let candidate = Math.ceil(nowMinutes / 30) * 30;

        const studioBookings = allBookings
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
            startTime,
            duration: Math.max(MIN_DURATION, parseInt(addForm.duration) || MIN_DURATION),
        };
        const updated = [...allBookings, newBooking];
        saveAllBookings(updated);
        setIsAddOpen(false);
        setAddForm({
            customerName: '',
            studioType: 'bawah',
            bookingType: STUDIO_BAWAH_TYPES[0],
            date: getLocalYMD(new Date()),
            startHour: '09',
            startMinute: '00',
            duration: '30',
        });
    };

    const openEditDialog = (b: Booking) => {
        setEditBooking(b);
        setEditForm({
            customerName: b.customerName,
            studioType: b.studioType,
            bookingType: b.bookingType,
            startHour: Math.floor(b.startTime / 60).toString().padStart(2, '0'),
            startMinute: (b.startTime % 60).toString().padStart(2, '0'),
            duration: b.duration.toString(),
        });
    };

    const handleEditSave = () => {
        if (!editBooking || !editForm.customerName.trim()) return;
        const startTime = parseInt(editForm.startHour) * 60 + parseInt(editForm.startMinute);
        const updated = allBookings.map(b =>
            b.id === editBooking.id
                ? {
                    ...b,
                    customerName: editForm.customerName.trim(),
                    studioType: editForm.studioType,
                    bookingType: editForm.bookingType,
                    startTime,
                    duration: Math.max(MIN_DURATION, parseInt(editForm.duration) || MIN_DURATION),
                }
                : b
        );
        saveAllBookings(updated);
        setEditBooking(null);
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        const updated = allBookings.filter(b => b.id !== deleteTarget.id);
        saveAllBookings(updated);
        setDeleteTarget(null);
    };

    const filteredBookings = useMemo(() => {
        const today = new Date();
        const todayYMD = getLocalYMD(today);

        return allBookings.filter(b => {
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
    }, [allBookings, filterPeriod]);

    // Recap Stats
    const totalBookings = filteredBookings.length;
    const totalMinutes = filteredBookings.reduce((sum, b) => sum + (b.noShow ? 0 : b.duration), 0);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainMinutes = totalMinutes % 60;
    const studioBawahCount = filteredBookings.filter(b => b.studioType === 'bawah').length;
    const studioAtasCount = filteredBookings.filter(b => b.studioType === 'atas').length;
    const noShowCount = filteredBookings.filter(b => b.noShow).length;

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
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'today' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <CalendarIcon className="w-4 h-4" /> <span className="hidden xs:inline">Hari Ini</span>
                        </button>
                        <button
                            onClick={() => setFilterPeriod('week')}
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'week' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <CalendarDays className="w-4 h-4" /> <span className="hidden xs:inline">7 Hari</span>
                        </button>
                        <button
                            onClick={() => setFilterPeriod('month')}
                            className={`flex-1 sm:flex-none justify-center px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-md flex items-center gap-1.5 sm:gap-2 transition-colors ${filterPeriod === 'month' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
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
                            <div className="shrink-0 w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-full flex items-center justify-center">
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
                                        <span className="text-purple-600 dark:text-purple-400">Atas</span>
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

                {/* Table */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detail Booking ({filterPeriod === 'today' ? 'Hari Ini' : filterPeriod === 'week' ? '7 Hari' : 'Bulan Ini'})</h2>
                        <Button
                            size="sm"
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md flex items-center gap-1.5 shrink-0"
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
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${b.studioType === 'bawah' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300'}`}>
                                                    Studio {b.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{b.bookingType}</td>
                                            <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{b.duration} Min</td>
                                            <td className="px-4 py-4">
                                                {b.noShow ? (
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                                                        Tidak Datang
                                                    </span>
                                                ) : b.arrived ? (
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                                        Datang
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                                        Belum Datang
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-center gap-1">
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
                            <Plus className="w-5 h-5 text-indigo-600" />
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
                        <Button onClick={handleAddBooking} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white">
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
                            <div>
                                <Label>Nama Customer</Label>
                                <Input
                                    value={editForm.customerName}
                                    onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
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
                                <Button onClick={handleEditSave} className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white">
                                    Simpan Perubahan
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ========== DELETE CONFIRMATION DIALOG ========== */}
            <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
                <DialogContent className="w-[95vw] max-w-[400px] rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-red-600">
                            <Trash2 className="w-5 h-5" />
                            Hapus Booking
                        </DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4 py-2">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Apakah Anda yakin ingin menghapus booking berikut?
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
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>
                                    Batal
                                </Button>
                                <Button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                                    Ya, Hapus
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
