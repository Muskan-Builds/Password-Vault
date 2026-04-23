// State Management
let vaultItems = [];
let masterKey = "";

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

// --- Biometric Logic (FaceID/Fingerprint) ---
async function setupBiometrics() {
    if (!window.PublicKeyCredential) return alert("Biometrics not supported on this device or connection is not HTTPS.");

    // Trigger native biometric registration prompt
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
        // Scramble the master key using a local "device" key
        localStorage.setItem('bio_key', encrypt(masterKey, "v-device-lock-123"));
        showToast("FaceID Enabled!");
        checkBioStatus();
    } catch (e) {
        console.error(e);
        alert("Setup failed. Make sure you are on HTTPS.");
    }
}

function checkBioStatus() {
    if (localStorage.getItem('bio_enabled') === 'true') {
        biometricBtn.style.display = 'flex';
    }
}

biometricBtn.onclick = async () => {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // This triggers the REAL native FaceID/Fingerprint prompt instantly
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
            showScreen('home-screen');
            renderVault();
        }
    } catch (e) {
        console.log("Biometric auth cancelled or failed");
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
    const filtered = vaultItems.filter(i =>
        i.site.toLowerCase().includes(filter.toLowerCase())
    );

    if (filtered.length === 0) {
        vaultList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="shield-alert"></i>
                <p>${filter ? 'No results found' : 'Your vault is empty'}</p>
            </div>
        `;
    } else {
        filtered.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'vault-card';
            card.innerHTML = `
                <div class="card-icon"><i data-lucide="globe"></i></div>
                <div class="card-content">
                    <h3>${item.site}</h3>
                    <p>${item.email || item.username || 'No email'}</p>
                </div>
                <button class="icon-btn" onclick="copyPass('${item.password}', event)">
                    <i data-lucide="copy"></i>
                </button>
            `;
            vaultList.appendChild(card);
        });
    }
    lucide.createIcons();
}

function copyPass(text, e) {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
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
        saveToLocal();
        showScreen('home-screen');
        renderVault();
    } else {
        const data = decrypt(stored, pwd);
        if (data) {
            masterKey = pwd;
            vaultItems = data;
            showScreen('home-screen');
            renderVault();
        } else {
            masterPassInput.classList.add('shake');
            setTimeout(() => masterPassInput.classList.remove('shake'), 500);
        }
    }
};

vaultForm.onsubmit = (e) => {
    e.preventDefault();
    const item = {
        site: document.getElementById('site-name').value,
        email: document.getElementById('email').value,
        username: document.getElementById('username').value,
        password: passwordInput.value,
        id: Date.now()
    };

    vaultItems.push(item);
    saveToLocal();
    vaultForm.reset();
    showScreen('home-screen');
    renderVault();
};

addBtn.onclick = () => showScreen('edit-screen');
backBtn.onclick = () => showScreen('home-screen');
lockAppBtn.onclick = () => location.reload();
bioSetupBtn.onclick = setupBiometrics;

searchInput.oninput = (e) => renderVault(e.target.value);

togglePassBtn.onclick = () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    togglePassBtn.querySelector('i').setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
    lucide.createIcons();
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
};

// Start
checkBioStatus();
lucide.createIcons();
