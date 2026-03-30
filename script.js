/**
 * @fileoverview CORE GENAPP - Sistema POE Industrial (HACCP)
 * @architecture Headless, Offline-First, O(1) Memory, Separated Structure
 */

// ==========================================
// 1. CONFIGURACIÓN Y ESTADO GLOBALES
// ==========================================
const GAS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbylXo9sXzLBYCdyB1AiDOa7-cyvPutjmy0XCun33Ic1YSFM0YdruE6WfkSt0SCz_PSO2Q/exec";
const FALLBACK_CAT = {
  PROD: {
    name: "Producción",
    sub: {
      PRD: "Producción",
      DES: "Desposte",
      MAD: "Madurados",
      EMP: "Empaque",
      SKN: "Skin"
    }
  },
  LOG: {
    name: "Logística",
    sub: { MPR: "Mat. Prima", INS: "Insumos", PTE: "Prod. Terminado" }
  },
  CAL: {
    name: "Calidad",
    sub: { CTR: "Control Procesos", LAB: "Laboratorio", AUD: "Auditorías" }
  },
  SAN: { name: "Saneamiento", sub: { LXP: "Limpieza Planta", LXT: "Tóxicos" } },
  MANT: { name: "Mantenimiento", sub: { PRV: "Preventivo", COR: "Correctivo" } }
};

let state = { poes: [], config: [], form: { advancedSteps: [] } };

// ==========================================
// 2. MOTOR DE BASE DE DATOS (INDEXEDDB)
// ==========================================
const POEDB = {
  db: null,
  useRAM: false,
  ramDB: { poes: [], sync_queue: [], sys_config: [] },

  init() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("POE_DB_V6", 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("poes"))
            db.createObjectStore("poes", { keyPath: "id" });
          if (!db.objectStoreNames.contains("sync_queue"))
            db.createObjectStore("sync_queue", { keyPath: "id" });
          if (!db.objectStoreNames.contains("sys_config"))
            db.createObjectStore("sys_config", { keyPath: "key" });
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve();
        };
        req.onerror = () => {
          this.useRAM = true;
          resolve();
        };
      } catch (e) {
        this.useRAM = true;
        resolve();
      }
    });
  },

  save(store, data) {
    return new Promise((resolve) => {
      if (this.useRAM) {
        const idx = this.ramDB[store].findIndex(
          (i) => i.id === data.id || i.key === data.key
        );
        if (idx > -1) this.ramDB[store][idx] = data;
        else this.ramDB[store].push(data);
        return resolve();
      }
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).put(data);
      tx.oncomplete = resolve;
    });
  },

  getAll(store) {
    return new Promise((resolve) => {
      if (this.useRAM) return resolve(this.ramDB[store]);
      const tx = this.db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
    });
  },

  delete(store, id) {
    return new Promise((resolve) => {
      if (this.useRAM) {
        this.ramDB[store] = this.ramDB[store].filter(
          (i) => i.id !== id && i.key !== id
        );
        return resolve();
      }
      const tx = this.db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = resolve;
    });
  }
};

// ==========================================
// 3. UI DINÁMICA Y RENDERIZADO
// ==========================================
window.refreshUI = async function () {
  state.config = await POEDB.getAll("sys_config");
  const allPoes = await POEDB.getAll("poes");
  state.poes = allPoes.filter((p) => p.status !== "Obsoleto");

  window.buildDynamicDictionaries();
  window.renderPOEs();

  // Actualizar contadores
  const safeSet = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  safeSet("totalPOEs", state.poes.length);
  safeSet(
    "produccionCount",
    state.poes.filter((p) => p.category === "PROD").length
  );
  safeSet(
    "logisticaCount",
    state.poes.filter((p) => p.category === "LOG").length
  );
  safeSet(
    "calidadCount",
    state.poes.filter((p) => p.category === "CAL").length
  );
};

window.buildDynamicDictionaries = function () {
  if (state.config.length === 0) return;

  const selectCategory = document.getElementById("category");
  const selectStatus = document.getElementById("poeStatus");
  const selectStepType = document.getElementById("stepType");

  const categories = state.config.filter((c) => c.type === "CATEGORY");
  const statuses = state.config.filter((c) => c.type === "STATUS");
  const stepTypes = state.config.filter((c) => c.type === "STEP_TYPE");

  if (selectCategory && categories.length > 0) {
    const cv = selectCategory.value;
    selectCategory.innerHTML =
      '<option value="" disabled selected>Seleccione área...</option>' +
      categories
        .map((c) => `<option value="${c.key}">${c.value}</option>`)
        .join("");
    if (cv) selectCategory.value = cv;
  }

  if (selectStatus && statuses.length > 0) {
    const cv = selectStatus.value;
    selectStatus.innerHTML = statuses
      .map((c) => `<option value="${c.key}">${c.value}</option>`)
      .join("");
    if (cv) selectStatus.value = cv;
  }

  if (selectStepType && stepTypes.length > 0) {
    selectStepType.innerHTML = stepTypes
      .map((c) => `<option value="${c.key}">${c.value}</option>`)
      .join("");
  }
};

window.updateSubCategories = function () {
  const catSelect = document.getElementById("category").value;
  const subSelect = document.getElementById("poeSubCategory");
  if (!subSelect) return;
  subSelect.innerHTML = "";

  const subs = state.config.filter((c) => c.type === `SUBCAT_${catSelect}`);
  if (subs.length > 0) {
    subSelect.innerHTML = subs
      .map((s) => `<option value="${s.key}">${s.value}</option>`)
      .join("");
  } else {
    subSelect.innerHTML = `<option value="GEN">General</option>`;
  }
  window.generatePoeCode();
};

window.generatePoeCode = function () {
  const cat = document.getElementById("category")?.value;
  const sub = document.getElementById("poeSubCategory")?.value;
  if (!cat || !sub) return;

  const count = state.poes.filter(
    (p) => p.category === cat && p.subCategory === sub
  ).length;
  const codeEl = document.getElementById("code");
  if (codeEl)
    codeEl.value = `POE-${cat}-${sub}-${String(count + 1).padStart(3, "0")}`;
};

window.renderPOEs = function () {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  const query =
    document.getElementById("searchInput")?.value.toLowerCase() || "";
  const filtered = state.poes.filter(
    (p) =>
      p.code.toLowerCase().includes(query) ||
      p.title.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Sin procedimientos registrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .slice()
    .reverse()
    .map((poe) => {
      const isPending = poe._syncStatus === "pending";
      const badge = isPending
        ? `<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-[10px] font-bold uppercase">En Cola Local</span>`
        : `<span class="bg-green-100 text-green-800 px-2 py-1 rounded text-[10px] font-bold uppercase">En Nube</span>`;

      const catObj = state.config.find(
        (c) => c.key === poe.category && c.type === "CATEGORY"
      );
      const catName = catObj
        ? catObj.value
        : FALLBACK_CAT[poe.category]?.name || poe.category;

      return `
    <tr class="border-b hover:bg-gray-50 ${isPending ? "bg-yellow-50/30" : ""}">
      <td class="p-4 text-xs font-bold text-blue-900">${poe.code}</td>
      <td class="p-4 font-bold text-gray-800">${poe.title}</td>
      <td class="p-4 text-xs font-bold text-gray-600">${catName}</td>
      <td class="p-4">${badge}</td>
      <td class="p-4 text-right">
        <button type="button" onclick="window.viewPOE('${
          poe.id
        }')" class="text-blue-600 bg-blue-50 px-3 py-1.5 rounded font-semibold mr-2 transition hover:bg-blue-100">Abrir</button>
        <button type="button" onclick="window.deletePOE('${
          poe.id
        }')" class="text-red-600 bg-red-50 px-3 py-1.5 rounded font-semibold transition hover:bg-red-100">X</button>
      </td>
    </tr>`;
    })
    .join("");
};

// ==========================================
// 4. BUILDER DE PASOS E IMÁGENES
// ==========================================
window.updateFileText = function (input) {
  const d = document.getElementById("fileNameDisplay");
  if (!d) return;
  if (input.files.length > 0) {
    d.textContent = "📸 " + input.files[0].name;
    d.classList.add("text-blue-600", "font-bold");
  } else {
    d.textContent = "📸 Adjuntar evidencia...";
    d.classList.remove("text-blue-600", "font-bold");
  }
};

window.addAdvancedStep = function () {
  const descInput = document.getElementById("stepDesc");
  if (!descInput || !descInput.value.trim())
    return alert("Describa el paso operativo.");

  const typeInput = document.getElementById("stepType");
  const fileInput = document.getElementById("stepImage");
  const desc = descInput.value.trim();
  const type = typeInput ? typeInput.value : "INFO";

  if (fileInput && fileInput.files.length > 0) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const cvs = document.createElement("canvas");
        let w = img.width,
          h = img.height;
        if (w > 800) {
          h = Math.round((h * 800) / w);
          w = 800;
        }
        cvs.width = w;
        cvs.height = h;
        cvs.getContext("2d").drawImage(img, 0, 0, w, h);
        state.form.advancedSteps.push({
          id: Date.now(),
          desc,
          type,
          image: cvs.toDataURL("image/jpeg", 0.7)
        });
        _resetStepUI();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    state.form.advancedSteps.push({ id: Date.now(), desc, type, image: null });
    _resetStepUI();
  }
};

function _resetStepUI() {
  const descInput = document.getElementById("stepDesc");
  const fileInput = document.getElementById("stepImage");
  if (descInput) descInput.value = "";
  if (fileInput) {
    fileInput.value = "";
    window.updateFileText(fileInput);
  }
  window.renderAdvancedSteps();
}

window.removeAdvancedStep = function (id) {
  state.form.advancedSteps = state.form.advancedSteps.filter(
    (s) => s.id !== id
  );
  window.renderAdvancedSteps();
};

window.renderAdvancedSteps = function () {
  const container = document.getElementById("advancedStepsList");
  if (!container) return;

  if (state.form.advancedSteps.length === 0) {
    container.innerHTML = `<p class="text-center text-sm text-gray-400 py-4">Aún no hay pasos. Añada el Paso 1 arriba.</p>`;
    return;
  }

  container.innerHTML = state.form.advancedSteps
    .map((s, i) => {
      const badgeColor =
        s.type === "PCC"
          ? "bg-red-100 text-red-800"
          : s.type === "PC"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-gray-100 text-gray-800";
      const imgHTML = s.image
        ? `<img src="${s.image}" class="mt-2 h-16 object-cover rounded border">`
        : "";
      return `
    <div class="bg-white p-3 rounded border border-gray-200 mb-2 flex gap-3 fade-in">
      <div class="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center shrink-0 text-xs">${
        i + 1
      }</div>
      <div class="flex-grow">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeColor}">${
        s.type
      }</span>
            <button type="button" onclick="window.removeAdvancedStep(${
              s.id
            })" class="text-red-400 font-bold hover:text-red-600 transition">X</button>
          </div>
          <p class="text-xs font-medium">${s.desc}</p>
          ${imgHTML}
      </div>
    </div>`;
    })
    .join("");
};

// ==========================================
// 5. CRUD Y FORMULARIOS
// ==========================================
window.handleFormSubmit = async function (e) {
  e.preventDefault();
  const getVal = (id) => document.getElementById(id)?.value || "";

  if (state.form.advancedSteps.length === 0)
    return alert("Debe incluir al menos 1 paso en el procedimiento.");

  const poeData = {
    id: `UUID-${Date.now()}`,
    code: getVal("code"),
    category: getVal("category"),
    subCategory: getVal("poeSubCategory"),
    title: getVal("title"),
    version: getVal("poeVersion"),
    status: getVal("poeStatus"),
    objective: getVal("objective"),
    scope: getVal("scope"),
    frequency: getVal("frequency"),
    responsibles: getVal("responsibles"),
    definitions: getVal("definitions"),
    materials: getVal("materials"),
    monitoring: getVal("monitoring"),
    corrective_actions: getVal("correctiveActions"),
    records: getVal("records"),
    references: getVal("references"),
    procedure: JSON.stringify(state.form.advancedSteps),
    date: new Date().toISOString(),
    _syncStatus: "pending"
  };

  await POEDB.save("poes", poeData);
  await POEDB.save("sync_queue", { id: poeData.id, payload: poeData });

  window.closeModal();
  await window.refreshUI();
  window.pushSync();
};

window.deletePOE = async function (id) {
  if (!confirm("¿Marcar registro como Obsoleto (Borrado Lógico)?")) return;
  const poe = state.poes.find((p) => p.id === id);
  if (poe) {
    poe.status = "OBS";
    poe._syncStatus = "pending";
    await POEDB.save("poes", poe);
    await POEDB.save("sync_queue", { id, payload: poe });
    await window.refreshUI();
    window.pushSync();
  }
};

// ==========================================
// 6. EXPORTACIÓN Y VISTA DE DOCUMENTOS (MODAL VIEW)
// ==========================================
window.viewPOE = function (id) {
  const poe = state.poes.find((p) => p.id === id);
  if (!poe) return;

  const btnPrint = document.getElementById("btnPrint");
  const btnExportWord = document.getElementById("btnExportWord");
  if (btnPrint) btnPrint.onclick = () => window.printPOE(poe.id);
  if (btnExportWord)
    btnExportWord.onclick = () => window.exportPOEToWord(poe.id);

  let stepsHTML = "";
  try {
    const arr = JSON.parse(poe.procedure);
    stepsHTML = arr
      .map((s, i) => {
        const bColor =
          s.type === "PCC"
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-gray-50 text-gray-600 border-gray-200";
        const img = s.image
          ? `<img src="${s.image}" class="mt-2 h-32 rounded-lg border shadow-sm">`
          : "";
        return `
      <div class="flex gap-4 p-4 border-b border-gray-100 last:border-0">
        <div class="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center shrink-0">${
          i + 1
        }</div>
        <div class="flex-grow">
           <span class="text-[10px] font-bold px-2 py-0.5 rounded border uppercase mb-2 inline-block ${bColor}">${
          s.type
        }</span>
           <p class="text-sm font-medium text-gray-800">${s.desc}</p>
           ${img}
        </div>
      </div>`;
      })
      .join("");
  } catch (e) {
    stepsHTML = `<p class="p-4 text-sm">${poe.procedure}</p>`;
  }

  const catObj = state.config.find(
    (c) => c.key === poe.category && c.type === "CATEGORY"
  );
  const catName = catObj ? catObj.value : poe.category;

  const vContent = document.getElementById("viewContent");
  if (vContent) {
    vContent.innerHTML = `
      <div class="border-2 border-gray-800 rounded-lg p-6 mb-6">
         <div class="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
            <div><h2 class="text-2xl font-black text-gray-900 uppercase tracking-tight">${
              poe.title
            }</h2><p class="text-sm font-bold text-gray-600 mt-1">Área: ${catName}</p></div>
            <div class="text-right"><p class="text-lg font-bold font-mono text-blue-800">${
              poe.code
            }</p><p class="text-sm font-bold text-gray-600">V${
      poe.version
    } | ${new Date(poe.date).toLocaleDateString()}</p></div>
         </div>
         <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">🎯 Objetivo</h4><p class="text-sm text-gray-800 font-medium">${
             poe.objective || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">📏 Alcance</h4><p class="text-sm text-gray-800 font-medium">${
             poe.scope || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">⏱️ Frecuencia</h4><p class="text-sm text-gray-800 font-medium">${
             poe.frequency || poe.monitoring || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">👤 Responsables</h4><p class="text-sm text-gray-800 font-medium">${
             poe.responsibles || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">⚠️ Acciones Correctivas</h4><p class="text-sm text-gray-800 font-medium">${
             poe.corrective_actions || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">🛠️ Equipos y Materiales</h4><p class="text-sm text-gray-800 font-medium">${
             poe.materials || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">📝 Definiciones</h4><p class="text-sm text-gray-800 font-medium">${
             poe.definitions || "N/A"
           }</p></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-1">📎 Registros / Anexos</h4><p class="text-sm text-gray-800 font-medium">${
             poe.records || "N/A"
           } <br> ${poe.references || ""}</p></div>
         </div>
      </div>
      <div class="border-2 border-gray-800 rounded-lg overflow-hidden">
        <div class="bg-gray-100 border-b-2 border-gray-800 px-6 py-3"><h4 class="font-black text-gray-800 uppercase tracking-widest text-sm">Desarrollo del Procedimiento Operativo</h4></div>
        <div class="p-2">${stepsHTML}</div>
      </div>
    `;
  }
  window.openViewModal();
};

window.exportPOEToWord = function (id) {
  const poe = state.poes.find((p) => p.id === id);
  if (!poe) return;

  let stepsHTML = "";
  try {
    const arr = JSON.parse(poe.procedure);
    stepsHTML = arr
      .map(
        (s, i) =>
          `<div style="margin-bottom: 20px;"><p><strong>Paso ${
            i + 1
          }</strong> <span style="color: #555;">[${
            s.type
          }]</span></p><p style="margin-top: 0;">${s.desc}</p>${
            s.image
              ? `<img src="${s.image}" width="400" style="border: 1px solid #ccc; margin-top: 10px;">`
              : ""
          }</div>`
      )
      .join("");
  } catch (e) {
    stepsHTML = `<p>${poe.procedure}</p>`;
  }

  const catName =
    state.config.find((c) => c.key === poe.category && c.type === "CATEGORY")
      ?.value || poe.category;

  const htmlStr = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${
    poe.code
  }</title><style>body { font-family: 'Arial'; color: #000; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 8px; text-align: left; vertical-align: top; } th { background-color: #f2f2f2; width: 25%; } h1 { color: #1e3a5f; font-size: 24px; text-transform: uppercase; text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 20px; } h2 { color: #2d5a87; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 25px; }</style></head><body>
      <h1>La Genovesa Agroindustrias S.A.<br><span style="font-size:16px;">Procedimiento Operativo Estandarizado</span></h1>
      <table><tr><th>Código:</th><td>${poe.code}</td><th>Versión:</th><td>v${
    poe.version
  } - ${poe.status}</td></tr><tr><th>Título:</th><td colspan="3"><strong>${
    poe.title
  }</strong></td></tr><tr><th>Área:</th><td>${catName}</td><th>Fecha:</th><td>${new Date(
    poe.date
  ).toLocaleDateString()}</td></tr></table>
      <h2>1. Contexto Operativo</h2><p><strong>Objetivo:</strong> ${
        poe.objective || "N/A"
      }</p><p><strong>Alcance:</strong> ${
    poe.scope || "N/A"
  }</p><p><strong>Responsabilidades:</strong> ${poe.responsibles || "N/A"}</p>
      <h2>2. Control y Recursos</h2><p><strong>Frecuencia:</strong> ${
        poe.frequency || "N/A"
      }</p><p><strong>Acciones Correctivas:</strong> ${
    poe.corrective_actions || "N/A"
  }</p><p><strong>Equipos y Materiales:</strong> ${
    poe.materials || "N/A"
  }</p><p><strong>Definiciones:</strong> ${
    poe.definitions || "N/A"
  }</p><p><strong>Registros:</strong> ${poe.records || "N/A"} | ${
    poe.references || ""
  }</p>
      <h2>3. Procedimiento Operativo (HACCP)</h2><div style="border: 1px solid #000; padding: 15px;">${stepsHTML}</div>
      <table style="border: none; margin-top: 50px;"><tr style="border: none;"><td style="border: none; text-align: center; width: 50%;">_________________________<br>Firma de Elaboración</td><td style="border: none; text-align: center; width: 50%;">_________________________<br>Aprobación Calidad</td></tr></table></body></html>`;

  const blob = new Blob(["\ufeff", htmlStr], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${poe.code}_${poe.title.replace(/[^a-z0-9]/gi, "_")}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.printPOE = function (id) {
  const content = document.getElementById("viewContent")?.innerHTML;
  if (!content) return;
  const printWin = window.open("", "", "width=900,height=800");
  printWin.document.write(
    `<html><head><title>Imprimir POE</title><script src="https://cdn.tailwindcss.com"></script><style>@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } img { max-height: 250px; page-break-inside: avoid; } .border-2 { border-width: 2px !important; border-color: #1f2937 !important; } .bg-gray-100 { background-color: #f3f4f6 !important; } }</style></head><body class="p-8 bg-white"><div class="text-center mb-6 pb-6 border-b-4 border-gray-900"><h1 class="text-3xl font-black uppercase">La Genovesa Agroindustrias</h1><p class="text-lg font-bold text-gray-600">Sistema HACCP - Documento Controlado</p></div>${content}<div class="mt-12 pt-8 border-t-2 border-gray-400 flex justify-between font-bold text-gray-500"><p>Aprobación Calidad: ______________________</p><p>Impreso: ${new Date().toLocaleDateString()}</p></div><script>setTimeout(() => { window.print(); window.close(); }, 800);</script></body></html>`
  );
  printWin.document.close();
};

// ==========================================
// 7. FUNCIONES DEL MODAL GENERAL
// ==========================================
window.openModal = function () {
  document.getElementById("poe-form")?.reset();
  state.form.advancedSteps = [];
  window.renderAdvancedSteps();
  window.updateSubCategories();
  const m = document.getElementById("modal");
  if (m) {
    m.classList.remove("hidden");
    m.classList.add("flex");
  }
};

window.closeModal = function () {
  const m = document.getElementById("modal");
  if (m) {
    m.classList.add("hidden");
    m.classList.remove("flex");
  }
};

window.openViewModal = function () {
  const m = document.getElementById("viewModal");
  if (m) {
    m.classList.remove("hidden");
    m.classList.add("flex");
  }
};

window.closeViewModal = function () {
  const m = document.getElementById("viewModal");
  if (m) {
    m.classList.add("hidden");
    m.classList.remove("flex");
  }
};

// ==========================================
// 8. MOTOR DE RED (SYNC ENGINE) Y BOOTLOADER
// ==========================================
window.updateNet = function (status) {
  const ind = document.getElementById("network-indicator");
  const txt = document.getElementById("network-text");
  if (!ind || !txt) return;

  if (status === "online") {
    ind.className = "w-2.5 h-2.5 rounded-full bg-green-400 shadow-md";
    txt.textContent = "ONLINE";
  } else if (status === "sync") {
    ind.className =
      "w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shadow-md";
    txt.textContent = "SYNC...";
  } else {
    ind.className = "w-2.5 h-2.5 rounded-full bg-red-500 shadow-md";
    txt.textContent = "OFFLINE";
  }
};

window.pushSync = async function () {
  if (!navigator.onLine) {
    window.updateNet("offline");
    return;
  }
  const q = await POEDB.getAll("sync_queue");
  if (q.length === 0) {
    window.updateNet("online");
    return;
  }

  window.updateNet("sync");
  for (let t of q) {
    try {
      const res = await fetch(GAS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(t.payload)
      });
      const r = await res.json();
      if (r.status === "success") {
        t.payload._syncStatus = "synced";
        await POEDB.save("poes", t.payload);
        await POEDB.delete("sync_queue", t.id);
      }
    } catch (e) {
      break;
    } // Sale del loop si falla la red
  }
  window.updateNet(navigator.onLine ? "online" : "offline");
  window.refreshUI();
};

window.pullSync = async function () {
  if (!navigator.onLine) return;
  try {
    const rC = await fetch(GAS_ENDPOINT + "?action=get_config");
    const jC = await rC.json();
    if (jC.status === "success") {
      for (let i of jC.data) await POEDB.save("sys_config", i);
    }

    const rP = await fetch(GAS_ENDPOINT + "?action=get_poes");
    const jP = await rP.json();
    if (jP.status === "success") {
      const q = await POEDB.getAll("sync_queue");
      for (let p of jP.data) {
        if (!q.find((x) => x.id === p.id)) await POEDB.save("poes", p);
      }
    }
    window.refreshUI();
  } catch (e) {}
};

window.forceSync = async function () {
  if (!navigator.onLine)
    return alert("⚠️ Sistema en modo offline. Revise su conexión a Internet.");

  const btn = document.getElementById("btnForceSync");
  if (!btn) return;

  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> <span>Descargando...</span>`;
  btn.disabled = true;
  btn.classList.add("opacity-75", "cursor-wait");

  try {
    window.updateNet("sync");
    await window.pullSync();
    await window.pushSync();
    alert("✅ Base de datos local actualizada correctamente desde la Nube.");
  } catch (error) {
    alert("❌ Error de red al intentar sincronizar.");
  } finally {
    window.updateNet(navigator.onLine ? "online" : "offline");
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    btn.classList.remove("opacity-75", "cursor-wait");
  }
};

// Eventos del Sistema
window.addEventListener("online", () => window.pushSync());
window.addEventListener("offline", () => window.updateNet("offline"));

// ARRANQUE SEGURO (Bootloader)
document.addEventListener("DOMContentLoaded", async () => {
  window.updateNet(navigator.onLine ? "online" : "offline");
  await POEDB.init();
  await window.refreshUI();

  // Ejecución en segundo plano para no bloquear la UI
  setTimeout(async () => {
    await window.pullSync();
    window.pushSync();
  }, 1000);
});
