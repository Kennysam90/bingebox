import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { MotionConfig } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from './lib/api';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      // Don't hammer the API for errors that won't fix themselves.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>
);
