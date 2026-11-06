// One place for the backend address.
// Set VITE_API_URL in Vercel to change it; otherwise the Custom Holidays Render backend is used.
export const API_ROOT =
  (((import.meta.env.VITE_API_URL as string) || "https://custom-holidays.onrender.com").replace(/\/+$/, "")) + "/api";
