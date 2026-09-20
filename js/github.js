/* =====================================================
   DocuApply — GitHub API Integration
   Manage files & data via GitHub Repository
   ===================================================== */
window.DA = window.DA || {};

DA.github = (function () {
  'use strict';

  const CONFIG_KEY = 'github:config';
  const API = 'https://api.github.com';

  /* ============================================
     CONFIG
     ============================================ */
  function getConfig() {
    return DA.storage.get(CONFIG_KEY, null);
  }

  function setConfig(cfg) {
    DA.storage.set(CONFIG_KEY, cfg);
  }

  function clearConfig() {
    DA.storage.remove(CONFIG_KEY);
  }

  function isConfigured() {
    const c = getConfig();
    return !!(c && c.owner && c.repo && c.token && c.branch);
  }

  /* ============================================
     HEADERS
     ============================================ */
  function headers() {
    const c = getConfig();
    return {
      'Authorization': `Bearer ${c.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /* ============================================
     TEST CONNECTION
     ============================================ */
  async function testConnection() {
    if (!isConfigured()) return { ok: false, msg: 'Konfigurasi belum lengkap' };
    try {
      const c = getConfig();
      const res = await fetch(`${API}/repos/${c.owner}/${c.repo}`, {
        headers: headers(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, msg: err.message || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, msg: `Terhubung ke ${data.full_name}`, data };
    } catch (err) {
      return { ok: false, msg: err.message || 'Gagal koneksi' };
    }
  }

  /* ============================================
     GET FILE SHA (untuk update)
     ============================================ */
  async function getFileSha(path) {
    try {
      const c = getConfig();
      const res = await fetch(
        `${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(path)}?ref=${c.branch}&t=${Date.now()}`,
        { headers: headers() }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data.sha || null;
    } catch {
      return null;
    }
  }

  /* ============================================
     GET RAW FILE (dari GitHub)
     ============================================ */
  async function getRawFile(path) {
    try {
      const c = getConfig();
      const url = `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${path}?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  /* ============================================
     GET FILE (base64 content, untuk read dari API)
     ============================================ */
  async function getFileContent(path) {
    try {
      const c = getConfig();
      const res = await fetch(
        `${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(path)}?ref=${c.branch}&t=${Date.now()}`,
        { headers: headers() }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.content) return null;
      // GitHub return base64 with newlines
      return decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
    } catch {
      return null;
    }
  }

  /* ============================================
     UPLOAD / UPDATE FILE (PUT to GitHub)
     ============================================ */
  async function uploadFile(path, content, message, isBase64 = false) {
    if (!isConfigured()) {
      throw new Error('GitHub belum dikonfigurasi. Buka Pengaturan.');
    }
    const c = getConfig();

    // Get existing SHA kalau file sudah ada (untuk update)
    const sha = await getFileSha(path);

    // Content: kalau bukan base64 (text), encode ke base64 dulu
    const base64Content = isBase64 ? content : btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: message || `Update ${path}`,
      content: base64Content,
      branch: c.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(
      `${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(path)}`,
      {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    return await res.json();
  }

  /* ============================================
     UPLOAD BINARY FILE (.docx, image, dll)
     ============================================ */
  async function uploadBinaryFile(path, file, message) {
    if (!isConfigured()) {
      throw new Error('GitHub belum dikonfigurasi.');
    }

    // Konversi File → base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const b64 = dataUrl.split(',')[1];
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return uploadFile(path, base64, message || `Upload ${path}`, true);
  }

  /* ============================================
     DELETE FILE
     ============================================ */
  async function deleteFile(path, message) {
    if (!isConfigured()) throw new Error('GitHub belum dikonfigurasi.');
    const c = getConfig();
    const sha = await getFileSha(path);
    if (!sha) throw new Error('File tidak ditemukan');

    const res = await fetch(
      `${API}/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({
          message: message || `Delete ${path}`,
          sha,
          branch: c.branch,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return await res.json();
  }

  /* ============================================
     LIST FILES IN FOLDER
     ============================================ */
  async function listFiles(folderPath) {
    try {
      const c = getConfig();
      const res = await fetch(
        `${API}/repos/${c.owner}/${c.repo}/contents/${folderPath}?ref=${c.branch}&t=${Date.now()}`,
        { headers: headers() }
      );
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
      }));
    } catch {
      return [];
    }
  }

  return {
    isConfigured,
    getConfig,
    setConfig,
    clearConfig,
    testConnection,
    uploadFile,
    uploadBinaryFile,
    deleteFile,
    getRawFile,
    getFileContent,
    getFileSha,
    listFiles,
  };
})();
