import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { router } from './app/router';
import { AuthProvider } from './features/auth/authStore';
import { PremiumAmbientLayer } from './components/PremiumAmbientLayer';
import './styles/globals.css';
import './styles/premium-patch.css';
import './styles/premium-patch-2.css';
import './styles/premium-patch-3.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <PremiumAmbientLayer />
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
