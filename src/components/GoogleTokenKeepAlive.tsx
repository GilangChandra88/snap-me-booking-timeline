/**
 * GoogleTokenKeepAlive.tsx
 *
 * Komponen headless yang selalu render di App.tsx untuk:
 * 1. Auto-refresh Google token setiap 55 menit (silent) → efek login 6 jam
 * 2. Menampilkan peringatan saat token hampir habis
 * 3. Menghapus token setelah 6 jam jika silent refresh gagal
 */

import { useEffect, useRef, useState } from 'react';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AppSettings } from './SettingsPage';

// ── Token refresh interval (55 menit dalam ms) ──
const REFRESH_INTERVAL_MS = 55 * 60 * 1000;
// ── Maksimal usia token sebelum paksa logout (6 jam) ──
const MAX_TOKEN_AGE_MS = 6 * 60 * 60 * 1000;

function KeepAliveInner() {
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loginSilent = useGoogleLogin({
    onSuccess: (res) => {
      sessionStorage.setItem('googleToken', res.access_token);
      sessionStorage.setItem('googleTokenTime', String(Date.now()));
      console.log('🔑 Google token auto-refreshed (silent)');
      // Jadwalkan refresh berikutnya
      scheduleRefresh();
    },
    onError: () => {
      console.warn('Silent Google token refresh failed — token akan expire');
      // Jika gagal, cek apakah token sudah > 6 jam; jika ya, hapus
      const tokenTime = Number(sessionStorage.getItem('googleTokenTime') || '0');
      if (Date.now() - tokenTime >= MAX_TOKEN_AGE_MS) {
        sessionStorage.removeItem('googleToken');
        sessionStorage.removeItem('googleTokenTime');
        toast.warning('⚠️ Sesi Google Drive berakhir', {
          description: 'Silakan login ulang ke Google Drive',
          duration: 10000,
        });
      }
    },
    scope: 'https://www.googleapis.com/auth/drive',
    prompt: 'none', // silent — tidak tampilkan popup
  });

  const scheduleRefresh = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      const token = sessionStorage.getItem('googleToken');
      if (token) {
        console.log('🔄 Mencoba silent refresh Google token...');
        try { loginSilent(); } catch { /* ignore */ }
      }
    }, REFRESH_INTERVAL_MS);
  };

  useEffect(() => {
    // Saat mount, cek apakah ada token dan jadwalkan refresh
    const token = sessionStorage.getItem('googleToken');
    const tokenTime = Number(sessionStorage.getItem('googleTokenTime') || '0');

    if (token && tokenTime) {
      const age = Date.now() - tokenTime;
      if (age >= MAX_TOKEN_AGE_MS) {
        // Token sudah > 6 jam, hapus
        sessionStorage.removeItem('googleToken');
        sessionStorage.removeItem('googleTokenTime');
        toast.warning('⚠️ Sesi Google Drive berakhir', {
          description: 'Silakan login ulang ke Google Drive',
        });
      } else {
        // Jadwalkan refresh di sisa waktu 55 menit pertama
        const remainingBeforeRefresh = Math.max(0, REFRESH_INTERVAL_MS - age);
        refreshTimerRef.current = setTimeout(() => {
          try { loginSilent(); } catch { /* ignore */ }
        }, remainingBeforeRefresh);
      }
    }

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function GoogleTokenKeepAlive() {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'appSettings'), (snap) => {
      const data = snap.data() as AppSettings | undefined;
      setClientId(data?.googleClientId?.trim() || null);
    });
    return () => unsub();
  }, []);

  if (!clientId) return null;

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <KeepAliveInner />
    </GoogleOAuthProvider>
  );
}
