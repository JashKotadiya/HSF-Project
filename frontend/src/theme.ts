"use client";

import { createTheme } from "@mui/material/styles";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/** MUI theme for volunteer “discover” flows (merged from ABC), aligned with HSF palette. */
export const theme = createTheme({
  typography: {
    fontFamily: inter.style.fontFamily,
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  palette: {
    mode: "light",
    primary: {
      main: "#114160",
      light: "#1a5a7a",
      dark: "#092130",
    },
    secondary: {
      main: "#4A0E99",
      light: "#6b21c9",
      dark: "#32076b",
    },
    background: {
      default: "#F8FAFC",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#0F172A",
      secondary: "#475569",
    },
    success: { main: "#10B981", light: "#D1FAE5" },
    warning: { main: "#F59E0B", light: "#FEF3C7" },
    error: { main: "#EF4444", light: "#FEE2E2" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "none",
          "&:hover": {
            boxShadow:
              "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
          border: "1px solid #E2E8F0",
        },
      },
    },
  },
});
