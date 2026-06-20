import { useEffect, useState, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import type { Booking } from './TimelineStudio';
import type { AppSettings } from './SettingsPage';
import { createLocalFolders } from '../lib/localFolderApi';

const getLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};



export function GlobalDriveService() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Lock to prevent concurrent runs of checkAndCreateFolders
  const isProcessing = useRef(false);
  // Track booking IDs currently being processed (before Firestore is updated)
  const pendingIds = useRef(new Set<string>());

  // Sync settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (snap) => {
      setAppSettings(snap.data() as AppSettings);
    });
    return () => unsub();
  }, []);

  // Sync bookings
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), (snap) => {
      const list: Booking[] = [];
      snap.forEach((d) => list.push(d.data() as Booking));
      setBookings(list);
    });
    return () => unsub();
  }, []);

  // Background monitor evaluating bookings every 30 seconds
  useEffect(() => {
    const checkAndCreateFolders = async () => {
      // Prevent concurrent execution
      if (isProcessing.current) return;
      isProcessing.current = true;

      try {
        const googleToken = sessionStorage.getItem('googleToken');
        const masterFolderId = appSettings?.googleDriveFolderId?.trim();
        
        if (!googleToken || !masterFolderId) return;

        const now = new Date();
        const todayStr = getLocalYMD(now);

        // Buat folder segera saat booking DIMULAI (arrived=true) dan belum punya folder
        const targets = bookings.filter(b =>
          b.arrived &&           // sudah klik "Mulai Sekarang"
          !b.driveLink &&        // belum punya folder Drive
          !b.invoiceId &&        // belum di-invoice
          !pendingIds.current.has(b.id)
        );

        if (targets.length === 0) return;

        // Prevent processing the same group multiple times in a single loop
        const processedGroupIds = new Set<string>();

        // Create folders for them sequentially to avoid rate limits
        for (const b of targets) {
          if (b.groupId && processedGroupIds.has(b.groupId)) continue;

          // Mark this booking (and group members) as pending
          pendingIds.current.add(b.id);
          if (b.groupId) {
            bookings.filter(o => o.groupId === b.groupId).forEach(o => pendingIds.current.add(o.id));
          }

          try {
            if (b.groupId) {
               // Check if another booking in the same group already has a drive folder
               const groupMemberWithFolder = bookings.find(other => other.groupId === b.groupId && other.driveLink && other.driveFolderId);
               
               if (groupMemberWithFolder) {
                   const batch = writeBatch(db);
                   batch.update(doc(db, 'bookings', b.id), {
                       driveLink: groupMemberWithFolder.driveLink,
                       driveFolderId: groupMemberWithFolder.driveFolderId
                   });
                   await batch.commit();
                   console.log(`Auto-copied folder from group for ${b.customerName}`);
                   toast.success(`📁 Folder di-link dari grup`, {
                     description: `${b.customerName} — folder sudah terhubung dari grup booking`,
                   });
                   continue;
               }
            }

            const folderName = `${b.customerName} - ${b.date || todayStr}`;
            const metadata = {
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [masterFolderId]
            };

            const response = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${googleToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(metadata)
            });

            if (!response.ok) {
              console.error(`Failed to create auto folder for booking ${b.id}`);
              // Remove from pending so it can be retried
              pendingIds.current.delete(b.id);
              if (response.status === 401) {
                sessionStorage.removeItem('googleToken'); // Token expired
                toast.warning('⚠️ Google token expired', {
                  description: 'Silakan login ulang ke Google Drive di halaman Settings',
                });
                break; 
              }
              toast.error(`❌ Gagal buat folder`, {
                description: `Booking ${b.customerName} — error ${response.status}`,
              });
              continue; // Skip onto the next one
            }

            const data = await response.json();
            const folderId = data.id;

            // Note: we can also request webViewLink simultaneously to save API calls
            const linkResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${googleToken}`,
              }
            });
            const linkData = await linkResponse.json();

            if (linkData.webViewLink) {
               // Save to firestore
               const batch = writeBatch(db);
               
               if (b.groupId) {
                   // Update ALL bookings with this group ID that are in the system and lack a drive link
                   const groupMembers = bookings.filter(other => other.groupId === b.groupId && !other.driveLink);
                   groupMembers.forEach(member => {
                       batch.update(doc(db, 'bookings', member.id), {
                           driveLink: linkData.webViewLink,
                           driveFolderId: folderId
                       });
                   });
                   processedGroupIds.add(b.groupId);
               } else {
                   batch.update(doc(db, 'bookings', b.id), { 
                       driveLink: linkData.webViewLink,
                       driveFolderId: folderId
                   });
               }
               
               await batch.commit();
               console.log(`Auto-created folder for ${b.customerName}`);
               toast.success(`✅ Folder Drive dibuat`, {
                 description: `${b.customerName} — ${b.date || todayStr}`,
               });

               // === BUAT FOLDER LOKAL DI 2 LOKASI (via server lokal) ===
               const localBases = [
                 appSettings?.localPhotoFolder?.trim(),
                 appSettings?.localPhotoFolder2?.trim(),
               ].filter(Boolean) as string[];

               if (localBases.length > 0) {
                 createLocalFolders(localBases, folderName)
                   .then(results => {
                     results.forEach(r => {
                       if (r.status === 'created') {
                         toast.success(`📁 Folder lokal dibuat`, { description: r.path });
                       } else if (r.status === 'error') {
                         toast.warning(`⚠️ Gagal buat folder lokal`, { description: r.message });
                       }
                     });
                   })
                   .catch(() => {
                     // Server lokal tidak aktif — jangan ganggu flow utama
                     console.warn('Server lokal tidak tersedia, folder lokal tidak dibuat.');
                   });
               }
            }

          } catch (e) {
            // Remove from pending on error so it can be retried
            pendingIds.current.delete(b.id);
            console.error("Error auto-creating folder:", e);
            toast.error(`❌ Error buat folder`, {
              description: `${b.customerName} — ${e instanceof Error ? e.message : 'Unknown error'}`,
            });
          }
        }
      } finally {
        isProcessing.current = false;
        // Clean up pendingIds for bookings that now have driveLink
        bookings.forEach(b => {
          if (b.driveLink) pendingIds.current.delete(b.id);
        });
      }
    };

    const interval = setInterval(checkAndCreateFolders, 30_000); // Check every 30 secs
    checkAndCreateFolders(); // Also check on mount
    return () => clearInterval(interval);

  }, [bookings, appSettings]);

  return null; // This is a headless component
}
