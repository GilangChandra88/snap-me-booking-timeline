import { useState, useEffect, useMemo } from 'react';
import { db, firebaseConfig } from '../lib/firebase';
import {
    collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc
} from 'firebase/firestore';
import {
    initializeApp, deleteApp
} from 'firebase/app';
import {
    getAuth, createUserWithEmailAndPassword
} from 'firebase/auth';
import { useAuth, type UserProfile, type WorkSchedule, type UserRole } from '../lib/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
    Users, UserPlus, Calendar, Edit2, Shield, User, Clock,
    ChevronLeft, ChevronRight, X, CheckCircle, AlertCircle, Loader2,
    BadgeCheck, Briefcase
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABEL: Record<UserRole, { label: string; color: string; bg: string }> = {
    owner: { label: 'Owner',  color: 'text-amber-700',  bg: 'bg-amber-100'  },
    admin: { label: 'Admin',  color: 'text-blue-700',   bg: 'bg-blue-100'   },
    staff: { label: 'Staff',  color: 'text-emerald-700',bg: 'bg-emerald-100' },
};

const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

const getLocalYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export function EmployeePage() {
    const { profile } = useAuth();
    const [tab, setTab] = useState<'karyawan' | 'jadwal'>('karyawan');

    // ─── Employee state ───────────────────────────────────────────────────────
    const [employees, setEmployees] = useState<UserProfile[]>([]);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
    const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'staff' as UserRole, salary: '' });
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // ─── Schedule state ───────────────────────────────────────────────────────
    const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
    const [calDate, setCalDate] = useState(new Date());
    const [selectedStaff, setSelectedStaff] = useState<string>('all');
    const [showScheduleDialog, setShowScheduleDialog] = useState(false);
    const [schedForm, setSchedForm] = useState({ staffUid: '', date: getLocalYMD(new Date()), shiftStart: '09:00', shiftEnd: '17:00', note: '' });

    // ─── Listen employees ─────────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'users'), snap => {
            const list = snap.docs.map(d => d.data() as UserProfile);
            setEmployees(list.sort((a, b) => {
                const order: Record<string, number> = { owner: 0, admin: 1, staff: 2 };
                const aOrder = order[a.role] ?? 99;
                const bOrder = order[b.role] ?? 99;
                return aOrder - bOrder;
            }));
        });
        return () => unsub();
    }, []);

    // ─── Listen schedules ─────────────────────────────────────────────────────
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'schedules'), snap => {
            setSchedules(snap.docs.map(d => d.data() as WorkSchedule));
        });
        return () => unsub();
    }, []);

    const staffList = useMemo(() => employees.filter(e => e.role === 'staff'), [employees]);

    // ─── Add employee (via secondary firebase app) ────────────────────────────
    const handleAddEmployee = async () => {
        if (!addForm.name || !addForm.email || !addForm.password) {
            setAddError('Nama, email, dan password wajib diisi.');
            return;
        }
        setAddLoading(true);
        setAddError(null);
        try {
            // Use secondary app to avoid signing out the current owner
            const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);
            const cred = await createUserWithEmailAndPassword(secondaryAuth, addForm.email, addForm.password);
            const newUid = cred.user.uid;
            await secondaryAuth.signOut();
            await deleteApp(secondaryApp);

            const newProfile: UserProfile = {
                uid: newUid,
                email: addForm.email,
                displayName: addForm.name,
                role: addForm.role,
                salary: addForm.salary ? parseInt(addForm.salary.replace(/\D/g, '')) : undefined,
                isActive: true,
                createdAt: new Date().toISOString(),
                createdBy: profile?.uid,
            };
            await setDoc(doc(db, 'users', newUid), newProfile);
            toast.success(`Karyawan ${addForm.name} berhasil ditambahkan!`);
            setShowAddDialog(false);
            setAddForm({ name: '', email: '', password: '', role: 'staff', salary: '' });
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code ?? '';
            const map: Record<string, string> = {
                'auth/email-already-in-use': 'Email sudah terdaftar.',
                'auth/invalid-email':        'Format email tidak valid.',
                'auth/weak-password':        'Password minimal 6 karakter.',
            };
            setAddError(map[code] ?? 'Gagal menambahkan karyawan. Coba lagi.');
        } finally {
            setAddLoading(false);
        }
    };

    // ─── Update employee ──────────────────────────────────────────────────────
    const handleUpdateEmployee = async () => {
        if (!editingEmployee) return;
        await updateDoc(doc(db, 'users', editingEmployee.uid), {
            displayName: editingEmployee.displayName,
            role: editingEmployee.role,
            salary: editingEmployee.salary,
        });
        toast.success('Data karyawan diperbarui.');
        setEditingEmployee(null);
    };

    // ─── Toggle active ────────────────────────────────────────────────────────
    const handleToggleActive = async (emp: UserProfile) => {
        await updateDoc(doc(db, 'users', emp.uid), { isActive: !emp.isActive });
        toast.success(emp.isActive ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.');
    };

    // ─── Add schedule ─────────────────────────────────────────────────────────
    const handleAddSchedule = async () => {
        if (!schedForm.staffUid || !schedForm.date) return;
        const staff = employees.find(e => e.uid === schedForm.staffUid);
        const id = `sched-${schedForm.staffUid}-${schedForm.date}-${Date.now()}`;
        const newSched: WorkSchedule = {
            id,
            staffUid: schedForm.staffUid,
            staffName: staff?.displayName ?? '',
            date: schedForm.date,
            shiftStart: schedForm.shiftStart,
            shiftEnd: schedForm.shiftEnd,
            note: schedForm.note,
        };
        await setDoc(doc(db, 'schedules', id), newSched);
        toast.success('Jadwal ditambahkan!');
        setShowScheduleDialog(false);
        setSchedForm({ staffUid: '', date: getLocalYMD(new Date()), shiftStart: '09:00', shiftEnd: '17:00', note: '' });
    };

    const handleDeleteSchedule = async (id: string) => {
        await deleteDoc(doc(db, 'schedules', id));
        toast.success('Jadwal dihapus.');
    };

    // ─── Calendar helpers ─────────────────────────────────────────────────────
    const year  = calDate.getFullYear();
    const month = calDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const calendarSchedules = useMemo(() => {
        const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
        return schedules.filter(s => {
            const matchesMonth = s.date.startsWith(prefix);
            const matchesStaff = selectedStaff === 'all' || s.staffUid === selectedStaff;
            return matchesMonth && matchesStaff;
        });
    }, [schedules, year, month, selectedStaff]);

    const getSchedulesForDay = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return calendarSchedules.filter(s => s.date === dateStr);
    };

    // ─── Helpers ──────────────────────────────────────────────────────────────
    const formatRp = (n?: number | string) => {
        if (n == null || n === '') return '-';
        const num = Number(n);
        return !isNaN(num) ? `Rp ${num.toLocaleString('id-ID')}` : '-';
    };

    return (
        <div className="h-full flex flex-col overflow-hidden bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Manajemen Karyawan</h1>
                        <p className="text-sm text-gray-500">Kelola tim dan jadwal kerja</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 bg-gray-100 p-1 rounded-lg w-fit">
                    {[
                        { id: 'karyawan', label: 'Daftar Karyawan', icon: Users },
                        { id: 'jadwal',   label: 'Jadwal Kerja',    icon: Calendar },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as 'karyawan' | 'jadwal')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                tab === t.id
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <t.icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">

                {/* ── TAB: KARYAWAN ── */}
                {tab === 'karyawan' && (
                    <div className="max-w-4xl mx-auto space-y-4">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-gray-500">{employees.length} akun terdaftar</p>
                            <Button
                                onClick={() => { setShowAddDialog(true); setAddError(null); }}
                                className="bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white shadow-md"
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Tambah Karyawan
                            </Button>
                        </div>

                        <div className="grid gap-3">
                            {employees.map(emp => {
                                const rl = ROLE_LABEL[emp.role] || { label: emp.role || 'Unknown', color: 'text-gray-700', bg: 'bg-gray-100' };
                                const isMe = emp.uid === profile?.uid;
                                return (
                                    <div key={emp.uid} className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 transition-all hover:shadow-md ${!emp.isActive ? 'opacity-60' : ''}`}>
                                        {/* Avatar */}
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                                            emp.role === 'owner' ? 'bg-amber-100' : emp.role === 'admin' ? 'bg-blue-100' : 'bg-emerald-100'
                                        }`}>
                                            {emp.role === 'owner' ? <Shield className="w-6 h-6 text-amber-600" /> :
                                             emp.role === 'admin' ? <Briefcase className="w-6 h-6 text-blue-600" /> :
                                             <User className="w-6 h-6 text-emerald-600" />}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-semibold text-gray-900 truncate">{emp.displayName}</p>
                                                {isMe && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-medium">Saya</span>}
                                                {!emp.isActive && <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">Nonaktif</span>}
                                            </div>
                                            <p className="text-sm text-gray-500 truncate">{emp.email}</p>
                                            <p className="text-xs text-gray-400 mt-0.5">Gaji: {formatRp(emp.salary)}/jam</p>
                                        </div>

                                        {/* Role badge */}
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${rl.bg} ${rl.color} flex-shrink-0`}>
                                            {rl.label}
                                        </span>

                                        {/* Actions (tidak bisa edit diri sendiri) */}
                                        {!isMe && (
                                            <div className="flex gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => setEditingEmployee({ ...emp })}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleActive(emp)}
                                                    className={`p-2 rounded-lg transition-colors ${emp.isActive ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                                    title={emp.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                                >
                                                    {emp.isActive ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── TAB: JADWAL ── */}
                {tab === 'jadwal' && (
                    <div className="max-w-5xl mx-auto space-y-4">
                        {/* Controls */}
                        <div className="flex flex-wrap items-center gap-3 justify-between">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setCalDate(new Date(year, month - 1, 1))} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                                </button>
                                <span className="font-semibold text-gray-800 min-w-[160px] text-center">
                                    {MONTH_ID[month]} {year}
                                </span>
                                <button onClick={() => setCalDate(new Date(year, month + 1, 1))} className="p-2 rounded-lg hover:bg-gray-200 transition-colors">
                                    <ChevronRight className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            <div className="flex gap-2 items-center">
                                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="Filter Staff" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Semua Staff</SelectItem>
                                        {staffList.map(s => (
                                            <SelectItem key={s.uid} value={s.uid}>{s.displayName}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={() => setShowScheduleDialog(true)}
                                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md"
                                >
                                    <Calendar className="w-4 h-4 mr-2" />
                                    Tambah Jadwal
                                </Button>
                            </div>
                        </div>

                        {/* Calendar grid */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            {/* Day headers */}
                            <div className="grid grid-cols-7 border-b border-gray-100">
                                {DAYS_ID.map(d => (
                                    <div key={d} className={`py-3 text-center text-xs font-semibold uppercase tracking-wide ${d === 'Min' ? 'text-red-500' : 'text-gray-500'}`}>
                                        {d}
                                    </div>
                                ))}
                            </div>
                            {/* Cells */}
                            <div className="grid grid-cols-7">
                                {/* Empty cells before first day */}
                                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                    <div key={`empty-${i}`} className="min-h-[100px] border-r border-b border-gray-50 bg-gray-50/50" />
                                ))}
                                {/* Day cells */}
                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                    const daySchedules = getSchedulesForDay(day);
                                    const today = getLocalYMD(new Date());
                                    const cellDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isToday = cellDate === today;
                                    const dayOfWeek = new Date(year, month, day).getDay();
                                    return (
                                        <div
                                            key={day}
                                            className={`min-h-[100px] border-r border-b border-gray-100 p-1.5 transition-colors hover:bg-gray-50 ${(firstDayOfWeek + day - 1) % 7 === 6 ? 'border-r-0' : ''}`}
                                        >
                                            <div className={`text-sm font-semibold mb-1 w-7 h-7 flex items-center justify-center rounded-full ${
                                                isToday ? 'bg-sky-600 text-white' :
                                                dayOfWeek === 0 ? 'text-red-500' : 'text-gray-700'
                                            }`}>
                                                {day}
                                            </div>
                                            <div className="space-y-0.5">
                                                {daySchedules.map(s => (
                                                    <div
                                                        key={s.id}
                                                        className="group flex items-start justify-between bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-[10px] font-semibold text-emerald-700 truncate leading-tight">{s.staffName}</p>
                                                            <p className="text-[9px] text-emerald-600 leading-tight flex items-center gap-0.5">
                                                                <Clock className="w-2 h-2" />
                                                                {s.shiftStart}–{s.shiftEnd}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteSchedule(s.id)}
                                                            className="opacity-0 group-hover:opacity-100 ml-1 text-red-400 hover:text-red-600 transition-all flex-shrink-0 mt-0.5"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Dialog: Tambah Karyawan ── */}
            <Dialog open={showAddDialog} onOpenChange={open => { setShowAddDialog(open); if (!open) setAddError(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-blue-600" />
                            Tambah Karyawan Baru
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Nama Lengkap</Label>
                            <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama karyawan" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@contoh.com" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Password</Label>
                            <Input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 karakter" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Role</Label>
                                <Select value={addForm.role} onValueChange={v => setAddForm(f => ({ ...f, role: v as UserRole }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="admin">Admin</SelectItem>
                                        <SelectItem value="staff">Staff</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Gaji Per Jam (Rp)</Label>
                                <Input value={addForm.salary} onChange={e => setAddForm(f => ({ ...f, salary: e.target.value }))} placeholder="0" type="number" />
                            </div>
                        </div>

                        {addError && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <p className="text-sm text-red-600">{addError}</p>
                            </div>
                        )}

                        <Button
                            className="w-full bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white"
                            onClick={handleAddEmployee}
                            disabled={addLoading}
                        >
                            {addLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Membuat Akun...</> : <><BadgeCheck className="w-4 h-4 mr-2" />Buat Akun Karyawan</>}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Dialog: Edit Karyawan ── */}
            <Dialog open={!!editingEmployee} onOpenChange={open => { if (!open) setEditingEmployee(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Edit2 className="w-5 h-5 text-blue-600" />
                            Edit Karyawan
                        </DialogTitle>
                    </DialogHeader>
                    {editingEmployee && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label>Nama Lengkap</Label>
                                <Input value={editingEmployee.displayName} onChange={e => setEditingEmployee(v => v ? { ...v, displayName: e.target.value } : null)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Role</Label>
                                    <Select value={editingEmployee.role} onValueChange={v => setEditingEmployee(e => e ? { ...e, role: v as UserRole } : null)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="admin">Admin</SelectItem>
                                            <SelectItem value="staff">Staff</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Gaji Per Jam (Rp)</Label>
                                    <Input type="number" value={editingEmployee.salary ?? ''} onChange={e => setEditingEmployee(v => v ? { ...v, salary: parseInt(e.target.value) || undefined } : null)} />
                                </div>
                            </div>
                            <Button className="w-full" onClick={handleUpdateEmployee}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Simpan Perubahan
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ── Dialog: Tambah Jadwal ── */}
            <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-emerald-600" />
                            Tambah Jadwal Kerja
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Staff</Label>
                            <Select value={schedForm.staffUid} onValueChange={v => setSchedForm(f => ({ ...f, staffUid: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih staff..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {staffList.map(s => (
                                        <SelectItem key={s.uid} value={s.uid}>{s.displayName}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tanggal</Label>
                            <Input type="date" value={schedForm.date} onChange={e => setSchedForm(f => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Jam Masuk</Label>
                                <Input type="time" value={schedForm.shiftStart} onChange={e => setSchedForm(f => ({ ...f, shiftStart: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Jam Selesai</Label>
                                <Input type="time" value={schedForm.shiftEnd} onChange={e => setSchedForm(f => ({ ...f, shiftEnd: e.target.value }))} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Catatan (opsional)</Label>
                            <Input value={schedForm.note} onChange={e => setSchedForm(f => ({ ...f, note: e.target.value }))} placeholder="Shift pagi, tugas khusus, dll" />
                        </div>
                        <Button
                            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700"
                            onClick={handleAddSchedule}
                            disabled={!schedForm.staffUid || !schedForm.date}
                        >
                            <Calendar className="w-4 h-4 mr-2" />
                            Tambah Jadwal
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
