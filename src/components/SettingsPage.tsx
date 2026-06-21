import { useEffect, useMemo, useRef, useState } from 'react';
import { db, storage } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Plus, Trash2, Settings, Upload, Image as ImageIcon, Pencil, Check, X, Package,
  FolderOpen, FolderPlus, ChevronDown, ChevronRight, AlertTriangle, Download,
} from 'lucide-react';
import { toast } from 'sonner';

export type PricedItem = { id: string; name: string; price: number; category?: string };

export type BookingPackage = {
  id: string;
  name: string;
  price: number;
  availableIn: ('bawah' | 'atas')[];
  colorKey: string;   // key dari PRESET_PALETTE
  photoUrl?: string;  // URL foto contoh di Firebase Storage
  photoPath?: string; // Storage path (untuk delete)
  sectionId?: string; // Section yang menampung paket ini (opsional, backward compat)
};

// ─── Package Section ──────────────────────────────────────────────────────────
export type PackageSection = {
  id: string;
  name: string;
  collapsed?: boolean;
};

export type AppSettings = {
  studioName: string;
  studioAddress: string;
  studioWa: string;
  googleClientId: string;
  googleDriveFolderId: string;
  localPhotoFolder: string;
  localPhotoFolder2: string;
  packages: BookingPackage[];
  packageSections: PackageSection[];
  // Kept for backward-compat read by CashierPage (auto-synced from packages)
  packagePrices: Record<string, number>;
  addons: PricedItem[];
  snacks: PricedItem[];
};

// ─── Preset Color Palette ────────────────────────────────────────────────────
export const PRESET_PALETTE: Record<string, { label: string; from: string; to: string; border: string; text: string }> = {
  'white':    { label: 'Putih',         from: '#ffffff', to: '#f1f5f9', border: '#cbd5e1', text: '#1f2937' },
  'blue':     { label: 'Biru Tua',      from: '#60a5fa', to: '#2563eb', border: '#1d4ed8', text: '#ffffff' },
  'sky':      { label: 'Biru Muda',     from: '#bae6fd', to: '#0ea5e9', border: '#0284c7', text: '#ffffff' },
  'cyan':     { label: 'Cyan',          from: '#67e8f9', to: '#06b6d4', border: '#0891b2', text: '#ffffff' },
  'teal':     { label: 'Hijau Teal',    from: '#5eead4', to: '#14b8a6', border: '#0d9488', text: '#ffffff' },
  'emerald':  { label: 'Hijau',         from: '#6ee7b7', to: '#10b981', border: '#059669', text: '#ffffff' },
  'pink':     { label: 'Pink',          from: '#f9a8d4', to: '#ec4899', border: '#db2777', text: '#ffffff' },
  'rose':     { label: 'Merah Rose',    from: '#fda4af', to: '#f43f5e', border: '#e11d48', text: '#ffffff' },
  'red':      { label: 'Merah',         from: '#fca5a5', to: '#ef4444', border: '#dc2626', text: '#ffffff' },
  'orange':   { label: 'Oranye',        from: '#fdba74', to: '#f97316', border: '#ea580c', text: '#ffffff' },
  'amber':    { label: 'Kuning Amber',  from: '#fde68a', to: '#f59e0b', border: '#d97706', text: '#1f2937' },
  'slate':    { label: 'Abu-abu',       from: '#94a3b8', to: '#64748b', border: '#475569', text: '#ffffff' },
};

const DEFAULT_COLOR_KEY = 'sky';

// ─── Default Settings ─────────────────────────────────────────────────────────
const defaultSection: PackageSection = { id: 'section-default', name: 'Paket Utama' };

const defaultPackages: BookingPackage[] = [
  { id: 'pkg-1', name: 'Basic Putih',               price: 50000, availableIn: ['bawah', 'atas'], colorKey: 'blue',    sectionId: 'section-default' },
  { id: 'pkg-2', name: 'Basic Abu',                 price: 50000, availableIn: ['bawah'],         colorKey: 'slate',   sectionId: 'section-default' },
  { id: 'pkg-3', name: 'Basic Pink',                price: 50000, availableIn: ['bawah'],         colorKey: 'pink',    sectionId: 'section-default' },
  { id: 'pkg-4', name: 'Basic Putih + Tirai Merah', price: 50000, availableIn: ['bawah'],         colorKey: 'rose',    sectionId: 'section-default' },
  { id: 'pkg-5', name: 'Basic Abu + Tirai Merah',   price: 50000, availableIn: ['bawah'],         colorKey: 'red',     sectionId: 'section-default' },
  { id: 'pkg-6', name: 'Basic Pink + Tirai Merah',  price: 50000, availableIn: ['bawah'],         colorKey: 'orange',  sectionId: 'section-default' },
  { id: 'pkg-7', name: 'Basic Putih + Tirai Hijau', price: 50000, availableIn: ['atas'],          colorKey: 'emerald', sectionId: 'section-default' },
];

const defaultSettings: AppSettings = {
  studioName: 'Snap Me Self & Photo Studio',
  studioAddress: 'Jl. Nusa Indah No. 8, Singaraja',
  studioWa: '0859-2422-6805',
  googleClientId: '',
  googleDriveFolderId: '',
  localPhotoFolder: '',
  localPhotoFolder2: '',
  packageSections: [defaultSection],
  packages: defaultPackages,
  packagePrices: Object.fromEntries(defaultPackages.map(p => [p.name, p.price])),
  addons: [],
  snacks: [],
};

const toInt = (v: string) => {
  const n = parseInt(v.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const SNAPME_CATALOG_ADDONS: { name: string; price: number; category: string }[] = [
  { name: 'Balon angka besar', price: 12000, category: 'Paket Studio' },
  { name: 'Balon angka kecil silver', price: 5000, category: 'Paket Studio' },
  { name: 'Balon biasa warna metalik (5 pcs)', price: 10000, category: 'Paket Studio' },
  { name: 'Balon bulat biasa (5 pcs)', price: 7000, category: 'Paket Studio' },
  { name: 'Basic Tirai', price: 60000, category: 'Paket Studio' },
  { name: 'Dekorasi pita gantung', price: 9000, category: 'Paket Studio' },
  { name: 'MRT Studio', price: 50000, category: 'Paket Studio' },
  { name: 'Paket Birthday', price: 105000, category: 'Paket Studio' },
  { name: 'Pas Foto', price: 25000, category: 'Paket Studio' },
  { name: 'Photobox', price: 60000, category: 'Paket Studio' },
  { name: 'Spot Light', price: 50000, category: 'Paket Studio' },
  { name: 'Studio Basic', price: 50000, category: 'Paket Studio' },
  { name: 'Cetak Foto Tipe A', price: 10000, category: 'Add-on Cetak' },
  { name: 'Cetak Foto Tipe B', price: 15000, category: 'Add-on Cetak' },
  { name: 'Gantungan Kunci', price: 15000, category: 'Add-on Cetak' },
  { name: 'Polaroid', price: 20000, category: 'Add-on Cetak' },
  { name: 'DP Photobooth', price: 0, category: 'Foto Group' },
  { name: 'FG Event Wisuda Anak TK', price: 0, category: 'Foto Group' },
  { name: 'FG Studio', price: 0, category: 'Foto Group' },
  { name: 'FG Wisuda', price: 0, category: 'Foto Group' },
  { name: 'Foto Grup', price: 0, category: 'Foto Group' },
  { name: 'Photobooth', price: 0, category: 'Foto Group' },
];

const SNAPME_CATALOG_SNACKS: { name: string; price: number; category: string }[] = [
  { name: 'Aqua', price: 4000, category: 'Minuman' },
  { name: 'Chimory', price: 8000, category: 'Minuman' },
  { name: 'Coca Cola', price: 5000, category: 'Minuman' },
  { name: 'Floridina', price: 4000, category: 'Minuman' },
  { name: 'Frutea', price: 5000, category: 'Minuman' },
  { name: 'Golda', price: 5000, category: 'Minuman' },
  { name: 'Goodday', price: 8000, category: 'Minuman' },
  { name: 'Isoplus', price: 8000, category: 'Minuman' },
  { name: 'Larutan', price: 8000, category: 'Minuman' },
  { name: 'Milku', price: 5000, category: 'Minuman' },
  { name: 'Milo', price: 4000, category: 'Minuman' },
  { name: 'PocariSweat', price: 8000, category: 'Minuman' },
  { name: 'Pucuk Harum', price: 5000, category: 'Minuman' },
  { name: 'Sprite', price: 5000, category: 'Minuman' },
  { name: 'Susu Ultra', price: 5000, category: 'Minuman' },
  { name: 'Teh Botol', price: 5000, category: 'Minuman' },
  { name: 'Teh Javana', price: 4000, category: 'Minuman' },
  { name: 'Teh Kotak', price: 5000, category: 'Minuman' },
  { name: 'Beng Beng', price: 2500, category: 'Snack' },
  { name: 'Chiki Ball', price: 2500, category: 'Snack' },
  { name: 'Chitato', price: 2500, category: 'Snack' },
  { name: 'Cupcup11', price: 1000, category: 'Snack' },
  { name: 'Go Potato', price: 2000, category: 'Snack' },
  { name: 'Japota', price: 2500, category: 'Snack' },
  { name: 'Kriss Bee', price: 2500, category: 'Snack' },
  { name: 'Nabati', price: 1500, category: 'Snack' },
  { name: 'Pop Mie', price: 10000, category: 'Snack' },
  { name: 'Potabee', price: 2500, category: 'Snack' },
  { name: 'Rinbi', price: 1500, category: 'Snack' },
  { name: 'Shipp Keju', price: 3000, category: 'Snack' },
  { name: 'Sosis', price: 1500, category: 'Snack' },
  { name: 'Superco', price: 2500, category: 'Snack' },
  { name: 'Tanggo', price: 2500, category: 'Snack' },
  { name: 'Taro', price: 2500, category: 'Snack' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Sync packagePrices from packages array (backward-compat for Kasir)
function buildPackagePrices(packages: BookingPackage[]): Record<string, number> {
  return Object.fromEntries(packages.map(p => [p.name, p.price]));
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────
function ColorSwatch({ colorKey, selected, onClick }: { colorKey: string; selected: boolean; onClick: () => void }) {
  const palette = PRESET_PALETTE[colorKey];
  return (
    <button
      type="button"
      onClick={onClick}
      title={palette.label}
      style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}
      className={`w-7 h-7 rounded-full border-2 transition-all duration-150 shadow-sm flex-shrink-0 ${
        selected ? 'border-gray-800 scale-110 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent hover:scale-110'
      }`}
    />
  );
}

// ─── Package Card ─────────────────────────────────────────────────────────────
function PackageCard({
  pkg,
  sections,
  onDelete,
  onUpdate,
  onPhotoUpload,
  onPhotoDelete,
}: {
  pkg: BookingPackage;
  sections: PackageSection[];
  onDelete: () => void;
  onUpdate: (updated: BookingPackage) => void;
  onPhotoUpload: (file: File) => Promise<void>;
  onPhotoDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(pkg.name);
  const [draftPrice, setDraftPrice] = useState(String(pkg.price));
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const palette = PRESET_PALETTE[pkg.colorKey] || PRESET_PALETTE[DEFAULT_COLOR_KEY];

  const handleSave = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onUpdate({ ...pkg, name: trimmed, price: toInt(draftPrice) });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftName(pkg.name);
    setDraftPrice(String(pkg.price));
    setEditing(false);
  };

  const toggleStudio = (studio: 'bawah' | 'atas') => {
    const has = pkg.availableIn.includes(studio);
    const next = has
      ? pkg.availableIn.filter(s => s !== studio)
      : [...pkg.availableIn, studio];
    if (next.length === 0) {
      toast.error('Paket harus aktif di minimal 1 studio.');
      return;
    }
    onUpdate({ ...pkg, availableIn: next });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await onPhotoUpload(file);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-900 transition-shadow hover:shadow-md"
    >
      {/* Color header bar */}
      <div
        className="h-2 w-full"
        style={{ background: `linear-gradient(90deg, ${palette.from}, ${palette.to})` }}
      />

      <div className="p-4 space-y-3">
        {/* Name & Price row */}
        {editing ? (
          <div className="space-y-2">
            <Input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              className="text-sm font-semibold h-8"
              placeholder="Nama paket"
              autoFocus
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Rp</span>
              <Input
                value={draftPrice}
                onChange={e => setDraftPrice(e.target.value)}
                className="h-8 text-sm"
                inputMode="numeric"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 h-7 bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={handleSave}>
                <Check className="w-3 h-3 mr-1" /> Simpan
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={handleCancel}>
                <X className="w-3 h-3 mr-1" /> Batal
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight truncate" title={pkg.name}>{pkg.name}</p>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Rp {pkg.price.toLocaleString('id-ID')}
              </p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit paket"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-gray-400 hover:text-red-600 transition-colors"
                title="Hapus paket"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Move to section */}
        {sections.length > 1 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Pindah ke Section</p>
            <Select
              value={pkg.sectionId || sections[0]?.id || ''}
              onValueChange={val => onUpdate({ ...pkg, sectionId: val })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Pilih section" />
              </SelectTrigger>
              <SelectContent>
                {sections.map(sec => (
                  <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Color picker */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Warna Blok</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESET_PALETTE).map(([key]) => (
              <ColorSwatch
                key={key}
                colorKey={key}
                selected={pkg.colorKey === key}
                onClick={() => onUpdate({ ...pkg, colorKey: key })}
              />
            ))}
          </div>
        </div>

        {/* Studio toggles */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Aktif Di Studio</p>
          <div className="flex gap-2">
            {(['bawah', 'atas'] as const).map(studio => {
              const active = pkg.availableIn.includes(studio);
              return (
                <button
                  key={studio}
                  onClick={() => toggleStudio(studio)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all duration-150 ${
                    active
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  Studio {studio === 'bawah' ? 'Bawah' : 'Atas'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Photo upload */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Foto Contoh</p>
          {pkg.photoUrl ? (
            <div className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img
                src={pkg.photoUrl}
                alt={`Contoh ${pkg.name}`}
                className="w-full h-28 object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 bg-white text-gray-800 rounded text-xs font-semibold hover:bg-gray-100 flex items-center gap-1"
                  disabled={uploadingPhoto}
                >
                  <Upload className="w-3 h-3" /> Ganti
                </button>
                <button
                  onClick={onPhotoDelete}
                  className="px-2 py-1 bg-red-500 text-white rounded text-xs font-semibold hover:bg-red-600 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Hapus
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-full h-20 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all text-gray-400 hover:text-blue-500 group"
            >
              {uploadingPhoto ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <ImageIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-medium">Upload Foto</span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Section Block ─────────────────────────────────────────────────────────────
function SectionBlock({
  section,
  packages,
  allSections,
  onRenameSection,
  onDeleteSection,
  onToggleCollapse,
  onAddPackageToSection,
  onUpdatePackage,
  onDeletePackage,
  onPhotoUpload,
  onPhotoDelete,
}: {
  section: PackageSection;
  packages: BookingPackage[];
  allSections: PackageSection[];
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onAddPackageToSection: (sectionId: string) => void;
  onUpdatePackage: (pkg: BookingPackage) => void;
  onDeletePackage: (pkg: BookingPackage) => void;
  onPhotoUpload: (pkg: BookingPackage, file: File) => Promise<void>;
  onPhotoDelete: (pkg: BookingPackage) => Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(section.name);
  const collapsed = section.collapsed ?? false;

  const handleSaveName = () => {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onRenameSection(section.id, trimmed);
    setEditingName(false);
  };

  const handleCancelName = () => {
    setDraftName(section.name);
    setEditingName(false);
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/10 overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500/10 to-sky-500/10 dark:from-blue-900/30 dark:to-sky-900/30 border-b border-blue-200 dark:border-blue-800/60">
        <button
          onClick={() => onToggleCollapse(section.id)}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 transition-colors flex-shrink-0"
        >
          {collapsed
            ? <ChevronRight className="w-5 h-5" />
            : <ChevronDown className="w-5 h-5" />
          }
        </button>

        <FolderOpen className="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />

        {editingName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Input
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              className="h-7 text-sm font-semibold flex-1 min-w-0 border-blue-300 focus:border-blue-500"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelName(); }}
            />
            <button onClick={handleSaveName} className="p-1 text-green-600 hover:text-green-700 transition-colors flex-shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={handleCancelName} className="p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-blue-800 dark:text-blue-200 text-sm truncate block">{section.name}</span>
              <span className="text-[10px] text-blue-500 dark:text-blue-400">{packages.length} paket</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => setEditingName(true)}
                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-400 hover:text-blue-600 transition-colors"
                title="Rename section"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDeleteSection(section.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-blue-300 hover:text-red-500 transition-colors"
                title="Hapus section"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Packages grid inside section */}
      {!collapsed && (
        <div className="p-4">
          {packages.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-600">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Belum ada paket di section ini.</p>
              <p className="text-xs mt-1">Klik tombol "Tambah Paket" di bawah untuk menambahkan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
              {packages.map(pkg => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  sections={allSections}
                  onUpdate={onUpdatePackage}
                  onDelete={() => onDeletePackage(pkg)}
                  onPhotoUpload={file => onPhotoUpload(pkg, file)}
                  onPhotoDelete={() => onPhotoDelete(pkg)}
                />
              ))}
            </div>
          )}

          {/* Add package button inside section */}
          <button
            onClick={() => onAddPackageToSection(section.id)}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-500 dark:text-blue-400 text-sm font-semibold flex items-center justify-center gap-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Tambah Paket ke "{section.name}"
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Add Package Modal ─────────────────────────────────────────────────────────
function AddPackageModal({
  open,
  sectionId,
  sections,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sectionId: string;
  sections: PackageSection[];
  onClose: () => void;
  onConfirm: (pkg: Omit<BookingPackage, 'id'>) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    price: '',
    colorKey: DEFAULT_COLOR_KEY,
    bawah: true,
    atas: false,
    sectionId,
  });

  // Reset form saat modal buka
  useEffect(() => {
    if (open) {
      setForm({ name: '', price: '', colorKey: DEFAULT_COLOR_KEY, bawah: true, atas: false, sectionId });
    }
  }, [open, sectionId]);

  const handleConfirm = () => {
    const name = form.name.trim();
    if (!name) { toast.error('Nama paket tidak boleh kosong.'); return; }
    const availableIn: ('bawah' | 'atas')[] = [
      ...(form.bawah ? ['bawah' as const] : []),
      ...(form.atas ? ['atas' as const] : []),
    ];
    if (availableIn.length === 0) { toast.error('Pilih minimal 1 studio.'); return; }
    onConfirm({ name, price: toInt(form.price), colorKey: form.colorKey, availableIn, sectionId: form.sectionId });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" /> Tambah Paket Baru
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Section target */}
          <div>
            <Label className="text-xs">Masukkan ke Section</Label>
            <Select value={form.sectionId} onValueChange={v => setForm(f => ({ ...f, sectionId: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map(sec => (
                  <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div>
            <Label className="text-xs">Nama Paket</Label>
            <Input
              className="mt-1"
              placeholder="Contoh: Basic Merah"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          {/* Price */}
          <div>
            <Label className="text-xs">Harga (Rp)</Label>
            <Input
              className="mt-1"
              placeholder="50000"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              inputMode="numeric"
            />
          </div>

          {/* Studio */}
          <div>
            <Label className="text-xs">Aktif Di Studio</Label>
            <div className="flex gap-2 mt-1">
              {(['bawah', 'atas'] as const).map(studio => {
                const active = form[studio];
                return (
                  <button
                    key={studio}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, [studio]: !f[studio] }))}
                    className={`flex-1 h-10 rounded-lg text-xs font-semibold border-2 transition-all ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    Studio {studio === 'bawah' ? 'Bawah' : 'Atas'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color */}
          <div>
            <Label className="text-xs">Warna Blok</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries(PRESET_PALETTE).map(([key, pal]) => (
                <button
                  key={key}
                  type="button"
                  title={pal.label}
                  style={{ background: `linear-gradient(135deg, ${pal.from}, ${pal.to})` }}
                  className={`w-8 h-8 rounded-full border-2 transition-all duration-150 shadow-sm ${
                    form.colorKey === key ? 'border-gray-800 scale-110 ring-2 ring-offset-1 ring-gray-400' : 'border-transparent hover:scale-110'
                  }`}
                  onClick={() => setForm(f => ({ ...f, colorKey: key }))}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Batal</Button>
            <Button
              className="flex-1 bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white"
              onClick={handleConfirm}
            >
              <Plus className="w-4 h-4 mr-1" /> Tambah Paket
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
type ConfirmDialogState = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
};

const CONFIRM_CLOSED: ConfirmDialogState = {
  open: false, title: '', description: '', onConfirm: () => {},
};

function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmDialogState;
  onClose: () => void;
}) {
  const variant = state.variant ?? 'danger';

  const iconBg = {
    danger:  'bg-red-100 dark:bg-red-950',
    warning: 'bg-amber-100 dark:bg-amber-950',
    info:    'bg-blue-100 dark:bg-blue-950',
  }[variant];

  const iconColor = {
    danger:  'text-red-500',
    warning: 'text-amber-500',
    info:    'text-blue-500',
  }[variant];

  const btnClass = {
    danger:  'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-red-200 dark:shadow-red-900',
    warning: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-amber-200 dark:shadow-amber-900',
    info:    'bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white shadow-blue-200 dark:shadow-blue-900',
  }[variant];

  return (
    <Dialog open={state.open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden">
        {/* Top accent bar */}
        <div className={`h-1 w-full ${
          variant === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-500' :
          variant === 'warning' ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
          'bg-gradient-to-r from-blue-500 to-sky-500'
        }`} />

        <div className="px-6 py-5">
          <DialogHeader>
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`flex-shrink-0 w-11 h-11 rounded-full ${iconBg} flex items-center justify-center`}>
                {variant === 'info'
                  ? <Download className={`w-5 h-5 ${iconColor}`} />
                  : <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
                }
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0 pt-0.5">
                <DialogTitle className="text-base font-bold text-gray-900 dark:text-gray-100 leading-snug">
                  {state.title}
                </DialogTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  {state.description}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Actions */}
          <div className="flex gap-2.5 mt-5">
            <Button
              variant="outline"
              className="flex-1 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={onClose}
            >
              Batal
            </Button>
            <Button
              className={`flex-1 shadow-md ${btnClass}`}
              onClick={() => { state.onConfirm(); onClose(); }}
            >
              {state.confirmLabel ?? 'Ya, Hapus'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SettingsPage() {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'paket' | 'katalog' | 'studio'>('paket');

  // Add Section form
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  // Add Package modal
  const [addPkgModal, setAddPkgModal] = useState<{ open: boolean; sectionId: string }>({ open: false, sectionId: '' });

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(CONFIRM_CLOSED);
  const showConfirm = (cfg: Omit<ConfirmDialogState, 'open'>) =>
    setConfirmDialog({ ...cfg, open: true });

  // Catalog item form
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Paket Studio' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (snap) => {
      const data = snap.data() as AppSettings | undefined;
      if (data) {
        setSettingsState({
          ...defaultSettings,
          ...data,
          // Gunakan ?? agar array kosong [] tetap dihormati (bukan fallback ke default)
          packages: data.packages ?? defaultSettings.packages,
          packageSections: data.packageSections ?? defaultSettings.packageSections,
        });
      } else {
        setSettingsState(defaultSettings);
      }
    });
    return () => unsub();
  }, []);

  const allCatalogItems = useMemo(() => {
    return [
      ...settings.addons.map(a => ({ ...a, type: 'addon' as const })),
      ...settings.snacks.map(s => ({ ...s, type: 'snack' as const })),
    ];
  }, [settings.addons, settings.snacks]);

  const groupedCatalog = useMemo(() => {
    return allCatalogItems.reduce((acc, item) => {
      const cat = item.category || 'Umum';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {} as Record<string, (PricedItem & { type: 'addon' | 'snack' })[]>);
  }, [allCatalogItems]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const save = async (next: AppSettings) => {
    const synced: AppSettings = {
      ...next,
      packagePrices: buildPackagePrices(next.packages),
    };
    setSettingsState(synced);
    await setDoc(doc(db, 'settings', 'appSettings'), synced);
  };

  // ── Section CRUD ────────────────────────────────────────────────────────────
  const addSection = () => {
    const name = newSectionName.trim();
    if (!name) { toast.error('Nama section tidak boleh kosong.'); return; }
    const dup = settings.packageSections.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (dup) { toast.error('Nama section sudah ada!'); return; }
    const sec: PackageSection = { id: genId(), name };
    void save({ ...settings, packageSections: [...settings.packageSections, sec] });
    toast.success(`Section "${name}" ditambahkan!`);
    setNewSectionName('');
    setAddingSection(false);
  };

  const renameSection = (id: string, name: string) => {
    const sections = settings.packageSections.map(s => s.id === id ? { ...s, name } : s);
    void save({ ...settings, packageSections: sections });
  };

  const deleteSection = (id: string) => {
    const sec = settings.packageSections.find(s => s.id === id);
    const isFirstSection = settings.packageSections[0]?.id === id;
    const pkgsInSection = settings.packages.filter(p =>
      p.sectionId === id || (isFirstSection && !p.sectionId)
    );
    if (pkgsInSection.length > 0) {
      showConfirm({
        title: `Hapus Section "${sec?.name}"?`,
        description: `Section ini masih memiliki ${pkgsInSection.length} paket. Semua paket di dalamnya akan ikut terhapus dan tidak bisa dikembalikan.`,
        confirmLabel: 'Ya, Hapus Semua',
        variant: 'danger',
        onConfirm: () => {
          const deletedIds = new Set(pkgsInSection.map(p => p.id));
          const packages = settings.packages.filter(p => !deletedIds.has(p.id));
          const sections = settings.packageSections.filter(s => s.id !== id);
          void save({ ...settings, packages, packageSections: sections });
          toast.success(`Section "${sec?.name}" dan ${pkgsInSection.length} paket dihapus.`);
        },
      });
    } else {
      showConfirm({
        title: `Hapus Section "${sec?.name}"?`,
        description: 'Section kosong ini akan dihapus permanen.',
        confirmLabel: 'Ya, Hapus',
        variant: 'danger',
        onConfirm: () => {
          const sections = settings.packageSections.filter(s => s.id !== id);
          void save({ ...settings, packageSections: sections });
          toast.success(`Section "${sec?.name}" dihapus.`);
        },
      });
    }
  };

  const toggleCollapseSection = (id: string) => {
    const sections = settings.packageSections.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s);
    // Don't persist collapse state - only update locally
    setSettingsState(prev => ({ ...prev, packageSections: sections }));
  };

  // ── Package CRUD ────────────────────────────────────────────────────────────
  const addPackageToSection = (data: Omit<BookingPackage, 'id'>) => {
    const name = data.name.trim();
    const duplicate = settings.packages.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { toast.error('Nama paket sudah ada!'); return; }
    const pkg: BookingPackage = { id: genId(), ...data };
    void save({ ...settings, packages: [...settings.packages, pkg] });
    toast.success(`Paket "${name}" ditambahkan!`);
  };

  const updatePackage = (updated: BookingPackage) => {
    const packages = settings.packages.map(p => (p.id === updated.id ? updated : p));
    void save({ ...settings, packages });
  };

  const deletePackage = (pkg: BookingPackage) => {
    showConfirm({
      title: `Hapus Paket "${pkg.name}"?`,
      description: 'Paket ini akan dihapus permanen beserta foto contohnya (jika ada). Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Ya, Hapus Paket',
      variant: 'danger',
      onConfirm: async () => {
        if (pkg.photoPath) {
          try { await deleteObject(storageRef(storage, pkg.photoPath)); } catch { /* ignore */ }
        }
        const packages = settings.packages.filter(p => p.id !== pkg.id);
        void save({ ...settings, packages });
        toast.success(`Paket "${pkg.name}" dihapus.`);
      },
    });
  };

  const uploadPackagePhoto = async (pkg: BookingPackage, file: File) => {
    const path = `packages/${pkg.id}/${Date.now()}_${file.name}`;
    const sRef = storageRef(storage, path);
    if (pkg.photoPath) {
      try { await deleteObject(storageRef(storage, pkg.photoPath)); } catch { /* ignore */ }
    }
    await uploadBytes(sRef, file);
    const url = await getDownloadURL(sRef);
    const updated: BookingPackage = { ...pkg, photoUrl: url, photoPath: path };
    const packages = settings.packages.map(p => (p.id === pkg.id ? updated : p));
    void save({ ...settings, packages });
    toast.success('Foto berhasil diupload!');
  };

  const deletePackagePhoto = async (pkg: BookingPackage) => {
    if (!pkg.photoPath) return;
    try { await deleteObject(storageRef(storage, pkg.photoPath)); } catch { /* ignore */ }
    const updated: BookingPackage = { ...pkg, photoUrl: undefined, photoPath: undefined };
    const packages = settings.packages.map(p => (p.id === pkg.id ? updated : p));
    void save({ ...settings, packages });
    toast.success('Foto dihapus.');
  };

  // ── Catalog CRUD ────────────────────────────────────────────────────────────
  const addItem = (type: 'addons' | 'snacks', name: string, price: number, category: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = genId();
    const next: AppSettings = {
      ...settings,
      [type]: [...settings[type], { id, name: trimmed, price: Math.max(0, price), category: category || 'Umum' }],
    };
    void save(next);
    toast.success(`"${trimmed}" ditambahkan ke katalog!`);
  };

  const removeItem = (type: 'addons' | 'snacks', id: string) => {
    const item = settings[type].find(x => x.id === id);
    const next: AppSettings = { ...settings, [type]: settings[type].filter(x => x.id !== id) };
    void save(next);
    if (item) toast.success(`"${item.name}" dihapus dari katalog.`);
  };

  const importCatalog = () => {
    showConfirm({
      title: 'Import Katalog Snap Me?',
      description: 'Puluhan item Add-on dan Snack akan ditambahkan ke katalog Anda. Item yang sudah ada tidak akan diduplikasi.',
      confirmLabel: 'Ya, Import Sekarang',
      variant: 'info',
      onConfirm: () => {
        const newAddons = SNAPME_CATALOG_ADDONS.map(i => ({ id: genId(), name: i.name, price: i.price, category: i.category }));
        const newSnacks = SNAPME_CATALOG_SNACKS.map(i => ({ id: genId(), name: i.name, price: i.price, category: i.category }));
        const existingAddonNames = new Set(settings.addons.map(a => a.name.toLowerCase()));
        const existingSnackNames = new Set(settings.snacks.map(a => a.name.toLowerCase()));
        const filteredAddons = newAddons.filter(a => !existingAddonNames.has(a.name.toLowerCase()));
        const filteredSnacks = newSnacks.filter(a => !existingSnackNames.has(a.name.toLowerCase()));
        const next = { ...settings, addons: [...settings.addons, ...filteredAddons], snacks: [...settings.snacks, ...filteredSnacks] };
        void save(next);
        toast.success(`Import selesai! ${filteredAddons.length} add-on, ${filteredSnacks.length} snack baru ditambahkan.`);
      },
    });
  };

  // Packages yang tidak punya sectionId (legacy) — masukkan ke section pertama
  const getPackagesForSection = (sectionId: string) => {
    const isFirst = settings.packageSections[0]?.id === sectionId;
    return settings.packages.filter(p => {
      if (!p.sectionId) return isFirst; // legacy: masuk section pertama
      return p.sectionId === sectionId;
    });
  };

  const unsectionedPackages = settings.packages.filter(p => {
    if (!p.sectionId) return false;
    return !settings.packageSections.find(s => s.id === p.sectionId);
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'paket' as const, label: 'Paket Foto', icon: <Package className="w-4 h-4" /> },
    { key: 'katalog' as const, label: 'Katalog Produk', icon: <Plus className="w-4 h-4" /> },
    { key: 'studio' as const, label: 'Info Studio', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-auto">
      <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Settings className="w-7 h-7" /> Setting
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Kelola paket, katalog produk, dan info studio.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={importCatalog} className="border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">
              Import Katalog Snap Me
            </Button>
            <Button onClick={() => setOpen(true)} className="bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white">
              Simpan Cepat
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-full sm:w-auto sm:inline-flex">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex-1 sm:flex-none justify-center sm:justify-start ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-gray-900 text-blue-700 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── TAB: Paket Foto ──────────────────────────────────────────────── */}
        {activeTab === 'paket' && (
          <div className="space-y-5">
            {/* Toolbar: Add Section */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2">
                {addingSection ? (
                  <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <Input
                      placeholder="Nama section baru..."
                      value={newSectionName}
                      onChange={e => setNewSectionName(e.target.value)}
                      className="h-9 text-sm"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); } }}
                    />
                    <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white px-3" onClick={addSection}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => { setAddingSection(false); setNewSectionName(''); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="border-blue-300 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center gap-2"
                    onClick={() => setAddingSection(true)}
                  >
                    <FolderPlus className="w-4 h-4" />
                    Tambah Section
                  </Button>
                )}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                {settings.packageSections.length} section · {settings.packages.length} paket total
              </div>
            </div>

            {/* Section list */}
            {settings.packageSections.length === 0 ? (
              <div className="text-center py-20 text-gray-400 dark:text-gray-600">
                <FolderOpen className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-base">Belum ada section.</p>
                <p className="text-sm mt-1">Klik <strong>"Tambah Section"</strong> untuk membuat section pertama, lalu tambahkan paket ke dalamnya.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {settings.packageSections.map(section => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    packages={getPackagesForSection(section.id)}
                    allSections={settings.packageSections}
                    onRenameSection={renameSection}
                    onDeleteSection={deleteSection}
                    onToggleCollapse={toggleCollapseSection}
                    onAddPackageToSection={sectionId => setAddPkgModal({ open: true, sectionId })}
                    onUpdatePackage={updatePackage}
                    onDeletePackage={pkg => deletePackage(pkg)}
                    onPhotoUpload={uploadPackagePhoto}
                    onPhotoDelete={deletePackagePhoto}
                  />
                ))}

                {/* Orphaned packages (sectionId not found) */}
                {unsectionedPackages.length > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" /> Paket tanpa section ({unsectionedPackages.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {unsectionedPackages.map(pkg => (
                        <PackageCard
                          key={pkg.id}
                          pkg={pkg}
                          sections={settings.packageSections}
                          onUpdate={updatePackage}
                          onDelete={() => deletePackage(pkg)}
                          onPhotoUpload={file => uploadPackagePhoto(pkg, file)}
                          onPhotoDelete={() => deletePackagePhoto(pkg)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Katalog Produk ─────────────────────────────────────────── */}
        {activeTab === 'katalog' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Katalog Produk Tambahan</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 max-w-2xl bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
              <Select value={newItem.category} onValueChange={v => setNewItem({ ...newItem, category: v })}>
                <SelectTrigger className="w-full sm:w-[150px] bg-white"><SelectValue placeholder="Kategori" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Paket Studio">Paket Studio</SelectItem>
                  <SelectItem value="Add-on Cetak">Add-on Cetak</SelectItem>
                  <SelectItem value="Foto Group">Foto Group</SelectItem>
                  <SelectItem value="Minuman">Minuman</SelectItem>
                  <SelectItem value="Snack">Snack</SelectItem>
                  <SelectItem value="Umum">Umum</SelectItem>
                </SelectContent>
              </Select>
              <Input className="flex-1 bg-white" placeholder="Nama Barang" value={newItem.name} onChange={e => setNewItem(a => ({ ...a, name: e.target.value }))} />
              <Input className="w-full sm:w-[120px] bg-white" placeholder="Harga" value={newItem.price} onChange={e => setNewItem(a => ({ ...a, price: e.target.value }))} inputMode="numeric" />
              <Button
                onClick={() => {
                  const isSnack = newItem.category === 'Minuman' || newItem.category === 'Snack';
                  addItem(isSnack ? 'snacks' : 'addons', newItem.name, toInt(newItem.price), newItem.category);
                  setNewItem({ name: '', price: '', category: newItem.category });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {Object.entries(groupedCatalog).sort().map(([category, items]) => (
                <div key={category} className="space-y-2 relative">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-md border-l-4 border-blue-500">{category}</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada item.</p>
                    ) : (
                      items.map(x => (
                        <div key={x.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-800 rounded-lg p-3 hover:border-blue-200 transition-colors shadow-sm bg-white dark:bg-gray-900">
                          <div className="min-w-0 pr-2">
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{x.name}</p>
                            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Rp {x.price.toLocaleString('id-ID')}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeItem(x.type === 'snack' ? 'snacks' : 'addons', x.id)} title="Hapus">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: Info Studio ─────────────────────────────────────────────── */}
        {activeTab === 'studio' && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 max-w-lg space-y-3 shadow-sm">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Info Studio (di Nota)</h2>
            <div className="space-y-2">
              <div>
                <Label>Nama</Label>
                <Input value={settings.studioName} onChange={e => setSettingsState(s => ({ ...s, studioName: e.target.value }))} />
              </div>
              <div>
                <Label>Alamat</Label>
                <Input value={settings.studioAddress} onChange={e => setSettingsState(s => ({ ...s, studioAddress: e.target.value }))} />
              </div>
              <div>
                <Label>WA Studio</Label>
                <Input value={settings.studioWa} onChange={e => setSettingsState(s => ({ ...s, studioWa: e.target.value }))} />
              </div>
              <div className="pt-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Integrasi Google Drive</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Google OAuth Client ID</Label>
                    <Input className="text-xs h-8 mt-1" placeholder="xxxx.apps.googleusercontent.com" value={settings.googleClientId || ''} onChange={e => setSettingsState(s => ({ ...s, googleClientId: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Master Folder ID</Label>
                    <Input className="text-xs h-8 mt-1" placeholder="1A2B3c4d5e..." value={settings.googleDriveFolderId || ''} onChange={e => setSettingsState(s => ({ ...s, googleDriveFolderId: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">📁 Folder Lokal 1</Label>
                    <Input className="text-xs h-8 mt-1" placeholder="Contoh: D:\Foto Pelanggan" value={settings.localPhotoFolder || ''} onChange={e => setSettingsState(s => ({ ...s, localPhotoFolder: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">📁 Folder Lokal 2</Label>
                    <Input className="text-xs h-8 mt-1" placeholder="Contoh: E:\Backup Foto" value={settings.localPhotoFolder2 || ''} onChange={e => setSettingsState(s => ({ ...s, localPhotoFolder2: e.target.value }))} />
                    <p className="text-[10px] text-gray-400 mt-0.5">Sub-folder otomatis dibuat di kedua lokasi saat folder Drive dibuat</p>
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={() => void save(settings)} className="w-full mt-4">
                Simpan
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Package Modal */}
      <AddPackageModal
        open={addPkgModal.open}
        sectionId={addPkgModal.sectionId}
        sections={settings.packageSections}
        onClose={() => setAddPkgModal(m => ({ ...m, open: false }))}
        onConfirm={addPackageToSection}
      />

      {/* Confirm Save Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Simpan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ini akan menyimpan semua setting (paket, section, add-on, snack, info studio) ke Firebase.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              className="bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white"
              onClick={() => { void save(settings); setOpen(false); }}
            >
              Simpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Confirm Dialog */}
      <ConfirmDialog
        state={confirmDialog}
        onClose={() => setConfirmDialog(CONFIRM_CLOSED)}
      />
    </div>
  );
}
