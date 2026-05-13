// ==========================================
// CONFIGURACIÓN PRINCIPAL
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbxLJYQe6QZCiDARD1I5ngkqS3hjfzT1oYki9rlClbNpFf-fjLwXv_Lhp_TOcjLgOTZt/exec";

let currentUser = null;
let currentApps = [];

// ==========================================
// CICLO DE VIDA (BOOT)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthState();
    bindLoginEvents();
});

function initTheme() {
    const isDark = localStorage.getItem('genTheme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    actualizarIconoTema(isDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('genTheme', isDark ? 'dark' : 'light');
    actualizarIconoTema(isDark);
    
    // Si hay un iframe abierto, le avisamos del cambio de tema
    const frame = document.getElementById('appFrame');
    if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'THEME_UPDATE', theme: isDark ? 'dark' : 'light' }, '*');
    }
}

function actualizarIconoTema(isDark) {
    const icon = document.getElementById('themeIcon');
    if(icon) {
        icon.className = isDark ? "ph-fill ph-sun text-xl text-yellow-400" : "ph-fill ph-moon text-xl text-gray-600";
    }
}

// ==========================================
// SEGURIDAD: VERIFICACIÓN DE SESIÓN (BOOT CHECK)
// ==========================================
function checkAuthState() {
    const sessionData = localStorage.getItem('genSession');
    if (sessionData) {
        try {
            const data = JSON.parse(sessionData);
            currentUser = data.user;
            currentApps = data.apps;
            
            // Renderizamos UI Inmediatamente (Optimistic UI)
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');
            document.getElementById('appContainer').classList.add('flex');
            
            renderUserInfo();
            renderSidebar();
            
            // EL LATIDO DE SEGURIDAD: Comprobamos silenciosamente si el Admin lo borró
            validarSesionEnSegundoPlano(currentUser.email || currentUser.usuario);

        } catch(e) {
            logout(); // Si el JSON está roto, lo botamos
        }
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
    }
}

/**
 * Función que verifica contra la Base de Datos si la sesión guardada sigue siendo válida.
 * Si el usuario fue eliminado o inhabilitado, destruye el localStorage y recarga la página.
 */
async function validarSesionEnSegundoPlano(identificador) {
    try {
        // Hacemos una consulta rápida simulando un SSO Login silencioso
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'loginSSO', email: identificador })
        });
        const data = await response.json();
        
        if (data.status === 'error') {
            // El servidor lo rechazó (Fue borrado o inactivado)
            console.error("ALERTA DE SEGURIDAD: Sesión revocada desde el servidor.");
            localStorage.removeItem('genSession');
            alert("Tu sesión ha sido revocada o tu cuenta ha sido inhabilitada por el Administrador.");
            window.location.reload();
        }
    } catch (e) {
        console.warn("No se pudo hacer el Boot Check silencioso por red. La sesión local se mantiene por ahora.");
    }
}

// ==========================================
// LÓGICA DE LOGIN (TRADICIONAL Y GOOGLE SSO)
// ==========================================
function bindLoginEvents() {
    const form = document.getElementById('formLogin');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('username').value;
        const pass = document.getElementById('password').value;
        const btn = document.getElementById('loginBtn');
        
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Conectando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'login', user: user, pass: pass })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                localStorage.setItem('genSession', JSON.stringify(data));
                window.location.reload();
            } else if (data.status === 'require_profile') {
                alert("Debes contactar al administrador para completar tu perfil antes de ingresar.");
            } else {
                alert("Error: " + data.message);
            }
        } catch (err) {
            alert("Error de conexión al servidor.");
        } finally {
            btn.innerHTML = 'Ingresar a GenApps';
            btn.disabled = false;
        }
    });
}

// --- DECODIFICADOR DE JWT PARA GOOGLE ---
function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch(e) {
        return null;
    }
}

// --- RECEPCIÓN DEL LOGIN DE GOOGLE ---
async function handleGoogleLogin(response) {
    const responsePayload = parseJwt(response.credential);
    if(!responsePayload) {
        alert("Error de seguridad: Token de Google inválido."); return;
    }
    
    const userEmail = responsePayload.email;
    const loginBtn = document.getElementById('loginBtn'); 
    
    if(loginBtn) {
        loginBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Validando Google...';
        loginBtn.disabled = true;
    }

    try {
        const apiResponse = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'loginSSO', email: userEmail })
        });
        const data = await apiResponse.json();
        
        if (data.status === 'success') {
            localStorage.setItem('genSession', JSON.stringify(data));
            window.location.reload(); 
        } else {
            alert("Acceso Denegado: " + data.message);
        }
    } catch (error) {
        alert("Error de conexión al servidor de GenApps.");
    } finally {
        if(loginBtn) {
            loginBtn.innerHTML = 'Ingresar a GenApps';
            loginBtn.disabled = false;
        }
    }
}

function logout() {
    localStorage.removeItem('genSession');
    window.location.reload();
}

// ==========================================
// RENDERIZADO DE LA APLICACIÓN (UI)
// ==========================================
function renderUserInfo() {
    if(!currentUser) return;
    const nameEl = document.getElementById('userFullName');
    const roleEl = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAvatar');
    
    if(nameEl) nameEl.textContent = currentUser.nombre;
    if(roleEl) roleEl.textContent = currentUser.rol;
    if(avatarEl && currentUser.nombre) {
        avatarEl.textContent = currentUser.nombre.charAt(0).toUpperCase();
    }
}

function renderSidebar() {
    const nav = document.getElementById('appsMenu');
    if(!nav || !currentApps) return;
    
    nav.innerHTML = '';
    
    // Botón de Admin (Aparece al inicio si es admin)
    if (currentUser.rol === 'ADMINISTRADOR') {
        const adminBtn = document.createElement('button');
        adminBtn.className = "w-full flex items-center gap-3 px-4 py-3.5 mb-2 rounded-xl text-left bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-black border border-brand-100 dark:border-brand-800/30 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors shadow-sm";
        adminBtn.innerHTML = `
            <i class="ph-fill ph-shield-star text-xl"></i>
            <span class="truncate">Panel Admin</span>
        `;
        adminBtn.onclick = () => loadApp('admin_users.html');
        nav.appendChild(adminBtn);
    }

    currentApps.forEach(app => {
        const btn = document.createElement('button');
        btn.className = "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-brand-600 dark:hover:text-brand-400 transition-colors group";
        
        // Icono dinámico basado en el ID
        let iconClass = "ph-app-window";
        if(app.id === 'cat') iconClass = "ph-database";
        else if(app.id === 'poe') iconClass = "ph-book-open-text";
        
        btn.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-brand-100 dark:group-hover:bg-brand-900/30 transition-colors">
                <i class="ph-fill ${iconClass} text-lg text-gray-500 group-hover:text-brand-600 dark:group-hover:text-brand-400"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="truncate leading-tight">${app.titulo}</div>
                <div class="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-widest mt-0.5 truncate">${app.info || app.id}</div>
            </div>
        `;
        btn.onclick = () => {
            loadApp(app.link);
            if (window.innerWidth < 768) toggleSidebar(); 
        };
        nav.appendChild(btn);
    });
}

function loadApp(url) {
    document.getElementById('welcomeScreen').classList.add('hidden');
    const iframe = document.getElementById('appFrame');
    
    // Muestra el loader mientras carga el iframe
    document.getElementById('globalLoader').style.display = 'flex';
    
    iframe.src = url;
    
    iframe.onload = () => {
        document.getElementById('globalLoader').style.display = 'none';
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        iframe.contentWindow.postMessage({ 
            type: 'SESSION_SYNC', 
            user: currentUser, 
            catalog: currentApps,
            theme: theme 
        }, '*');
    };
}

// ==========================================
// GESTIÓN DE UI Y MENÚS LATERALES
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        // Pequeño delay para la animación de opacidad
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}
