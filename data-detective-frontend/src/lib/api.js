import axios from "axios";

// NOTE: storing the JWT in localStorage is convenient for a portfolio project,
// but it's readable by any JS on the page (XSS risk). In a production system
// you'd want an httpOnly cookie instead, issued by the backend. Worth
// mentioning if this comes up in an interview — it's a deliberate tradeoff
// for now, not an oversight.
const TOKEN_KEY = "data_detective_token";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  isLoggedIn: () => !!localStorage.getItem(TOKEN_KEY),
};

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

client.interceptors.request.use((config) => {
  const token = auth.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      auth.clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export const api = {
  register: (email, password, full_name) =>
    client.post("/auth/register", { email, password, full_name }),

  login: async (email, password) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    const res = await client.post("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    auth.setToken(res.data.access_token);
    return res.data;
  },

  me: () => client.get("/auth/me"),

  listDatasets: () => client.get("/datasets"),

  uploadDataset: (file) => {
    const form = new FormData();
    form.append("file", file);
    return client.post("/datasets/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  getProfile: (id) => client.get(`/datasets/${id}/profile`),
  cleanDataset: (id) => client.post(`/datasets/${id}/clean`),
  getEda: (id) => client.get(`/datasets/${id}/eda`),
  getKpis: (id) => client.get(`/datasets/${id}/kpis`),
  getAnomalies: (id) => client.get(`/datasets/${id}/anomalies`),
  getRootCauses: (id) => client.get(`/datasets/${id}/root-causes`),
  getPredictions: (id) => client.get(`/datasets/${id}/predictions`),

  downloadReport: async (id, filename) => {
    const res = await client.post(`/datasets/${id}/report`, null, {
      responseType: "blob",
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename || "report.pdf");
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};

export default client;
