'use client';
import { createTheme } from '@mui/material/styles';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const theme = createTheme({
  typography: {
    fontFamily: inter.style.fontFamily,
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h6: {
      fontWeight: 600,
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  palette: {
    mode: 'light',
    primary: {
      main: '#2563EB', // Vibrant Blue
      light: '#3B82F6',
      dark: '#1D4ED8',
    },
    secondary: {
      main: '#F97316', // Vibrant Orange (Catchafire style accent)
      light: '#FB923C',
      dark: '#EA580C',
    },
    background: {
      default: '#F8FAFC', // Slate 50
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
    },
    success: {
      main: '#10B981', // Emerald 500
      light: '#D1FAE5',
    },
    warning: {
      main: '#F59E0B', // Amber 500
      light: '#FEF3C7',
    },
    error: {
      main: '#EF4444', // Red 500
      light: '#FEE2E2',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(to right, #2563EB, #3B82F6)',
        }
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
          border: '1px solid #E2E8F0',
        },
      },
    },
  },
});
