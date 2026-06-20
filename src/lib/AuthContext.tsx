import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    type User,
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    getDocs,
    collection,
    serverTimestamp,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserRole = 'owner' | 'admin' | 'staff';

export type UserProfile = {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    salary?: number;       // Gaji bulanan (untuk analisis)
    isActive: boolean;
    createdAt: string;
    createdBy?: string;    // uid owner yang buat akun ini
};

export type WorkSchedule = {
    id: string;
    staffUid: string;
    staffName: string;
    date: string;          // YYYY-MM-DD
    shiftStart: string;    // HH:MM
    shiftEnd: string;      // HH:MM
    note?: string;
};

export type AttendanceRecord = {
    id: string;
    staffUid: string;
    staffName: string;
    date: string;          // YYYY-MM-DD
    checkInTime: number;   // unix timestamp ms
    checkOutTime: number | null; // unix timestamp ms, null jika belum checkout
    totalMinutes: number;  // terisi saat checkout
};

export type OperationalBill = {
    id: string;
    name: string;
    amount: number;
    month: string;         // YYYY-MM
    category: string;
    note?: string;
    createdAt: string;
};

// ─── Context ──────────────────────────────────────────────────────────────────
type AuthContextValue = {
    user: User | null;
    profile: UserProfile | null;
    role: UserRole | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Role Access Map ──────────────────────────────────────────────────────────
export const ROLE_PAGES: Record<UserRole, string[]> = {
    owner:  ['timeline', 'dashboard', 'timer', 'kasir', 'setting', 'print', 'template_maker', 'analisis', 'karyawan'],
    admin:  ['timeline', 'dashboard', 'setting', 'template_maker'],
    staff:  ['timeline', 'timer', 'kasir', 'print'],
};

export function canAccess(role: UserRole | null, page: string): boolean {
    if (!role) return false;
    return ROLE_PAGES[role].includes(page);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setUser(null);
                setProfile(null);
                setLoading(false);
                return;
            }

            setUser(firebaseUser);

            // Fetch user profile from Firestore
            const profileRef = doc(db, 'users', firebaseUser.uid);
            const profileSnap = await getDoc(profileRef);

            if (profileSnap.exists()) {
                setProfile(profileSnap.data() as UserProfile);
            } else {
                // New user — check if this is the very first user (becomes owner)
                const usersSnap = await getDocs(collection(db, 'users'));
                const isFirstUser = usersSnap.empty;

                const newProfile: UserProfile = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email ?? '',
                    displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    role: isFirstUser ? 'owner' : 'staff',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                };

                await setDoc(profileRef, { ...newProfile, createdAt: serverTimestamp() });
                setProfile(newProfile);
            }

            setLoading(false);
        });

        return () => unsub();
    }, []);

    const signIn = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err: any) {
            // Jika ini adalah login pertama kali di aplikasi (database kosong),
            // otomatis buatkan akun sebagai owner.
            const usersSnap = await getDocs(collection(db, 'users'));
            if (usersSnap.empty && (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found')) {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                throw err;
            }
        }
    };

    const signOut = async () => {
        await firebaseSignOut(auth);
        setUser(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{ user, profile, role: profile?.role ?? null, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
