import { Suspense } from 'react';
import { Link, Navigate, Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../hooks/useAuth';
import { ToastProvider } from '../../hooks/useToast';
import { HoverPreviewProvider } from '../cards/HoverPreview';
import { Logo } from '../ui/Logo';
import { FullPageLoader } from '../ui/States';
import { ApiKeyNotice } from './ApiKeyNotice';
import { Footer } from './Footer';
import { MobileTabBar } from './MobileTabBar';
import { Navbar } from './Navbar';

/** Providers that need the router (navigation inside toasts, hover previews, auth redirects). */
export function RootLayout() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollRestoration getKey={(location) => location.pathname} />
        <ApiKeyNotice />
        <Suspense fallback={<FullPageLoader />}>
          <Outlet />
        </Suspense>
      </ToastProvider>
    </AuthProvider>
  );
}

/** Pages fade and rise in on navigation for a smooth, app-like feel. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      {children}
    </div>
  );
}

export function MainLayout() {
  return (
    <HoverPreviewProvider>
      <div className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink-950">
          Skip to content
        </a>
        <Navbar />
        <main id="main" className="min-h-[70vh]">
          <Suspense fallback={<FullPageLoader />}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Suspense>
        </main>
        <Footer />
        <MobileTabBar />
      </div>
    </HoverPreviewProvider>
  );
}

/** Sign-in pages: a cinematic collage background with a centred card. */
export function AuthLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_80%_0%,rgba(255,45,70,0.22),transparent_60%),radial-gradient(60%_50%_at_0%_100%,rgba(255,106,61,0.12),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,#fff 0 1px,transparent 1px 64px)' }} />
      </div>
      <header className="page-x relative z-10 flex h-[var(--nav-h)] items-center">
        <Link to="/" className="text-lg" aria-label="BingeBox home">
          <Logo />
        </Link>
      </header>
      <main className="relative z-10 flex min-h-[calc(100vh-var(--nav-h))] items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <Suspense fallback={<FullPageLoader />}>
          <PageTransition>
            <Outlet />
          </PageTransition>
        </Suspense>
      </main>
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
