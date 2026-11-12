// js/supabase.js
const DEFAULT_SB_URL = "https://etjdsxqodvfozjkshzxp.supabase.co";
const DEFAULT_SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0amRzeHFvZHZmb3pqa3NoenhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzODcyMTUsImV4cCI6MjEwOTk2MzIxNX0.w2Jn2UnCtJhlvBg0cAkvjJ7qTjDhryDcEn5X0tqEjjA";

export const sb = window.supabase.createClient(DEFAULT_SB_URL, DEFAULT_SB_KEY);

export function toast(msg) {
  const el = document.getElementById("toastBanner");
  document.getElementById("toastText").textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}
