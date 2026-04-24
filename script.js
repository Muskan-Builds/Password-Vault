// --- Configuration ---
const SUPABASE_URL = "https://gijvxndmhtieazmkegzd.supabase.co";
const SUPABASE_KEY = "sb_publishable_xfjeyUjr-tX15sG0MaQvlA_rel7uWg_";
const MAX_WRONG_ATTEMPTS = 5;

// State Management
let vaultItems = [];
let auditLogs = [];
let masterKey = "";
let currentCategory = 'All';
let inactivityTimer;
let wrongAttempts = parseInt(localStorage.getItem('wrong_attempts') || '0');
let editingItemId = null;

// Supabase Init
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Elements
const lockScreen = document.getElementById('lock-screen');
const homeScreen = document.getElementById('home-screen');
const editScreen = document.getElementById('edit-screen');
const auditScreen = document.getElementById('audit-screen');
const vaultList = document.getElementById('vault-items');
const auditList = document.getElementById('audit-list');
const addBtn = document.getElementById('add-btn');
const backBtn = document.querySelector('.back-btn');
const auditBackBtn = document.querySelector('.audit-back-btn');
const vaultForm = document.getElementById('vault-form');
const searchInput = document.getElementById('search-input');
const masterPassInput = document.getElementById('master-pass-input');
const unlockBtn = document.getElementById('unlock-btn');
const auditBtn = document.getElementById('audit-btn');
const syncCloudBtn = document.getElementById('sync-cloud-btn');
const exportBtn = document.getElementById('export-btn');
const lockAppBtn = document.getElementById('lock-app-btn');
const bioSetupBtn = document.getElementById('bio-setup-btn');
const biometricBtn = document.getElementById('biometric-btn');
const toast = document.getElementById('toast');
const togglePassBtn = document.getElementById('toggle-pass');
const passwordInput = document.getElementById('password');
const lockStatus = document.getElementById('lock-status');

// --- Encryption Core ---
function encrypt(data, key) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
}

function decrypt(ciphertext, key) {
    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, key);
        const decoded = bytes.toString(CryptoJS.enc.Utf8);
        return decoded ? JSON.parse(decoded) : null;
    } catch (e) {
        return null;
    }
}

// --- Haptic Feedback ---
function triggerHaptic(type = 'medium') {
    if (window.navigator && window.navigator.vibrate) {
        if (type === 'light') window.navigator.vibrate(10);
        else if (type === 'medium') window.navigator.vibrate(30);
        else if (type === 'error') window.navigator.vibrate([50, 50, 50]);
    }
}

// --- Self-Destruct Logic ---
function selfDestruct() {
    triggerHaptic('error');
    alert("CRITICAL SECURITY ALERT: Multiple failed attempts. Data wiped.");
    localStorage.clear();
    location.reload();
}

// --- Audit Log Logic ---
function addAuditLog(action, isDanger = false) {
    const log = { action, time: new Date().toISOString(), isDanger };
    auditLogs.unshift(log);
    if (auditLogs.length > 50) auditLogs.pop();
    localStorage.setItem('audit_v1', encrypt(auditLogs, masterKey));
}

function renderAudit() {
    auditList.innerHTML = '';
    if (auditLogs.length === 0) {
        auditList.innerHTML = '<p style="text-align:center; color:gray;">No activity.</p>';
        return;
    }
    auditLogs.forEach(log => {
        const item = document.createElement('div');
        item.className = `audit-item ${log.isDanger ? 'danger' : ''}`;
        item.innerHTML = `
            <i data-lucide="${log.isDanger ? 'shield-alert' : 'shield-check'}"></i>
            <div class="audit-info">
                <h4>${log.action}</h4>
                <span>${new Date(log.time).toLocaleString()}</span>
            </div>
        `;
        auditList.appendChild(item);
    });
    lucide.createIcons();
}

// --- Cloud Sync Logic ---
async function syncCloud() {
    if (!masterKey) return;
    showToast("Syncing...");
    triggerHaptic('medium');

    try {
        const encryptedData = encrypt(vaultItems, masterKey);
        const { error } = await sb.from('vaults').upsert({ 
            id: 'my-private-vault', 
            data: encryptedData,
            updated_at: new Date()
        });

        if (error) throw error;
        showToast("Backup Success!");
        addAuditLog("Cloud Sync Success");
    } catch (err) {
        console.error(err);
        showToast("Sync Failed. Check Table.");
    }
}

// --- Load from Cloud (On Login) ---
async function loadFromCloud() {
    try {
        const { data, error } = await sb.from('vaults').select('data').eq('id', 'my-private-vault').single();
        if (data && data.data) {
            const decrypted = decrypt(data.data, masterKey);
            if (decrypted) {
                vaultItems = decrypted;
                saveToLocal();
                renderVault();
                showToast("Data Synced from Cloud!");
            }
        }
    } catch (err) {
        console.log("No cloud data found yet.");
    }
}

// --- Inactivity Timer ---
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (masterKey) {
        inactivityTimer = setTimeout(() => location.reload(), 5 * 60 * 1000); 
    }
}
['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
    document.addEventListener(name, resetInactivityTimer, true);
});

// --- Biometric Logic ---
async function setupBiometrics() {
    if (!window.PublicKeyCredential) return alert("Biometrics not supported.");
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "Vault" },
                user: { id: new Uint8Array(16), name: "user", displayName: "User" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: { authenticatorAttachment: "platform" }
            }
        });
        localStorage.setItem('bio_enabled', 'true');
        localStorage.setItem('bio_key', encrypt(masterKey, "v-device-lock-123")); 
        showToast("FaceID Enabled!");
        addAuditLog("FaceID Enabled");
        checkBioStatus();
    } catch (e) { console.error(e); }
}

function checkBioStatus() {
    if (localStorage.getItem('bio_enabled') === 'true') biometricBtn.style.display = 'flex';
}

function setLockStatus(msg, isError = false) {
    lockStatus.innerText = msg;
    lockStatus.className = 'lock-status ' + (isError ? 'error' : 'loading');
    if (!msg) lockStatus.className = 'lock-status';
}

biometricBtn.onclick = async () => {
    try {
        setLockStatus("Verifying Identity...");
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.get({
            publicKey: { challenge, authenticatorSelection: { authenticatorAttachment: "platform" } }
        });

        const storedKey = localStorage.getItem('bio_key');
        const decryptedMaster = decrypt(storedKey, "v-device-lock-123");
        if (decryptedMaster) {
            masterKey = decryptedMaster;
            const stored = localStorage.getItem('vault_v1');
            vaultItems = decrypt(stored, masterKey) || [];
            auditLogs = decrypt(localStorage.getItem('audit_v1'), masterKey) || [];
            addAuditLog("Unlocked via FaceID");
            localStorage.setItem('wrong_attempts', '0');
            showScreen('home-screen');
            renderVault();
            loadFromCloud(); // Try syncing from cloud
        }
    } catch (e) { setLockStatus("Failed", true); triggerHaptic('error'); }
};

// --- App Navigation ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function saveToLocal() {
    localStorage.setItem('vault_v1', encrypt(vaultItems, masterKey));
}

function renderVault(filter = '') {
    vaultList.innerHTML = '';
    let filtered = vaultItems.filter(i => i.site.toLowerCase().includes(filter.toLowerCase()));
    if (currentCategory !== 'All') filtered = filtered.filter(i => i.category === currentCategory);

    if (filtered.length === 0) {
        vaultList.innerHTML = `<div class="empty-state"><i data-lucide="shield-alert"></i><p>Empty Vault</p></div>`;
    } else {
        filtered.forEach((item) => {
            const container = document.createElement('div');
            container.className = 'vault-item-container';

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-action-btn';
            delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
            delBtn.onclick = () => deleteItem(item.id);

            const card = document.createElement('div');
            card.className = 'vault-card';
            let iconType = (item.category === 'Career') ? 'briefcase' : (item.category === 'Finance') ? 'credit-card' : (item.category === 'Social') ? 'share-2' : 'globe';
            card.innerHTML = `
                <div class="card-icon"><i data-lucide="${iconType}"></i></div>
                <div class="card-content">
                    <h3>${item.site}</h3>
                    <div class="card-subtitle"><p class="privacy-masked" id="mask-${item.id}">${item.email || 'No email'}</p></div>
                </div>
                <div class="card-actions">
                    ${item.url ? `<button class="icon-btn" onclick="visitSite('${item.url}')"><i data-lucide="external-link"></i></button>` : ''}
                    <button class="icon-btn" onclick="togglePrivacy('${item.id}', this)"><i data-lucide="eye"></i></button>
                    <button class="icon-btn" onclick="copyPass('${item.password}', event)"><i data-lucide="copy"></i></button>
                    <button class="icon-btn" onclick="editItem(${item.id})"><i data-lucide="edit-2"></i></button>
                </div>
            `;

            // Swipe Logic
            let startX = 0;
            let currentX = 0;
            let isDragging = false;
            const threshold = -50; 

            const handleStart = (e) => {
                if (e.target.closest('.icon-btn')) return; // let buttons work
                startX = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
                isDragging = true;
                card.classList.add('dragging');
            };

            const handleMove = (e) => {
                if (!isDragging) return;
                const x = e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
                currentX = x - startX;
                // Allow only left swipe, cap at -100
                if (currentX < 0) {
                    currentX = Math.max(currentX, -100);
                    card.style.transform = `translateX(${currentX}px)`;
                }
            };

            const handleEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                card.classList.remove('dragging');
                if (currentX < threshold) {
                    currentX = -80; // revealing delete button
                } else {
                    currentX = 0; // snap back
                }
                card.style.transform = `translateX(${currentX}px)`;
            };

            card.addEventListener('touchstart', handleStart, {passive: true});
            card.addEventListener('touchmove', handleMove, {passive: true});
            card.addEventListener('touchend', handleEnd);
            card.addEventListener('mousedown', handleStart);
            card.addEventListener('mousemove', handleMove);
            card.addEventListener('mouseleave', handleEnd);
            card.addEventListener('mouseup', handleEnd);

            container.appendChild(delBtn);
            container.appendChild(card);
            vaultList.appendChild(container);
        });
    }
    lucide.createIcons();
}

function togglePrivacy(id, btn) {
    const el = document.getElementById(`mask-${id}`);
    el.classList.toggle('revealed');
    btn.innerHTML = `<i data-lucide="${el.classList.contains('revealed') ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons();
}

function visitSite(url) { window.open(url.startsWith('http') ? url : `https://${url}`, '_blank'); }

function copyPass(text, e) {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    showToast("Copied!");
    addAuditLog("Password Copied");
    triggerHaptic('medium');
}

function deleteItem(id) {
    if (!confirm("Are you sure you want to delete this account?")) return;
    vaultItems = vaultItems.filter(item => item.id !== id);
    saveToLocal();
    addAuditLog("Deleted Account");
    renderVault(searchInput.value);
    syncCloud();
    showToast("Deleted!");
    triggerHaptic('medium');
}

function editItem(id) {
    const item = vaultItems.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById('site-name').value = item.site;
    document.getElementById('site-url').value = item.url || '';
    document.getElementById('email').value = item.email || '';
    document.getElementById('password').value = item.password;
    document.getElementById('category').value = item.category;
    
    editingItemId = id;
    document.getElementById('edit-screen-title').innerText = "Edit Account";
    showScreen('edit-screen');
}

function showToast(msg) {
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// --- Event Listeners ---
unlockBtn.onclick = () => {
    const pwd = masterPassInput.value;
    if (!pwd) return;
    const stored = localStorage.getItem('vault_v1');
    if (!stored) {
        masterKey = pwd;
        vaultItems = [];
        auditLogs = [];
        saveToLocal();
        addAuditLog("New Vault Created");
        showScreen('home-screen');
    } else {
        const data = decrypt(stored, pwd);
        if (data) {
            masterKey = pwd;
            vaultItems = data;
            auditLogs = decrypt(localStorage.getItem('audit_v1'), masterKey) || [];
            localStorage.setItem('wrong_attempts', '0');
            addAuditLog("Manual Unlock");
            showScreen('home-screen');
            renderVault();
            loadFromCloud();
        } else {
            wrongAttempts++;
            localStorage.setItem('wrong_attempts', wrongAttempts);
            masterPassInput.classList.add('shake');
            setLockStatus(`Wrong (${wrongAttempts}/${MAX_WRONG_ATTEMPTS})`, true);
            triggerHaptic('error');
            if (wrongAttempts >= MAX_WRONG_ATTEMPTS) selfDestruct();
            setTimeout(() => masterPassInput.classList.remove('shake'), 1500);
        }
    }
};

vaultForm.onsubmit = async (e) => {
    e.preventDefault();
    if (editingItemId) {
        const item = vaultItems.find(i => i.id === editingItemId);
        if (item) {
            item.site = document.getElementById('site-name').value;
            item.url = document.getElementById('site-url').value;
            item.email = document.getElementById('email').value;
            item.password = passwordInput.value;
            item.category = document.getElementById('category').value;
        }
        addAuditLog(`Edited: ${item.site}`);
        showToast("Updated!");
    } else {
        const item = {
            site: document.getElementById('site-name').value,
            url: document.getElementById('site-url').value,
            email: document.getElementById('email').value,
            password: passwordInput.value,
            category: document.getElementById('category').value,
            id: Date.now()
        };
        if (document.getElementById('sync-keychain').checked && window.PasswordCredential) {
            try {
                const cred = new PasswordCredential({ id: item.email || item.site, password: item.password, name: item.site });
                await navigator.credentials.store(cred);
            } catch (err) {}
        }
        vaultItems.push(item);
        addAuditLog(`Added: ${item.site}`);
        showToast("Saved!");
    }
    
    saveToLocal();
    vaultForm.reset();
    editingItemId = null;
    showScreen('home-screen');
    renderVault();
    syncCloud(); // Auto-sync
};

document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderVault(searchInput.value);
    };
});

auditBtn.onclick = () => { showScreen('audit-screen'); renderAudit(); };
auditBackBtn.onclick = () => showScreen('home-screen');
syncCloudBtn.onclick = syncCloud;
exportBtn.onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vaultItems));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "vault_backup.json");
    downloadAnchorNode.click();
    addAuditLog("Exported JSON");
};
addBtn.onclick = () => {
    editingItemId = null;
    vaultForm.reset();
    document.getElementById('edit-screen-title').innerText = "Add Account";
    showScreen('edit-screen');
};
backBtn.onclick = () => showScreen('home-screen');
lockAppBtn.onclick = () => location.reload();
bioSetupBtn.onclick = setupBiometrics;
searchInput.oninput = (e) => renderVault(e.target.value);
togglePassBtn.onclick = () => {
    passwordInput.type = (passwordInput.type === 'password' ? 'text' : 'password');
    lucide.createIcons();
};

// Start
checkBioStatus();
lucide.createIcons();
