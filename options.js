const $ = id => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get({ apiUrl: '' });
  $('apiUrl').value = s.apiUrl || '';
}

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ apiUrl: $('apiUrl').value.trim() });
  const st = $('status');
  st.textContent = '已保存 ✓';
  setTimeout(() => { st.textContent = ''; }, 2000);
});

load();
