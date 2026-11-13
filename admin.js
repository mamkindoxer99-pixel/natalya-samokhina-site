(() => {
  const ADMIN_UID = 'cd6c9da5-fa3b-4345-aaa2-24696d9aea6d';
  const BUCKET = 'media';
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'video/mp4','video/webm','video/quicktime'
  ]);

  const $ = (id) => document.getElementById(id);
  const loginView = $('loginView');
  const dashboardView = $('dashboardView');
  const loginForm = $('loginForm');
  const loginButton = $('loginButton');
  const loginMessage = $('loginMessage');
  const mediaGrid = $('mediaGrid');
  const emptyState = $('emptyState');
  const statusMessage = $('statusMessage');
  const fileInput = $('fileInput');
  const toast = $('toast');

  let supabase;
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setStatus(message, type = '') {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message' + (type ? ' ' + type : '');
  }

  function formatSize(bytes = 0) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' КБ';
    return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
  }

  function showLogin(message = '') {
    loginView.hidden = false;
    dashboardView.hidden = true;
    loginMessage.textContent = message;
  }

  function showDashboard() {
    loginView.hidden = true;
    dashboardView.hidden = false;
  }

  async function verifySession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) {
      showLogin();
      return false;
    }
    if (user.id !== ADMIN_UID) {
      await supabase.auth.signOut();
      showLogin('У этой учётной записи нет доступа к панели.');
      return false;
    }
    showDashboard();
    await loadMedia();
    return true;
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.textContent = 'Проверяем данные…';
    loginMessage.textContent = '';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('password').value
      });
      if (error) throw error;
      if (data.user?.id !== ADMIN_UID) {
        await supabase.auth.signOut();
        throw new Error('Эта учётная запись не является администратором сайта.');
      }
      $('password').value = '';
      showDashboard();
      await loadMedia();
    } catch (error) {
      loginMessage.textContent = error.message || 'Не удалось войти. Проверьте email и пароль.';
    } finally {
      loginButton.disabled = false;
      loginButton.innerHTML = 'Войти в панель <span>↗</span>';
    }
  });

  $('logoutButton').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showLogin('Вы вышли из панели.');
  });

  async function loadMedia() {
    mediaGrid.replaceChildren();
    emptyState.hidden = true;
    setStatus('Загружаем список файлов…');
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list('', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error) throw error;
      const files = (data || []).filter(item => item.name && item.name !== '.emptyFolderPlaceholder');
      $('fileCount').textContent = files.length + (files.length === 1 ? ' файл' : files.length > 1 && files.length < 5 ? ' файла' : ' файлов');
      setStatus('');
      emptyState.hidden = files.length !== 0;
      files.forEach(renderMediaCard);
    } catch (error) {
      setStatus('Не удалось получить список файлов: ' + (error.message || 'ошибка доступа'), 'error');
    }
  }

  function renderMediaCard(file) {
    const path = file.name;
    const mime = file.metadata?.mimetype || '';
    const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(path);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const card = document.createElement('article');
    card.className = 'media-card';

    const preview = document.createElement(isVideo ? 'video' : 'img');
    preview.className = 'preview';
    preview.src = data.publicUrl;
    if (isVideo) {
      preview.muted = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.controls = true;
    } else {
      preview.alt = path;
      preview.loading = 'lazy';
    }

    const details = document.createElement('div');
    details.className = 'media-details';
    const name = document.createElement('div');
    name.className = 'media-name';
    name.textContent = path;
    const meta = document.createElement('div');
    meta.className = 'media-meta';
    meta.textContent = (isVideo ? 'ВИДЕО' : 'ФОТО') + ' · ' + formatSize(file.metadata?.size) + (file.created_at ? ' · ' + formatDate(file.created_at) : '');
    const remove = document.createElement('button');
    remove.className = 'delete-btn';
    remove.type = 'button';
    remove.textContent = 'Удалить';
    remove.addEventListener('click', async () => {
      if (!confirm('Удалить файл «' + path + '»? Это действие нельзя отменить.')) return;
      remove.disabled = true;
      remove.textContent = 'Удаляем…';
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) {
        showToast('Не удалось удалить файл: ' + error.message);
        remove.disabled = false;
        remove.textContent = 'Удалить';
        return;
      }
      card.remove();
      const remaining = mediaGrid.children.length;
      $('fileCount').textContent = remaining + (remaining === 1 ? ' файл' : remaining > 1 && remaining < 5 ? ' файла' : ' файлов');
      emptyState.hidden = remaining !== 0;
      showToast('Файл удалён');
    });
    details.append(name, meta, remove);
    card.append(preview, details);
    mediaGrid.append(card);
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type)) {
        showToast('Формат «' + file.name + '» не поддерживается.');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('Файл «' + file.name + '» больше 50 МБ.');
        continue;
      }
      setStatus('Загружаем: ' + file.name);
      const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'media';
      const path = Date.now() + '-' + crypto.randomUUID() + '-' + safeName;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false
      });
      if (error) {
        setStatus('Ошибка загрузки «' + file.name + '»: ' + error.message, 'error');
        continue;
      }
      showToast('Загружено: ' + file.name);
    }
    fileInput.value = '';
    await loadMedia();
  }

  fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
  $('refreshButton').addEventListener('click', loadMedia);

  const uploadCard = document.querySelector('.upload-card');
  ['dragenter','dragover'].forEach(name => uploadCard.addEventListener(name, event => {
    event.preventDefault();
    uploadCard.classList.add('dragging');
  }));
  ['dragleave','drop'].forEach(name => uploadCard.addEventListener(name, event => {
    event.preventDefault();
    uploadCard.classList.remove('dragging');
  }));
  uploadCard.addEventListener('drop', event => uploadFiles(event.dataTransfer.files));

  function init() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
        window.SUPABASE_URL.includes('ВСТАВЬТЕ') ||
        window.SUPABASE_ANON_KEY.includes('ВСТАВЬТЕ') ||
        !window.supabase?.createClient) {
      showLogin('Не удалось подключить Supabase. Проверьте config.js и загрузку библиотеки.');
      loginButton.disabled = true;
      return;
    }
    supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) showLogin();
    });
    verifySession().catch(error => showLogin('Ошибка проверки входа: ' + error.message));
  }

  init();
})();