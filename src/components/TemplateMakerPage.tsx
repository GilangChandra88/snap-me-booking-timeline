import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Image as ImageIcon, LayoutTemplate, Plus, Trash2, Save, Upload, GripHorizontal, Settings2, Layers as LayersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Resizable } from 're-resizable';


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


// --- Draggable Resizable Slot Component ---
function DraggableSlot({ 
    slot, 
    index, 
    onUpdate, 
    onDragStart,
    containerRef,
    isSelected,
    onClick
}: { 
    slot: PhotoSlot, 
    index: number, 
    onUpdate: (id: string, updates: Record<string, any>) => void,
    onDragStart: () => void,
    containerRef: React.RefObject<HTMLDivElement | null>,
    isSelected: boolean,
    onClick: (e: React.MouseEvent) => void
}) {
    const isDragging = useRef(false);
    const initialPos = useRef({ mouseX: 0, mouseY: 0, slotX: 0, slotY: 0, slotW: 0, slotH: 0 });
    const resizeAnimFrameId = useRef<number>(0);
    const currentPos = useRef({ x: slot.x, y: slot.y, w: slot.width, h: slot.height });
    const nodeRef = useRef<HTMLElement | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Trigger select when starting to drag
        onClick(e);
        // Only start dragging if not clicking on the resize handles
        if ((e.target as HTMLElement).className.includes('resize')) return;
        onDragStart();
        isDragging.current = true;
        initialPos.current = { mouseX: e.clientX, mouseY: e.clientY, slotX: slot.x, slotY: slot.y, slotW: slot.width, slotH: slot.height };
        currentPos.current = { x: slot.x, y: slot.y, w: slot.width, h: slot.height };
        nodeRef.current = (e.currentTarget as HTMLElement).parentElement;
        e.stopPropagation();
    };

    useEffect(() => {
        let animationFrameId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            
            const dx = e.clientX - initialPos.current.mouseX;
            const dy = e.clientY - initialPos.current.mouseY;

            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                const rect = containerRef.current!.getBoundingClientRect();
                const percentDx = (dx / rect.width) * 100;
                const percentDy = (dy / rect.height) * 100;

                const newX = initialPos.current.slotX + percentDx;
                const newY = initialPos.current.slotY + percentDy;

                currentPos.current.x = newX;
                currentPos.current.y = newY;

                if (nodeRef.current) {
                    nodeRef.current.style.left = `${newX}%`;
                    nodeRef.current.style.top = `${newY}%`;
                }
            });
        };
        const handleMouseUp = () => { 
            if (isDragging.current) {
                isDragging.current = false;
                onUpdate(slot.id, { x: currentPos.current.x, y: currentPos.current.y });
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            cancelAnimationFrame(animationFrameId);
        }
    }, [slot.id, onUpdate, containerRef]);

    return (
        <Resizable
            onResizeStart={() => {
                onDragStart();
                initialPos.current = { mouseX: 0, mouseY: 0, slotX: slot.x, slotY: slot.y, slotW: slot.width, slotH: slot.height };
                currentPos.current = { x: slot.x, y: slot.y, w: slot.width, h: slot.height };
            }}
            className={`absolute transition-all group ${isSelected ? 'ring-[3px] ring-blue-500 shadow-xl' : 'border border-transparent hover:border-white/50 shadow-md'}`}
            style={{ 
                position: 'absolute',
                left: `${slot.x}%`, 
                top: `${slot.y}%`, 
                zIndex: slot.zIndex || 1, 
            }}
            bounds="parent"
            lockAspectRatio={slot.lockRatio}
            size={{ width: `${slot.width}%`, height: `${slot.height}%` }}
            onResize={(_e, direction, refElement, delta) => {
                if (!containerRef.current) return;
                
                cancelAnimationFrame(resizeAnimFrameId.current);
                resizeAnimFrameId.current = requestAnimationFrame(() => {
                    const rect = containerRef.current!.getBoundingClientRect();
                    
                    const deltaWPct = (delta.width / rect.width) * 100;
                    const deltaHPct = (delta.height / rect.height) * 100;
                    
                    const newWidthPct = initialPos.current.slotW + deltaWPct;
                    const newHeightPct = initialPos.current.slotH + deltaHPct;
                    
                    let newX = initialPos.current.slotX;
                    let newY = initialPos.current.slotY;
                    const dir = direction.toLowerCase();
                    if (dir.includes('left')) newX -= deltaWPct;
                    if (dir.includes('top')) newY -= deltaHPct;

                    currentPos.current = { x: newX, y: newY, w: newWidthPct, h: newHeightPct };

                    refElement.style.left = `${newX}%`;
                    refElement.style.top = `${newY}%`;
                    refElement.style.width = `${newWidthPct}%`;
                    refElement.style.height = `${newHeightPct}%`;
                });
            }}
            onResizeStop={() => {
                if (!containerRef.current) return;
                onUpdate(slot.id, { x: currentPos.current.x, y: currentPos.current.y, width: currentPos.current.w, height: currentPos.current.h });
            }}
        >
            <div 
                className={`w-full h-full flex flex-col items-center justify-center cursor-move selection:bg-transparent backdrop-blur-sm transition-colors`}
                style={{ backgroundColor: `${slot.color || '#6366f1'}${isSelected ? '66' : '33'}` }}
                onMouseDown={handleMouseDown}
                onClick={onClick}
            >
                {isSelected && (
                    <div className="absolute -top-6 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow whitespace-nowrap z-50">
                        Terpilih (Foto {slot.slotNumber || index + 1})
                    </div>
                )}
                <GripHorizontal className={`w-6 h-6 mb-1 transition-opacity pointer-events-none ${isSelected ? 'text-white opacity-100' : 'text-white/50 opacity-0 group-hover:opacity-100'}`} />
                <span 
                    className={`font-bold drop-shadow-md px-2 py-1 rounded text-xs ring-1 pointer-events-none transition-colors`}
                    style={{ 
                        backgroundColor: 'rgba(0,0,0,0.6)', 
                        color: slot.color || '#a5b4fc',
                        borderColor: isSelected ? (slot.color || '#fff') : 'rgba(255,255,255,0.2)'
                    }}
                >
                    Foto {slot.slotNumber || index + 1} (L:{slot.zIndex || 1})
                </span>
            </div>
        </Resizable>
    );
}

// --- Draggable Resizable Custom Image Component ---
function DraggableImage({ 
    image, 
    onUpdate, 
    onDragStart,
    containerRef,
    isSelected,
    onClick
}: { 
    image: CustomImage, 
    onUpdate: (id: string, updates: Record<string, any>) => void,
    onDragStart: () => void,
    containerRef: React.RefObject<HTMLDivElement | null>,
    isSelected: boolean,
    onClick: (e: React.MouseEvent) => void
}) {
    const isDragging = useRef(false);
    const initialPos = useRef({ mouseX: 0, mouseY: 0, imgX: 0, imgY: 0, imgW: 0, imgH: 0 });
    const resizeAnimFrameId = useRef<number>(0);
    const currentPos = useRef({ x: image.x, y: image.y, w: image.width, h: image.height });
    const nodeRef = useRef<HTMLElement | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        onClick(e);
        if ((e.target as HTMLElement).className.includes('resize')) return;
        onDragStart();
        isDragging.current = true;
        initialPos.current = { mouseX: e.clientX, mouseY: e.clientY, imgX: image.x, imgY: image.y, imgW: image.width, imgH: image.height };
        currentPos.current = { x: image.x, y: image.y, w: image.width, h: image.height };
        nodeRef.current = (e.currentTarget as HTMLElement).parentElement;
        e.stopPropagation();
    };

    useEffect(() => {
        let animationFrameId: number;
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            
            const dx = e.clientX - initialPos.current.mouseX;
            const dy = e.clientY - initialPos.current.mouseY;

            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                const rect = containerRef.current!.getBoundingClientRect();
                const percentDx = (dx / rect.width) * 100;
                const percentDy = (dy / rect.height) * 100;

                const newX = initialPos.current.imgX + percentDx;
                const newY = initialPos.current.imgY + percentDy;

                currentPos.current.x = newX;
                currentPos.current.y = newY;

                if (nodeRef.current) {
                    nodeRef.current.style.left = `${newX}%`;
                    nodeRef.current.style.top = `${newY}%`;
                }
            });
        };
        const handleMouseUp = () => { 
            if (isDragging.current) {
                isDragging.current = false;
                onUpdate(image.id, { x: currentPos.current.x, y: currentPos.current.y });
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            cancelAnimationFrame(animationFrameId);
        }
    }, [image.id, onUpdate, containerRef]);

    return (
        <Resizable
            onResizeStart={() => {
                onDragStart();
                initialPos.current = { mouseX: 0, mouseY: 0, imgX: image.x, imgY: image.y, imgW: image.width, imgH: image.height };
                currentPos.current = { x: image.x, y: image.y, w: image.width, h: image.height };
            }}
            className={`absolute transition-all group ${isSelected ? 'ring-[3px] ring-blue-500 shadow-xl' : 'border border-transparent shadow-md'}`}
            style={{ 
                position: 'absolute',
                left: `${image.x}%`, 
                top: `${image.y}%`, 
                zIndex: image.zIndex || 1, 
            }}
            bounds="parent"
            lockAspectRatio={image.lockRatio}
            size={{ width: `${image.width}%`, height: `${image.height}%` }}
            onResize={(_e, direction, refElement, delta) => {
                if (!containerRef.current) return;
                
                cancelAnimationFrame(resizeAnimFrameId.current);
                resizeAnimFrameId.current = requestAnimationFrame(() => {
                    const rect = containerRef.current!.getBoundingClientRect();
                    
                    const deltaWPct = (delta.width / rect.width) * 100;
                    const deltaHPct = (delta.height / rect.height) * 100;
                    
                    const newWidthPct = initialPos.current.imgW + deltaWPct;
                    const newHeightPct = initialPos.current.imgH + deltaHPct;
                    
                    let newX = initialPos.current.imgX;
                    let newY = initialPos.current.imgY;
                    const dir = direction.toLowerCase();
                    if (dir.includes('left')) newX -= deltaWPct;
                    if (dir.includes('top')) newY -= deltaHPct;

                    currentPos.current = { x: newX, y: newY, w: newWidthPct, h: newHeightPct };

                    refElement.style.left = `${newX}%`;
                    refElement.style.top = `${newY}%`;
                    refElement.style.width = `${newWidthPct}%`;
                    refElement.style.height = `${newHeightPct}%`;
                });
            }}
            onResizeStop={() => {
                if (!containerRef.current) return;
                onUpdate(image.id, { x: currentPos.current.x, y: currentPos.current.y, width: currentPos.current.w, height: currentPos.current.h });
            }}
        >
            <div 
                className="w-full h-full flex items-center justify-center cursor-move selection:bg-transparent"
                onMouseDown={handleMouseDown}
                onClick={onClick}
            >
                {/* Removed object-contain to bind strictly to dragged bounds */}
                <img src={image.url} alt={image.name} className={`w-full h-full pointer-events-none drop-shadow-md object-fill transition-colors ${isSelected ? 'brightness-105' : ''}`} />
                {isSelected && (
                    <div className="absolute -top-6 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow whitespace-nowrap z-50">
                        Terpilih (PNG)
                    </div>
                )}
            </div>
        </Resizable>
    );
}

// --- Template Manager Component ---
export function TemplateMakerPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);

    // History Logic
    const undoStack = useRef<string[]>([]);
    const redoStack = useRef<string[]>([]);

    const pushHistory = () => {
        setEditingTemplate(prev => {
            if (prev) {
                const snapshot = JSON.stringify(prev);
                if (undoStack.current.length === 0 || undoStack.current[undoStack.current.length - 1] !== snapshot) {
                    undoStack.current.push(snapshot);
                    if (undoStack.current.length > 50) undoStack.current.shift();
                    redoStack.current = [];
                }
            }
            return prev;
        });
    };

    const handleUndo = () => {
        setEditingTemplate(prev => {
            if (!prev || undoStack.current.length === 0) return prev;
            const prevStateStr = undoStack.current.pop()!;
            redoStack.current.push(JSON.stringify(prev));
            setSelectedSlotId(null);
            return JSON.parse(prevStateStr);
        });
    };

    const handleRedo = () => {
        setEditingTemplate(prev => {
            if (!prev || redoStack.current.length === 0) return prev;
            const nextStateStr = redoStack.current.pop()!;
            undoStack.current.push(JSON.stringify(prev));
            setSelectedSlotId(null);
            return JSON.parse(nextStateStr);
        });
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore keystrokes if focused inside an input or textarea
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
            
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleDrop = (targetLayerId: string) => {
        if (!draggedLayerId || draggedLayerId === targetLayerId || !editingTemplate) return;
        
        pushHistory();
        const layers = [];
        if (editingTemplate.imageUrl) {
            layers.push({ id: 'frame', name: 'Bingkai', type: 'frame', zIndex: editingTemplate.imageZIndex ?? 10 });
        }
        if (editingTemplate.images) {
            editingTemplate.images.forEach(img => layers.push({ id: img.id, name: img.name, type: 'image', zIndex: img.zIndex || 1 }));
        }
        editingTemplate.slots.forEach((s, idx) => layers.push({ id: s.id, name: `Foto Customer ${idx+1}`, type: 'slot', zIndex: s.zIndex || 1 }));

        layers.sort((a, b) => b.zIndex - a.zIndex);

        const sourceIndex = layers.findIndex(l => l.id === draggedLayerId);
        const targetIndex = layers.findIndex(l => l.id === targetLayerId);
        
        if (sourceIndex === -1 || targetIndex === -1) return;
        
        const newLayers = [...layers];
        const [movedItem] = newLayers.splice(sourceIndex, 1);
        newLayers.splice(targetIndex, 0, movedItem);
        
        let currentZ = newLayers.length * 10;
        let newImageZIndex = editingTemplate.imageZIndex ?? 10;
        const newSlots = [...editingTemplate.slots];
        const newImages = [...(editingTemplate.images || [])];

        newLayers.forEach(layer => {
            if (layer.type === 'frame') {
                newImageZIndex = currentZ;
            } else if (layer.type === 'slot') {
                const sIdx = newSlots.findIndex(s => s.id === layer.id);
                if (sIdx !== -1) newSlots[sIdx] = { ...newSlots[sIdx], zIndex: currentZ };
            } else if (layer.type === 'image') {
                const iIdx = newImages.findIndex(i => i.id === layer.id);
                if (iIdx !== -1) newImages[iIdx] = { ...newImages[iIdx], zIndex: currentZ };
            }
            currentZ -= 10;
        });

        setEditingTemplate({
            ...editingTemplate,
            imageZIndex: newImageZIndex,
            slots: newSlots,
            images: newImages
        });
        setDraggedLayerId(null);
    };

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'templates'), (snap) => {
            const loaded = snap.docs.map(doc => doc.data() as Template);
            setTemplates(loaded);
        });
        return () => unsub();
    }, []);

    const handleCreateBlank = async () => {
        const newTemplate: Template = {
            id: Date.now().toString(),
            name: 'Template Baru',
            imageUrl: '',
            storagePath: '',
            slots: [],
            images: [],
            imageZIndex: 10
        };
        await setDoc(doc(db, 'templates', newTemplate.id), newTemplate);
        setEditingTemplate(newTemplate);
        setSelectedSlotId(null);
        toast.success('Template 4R Kosong berhasil dibuat!');
    };

    const handleUploadCustomImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!editingTemplate) return;
        const file = e.target.files?.[0];
        if (!file) return;

        pushHistory();
        setIsUploadingImage(true);
        const fileExt = file.name.split('.').pop() || 'png';
        const fileName = `custom_layer_${Date.now()}.${fileExt}`;
        const storageRef = ref(storage, `templates/${fileName}`);

        try {
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            
            // Calculate natural aspect ratio to prevent distorted starting boundaries
            const imgEl = new Image();
            imgEl.onload = () => {
                const aspect = imgEl.width / imgEl.height;
                let defaultW = 50; 
                let defaultH = 50 / aspect;

                // Adjust so it doesn't overflow container initially
                if (defaultH > 80) {
                    defaultH = 80;
                    defaultW = 80 * aspect;
                }
                if (defaultW > 80) {
                    defaultW = 80;
                    defaultH = 80 / aspect;
                }
                
                // Center new image
                const initX = (100 - defaultW) / 2;
                const initY = (100 - defaultH) / 2;

                // Calculate highest zIndex
                const maxZ = Math.max(
                    0,
                    ...(editingTemplate.slots.map(s => s.zIndex || 0)),
                    ...(editingTemplate.images?.map(i => i.zIndex || 0) || [])
                );

                const newImage: CustomImage = {
                    id: Date.now().toString(),
                    name: file.name,
                    url: url,
                    storagePath: `templates/${fileName}`,
                    x: initX, y: initY, width: defaultW, height: defaultH, zIndex: maxZ + 1, lockRatio: true
                };

                const updatedImages = [...(editingTemplate.images || []), newImage];
                setEditingTemplate({ ...editingTemplate, images: updatedImages });
                setSelectedSlotId(newImage.id);
                toast.success('Gambar berhasil ditambahkan!');
                setIsUploadingImage(false);
            };
            
            imgEl.onerror = () => {
                const maxZ = Math.max(
                    0,
                    ...(editingTemplate.slots.map(s => s.zIndex || 0)),
                    ...(editingTemplate.images?.map(i => i.zIndex || 0) || [])
                );
                
                const newImage: CustomImage = {
                    id: Date.now().toString(),
                    name: file.name,
                    url: url,
                    storagePath: `templates/${fileName}`,
                    x: 10, y: 10, width: 40, height: 40, zIndex: maxZ + 1
                };
                const updatedImages = [...(editingTemplate.images || []), newImage];
                setEditingTemplate({ ...editingTemplate, images: updatedImages });
                setSelectedSlotId(newImage.id);
                toast.success('Gambar ditambahkan!');
                setIsUploadingImage(false);
            };
            
            imgEl.src = url;

        } catch (error) {
            console.error(error);
            toast.error('Gagal mengunggah gambar.');
            setIsUploadingImage(false);
        } finally {
            if (e.target) e.target.value = ''; 
        }
    };

    const deleteTemplate = async (template: Template) => {
        if (!confirm('Yakin ingin menghapus template ini?')) return;
        try {
            if (template.storagePath) {
                const storageRef = ref(storage, template.storagePath);
                await deleteObject(storageRef).catch(console.error); // Ignore if file missing
            }
            await deleteDoc(doc(db, 'templates', template.id));
            if (editingTemplate?.id === template.id) {
                setEditingTemplate(null);
                setSelectedSlotId(null);
            }
            toast.success('Template dihapus.');
        } catch (error) {
            console.error(error);
            toast.error('Gagal menghapus template.');
        }
    };

    const saveEditingTemplate = async () => {
        if (!editingTemplate) return;
        try {
            await setDoc(doc(db, 'templates', editingTemplate.id), editingTemplate);
            toast.success('Pengaturan template disimpan!');
        } catch (error) {
            console.error(error);
            toast.error('Gagal menyimpan pengaturan.');
        }
    };

    const addSlot = () => {
        if (!editingTemplate) return;
        pushHistory();
        const maxZ = Math.max(
            0,
            ...editingTemplate.slots.map(s => s.zIndex || 0),
            ...(editingTemplate.images?.map(i => i.zIndex || 0) || [])
        );
        
        // Find next slot number
        const nextNumber = Math.max(0, ...editingTemplate.slots.map(s => s.slotNumber || 0)) + 1;
        const hexColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#14b8a6', '#d946ef', '#f97316'];
        const slotColor = hexColors[(nextNumber - 1) % hexColors.length];
        
        const newSlot: PhotoSlot = {
            id: Date.now().toString(),
            x: 10, y: 10, width: 30, height: 40, zIndex: maxZ + 1,
            slotNumber: nextNumber,
            color: slotColor
        };
        setEditingTemplate({
            ...editingTemplate,
            slots: [...editingTemplate.slots, newSlot]
        });
        setSelectedSlotId(newSlot.id); // Auto-select new slot
    };

    const updateSlot = (slotId: string, updates: Record<string, any>) => {
        setEditingTemplate(prev => {
            if (!prev) return prev;
            
            const applyUpdate = (item: any) => {
                let finalUpdates = { ...updates };
                // Single dimension update auto scale proportion calculation
                if (item.lockRatio && Object.keys(updates).length === 1) {
                    if (updates.width !== undefined) {
                        const aspect = item.width / item.height;
                        finalUpdates.height = Number(updates.width) / aspect;
                    } else if (updates.height !== undefined) {
                        const aspect = item.width / item.height;
                        finalUpdates.width = Number(updates.height) * aspect;
                    }
                }
                return { ...item, ...finalUpdates };
            };

            let updatedSlot = false;
            const newSlots = prev.slots.map(s => {
                if (s.id === slotId) { updatedSlot = true; return applyUpdate(s); }
                return s;
            });
            
            if (updatedSlot) return { ...prev, slots: newSlots };

            // Output Custom Images if slot wasn't found
            if (prev.images) {
                const newImages = prev.images.map(img => {
                    if (img.id === slotId) return applyUpdate(img);
                    return img;
                });
                return { ...prev, images: newImages };
            }
            return prev;
        });
    };

    const removeSlot = (slotId: string) => {
        if (!editingTemplate) return;
        pushHistory();
        setEditingTemplate({
            ...editingTemplate,
            slots: editingTemplate.slots.filter(s => s.id !== slotId),
            images: (editingTemplate.images || []).filter(img => img.id !== slotId)
        });
        if (selectedSlotId === slotId) setSelectedSlotId(null);
    };

    const activeSlot = editingTemplate?.slots.find(s => s.id === selectedSlotId) || editingTemplate?.images?.find(img => img.id === selectedSlotId);

    return (
        <div className="flex h-full bg-gray-50 dark:bg-black/90 print:hidden overflow-hidden max-w-[100vw]">
            {/* L E F T   P A N E L (Library) */}
            <div className="w-64 md:w-72 bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col shrink-0 z-20">
                <div className="p-4 border-b dark:border-gray-800 shrink-0">
                    <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center">
                        <LayoutTemplate className="w-5 h-5 mr-2 text-blue-500" /> Projek Template
                    </h3>
                </div>
                
                <div className="p-4 shrink-0">
                    <Button onClick={handleCreateBlank} className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white shadow-lg font-bold rounded-xl flex items-center justify-center">
                        <Plus className="w-5 h-5 mr-2" /> Buat Template 4R Kosong
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                    {templates.map(t => (
                        <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors group ${editingTemplate?.id === t.id ? 'bg-blue-50 border-blue-200 shadow-sm dark:bg-blue-900/30 dark:border-blue-800' : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-300 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-gray-800'}`} onClick={() => { setEditingTemplate(t); setSelectedSlotId(null); }}>
                            <div className="w-10 h-14 bg-gray-100 dark:bg-gray-800 rounded shrink-0 overflow-hidden shadow-inner ring-1 ring-black/5 flex items-center justify-center relative">
                                {t.imageUrl ? (
                                    <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                                ) : (
                                    <LayoutTemplate className="w-5 h-5 text-gray-300" />
                                )}
                                <div className="absolute inset-0 bg-black/10"></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold truncate ${editingTemplate?.id === t.id ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>{t.name}</p>
                                <p className="text-[10px] text-gray-500 font-medium">
                                    {t.slots.length} Slot | {t.images?.length || 0} Gambar
                                </p>
                            </div>
                            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100`} onClick={(e) => { e.stopPropagation(); deleteTemplate(t); }}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                    {templates.length === 0 && (
                        <p className="text-sm text-gray-400 text-center mt-6">Belum ada template. Silakan upload PNG Frame transparan.</p>
                    )}
                </div>
            </div>

            {/* M I D D L E   &   R I G H T   P A N E L S */}
            {editingTemplate ? (
                <>
                {/* C E N T E R   C A N V A S */}
                <div className="flex-1 flex flex-col min-w-0 bg-gray-100 dark:bg-gray-950 relative">
                    {/* Toolbar */}
                    <div className="h-14 bg-white dark:bg-gray-900 border-b dark:border-gray-800 flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
                        <div className="flex items-center gap-2 max-w-[200px] md:max-w-xs">
                            <Input className="h-8 font-bold border-transparent hover:border-gray-200 focus:border-blue-500 bg-transparent px-2" value={editingTemplate.name} onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })} placeholder="Nama Template" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={addSlot} className="h-8">
                                <Plus className="w-4 h-4 mr-1 md:mr-2" /> <span className="hidden md:inline">Tambah Foto</span>
                            </Button>
                            <Button size="sm" onClick={saveEditingTemplate} className="h-8 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20">
                                <Save className="w-4 h-4 mr-1 md:mr-2" /> <span className="hidden md:inline">Simpan Perubahan</span>
                            </Button>
                        </div>
                    </div>

                    {/* Massive Workspace */}
                    <div 
                        className="flex-1 overflow-auto bg-[url('https://transparenttextures.com/patterns/cubes.png')] flex items-center justify-center p-4 md:p-12 relative"
                        onClick={() => setSelectedSlotId(null)} // Click background to deselect
                    >
                        {/* Shadow Backing purely for aesthetics */}
                            {/* Grid Configuration: 4R is ~10cm x 15cm. So 10 cols, 15 rows */}
                        {/* Ruler & Canvas Wrapper */}
                        <div 
                            className="relative flex" 
                            style={{ 
                                height: '100%', 
                                maxHeight: '800px',
                                minHeight: '300px', 
                                aspectRatio: '2/3', 
                            }}
                        >
                            {/* Top Ruler */}
                            <div className="absolute -top-6 left-0 right-0 h-6 flex bg-white border border-gray-300 shadow-sm text-gray-400 overflow-hidden box-border z-10">
                                {Array.from({length: 10}).map((_,i) => (
                                    <div key={i} className="flex-1 border-r border-gray-200 relative pt-0.5">
                                        <span className="absolute top-0.5 left-1 text-[9px] font-mono leading-none tracking-tighter">{i * 1}</span>
                                        {/* Sub-ticks */}
                                        <div className="absolute bottom-0 w-full flex justify-between">
                                            {[...Array(9)].map((_,j) => <div key={j} className={`w-px bg-gray-300 ${j === 4 ? 'h-2' : 'h-1'}`}></div>)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Left Ruler */}
                            <div className="absolute top-0 -left-6 bottom-0 w-6 flex flex-col bg-white border border-gray-300 shadow-sm text-gray-400 overflow-hidden box-border z-10">
                                {Array.from({length: 15}).map((_,i) => (
                                    <div key={i} className="flex-1 border-b border-gray-200 relative">
                                        <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono leading-none">{i * 1}</span>
                                        {/* Sub-ticks */}
                                        <div className="absolute right-0 h-full flex flex-col justify-between">
                                            {[...Array(9)].map((_,j) => <div key={j} className={`h-px bg-gray-300 w-full ${j === 4 ? 'w-2' : 'w-1'}`}></div>)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Center Origin Square */}
                            <div className="absolute -top-6 -left-6 w-6 h-6 bg-gray-100 border border-gray-300 flex items-end justify-end p-1 z-20">
                                <div className="w-3 h-3 border-t border-l border-gray-400/50"></div>
                            </div>
                            
                            {/* Actually Editable Canvas Container */}
                            <div 
                                ref={canvasRef}
                                className="relative bg-white shadow-2xl transition-transform origin-center overflow-hidden border border-gray-300 w-full h-full"
                            >

                            {/* Legacy template frame image if exists */}
                            {editingTemplate.imageUrl && (
                                <img 
                                    src={editingTemplate.imageUrl} 
                                    alt="Legacy Frame" 
                                    className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-md" 
                                    style={{ zIndex: editingTemplate.imageZIndex ?? 10 }}
                                />
                            )}
                            
                            {/* Custom Rendering Layers */}
                            {editingTemplate.images?.map((img) => (
                                <DraggableImage 
                                    key={img.id} 
                                    image={img} 
                                    onUpdate={updateSlot} // updateSlot works for CustomImage too
                                    onDragStart={pushHistory}
                                    containerRef={canvasRef}
                                    isSelected={selectedSlotId === img.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedSlotId(img.id); }}
                                />
                            ))}
                            {editingTemplate.slots.map((slot, i) => (
                                <DraggableSlot 
                                    key={slot.id} 
                                    slot={slot} 
                                    index={i} 
                                    onUpdate={updateSlot} 
                                    onDragStart={pushHistory}
                                    containerRef={canvasRef}
                                    isSelected={selectedSlotId === slot.id}
                                    onClick={(e) => { e.stopPropagation(); setSelectedSlotId(slot.id); }}
                                />
                            ))}
                        </div>
                        </div>
                    </div>
                </div>

                {/* R I G H T   P A N E L (Properties/Settings) */}
                <div className="flex-none w-[280px] md:w-[320px] bg-white dark:bg-gray-900 border-l dark:border-gray-800 flex flex-col z-20 overflow-hidden shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
                    
                    {/* PROPERTIES INSPECTOR (Top Half fixed height) */}
                    <div className="p-4 border-b dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/50 h-[380px] overflow-y-auto">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center">
                            <Settings2 className="w-5 h-5 mr-2 text-blue-500" />
                            {activeSlot ? 'Pengaturan Transform' : 'Pengaturan Frame'}
                        </h3>
                        
                        {activeSlot ? (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-2 gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700 shadow-sm">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 text-center block">POS. X (%)</Label>
                                        <Input type="number" value={Math.round(activeSlot.x)} onFocus={pushHistory} onChange={e => updateSlot(activeSlot.id, { x: Number(e.target.value) })} className="h-8 text-sm text-center font-mono bg-gray-50 dark:bg-gray-900" />
                                        <div className="text-[10px] text-gray-400 text-center font-medium bg-gray-50 dark:bg-gray-800/50 py-0.5 rounded">{((activeSlot.x / 100) * 10.16).toFixed(2)} cm</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 text-center block">POS. Y (%)</Label>
                                        <Input type="number" value={Math.round(activeSlot.y)} onFocus={pushHistory} onChange={e => updateSlot(activeSlot.id, { y: Number(e.target.value) })} className="h-8 text-sm text-center font-mono bg-gray-50 dark:bg-gray-900" />
                                        <div className="text-[10px] text-gray-400 text-center font-medium bg-gray-50 dark:bg-gray-800/50 py-0.5 rounded">{((activeSlot.y / 100) * 15.24).toFixed(2)} cm</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 text-center block">LEBAR (%)</Label>
                                        <Input type="number" value={Math.round(activeSlot.width)} onFocus={pushHistory} onChange={e => updateSlot(activeSlot.id, { width: Number(e.target.value) })} className="h-8 text-sm text-center font-mono bg-gray-50 dark:bg-gray-900" />
                                        <div className="text-[10px] text-gray-400 text-center font-medium bg-gray-50 dark:bg-gray-800/50 py-0.5 rounded">{((activeSlot.width / 100) * 10.16).toFixed(2)} cm</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 text-center block">TINGGI (%)</Label>
                                        <Input type="number" value={Math.round(activeSlot.height)} onFocus={pushHistory} onChange={e => updateSlot(activeSlot.id, { height: Number(e.target.value) })} className="h-8 text-sm text-center font-mono bg-gray-50 dark:bg-gray-900" />
                                        <div className="text-[10px] text-gray-400 text-center font-medium bg-gray-50 dark:bg-gray-800/50 py-0.5 rounded">{((activeSlot.height / 100) * 15.24).toFixed(2)} cm</div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-inner">
                                    <Label className="text-xs font-semibold text-gray-600 dark:text-gray-300 cursor-pointer" htmlFor={`lock-${activeSlot.id}`}>Kunci Rasio Skala (Gembok)</Label>
                                    <input 
                                        type="checkbox" 
                                        id={`lock-${activeSlot.id}`}
                                        checked={activeSlot.lockRatio || false}
                                        onClick={pushHistory}
                                        onChange={(e) => updateSlot(activeSlot.id, { lockRatio: e.target.checked })}
                                        className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                                    />
                                </div>
                                <Button variant="destructive" size="sm" className="w-full flex items-center justify-center font-bold" onClick={() => removeSlot(activeSlot.id)}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Hapus Foto Customer Ini
                                </Button>
                            </div>
                        ) : (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-lg border border-blue-100 dark:border-blue-800/50 animate-in fade-in zoom-in-95">
                                <p className="text-xs opacity-90 leading-relaxed text-justify mb-2">
                                    Pilih lapisan di "Layers" bawah ini, atau klik langsung pada Kanvas untuk mengatur dimensi Transform (X, Y, Lebar, Tinggi).
                                </p>
                                <p className="text-[10px] font-bold opacity-70">Tekan Ctrl+Z untuk membatalkan perubahan susunan / tata letak ukuran.</p>
                            </div>
                        )}
                    </div>

                    {/* PHOTOSHOP-STYLE LAYERS PANEL (Bottom Half) */}
                    <div className="flex-1 flex flex-col min-h-0 bg-gray-100/50 dark:bg-gray-950/50">
                        <div className="px-4 py-3 bg-gray-200 dark:bg-gray-800 border-b flex items-center justify-between shrink-0 shadow-inner ring-1 ring-black/5">
                            <span className="text-xs font-bold uppercase text-gray-600 dark:text-gray-300">Layers (Urutan Tampil)</span>
                            <LayersIcon className="w-4 h-4 text-gray-500"/>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {/* Sort layers by zIndex descending (Photoshop style: top layer is foremost) */}
                            {[
                                ...(editingTemplate.imageUrl ? [{ id: 'frame', name: 'Legacy Frame (Base)', type: 'frame', zIndex: editingTemplate.imageZIndex ?? 10, color: '' }] : []),
                                ...(editingTemplate.images?.map((img) => ({ id: img.id, name: img.name || 'Gambar PNG', type: 'image', zIndex: img.zIndex || 1, color: '' })) || []),
                                ...editingTemplate.slots.map((s, i) => ({ id: s.id, name: `Foto Customer ${s.slotNumber || i + 1}`, type: 'slot', zIndex: s.zIndex || 1, color: s.color || '#6366f1' }))
                            ].sort((a, b) => b.zIndex - a.zIndex).map((layer) => {
                                const isSelected = layer.type === 'frame' ? false : selectedSlotId === layer.id;
                                
                                return (
                                    <div 
                                        key={layer.id} 
                                        draggable
                                        onDragStart={(e) => {
                                            setDraggedLayerId(layer.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            handleDrop(layer.id);
                                        }}
                                        onClick={() => setSelectedSlotId(layer.type === 'frame' ? null : layer.id)}
                                        className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-grab active:cursor-grabbing transition-all shadow-sm focus:outline-none ${
                                            draggedLayerId === layer.id ? 'opacity-50 scale-[0.98] border-dashed border-2 border-blue-400' : ''
                                        } ${
                                            isSelected
                                            ? 'bg-blue-100 border-blue-400 dark:bg-blue-900/40 dark:border-blue-700 font-bold ring-1 ring-blue-500/50 text-blue-900 dark:text-blue-100'
                                            : 'bg-white border border-transparent hover:border-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 truncate pr-2 pointer-events-none">
                                            {layer.type === 'frame' ? <LayoutTemplate className="w-4 h-4 text-gray-400 shrink-0" /> : layer.type === 'image' ? <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" /> : <div className="w-4 h-4 rounded ring-1 ring-black/10 shrink-0 shadow-inner" style={{ backgroundColor: layer.color }} />}
                                            <span className="text-sm truncate">{layer.name}</span>
                                        </div>
                                        
                                        <GripHorizontal className="w-4 h-4 text-gray-400 shrink-0 opacity-50 pointer-events-none" />
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-3 bg-white dark:bg-gray-900 border-t shrink-0 shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)] space-y-2">
                            <Button onClick={addSlot} className="w-full bg-white hover:bg-gray-50 text-gray-800 border-2 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 font-bold h-10 shadow-sm">
                                <Plus className="w-4 h-4 mr-2 text-gray-500" /> Tambah Foto Customer
                            </Button>
                            
                            <div className="relative">
                                <input type="file" accept="image/png" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleUploadCustomImage} disabled={isUploadingImage} title="Upload PNG Baru" />
                                <Button className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 shadow-blue-600/20 shadow-lg pointer-events-none ${isUploadingImage ? 'opacity-50' : ''}`}>
                                    <Upload className="w-4 h-4 mr-2" /> {isUploadingImage ? 'Mengunggah...' : 'Tambah Gambar (PNG)'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-100/50 dark:bg-gray-950/50 inset-shadow-sm">
                    <ImageIcon className="w-24 h-24 mb-6 opacity-20 text-blue-400" />
                    <h2 className="text-2xl font-black tracking-tight text-gray-300 dark:text-gray-700 mb-2">Workspace Kosong</h2>
                    <p className="text-sm text-gray-500 max-w-sm text-center">Pilih contoh template di perpustakaan sebelah kiri, atau buat baru dengan mengupload Frame (PNG/JPEG).</p>
                </div>
            )}
        </div>
    );
}


