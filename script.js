// State Management
let vaultItems = [];
let masterKey = "";
let currentCategory = 'All';
let inactivityTimer;

// Elements
const lockScreen = document.getElementById('lock-screen');
const homeScreen = document.getElementById('home-screen');
const editScreen = document.getElementById('edit-screen');
const vaultList = document.getElementById('vault-items');
const addBtn = document.getElementById('add-btn');
const backBtn = document.querySelector('.back-btn');
const vaultForm = document.getElementById('vault-form');
const searchInput = document.getElementById('search-input');
const masterPassInput = document.getElementById('master-pass-input');
const unlockBtn = document.getElementById('unlock-btn');
const exportBtn = document.getElementById('export-btn');
const lockAppBtn = document.getElementById('lock-app-btn');
const bioSetupBtn = document.getElementById('bio-setup-btn');
const biometricBtn = document.getElementById('biometric-btn');
const toast = document.getElementById('toast');
const togglePassBtn = document.getElementById('toggle-pass');
const passwordInput = document.getElementById('password');
const lockStatus = document.getElementById('lock-status');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');

// --- Haptic Feedback ---
function triggerHaptic(type = 'medium') {
    if (window.navigator && window.navigator.vibrate) {
        if (type === 'light') window.navigator.vibrate(10);
        else if (type === 'medium') window.navigator.vibrate(30);
        else if (type === 'error') window.navigator.vibrate([50, 50, 50]);
    }
}

// --- Inactivity Timer (Auto-Lock) ---
function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    if (masterKey) {
        inactivityTimer = setTimeout(() => {
            location.reload(); 
        }, 5 * 60 * 1000); 
    }
}

['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(name => {
    document.addEventListener(name, resetInactivityTimer, true);
});

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

// --- Biometric Logic ---
async function setupBiometrics() {
    if (!window.PublicKeyCredential) return alert("Biometrics not supported on this device or connection is not HTTPS.");
    
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
        triggerHaptic('medium');
        checkBioStatus();
    } catch (e) {
        console.error(e);
    }
}

function checkBioStatus() {
    if (localStorage.getItem('bio_enabled') === 'true') {
        biometricBtn.style.display = 'flex';
    }
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
            publicKey: {
                challenge,
                authenticatorSelection: { authenticatorAttachment: "platform" }
            }
        });

        const storedKey = localStorage.getItem('bio_key');
        const decryptedMaster = decrypt(storedKey, "v-device-lock-123");
        
        if (decryptedMaster) {
            masterKey = decryptedMaster;
            const stored = localStorage.getItem('vault_v1');
            vaultItems = decrypt(stored, masterKey) || [];
            setLockStatus("Access Granted");
            triggerHaptic('medium');
            resetInactivityTimer();
            setTimeout(() => {
                showScreen('home-screen');
                renderVault();
                setLockStatus("");
            }, 500);
        }
    } catch (e) {
        setLockStatus("Authentication Failed", true);
        triggerHaptic('error');
        setTimeout(() => setLockStatus(""), 2000);
    }
};

// --- App Navigation ---
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

// --- Vault Logic ---
function saveToLocal() {
    const encrypted = encrypt(vaultItems, masterKey);
    localStorage.setItem('vault_v1', encrypted);
}

function renderVault(filter = '') {
    vaultList.innerHTML = '';
    
    let filtered = vaultItems.filter(i => 
        i.site.toLowerCase().includes(filter.toLowerCase())
    );

    if (currentCategory !== 'All') {
        filtered = filtered.filter(i => i.category === currentCategory);
    }

    if (filtered.length === 0) {
        vaultList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="shield-alert"></i>
                <p>No accounts found.</p>
            </div>
        `;
    } else {
        filtered.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'vault-card';
            
            let iconType = 'globe';
            if(item.category === 'Career') iconType = 'briefcase';
            if(item.category === 'Finance') iconType = 'credit-card';
            if(item.category === 'Social') iconType = 'share-2';

            const createdDate = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';

            card.innerHTML = `
                <div class="card-icon"><i data-lucide="${iconType}"></i></div>
                <div class="card-content">
                    <h3>${item.site}</h3>
                    <div class="card-subtitle">
                        <p class="privacy-masked" id="mask-${item.id}">${item.email || item.username || 'No email'}</p>
                        <p class="card-date">Added: ${createdDate}</p>
                    </div>
                </div>
                <div class="card-actions">
                    ${item.url ? `<button class="icon-btn" onclick="visitSite('${item.url}')"><i data-lucide="external-link"></i></button>` : ''}
                    <button class="icon-btn" onclick="togglePrivacy('${item.id}', this)"><i data-lucide="eye"></i></button>
                    <button class="icon-btn" onclick="copyPass('${item.password}', event)"><i data-lucide="copy"></i></button>
                </div>
            `;
            vaultList.appendChild(card);
        });
    }
    lucide.createIcons();
}

function togglePrivacy(id, btn) {
    const element = document.getElementById(`mask-${id}`);
    element.classList.toggle('revealed');
    const isRevealed = element.classList.contains('revealed');
    btn.innerHTML = `<i data-lucide="${isRevealed ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons();
    triggerHaptic('light');
}

function visitSite(url) {
    triggerHaptic('medium');
    window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
}

function copyPass(text, e) {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
    triggerHaptic('medium');
}

function showToast(msg) {
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// --- Category Filtering ---
document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.onclick = () => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCategory = chip.dataset.cat;
        renderVault(searchInput.value);
        triggerHaptic('light');
    };
});

// --- Event Listeners ---
unlockBtn.onclick = () => {
    const pwd = masterPassInput.value;
    if (!pwd) return;

    const stored = localStorage.getItem('vault_v1');
    if (!stored) {
        masterKey = pwd;
        vaultItems = [];
        saveToLocal();
        showScreen('home-screen');
        renderVault();
        resetInactivityTimer();
        triggerHaptic('medium');
    } else {
        const data = decrypt(stored, pwd);
        if (data) {
            masterKey = pwd;
            vaultItems = data;
            showScreen('home-screen');
            renderVault();
            resetInactivityTimer();
            triggerHaptic('medium');
        } else {
            masterPassInput.classList.add('shake');
            setLockStatus("Invalid Master Password", true);
            triggerHaptic('error');
            setTimeout(() => {
                masterPassInput.classList.remove('shake');
                setLockStatus("");
            }, 1500);
        }
    }
};

vaultForm.onsubmit = (e) => {
    e.preventDefault();
    const item = {
        site: document.getElementById('site-name').value,
        url: document.getElementById('site-url').value,
        email: document.getElementById('email').value,
        password: passwordInput.value,
        category: document.getElementById('category').value,
        date: new Date().getTime(),
        id: Date.now()
    };

    vaultItems.push(item);
    saveToLocal();
    vaultForm.reset();
    showScreen('home-screen');
    renderVault();
    triggerHaptic('medium');
};

addBtn.onclick = () => {
    showScreen('edit-screen');
    triggerHaptic('light');
};
backBtn.onclick = () => {
    showScreen('home-screen');
    triggerHaptic('light');
};
lockAppBtn.onclick = () => location.reload();
bioSetupBtn.onclick = setupBiometrics;

searchInput.oninput = (e) => renderVault(e.target.value);

togglePassBtn.onclick = () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    togglePassBtn.querySelector('i').setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
    lucide.createIcons();
    triggerHaptic('light');
};
exportBtn.onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vaultItems));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "vault_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast("Backup downloaded!");
    triggerHaptic('medium');
};

importBtn.onclick = () => {
    importFile.click();
    triggerHaptic('light');
};

importFile.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (Array.isArray(importedData)) {
                if (confirm(`Import ${importedData.length} accounts?`)) {
                    vaultItems = [...vaultItems, ...importedData];
                    saveToLocal();
                    renderVault();
                    showToast("Import successful!");
                    triggerHaptic('medium');
                }
            } else {
                alert("Invalid backup file.");
            }
        } catch (err) {
            alert("Error reading file.");
        }
        importFile.value = '';
    };
    reader.readAsText(file);
};

// Start
checkBioStatus();
lucide.createIcons();
