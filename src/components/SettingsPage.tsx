import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';

export type PricedItem = { id: string; name: string; price: number; category?: string };

export type AppSettings = {
  studioName: string;
  studioAddress: string;
  studioWa: string;
  googleClientId: string;
  googleDriveFolderId: string;
  packagePrices: Record<string, number>;
  addons: PricedItem[];
  snacks: PricedItem[];
};

// No longer need SETTINGS_PATH

const defaultSettings: AppSettings = {
  studioName: 'Snap Me Self & Photo Studio',
  studioAddress: 'Jl. Nusa Indah No. 8, Singaraja',
  studioWa: '0859-2422-6805',
  googleClientId: '',
  googleDriveFolderId: '',
  packagePrices: {
    'Basic Putih': 50000,
    'Basic Abu': 50000,
    'Basic Pink': 50000,
    'Basic Putih + Tirai Merah': 50000,
    'Basic Abu + Tirai Merah': 50000,
    'Basic Pink + Tirai Merah': 50000,
    'Basic Putih + Tirai Hijau': 50000,
  },
  addons: [],
  snacks: [],
};

const toInt = (v: string) => {
  const n = parseInt(v.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const SNAPME_CATALOG_ADDONS: { name: string; price: number; category: string }[] = [
  // Paket Studio
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
  
  // Add-on Cetak
  { name: 'Cetak Foto Tipe A', price: 10000, category: 'Add-on Cetak' },
  { name: 'Cetak Foto Tipe B', price: 15000, category: 'Add-on Cetak' },
  { name: 'Gantungan Kunci', price: 15000, category: 'Add-on Cetak' },
  { name: 'Polaroid', price: 20000, category: 'Add-on Cetak' },

  // Foto Group
  { name: 'DP Photobooth', price: 0, category: 'Foto Group' },
  { name: 'FG Event Wisuda Anak TK', price: 0, category: 'Foto Group' },
  { name: 'FG Studio', price: 0, category: 'Foto Group' },
  { name: 'FG Wisuda', price: 0, category: 'Foto Group' },
  { name: 'Foto Grup', price: 0, category: 'Foto Group' },
  { name: 'Photobooth', price: 0, category: 'Foto Group' },
];

const SNAPME_CATALOG_SNACKS: { name: string; price: number; category: string }[] = [
  // Minuman
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
  // Snack
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

export function SettingsPage() {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [open, setOpen] = useState(false);

  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Paket Studio' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (snap) => {
      const data = snap.data() as AppSettings | undefined;
      if (data) {
        setSettingsState({ ...defaultSettings, ...data });
      } else {
        setSettingsState(defaultSettings);
      }
    });
    return () => unsub();
  }, []);

  const allPackages = useMemo(() => Object.keys(settings.packagePrices).sort(), [settings.packagePrices]);

  const allCatalogItems = useMemo(() => {
     return [
       ...settings.addons.map(a => ({...a, type: 'addon' as const})),
       ...settings.snacks.map(s => ({...s, type: 'snack' as const}))
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

  const save = async (next: AppSettings) => {
    setSettingsState(next);
    await setDoc(doc(db, 'settings', 'appSettings'), next);
  };

  const upsertPackagePrice = (pkg: string, price: number) => {
    void save({
      ...settings,
      packagePrices: { ...settings.packagePrices, [pkg]: Math.max(0, price) },
    });
  };

  const addItem = (type: 'addons' | 'snacks', name: string, price: number, category: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const next: AppSettings = {
      ...settings,
      [type]: [...settings[type], { id, name: trimmed, price: Math.max(0, price), category: category || 'Umum' }],
    };
    void save(next);
    toast.success(`"${trimmed}" ditambahkan ke katalog!`);
  };

  const removeItem = (type: 'addons' | 'snacks', id: string) => {
    const item = settings[type].find(x => x.id === id);
    const next: AppSettings = { ...settings, [type]: settings[type].filter((x) => x.id !== id) };
    void save(next);
    if (item) toast.success(`"${item.name}" dihapus dari katalog.`);
  };

  const importCatalog = () => {
    if (!confirm("Apakah Anda yakin ingin mengimport Katalog Snap Me? (Ini akan menambahkan puluhan item baru ke Add-on dan Snack Anda tanpa menghapus yang sudah ada)")) return;
    
    const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    
    // Set map by combining name
    const newAddons = SNAPME_CATALOG_ADDONS.map(i => ({ id: genId(), name: i.name, price: i.price, category: i.category }));
    const newSnacks = SNAPME_CATALOG_SNACKS.map(i => ({ id: genId(), name: i.name, price: i.price, category: i.category }));
    
    const existingAddonNames = new Set(settings.addons.map(a => a.name.toLowerCase()));
    const existingSnackNames = new Set(settings.snacks.map(a => a.name.toLowerCase()));

    const filteredAddons = newAddons.filter(a => !existingAddonNames.has(a.name.toLowerCase()));
    const filteredSnacks = newSnacks.filter(a => !existingSnackNames.has(a.name.toLowerCase()));

    const next = {
      ...settings,
      addons: [...settings.addons, ...filteredAddons],
      snacks: [...settings.snacks, ...filteredSnacks]
    };
    void save(next);
    toast.success(`Import selesai! ${filteredAddons.length} add-on, ${filteredSnacks.length} snack baru ditambahkan.`);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950 overflow-auto">
      <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Settings className="w-7 h-7" /> Setting
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Atur harga paket, add-on, snack, dan info studio untuk nota.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={importCatalog} className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
              Import Katalog Snap Me
            </Button>
            <Button onClick={() => setOpen(true)} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white">
              Simpan Cepat
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 lg:col-span-1 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Info Studio (di Nota)</h2>
            <div className="space-y-2">
              <div>
                <Label>Nama</Label>
                <Input value={settings.studioName} onChange={(e) => setSettingsState((s) => ({ ...s, studioName: e.target.value }))} />
              </div>
              <div>
                <Label>Alamat</Label>
                <Input value={settings.studioAddress} onChange={(e) => setSettingsState((s) => ({ ...s, studioAddress: e.target.value }))} />
              </div>
              <div>
                <Label>WA Studio</Label>
                <Input value={settings.studioWa} onChange={(e) => setSettingsState((s) => ({ ...s, studioWa: e.target.value }))} />
              </div>
              <div className="pt-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Integrasi Google Drive</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Google OAuth Client ID</Label>
                    <Input 
                      className="text-xs h-8 mt-1" 
                      placeholder="xxxx.apps.googleusercontent.com" 
                      value={settings.googleClientId || ''} 
                      onChange={(e) => setSettingsState((s) => ({ ...s, googleClientId: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Master Folder ID</Label>
                    <Input 
                      className="text-xs h-8 mt-1" 
                      placeholder="1A2B3c4d5e..." 
                      value={settings.googleDriveFolderId || ''} 
                      onChange={(e) => setSettingsState((s) => ({ ...s, googleDriveFolderId: e.target.value }))} 
                    />
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={() => void save(settings)} className="w-full mt-4">
                Simpan
              </Button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 lg:col-span-2 space-y-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Harga Paket</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allPackages.map((pkg) => (
                <div key={pkg} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{pkg}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Rp</span>
                    <Input
                      value={String(settings.packagePrices[pkg] ?? 0)}
                      onChange={(e) => upsertPackagePrice(pkg, toInt(e.target.value))}
                      className="h-9"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Katalog Produk Tambahan</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 max-w-2xl bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
            <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v })}>
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
            <Input className="flex-1 bg-white" placeholder="Nama Barang" value={newItem.name} onChange={(e) => setNewItem((a) => ({ ...a, name: e.target.value }))} />
            <Input className="w-full sm:w-[120px] bg-white" placeholder="Harga" value={newItem.price} onChange={(e) => setNewItem((a) => ({ ...a, price: e.target.value }))} inputMode="numeric" />
            <Button
              onClick={() => {
                const isSnack = newItem.category === 'Minuman' || newItem.category === 'Snack';
                addItem(isSnack ? 'snacks' : 'addons', newItem.name, toInt(newItem.price), newItem.category);
                setNewItem({ name: '', price: '', category: newItem.category });
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
            {Object.entries(groupedCatalog).sort().map(([category, items]) => (
              <div key={category} className="space-y-2 relative">
                 <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-md border-l-4 border-indigo-500">{category}</h3>
                 <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                   {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada item.</p>
                   ) : (
                      items.map(x => (
                        <div key={x.id} className="flex items-center justify-between border border-gray-200 dark:border-gray-800 rounded-lg p-3 hover:border-indigo-200 transition-colors shadow-sm bg-white">
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
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Simpan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ini akan menyimpan semua setting (harga paket, add-on, snack, info studio) ke Firebase.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              onClick={() => {
                void save(settings);
                setOpen(false);
              }}
            >
              Simpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

