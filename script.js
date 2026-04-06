const API_URL = "https://script.google.com/macros/s/AKfycbxLJYQe6QZCiDARD1I5ngkqS3hjfzT1oYki9rlClbNpFf-fjLwXv_Lhp_TOcjLgOTZt/exec";

// === CICLO DE VIDA ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    checkAuthState();
    bindLoginEvents();
    bindOnboardingEvents();
    bindCredentialsEvents();
    
    initBotonesFlotantes(); // <-- ¡Asegúrate de que esta línea esté aquí!

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
        });
    }
});

function initTheme() {
    const isDark = localStorage.getItem('genTheme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    actualizarIconoTema(isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", isDark ? "#111827" : "#e01f36");
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    const themeStr = isDark ? 'dark' : 'light';
    localStorage.setItem('genTheme', isDark ? 'dark' : 'light');
    actualizarIconoTema(isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", isDark ? "#111827" : "#e01f36");
    const iframe = document.getElementById('appViewer');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'THEME_UPDATE', theme: themeStr }, '*');
    }
}

function actualizarIconoTema(isDark) {
    const dropdownBtn = document.getElementById('dropdown-theme-btn');
    
    if (dropdownBtn) {
        dropdownBtn.innerHTML = isDark
            ? `<i class="ph-fill ph-sun text-xl text-amber-400"></i> Tema Claro`
            : `<i class="ph-fill ph-moon text-xl text-gray-600"></i> Tema Oscuro`;
    }
}

// === MÁQUINA DE ESTADOS ===
function checkAuthState() {
    const userStr = localStorage.getItem('genUser');
    const loginView = document.getElementById('login-view');
    const hubView = document.getElementById('hub-view');

    if (userStr) {
        loginView.classList.add('hidden');
        hubView.classList.remove('hidden');
        initHub(JSON.parse(userStr));
    } else {
        hubView.classList.add('hidden');
        loginView.classList.remove('hidden');
        const form = document.getElementById('loginForm');
        if (form) form.reset();
    }
}

// === LOGIN ===
function bindLoginEvents() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (document.activeElement) document.activeElement.blur(); // Ocultar teclado en móviles
        
        const btn = document.getElementById('btnSubmit');
        const err = document.getElementById('errorMsg');

        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Conectando...';
        btn.disabled = true;
        err.classList.add('hidden');

        const payload = {
            action: 'login',
            user: document.getElementById('username').value,
            pass: document.getElementById('password').value
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("Error al conectar con el servidor.");
            const data = await response.json();

            if (data.status === 'success') {
                localStorage.setItem('genUser', JSON.stringify(data.user));
                localStorage.setItem('genAppsCatalog', JSON.stringify(data.apps));
                checkAuthState();
            } else if (data.status === 'require_profile') {
                // SE ACTIVA EL ONBOARDING
                abrirModalOnboarding(data.tempUser);
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            err.textContent = error.message || "Error inesperado.";
            err.classList.remove('hidden');
        } finally {
            btn.innerHTML = 'Ingresar';
            btn.disabled = false;
        }
    });
}

// === ONBOARDING (NUEVO) ===
function abrirModalOnboarding(usuario) {
    document.getElementById('onboardUserTemp').value = usuario;
    const modal = document.getElementById('onboardingModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function bindOnboardingEvents() {
    const form = document.getElementById('formOnboarding');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnOnboardSubmit');
        const originalText = btn.innerHTML;

        const payload = {
            action: 'completeProfile',
            user: document.getElementById('onboardUserTemp').value,
            nombre: document.getElementById('onboardNombre').value,
            correo: document.getElementById('onboardCorreo').value
        };

        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const data = await response.json();

            if (data.status === 'success') {
                document.getElementById('onboardingModal').classList.add('hidden');
                document.getElementById('onboardingModal').classList.remove('flex');

                // AUTOLOGIN TRUCO: Volvemos a presionar el botón de Iniciar Sesión automáticamente
                document.getElementById('btnSubmit').click();
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

// === CREDENCIALES ===
function bindCredentialsEvents() {
    const form = document.getElementById('formCredenciales');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;

        const userStr = localStorage.getItem('genUser');
        if (!userStr) return;
        const currentUser = JSON.parse(userStr);

        const payload = {
            action: 'updateCredentials',
            currentUser: currentUser.usuario,
            newUser: document.getElementById('newUsername').value,
            newPass: document.getElementById('newPassword').value
        };

        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
        btn.disabled = true;

        try {
            const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
            const data = await response.json();

            if (data.status === 'success') {
                closeCredentialsModal();
                showSystemModal('alert', 'Credenciales Actualizadas', '¡Tus datos se guardaron con éxito!\nPor seguridad, iniciaremos tu sesión nuevamente.', () => {
                    logout(); // Ahora invoca al logout modificado
                });
            } else {
                showSystemModal('error', 'Error al actualizar', data.message);
            }
        } catch (error) {
            showSystemModal('error', 'Error de conexión', error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}


function renderWelcomeBanner(nombre) {
    const horaLocal = new Date().getHours();
    let saludo, svgIcon, colorCls, bgGlow;

    if (horaLocal >= 5 && horaLocal < 12) {
        saludo = "Buenos días"; colorCls = "text-amber-500"; bgGlow = "bg-amber-100 dark:bg-amber-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-[spin_12s_linear_infinite] drop-shadow-lg"><path d="M12 4V2M12 22v-2M4 12H2m20 0h-2m-2.05-6.95l1.41-1.41M4.64 19.36l1.41-1.41M19.36 19.36l-1.41-1.41M6.05 6.05L4.64 4.64M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (horaLocal >= 12 && horaLocal < 19) {
        saludo = "Buenas tardes"; colorCls = "text-orange-500"; bgGlow = "bg-orange-100 dark:bg-orange-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-[bounce_3s_infinite] drop-shadow-lg"><path d="M8 17a4 4 0 110-8c0-.44.07-.87.2-1.28A5.5 5.5 0 0113.5 3 5.5 5.5 0 0119 8.5c0 .17 0 .33-.03.5A4 4 0 1116 17H8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else {
        saludo = "Buenas noches"; colorCls = "text-indigo-500 dark:text-indigo-400"; bgGlow = "bg-indigo-100 dark:bg-indigo-900/30";
        svgIcon = `<svg viewBox="0 0 24 24" fill="none" class="w-16 h-16 sm:w-20 sm:h-20 animate-pulse drop-shadow-lg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    // APLICANDO DISEÑO DE TEXTO FLOTANTE SIN BLOQUE DE FONDO Y WIDGETS (Tipografía Premium)
    document.getElementById('welcome-banner').innerHTML = `
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6 relative w-full">
            <div class="flex items-center gap-4 sm:gap-6 relative">
                <div class="absolute -left-10 -top-10 w-48 h-48 rounded-full ${bgGlow} opacity-40 blur-3xl pointer-events-none"></div>
                <div class="${colorCls} z-10 transform scale-75 sm:scale-100 origin-left drop-shadow-xl transition-transform hover:scale-110 duration-500 ease-out">${svgIcon}</div>
                <div class="z-10 flex-1">
                    <h2 class="text-3xl sm:text-5xl font-black text-gray-800 dark:text-white tracking-tight leading-none drop-shadow-md">
                        ${saludo}, <span class="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-amber-500 drop-shadow-sm">${nombre}</span>
                    </h2>
                    <p class="text-gray-600 dark:text-gray-300 mt-2 font-bold text-[14px] sm:text-xl drop-shadow-sm">¿Qué módulo vamos a gestionar hoy?</p>
                </div>
            </div>
            
            <!-- Widgets Laterales Premium -->
            <div class="flex flex-wrap lg:flex-nowrap items-center gap-3 sm:gap-4 z-10 pr-2 pb-2 pointer-events-auto mt-4 md:mt-0">
                <!-- Clima -->
                <a href="https://open-meteo.com/" target="_blank" title="Datos por Open-Meteo" class="flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-lg transition-all group transform hover:-translate-y-1 duration-300">
                    <div class="w-10 h-10 rounded-[12px] bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-500 dark:text-sky-400 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300 shadow-inner">
                        <i id="weather-icon" class="ph ph-cloud-sun text-2xl animate-pulse"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">Tacna <i class="ph ph-drop text-sky-400"></i><span id="weather-hum">--%</span></span>
                        <span id="weather-temp" class="text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">--°C</span>
                    </div>
                </a>
                
                <!-- Divisas -->
                <a href="https://www.exchangerate-api.com" target="_blank" title="Datos por ExchangeRate-API" class="flex items-center gap-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl px-4 py-3 rounded-2xl border border-white/60 dark:border-gray-700/50 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-lg transition-all group transform hover:-translate-y-1 duration-300">
                    <div class="w-10 h-10 rounded-[12px] bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300 shadow-inner">
                        <i class="ph ph-currency-dollar text-2xl"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">USD/PEN</span>
                        <span id="currency-rate" class="text-[16px] font-black text-gray-800 dark:text-gray-100 leading-tight">S/ --</span>
                    </div>
                </a>
            </div>
        </div>
    `;

    fetchWidgetsData();
}

async function fetchWidgetsData() {
    try {
        const weatherRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=-18.01&longitude=-70.25&current=temperature_2m,relative_humidity_2m");
        if (weatherRes.ok) {
            const wData = await weatherRes.json();
            document.getElementById('weather-temp').textContent = Math.round(wData.current.temperature_2m) + "°C";
            document.getElementById('weather-hum').textContent = Math.round(wData.current.relative_humidity_2m) + "%";
            document.getElementById('weather-icon').classList.remove('animate-pulse');
        }
    } catch (e) { console.warn("Clima no disponible", e); }

    try {
        const currencyRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        if (currencyRes.ok) {
            const cData = await currencyRes.json();
            if (cData.rates.PEN) {
                document.getElementById('currency-rate').textContent = "S/ " + cData.rates.PEN.toFixed(3);
            }
        }
    } catch (e) { console.warn("Divisas no disponibles", e); }
}

// === LÓGICA DEL HUB ===
function initHub(currentUser) {
    const menu = document.getElementById('appMenu');
    const cardsContainer = document.getElementById('cards-container');
    const floatingBtn = document.getElementById('floating-menu-btn');
    const APPS_CATALOG = JSON.parse(localStorage.getItem('genAppsCatalog')) || [];

    // Hacemos el botón flotante visible
    if(floatingBtn) floatingBtn.classList.replace('hidden', 'flex');

    menu.innerHTML = '';
    cardsContainer.innerHTML = '';
    renderWelcomeBanner(currentUser.nombre.split(' ')[0]);

    // === TARJETA DE PERFIL INTERACTIVA (DROPDOWN) ===
    menu.innerHTML += `
        <div class="relative mb-6">
            <button onclick="toggleUserMenu()" class="w-full flex items-center gap-3 p-3 bg-white/50 dark:bg-gray-800/40 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-gray-800 transition-all focus:outline-none group">
                <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-black text-xl shadow-inner drop-shadow-md">
                    ${currentUser.nombre.charAt(0)}
                </div>
                <div class="flex flex-col overflow-hidden flex-1 text-left">
                    <span class="text-[14px] font-bold text-gray-800 dark:text-white truncate">${currentUser.nombre}</span>
                    <span class="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest mt-0.5">${currentUser.rol || currentUser.area}</span>
                </div>
                <div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <i id="user-menu-icon" class="ph ph-caret-down text-lg transition-transform duration-300"></i>
                </div>
            </button>

            <div id="user-dropdown" class="absolute top-[105%] left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden transform opacity-0 scale-95 pointer-events-none transition-all duration-200 z-50 origin-top">
                <div class="p-2 space-y-1">
                    <button id="dropdown-theme-btn" onclick="toggleTheme()" class="w-full flex items-center gap-3 p-3 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium"></button>
                    
                    <button onclick="openCredentialsModal(); toggleUserMenu();" class="w-full flex items-center gap-3 p-3 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium">
                        <i class="ph ph-key text-xl"></i> Credenciales
                    </button>
                    
                    <div class="h-px bg-gray-100 dark:bg-gray-700/50 my-1 mx-2"></div>
                    
                    <button onclick="logout()" class="w-full flex items-center gap-3 p-3 rounded-xl text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-sm font-bold">
                        <i class="ph ph-sign-out text-xl"></i> Cerrar Sesión
                    </button>
                </div>
            </div>
        </div>
        <p class="px-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Módulos Operativos</p>
    `;
    
    // Forzamos la actualización del icono del tema para que el nuevo botón se dibuje bien
    const isDark = document.documentElement.classList.contains('dark');
    actualizarIconoTema(isDark);

    APPS_CATALOG.forEach(app => {
        const urlImagenOptimizada = optimizarLinkImagen(app.imagen);

        // Menú Lateral
        const btn = document.createElement('button');
        btn.className = 'w-full flex items-center gap-3 p-2.5 mb-1.5 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-gray-800 hover:text-brand-700 dark:hover:text-brand-400 transition-all group menu-btn border border-transparent hover:border-brand-100 dark:hover:border-gray-700';
        btn.dataset.id = app.id;
        btn.innerHTML = `<div class="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 flex-shrink-0 overflow-hidden flex items-center justify-center group-hover:border-brand-300 transition-all"><img src="${urlImagenOptimizada}" class="w-full h-full object-contain p-1.5 transition-transform duration-300 group-hover:scale-110" onerror="this.outerHTML='<i class=\\'ph ph-app-window text-xl\\'></i>'"></div><div class="flex flex-col items-start text-left overflow-hidden flex-1"><span class="text-[13px] font-bold truncate w-full transition-transform duration-300 group-hover:translate-x-1">${app.titulo}</span></div>`;
        btn.onclick = () => { loadApp(app, currentUser); toggleMenu(); };
        menu.appendChild(btn);

        // Tarjetas Principales (Dashboard)
        const card = document.createElement('div');
        card.className = 'group relative aspect-[4/5] sm:aspect-[3/4] bg-white dark:bg-gray-900 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-lg hover:shadow-[0_20px_50px_-10px_rgba(224,31,54,0.15)] dark:hover:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] cursor-pointer transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] border border-gray-200 dark:border-white/10 flex flex-col justify-end transform hover:-translate-y-3';
        card.onclick = () => loadApp(app, currentUser);
        card.innerHTML = `
            <div class="absolute inset-0 z-0 transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-110 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-950">
                <img src="${urlImagenOptimizada}" class="w-full h-full object-cover opacity-80 dark:opacity-60 group-hover:opacity-100 transition-opacity duration-700 mix-blend-multiply dark:mix-blend-normal">
            </div>
            <div class="absolute inset-x-0 bottom-0 h-[80%] bg-gradient-to-t from-white/95 via-white/80 dark:from-black/95 dark:via-black/50 to-transparent z-10"></div>
            <div class="relative z-20 p-6 sm:p-8 translate-y-4 group-hover:translate-y-0 transition-transform duration-700 flex flex-col justify-end h-full w-full">
                <div class="w-8 h-1 bg-brand-500 rounded-full mb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100"></div>
                <h3 class="font-black text-xl sm:text-2xl text-gray-800 dark:text-white leading-tight mb-2 tracking-wide w-full line-clamp-2">${app.titulo}</h3>
                <div class="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-all duration-700 w-full">
                    <p class="overflow-hidden text-[13px] sm:text-[14px] text-gray-600 dark:text-gray-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-150 line-clamp-3 w-full">${app.info || 'Módulo operativo.'}</p>
                </div>
            </div>
        `;
        cardsContainer.appendChild(card);
    });

    const appGuardada = sessionStorage.getItem('genCurrentApp');
    if (appGuardada) {
        const appToLoad = APPS_CATALOG.find(a => a.id === appGuardada);
        if (appToLoad) loadApp(appToLoad, currentUser);
        else showHome(); 
    } else {
        showHome();
    }
}

function showHome(desdeBotonAtras = false) {
    document.getElementById('home-dashboard').classList.remove('hidden');
    document.getElementById('iframe-container').classList.add('hidden');
    document.getElementById('appViewer').src = "about:blank";
    
    // Resalta el botón correcto
    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('bg-brand-50', 'text-brand-700', 'border-brand-100', 'dark:bg-gray-800'));
    sessionStorage.removeItem('genCurrentApp');

    if (!desdeBotonAtras) {
        history.pushState({ vista: 'home' }, '', '#home');
    }
}

function loadApp(app, user) {
   if (!app.link) return showSystemModal('error', 'Enlace Inválido', 'El administrador no ha configurado la URL para este módulo.');
    sessionStorage.setItem('genCurrentApp', app.id);
    history.pushState({ vista: 'modulo', id: app.id }, '', `#${app.id}`);

    let urlSegura = app.link;
    try {
        const urlObj = new URL(app.link);
        urlObj.searchParams.append('email', user.email);
        urlObj.searchParams.append('rol', user.rol);
        urlObj.searchParams.append('jefatura', user.jefatura || '');
        urlObj.searchParams.append('t', Date.now());
        urlSegura = urlObj.toString();
    } catch (e) {
        urlSegura = `${app.link}${app.link.includes('?') ? '&' : '?'}email=${encodeURIComponent(user.email)}&rol=${user.rol}&t=${Date.now()}`;
    }

    if (['appsheet.com', 'galaxycont.com', 'plesk.page'].some(dominio => urlSegura.includes(dominio))) {
        const ancho = window.innerWidth * 0.8;
        const alto = window.innerHeight * 0.8;
        const izquierda = (window.innerWidth - ancho) / 2;
        const arriba = (window.innerHeight - alto) / 2;
        window.open(urlSegura, '_blank', `width=${ancho},height=${alto},top=${arriba},left=${izquierda},toolbar=no,menubar=no,scrollbars=yes,resizable=yes,status=no`);
        showHome(true); 
        return; 
    }

    // === MODO INMERSIVO: Mostrar Iframe, el botón flotante se queda intacto ===
    document.getElementById('home-dashboard').classList.add('hidden');
    document.getElementById('iframe-container').classList.remove('hidden');

    const iframe = document.getElementById('appViewer');
    const loader = document.getElementById('loader');

    loader.classList.remove('hidden');

    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('bg-brand-50', 'text-brand-700', 'border-brand-100', 'dark:bg-gray-800');
        if (btn.dataset.id === app.id) btn.classList.add('bg-brand-50', 'text-brand-700', 'border-brand-100', 'dark:bg-gray-800');
    });

    iframe.onload = () => { loader.classList.add('hidden'); };
    iframe.src = urlSegura;
}

// === NUEVA LÓGICA HÍBRIDA DEL LOGO ===
function handleLogoClick() {
    const sidebar = document.getElementById('sidebar');
    const estaCerrado = sidebar.classList.contains('-translate-x-full');
    const logo = document.getElementById('main-logo');

    if (estaCerrado) {
        // 1. Si el menú está oculto -> El logo sirve para ABRIRLO
        toggleMenu();
    } else {
        // 2. Si el menú ya está abierto -> El logo sirve para IR A INICIO y CERRARLO
        showHome();

        // Efecto visual de regreso al HUB
        if (logo) {
            logo.classList.add('-scale-x-100');
            setTimeout(() => logo.classList.remove('-scale-x-100'), 700);
        }

        toggleMenu();
    }
}

function toggleMenu() {
    const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
    const logo = document.getElementById('main-logo');

    s.classList.toggle('-translate-x-full');
    o.classList.toggle('hidden');

    // Animación Premium al Logo cuando se abre/cierra
    if (logo) {
        logo.classList.toggle('-rotate-90');
        logo.classList.toggle('scale-75');
        logo.classList.toggle('opacity-70');
    }
}


// === LÓGICA DEL MINI-MODAL DE USUARIO ===
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const icon = document.getElementById('user-menu-icon');
    
    if (dropdown.classList.contains('opacity-0')) {
        // Abrir
        dropdown.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        dropdown.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        icon.classList.add('rotate-180'); // Gira la flechita hacia arriba
    } else {
        // Cerrar
        dropdown.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
        dropdown.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
        icon.classList.remove('rotate-180'); // Restaura la flechita
    }
}

function openCredentialsModal() {
    const m = document.getElementById('credentialsModal');
    const userStr = localStorage.getItem('genUser');
    
    if (userStr) {
        document.getElementById('newUsername').value = JSON.parse(userStr).usuario;
    }
    document.getElementById('newPassword').value = '';
    
    m.classList.remove('hidden'); 
    m.classList.add('flex');
    
    // Animación fluida de entrada
    requestAnimationFrame(() => {
        m.classList.remove('opacity-0');
        m.children[0].classList.remove('scale-95');
    });
    
    toggleMenu(); // Cerramos el sidebar
}

function closeCredentialsModal() {
    const m = document.getElementById('credentialsModal');
    
    // Animación fluida de salida
    m.classList.add('opacity-0');
    m.children[0].classList.add('scale-95');
    
    setTimeout(() => {
        m.classList.remove('flex');
        m.classList.add('hidden');
    }, 300);
}

function logout() {
    showSystemModal('confirm', '¿Cerrar Sesión?', 'Estás a punto de salir de la plataforma. Tendrás que volver a ingresar tus credenciales.', () => {
        localStorage.removeItem('genUser'); 
        localStorage.removeItem('genAppsCatalog');
        document.getElementById('appViewer').src = "about:blank"; 
        checkAuthState();
        
        // Escondemos el menú y el sidebar si estaban abiertos
        const dropdown = document.getElementById('user-dropdown');
        if(dropdown) dropdown.classList.add('opacity-0', 'pointer-events-none');
        const sidebar = document.getElementById('sidebar');
        if(sidebar && !sidebar.classList.contains('-translate-x-full')) toggleMenu();
    });
}

function optimizarLinkImagen(url) {
    if (!url) return "";
    if (url.includes("drive.google.com")) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return url;
}

// === COMUNICACIÓN CON MICRO-FRONTENDS (HANDSHAKE) ===
window.addEventListener("message", (event) => {
    // Escuchamos si algún iframe nos dice que ya está listo
    if (event.data && event.data.type === 'MODULO_LISTO') {
        console.log("GENAPPS: Módulo Iframe listo. Inyectando sesión...");

        // Buscamos la sesión local
        const sessionStr = localStorage.getItem('genUser');

        if (sessionStr) {
            const iframe = document.getElementById('appViewer'); // ID de tu iframe en GENAPPS

            if (iframe && iframe.contentWindow) {
                // Le enviamos la sesión al Iframe
                iframe.contentWindow.postMessage({
                    type: 'SESSION_SYNC',
                    user: JSON.parse(sessionStr),
                    theme: localStorage.getItem('genTheme') || 'light'
                }, '*');
            }
        } else {
            console.warn("GENAPPS: Iframe pidió sesión, pero no hay usuario logueado.");
        }
    }
});

window.addEventListener('popstate', (event) => {
    showHome(true);
});

// === MOTOR DE MODALES DEL SISTEMA (Reemplaza alert y confirm) ===
function showSystemModal(type, title, message, onConfirmCallback) {
    const modal = document.getElementById('systemModal');
    const iconEl = document.getElementById('sysModalIcon');
    const titleEl = document.getElementById('sysModalTitle');
    const msgEl = document.getElementById('sysModalMessage');
    const btnsEl = document.getElementById('sysModalButtons');

    titleEl.textContent = title;
    msgEl.innerHTML = message.replace('\n', '<br>'); // Respeta saltos de línea
    btnsEl.innerHTML = ''; // Limpiamos botones
    
    if (type === 'confirm') {
        iconEl.className = 'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-4xl bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-inner';
        iconEl.innerHTML = '<i class="ph ph-warning-circle"></i>';
        
        btnsEl.innerHTML = `
            <button id="sysBtnCancel" class="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            <button id="sysBtnConfirm" class="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 transition-all shadow-lg shadow-brand-500/30">Sí, salir</button>
        `;

        document.getElementById('sysBtnCancel').onclick = () => closeSystemModal();
        document.getElementById('sysBtnConfirm').onclick = () => {
            closeSystemModal();
            if(onConfirmCallback) onConfirmCallback();
        };
    } else {
        // Modal tipo 'alert' o 'error'
        const isError = type === 'error';
        iconEl.className = `w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-4xl text-white shadow-inner ${isError ? 'bg-gradient-to-br from-brand-500 to-brand-700' : 'bg-gradient-to-br from-sky-400 to-sky-600'}`;
        iconEl.innerHTML = isError ? '<i class="ph ph-x-circle"></i>' : '<i class="ph ph-info"></i>';
        
        btnsEl.innerHTML = `
            <button id="sysBtnConfirm" class="w-full py-3 px-4 rounded-xl font-bold text-white bg-gray-800 hover:bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 transition-colors shadow-lg">Entendido</button>
        `;
        document.getElementById('sysBtnConfirm').onclick = () => closeSystemModal();
    }

    // Mostrar con animación
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.children[0].classList.remove('scale-95');
    });
}

function closeSystemModal() {
    const modal = document.getElementById('systemModal');
    modal.classList.add('opacity-0');
    modal.children[0].classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// === BOTÓN FLOTANTE DRAGGABLE Y CLIC (UNIFICADO PC Y MÓVIL) ===
function initBotonesFlotantes() {
    const floatBtn = document.getElementById('floating-menu-btn');
    if (!floatBtn) return;

    let isDragging = false;
    let isMouseDown = false;
    let startX, startY, initialX, initialY;

    // Helper: Obtener coordenadas sin importar si es dedo o ratón
    const getClientX = (e) => e.touches ? e.touches[0].clientX : e.clientX;
    const getClientY = (e) => e.touches ? e.touches[0].clientY : e.clientY;

    const dragStart = (e) => {
        // Ignorar clics derechos en PC
        if (e.type === 'mousedown' && e.button !== 0) return; 

        isMouseDown = true;
        isDragging = false;
        initialX = getClientX(e);
        initialY = getClientY(e);
        
        const rect = floatBtn.getBoundingClientRect();
        startX = rect.left;
        startY = rect.top;
        
        floatBtn.style.transition = 'none'; // Movimiento fluido sin delay
        floatBtn.style.cursor = 'grabbing'; // Cambiar el cursor en PC
    };

    const dragMove = (e) => {
        if (!isMouseDown) return;

        const currentX = getClientX(e);
        const currentY = getClientY(e);
        const dx = currentX - initialX;
        const dy = currentY - initialY;

        // Umbral de 5px para diferenciar un clic tembloroso de un arrastre real
        if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
            isDragging = true;
        }

        if (isDragging) {
            e.preventDefault(); // Evitar seleccionar texto o hacer scroll de fondo
            
            // Delimitar para que no se salga de la pantalla
            const maxX = window.innerWidth - floatBtn.offsetWidth;
            const maxY = window.innerHeight - floatBtn.offsetHeight;
            
            let newX = Math.max(0, Math.min(startX + dx, maxX));
            let newY = Math.max(0, Math.min(startY + dy, maxY));
            
            floatBtn.style.left = `${newX}px`;
            floatBtn.style.top = `${newY}px`;
            floatBtn.style.right = 'auto';
            floatBtn.style.bottom = 'auto';
        }
    };

    const dragEnd = () => {
        isMouseDown = false;
        floatBtn.style.transition = ''; // Recuperar animaciones de hover
        floatBtn.style.cursor = 'pointer';
        
        if (isDragging) {
            // Un pequeño retraso para evitar que se dispare el 'click' al soltar el botón
            setTimeout(() => { isDragging = false; }, 100);
        }
    };

    // 1. EVENTOS DE RATÓN (PC)
    floatBtn.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove, { passive: false });
    document.addEventListener('mouseup', dragEnd);

    // 2. EVENTOS TÁCTILES (Móvil)
    floatBtn.addEventListener('touchstart', dragStart, { passive: true });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);

    // 3. EVENTO CLIC (Abrir menú)
    floatBtn.addEventListener('click', (e) => {
        if (!isDragging) {
            toggleMenu();
        } else {
            e.preventDefault(); // Bloquear si fue un arrastre
        }
    });
}

// === GESTOS TÁCTILES (SWIPE NATIVO LATERAL PARA PANELES) ===
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: true});

document.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture(touchEndX, touchEndY);
}, {passive: true});

function handleSwipeGesture(endX, endY) {
    const diffX = endX - touchStartX;
    const diffY = endY - touchStartY;
    const absDiffX = Math.abs(diffX);
    const absDiffY = Math.abs(diffY);
    
    // Si el movimiento fue más vertical que horizontal (ej. scrolling natural)
    if (absDiffY > absDiffX) {
        return;
    }

    // Umbral mínimo de swipe (evita toques accidentales)
    if (absDiffX < 50) return;

    const sidebar = document.getElementById('sidebar');
    
    // Verificamos si el modal existe en el DOM
    if (!sidebar) return;

    const isSidebarOpen = !sidebar.classList.contains('-translate-x-full');

    if (diffX > 0) {
        // SWIPE RIGHT (Hacia la derecha -> )
        if (!isSidebarOpen && touchStartX < 30) {
            // Abrir menú principal arrastrando desde el borde izquierdo
            toggleMenu();
        }
    } else {
        // SWIPE LEFT (Hacia la izquierda <- )
        if (isSidebarOpen) {
            // Cerrar menú principal arrastrándolo a la izquierda
            toggleMenu();
        }
    }
}
