import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { normalizePhoneNumber } from '../lib/utils';
import type { Booking } from './TimelineStudio';
import { getLocalYMD } from './TimelineStudio';
import type { AppSettings, PricedItem } from './SettingsPage';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { FileText, Printer, Send, Wallet, CreditCard, CheckCircle2, FolderPlus, LogIn, Check } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';

type PaymentMethod = 'cash' | 'transfer';

type InvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
  kind: 'package' | 'addon' | 'snack' | 'custom';
};

export type Invoice = {
  id: string;
  createdAt: number;
  bookingId: string;
  bookingDate: string;
  customerName: string;
  customerPhone?: string;
  cashier: string;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  items: InvoiceItem[];
  total: number;
  driveLink?: string;
  driveFolderId?: string;
};

// We no longer use RTDB path constants.

const formatRp = (n: number) => `Rp ${Math.max(0, Math.round(n)).toLocaleString('id-ID')}`;

const digitsOnly = (s: string) => s.replace(/[^\d]/g, '');

const makeInvoiceId = () => {
  // TRX-XXXXXXXXXXXX (timestamp-based)
  const ts = Date.now().toString();
  return `TRX-${ts}`;
};

const getLocalDayStart = (ymd: string) => {
  const [yy, mm, dd] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(yy, (mm || 1) - 1, dd || 1, 0, 0, 0, 0);
};

const getBookingEndMs = (b: Booking, fallbackYmd: string) => {
  const ymd = b.date || fallbackYmd;
  const dayStart = getLocalDayStart(ymd).getTime();
  const endMinutes = b.startTime + b.duration;
  return dayStart + endMinutes * 60_000;
};

const isBookingCompleted = (b: Booking, nowMs: number, fallbackYmd: string) => {
  if (!b.arrived) return false;
  return nowMs >= getBookingEndMs(b, fallbackYmd);
};

const isNoShowDerived = (b: Booking, nowMs: number, fallbackYmd: string) => {
  if (b.arrived) return false;
  return nowMs > getBookingEndMs(b, fallbackYmd);
};

const Receipt = ({
  settings,
  invoice,
}: {
  settings: AppSettings | null;
  invoice: Invoice;
}) => {
  const date = new Date(invoice.createdAt);
  const lines = invoice.items.map((it) => ({
    ...it,
    subtotal: it.qty * it.unitPrice,
  }));

  const studioName = settings?.studioName || 'Snap Me Self & Photo Studio';
  const studioAddress = settings?.studioAddress || '';
  const studioWa = settings?.studioWa || '';

  return (
    <div className="w-[320px] px-4 py-3 font-sans" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
      <div className="text-center">
        <div className="text-3xl font-black tracking-tight leading-none">Snap me!</div>
        <div className="text-[13px] font-semibold mt-1">{studioName}</div>
        {studioAddress && <div className="text-[11px]">{studioAddress}</div>}
        {studioWa && <div className="text-[11px]">WA: {studioWa}</div>}
      </div>

      <div className="border-t border-dashed my-3" style={{ borderColor: 'rgba(0, 0, 0, 0.4)' }} />

      <div className="text-[12px] space-y-0.5">
        <div className="flex justify-between"><span className="font-semibold">No. Nota</span><span>{invoice.id}</span></div>
        <div className="flex justify-between"><span className="font-semibold">Tanggal</span><span>{date.toLocaleString('id-ID')}</span></div>
        <div className="flex justify-between"><span className="font-semibold">Customer</span><span>{invoice.customerName}</span></div>
        <div className="flex justify-between"><span className="font-semibold">Kasir</span><span>{invoice.cashier}</span></div>
        <div className="flex justify-between"><span className="font-semibold">Pembayaran</span><span className="uppercase">{invoice.paymentMethod}</span></div>
      </div>

      <div className="border-t border-dashed my-3" style={{ borderColor: 'rgba(0, 0, 0, 0.4)' }} />

      <div className="text-[12px]">
        <div className="flex justify-between font-semibold">
          <span className="w-[58%]">Item</span>
          <span className="w-[10%] text-right">Qty</span>
          <span className="w-[32%] text-right">Subtotal</span>
        </div>
        <div className="mt-1 space-y-1">
          {lines.map((l, idx) => (
            <div key={`${l.name}-${idx}`} className="flex justify-between">
              <span className="w-[58%] truncate">{l.name}</span>
              <span className="w-[10%] text-right">{l.qty}</span>
              <span className="w-[32%] text-right">{formatRp(l.subtotal)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-dashed my-3" style={{ borderColor: 'rgba(0, 0, 0, 0.4)' }} />

      <div className="text-[13px] font-black flex justify-between">
        <span>TOTAL</span>
        <span>{formatRp(invoice.total)}</span>
      </div>

      {invoice.paymentMethod === 'cash' && (
        <div className="text-[12px] mt-2 space-y-0.5">
          <div className="flex justify-between"><span>Dibayar</span><span>{formatRp(invoice.cashReceived || 0)}</span></div>
          <div className="flex justify-between"><span>Kembalian</span><span>{formatRp((invoice.cashReceived || 0) - invoice.total)}</span></div>
        </div>
      )}

      <div className="border-t border-dashed my-3" style={{ borderColor: 'rgba(0, 0, 0, 0.4)' }} />

      <div className="text-center text-[11px] italic">Terima kasih telah berkunjung!</div>
      <div className="text-center text-[10px] mt-1">
        Follow IG: <span className="font-semibold">@snapme_singaraja</span> • Kirim nota via WA
      </div>
    </div>
  );
};

const ManualDriveCreator = ({
  booking,
  settings,
  selectedBookings
}: {
  booking: Booking;
  settings: AppSettings | null;
  selectedBookings: Booking[];
}) => {
  const [googleToken, setGoogleToken] = useState<string | null>(sessionStorage.getItem('googleToken'));
  const [isCreatingFolderManual, setIsCreatingFolderManual] = useState(false);

  const loginGoogle = useGoogleLogin({
    onSuccess: (codeResponse) => {
      sessionStorage.setItem('googleToken', codeResponse.access_token);
      setGoogleToken(codeResponse.access_token);
    },
    onError: (error) => console.log('Login Failed:', error),
    scope: 'https://www.googleapis.com/auth/drive.file'
  });

  const handleManualCreateDriveFolder = async () => {
    if (!googleToken) {
      alert("Anda harus login Google terlebih dahulu.");
      return;
    }
    const masterFolderId = settings?.googleDriveFolderId?.trim();
    if (!masterFolderId) {
      alert("Master Folder ID belum diatur di Settings.");
      return;
    }

    setIsCreatingFolderManual(true);
    try {
      const folderName = `${booking.customerName} - ${booking.date || getLocalYMD(new Date())}`;
      const metadata = { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [masterFolderId] };
      const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });

      if (!response.ok) {
        if (response.status === 401) {
          sessionStorage.removeItem('googleToken');
          setGoogleToken(null);
          throw new Error('Sesi Google kedaluwarsa. Silakan Login Ulang.');
        }
        throw new Error('Gagal memanggil API Drive');
      }

      const data = await response.json();
      const folderId = data.id;

      const linkResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const linkData = await linkResponse.json();

      if (linkData.webViewLink) {
        const batch = writeBatch(db);
        selectedBookings.forEach(member => {
            batch.update(doc(db, 'bookings', member.id), { driveLink: linkData.webViewLink, driveFolderId: folderId });
        });
        await batch.commit();
      }
    } catch (e) {
      console.error(e);
      alert("Gagal membuat folder: " + String(e));
    } finally {
      setIsCreatingFolderManual(false);
    }
  };

  return (
    <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl w-full max-w-md border border-gray-100">
      <p className="text-xs font-semibold uppercase text-gray-500 mb-3">Opsi Manual (Jika Gagal / Lama)</p>
      {!googleToken ? (
        <Button onClick={() => loginGoogle()} className="w-full bg-blue-600 hover:bg-blue-700">
          <LogIn className="w-4 h-4 mr-2" /> Login ke Akun Google Studio
        </Button>
      ) : (
        <Button 
          onClick={() => void handleManualCreateDriveFolder()}
          disabled={isCreatingFolderManual}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <FolderPlus className="w-4 h-4 mr-2" /> 
          {isCreatingFolderManual ? 'Membuat Folder...' : 'Buat Folder Kasar (Manual)'}
        </Button>
      )}
    </div>
  );
};

export function CashierPage() {
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [settings, setSettingsState] = useState<AppSettings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [cashier, setCashier] = useState<string>('Kasir 1');

  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [selectedSnacks, setSelectedSnacks] = useState<Record<string, number>>({});

  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [pdfInvoice, setPdfInvoice] = useState<Invoice | null>(null);
  const [pendingWhatsAppInvoice, setPendingWhatsAppInvoice] = useState<Invoice | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [processingActionId, setProcessingActionId] = useState<string | null>(null);
  const [, setLastError] = useState<string>('');

  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), (snap) => {
      const list: Booking[] = [];
      snap.forEach((d) => list.push(d.data() as Booking));
      setAllBookings(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (snap) => {
      const v = snap.data() as AppSettings | undefined;
      setSettingsState(v || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'invoices'), (snap) => {
      const list: Invoice[] = [];
      snap.forEach((d) => list.push(d.data() as Invoice));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setInvoices(list);
    });
    return () => unsub();
  }, []);

  const now = new Date();
  const todayStr = getLocalYMD(now);
  const nowMs = now.getTime();

  const activeTransactions = useMemo(() => {
    return allBookings
      .filter((b) => !isNoShowDerived(b, nowMs, todayStr))
      .filter((b) => isBookingCompleted(b, nowMs, todayStr))
      .filter((b) => !b.isTransactionFinished) // Keep them here until fully finished
      .sort((a, b) => {
        const endA = getBookingEndMs(a, todayStr);
        const endB = getBookingEndMs(b, todayStr);
        if (endA !== endB) return endA - endB;
        return a.startTime - b.startTime;
      });
  }, [allBookings, nowMs, todayStr]);

  const uniqueTransactions = useMemo(() => {
    const seenGroups = new Set<string>();
    const result: Booking[] = [];
    for (const b of activeTransactions) {
      if (b.groupId) {
        if (!seenGroups.has(b.groupId)) {
          seenGroups.add(b.groupId);
          result.push(b);
        }
      } else {
        result.push(b);
      }
    }
    return result;
  }, [activeTransactions]);

  const selectedBooking = useMemo(() => uniqueTransactions.find((b) => b.id === selectedBookingId) || null, [uniqueTransactions, selectedBookingId]);

  const selectedBookings = useMemo(() => {
    if (!selectedBooking) return [];
    if (selectedBooking.groupId) {
      return activeTransactions.filter(b => b.groupId === selectedBooking.groupId);
    }
    return [selectedBooking];
  }, [selectedBooking, activeTransactions]);

  const isPackagePriceMissing = useMemo(() => {
    if (selectedBookings.length === 0) return true;
    return selectedBookings.some(b => (settings?.packagePrices?.[b.bookingType] ?? 0) <= 0);
  }, [selectedBookings, settings]);

  const addons: PricedItem[] = settings?.addons || [];
  const snacks: PricedItem[] = settings?.snacks || [];

  const allCatalogItems = useMemo(() => {
     return [
       ...addons.map(a => ({...a, type: 'addon' as const})),
       ...snacks.map(s => ({...s, type: 'snack' as const}))
     ];
  }, [addons, snacks]);

  const groupedCatalog = useMemo(() => {
    return allCatalogItems.reduce((acc, item) => {
      const cat = item.category || 'Umum';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {} as Record<string, (PricedItem & { type: 'addon' | 'snack' })[]>);
  }, [allCatalogItems]);

  const items: InvoiceItem[] = useMemo(() => {
    if (selectedBookings.length === 0) return [];
    
    // Group bases
    const baseItems: InvoiceItem[] = selectedBookings.map(b => ({
      name: b.bookingType + (selectedBookings.length > 1 ? ` (${b.customerName})` : ''),
      qty: 1,
      unitPrice: settings?.packagePrices?.[b.bookingType] ?? 0,
      kind: 'package'
    }));

    const addonItems: InvoiceItem[] = addons
      .map((a) => ({ name: a.name, qty: selectedAddons[a.id] || 0, unitPrice: a.price, kind: 'addon' as const }))
      .filter((x) => x.qty > 0);
    const snackItems: InvoiceItem[] = snacks
      .map((s) => ({ name: s.name, qty: selectedSnacks[s.id] || 0, unitPrice: s.price, kind: 'snack' as const }))
      .filter((x) => x.qty > 0);
    return [...baseItems, ...addonItems, ...snackItems];
  }, [selectedBookings, settings, addons, snacks, selectedAddons, selectedSnacks]);

  const total = useMemo(() => items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0), [items]);

  const cashReceivedInt = useMemo(() => {
    const n = parseInt(cashReceived.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [cashReceived]);

  const canCreateInvoice = useMemo(() => {
    if (!selectedBooking) return false;
    if (isPackagePriceMissing) return false;
    if (paymentMethod === 'cash') return cashReceivedInt >= total && total > 0;
    return total > 0;
  }, [selectedBooking, paymentMethod, cashReceivedInt, total, isPackagePriceMissing]);

  const buildInvoice = (primaryBooking: Booking): Invoice => {
    const id = makeInvoiceId();
    const driveLink = primaryBooking.driveLink || selectedBookings.find(b => b.driveLink)?.driveLink;
    const driveFolderId = primaryBooking.driveFolderId || selectedBookings.find(b => b.driveFolderId)?.driveFolderId;

    return {
      id,
      createdAt: Date.now(),
      bookingId: primaryBooking.id, // Representative ID
      bookingDate: primaryBooking.date || todayStr,
      customerName: primaryBooking.customerName + (selectedBookings.length > 1 ? ` (dan ${selectedBookings.length - 1} lainnya)` : ''),
      customerPhone: primaryBooking.customerPhone,
      cashier,
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? cashReceivedInt : undefined,
      items,
      total,
      driveLink,
      driveFolderId
    };
  };

  const generatePdfBlob = async () => {
    if (!receiptRef.current) throw new Error('receipt not ready');
    const el = receiptRef.current;
    
    const imgData = await toPng(el, {
      backgroundColor: '#ffffff',
      pixelRatio: 2, // scale 2x for better clarity
    });

    const pdfWidth = 58; // 58mm receipt paper
    // Calculate proportional height based on the DOM element's aspect ratio
    const pdfHeight = (el.offsetHeight * pdfWidth) / el.offsetWidth;

    // Create a custom-sized PDF
    const pdf = new jsPDF({ 
      orientation: 'p', 
      unit: 'mm', 
      format: [pdfWidth, pdfHeight] 
    });
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    return pdf.output('blob');
  };

  const downloadPdf = async (invoice: Invoice) => {
    const blob = await generatePdfBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const shareOrOpenPdf = async (invoice: Invoice, phoneText: string) => {
    try {
      // 3. Siapkan pesan WA
      const message = [
        `Halo ${invoice.customerName}, berikut nota dari Snap Me.`,
        `No. Nota: ${invoice.id}`,
        `Total: ${formatRp(invoice.total)}`,
        `Pembayaran: ${invoice.paymentMethod.toUpperCase()}`,
        invoice.driveLink ? `\nðŸ”— *Link Folder Foto Anda:*\n${invoice.driveLink}\n` : '',
        `Terima kasih!`,
      ].filter(Boolean).join('\n');

      // Normalize phone number for WA (replace leading 0 with 62)
      let waPhone = phoneText;
      if (waPhone.startsWith('0')) {
        waPhone = '62' + waPhone.substring(1);
      }

      const waUrl = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(message)}`;
      
      // Buka langsung ke URL WhatsApp
      window.open(waUrl, '_blank');

    } catch (e) {
      console.error("Error memproses WA:", e);
      alert("Terjadi kesalahan saat memproses WA: " + String(e));
    }
  };

  const openWhatsApp = (invoice: Invoice, phoneDigits: string) => {
    const message = [
      `Halo ${invoice.customerName}, berikut nota dari Snap Me.`,
      `No. Nota: ${invoice.id}`,
      `Total: ${formatRp(invoice.total)}`,
      `Pembayaran: ${invoice.paymentMethod.toUpperCase()}`,
      invoice.driveLink ? `\nðŸ”— *Link Folder Foto Anda:*\n${invoice.driveLink}\n` : '',
      `Terima kasih!`,
    ].filter(Boolean).join('\n');
    // Normalize phone number for WA
    let waPhone = phoneDigits;
    if (waPhone.startsWith('0')) {
      waPhone = '62' + waPhone.substring(1);
    }
    const url = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const saveInvoice = async (invoice: Invoice) => {
    const batch = writeBatch(db);
    const sanitizedInvoice = JSON.parse(JSON.stringify(invoice));
    batch.set(doc(db, 'invoices', invoice.id), sanitizedInvoice);
    
    selectedBookings.forEach(b => {
      batch.update(doc(db, 'bookings', b.id), { invoiceId: invoice.id });
    });
    
    await batch.commit();
  };

  const finishTransaction = async (_primaryBooking: Booking) => {
    const confirm = window.confirm("Yakin ingin menyelesaikan transaksi ini? Bokingan ini akan masuk ke Arsip Riwayat dan hilang dari Antrean.");
    if (!confirm) return;
    const tid = toast.loading('Menyelesaikan transaksi...');
    try {
      const batch = writeBatch(db);
      selectedBookings.forEach(b => {
        batch.update(doc(db, 'bookings', b.id), { isTransactionFinished: true });
      });
      await batch.commit();
      setSelectedBookingId('');
      toast.success('Transaksi selesai dan dipindahkan ke arsip!', { id: tid });
    } catch (e) {
      console.error(e);
      toast.error('Gagal menyelesaikan transaksi: ' + String(e), { id: tid });
    }
  };

  const waitForReceiptRender = async () => {
    // wait a few frames until Receipt is mounted
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const el = receiptRef.current;
      if (el && el.firstElementChild && el.getBoundingClientRect().height > 0) return;
    }
  };

  const handleCreateInvoice = async () => {
    if (!selectedBooking) return;
    if (isCreating) return;
    setLastError('');
    setIsCreating(true);
    try {
      const invoice = buildInvoice(selectedBooking);

      // Save invoice + mark booking
      await saveInvoice(invoice);

      // Render receipt with the exact invoice id before capturing
      setPdfInvoice(invoice);
      await waitForReceiptRender();

      // Only generate PDF Blob for uploading to Google Drive
      const blob = await generatePdfBlob();

      // Upload PDF to Drive
      const token = sessionStorage.getItem('googleToken');
      if (token && invoice.driveFolderId) {
        try {
          const metadata = {
            name: `${invoice.id} - Nota.pdf`,
            parents: [invoice.driveFolderId]
          };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', blob, 'nota.pdf');

          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`
            },
            body: form
          });
        } catch(e) {
          console.error("Gagal upload PDF ke Drive", e);
        }
      }

      // WhatsApp (need phone)
      const phone = digitsOnly(selectedBooking.customerPhone || '');
      if (phone) {
        openWhatsApp(invoice, phone);
      } else {
        setTempPhone('');
        setPendingWhatsAppInvoice(invoice);
        setPhoneDialogOpen(true);
      }

      toast.success(`Nota ${invoice.id} berhasil dibuat!`, { description: `Total: ${formatRp(invoice.total)}` });

      setSelectedBookingId('');
      setSelectedAddons({});
      setSelectedSnacks({});
      setCashReceived('');
      setPdfInvoice(null);
    } catch (e) {
      console.error('Create invoice failed', e);
      const msg = e instanceof Error ? e.message : 'Gagal buat nota';
      setLastError(msg);
      toast.error(`Gagal buat nota: ${msg}`);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      return (
        inv.id.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.paymentMethod.toLowerCase().includes(q)
      );
    });
  }, [invoices, historyQuery]);

  const previewInvoice = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setInvoicePreviewOpen(true);
  };

  const downloadInvoicePdf = async (inv: Invoice) => {
    if (processingActionId) return;
    setLastError('');
    setProcessingActionId(inv.id + '-pdf');
    try {
      setPdfInvoice(inv);
      await waitForReceiptRender();
      await downloadPdf(inv);
    } catch (e) {
      console.error(e);
      alert("Gagal mengunduh PDF: " + String(e));
    } finally {
      setPdfInvoice(null);
      setProcessingActionId(null);
    }
  };

  const openInvoiceWhatsApp = async (inv: Invoice) => {
    if (processingActionId) return;
    const phone = digitsOnly(inv.customerPhone || '');
    if (!phone) {
      setTempPhone('');
      setPendingWhatsAppInvoice(inv);
      setPhoneDialogOpen(true);
      return;
    }

    setProcessingActionId(inv.id + '-wa');
    try {
      setPdfInvoice(inv);
      await waitForReceiptRender();
      await shareOrOpenPdf(inv, phone);
      toast.success('WhatsApp dibuka!', { description: `Pesan untuk ${inv.customerName} siap dikirim.` });
    } catch (e) {
      console.error(e);
      toast.error("Gagal membuka WhatsApp: " + String(e));
    } finally {
      setPdfInvoice(null);
      setProcessingActionId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-auto">
      <div className="p-3 sm:p-5 md:p-6 max-w-7xl mx-auto w-full space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">Progress Kasir</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Selesaikan step per step handle customer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[140px] sm:w-[180px]">
              <Input className="h-8 text-sm" value={cashier} onChange={(e) => setCashier(e.target.value)} placeholder="Nama Kasir" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT PANEL: ACTIVE TRANSACTIONS QUEUE */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Antrean Aktif
                </h2>
                <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">{uniqueTransactions.length}</span>
              </div>
              
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-0.5">
                {uniqueTransactions.length === 0 ? (
                   <div className="text-center py-10 text-gray-400 dark:text-gray-500">
                     <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                     <p className="text-xs">Belum ada antrean</p>
                   </div>
                ) : (
                  uniqueTransactions.map((t) => {
                    const isSelected = t.id === selectedBookingId;
                    const cStepD = !!t.driveLink;
                    const cStepN = !!t.invoiceId;
                    const stepNum = !cStepD ? 1 : !cStepN ? 2 : 3;
                    const stepColors: Record<number, string> = {
                      1: 'bg-blue-100 text-blue-700',
                      2: 'bg-amber-100 text-amber-700',
                      3: 'bg-emerald-100 text-emerald-700',
                    };
                    const stepLabel: Record<number, string> = {
                      1: '① Drive',
                      2: '② Nota',
                      3: '③ Kirim',
                    };

                    return (
                      <div 
                        key={t.id} 
                        className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${ isSelected ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}`}
                        onClick={() => setSelectedBookingId(t.id)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 dark:text-gray-100 truncate text-sm">
                            {t.customerName}
                          </p>
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${stepColors[stepNum]}`}>{stepLabel[stepNum]}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{t.bookingType}</p>
                        
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${cStepD ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            <div className="h-px flex-1 bg-gray-100" />
                            <div className={`w-2 h-2 rounded-full shrink-0 ${cStepN ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                            <div className="h-px flex-1 bg-gray-100" />
                            <div className="w-2 h-2 rounded-full shrink-0 bg-gray-200" />
                          </div>
                          <div className="flex justify-between text-[9px] font-medium text-gray-400">
                            <span className={cStepD ? 'text-emerald-600' : ''}>Drive</span>
                            <span className={cStepN ? 'text-emerald-600' : ''}>Nota</span>
                            <span>Selesai</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: STEP BY STEP ACTION AREA */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {!selectedBooking ? (
              <div className="flex items-center justify-center bg-white dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 min-h-[300px] lg:min-h-[400px]">
                <div className="text-center text-gray-400 dark:text-gray-500 p-8">
                  <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-7 h-7 opacity-40" />
                  </div>
                  <p className="text-sm font-medium">Pilih antrean untuk mulai</p>
                  <p className="text-xs mt-1 opacity-60">Tap salah satu customer di panel antrean</p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                
                {/* Customer Header Bar */}
                <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{selectedBooking.customerName}</p>
                    <p className="text-[11px] text-gray-500 truncate">{selectedBooking.bookingType} {selectedBooking.customerPhone ? `· ${selectedBooking.customerPhone}` : '· WA belum diisi'}</p>
                  </div>
                  <button
                    className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    onClick={() => setSelectedBookingId('')}
                    title="Tutup"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4 sm:p-5">

                {/* STEP 1: DRIVE PENDING */}
                {!selectedBooking.driveLink && !selectedBooking.invoiceId && (
                  <div className="flex flex-col items-center justify-center text-center space-y-4 py-6 sm:py-10">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center">
                      <FolderPlus className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">① Tunggu Folder Drive</h3>
                      <p className="text-xs text-gray-400 max-w-xs mt-1.5 mx-auto">Sistem sedang membuat folder Google Drive otomatis. Jika belum muncul, buat manual di bawah.</p>
                    </div>
                    
                    {settings?.googleClientId ? (
                      <GoogleOAuthProvider clientId={settings.googleClientId}>
                        <ManualDriveCreator booking={selectedBooking} settings={settings} selectedBookings={selectedBookings} />
                      </GoogleOAuthProvider>
                    ) : (
                      <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">Google Client ID belum diisi di Setting.</p>
                    )}
                  </div>
                )}

                   {/* STEP 2: CHECKOUT & INVOICE */}
                   {selectedBooking.driveLink && !selectedBooking.invoiceId && (
                     <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                          <div>
                            <h3 className="text-lg font-bold text-gray-900 border-none">Step 2: Add-on & Pembayaran</h3>
                            <a href={selectedBooking.driveLink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Link Folder Drive Telah Dibuat ↗</a>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-800/30 p-5 rounded-xl border border-gray-100 dark:border-gray-800">
                          {/* Packages */}
                          <div className="space-y-3">
                            <Label className="uppercase text-[10px] font-bold text-gray-500 tracking-wider">PAKET TERPILIH (Otomatis)</Label>
                            {selectedBookings.map((b, idx) => {
                              const price = settings?.packagePrices?.[b.bookingType] ?? 0;
                              return (
                                <div key={b.id + idx} className="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm flex items-center justify-between border border-gray-100">
                                  <div className="min-w-0 pr-2">
                                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                                      {b.bookingType} {selectedBookings.length > 1 ? `(${b.customerName})` : ''}
                                    </p>
                                  </div>
                                  <p className="text-xs font-black shrink-0">{formatRp(price)}</p>
                                </div>
                              );
                            })}
                            {isPackagePriceMissing && (
                              <p className="text-[10px] bg-red-50 text-red-600 p-2 rounded border border-red-200 font-medium">⚠️ Harga paket Master belum diatur.</p>
                            )}
                             {/* Inline selected add-ons & snacks */}
                             {Object.entries(groupedCatalog).flatMap(([, its]) => its).filter(it => (it.type === 'addon' ? (selectedAddons[it.id] || 0) : (selectedSnacks[it.id] || 0)) > 0).map(it => {
                               const cnt = it.type === 'addon' ? (selectedAddons[it.id] || 0) : (selectedSnacks[it.id] || 0);
                               const setCnt = (v: number) => it.type === 'addon' ? setSelectedAddons(p => ({ ...p, [it.id]: v })) : setSelectedSnacks(p => ({ ...p, [it.id]: v }));
                               return (
                                 <div key={it.id} className="bg-white rounded-lg p-2.5 flex items-center justify-between border border-emerald-100 gap-2">
                                   <div className="min-w-0 flex-1">
                                     <p className="text-xs font-bold text-gray-700 truncate">{it.name}</p>
                                     <p className="text-[10px] text-emerald-600 font-bold">{formatRp(it.price * cnt)}</p>
                                   </div>
                                   <div className="flex items-center gap-1 shrink-0">
                                     <button className="w-5 h-5 rounded-full border border-gray-200 hover:bg-red-50 hover:border-red-300 text-gray-500 hover:text-red-600 text-xs font-bold flex items-center justify-center" onClick={() => setCnt(Math.max(0, cnt - 1))}>-</button>
                                     <span className="w-4 text-center text-xs font-black text-emerald-700">{cnt}</span>
                                     <button className="w-5 h-5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center" onClick={() => setCnt(Math.min(99, cnt + 1))}>+</button>
                                   </div>
                                 </div>
                               );
                             })}
                          </div>

                          {/* Payment config */}
                          <div className="space-y-4">
                            <Label className="uppercase text-[10px] font-bold text-gray-500 tracking-wider">Tagihan & Bayar</Label>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-gray-500">Subtotal Item:</span>
                              <span className="text-lg font-black text-gray-900">{formatRp(total)}</span>
                            </div>

                            <div className="space-y-2">
                              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="transfer"><div className="flex flex-row items-center gap-2"><CreditCard className="w-3.5 h-3.5" /> Transfer</div></SelectItem>
                                  <SelectItem value="cash"><div className="flex flex-row items-center gap-2"><Wallet className="w-3.5 h-3.5" /> Uang Tunai</div></SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {paymentMethod === 'cash' && (
                              <div className="bg-white p-3 rounded-lg border border-gray-200">
                                <Label className="text-[10px]">Uang Masuk</Label>
                                <Input className="h-8 mt-1 text-sm bg-gray-50" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0" inputMode="numeric" />
                                <div className="mt-2 flex justify-between items-center bg-emerald-50 text-emerald-800 p-1.5 rounded text-[11px] font-bold border border-emerald-100">
                                  <span>KEMBALIAN</span>
                                  <span>{formatRp(cashReceivedInt - total)}</span>
                                </div>
                              </div>
                            )}

                            <Button
                              disabled={!canCreateInvoice || isCreating}
                              onClick={() => void handleCreateInvoice()}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 shadow-md shadow-emerald-500/20"
                            >
                              <Printer className="w-4 h-4 mr-2" /> {isCreating ? 'Mencetak...' : 'Simpan & Buat Nota'}
                            </Button>
                          </div>
                        </div>
                         <div className="border border-gray-100 rounded-xl overflow-hidden">
                           <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pilih Add-on &amp; Snack</p>
                           </div>
                           <div className="max-h-[300px] overflow-y-auto">
                             {Object.entries(groupedCatalog).sort().map(([category, catItems]) => (
                               <div key={category}>
                                 <div className="px-3 py-1 bg-gray-50 sticky top-0 z-10 border-b border-gray-100">
                                   <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{category}</span>
                                 </div>
                                 {catItems.map((it) => {
                                   const count = it.type === 'addon' ? (selectedAddons[it.id] || 0) : (selectedSnacks[it.id] || 0);
                                   const setCount = (val: number) => {
                                     if (it.type === 'addon') setSelectedAddons(p => ({ ...p, [it.id]: val }));
                                     else setSelectedSnacks(p => ({ ...p, [it.id]: val }));
                                   };
                                   return (
                                     <div key={it.id} className={`flex items-center justify-between px-3 py-2 border-b border-gray-50 transition-colors ${count > 0 ? 'bg-emerald-50/60' : 'hover:bg-gray-50'}`}>
                                       <div className="min-w-0 pr-3 flex-1">
                                         <p className={`text-xs font-semibold truncate ${count > 0 ? 'text-emerald-800' : 'text-gray-700'}`}>{it.name}</p>
                                         <p className="text-[10px] text-emerald-600 font-bold">{formatRp(it.price)}</p>
                                       </div>
                                       {count > 0 ? (
                                         <div className="flex items-center gap-1 shrink-0">
                                           <button className="w-6 h-6 rounded-full border border-gray-200 hover:border-red-300 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 text-sm font-bold flex items-center justify-center" onClick={() => setCount(Math.max(0, count - 1))}>-</button>
                                           <span className="w-5 text-center text-xs font-black text-emerald-700">{count}</span>
                                           <button className="w-6 h-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center" onClick={() => setCount(Math.min(99, count + 1))}>+</button>
                                         </div>
                                       ) : (
                                         <button className="shrink-0 h-7 px-3 rounded-full border border-gray-200 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-gray-500 hover:text-emerald-700 text-xs font-bold" onClick={() => setCount(1)}>+ Tambah</button>
                                       )}
                                     </div>
                                   );
                                 })}
                               </div>
                             ))}
                           </div>
                         </div>

                     </div>
                   )}

                   {/* STEP 3: FINISH & WA */}
                   {selectedBooking.invoiceId && (
                     <div className="flex flex-col items-center justify-center text-center h-full space-y-5 py-8">
                       <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                       <div>
                         <h3 className="text-xl font-bold text-gray-900 border-none">Step 3: Hubungi & Selesai</h3>
                         <p className="text-sm text-gray-500 max-w-sm mt-2 mx-auto">Nota telah berhasil disimpan dan diupload ke G-Drive. Kirim pesan pengingat dan selesaikan lajur kerja transaksi ini.</p>
                       </div>

                       <div className="w-full max-w-sm space-y-3 mt-6">
                          <Button
                            className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold h-12 rounded-xl shadow-md text-white border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1"
                            onClick={() => {
                               const theInvoice = invoices.find(inv => inv.id === selectedBooking.invoiceId);
                               if (theInvoice) openInvoiceWhatsApp(theInvoice);
                            }}
                          >
                            <Send className="w-5 h-5 mr-2" /> Hubungi via WhatsApp (Nota)
                          </Button>

                          {/* Drive Caption Buttons */}
                          {selectedBooking.driveLink && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                className="flex-1 h-10 rounded-xl text-xs font-bold bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                                onClick={() => {
                                  const caption = `Hallo kak, ini hasil fotonya ya 🙌\n${selectedBooking.driveLink}\nJangan lupa di-download ya kak, karena file di drive hanya bertahan selama 1 bulan 😊\nKalau kakak berkenan, boleh banget tag @snapme_singaraja saat upload di Instagram Story.\n\nTerima kasih banyak sudah mempercayakan momen kakak ke kami 🤩📸\n\n_Snap Me Self Photo, Where moments come alive_`;
                                  navigator.clipboard.writeText(caption);
                                  toast.success('Caption + Link Drive berhasil disalin ke clipboard!');
                                }}
                              >
                                📋 Salin Link + Caption
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 h-10 rounded-xl text-xs font-bold bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                                onClick={() => {
                                  const caption = `Hallo kak, ini hasil fotonya ya 🙌\n${selectedBooking.driveLink}\nJangan lupa di-download ya kak, karena file di drive hanya bertahan selama 1 bulan 😊\nKalau kakak berkenan, boleh banget tag @snapme_singaraja saat upload di Instagram Story.\n\nTerima kasih banyak sudah mempercayakan momen kakak ke kami 🤩📸\n\n_Snap Me Self Photo, Where moments come alive_`;
                                  let waPhone = selectedBooking.customerPhone || '';
                                  if (waPhone.startsWith('0')) {
                                    waPhone = '62' + waPhone.substring(1);
                                  }
                                  if (waPhone) {
                                    window.open(`whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(caption)}`, '_blank');
                                  } else {
                                    window.open(`whatsapp://send?text=${encodeURIComponent(caption)}`, '_blank');
                                  }
                                }}
                              >
                                📸 Kirim Hasil Foto via WA
                              </Button>
                            </div>
                          )}
                          
                          <Button
                            variant="default"
                            className="w-full bg-slate-900 hover:bg-black font-bold h-12 rounded-xl text-white border-b-4 border-slate-700 active:border-b-0 active:translate-y-1"
                            onClick={() => finishTransaction(selectedBooking)}
                          >
                            <Check className="w-5 h-5 mr-2" /> Transaksi Selesai (Arsipkan)
                          </Button>

                          <div className="pt-4 flex justify-center gap-3">
                             <a href={selectedBooking.driveLink} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Buka Folder ↗</a>
                             <span className="text-gray-300">|</span>
                             <span className="text-xs text-blue-600 hover:underline cursor-pointer" onClick={() => {
                                 const theInvoice = invoices.find(inv => inv.id === selectedBooking.invoiceId);
                                 if (theInvoice) downloadInvoicePdf(theInvoice);
                             }}>Download Ulang Nota ⬇</span>
                          </div>
                       </div>
                     </div>
                   )}

                 </div>
              </div>
            )}

          </div>
        </div>

        {/* History Area */}{/* History */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Riwayat Transaksi
            </h2>
            <div className="w-full md:w-[320px]">
              <Input
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Cari: TRX / nama / metode"
              />
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Belum ada transaksi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="text-xs text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-2 pr-4">No. Nota</th>
                    <th className="py-2 pr-4">Tanggal</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Bayar</th>
                    <th className="py-2 pr-4 text-right">Total</th>
                    <th className="py-2 pr-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredInvoices.slice(0, 200).map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2 pr-4 font-semibold text-gray-900 dark:text-gray-100">{inv.id}</td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{new Date(inv.createdAt).toLocaleString('id-ID')}</td>
                      <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{inv.customerName}</td>
                      <td className="py-2 pr-4 text-gray-600 dark:text-gray-300 uppercase">{inv.paymentMethod}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-gray-900 dark:text-gray-100">{formatRp(inv.total)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => previewInvoice(inv)}>
                            Lihat
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void downloadInvoicePdf(inv)} disabled={!!processingActionId}>
                            {processingActionId === inv.id + '-pdf' ? 'Loading...' : 'PDF'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void openInvoiceWhatsApp(inv)} disabled={!!processingActionId} title="Buka WhatsApp">
                            {processingActionId === inv.id + '-wa' ? 'Loading...' : 'WA'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Hidden receipt render target for PDF generation */}
      <div className="fixed left-[-9999px] top-0">
        <div ref={receiptRef}>
          {pdfInvoice && (
            <Receipt settings={settings} invoice={pdfInvoice} />
          )}
        </div>
      </div>

      {/* Invoice preview (visible) */}
      <Dialog open={invoicePreviewOpen} onOpenChange={setInvoicePreviewOpen}>
        <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Preview Nota</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center bg-gray-50 p-3">
            {selectedInvoice ? (
              <Receipt settings={settings} invoice={selectedInvoice} />
            ) : (
              <div className="p-6 text-sm text-gray-500">Tidak ada nota.</div>
            )}
          </div>
          <div className="p-4 pt-2 flex items-center justify-end gap-2 border-t border-gray-200">
            <Button variant="outline" onClick={() => setInvoicePreviewOpen(false)} disabled={!!processingActionId}>Tutup</Button>
            <Button
              variant="outline"
              onClick={() => { if (selectedInvoice) void downloadInvoicePdf(selectedInvoice); }}
              disabled={!!processingActionId}
            >
              {processingActionId === selectedInvoice?.id + '-pdf' ? 'Loading...' : 'Download PDF'}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { if (selectedInvoice) void openInvoiceWhatsApp(selectedInvoice); }}
              disabled={!!processingActionId}
            >
              <Send className="w-4 h-4 mr-2" />
              {processingActionId === selectedInvoice?.id + '-wa' ? 'Loading...' : 'WhatsApp'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phone dialog (if booking has no phone yet) */}
      <Dialog open={phoneDialogOpen} onOpenChange={(o) => { if (!o) setPhoneDialogOpen(false); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nomor WhatsApp Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">Booking ini belum punya nomor WA. Isi nomor untuk membuka WhatsApp.</p>
          <div className="space-y-2">
            <Label>Nomor WA Customer</Label>
            <Input value={tempPhone} onChange={(e) => setTempPhone(normalizePhoneNumber(e.target.value))} placeholder="Contoh: 081234567" inputMode="numeric" className="font-mono" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPhoneDialogOpen(false)}>Tutup</Button>
            <Button
              onClick={async () => {
                const phone = normalizePhoneNumber(tempPhone);
                if (!phone) return;

                setPhoneDialogOpen(false);
                const inv = pendingWhatsAppInvoice;

                // Persist phone number back to Firestore (booking + invoice)
                try {
                  const batch = writeBatch(db);
                  // Update the booking document
                  if (inv?.bookingId) {
                    batch.update(doc(db, 'bookings', inv.bookingId), { customerPhone: phone });
                  }
                  // Update the invoice document
                  if (inv?.id) {
                    batch.update(doc(db, 'invoices', inv.id), { customerPhone: phone });
                  }
                  await batch.commit();
                } catch (e) {
                  console.error('Gagal simpan nomor WA ke Firestore:', e);
                }

                if (inv) {
                  await shareOrOpenPdf(inv, phone);
                  setPendingWhatsAppInvoice(null);
                  setPdfInvoice(null);
                } else {
                  const msg = `Halo, berikut nota dari Snap Me. Terima kasih!`;
                  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
                  window.open(url, '_blank');
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Buka WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

