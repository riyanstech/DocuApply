/* =====================================================
   DocuApply — Auth (Login Admin/User)
   ===================================================== */
window.DA = window.DA || {};

DA.auth = (function () {
  const { storage } = DA;
  const ROLE_KEY = 'role';
  const PASS_KEY = 'adminPasswordHash';
  const DEFAULT_PASS = 'admin123';

  /* ---------- Hash password (SHA-256) ---------- */
  async function hashPassword(pwd) {
    if (window.crypto?.subtle) {
      const buf = new TextEncoder().encode(pwd + '::docuapply');
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // Fallback: base64 (kurang aman, cuma kalau crypto tidak tersedia)
    return btoa(pwd + '::docuapply');
  }

  async function ensureDefaultPassword() {
    const existing = storage.get(PASS_KEY);
    if (!existing) {
      storage.set(PASS_KEY, await hashPassword(DEFAULT_PASS));
    }
  }

  async function verifyPassword(pwd) {
    const saved = storage.get(PASS_KEY);
    if (!saved) {
      await ensureDefaultPassword();
      return pwd === DEFAULT_PASS;
    }
    return (await hashPassword(pwd)) === saved;
  }

  async function changePassword(oldPwd, newPwd) {
    if (!(await verifyPassword(oldPwd))) {
      return { ok: false, msg: 'Password lama salah' };
    }
    if (!newPwd || newPwd.length < 4) {
      return { ok: false, msg: 'Password baru minimal 4 karakter' };
    }
    storage.set(PASS_KEY, await hashPassword(newPwd));
    return { ok: true };
  }

  /* ---------- Role ---------- */
  function getRole() {
    return storage.get(ROLE_KEY, null);
  }
  function setRole(role) {
    storage.set(ROLE_KEY, role);
  }
  function isAdmin() {
    return getRole() === 'admin';
  }
  function isUser() {
    return getRole() === 'user';
  }
  function logout() {
    storage.remove(ROLE_KEY);
    location.reload();
  }

  /* ---------- Show login screen ---------- */
  function showLoginScreen() {
    const screen = document.getElementById('loginScreen');
    if (screen) screen.classList.remove('hidden');

    const appContent = document.getElementById('appContent');
    if (appContent) appContent.classList.add('hidden');
  }

  function hideLoginScreen() {
    const screen = document.getElementById('loginScreen');
    if (screen) screen.classList.add('hidden');

    const appContent = document.getElementById('appContent');
    if (appContent) appContent.classList.remove('hidden');
  }

  /* ---------- Login handlers ---------- */
  function loginAsUser() {
    setRole('user');
    hideLoginScreen();
    updateRoleBadge();
    DA.toast.success('Selamat datang! 👋', 2000);
  }

  async function loginAsAdmin(pwd) {
    if (!pwd) {
      DA.toast.warn('Masukkan password admin');
      return false;
    }
    if (await verifyPassword(pwd)) {
      setRole('admin');
      hideLoginScreen();
      updateRoleBadge();
      DA.toast.success('Login admin berhasil! 🔓', 2000);
      if (DA.admin) DA.admin.open();
      return true;
    }
    DA.toast.error('Password salah');
    return false;
  }

  /* ---------- Badge di header ---------- */
  function updateRoleBadge() {
    const badge = document.getElementById('roleBadge');
    if (!badge) return;
    const role = getRole();
    if (role === 'admin') {
      badge.innerHTML = `
        <button id="openDashboardBtn" class="role-badge role-badge-admin" title="Buka Dashboard Admin">
          <i class="fa-solid fa-shield-halved"></i>
          <span>Admin</span>
        </button>
        <button id="logoutBtn" class="role-badge role-badge-logout" title="Logout">
          <i class="fa-solid fa-right-from-bracket"></i>
        </button>`;
      document.getElementById('openDashboardBtn')?.addEventListener('click', () => {
        if (DA.admin) DA.admin.open();
      });
      document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Keluar dari sesi?')) logout();
      });
    } else if (role === 'user') {
      badge.innerHTML = `
        <button id="logoutBtn" class="role-badge role-badge-user" title="Keluar">
          <i class="fa-solid fa-user"></i>
          <span>Keluar</span>
        </button>`;
      document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if (confirm('Keluar dari sesi?')) logout();
      });
    } else {
      badge.innerHTML = '';
    }
  }

  /* ---------- Init ---------- */
  async function init() {
    await ensureDefaultPassword();

    // Bind login buttons
    const btnUser = document.getElementById('loginUserBtn');
    const btnAdmin = document.getElementById('loginAdminBtn');
    const adminForm = document.getElementById('adminPasswordForm');
    const adminInput = document.getElementById('adminPasswordInput');
    const adminSubmit = document.getElementById('adminSubmitBtn');
    const adminBack = document.getElementById('adminBackBtn');

    btnUser?.addEventListener('click', loginAsUser);
    btnAdmin?.addEventListener('click', () => {
      adminForm?.classList.remove('hidden');
      btnUser?.closest('.login-options')?.classList.add('hidden');
      setTimeout(() => adminInput?.focus(), 100);
    });

    adminBack?.addEventListener('click', () => {
      adminForm?.classList.add('hidden');
      btnUser?.closest('.login-options')?.classList.remove('hidden');
      if (adminInput) adminInput.value = '';
    });

    const submit = async () => {
      const pwd = adminInput?.value || '';
      const ok = await loginAsAdmin(pwd);
      if (!ok && adminInput) {
        adminInput.value = '';
        adminInput.focus();
      }
    };

    adminSubmit?.addEventListener('click', submit);
    adminInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    // Cek sesi
    const role = getRole();
    if (role === 'admin' || role === 'user') {
      hideLoginScreen();
      updateRoleBadge();
    } else {
      showLoginScreen();
    }
  }

  return {
    init,
    isAdmin,
    isUser,
    getRole,
    setRole,
    logout,
    changePassword,
    updateRoleBadge,
  };
})();