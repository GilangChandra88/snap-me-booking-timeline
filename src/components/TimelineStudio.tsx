import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Resizable } from 're-resizable';
import { Plus, X, GripVertical, Clock, User, Camera, ChevronLeft, ChevronRight, Move, ArrowRightLeft, Play, Undo2, UserX, Moon, Sun, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { database } from '../lib/firebase';
import { ref, set, onValue } from 'firebase/database';

export interface Booking {
    id: string;
    date?: string; // YYYY-MM-DD
    studioType: 'bawah' | 'atas';
    bookingType: string;
    customerName: string;
    startTime: number; // minutes from midnight
    duration: number; // minutes
    noShow?: boolean;
    arrived?: boolean; // true when 'Mulai Sekarang' is clicked
}

export const getLocalYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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

const MINUTES_PER_HOUR = 60;
const PIXEL_PER_MINUTE = 3;
const MIN_DURATION = 30;

// Per-package colors for blocks
const PACKAGE_COLORS: Record<string, { gradient: string; border: string; hover: string; textDark?: boolean }> = {
    'Basic Putih': { gradient: 'from-blue-50 to-indigo-100', border: 'border-indigo-300', hover: 'hover:from-blue-100 hover:to-indigo-200', textDark: true },
    'Basic Abu': { gradient: 'from-slate-500 to-slate-600', border: 'border-slate-700', hover: 'hover:from-slate-600 hover:to-slate-700' },
    'Basic Pink': { gradient: 'from-pink-400 to-rose-500', border: 'border-rose-600', hover: 'hover:from-pink-500 hover:to-rose-600' },
    'Basic Putih + Tirai Merah': { gradient: 'from-blue-50 to-red-400', border: 'border-red-500', hover: 'hover:from-blue-100 hover:to-red-500' },
    'Basic Abu + Tirai Merah': { gradient: 'from-slate-500 to-red-500', border: 'border-red-600', hover: 'hover:from-slate-600 hover:to-red-600' },
    'Basic Pink + Tirai Merah': { gradient: 'from-pink-400 to-red-500', border: 'border-red-600', hover: 'hover:from-pink-500 hover:to-red-600' },
    'Basic Putih + Tirai Hijau': { gradient: 'from-blue-50 to-emerald-400', border: 'border-emerald-500', hover: 'hover:from-blue-100 hover:to-emerald-500' },
};

const DEFAULT_PACKAGE_COLOR = { gradient: 'from-purple-500 to-indigo-600', border: 'border-purple-700', hover: 'hover:from-purple-600 hover:to-indigo-700' };

const STUDIO_COLORS = {
    bawah: {
        light: 'bg-purple-50',
        text: 'text-purple-700',
        badge: 'bg-purple-100 text-purple-700'
    },
    atas: {
        light: 'bg-cyan-50',
        text: 'text-cyan-700',
        badge: 'bg-cyan-100 text-cyan-700'
    }
};

export function TimelineStudio() {
    const [allBookings, setAllBookings] = useState<Booking[]>([]);
    const [selectedDate] = useState(() => getLocalYMD(new Date()));

    // Derived state for the currently selected date
    const bookings = useMemo<Booking[]>(() => {
        const todayStr = getLocalYMD(new Date());
        return allBookings.filter(b => (b.date || todayStr) === selectedDate);
    }, [allBookings, selectedDate]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [selectedStudio, setSelectedStudio] = useState<'bawah' | 'atas'>('bawah');
    const [draggedBooking, setDraggedBooking] = useState<{ id: string; offsetX: number; startX: number; startY: number } | null>(null);
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
    const [transferMode, setTransferMode] = useState(false);
    const [transferPackage, setTransferPackage] = useState('');
    const [dropTransferPackages, setDropTransferPackages] = useState<Record<string, string>>({});
    const [undoHistory, setUndoHistory] = useState<Booking[][]>([]);

    // Cross-studio Drag & Drop State
    const [dropTransferData, setDropTransferData] = useState<{
        bookingIds: string[],
        targetStudio: 'bawah' | 'atas',
        updatedSimulatedBookings: Booking[]
    } | null>(null);

    // Keep selectedBooking updated if its data changes
    useEffect(() => {
        if (selectedBooking) {
            const updated = bookings.find(b => b.id === selectedBooking.id);
            if (!updated) {
                setSelectedBooking(null);
            } else if (JSON.stringify(updated) !== JSON.stringify(selectedBooking)) {
                setSelectedBooking(updated);
            }
        }
    }, [bookings, selectedBooking]);

    // Close detail dialog if multi-select mode is entered
    useEffect(() => {
        if (selectedBookingIds.size > 0) {
            setSelectedBooking(null);
        }
    }, [selectedBookingIds]);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('snapme-dark') === 'true';
        }
        return false;
    });
    const dragOriginalBookingsRef = useRef<Booking[] | null>(null);
    const scrollContainerBawahRef = useRef<HTMLDivElement>(null);
    const scrollContainerAtasRef = useRef<HTMLDivElement>(null);
    const isScrollingRef = useRef(false);
    const alarmPlayedRef = useRef<Set<string>>(new Set());
    const audioContextRef = useRef<AudioContext | null>(null);
    const firebaseWriteRef = useRef(false);
    const allBookingsRef = useRef<Booking[]>([]);
    const wasDraggingRef = useRef(false);
    const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressFiredRef = useRef(false);
    const dropZoneRef = useRef<'bawah' | 'atas' | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        customerName: '',
        bookingType: '',
        startHour: '09',
        startMinute: '00',
    });

    // Update current time every second
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Firebase: Listen for real-time updates
    useEffect(() => {
        const bookingsDbRef = ref(database, 'bookings');
        const unsubscribe = onValue(bookingsDbRef, (snapshot) => {
            if (firebaseWriteRef.current) {
                firebaseWriteRef.current = false;
                return;
            }
            const data = snapshot.val();
            if (data) {
                const loadedBookings: Booking[] = Object.values(data);
                setAllBookings(loadedBookings);
                allBookingsRef.current = loadedBookings;
            } else {
                setAllBookings([]);
                allBookingsRef.current = [];
            }
        });
        return () => unsubscribe();
    }, []);

    // Save ALL bookings to Firebase
    const saveToFirebase = useCallback((newBookings: Booking[]) => {
        firebaseWriteRef.current = true;
        const bookingsDbRef = ref(database, 'bookings');
        const bookingsMap: Record<string, Booking> = {};
        newBookings.forEach(b => { bookingsMap[b.id] = b; });
        set(bookingsDbRef, bookingsMap);
    }, []);

    // Update only current date's bookings without Firebase save (for dragging)
    const setFilteredBookings = useCallback((newFiltered: Booking[]) => {
        const todayStr = getLocalYMD(new Date());
        const otherDates = allBookingsRef.current.filter(b => (b.date || todayStr) !== selectedDate);
        const merged = [...otherDates, ...newFiltered];
        setAllBookings(merged);
        allBookingsRef.current = merged;
    }, [selectedDate]);

    // Update bookings for current date + save to Firebase + (optional) undo
    const updateBookings = useCallback((newFiltered: Booking[], skipUndo = false) => {
        if (!skipUndo) {
            setUndoHistory(prev => [...prev.slice(-20), allBookingsRef.current]);
        }
        setFilteredBookings(newFiltered);
        saveToFirebase(allBookingsRef.current);
    }, [setFilteredBookings, saveToFirebase]);

    // Undo function
    const undo = useCallback(() => {
        setUndoHistory(prev => {
            if (prev.length === 0) return prev;
            const newHistory = [...prev];
            const previousState = newHistory.pop()!;
            setAllBookings(previousState);
            allBookingsRef.current = previousState;
            saveToFirebase(previousState);
            return newHistory;
        });
    }, [saveToFirebase]);

    // Ctrl+Z keyboard shortcut for undo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [undo]);

    // Auto scroll to current time on mount
    useEffect(() => {
        if (scrollContainerBawahRef.current && scrollContainerAtasRef.current) {
            const currentTimePosition = currentTimeInMinutes * PIXEL_PER_MINUTE;
            scrollContainerBawahRef.current.scrollLeft = currentTimePosition - 200;
            scrollContainerAtasRef.current.scrollLeft = currentTimePosition - 200;
        }
    }, []);

    // Sync scroll between both timelines
    const syncScroll = (source: 'bawah' | 'atas', scrollLeft: number) => {
        if (isScrollingRef.current) return;

        isScrollingRef.current = true;

        if (source === 'bawah' && scrollContainerAtasRef.current) {
            scrollContainerAtasRef.current.scrollLeft = scrollLeft;
        } else if (source === 'atas' && scrollContainerBawahRef.current) {
            scrollContainerBawahRef.current.scrollLeft = scrollLeft;
        }

        setTimeout(() => {
            isScrollingRef.current = false;
        }, 0);
    };

    const currentTimeInMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const currentTimePosition = currentTimeInMinutes * PIXEL_PER_MINUTE;

    const scrollTimeline = (direction: 'left' | 'right') => {
        const scrollAmount = 300;
        if (scrollContainerBawahRef.current && scrollContainerAtasRef.current) {
            const newScrollLeft = scrollContainerBawahRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
            scrollContainerBawahRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            });
            scrollContainerAtasRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            });
        }
    };

    const jumpToCurrentTime = () => {
        if (scrollContainerBawahRef.current && scrollContainerAtasRef.current) {
            const currentTimePosition = currentTimeInMinutes * PIXEL_PER_MINUTE;
            scrollContainerBawahRef.current.scrollTo({
                left: currentTimePosition - 200,
                behavior: 'smooth'
            });
            scrollContainerAtasRef.current.scrollTo({
                left: currentTimePosition - 200,
                behavior: 'smooth'
            });
        }
    };

    // Resolve collisions: push blocks that are AFTER the dragged block cluster
    const resolveCollisions = (allBookings: Booking[], movedIds: Set<string>): Booking[] => {
        const movedBlocks = allBookings.filter(b => movedIds.has(b.id));
        if (movedBlocks.length === 0) return allBookings;

        const studioType = movedBlocks[0].studioType;
        const earliestMovedStart = Math.min(...movedBlocks.map(b => b.startTime));

        // Split into: blocks before the moved block (untouched) and blocks at/after (may need pushing)
        const beforeBlocks = allBookings
            .filter(b => b.studioType === studioType && !movedIds.has(b.id) && b.startTime < earliestMovedStart)
            .map(b => ({ ...b }));
        const afterBlocks = allBookings
            .filter(b => b.studioType === studioType && !movedIds.has(b.id) && b.startTime >= earliestMovedStart)
            .map(b => ({ ...b }));
        const otherStudio = allBookings.filter(b => b.studioType !== studioType);

        const combined = [...movedBlocks, ...afterBlocks].sort((a, b) => a.startTime - b.startTime);

        for (let i = 0; i < combined.length - 1; i++) {
            const endOfI = combined[i].startTime + combined[i].duration;
            // If the next block overlaps and is NOT a moved block, push it
            if (combined[i + 1].startTime < endOfI) {
                if (!movedIds.has(combined[i + 1].id)) {
                    combined[i + 1].startTime = endOfI;
                }
            }
        }

        return [...otherStudio, ...beforeBlocks, ...combined];
    };

    const addBooking = () => {
        if (!formData.customerName || !formData.bookingType) return;

        const startTime = parseInt(formData.startHour) * 60 + parseInt(formData.startMinute);
        const newBooking: Booking = {
            id: Date.now().toString(),
            date: selectedDate,
            studioType: selectedStudio,
            bookingType: formData.bookingType,
            customerName: formData.customerName,
            startTime,
            duration: MIN_DURATION,
        };

        const updated = resolveCollisions([...bookings, newBooking], new Set([newBooking.id]));
        updateBookings(updated);
        setFormData({ customerName: '', bookingType: '', startHour: '09', startMinute: '00' });
        setIsAddDialogOpen(false);
    };

    // Find the next available time slot for a given studio
    const getNextAvailableTime = (studio: 'bawah' | 'atas'): { hour: string; minute: string } => {
        // Start from current time, rounded up to next 30-min slot
        const nowMinutes = currentTimeInMinutes;
        let candidate = Math.ceil(nowMinutes / 30) * 30;

        // Get all bookings for this studio, sorted by start time
        const studioBookings = bookings
            .filter(b => b.studioType === studio)
            .sort((a, b) => a.startTime - b.startTime);

        // Try to find a slot that doesn't overlap
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

    const deleteBooking = (id: string) => {
        updateBookings(bookings.filter(b => b.id !== id));
        alarmPlayedRef.current.delete(id);
    };

    const moveToCurrentTime = (id: string) => {
        const now = currentTimeInMinutes;
        const updated = bookings.map(b => b.id === id ? { ...b, startTime: now, arrived: true } : b);
        const resolved = resolveCollisions(updated, new Set([id]));
        updateBookings(resolved);
        const movedBooking = resolved.find(b => b.id === id);
        if (movedBooking) {
            setSelectedBooking(movedBooking);
        }
    };

    const toggleNoShow = (id: string) => {
        const updated = bookings.map(b =>
            b.id === id ? { ...b, noShow: !b.noShow } : b
        );
        updateBookings(updated);
        const updatedBooking = updated.find(b => b.id === id);
        if (updatedBooking) setSelectedBooking(updatedBooking);
    };

    const markArrived = (id: string) => {
        const updated = bookings.map(b =>
            b.id === id ? { ...b, arrived: true } : b
        );
        updateBookings(updated);
    };

    const transferStudio = (id: string, newPackage: string) => {
        const booking = bookings.find(b => b.id === id);
        if (!booking) return;
        const newStudio: 'bawah' | 'atas' = booking.studioType === 'bawah' ? 'atas' : 'bawah';
        const updated = bookings.map(b =>
            b.id === id ? { ...b, studioType: newStudio, bookingType: newPackage } : b
        );
        updateBookings(resolveCollisions(updated, new Set([id])));
        setSelectedBooking(null);
        setTransferMode(false);
        setTransferPackage('');
    };

    // Play alarm sound using Web Audio API
    const playAlarmSound = () => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            const now = ctx.currentTime;

            // Play 3 beeps
            for (let i = 0; i < 3; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880; // A5 note
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, now + i * 0.3);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.25);
                osc.start(now + i * 0.3);
                osc.stop(now + i * 0.3 + 0.25);
            }
        } catch (e) {
            console.warn('Could not play alarm sound:', e);
        }
    };

    // Alarm: check if any active booking timer has expired
    useEffect(() => {
        bookings.forEach(booking => {
            const endMinutes = booking.startTime + booking.duration;
            if (currentTimeInMinutes >= endMinutes && currentTimeInMinutes < endMinutes + 1) {
                if (!alarmPlayedRef.current.has(booking.id)) {
                    alarmPlayedRef.current.add(booking.id);
                    playAlarmSound();
                }
            }
        });
    }, [currentTimeInMinutes, bookings]);

    const updateBookingDuration = (id: string, newWidth: number) => {
        const newDuration = Math.max(MIN_DURATION, Math.round(newWidth / PIXEL_PER_MINUTE));
        const updated = bookings.map(b => b.id === id ? { ...b, duration: newDuration } : b);
        updateBookings(resolveCollisions(updated, new Set([id])));
    };

    const confirmDropTransfer = () => {
        if (!dropTransferData) return;

        // Ensure all transferred bookings have a package selected
        const allSelected = dropTransferData.bookingIds.every(id => dropTransferPackages[id]);
        if (!allSelected) return;

        // Apply the new packages to all transferred bookings
        const finalArray = dropTransferData.updatedSimulatedBookings.map(b => {
            if (dropTransferData.bookingIds.includes(b.id) && dropTransferPackages[b.id]) {
                return { ...b, bookingType: dropTransferPackages[b.id] };
            }
            return b;
        });

        // Resolve collisions in the new studio context
        const resolved = resolveCollisions(finalArray, new Set(dropTransferData.bookingIds));
        updateBookings(resolved);

        // Clear
        setDropTransferData(null);
        setDropTransferPackages({});
        setSelectedBookingIds(new Set());
    };

    const cancelDropTransfer = () => {
        setDropTransferData(null);
        setDropTransferPackages({});
        setFilteredBookings(allBookingsRef.current); // Revert UI
    };

    const handleBookingMouseDown = (e: React.MouseEvent | React.TouchEvent, bookingId: string, currentLeft: number) => {
        // Don't prevent default blindly on touch, but we can stop propagation
        e.stopPropagation();
        const isTouch = 'touches' in e;
        const clientX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        const offsetX = clientX - currentLeft;
        // Save snapshot of all bookings BEFORE drag starts (for undo + drag recovery)
        setUndoHistory(prev => [...prev.slice(-20), allBookingsRef.current]);
        dragOriginalBookingsRef.current = bookings.map((b: Booking) => ({ ...b }));

        longPressFiredRef.current = false;

        // Start long press timer
        holdTimeoutRef.current = setTimeout(() => {
            longPressFiredRef.current = true;
            setSelectedBookingIds(prev => {
                const next = new Set(prev);
                next.add(bookingId);
                return next;
            });
            if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch (err) { }
            }
        }, 300); // 300ms for long press

        setDraggedBooking({ id: bookingId, offsetX, startX: clientX, startY: clientY });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (draggedBooking && dragOriginalBookingsRef.current) {
                const isTouch = 'touches' in e;
                const clientX = isTouch ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
                const clientY = isTouch ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

                // Threshold check to avoid accidental minuscule drags
                const threshold = isTouch ? 15 : 5;
                if (!wasDraggingRef.current && Math.abs(clientX - draggedBooking.startX) < threshold && Math.abs(clientY - draggedBooking.startY) < threshold) {
                    return;
                }

                if (holdTimeoutRef.current) {
                    clearTimeout(holdTimeoutRef.current);
                    holdTimeoutRef.current = null;
                }

                wasDraggingRef.current = true;

                const booking = dragOriginalBookingsRef.current.find((b: Booking) => b.id === draggedBooking.id);
                if (!booking) return;

                // Detect Cross-Studio Hover
                const containerRectBawah = scrollContainerBawahRef.current?.getBoundingClientRect();
                const containerRectAtas = scrollContainerAtasRef.current?.getBoundingClientRect();

                let isHoveringOther: 'bawah' | 'atas' | null = null;
                if (booking.studioType === 'bawah' && containerRectAtas && clientY >= containerRectAtas.top && clientY <= containerRectAtas.bottom) {
                    isHoveringOther = 'atas';
                } else if (booking.studioType === 'atas' && containerRectBawah && clientY >= containerRectBawah.top && clientY <= containerRectBawah.bottom) {
                    isHoveringOther = 'bawah';
                }

                if (dropZoneRef.current !== isHoveringOther) {
                    dropZoneRef.current = isHoveringOther;
                }

                const targetStudio = dropZoneRef.current || booking.studioType;
                const activeScrollContainer = targetStudio === 'bawah' ? scrollContainerBawahRef.current : scrollContainerAtasRef.current;

                if (!activeScrollContainer) return;

                const containerRect = activeScrollContainer.getBoundingClientRect();
                const relativeX = clientX - containerRect.left + activeScrollContainer.scrollLeft - draggedBooking.offsetX;
                const newStartTime = Math.max(0, Math.min(Math.round(relativeX / PIXEL_PER_MINUTE), 24 * 60 - MIN_DURATION));
                const timeDelta = newStartTime - booking.startTime;

                // Move all selected items if the dragging item is selected, otherwise just move the dragging item
                const movedIds = selectedBookingIds.has(draggedBooking.id) ? selectedBookingIds : new Set([draggedBooking.id]);

                // Always recalculate from the ORIGINAL snapshot, not from the current (already-pushed) state
                const updated = dragOriginalBookingsRef.current.map((b: Booking) => {
                    if (movedIds.has(b.id)) {
                        const newTime = Math.max(0, Math.min(b.startTime + timeDelta, 24 * 60 - b.duration));
                        return { ...b, startTime: newTime, studioType: targetStudio };
                    }
                    return b;
                });

                // Real-time grouping visualization inside the target studio
                setFilteredBookings(resolveCollisions(updated, movedIds));
            }
        };

        const handleMouseUp = () => {
            if (holdTimeoutRef.current) {
                clearTimeout(holdTimeoutRef.current);
                holdTimeoutRef.current = null;
            }

            if (wasDraggingRef.current) {
                if (dropZoneRef.current) {
                    // Trigger transfer dialog
                    const movedIdsArray = Array.from(selectedBookingIds.has(draggedBooking?.id || '') ? selectedBookingIds : new Set([draggedBooking!.id]));
                    setDropTransferData({
                        bookingIds: movedIdsArray,
                        targetStudio: dropZoneRef.current,
                        updatedSimulatedBookings: allBookingsRef.current // The visually updated state
                    });

                    // Pre-fill empty selections if available
                    const initialAcc: Record<string, string> = {};
                    movedIdsArray.forEach(id => { initialAcc[id] = ''; });
                    setDropTransferPackages(initialAcc);
                } else {
                    // Save final drag state to Firebase + undo — read from latest state
                    saveToFirebase(allBookingsRef.current);
                }
            }

            dropZoneRef.current = null;
            dragOriginalBookingsRef.current = null;
            setDraggedBooking(null);
        };

        if (draggedBooking) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleMouseMove, { passive: false });
            document.addEventListener('touchend', handleMouseUp);
            document.addEventListener('touchcancel', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleMouseMove);
            document.removeEventListener('touchend', handleMouseUp);
            document.removeEventListener('touchcancel', handleMouseUp);
        };
    }, [draggedBooking]);



    const handleContainerMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        const isTouch = 'touches' in e;
        // For mouse, only trigger on Left Click (button 0)
        if (!isTouch && (e as React.MouseEvent).button !== 0) return;

        if ((e.target as HTMLElement).closest('.react-resizable') || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.booking-block')) {
            return;
        }

        // Tap on empty space clears all selections
        setSelectedBookingIds(new Set());
        setSelectedBooking(null);
    };

    const getActiveBookings = () => {
        return bookings.filter(booking => {
            if (booking.noShow) return false;
            if (!booking.arrived) return false;
            const bookingStart = booking.startTime;
            const bookingEnd = booking.startTime + booking.duration;
            return currentTimeInMinutes >= bookingStart && currentTimeInMinutes < bookingEnd;
        });
    };

    const activeBookings = getActiveBookings();

    // Toggle dark mode and persist
    const toggleDarkMode = () => {
        setDarkMode(prev => {
            const next = !prev;
            localStorage.setItem('snapme-dark', String(next));
            return next;
        });
    };

    // Dark mode theme classes
    const dm = {
        root: darkMode ? 'bg-gray-950 text-gray-100' : 'bg-white text-gray-900',
        topSection: darkMode ? 'bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border-gray-700' : 'bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 border-gray-200',
        timerCard: darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white',
        timerName: darkMode ? 'text-gray-100' : 'text-gray-800',
        timerSub: darkMode ? 'text-gray-400' : 'text-gray-500',
        recapPanel: darkMode ? 'bg-gray-800/80 border-gray-700' : 'bg-white/80 border-gray-200',
        recapTitle: darkMode ? 'text-gray-100' : 'text-gray-800',
        recapLabel: darkMode ? 'text-gray-400' : 'text-gray-500',
        recapDuration: darkMode ? 'text-gray-300' : 'text-gray-700',
        statCard: (bg: string) => darkMode ? bg.replace('-50', '-900/50') : bg,
        timeBar: darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
        timeBarText: darkMode ? 'text-gray-400' : 'text-gray-600',
        timeDate: darkMode ? 'text-gray-500' : 'text-gray-500',
        timeBg: darkMode ? 'bg-gradient-to-r from-red-950 to-orange-950 border-red-800' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200',
        timelineSection: darkMode ? 'bg-gradient-to-br from-gray-900 to-gray-900' : 'bg-gradient-to-br from-gray-50 to-slate-50',
        timelineBox: darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200',
        gridPattern: darkMode ? 'opacity-[0.05]' : 'opacity-[0.03]',
        timeMarker: darkMode ? 'border-gray-600' : 'border-gray-300',
        timeMarkerHalf: darkMode ? 'border-gray-700' : 'border-gray-200',
        timeMarkerText: darkMode ? 'text-gray-400 bg-gray-800/90' : 'text-gray-600 bg-white/90',
        studioTitle: darkMode ? 'text-gray-100' : 'text-gray-800',
        studioSub: darkMode ? 'text-gray-400' : 'text-gray-500',
        emptyText: darkMode ? 'text-gray-600' : 'text-gray-400',
        btnOutline: darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : '',
    };

    const renderTimeMarkers = () => {
        const markers = [];
        for (let hour = 0; hour < 24; hour++) {
            // Hour marker
            markers.push(
                <div
                    key={`hour-${hour}`}
                    className={`absolute top-0 bottom-0 border-l ${dm.timeMarker}`}
                    style={{ left: `${hour * MINUTES_PER_HOUR * PIXEL_PER_MINUTE}px` }}
                >
                    <span className={`absolute top-1 -left-5 text-[11px] font-semibold ${dm.timeMarkerText} px-1.5 py-0.5 rounded`}>
                        {hour.toString().padStart(2, '0')}:00
                    </span>
                </div>
            );
            // 30-minute marker
            markers.push(
                <div
                    key={`half-${hour}`}
                    className="absolute top-0 bottom-0 border-l border-gray-200 border-dashed"
                    style={{ left: `${(hour * MINUTES_PER_HOUR + 30) * PIXEL_PER_MINUTE}px` }}
                >
                    <span className="absolute top-1.5 -left-3 text-[10px] text-gray-400 bg-white/80 px-1 rounded">:30</span>
                </div>
            );
        }
        return markers;
    };

    const renderBookingBlock = (booking: Booking) => {
        const left = booking.startTime * PIXEL_PER_MINUTE;
        const width = booking.duration * PIXEL_PER_MINUTE;
        const pkgColors = PACKAGE_COLORS[booking.bookingType] || DEFAULT_PACKAGE_COLOR;
        const isDragging = draggedBooking?.id === booking.id;
        const isNarrow = booking.duration <= 45;
        const hasTirai = booking.bookingType.includes('Tirai');
        const isDarkText = pkgColors.textDark === true;
        const textBase = isDarkText ? 'text-gray-800' : 'text-white';
        const textSub = isDarkText ? 'text-gray-600' : 'text-white/90';
        const textFaint = isDarkText ? 'text-gray-500' : 'text-white/80';

        const timeStr = `${Math.floor(booking.startTime / 60).toString().padStart(2, '0')}:${(booking.startTime % 60).toString().padStart(2, '0')}`;
        const endTime = booking.startTime + booking.duration;
        const endTimeStr = `${Math.floor(endTime / 60).toString().padStart(2, '0')}:${(endTime % 60).toString().padStart(2, '0')}`;
        const tooltipText = `${booking.customerName}\n${booking.bookingType}\n${timeStr} - ${endTimeStr} (${booking.duration} min)`;

        const handleBlockClick = (e: React.MouseEvent) => {
            if (wasDraggingRef.current) {
                wasDraggingRef.current = false;
                return;
            }
            if (longPressFiredRef.current) {
                longPressFiredRef.current = false;
                return;
            }

            e.stopPropagation();
            if (selectedBookingIds.size > 0) {
                setSelectedBookingIds(prev => {
                    const next = new Set(prev);
                    if (next.has(booking.id)) {
                        next.delete(booking.id);
                    } else {
                        next.add(booking.id);
                    }
                    return next;
                });
            } else {
                setSelectedBooking(booking);
            }
        };

        return (
            <Resizable
                key={booking.id}
                size={{ width, height: 86 }}
                minWidth={MIN_DURATION * PIXEL_PER_MINUTE}
                enable={{ right: true }}
                onResizeStop={(_e, _direction, _ref, d) => {
                    updateBookingDuration(booking.id, width + d.width);
                }}
                handleComponent={{
                    right: (
                        <div className="h-full flex items-center justify-center px-1 cursor-ew-resize">
                            <GripVertical className={`w-4 h-4 ${isDarkText ? 'text-gray-400' : 'text-white/70'} opacity-0 group-hover:opacity-100 transition-opacity`} />
                        </div>
                    )
                }}
                className={`booking-block group ${isDragging ? 'z-50' : selectedBookingIds.has(booking.id) ? 'z-40' : 'z-10'}`}
                style={{ position: 'absolute', left: `${left}px`, bottom: '4px' }}
            >
                <div
                    className={`h-full w-full bg-gradient-to-br ${pkgColors.gradient} ${pkgColors.hover} rounded-lg ${isNarrow ? 'px-2 py-1.5' : 'px-3 py-2'} flex items-center justify-between border-2 ${pkgColors.border} shadow-lg transition-all duration-200 hover:shadow-xl relative overflow-hidden ${isDragging ? 'cursor-grabbing shadow-2xl scale-105' : 'cursor-grab'} ${booking.noShow ? 'opacity-50 grayscale' : ''} ${selectedBookingIds.has(booking.id) ? 'ring-4 ring-blue-500 ring-offset-2 border-blue-400' : ''}`}
                    style={{
                        touchAction: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none'
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[class*="cursor-ew-resize"]')) {
                            return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleBookingMouseDown(e, booking.id, rect.left);
                    }}
                    onTouchStart={(e) => {
                        e.stopPropagation();
                        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[class*="cursor-ew-resize"]')) {
                            return;
                        }
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleBookingMouseDown(e, booking.id, rect.left);
                    }}
                    onClick={handleBlockClick}
                    title={tooltipText}
                >
                    {/* Background pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.3)_0%,_transparent_50%)]"></div>
                    </div>

                    {/* Curtain decoration for Tirai packages */}
                    {hasTirai && (
                        <div className="absolute right-1 top-0 bottom-0 flex items-center pointer-events-none opacity-30 z-0">
                            <span className="text-2xl">🎭</span>
                        </div>
                    )}

                    <div className="flex-1 overflow-hidden relative z-10 pointer-events-none min-w-0">
                        {isNarrow ? (
                            <>
                                <p className={`${textBase} text-[11px] font-bold truncate drop-shadow-sm leading-tight`}>{booking.customerName}</p>
                                <p className={`${textSub} text-[10px] font-semibold drop-shadow-sm leading-tight mt-0.5`}>{timeStr}</p>
                                <p className={`${textFaint} text-[9px] drop-shadow-sm leading-tight`}>{booking.duration}m</p>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <Move className={`w-3.5 h-3.5 ${textBase} opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
                                    <User className={`w-3.5 h-3.5 ${textBase} flex-shrink-0`} />
                                    <p className={`${textBase} text-sm font-bold truncate drop-shadow-sm`}>{booking.customerName}</p>
                                </div>
                                <p className={`${textBase} text-xs font-medium truncate drop-shadow-sm`}>{booking.bookingType}</p>
                                <p className={`${textSub} text-[11px] font-semibold mt-0.5 drop-shadow-sm`}>
                                    {timeStr} — {booking.duration} min
                                </p>
                            </>
                        )}
                    </div>

                    {/* Status badge + Datang button */}
                    {!booking.noShow && (
                        <div className="absolute bottom-1 right-1 flex items-center gap-1 z-20 pointer-events-auto">
                            {!booking.arrived && (
                                <>
                                    <span className="text-[9px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full shadow-sm leading-none">
                                        ⏳ Belum
                                    </span>
                                    <button
                                        className="text-[9px] font-bold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white px-1.5 py-0.5 rounded-full shadow-sm leading-none transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            markArrived(booking.id);
                                        }}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onTouchStart={(e) => e.stopPropagation()}
                                        title="Tandai customer telah datang"
                                    >
                                        ✓ Datang
                                    </button>
                                </>
                            )}
                            {booking.arrived && (
                                <span className="text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full shadow-sm leading-none">
                                    ✅ Hadir
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </Resizable>
        );
    };

    const renderTimerCard = (booking: Booking) => {
        const endTimeInSeconds = (booking.startTime + booking.duration) * 60;
        const currentSeconds = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
        const remainingTotalSeconds = Math.max(0, endTimeInSeconds - currentSeconds);
        const hours = Math.floor(remainingTotalSeconds / 3600);
        const minutes = Math.floor((remainingTotalSeconds % 3600) / 60);
        const seconds = remainingTotalSeconds % 60;
        const studioColors = STUDIO_COLORS[booking.studioType];
        const pkgColors = PACKAGE_COLORS[booking.bookingType] || DEFAULT_PACKAGE_COLOR;

        return (
            <div
                key={booking.id}
                className={`${dm.timerCard} rounded-xl shadow-2xl p-5 border-2 ${pkgColors.border} min-w-[240px] backdrop-blur-sm transform hover:scale-105 transition-transform duration-200`}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 ${studioColors.light} rounded-lg`}>
                            <Camera className={`w-4 h-4 ${studioColors.text}`} />
                        </div>
                        <span className={`text-xs font-semibold ${studioColors.text} uppercase tracking-wide`}>
                            Studio {booking.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                        </span>
                    </div>
                    <span className={`text-xs ${studioColors.badge} px-2.5 py-1 rounded-full font-medium`}>
                        ● Active
                    </span>
                </div>

                <div className="mb-3">
                    <h3 className={`text-xl font-semibold ${dm.timerName} mb-1`}>{booking.customerName}</h3>
                    <p className={`text-sm ${dm.timerSub}`}>{booking.bookingType}</p>
                </div>

                <div className={`bg-gradient-to-br ${pkgColors.gradient} rounded-lg p-3 text-white shadow-inner`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4" />
                        <p className="text-xs font-medium opacity-90">Waktu Tersisa</p>
                    </div>
                    <p className="text-3xl font-bold tabular-nums tracking-tight">
                        {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className={`flex flex-col h-full overflow-y-auto w-full transition-colors duration-300 ${dm.root}`}>
            {/* Timer Cards + Daily Recap Section */}
            <div className={`${dm.topSection} flex-shrink-0 border-b-2 p-4 md:p-6 min-h-[180px] backdrop-blur-sm`}>
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Timer Cards - Left Side */}
                    <div className="flex-1 min-w-0">
                        {activeBookings.length > 0 ? (
                            <div className="flex gap-4 md:gap-5 flex-row overflow-x-auto pb-2 snap-x">
                                {activeBookings.map(renderTimerCard)}
                            </div>
                        ) : (
                            <div className={`h-full flex flex-col items-center justify-center ${dm.emptyText} min-h-[140px]`}>
                                <Clock className="w-12 h-12 mb-3 opacity-30" />
                                <p className="text-sm text-center">Tidak ada booking aktif saat ini</p>
                            </div>
                        )}
                    </div>

                    {/* Daily Recap - Right Side */}
                    {(() => {
                        const todayBookings = bookings;
                        const totalBookings = todayBookings.length;
                        const completedBookings = todayBookings.filter(b => {
                            const endMin = b.startTime + b.duration;
                            return currentTimeInMinutes >= endMin;
                        }).length;
                        const upcomingBookings = todayBookings.filter(b => currentTimeInMinutes < b.startTime).length;
                        const noShowBookings = todayBookings.filter(b => b.noShow).length;
                        const studioBawahCount = todayBookings.filter(b => b.studioType === 'bawah').length;
                        const studioAtasCount = todayBookings.filter(b => b.studioType === 'atas').length;
                        const totalMinutes = todayBookings.reduce((sum, b) => sum + b.duration, 0);
                        const totalHours = Math.floor(totalMinutes / 60);
                        const remainMinutes = totalMinutes % 60;
                        const activeCount = activeBookings.length;

                        return (
                            <div className={`flex-shrink-0 w-full lg:w-[320px] ${dm.recapPanel} rounded-xl border p-4 shadow-sm z-10 relative`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                                        <Camera className="w-4 h-4 text-white" />
                                    </div>
                                    <h3 className={`text-sm font-bold ${dm.recapTitle}`}>Rekap Hari Ini</h3>
                                    <span className={`ml-auto text-[10px] ${dm.recapLabel} font-medium`}>
                                        {currentTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mb-3">
                                    <div className="bg-indigo-50 rounded-lg p-2 text-center">
                                        <p className="text-2xl font-bold text-indigo-600">{totalBookings}</p>
                                        <p className="text-[9px] text-indigo-500 font-semibold uppercase">Total</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-lg p-2 text-center">
                                        <p className="text-2xl font-bold text-emerald-600">{completedBookings}</p>
                                        <p className="text-[9px] text-emerald-500 font-semibold uppercase">Selesai</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                                        <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
                                        <p className="text-[9px] text-blue-500 font-semibold uppercase">Aktif</p>
                                    </div>
                                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                                        <p className="text-2xl font-bold text-amber-600">{upcomingBookings}</p>
                                        <p className="text-[9px] text-amber-500 font-semibold uppercase">Akan Datang</p>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={dm.recapLabel}>Studio Bawah</span>
                                        <span className="font-bold text-purple-600">{studioBawahCount} booking</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={dm.recapLabel}>Studio Atas</span>
                                        <span className="font-bold text-cyan-600">{studioAtasCount} booking</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className={dm.recapLabel}>Total Durasi</span>
                                        <span className={`font-bold ${dm.recapDuration}`}>{totalHours}j {remainMinutes}m</span>
                                    </div>
                                    {noShowBookings > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className={dm.recapLabel}>Tidak Datang</span>
                                            <span className="font-bold text-red-500">{noShowBookings} orang</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Current Time Display */}
            <div className={`${dm.timeBar} flex-shrink-0 border-b px-4 md:px-8 py-3 flex flex-col lg:flex-row sm:items-center justify-between shadow-sm gap-4`}>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className={`text-sm ${dm.timeBarText}`}>Waktu Saat Ini:</span>
                    </div>
                    <div className={`${dm.timeBg} border-2 rounded-lg px-4 py-2 w-full sm:w-auto text-center`}>
                        <span className="text-2xl font-bold text-red-600 tabular-nums">
                            {currentTime.getHours().toString().padStart(2, '0')}:
                            {currentTime.getMinutes().toString().padStart(2, '0')}:
                            {currentTime.getSeconds().toString().padStart(2, '0')}
                        </span>
                    </div>
                    <div className={`text-sm ${dm.timeDate}`}>
                        {currentTime.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>
                <div className="flex justify-center items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={undo}
                        disabled={undoHistory.length === 0}
                        className="flex items-center gap-2 flex-1 sm:flex-none"
                        title="Undo (Ctrl+Z)"
                    >
                        <Undo2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Undo</span>
                        {undoHistory.length > 0 && (
                            <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {undoHistory.length}
                            </span>
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={jumpToCurrentTime}
                        className="flex items-center gap-2 flex-1 sm:flex-none"
                    >
                        <Clock className="w-4 h-4" />
                        <span className="hidden sm:inline">Jump to Now</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="hidden sm:flex"
                        onClick={() => scrollTimeline('left')}
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="hidden sm:flex"
                        onClick={() => scrollTimeline('right')}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={toggleDarkMode}
                        title={darkMode ? 'Light Mode' : 'Dark Mode'}
                    >
                        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </Button>
                </div>
            </div>

            {/* Timeline Section */}
            <div className={`flex-1 min-h-[500px] ${dm.timelineSection}`}>
                <div className="p-4 md:p-8 space-y-10">
                    {/* Studio Bawah */}
                    <div className="flex flex-col xl:flex-row gap-4">
                        {/* Fixed Studio Header */}
                        <div className="flex-shrink-0 w-full xl:w-64">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg shadow-md">
                                        <Camera className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className={`text-lg font-semibold ${dm.studioTitle}`}>Studio Bawah</h2>
                                        <p className={`text-xs ${dm.studioSub}`}>Self Photo & Couple</p>
                                    </div>
                                </div>
                            </div>
                            <Dialog open={isAddDialogOpen && selectedStudio === 'bawah'} onOpenChange={(open) => {
                                setIsAddDialogOpen(open);
                                if (open) setSelectedStudio('bawah');
                            }}>
                                <DialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 shadow-md"
                                        onClick={() => {
                                            setSelectedStudio('bawah');
                                            const recommended = getNextAvailableTime('bawah');
                                            setFormData({ ...formData, bookingType: STUDIO_BAWAH_TYPES[0], startHour: recommended.hour, startMinute: recommended.minute });
                                        }}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Booking
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <Camera className="w-5 h-5 text-purple-600" />
                                            Tambah Booking - Studio Bawah
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label htmlFor="name">Nama Customer</Label>
                                            <Input
                                                id="name"
                                                value={formData.customerName}
                                                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                                placeholder="Masukkan nama"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="type">Jenis Booking</Label>
                                            <Select
                                                value={formData.bookingType}
                                                onValueChange={(value) => setFormData({ ...formData, bookingType: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih jenis" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STUDIO_BAWAH_TYPES.map(type => (
                                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <Label htmlFor="hour">Jam</Label>
                                                <Input
                                                    id="hour"
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    value={formData.startHour}
                                                    onChange={(e) => setFormData({ ...formData, startHour: e.target.value.padStart(2, '0') })}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <Label htmlFor="minute">Menit</Label>
                                                <Select
                                                    value={formData.startMinute}
                                                    onValueChange={(value) => setFormData({ ...formData, startMinute: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="00">00</SelectItem>
                                                        <SelectItem value="30">30</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <Button onClick={addBooking} className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700">
                                            Tambah Booking
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Scrollable Timeline */}
                        <div
                            className="flex-1 overflow-x-auto overflow-y-hidden timeline-scroll relative"
                            ref={scrollContainerBawahRef}
                            onScroll={(e) => syncScroll('bawah', e.currentTarget.scrollLeft)}
                            onMouseDownCapture={(e) => handleContainerMouseDown(e)}
                            onTouchStartCapture={(e) => handleContainerMouseDown(e)}
                        >
                            <div className={`relative h-[110px] ${dm.timelineBox} rounded-xl border-2 shadow-md`} style={{ minWidth: `${24 * MINUTES_PER_HOUR * PIXEL_PER_MINUTE}px` }}>
                                {/* Background grid pattern */}
                                <div className={`absolute inset-0 ${dm.gridPattern} pointer-events-none`}>
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:30px_30px]"></div>
                                </div>

                                {/* Time Markers */}
                                <div className="relative h-full pt-6" style={{ width: `${24 * MINUTES_PER_HOUR * PIXEL_PER_MINUTE}px` }}>
                                    {renderTimeMarkers()}

                                    {/* Current Time Line with animation */}
                                    <div
                                        className="absolute top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-500 via-red-500 to-red-300 z-30 shadow-lg pointer-events-none"
                                        style={{ left: `${currentTimePosition}px` }}
                                    >
                                        <div className="absolute -top-3 -left-2.5 w-6 h-6 bg-red-500 rounded-full shadow-lg flex items-center justify-center animate-pulse border-2 border-white">
                                            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                                        </div>

                                    </div>

                                    {/* Booking Blocks */}
                                    <div className="absolute inset-0 pt-7">
                                        {bookings.filter(b => b.studioType === 'bawah').map(renderBookingBlock)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Studio Atas */}
                    <div className="flex flex-col xl:flex-row gap-4">
                        {/* Fixed Studio Header */}
                        <div className="flex-shrink-0 w-full xl:w-64">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg shadow-md">
                                        <Camera className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className={`text-lg font-semibold ${dm.studioTitle}`}>Studio Atas</h2>
                                        <p className={`text-xs ${dm.studioSub}`}>Professional & Product</p>
                                    </div>
                                </div>
                            </div>
                            <Dialog open={isAddDialogOpen && selectedStudio === 'atas'} onOpenChange={(open) => {
                                setIsAddDialogOpen(open);
                                if (open) setSelectedStudio('atas');
                            }}>
                                <DialogTrigger asChild>
                                    <Button
                                        size="sm"
                                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-md"
                                        onClick={() => {
                                            setSelectedStudio('atas');
                                            const recommended = getNextAvailableTime('atas');
                                            setFormData({ ...formData, bookingType: STUDIO_ATAS_TYPES[0], startHour: recommended.hour, startMinute: recommended.minute });
                                        }}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Booking
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <Camera className="w-5 h-5 text-cyan-600" />
                                            Tambah Booking - Studio Atas
                                        </DialogTitle>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div>
                                            <Label htmlFor="name-atas">Nama Customer</Label>
                                            <Input
                                                id="name-atas"
                                                value={formData.customerName}
                                                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                                placeholder="Masukkan nama"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="type-atas">Jenis Booking</Label>
                                            <Select
                                                value={formData.bookingType}
                                                onValueChange={(value) => setFormData({ ...formData, bookingType: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih jenis" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STUDIO_ATAS_TYPES.map(type => (
                                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex-1">
                                                <Label htmlFor="hour-atas">Jam</Label>
                                                <Input
                                                    id="hour-atas"
                                                    type="number"
                                                    min="0"
                                                    max="23"
                                                    value={formData.startHour}
                                                    onChange={(e) => setFormData({ ...formData, startHour: e.target.value.padStart(2, '0') })}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <Label htmlFor="minute-atas">Menit</Label>
                                                <Select
                                                    value={formData.startMinute}
                                                    onValueChange={(value) => setFormData({ ...formData, startMinute: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="00">00</SelectItem>
                                                        <SelectItem value="30">30</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <Button onClick={addBooking} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700">
                                            Tambah Booking
                                        </Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {/* Scrollable Timeline */}
                        <div
                            className="flex-1 overflow-x-auto overflow-y-hidden timeline-scroll relative"
                            ref={scrollContainerAtasRef}
                            onScroll={(e) => syncScroll('atas', e.currentTarget.scrollLeft)}
                            onMouseDownCapture={(e) => handleContainerMouseDown(e)}
                            onTouchStartCapture={(e) => handleContainerMouseDown(e)}
                        >
                            <div className={`relative h-[120px] ${dm.timelineBox} rounded-xl border-2 shadow-md`} style={{ minWidth: `${24 * MINUTES_PER_HOUR * PIXEL_PER_MINUTE}px` }}>
                                {/* Background grid pattern */}
                                <div className={`absolute inset-0 ${dm.gridPattern} pointer-events-none`}>
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:30px_30px]"></div>
                                </div>

                                {/* Time Markers */}
                                <div className="relative h-full pt-6" style={{ width: `${24 * MINUTES_PER_HOUR * PIXEL_PER_MINUTE}px` }}>
                                    {renderTimeMarkers()}

                                    {/* Current Time Line with animation */}
                                    <div
                                        className="absolute top-0 bottom-0 w-[3px] bg-gradient-to-b from-red-500 via-red-500 to-red-300 z-30 shadow-lg pointer-events-none"
                                        style={{ left: `${currentTimePosition}px` }}
                                    >
                                        <div className="absolute -top-3 -left-2.5 w-6 h-6 bg-red-500 rounded-full shadow-lg flex items-center justify-center animate-pulse border-2 border-white">
                                            <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                                        </div>

                                    </div>

                                    {/* Booking Blocks */}
                                    <div className="absolute inset-0 pt-7">
                                        {bookings.filter(b => b.studioType === 'atas').map(renderBookingBlock)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bulk Actions Toolbar */}
            {
                selectedBookingIds.size > 1 && (
                    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-between sm:justify-center gap-2 sm:gap-4 z-50 animate-in slide-in-from-bottom-5 w-[95vw] sm:w-auto bg-gray-900 border border-gray-700 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-xl sm:rounded-full shadow-2xl">
                        <span className="text-xs sm:text-sm font-medium whitespace-nowrap hidden sm:inline-flex items-center">
                            <span className="w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center bg-blue-500 text-white rounded-full mr-1.5 sm:mr-2 text-[10px] sm:text-xs font-bold">
                                {selectedBookingIds.size}
                            </span>
                            Booking Terpilih
                        </span>
                        <span className="text-xs font-medium sm:hidden flex items-center bg-blue-500/20 px-2 py-1 rounded-md text-blue-300">
                            {selectedBookingIds.size} dipilih
                        </span>
                        <div className="h-6 w-px bg-gray-700 hidden sm:block"></div>
                        <div className="flex items-center gap-1 sm:gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-300 hover:text-white hover:bg-gray-800 text-xs sm:text-sm px-2 sm:px-3 h-8 sm:h-9"
                                onClick={() => setSelectedBookingIds(new Set())}
                            >
                                <span className="hidden sm:inline">Batal</span>
                                <span className="sm:hidden"><X className="w-4 h-4" /></span>
                            </Button>
                            <Button
                                size="sm"
                                className="flex items-center gap-1.5 sm:gap-2 bg-red-600 hover:bg-red-700 text-white font-medium border-0 text-xs sm:text-sm px-2 sm:px-3 h-8 sm:h-9"
                                onClick={() => {
                                    if (window.confirm(`Yakin ingin menghapus secara permanen ${selectedBookingIds.size} booking yang dipilih? \n\n(Aksi ini masih bisa di-Undo menggunakan Ctrl+Z)`)) {
                                        setUndoHistory(prev => [...prev.slice(-20), allBookingsRef.current]);
                                        const updated = bookings.filter(b => !selectedBookingIds.has(b.id));
                                        setFilteredBookings(updated);
                                        setSelectedBookingIds(new Set());
                                    }
                                }}
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Hapus Bersamaan</span>
                                <span className="sm:hidden">Hapus</span>
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* Booking Detail Dialog */}
            <Dialog open={!!selectedBooking} onOpenChange={(open) => { if (!open) { setSelectedBooking(null); setTransferMode(false); setTransferPackage(''); } }}>
                <DialogContent className="w-[95vw] max-w-[420px] rounded-xl sm:rounded-2xl p-4 sm:p-6 overflow-y-auto max-h-[90vh]">
                    {selectedBooking && (() => {
                        const pkg = PACKAGE_COLORS[selectedBooking.bookingType] || DEFAULT_PACKAGE_COLOR;
                        const timeStr = `${Math.floor(selectedBooking.startTime / 60).toString().padStart(2, '0')}:${(selectedBooking.startTime % 60).toString().padStart(2, '0')}`;
                        const endTime = selectedBooking.startTime + selectedBooking.duration;
                        const endTimeStr = `${Math.floor(endTime / 60).toString().padStart(2, '0')}:${(endTime % 60).toString().padStart(2, '0')}`;
                        const destStudio = selectedBooking.studioType === 'bawah' ? 'atas' : 'bawah';
                        const destTypes = destStudio === 'bawah' ? STUDIO_BAWAH_TYPES : STUDIO_ATAS_TYPES;
                        return (
                            <>
                                <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                                        <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                                        Detail Booking
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 sm:space-y-4 py-2">
                                    <div className={`bg-gradient-to-br ${pkg.gradient} rounded-lg p-3 sm:p-4 ${pkg.textDark ? 'text-gray-800' : 'text-white'} shadow-md`}>
                                        <p className="text-base sm:text-lg font-bold truncate">{selectedBooking.customerName}</p>
                                        <p className="text-xs sm:text-sm opacity-90 truncate">{selectedBooking.bookingType}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                                            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium mb-0.5 sm:mb-1">Studio</p>
                                            <p className="text-xs sm:text-sm font-semibold text-gray-800">
                                                St. {selectedBooking.studioType === 'bawah' ? 'Bawah' : 'Atas'}
                                            </p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 overflow-hidden">
                                            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium mb-0.5 sm:mb-1">Paket</p>
                                            <p className="text-xs sm:text-sm font-semibold text-gray-800 truncate">{selectedBooking.bookingType}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                                            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium mb-0.5 sm:mb-1">Waktu</p>
                                            <p className="text-xs sm:text-sm font-semibold text-gray-800">{timeStr} - {endTimeStr}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 overflow-hidden">
                                            <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase font-medium mb-0.5 sm:mb-1">Status</p>
                                            <p className={`text-xs sm:text-sm font-semibold truncate ${selectedBooking.noShow ? 'text-red-600' : selectedBooking.arrived ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {selectedBooking.noShow ? '❌ Tidak Datang' : selectedBooking.arrived ? '✅ Datang' : '⏳ Belum Datang'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Button
                                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm h-9 sm:h-10"
                                            onClick={() => {
                                                moveToCurrentTime(selectedBooking.id);
                                            }}
                                        >
                                            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
                                            Mulai Sekarang
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="flex-1 text-xs sm:text-sm h-9 sm:h-10"
                                            onClick={() => { setTransferMode(!transferMode); setTransferPackage(''); }}
                                        >
                                            <ArrowRightLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
                                            Pindah Studio
                                        </Button>
                                    </div>

                                    {/* Transfer Studio Section */}
                                    {transferMode && (
                                        <div className="border-2 border-dashed border-blue-300 rounded-lg p-3 bg-blue-50/50 space-y-3">
                                            <p className="text-sm font-semibold text-blue-700">Pilih paket untuk Studio {destStudio === 'bawah' ? 'Bawah' : 'Atas'}:</p>
                                            <Select value={transferPackage} onValueChange={setTransferPackage}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Pilih paket..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {destTypes.map(type => (
                                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                                                disabled={!transferPackage}
                                                onClick={() => transferStudio(selectedBooking.id, transferPackage)}
                                            >
                                                <ArrowRightLeft className="w-4 h-4 mr-2" />
                                                Konfirmasi Pindah
                                            </Button>
                                        </div>
                                    )}

                                    <Button
                                        className={`w-full ${selectedBooking.noShow ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'} text-white`}
                                        onClick={() => toggleNoShow(selectedBooking.id)}
                                    >
                                        <UserX className="w-4 h-4 mr-2" />
                                        {selectedBooking.noShow ? 'Tandai Hadir' : 'Tandai Tidak Datang'}
                                    </Button>

                                    <Button
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                                        onClick={() => {
                                            deleteBooking(selectedBooking.id);
                                            setSelectedBooking(null);
                                        }}
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Hapus Booking
                                    </Button>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Drop Transfer Dialog */}
            <Dialog open={!!dropTransferData} onOpenChange={(o) => { if (!o) cancelDropTransfer(); }}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                            Pindah Studio
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-gray-700">
                            Anda memindahkan {dropTransferData?.bookingIds.length} booking ke Studio {dropTransferData?.targetStudio === 'bawah' ? 'Bawah' : 'Atas'}. Silakan pilih paket penyesuaian untuk masing-masing:
                        </p>

                        <div className="max-h-[300px] overflow-y-auto pr-2 space-y-3">
                            {dropTransferData?.bookingIds.map(id => {
                                const b = allBookingsRef.current.find(xb => xb.id === id);
                                if (!b) return null;
                                return (
                                    <div key={id} className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                                        <p className="text-xs font-semibold text-gray-800 mb-1">{b.customerName}</p>
                                        <p className="text-[10px] text-gray-500 mb-2">Pindahan dari: {b.bookingType}</p>
                                        <Select
                                            value={dropTransferPackages[id] || ''}
                                            onValueChange={(val) => setDropTransferPackages(prev => ({ ...prev, [id]: val }))}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Pilih Paket Baru..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(dropTransferData?.targetStudio === 'bawah' ? STUDIO_BAWAH_TYPES : STUDIO_ATAS_TYPES).map(type => (
                                                    <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex gap-2 justify-end mt-4 pt-2 border-t border-gray-100">
                            <Button variant="outline" onClick={cancelDropTransfer}>Batal</Button>
                            <Button
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={!dropTransferData || dropTransferData.bookingIds.some(id => !dropTransferPackages[id])}
                                onClick={confirmDropTransfer}
                            >
                                Konfirmasi Semua
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
