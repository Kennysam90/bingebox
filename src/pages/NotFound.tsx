import { Home } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { Logo } from '../components/ui/Logo';

export default function NotFound({ message }: { message?: string }) {
  return (
    <div className="page-x grid min-h-[80vh] place-items-center pt-[var(--nav-h)] text-center">
      <div className="max-w-md">
        <p className="font-display text-[7rem] font-extrabold leading-none tracking-tighter text-white/10 sm:text-[9rem]">404</p>
        <h1 className="-mt-6 font-display text-3xl font-bold">Lost in the archive</h1>
        <p className="mt-3 text-ink-300">{message ?? 'This page took a wrong turn somewhere between reels. Let’s get you back to the good stuff.'}</p>
        <Link to="/" className="btn btn-primary btn-md mt-8">
          <Home size={17} /> Back to BingeBox
        </Link>
      </div>
    </div>
  );
}

/** Last-resort boundary for errors thrown while rendering a route. */
export function RouteError() {
  const err = useRouteError();
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-6 text-center text-white">
      <div className="max-w-md">
        <Logo className="text-xl" />
        <h1 className="mt-8 font-display text-2xl font-bold">{notFound ? 'Page not found' : 'Something went wrong'}</h1>
        <p className="mt-3 text-sm text-ink-300">{notFound ? 'We couldn’t find that page.' : 'An unexpected error interrupted playback of this page. Reloading usually fixes it.'}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="btn btn-primary btn-md">
            Reload
          </button>
          <a href="/" className="btn btn-glass btn-md">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
