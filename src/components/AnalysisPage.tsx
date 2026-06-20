import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth, type UserProfile, type OperationalBill, type AttendanceRecord } from '../lib/AuthContext';
import type { Invoice } from './CashierPage';
import {
    TrendingUp, DollarSign, Users, Receipt,
    PieChart, Activity, Briefcase, Plus, Trash2, Wallet
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

const getMonthStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

const formatRp = (n: number) => `Rp ${Math.max(0, Math.round(n)).toLocaleString('id-ID')}`;

export function AnalysisPage() {
    const { role } = useAuth();
    const [tab, setTab] = useState<'transaksi' | 'tren' | 'laba'>('transaksi');
    
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [employees, setEmployees] = useState<UserProfile[]>([]);
    const [bills, setBills] = useState<OperationalBill[]>([]);
    const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
    
    // Filters
    const [monthFilter, setMonthFilter] = useState(getMonthStr(new Date()));
    
    // Bill form
    const [showBillDialog, setShowBillDialog] = useState(false);
    const [billForm, setBillForm] = useState({ name: '', amount: '', category: 'listrik', note: '' });

    useEffect(() => {
        const unsubInvoices = onSnapshot(collection(db, 'invoices'), snap => {
            setInvoices(snap.docs.map(d => d.data() as Invoice));
        });
        const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
            setEmployees(snap.docs.map(d => d.data() as UserProfile));
        });
        const unsubBills = onSnapshot(collection(db, 'operational_bills'), snap => {
            setBills(snap.docs.map(d => d.data() as OperationalBill));
        });
        const unsubAttend = onSnapshot(collection(db, 'attendance'), snap => {
            setAttendances(snap.docs.map(d => d.data() as AttendanceRecord));
        });
        return () => { unsubInvoices(); unsubUsers(); unsubBills(); unsubAttend(); };
    }, []);

    // ─── Filtered Data ────────────────────────────────────────────────────────
    const monthInvoices = useMemo(() => {
        return invoices.filter(inv => inv.bookingDate.startsWith(monthFilter));
    }, [invoices, monthFilter]);

    const monthBills = useMemo(() => {
        return bills.filter(b => b.month === monthFilter);
    }, [bills, monthFilter]);

    const monthAttendances = useMemo(() => {
        return attendances.filter(a => a.date.startsWith(monthFilter));
    }, [attendances, monthFilter]);

    // ─── Calculations ─────────────────────────────────────────────────────────
    // 1. Total Pendapatan
    const totalIncome = useMemo(() => monthInvoices.reduce((sum, inv) => sum + inv.total, 0), [monthInvoices]);
    
    // 2. Total Gaji Karyawan Berdasarkan Absensi
    const staffWorkMinutes = useMemo(() => {
        const map: Record<string, number> = {};
        monthAttendances.forEach(a => {
            if (a.totalMinutes) {
                map[a.staffUid] = (map[a.staffUid] || 0) + a.totalMinutes;
            }
        });
        return map;
    }, [monthAttendances]);

    const totalSalary = useMemo(() => {
        return employees.filter(e => e.isActive).reduce((sum, emp) => {
            const mins = staffWorkMinutes[emp.uid] || 0;
            const hours = Math.ceil(mins / 60);
            return sum + (hours * (emp.salary || 0));
        }, 0);
    }, [employees, staffWorkMinutes]);
    
    // 3. Total Tagihan Operasional
    const totalBills = useMemo(() => monthBills.reduce((sum, bill) => sum + bill.amount, 0), [monthBills]);
    
    // 4. Laba Bersih
    const netProfit = totalIncome - totalSalary - totalBills;

    // ─── Tren Produk ──────────────────────────────────────────────────────────
    const productStats = useMemo(() => {
        const stats: Record<string, { count: number, revenue: number, kind: string }> = {};
        monthInvoices.forEach(inv => {
            inv.items.forEach(item => {
                if (!stats[item.name]) stats[item.name] = { count: 0, revenue: 0, kind: item.kind };
                stats[item.name].count += item.qty;
                stats[item.name].revenue += item.qty * item.unitPrice;
            });
        });
        return Object.entries(stats)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.revenue - a.revenue);
    }, [monthInvoices]);

    // ─── Add Bill ─────────────────────────────────────────────────────────────
    const handleAddBill = async () => {
        if (!billForm.name || !billForm.amount) return;
        const id = `bill-${Date.now()}`;
        const newBill: OperationalBill = {
            id,
            name: billForm.name,
            amount: parseInt(billForm.amount.replace(/\D/g, '') || '0', 10),
            category: billForm.category,
            month: monthFilter,
            note: billForm.note,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'operational_bills', id), newBill);
        toast.success('Tagihan ditambahkan');
        setShowBillDialog(false);
        setBillForm({ name: '', amount: '', category: 'listrik', note: '' });
    };

    const handleDeleteBill = async (id: string) => {
        if (confirm('Hapus tagihan ini?')) {
            await deleteDoc(doc(db, 'operational_bills', id));
            toast.success('Tagihan dihapus');
        }
    };

    if (role !== 'owner') return <div className="p-8 text-center text-red-500">Akses Ditolak</div>;

    return (
        <div className="h-full flex flex-col overflow-hidden bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0 z-10 shadow-sm relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-sky-600 rounded-lg shadow-md">
                            <TrendingUp className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Analisis Bisnis</h1>
                            <p className="text-sm text-gray-500">Laporan keuangan dan performa studio</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                        <Input 
                            type="month" 
                            value={monthFilter} 
                            onChange={e => setMonthFilter(e.target.value)}
                            className="h-9 border-none bg-white shadow-sm w-40"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4 bg-gray-100 p-1 rounded-lg w-fit">
                    {[
                        { id: 'transaksi', label: 'Rekap Transaksi', icon: Receipt },
                        { id: 'tren',      label: 'Tren Produk',     icon: PieChart },
                        { id: 'laba',      label: 'Gaji & Laba',     icon: DollarSign },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id as any)}
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
                
                {/* ── TAB: TRANSAKSI ── */}
                {tab === 'transaksi' && (
                    <div className="max-w-5xl mx-auto space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><DollarSign className="w-5 h-5" /></div>
                                    <p className="font-semibold text-gray-600">Total Pendapatan</p>
                                </div>
                                <p className="text-3xl font-bold text-gray-900">{formatRp(totalIncome)}</p>
                                <p className="text-xs text-gray-500 mt-2">Dari {monthInvoices.length} transaksi</p>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Activity className="w-5 h-5" /></div>
                                    <p className="font-semibold text-gray-600">Rata-rata Transaksi</p>
                                </div>
                                <p className="text-3xl font-bold text-gray-900">
                                    {monthInvoices.length ? formatRp(totalIncome / monthInvoices.length) : 'Rp 0'}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                <h3 className="font-semibold text-gray-800">Daftar Transaksi ({monthFilter})</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3">Tanggal</th>
                                            <th className="px-4 py-3">ID Invoice</th>
                                            <th className="px-4 py-3">Customer</th>
                                            <th className="px-4 py-3">Item Utama</th>
                                            <th className="px-4 py-3 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {monthInvoices.sort((a, b) => b.createdAt - a.createdAt).map(inv => (
                                            <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3">{inv.bookingDate}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{inv.id}</td>
                                                <td className="px-4 py-3 font-medium text-gray-900">{inv.customerName}</td>
                                                <td className="px-4 py-3 text-gray-600">{inv.items[0]?.name || '-'}</td>
                                                <td className="px-4 py-3 text-right font-semibold text-emerald-600">{formatRp(inv.total)}</td>
                                            </tr>
                                        ))}
                                        {monthInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">Tidak ada transaksi di bulan ini</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB: TREN PRODUK ── */}
                {tab === 'tren' && (
                    <div className="max-w-5xl mx-auto space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-800">Penjualan Paket Terbaik</h3>
                                </div>
                                <div className="p-4 space-y-4">
                                    {productStats.filter(p => p.kind === 'package').map((p, i) => (
                                        <div key={p.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-700' : i === 2 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-400'}`}>{i + 1}</span>
                                                <span className="font-medium text-gray-700">{p.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900">{p.count}x</p>
                                                <p className="text-xs text-gray-500">{formatRp(p.revenue)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {productStats.filter(p => p.kind === 'package').length === 0 && <p className="text-sm text-gray-500 text-center py-4">Belum ada data</p>}
                                </div>
                            </div>
                            
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-800">Add-on & Snack Terlaris</h3>
                                </div>
                                <div className="p-4 space-y-4">
                                    {productStats.filter(p => p.kind !== 'package').slice(0, 8).map((p) => (
                                        <div key={p.name} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className="font-medium text-gray-700 text-sm">{p.name}</span>
                                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded uppercase">{p.kind}</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-900 text-sm">{p.count}x</p>
                                            </div>
                                        </div>
                                    ))}
                                    {productStats.filter(p => p.kind !== 'package').length === 0 && <p className="text-sm text-gray-500 text-center py-4">Belum ada data</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── TAB: GAJI & LABA ── */}
                {tab === 'laba' && (
                    <div className="max-w-5xl mx-auto space-y-6">
                        
                        {/* Laba Bersih Card */}
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-xl p-6 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                                <Wallet className="w-32 h-32" />
                            </div>
                            <h3 className="text-gray-400 font-medium mb-1">Estimasi Laba Bersih ({monthFilter})</h3>
                            <p className={`text-5xl font-bold tracking-tight mb-6 ${netProfit < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {formatRp(netProfit)}
                            </p>
                            
                            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
                                <div>
                                    <p className="text-gray-400 text-xs mb-1">Pendapatan Kotor</p>
                                    <p className="font-semibold text-emerald-400">{formatRp(totalIncome)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs mb-1">Total Gaji Karyawan</p>
                                    <p className="font-semibold text-red-400">- {formatRp(totalSalary)}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs mb-1">Pengeluaran Operasional</p>
                                    <p className="font-semibold text-red-400">- {formatRp(totalBills)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Gaji Karyawan */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-gray-500" />
                                        Gaji Karyawan
                                    </h3>
                                    <span className="text-xs text-gray-500 font-medium bg-gray-200 px-2 py-1 rounded-md">Total: {formatRp(totalSalary)}</span>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm text-left">
                                        <tbody className="divide-y divide-gray-100">
                                            {employees.filter(e => e.isActive).map(emp => {
                                                const mins = staffWorkMinutes[emp.uid] || 0;
                                                const hours = Math.ceil(mins / 60);
                                                const salary = hours * (emp.salary || 0);
                                                return (
                                                    <tr key={emp.uid} className="hover:bg-gray-50">
                                                        <td className="px-5 py-3">
                                                            <p className="font-medium text-gray-900">{emp.displayName}</p>
                                                            <p className="text-xs text-gray-500 capitalize">{emp.role} • {formatRp(emp.salary || 0)}/jam</p>
                                                        </td>
                                                        <td className="px-5 py-3 text-right">
                                                            <p className="font-medium text-gray-700">{hours} Jam</p>
                                                            <p className="text-xs text-gray-500">({mins} menit)</p>
                                                        </td>
                                                        <td className="px-5 py-3 text-right font-semibold text-gray-900">
                                                            {formatRp(salary)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {employees.filter(e => e.isActive).length === 0 && (
                                                <tr><td colSpan={2} className="px-5 py-6 text-center text-gray-500">Tidak ada karyawan aktif</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Tagihan Operasional */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                        <Briefcase className="w-4 h-4 text-gray-500" />
                                        Biaya Operasional
                                    </h3>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowBillDialog(true)}>
                                        <Plus className="w-3 h-3 mr-1" /> Tambah
                                    </Button>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm text-left">
                                        <tbody className="divide-y divide-gray-100">
                                            {monthBills.map(bill => (
                                                <tr key={bill.id} className="hover:bg-gray-50 group">
                                                    <td className="px-5 py-3">
                                                        <p className="font-medium text-gray-900">{bill.name}</p>
                                                        <p className="text-xs text-gray-500 capitalize">{bill.category}</p>
                                                    </td>
                                                    <td className="px-5 py-3 text-right font-semibold text-gray-700">
                                                        {formatRp(bill.amount)}
                                                    </td>
                                                    <td className="px-4 py-3 w-10">
                                                        <button 
                                                            onClick={() => handleDeleteBill(bill.id)}
                                                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {monthBills.length === 0 && (
                                                <tr><td colSpan={3} className="px-5 py-6 text-center text-gray-500">Tidak ada pengeluaran operasional bulan ini</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Dialog Add Bill */}
            <Dialog open={showBillDialog} onOpenChange={setShowBillDialog}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Tambah Biaya Operasional</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Nama Pengeluaran</Label>
                            <Input value={billForm.name} onChange={e => setBillForm(f => ({ ...f, name: e.target.value }))} placeholder="Cth: Tagihan Listrik PLN" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Kategori</Label>
                            <Select value={billForm.category} onValueChange={v => setBillForm(f => ({ ...f, category: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="listrik">Listrik & Air</SelectItem>
                                    <SelectItem value="internet">Internet / WiFi</SelectItem>
                                    <SelectItem value="sewa">Sewa Tempat</SelectItem>
                                    <SelectItem value="marketing">Marketing / Iklan</SelectItem>
                                    <SelectItem value="lainnya">Lainnya</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Jumlah (Rp)</Label>
                            <Input type="number" value={billForm.amount} onChange={e => setBillForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Catatan Tambahan (Opsional)</Label>
                            <Input value={billForm.note} onChange={e => setBillForm(f => ({ ...f, note: e.target.value }))} />
                        </div>
                        <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleAddBill}>
                            Simpan Pengeluaran
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
