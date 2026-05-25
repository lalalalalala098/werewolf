const API_BASE = "/api";

export interface UserProfile {
  user_id: string;
  userId?: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

// Configured authorization headers
const getAuthHeaders = () => {
  const token = localStorage.getItem("wolfy_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const api = {
  // Authentication
  register: async (username: string, email: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mendaftar");
    return data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Email atau password salah");
    return data;
  },

  getProfile: async (): Promise<{ user: UserProfile }> => {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: "GET",
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memverifikasi sesi");
    return data;
  },

  // Game Room Actions
  createRoom: async (avatarId: string): Promise<{ roomId: string }> => {
    const res = await fetch(`${API_BASE}/game/create`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ avatarId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal membuat ruang");
    return data;
  },

  joinRoom: async (roomId: string, avatarId: string): Promise<{ success: boolean; roomId: string }> => {
    const res = await fetch(`${API_BASE}/game/join`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId, avatarId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal masuk ruang");
    return data;
  },

  startGame: async (roomId: string, isSolo: boolean): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/start`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId, isSolo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memulai game");
    return data;
  },

  revealConfirm: async (roomId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/reveal-confirm`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengonfirmasi peran");
    return data;
  },

  submitNightAction: async (roomId: string, targetPlayerId: string): Promise<{ success: boolean; insight?: string | null; has_acted: boolean }> => {
    const res = await fetch(`${API_BASE}/game/action`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId, targetPlayerId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengeksekusi aksi malam");
    return data;
  },

  resolveNight: async (roomId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/resolve`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memproses malam");
    return data;
  },

  confirmMorning: async (roomId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/morning-confirm`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal melewati fajar");
    return data;
  },

  submitVote: async (roomId: string, targetPlayerId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/vote`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId, targetPlayerId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengirim vote");
    return data;
  },

  resolveVoting: async (roomId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/resolve-voting`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menghitung hasil voting");
    return data;
  },

  restartGame: async (roomId: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/restart`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memulai ulang");
    return data;
  },

  sendChatMessage: async (roomId: string, text: string): Promise<{ success: boolean }> => {
    const res = await fetch(`${API_BASE}/game/chat`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ roomId, text })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengirim pesan chat");
    return data;
  }
};
