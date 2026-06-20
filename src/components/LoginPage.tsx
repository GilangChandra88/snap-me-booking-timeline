import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Camera, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export function LoginPage() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getFriendlyError = (code: string) => {
        const map: Record<string, string> = {
            'auth/invalid-credential':     'Email atau password salah.',
            'auth/user-not-found':         'Akun tidak ditemukan.',
            'auth/wrong-password':         'Password salah.',
            'auth/invalid-email':          'Format email tidak valid.',
            'auth/user-disabled':          'Akun ini telah dinonaktifkan.',
            'auth/too-many-requests':      'Terlalu banyak percobaan. Coba lagi nanti.',
            'auth/network-request-failed': 'Gagal terhubung ke server. Periksa koneksi internet.',
        };
        return map[code] ?? 'Terjadi kesalahan. Silakan coba lagi.';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !password) return;
        setError(null);
        setLoading(true);
        try {
            await signIn(email.trim(), password);
        } catch (err: unknown) {
            const code = (err as { code?: string })?.code ?? '';
            setError(getFriendlyError(code));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 relative overflow-hidden">
            {/* Animated background blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-sky-200/50 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-blue-200/50 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-violet-200/30 rounded-full blur-[100px]" />
                {/* Grid overlay */}
                <div
                    className="absolute inset-0 opacity-[0.4]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
                        backgroundSize: '60px 60px',
                    }}
                />
            </div>

            {/* Card */}
            <div className="relative w-full max-w-md mx-4">
                {/* Glow border effect */}
                <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-sky-200 via-transparent to-blue-200 blur-sm" />
                <div className="relative bg-white/80 backdrop-blur-2xl rounded-2xl border border-gray-100 shadow-xl p-8">

                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-500/30 mb-4">
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Snap Me Studio</h1>
                        <p className="text-gray-500 text-sm mt-1">Masuk ke dashboard manajemen</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-sky-500 transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="nama@email.com"
                                    required
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all shadow-sm"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-sky-500 transition-colors" />
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-11 py-3 text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all shadow-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(v => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 relative overflow-hidden bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:from-sky-400 disabled:to-blue-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Masuk...
                                </span>
                            ) : (
                                'Masuk'
                            )}
                        </button>
                    </form>

                    {/* Footer note */}
                    <p className="text-center text-xs text-gray-500 mt-6">
                        Hanya akun yang sudah terdaftar yang bisa masuk.<br />
                        Hubungi owner untuk mendapatkan akses.
                    </p>
                </div>

                {/* Version badge */}
                <p className="text-center text-xs text-gray-400 mt-4">Snap Me Booking System v2.0</p>
            </div>
        </div>
    );
}
