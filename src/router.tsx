/* eslint-disable react-refresh/only-export-components -- route table, not a component module */
import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AuthLayout, MainLayout, RequireAdmin, RequireAuth, RootLayout } from './components/layout/Layouts';
import { RouteError } from './pages/NotFound';

// Pages are code-split so the first load only ships what the home page needs.
const Home = lazy(() => import('./pages/Home'));
const Browse = lazy(() => import('./pages/Browse'));
const Genres = lazy(() => import('./pages/Genres'));
const Nollywood = lazy(() => import('./pages/Nollywood'));
const GenrePage = lazy(() => import('./pages/GenrePage'));
const MyList = lazy(() => import('./pages/MyList'));
const SearchPage = lazy(() => import('./pages/Search'));
const TitlePage = lazy(() => import('./pages/TitlePage'));
const PersonPage = lazy(() => import('./pages/PersonPage'));
const Watch = lazy(() => import('./pages/Watch'));
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Profiles = lazy(() => import('./pages/Profiles'));
const Account = lazy(() => import('./pages/Account'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminTitles = lazy(() => import('./pages/admin/AdminTitles'));
const AdminTitleEditor = lazy(() => import('./pages/admin/AdminTitleEditor'));
const AdminImportTitle = lazy(() => import('./pages/admin/AdminImportTitle'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminGenres = lazy(() => import('./pages/admin/AdminGenres'));

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        {
          element: <MainLayout />,
          children: [
            { index: true, element: <Home /> },
            { path: 'movies', element: <Browse type="movie" /> },
            { path: 'series', element: <Browse type="series" /> },
            { path: 'genres', element: <Genres /> },
            { path: 'nollywood', element: <Nollywood /> },
            { path: 'genre/:slug', element: <GenrePage /> },
            { path: 'search', element: <SearchPage /> },
            { path: 'title/:slug', element: <TitlePage /> },
            { path: 'person/:id', element: <PersonPage /> },
            {
              element: <RequireAuth />,
              children: [
                { path: 'my-list', element: <MyList /> },
                { path: 'account', element: <Account /> },
              ],
            },
            { path: '*', element: <NotFound /> },
          ],
        },
        {
          element: <AuthLayout />,
          children: [
            { path: 'login', element: <Login /> },
            { path: 'signup', element: <Signup /> },
            { path: 'forgot-password', element: <ForgotPassword /> },
            { path: 'reset-password', element: <ResetPassword /> },
          ],
        },
        {
          element: <RequireAuth />,
          children: [
            { path: 'profiles', element: <Profiles /> },
            { path: 'watch/:slug', element: <Watch /> },
          ],
        },
        {
          path: 'admin',
          element: <RequireAdmin />,
          children: [
            {
              element: <AdminLayout />,
              children: [
                { index: true, element: <AdminDashboard /> },
                { path: 'titles', element: <AdminTitles /> },
                { path: 'titles/new', element: <AdminImportTitle /> },
                { path: 'titles/:id', element: <AdminTitleEditor /> },
                { path: 'users', element: <AdminUsers /> },
                { path: 'genres', element: <AdminGenres /> },
              ],
            },
          ],
        },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true } }
);
