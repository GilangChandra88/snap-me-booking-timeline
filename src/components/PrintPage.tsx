import { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Image as ImageIcon, Printer, CheckCircle2, ChevronLeft, ChevronRight, Layers as LayersIcon, Camera, Plus, X, Check, CropIcon, FileDown } from 'lucide-react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import { Resizable } from 're-resizable';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import type { AppSettings } from './SettingsPage';

// --- Interfaces ---
interface PhotoSlot {
    id: string;
    x: number; // percentage
    y: number; // percentage
    width: number; // percentage
    height: number; // percentage
    zIndex: number; // layer order
    lockRatio?: boolean;
    slotNumber?: number;
    color?: string;
}

interface CustomImage {
    id: string;
    url: string;
    storagePath: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    lockRatio?: boolean;
}

interface Template {
    id: string;
    name: string;
    imageUrl: string;
    storagePath: string;
    slots: PhotoSlot[];
    imageZIndex: number;
    images?: CustomImage[];
}

interface DrivePhoto {
    id: string;
    name: string;
    thumbnailLink: string;
    webContentLink: string;
}

interface CropSettings {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PrintJob {
    id: string;
    templateId: string;
    slotAssignments: Record<string, string>;
    slotPhotoIds?: Record<string, string>;
    slotCrops?: Record<string, CropSettings>;
}

interface Booking {
    id: string;
    customerName: string;
    date: string;
    studioType: string;
    driveFolderId?: string;
    driveLink?: string;
    printSession?: { 
        jobs?: PrintJob[];
        templateId?: string; 
        slotAssignments?: Record<string, string>; 
    };
}

// --- Studio Printer Component ---
function PrintPageContent() {
    const [folders, setFolders] = useState<Booking[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<Booking | null>(null);
    const [drivePhotos, setDrivePhotos] = useState<DrivePhoto[]>([]);
    const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
    
    const [templates, setTemplates] = useState<Template[]>([]);
    
    // Multi-page Print Session State
    const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
    const [isSelectingTemplate, setIsSelectingTemplate] = useState(false);
    const [activeTargetSlot, setActiveTargetSlot] = useState<{jobId: string, slotId: string} | null>(null);
    const [dragOverSlot, setDragOverSlot] = useState<{jobId: string, slotId: string} | null>(null);
    
    // Print Review State
    const [reviewMode, setReviewMode] = useState(false);
    const [isSavingPdf, setIsSavingPdf] = useState(false);
    const [isPreloading, setIsPreloading] = useState(false);
    // Pre-fetched image data URLs keyed by photo ID — reliable for print and PDF
    const [preloadedImages, setPreloadedImages] = useState<Record<string, string>>({});
    const printPagesRef = useRef<(HTMLDivElement | null)[]>([]);

    // Cropper State
    const [cropModalOpen, setCropModalOpen] = useState<{jobId: string, slotId: string, url: string, ratio: number, initialCrop?: CropSettings | null} | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPercentages, setCroppedAreaPercentages] = useState<CropSettings | null>(null);

    const [middlePreviewPhoto, setMiddlePreviewPhoto] = useState<DrivePhoto | null>(null);

    const [googleToken, setGoogleTokenState] = useState<string | null>(() => sessionStorage.getItem('googleToken'));

    const setGoogleToken = (token: string | null) => {
        setGoogleTokenState(token);
        if (token) {
            sessionStorage.setItem('googleToken', token);
        } else {
            sessionStorage.removeItem('googleToken');
        }
    };

    const loginGoogle = useGoogleLogin({
        onSuccess: (codeResponse) => setGoogleToken(codeResponse.access_token),
        onError: (error) => console.log('Login Failed:', error),
        scope: 'https://www.googleapis.com/auth/drive'
    });

    // Fetch Bookings with Folders & Templates
    useEffect(() => {
        const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
            const loaded = snap.docs.map(doc => doc.data() as Booking);
            setFolders(loaded.filter(b => b.driveFolderId).sort((a,b) => b.id.localeCompare(a.id)));
        });

        const unsubTemplates = onSnapshot(collection(db, 'templates'), (snap) => {
            setTemplates(snap.docs.map(doc => doc.data() as Template));
        });

        return () => { unsubBookings(); unsubTemplates(); };
    }, []);

    // Effect to sync current choice structure when selecting folder
    useEffect(() => {
        if (selectedFolder) {
            if (selectedFolder.printSession) {
                if (selectedFolder.printSession.jobs) {
                    setPrintJobs(selectedFolder.printSession.jobs);
                } else if (selectedFolder.printSession.templateId) {
                    setPrintJobs([{
                        id: `job-${Date.now()}`,
                        templateId: selectedFolder.printSession.templateId,
                        slotAssignments: selectedFolder.printSession.slotAssignments || {}
                    }]);
                } else {
                    setPrintJobs([]);
                }
            } else {
                setPrintJobs([]);
            }
            setActiveTargetSlot(null);
            setMiddlePreviewPhoto(null);
            setIsSelectingTemplate(false);
        }
    }, [selectedFolder]);

    // Save choice back to firestore when changing explicitly
    useEffect(() => {
        if (selectedFolder) {
            const docRef = doc(db, 'bookings', selectedFolder.id);
            setDoc(docRef, { printSession: { jobs: printJobs } }, { merge: true }).catch(console.error);
        }
    }, [printJobs, selectedFolder?.id]);

    // Fetch Photos from Google Drive API
    useEffect(() => {
        if (!selectedFolder?.driveFolderId || !googleToken) {
            setDrivePhotos([]);
            return;
        }

        const fetchPhotos = async () => {
            setIsLoadingPhotos(true);
            try {
                const query = `'${selectedFolder.driveFolderId}' in parents and trashed=false`;
                const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink,webContentLink,mimeType)&pageSize=100`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${googleToken}` }
                });
                const data = await response.json();
                
                if (!response.ok || data.error) {
                    console.error("DRIVE API ERROR:", data.error);
                    toast.error(`Gagal akses Drive: ${data.error?.message || 'Token kadaluarsa/tidak valid. Harap login ulang di menu Timeline.'}`);
                    setDrivePhotos([]);
                    return;
                }

                if (data.files) {
                    // Filter to images only
                    setDrivePhotos(data.files.filter((f: any) => f.mimeType.startsWith('image/')));
                }
            } catch (err) {
                console.error('Fetch photos err:', err);
                toast.error('Gagal menarik foto dari Google Drive.');
            } finally {
                setIsLoadingPhotos(false);
            }
        };

        fetchPhotos();
    }, [selectedFolder, googleToken]);

    // Keyboard Navigation for Preview
    useEffect(() => {
        if (!middlePreviewPhoto || drivePhotos.length === 0) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') {
                const idx = drivePhotos.findIndex(p => p.id === middlePreviewPhoto.id);
                if (idx !== -1 && idx < drivePhotos.length - 1) setMiddlePreviewPhoto(drivePhotos[idx + 1]);
            } else if (e.key === 'ArrowLeft') {
                const idx = drivePhotos.findIndex(p => p.id === middlePreviewPhoto.id);
                if (idx > 0) setMiddlePreviewPhoto(drivePhotos[idx - 1]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [middlePreviewPhoto, drivePhotos]);

    // Auto-scroll Gallery to active photo
    useEffect(() => {
        if (middlePreviewPhoto) {
            const el = document.getElementById(`photo-thumb-${middlePreviewPhoto.id}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [middlePreviewPhoto]);

    const handlePrint = async () => {
        if (printJobs.length === 0) return toast.error('Belum ada foto yang siap dicetak!');
        if (!googleToken) return toast.error('Harap login Google Drive terlebih dahulu.');

        let incomplete = false;
        printJobs.forEach(job => {
            const template = templates.find(t => t.id === job.templateId);
            if (template && Object.keys(job.slotAssignments).length !== template.slots.length) {
                incomplete = true;
            }
        });
        if (incomplete) toast.warning('Ada slot foto yang belum diisi.');

        // Pre-fetch all slot photos via Drive API before entering review mode
        setIsPreloading(true);
        const toastId = toast.loading('Memuat foto resolusi tinggi...');
        try {
            const newCache: Record<string, string> = {};
            for (const job of printJobs) {
                for (const [slotId, photoId] of Object.entries(job.slotPhotoIds || {})) {
                    if (!photoId || newCache[photoId]) continue;
                    if (!job.slotAssignments[slotId]) continue;
                    try {
                        const url = `https://www.googleapis.com/drive/v3/files/${photoId}?alt=media`;
                        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${googleToken}` } });
                        if (!res.ok) continue;
                        const blob = await res.blob();
                        const dataUrl = await new Promise<string>((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        newCache[photoId] = dataUrl;
                    } catch (e) {
                        console.warn('Failed to preload photo', photoId, e);
                    }
                }
            }
            setPreloadedImages(newCache);
            toast.success(`${Object.keys(newCache).length} foto dimuat!`, { id: toastId });
        } catch (e) {
            toast.error('Gagal memuat foto. Coba lagi.', { id: toastId });
        } finally {
            setIsPreloading(false);
        }

        setReviewMode(true);
    };

    const savePdf = async () => {
        if (printJobs.length === 0) return toast.error('Tidak ada halaman yang siap diekspor.');
        if (!googleToken) return toast.error('Perlu login Google Drive untuk generate PDF.');
        
        setIsSavingPdf(true);
        const toastId = toast.loading('Sedang generate PDF... Harap tunggu.');
        
        try {
            const { jsPDF } = await import('jspdf');

            // Fetch via Drive API endpoint — check preloaded cache first, then fetch live
            const fetchPhotoById = async (photoId: string): Promise<string> => {
                if (preloadedImages[photoId]) return preloadedImages[photoId];
                const url = `https://www.googleapis.com/drive/v3/files/${photoId}?alt=media`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${googleToken}` } });
                if (!res.ok) throw new Error(`Drive fetch failed: ${res.status}`);
                const blob = await res.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            };

            // Fetch any arbitrary URL (for template overlay & custom layer images)
            const fetchAsDataUrl = async (url: string): Promise<string> => {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                const blob = await res.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            };

            // Helper: load a dataURL into an HTMLImageElement
            const loadImg = (dataUrl: string): Promise<HTMLImageElement> =>
                new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = dataUrl;
                });

            // 4R at 300dpi
            const W = 1200; // 4in * 300dpi
            const H = 1800; // 6in * 300dpi
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: [4, 6] });

            for (let jobIdx = 0; jobIdx < printJobs.length; jobIdx++) {
                const job = printJobs[jobIdx];
                const template = templates.find(t => t.id === job.templateId);
                if (!template) continue;

                const canvas = document.createElement('canvas');
                canvas.width = W;
                canvas.height = H;
                const ctx = canvas.getContext('2d')!;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);

                // 1. Draw slot photos FIRST (background)
                for (const slot of template.slots) {
                    if (!job.slotAssignments[slot.id]) continue;
                    const photoId = job.slotPhotoIds?.[slot.id];
                    if (!photoId) { console.warn('No photoId for slot', slot.id); continue; }
                    try {
                        const dataUrl = await fetchPhotoById(photoId);
                        const img = await loadImg(dataUrl);
                        const crop = job.slotCrops?.[slot.id];
                        
                        const sx = slot.x / 100 * W;
                        const sy = slot.y / 100 * H;
                        const sw = slot.width / 100 * W;
                        const sh = slot.height / 100 * H;
                        
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(sx, sy, sw, sh);
                        ctx.clip();
                        
                        if (crop) {
                            const scaleX = 100 / crop.width;
                            const scaleY = 100 / crop.height;
                            const drawW = img.naturalWidth * scaleX;
                            const drawH = img.naturalHeight * scaleY;
                            const offsetX = -(crop.x / 100) * drawW;
                            const offsetY = -(crop.y / 100) * drawH;
                            ctx.drawImage(img, sx + offsetX, sy + offsetY, drawW, drawH);
                        } else {
                            const imgRatio = img.naturalWidth / img.naturalHeight;
                            const slotRatio = sw / sh;
                            let drawW = sw, drawH = sh, ox = 0, oy = 0;
                            if (imgRatio > slotRatio) {
                                drawH = sh; drawW = drawH * imgRatio;
                                ox = (sw - drawW) / 2;
                            } else {
                                drawW = sw; drawH = drawW / imgRatio;
                                oy = (sh - drawH) / 2;
                            }
                            ctx.drawImage(img, sx + ox, sy + oy, drawW, drawH);
                        }
                        ctx.restore();
                    } catch (e) {
                        console.warn('Skip slot image', slot.id, e);
                    }
                }

                // 2. Draw custom image layers
                for (const img of (template.images || [])) {
                    try {
                        const dataUrl = await fetchAsDataUrl(img.url);
                        const el = await loadImg(dataUrl);
                        ctx.drawImage(el, img.x / 100 * W, img.y / 100 * H, img.width / 100 * W, img.height / 100 * H);
                    } catch (e) {
                        console.warn('Skip custom img', img.id, e);
                    }
                }

                // 3. Draw template overlay (foreground)
                if (template.imageUrl) {
                    try {
                        const dataUrl = await fetchAsDataUrl(template.imageUrl);
                        const el = await loadImg(dataUrl);
                        ctx.drawImage(el, 0, 0, W, H);
                    } catch (e) {
                        console.warn('Skip template overlay', e);
                    }
                }

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                if (jobIdx > 0) pdf.addPage([4, 6], 'portrait');
                pdf.addImage(imgData, 'JPEG', 0, 0, 4, 6);
            }

            const fileName = `Cetak_4R_SnapMe_${new Date().toLocaleDateString('id-ID').replace(/\//g, '-')}.pdf`;
            pdf.save(fileName);
            toast.success(`PDF berhasil disimpan: ${fileName}`, { id: toastId });
        } catch (err) {
            console.error('PDF error:', err);
            toast.error('Gagal generate PDF. Cek konsol untuk detail.', { id: toastId });
        } finally {
            setIsSavingPdf(false);
        }
    };

    // Helper to render a print job for either PRINT or REVIEW
    const renderPrintJob = (job: PrintJob, idx: number, isReview: boolean) => {
        const template = templates.find(t => t.id === job.templateId);
        if (!template) return null;
        // Resolve slot URLs: prefer preloaded data URL (fetched via Drive API) for reliable print/PDF
        const resolvedSlots: Record<string, string> = {};
        for (const slotId of Object.keys(job.slotAssignments)) {
            const photoId = job.slotPhotoIds?.[slotId];
            const origUrl = job.slotAssignments[slotId];
            resolvedSlots[slotId] = (photoId && preloadedImages[photoId]) ? preloadedImages[photoId] : origUrl;
        }
        return (
            <div key={job.id} className={`relative flex flex-col items-center ${isReview ? 'w-full px-4 sm:px-8' : ''}`}>
                {isReview && (
                    <div className="text-gray-400 font-bold mb-4 uppercase tracking-widest text-sm print:hidden">
                        Halaman {idx + 1}
                    </div>
                )}
                <div 
                    ref={isReview ? (el) => { printPagesRef.current[idx] = el; } : undefined}
                    className={isReview 
                        ? "w-full max-w-[480px] md:max-w-[560px] aspect-[2/3] relative bg-white overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] transition-all duration-500" 
                        : "w-[4in] h-[6in] relative bg-white overflow-hidden"} 
                    style={isReview ? {} : { pageBreakAfter: 'always', breakAfter: 'page' }}
                >
                    {/* Legacy Foreground Template Image */}
                    {template.imageUrl && (
                        <img src={template.imageUrl} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ zIndex: template.imageZIndex ?? 10 }} />
                    )}

                    {/* Custom Image Layers */}
                    {template.images?.map(img => (
                        <img 
                            key={img.id}
                            src={img.url} 
                            className="absolute pointer-events-none object-fill"
                            style={{
                                left: `${img.x}%`, top: `${img.y}%`, width: `${img.width}%`, height: `${img.height}%`, zIndex: img.zIndex || 1
                            }}
                        />
                    ))}
                    
                    {/* Background Photos (rendered inside slots) */}
                    {template.slots.map(slot => (
                        <div 
                            key={slot.id} 
                            className="absolute overflow-hidden"
                            style={{
                                left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.width}%`, height: `${slot.height}%`, zIndex: slot.zIndex || 1
                            }}
                        >
                            {resolvedSlots[slot.id] && (
                                job.slotCrops?.[slot.id] ? (
                                    <img 
                                        src={resolvedSlots[slot.id]} 
                                        className="absolute max-w-none pointer-events-none" 
                                        style={{
                                            top: 0, left: 0, width: '100%', height: '100%',
                                            transformOrigin: 'top left',
                                            transform: `scale(${100 / job.slotCrops[slot.id].width}, ${100 / job.slotCrops[slot.id].height}) translate(-${job.slotCrops[slot.id].x}%, -${job.slotCrops[slot.id].y}%)`,
                                            objectFit: 'fill'
                                        }}
                                    />
                                ) : (
                                    <img src={resolvedSlots[slot.id]} className="w-full h-full object-cover" />
                                )
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <>
        {/* PRINT ONLY COMPOSER REGION */}
        <div className="hidden print:flex flex-col gap-0 relative bg-white overflow-hidden max-w-none">
            {printJobs.map((job, idx) => renderPrintJob(job, idx, false))}
        </div>

        {/* REVIEW ONLY COMPOSER REGION */}
        {reviewMode && (
            <div className="fixed inset-0 z-[300] bg-gray-950 overflow-y-auto print:hidden">
                <div className="sticky top-0 z-[310] flex items-center justify-between p-4 bg-gray-900/90 backdrop-blur border-b border-white/10 shadow-2xl">
                    <h2 className="text-white font-bold text-xl ml-4">Review Cetak Resolusi Tinggi</h2>
                    <div className="flex gap-4 mr-4">
                        <Button variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white" onClick={() => setReviewMode(false)}>
                            <ChevronLeft className="w-5 h-5 mr-2" /> Kembali
                        </Button>
                        <Button className="bg-green-600 hover:bg-green-500 text-white font-bold px-8 shadow-lg shadow-green-900/50" onClick={() => window.print()}>
                            <Printer className="w-5 h-5 mr-2" /> CETAK SEKARANG
                        </Button>
                        <Button 
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 shadow-lg shadow-blue-900/50 disabled:opacity-60" 
                            onClick={savePdf}
                            disabled={isSavingPdf}
                        >
                            <FileDown className="w-5 h-5 mr-2" /> 
                            {isSavingPdf ? 'Menyimpan...' : 'Simpan PDF'}
                        </Button>
                    </div>
                </div>
                
                <div className="flex flex-col items-center py-12 gap-12">
                    {printJobs.map((job, idx) => renderPrintJob(job, idx, true))}
                </div>
            </div>
        )}

        {/* INTERACTIVE UI */}
        <div className="print:hidden relative" style={{ display: reviewMode ? 'none' : 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden', minHeight: 0, background: 'white' }}>
            {/* NO GOOGLE TOKEN WARNING */}
            {!googleToken && (
                <div className="p-4 bg-amber-50 text-amber-900 border-b border-amber-200 text-center text-sm font-medium shrink-0 flex items-center justify-center gap-4">
                    <span>⚠️ Anda belum login ke Google Drive. Silakan Login terlebih dahulu agar bisa menarik foto.</span>
                    <Button onClick={() => loginGoogle()} variant="outline" size="sm" className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50">
                        Login Google Drive
                    </Button>
                </div>
            )}

            {/* MAIN WORKFLOW AREA */}
            {!selectedFolder ? (
                <div className="flex-1 flex flex-col items-center p-8 overflow-y-auto bg-gray-50/50">
                    <div className="w-full max-w-5xl mb-8 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 tracking-tight">Pilih Folder Booking Terlebih Dahulu</h2>
                            <p className="text-sm text-gray-500 font-medium mt-1">Hanya menampilkan booking yang sudah punya folder materi dari Google Drive.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full max-w-5xl">
                        {folders.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center text-gray-400 py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                                <LayersIcon className="w-12 h-12 mb-4 opacity-20" />
                                <p>Belum ada booking dengan link folder Google Drive.</p>
                            </div>
                        ) : (
                            folders.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setSelectedFolder(f)}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left group flex flex-col items-start focus:outline-none focus:ring-4 focus:ring-blue-500/20"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                                        <LayersIcon className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <h3 className="font-bold text-gray-800 text-sm truncate w-full group-hover:text-blue-600 transition-colors">{f.customerName}</h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5 opacity-80">{f.date}</p>
                                    
                                    {f.printSession && (
                                        <div className="mt-4 text-[10px] bg-green-50 text-green-700 px-2 py-1 rounded font-bold shadow-inner border border-green-200 flex items-center">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Template Tersimpan
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    {/* Header Controls for workspace */}
                    <div className="h-16 border-b dark:border-gray-800 flex items-center justify-between px-6 shrink-0 bg-white/50 backdrop-blur dark:bg-gray-900/50 shadow-sm z-10 w-full">
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedFolder(null)} className="text-gray-500 hover:text-gray-800 -ml-2 rounded-full h-9 px-3">
                                <ChevronLeft className="w-5 h-5 mr-1" /> Kembali
                            </Button>
                            <div className="h-6 w-px bg-gray-300 rounded-full"></div>
                            <div>
                                <h2 className="text-lg font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">Isi Template: {selectedFolder.customerName}</h2>
                                <p className="text-xs text-gray-500 font-medium">Pilih foto dari kiri, lalu atur ke template di sebelah kanan.</p>
                            </div>
                        </div>
                        <Button onClick={handlePrint} disabled={printJobs.length === 0 || isPreloading} className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 dark:shadow-none transition-transform hover:scale-105 font-bold h-10 px-6 rounded-xl disabled:opacity-70 disabled:cursor-wait">
                            <Printer className="w-4 h-4 mr-2" /> {isPreloading ? 'Memuat foto...' : 'Cetak 4R'}
                        </Button>
                    </div>

                    {/* 3-COLUMN WORKSPACE */}
                    <div className="flex-1 flex flex-row overflow-hidden bg-gray-50">
                        
                        {/* COLUMN 1: Gallery List (RESIZABLE) */}
                        <Resizable
                            defaultSize={{ width: 300, height: '100%' }}
                            minWidth={250}
                            maxWidth={600}
                            enable={{ right: true }}
                            className="border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex flex-col shrink-0 shadow-sm z-10 overflow-hidden"
                            handleComponent={{
                                right: <div className="w-1.5 h-full bg-transparent hover:bg-blue-300 absolute right-0 cursor-col-resize z-50 transition-colors" />
                            }}
                        >
                            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                            <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 shrink-0 block">1. Pilih Foto Drive</Label>
                            
                            {isLoadingPhotos ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <span className="text-sm text-gray-400 animate-pulse font-medium">Menarik foto...</span>
                                </div>
                            ) : drivePhotos.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-gray-500 opacity-70">
                                    <Camera className="w-10 h-10 mb-3 opacity-30" />
                                    Tidak ada foto gambar di folder ini.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 pb-6">
                                    {drivePhotos.map(photo => {
                                        const isUsed = printJobs.some(job => {
                                            if (job.slotPhotoIds && Object.values(job.slotPhotoIds).includes(photo.id)) return true;
                                            return Object.values(job.slotAssignments).some(v => v?.includes(photo.id) || v === photo.thumbnailLink?.replace(/=s\d+/, '=s0'));
                                        });
                                        return (
                                            <button 
                                                key={photo.id}
                                                id={`photo-thumb-${photo.id}`}
                                                onClick={() => setMiddlePreviewPhoto(photo)}
                                                draggable
                                                onDragStart={(e) => {
                                                    const hiRes = photo.thumbnailLink ? photo.thumbnailLink.replace(/=s\d+/, '=s0') : photo.thumbnailLink;
                                                    e.dataTransfer.setData('photoUrl', hiRes || '');
                                                    e.dataTransfer.setData('photoId', photo.id);
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                }}
                                                className={`group relative aspect-[3/4] rounded-lg overflow-hidden transition-all focus:outline-none cursor-pointer ${middlePreviewPhoto?.id === photo.id ? 'ring-[3px] ring-blue-500 ring-offset-2 scale-[0.98]' : isUsed ? 'ring-2 ring-green-400 ring-offset-1 opacity-85' : 'bg-gray-200 hover:ring-2 hover:ring-blue-300 hover:scale-[1.02]'}`}
                                            >
                                                <img src={photo.thumbnailLink ? photo.thumbnailLink.replace(/=s\d+/, '=s600') : photo.thumbnailLink} alt={photo.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" referrerPolicy="no-referrer" />
                                                
                                                {/* Selected Indication Overlay */}
                                                {middlePreviewPhoto?.id === photo.id && <div className="absolute inset-0 bg-blue-500/20"></div>}
                                                
                                                {isUsed && (
                                                    <div className="absolute top-1.5 left-1.5 bg-green-500 text-white rounded-full p-0.5 shadow-md border-[1.5px] border-white">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            </div>
                        </Resizable>

                        {/* COLUMN 2: Middle Preview */}
                        <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50 relative z-0 border-r border-gray-200">
                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0 relative">
                                {middlePreviewPhoto ? (
                                    <div className="relative w-full h-full flex items-center justify-center group/preview">
                                        {/* Prev Button */}
                                        <div className="absolute left-4 z-10 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="rounded-full shadow-lg bg-white/90 hover:bg-white text-gray-800"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const idx = drivePhotos.findIndex(p => p.id === middlePreviewPhoto.id);
                                                    if (idx > 0) setMiddlePreviewPhoto(drivePhotos[idx - 1]);
                                                }}
                                                disabled={drivePhotos.findIndex(p => p.id === middlePreviewPhoto?.id) <= 0}
                                            >
                                                <ChevronLeft className="w-6 h-6" />
                                            </Button>
                                        </div>

                                        <img 
                                            draggable
                                            onDragStart={(e) => {
                                                const hiRes = middlePreviewPhoto.thumbnailLink ? middlePreviewPhoto.thumbnailLink.replace(/=s\d+/, '=s0') : middlePreviewPhoto.thumbnailLink;
                                                e.dataTransfer.setData('photoUrl', hiRes || '');
                                                e.dataTransfer.setData('photoId', middlePreviewPhoto.id);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            }}
                                            src={middlePreviewPhoto.thumbnailLink ? middlePreviewPhoto.thumbnailLink.replace(/=s\d+/, '=s1200') : middlePreviewPhoto.thumbnailLink} 
                                            alt={middlePreviewPhoto.name} 
                                            className="max-w-full max-h-full object-contain rounded drop-shadow-xl bg-transparent cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-transform" 
                                            referrerPolicy="no-referrer" 
                                        />
                                        
                                        {/* Next Button */}
                                        <div className="absolute right-4 z-10 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                            <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="rounded-full shadow-lg bg-white/90 hover:bg-white text-gray-800"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const idx = drivePhotos.findIndex(p => p.id === middlePreviewPhoto.id);
                                                    if (idx < drivePhotos.length - 1) setMiddlePreviewPhoto(drivePhotos[idx + 1]);
                                                }}
                                                disabled={drivePhotos.findIndex(p => p.id === middlePreviewPhoto?.id) === drivePhotos.length - 1}
                                            >
                                                <ChevronRight className="w-6 h-6" />
                                            </Button>
                                        </div>

                                        {/* Quick Add To Template Button */}
                                        <div className="absolute top-6 left-6 z-10 opacity-0 group-hover/preview:opacity-100 transition-opacity">
                                            <Button 
                                                className="rounded-full shadow-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                                                onClick={() => {
                                                    if (printJobs.length === 0) return toast.warning('Pilih template 4R dulu!');
                                                    const hiRes = middlePreviewPhoto.thumbnailLink ? middlePreviewPhoto.thumbnailLink.replace(/=s\d+/, '=s0') : middlePreviewPhoto.thumbnailLink;
                                                    
                                                    let targetJobId = activeTargetSlot?.jobId;
                                                    let targetSlotId = activeTargetSlot?.slotId;
                                                    
                                                    if (!targetJobId || !targetSlotId) {
                                                        for (const job of printJobs) {
                                                            const template = templates.find(t => t.id === job.templateId);
                                                            if (!template) continue;
                                                            const emptySlot = template.slots.find(s => !job.slotAssignments[s.id]);
                                                            if (emptySlot) {
                                                                targetJobId = job.id;
                                                                targetSlotId = emptySlot.id;
                                                                break;
                                                            }
                                                        }
                                                        if (!targetJobId || !targetSlotId) {
                                                            targetJobId = printJobs[0].id;
                                                            targetSlotId = templates.find(t => t.id === printJobs[0].templateId)?.slots[0].id;
                                                        }
                                                    }
                                                    if (targetJobId && targetSlotId) {
                                                        const photoId = middlePreviewPhoto.id;
                                                        setPrintJobs(prev => prev.map(job => 
                                                            job.id === targetJobId 
                                                                ? { ...job, slotAssignments: { ...job.slotAssignments, [targetSlotId!]: hiRes || '' }, slotPhotoIds: { ...(job.slotPhotoIds || {}), [targetSlotId!]: photoId } }
                                                                : job
                                                        ));
                                                        setActiveTargetSlot({ jobId: targetJobId, slotId: targetSlotId });
                                                        toast.success(`Foto ditambahkan ke Slot`);
                                                    }
                                                }}
                                            >
                                                <Plus className="w-5 h-5 mr-1.5" /> Masukkan ke Template
                                            </Button>
                                        </div>

                                        {printJobs.some(job => Object.values(job.slotAssignments).some(v => v?.includes(middlePreviewPhoto.id) || v === middlePreviewPhoto.thumbnailLink?.replace(/=s\d+/, '=s0'))) && (
                                            <div className="absolute top-6 right-6 bg-green-500 text-white rounded-full p-2 shadow-lg border-2 border-white flex items-center gap-2 animate-in zoom-in-90 duration-300">
                                                <CheckCircle2 className="w-5 h-5" />
                                                <span className="text-sm font-bold pr-1">Masuk Template</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400 opacity-60">
                                        <ImageIcon className="w-20 h-20 mb-4 opacity-50" />
                                        <p className="font-medium text-sm">Pilih foto dari daftar di sebelah kiri</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* COLUMN 3: Template Selector / Layout (RESIZABLE) */}
                        <Resizable
                            defaultSize={{ width: 450, height: '100%' }}
                            minWidth={350}
                            maxWidth={800}
                            enable={{ left: true }}
                            className="bg-gray-100 dark:bg-black/50 flex flex-col shrink-0 shadow-[-10px_0_20px_-10px_rgba(0,0,0,0.05)] z-20 overflow-hidden"
                            handleComponent={{
                                left: <div className="w-1.5 h-full bg-transparent hover:bg-blue-300 absolute left-0 cursor-col-resize z-50 transition-colors" />
                            }}
                        >
                            <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-start">
                            {printJobs.length === 0 && !isSelectingTemplate ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <div className="w-full aspect-[2/3] border-4 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/50 group hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all cursor-pointer shadow-sm" onClick={() => setIsSelectingTemplate(true)}>
                                        <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                            <Plus className="w-8 h-8 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-500 group-hover:text-blue-600 mb-1">Pilih Template 4R</h3>
                                    </div>
                                </div>
                            ) : isSelectingTemplate && printJobs.length === 0 ? (
                                <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-8 duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">3. Pilih Template 4R</Label>
                                        <Button variant="ghost" size="sm" onClick={() => setIsSelectingTemplate(false)} className="text-gray-500 hover:text-gray-800">
                                            Batal
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 pb-8">
                                        {templates.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => { 
                                                    setPrintJobs([{ id: `job-${Date.now()}`, templateId: t.id, slotAssignments: {} }]); 
                                                    setIsSelectingTemplate(false); 
                                                }}
                                                className={`relative rounded-xl border-2 overflow-hidden aspect-[2/3] border-gray-200 dark:border-gray-700 bg-white shadow-sm dark:bg-gray-800 hover:border-blue-400 hover:shadow-md transition-all focus:outline-none`}
                                            >
                                                <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 backdrop-blur-md border-t border-white/10">
                                                    <p className="text-[10px] text-white text-center truncate font-bold">{t.name}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-10 w-full pb-8">
                                    {printJobs.map((job, jobIdx) => {
                                        const t = templates.find(temp => temp.id === job.templateId);
                                        if (!t) return null;
                                        return (
                                            <div key={job.id} className="flex flex-col items-center w-full animate-in zoom-in-95 duration-300">
                                                <div className="flex items-center justify-between w-full mb-4">
                                                    <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Halaman {jobIdx + 1}</Label>
                                                    <Button variant="outline" size="sm" onClick={() => {
                                                        setPrintJobs(prev => prev.filter(j => j.id !== job.id));
                                                        if (activeTargetSlot?.jobId === job.id) setActiveTargetSlot(null);
                                                    }} className="h-7 text-[10px] font-bold text-red-500 border-red-200 hover:bg-red-50 rounded-md">
                                                        Hapus
                                                    </Button>
                                                </div>
                                                
                                                {/* App-rendered Interactive Preview (Mimics the print output) */}
                                                <div className="relative w-full shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] rounded-sm aspect-[2/3] bg-white overflow-hidden ring-1 ring-black/10">
                                                    
                                                    {/* Background Photos / Empty Slot Indicators */}
                                                    {t.slots.map((slot, idx) => (
                                                        <button
                                                            key={slot.id}
                                                            onClick={() => {
                                                                if (job.slotAssignments[slot.id]) {
                                                                    setCropModalOpen({ 
                                                                        jobId: job.id, 
                                                                        slotId: slot.id, 
                                                                        url: job.slotAssignments[slot.id], 
                                                                        ratio: (slot.width * 4) / (slot.height * 6),
                                                                        initialCrop: job.slotCrops?.[slot.id] || null
                                                                    });
                                                                    setCrop({ x: 0, y: 0 });
                                                                    setZoom(1);
                                                                } else {
                                                                    setActiveTargetSlot({ jobId: job.id, slotId: slot.id });
                                                                }
                                                            }}
                                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverSlot({ jobId: job.id, slotId: slot.id }); }}
                                                            onDragLeave={() => setDragOverSlot(null)}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                setDragOverSlot(null);
                                                                const url = e.dataTransfer.getData('photoUrl');
                                                                const photoId = e.dataTransfer.getData('photoId');
                                                                if (url) {
                                                                    setPrintJobs(prev => prev.map(p => p.id === job.id ? { ...p, slotAssignments: { ...p.slotAssignments, [slot.id]: url }, slotPhotoIds: { ...(p.slotPhotoIds || {}), [slot.id]: photoId } } : p));
                                                                    setActiveTargetSlot({ jobId: job.id, slotId: slot.id });
                                                                }
                                                            }}
                                                            className={`absolute overflow-hidden outline-none transition-all group/slot ${
                                                                dragOverSlot?.jobId === job.id && dragOverSlot.slotId === slot.id
                                                                    ? 'ring-4 ring-green-400 ring-inset shadow-[0_0_24px_rgba(74,222,128,0.6)] bg-green-50 scale-[1.02]'
                                                                    : activeTargetSlot?.jobId === job.id && activeTargetSlot.slotId === slot.id
                                                                    ? 'ring-4 ring-blue-500 ring-inset shadow-[0_0_20px_rgba(99,102,241,0.5)] bg-blue-50'
                                                                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 hover:ring-2 hover:ring-blue-300 hover:ring-inset'
                                                            }`}
                                                            style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.width}%`, height: `${slot.height}%`, zIndex: slot.zIndex || 1 }}
                                                        >
                                                            {job.slotAssignments[slot.id] ? (
                                                                <>
                                                                    {job.slotCrops?.[slot.id] ? (
                                                                        <img 
                                                                            src={job.slotAssignments[slot.id]} 
                                                                            className="absolute max-w-none pointer-events-none" 
                                                                            referrerPolicy="no-referrer"
                                                                            style={{
                                                                                top: 0, left: 0, width: '100%', height: '100%',
                                                                                transformOrigin: 'top left',
                                                                                transform: `scale(${100 / job.slotCrops[slot.id].width}, ${100 / job.slotCrops[slot.id].height}) translate(-${job.slotCrops[slot.id].x}%, -${job.slotCrops[slot.id].y}%)`,
                                                                                objectFit: 'fill'
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <img src={job.slotAssignments[slot.id]} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                                    )}
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/slot:opacity-100 transition-opacity flex items-center justify-center">
                                                                        <CropIcon className="w-8 h-8 text-white drop-shadow-md" />
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center flex-col opacity-60">
                                                                    <ImageIcon className={`w-8 h-8 ${activeTargetSlot?.jobId === job.id && activeTargetSlot.slotId === slot.id ? 'text-blue-400' : 'text-gray-400'}`} />
                                                                    <span className={`text-[10px] font-black tracking-widest mt-2 uppercase ${activeTargetSlot?.jobId === job.id && activeTargetSlot.slotId === slot.id ? 'text-blue-600' : 'text-gray-400'}`}>Slot {idx + 1}</span>
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}

                                                    {/* Custom Image Layers */}
                                                    {t.images?.map(img => (
                                                        <img 
                                                            key={img.id}
                                                            src={img.url} 
                                                            className="absolute pointer-events-none object-fill drop-shadow-sm"
                                                            style={{
                                                                left: `${img.x}%`, top: `${img.y}%`, width: `${img.width}%`, height: `${img.height}%`, zIndex: img.zIndex || 1
                                                            }}
                                                        />
                                                    ))}
                                                    
                                                    {/* Foreground PNG Legacy Frame */}
                                                    {t.imageUrl && (
                                                        <img src={t.imageUrl} className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-sm" style={{ zIndex: t.imageZIndex ?? 10 }} />
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    
                                    {/* Appending New Job */}
                                    {isSelectingTemplate ? (
                                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom-8 mt-4 p-4 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/30">
                                            <div className="flex items-center justify-between mb-4">
                                                <Label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Pilih Template Baru</Label>
                                                <Button variant="ghost" size="sm" onClick={() => setIsSelectingTemplate(false)} className="text-gray-500 hover:text-gray-800">Batal</Button>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {templates.map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => { 
                                                            setPrintJobs(prev => [...prev, { id: `job-${Date.now()}`, templateId: t.id, slotAssignments: {} }]); 
                                                            setIsSelectingTemplate(false); 
                                                        }}
                                                        className={`relative rounded-xl border-2 overflow-hidden aspect-[2/3] border-gray-200 bg-white shadow-sm hover:border-blue-400 hover:shadow-md transition-all`}
                                                    >
                                                        <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                                                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 backdrop-blur-md border-t border-white/10">
                                                            <p className="text-[10px] text-white text-center truncate font-bold">{t.name}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <Button 
                                            onClick={() => setIsSelectingTemplate(true)}
                                            className="w-full h-14 border-2 border-dashed border-gray-300 bg-white hover:bg-gray-50 hover:border-blue-400 text-gray-600 hover:text-blue-600 rounded-xl transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <Plus className="w-5 h-5" /> TAMBAH PRINT PAGE
                                        </Button>
                                    )}

                                    <p className="text-[11px] font-medium text-gray-500 mt-2 mb-8 text-center leading-relaxed">
                                        💡 <strong>Pilih dan Drag</strong> foto dari kiri ke slot kosong manapun di atas
                                    </p>
                                </div>
                            )}
                            </div>
                        </Resizable>
                    </div>
                </div>
            )}
            {/* CROP MODAL */}
            {cropModalOpen && (
                <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 print:hidden animate-in fade-in duration-200">
                    <div className="flex flex-col items-center justify-between w-full max-w-4xl h-[85vh]">
                        <div className="w-full flex justify-between items-center px-4 mb-4">
                            <h3 className="text-white font-bold text-lg flex items-center"><CropIcon className="w-5 h-5 mr-2" /> Atur Posisi Foto</h3>
                            <button onClick={() => setCropModalOpen(null)} className="text-gray-400 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-2 rounded-full">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="relative w-full flex-1 bg-black/50 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                            <Cropper
                                image={cropModalOpen.url}
                                crop={crop}
                                zoom={zoom}
                                aspect={cropModalOpen.ratio}
                                initialCroppedAreaPercentages={cropModalOpen.initialCrop || undefined}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={(croppedAreaPercentages, _) => setCroppedAreaPercentages({
                                    x: croppedAreaPercentages.x,
                                    y: croppedAreaPercentages.y,
                                    width: croppedAreaPercentages.width,
                                    height: croppedAreaPercentages.height
                                })}
                            />
                        </div>

                        <div className="flex w-full items-center justify-between bg-gray-900 border border-white/10 mt-6 rounded-2xl p-4 gap-6">
                            <div className="flex-1 max-w-md flex flex-col items-start px-2">
                                <Label className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Perbesar Foto</Label>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-gray-800" onClick={() => setCropModalOpen(null)}>
                                    Batal
                                </Button>
                                <Button 
                                    className="bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-900/50" 
                                    onClick={() => {
                                        if (croppedAreaPercentages) {
                                            setPrintJobs(prev => prev.map(p => 
                                                p.id === cropModalOpen.jobId 
                                                    ? { ...p, slotCrops: { ...(p.slotCrops || {}), [cropModalOpen.slotId]: croppedAreaPercentages } }
                                                    : p
                                            ));
                                        }
                                        setCropModalOpen(null);
                                        toast.success('Posisi foto berhasil disimpan!');
                                    }}
                                >
                                    <Check className="w-5 h-5 mr-2" /> Simpan Potongan
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}


// --- Main Page Wrapper ---
export function PrintPage() {
    const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

    // Fetch settings on mount
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (docSnap) => {
            if (docSnap.exists()) {
                setAppSettings(docSnap.data() as AppSettings);
            } else {
                setAppSettings({} as AppSettings); // proceed with defaults
            }
        });
        return () => unsub();
    }, []);

    if (!appSettings) {
        return <div className="flex-1 flex items-center justify-center text-gray-400">Memuat konfigurasi...</div>;
    }

    return (
        <GoogleOAuthProvider clientId={appSettings.googleClientId || ''}>
            <div className="flex flex-col h-full bg-white dark:bg-gray-900 relative">
                <PrintPageContent />
            </div>
        </GoogleOAuthProvider>
    );
}

