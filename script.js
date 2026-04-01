/**
 * @fileoverview CORE GENAPP - Sistema POE Industrial (WYSIWYG NATIVO - BARRA GLOBAL)
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

let state = {
  poes: [],
  config: [],
  form: { advancedSteps: [], editingId: null }
};

// ==========================================
// 2. MOTOR WYSIWYG Y LECTURA DE CAMPOS
// ==========================================
window.initRichEditors = function () {
  document.querySelectorAll(".rich-editor").forEach((editor) => {
    // Evita doble asignación de eventos
    if (editor.classList.contains("initialized")) return;
    editor.classList.add("initialized");

    editor.addEventListener("paste", function (e) {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    editor.addEventListener("keydown", function (e) {
      // Previene generación extraña de DIVs al dar Enter
      if (
        e.key === "Enter" &&
        !document.queryCommandState("insertOrderedList") &&
        !document.queryCommandState("insertUnorderedList")
      ) {
        document.execCommand("insertLineBreak");
        e.preventDefault();
      }
    });
  });
};

window.setListType = function (type) {
  let node = document.getSelection().anchorNode;
  while (node && node.nodeName !== "OL" && node.nodeName !== "DIV") {
    node = node.parentNode;
  }
  if (node && node.nodeName === "OL") node.type = type;
};

const getFieldValue = (id) => {
  const el = document.getElementById(id);
  if (!el) return "";
  return el.classList.contains("rich-editor")
    ? el.innerHTML.trim()
    : el.value.trim();
};

const setFieldValue = (id, val) => {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains("rich-editor")) el.innerHTML = val || "";
  else el.value = val || "";
};

// ==========================================
// 3. MOTOR DE BASE DE DATOS (INDEXEDDB)
// ==========================================
const POEDB = {
  db: null,
  useRAM: false,
  ramDB: { poes: [], sync_queue: [], sys_config: [] },
  init() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("POE_DB_V7", 1);
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
// 4. UI DINÁMICA Y RENDERIZADO
// ==========================================
window.refreshUI = async function () {
  state.config = await POEDB.getAll("sys_config");
  const allPoes = await POEDB.getAll("poes");

  state.poes = allPoes.filter((p) => {
    const s = String(p.status || "")
      .trim()
      .toUpperCase();
    return (
      s === "ACT" ||
      s === "REV" ||
      s === "ACTIVO" ||
      s === "EN REVISION" ||
      s === "EN REVISIÓN"
    );
  });

  window.buildDynamicDictionaries();
  window.renderPOEs();

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
  const categories = state.config.filter((c) => c.type === "CATEGORY");
  const statuses = state.config.filter((c) => c.type === "STATUS");

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
  if (state.form.editingId) return;
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
        ? `<span class="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-[10px] font-bold uppercase">En Cola</span>`
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
      <td class="p-4 text-right flex justify-end space-x-2">
        <button type="button" onclick="window.viewPOE('${
          poe.id
        }')" class="text-blue-600 bg-blue-50 px-3 py-1.5 rounded font-semibold transition hover:bg-blue-100" title="Ver Documento">👁️</button>
        <button type="button" onclick="window.editPOE('${
          poe.id
        }')" class="text-yellow-600 bg-yellow-50 px-3 py-1.5 rounded font-semibold transition hover:bg-yellow-100" title="Editar Documento">✏️</button>
        <button type="button" onclick="window.deletePOE('${
          poe.id
        }')" class="text-red-600 bg-red-50 px-3 py-1.5 rounded font-semibold transition hover:bg-red-100" title="Marcar Obsoleto">✖</button>
      </td>
    </tr>`;
    })
    .join("");
};

// ==========================================
// 5. BUILDER DE PASOS E IMÁGENES
// ==========================================
window.updateFileText = function (input) {
  const d = document.getElementById("fileNameDisplay");
  if (!d) return;
  if (input.files.length > 0) {
    d.textContent = "📸 " + input.files[0].name;
    d.classList.add("text-blue-600", "font-bold");
  } else {
    d.textContent = "📸 Adjuntar evidencia visual (Opcional)...";
    d.classList.remove("text-blue-600", "font-bold");
  }
};

window.addAdvancedStep = function () {
  const desc = getFieldValue("stepDesc");
  if (!desc || desc === "<br>") return alert("Describa el paso operativo.");

  const typeInput = document.getElementById("stepType");
  const fileInput = document.getElementById("stepImage");
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
  setFieldValue("stepDesc", "");
  const fileInput = document.getElementById("stepImage");
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
    container.innerHTML = `<div class="flex flex-col items-center justify-center py-10 text-gray-400"><p class="text-sm font-medium">Agregue el primer paso del procedimiento.</p></div>`;
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
      <div class="flex-grow overflow-hidden">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${badgeColor}">${
        s.type
      }</span>
            <button type="button" onclick="window.removeAdvancedStep(${
              s.id
            })" class="text-red-400 font-bold hover:text-red-600 transition">X</button>
          </div>
          <div class="text-sm font-medium text-gray-800 leading-relaxed">${
            s.desc
          }</div>
          ${imgHTML}
      </div>
    </div>`;
    })
    .join("");
};

// ==========================================
// 6. CRUD Y EDICIÓN
// ==========================================
window.handleFormSubmit = async function (e) {
  e.preventDefault();

  if (state.form.advancedSteps.length === 0)
    return alert("Debe incluir al menos 1 paso en el procedimiento.");

  const isEditing = !!state.form.editingId;
  const poeId = isEditing ? state.form.editingId : `UUID-${Date.now()}`;

  let originalDate = new Date().toISOString();
  if (isEditing) {
    const existing = state.poes.find((p) => p.id === poeId);
    if (existing) originalDate = existing.date;
  }

  const poeData = {
    id: poeId,
    code: getFieldValue("code"),
    category: getFieldValue("category"),
    subCategory: getFieldValue("poeSubCategory"),
    title: getFieldValue("title"),
    version: getFieldValue("poeVersion"),
    status: getFieldValue("poeStatus"),
    objective: getFieldValue("objective"),
    scope: getFieldValue("scope"),
    frequency: getFieldValue("monitoring"),
    responsibles: getFieldValue("responsibles"),
    definitions: getFieldValue("definitions"),
    materials: getFieldValue("materials"),
    monitoring: getFieldValue("monitoring"),
    corrective_actions: getFieldValue("correctiveActions"),
    records: getFieldValue("records"),
    references: getFieldValue("references"),
    procedure: JSON.stringify(state.form.advancedSteps),
    date: originalDate,
    _syncStatus: "pending"
  };

  await POEDB.save("poes", poeData);
  await POEDB.save("sync_queue", { id: poeData.id, payload: poeData });

  window.closeModal();
  await window.refreshUI();
  window.pushSync();
};

window.deletePOE = async function (id) {
  if (!confirm("¿Está seguro de eliminar este procedimiento?")) return;
  const poe = state.poes.find((p) => p.id === id);
  if (poe) {
    poe.status = "OBS";
    poe._syncStatus = "pending";
    await POEDB.save("sync_queue", { id, payload: poe });
    await POEDB.delete("poes", id);
    await window.refreshUI();
    window.pushSync();
  }
};

window.editPOE = function (id) {
  const poe = state.poes.find((p) => p.id === id);
  if (!poe) return;

  state.form.editingId = poe.id;
  document.getElementById(
    "modalTitle"
  ).textContent = `Editar Procedimiento: ${poe.code}`;

  const catSelect = document.getElementById("category");
  const subCatSelect = document.getElementById("poeSubCategory");
  const codeInput = document.getElementById("code");

  catSelect.value = poe.category;
  catSelect.disabled = true;
  catSelect.classList.add("bg-gray-100", "cursor-not-allowed");
  window.updateSubCategories();

  setTimeout(() => {
    subCatSelect.value = poe.subCategory;
    subCatSelect.disabled = true;
    subCatSelect.classList.add("bg-gray-100", "cursor-not-allowed");
    codeInput.value = poe.code;
  }, 50);

  let nextVersion = (parseFloat(poe.version || 1.0) + 0.1).toFixed(1);
  if (isNaN(nextVersion)) nextVersion = "1.1";

  document.getElementById("poeVersion").value = nextVersion;
  document
    .getElementById("poeVersion")
    .classList.add("bg-blue-50", "text-blue-800", "font-bold");

  setFieldValue("title", poe.title);
  setFieldValue("poeStatus", poe.status || "ACT");
  setFieldValue("objective", poe.objective);
  setFieldValue("scope", poe.scope);
  setFieldValue("responsibles", poe.responsibles);
  setFieldValue("definitions", poe.definitions);
  setFieldValue("materials", poe.materials);
  setFieldValue("monitoring", poe.monitoring || poe.frequency);
  setFieldValue("correctiveActions", poe.corrective_actions);
  setFieldValue("records", poe.records);
  setFieldValue("references", poe.references);

  try {
    state.form.advancedSteps = JSON.parse(poe.procedure);
  } catch (e) {
    state.form.advancedSteps = [];
  }
  window.renderAdvancedSteps();

  const m = document.getElementById("modal");
  if (m) {
    m.classList.remove("hidden");
    m.classList.add("flex");
  }
};

// ==========================================
// 7. VISOR DE DOCUMENTO Y EXPORTACIÓN
// ==========================================
window.viewPOE = function (id) {
  const poe = state.poes.find((p) => p.id === id);
  if (!poe) return;

  const btnExportWord = document.getElementById("btnExportWord");
  if (btnExportWord)
    btnExportWord.onclick = () => window.exportPOEToWord(poe.id);

  let stepsHTML = "";
  try {
    const arr = JSON.parse(poe.procedure);
    stepsHTML = arr
      .map((s, i) => {
        const bColor =
          s.type === "PCC"
            ? "bg-red-100 text-red-800 border-red-200"
            : s.type === "PC"
            ? "bg-yellow-100 text-yellow-800 border-yellow-200"
            : "bg-gray-100 text-gray-600 border-gray-200";
        const img = s.image
          ? `<img src="${s.image}" class="mt-4 max-h-64 object-cover rounded-xl border border-gray-200 shadow-sm">`
          : "";
        return `
      <div class="flex gap-4 p-5 md:p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition">
        <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-black flex items-center justify-center shrink-0 text-lg border border-blue-200">${
          i + 1
        }</div>
        <div class="flex-grow overflow-hidden">
           <span class="text-[10px] font-black px-2.5 py-1 rounded border uppercase mb-3 inline-block tracking-widest ${bColor}">${
          s.type
        }</span>
           <div class="text-base font-medium text-gray-800 leading-relaxed">${
             s.desc
           }</div>
           ${img}
        </div>
      </div>`;
      })
      .join("");
  } catch (e) {
    stepsHTML = `<div class="bg-white p-6 rounded-xl border border-gray-200"><p class="text-base font-medium text-gray-800 leading-relaxed">${poe.procedure}</p></div>`;
  }

  const catObj = state.config.find(
    (c) => c.key === poe.category && c.type === "CATEGORY"
  );
  const catName = catObj
    ? catObj.value
    : FALLBACK_CAT[poe.category]?.name || poe.category;
  const statusColor =
    poe.status === "ACT" || poe.status === "Activo"
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-yellow-100 text-yellow-800 border-yellow-200";
  const statusText = poe.status === "ACT" ? "ACTIVO" : "EN REVISIÓN";

  const vContent = document.getElementById("viewContent");
  if (vContent) {
    vContent.innerHTML = `
      <div class="bg-white p-8 md:p-10 rounded-2xl border border-gray-200 shadow-sm mb-8">
        <div class="flex flex-col md:flex-row justify-between items-start border-b-2 border-gray-100 pb-8 mb-8 gap-6">
          <div class="w-full md:w-2/3">
            <span class="inline-block px-3 py-1 bg-gray-100 text-gray-700 font-bold text-xs rounded-lg uppercase tracking-wider mb-3 border border-gray-200">${catName}</span>
            <h2 class="text-3xl md:text-4xl font-black text-gray-900 uppercase tracking-tight leading-tight">${
              poe.title
            }</h2>
          </div>
          <div class="md:text-right flex flex-col md:items-end bg-gray-50 p-5 rounded-xl border border-gray-200 w-full md:w-1/3">
            <p class="text-2xl font-black font-mono text-blue-800 tracking-wider">${
              poe.code
            }</p>
            <div class="flex items-center md:justify-end gap-3 mt-2 text-sm font-bold text-gray-500">
              <span>Versión ${poe.version}</span><span>•</span><span>${new Date(
      poe.date
    ).toLocaleDateString()}</span>
            </div>
            <div class="mt-4"><span class="inline-flex items-center px-3 py-1 rounded-md text-xs font-black uppercase tracking-widest border ${statusColor}">${statusText}</span></div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
           <div><h4 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">🎯 Objetivo General</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.objective || "No especificado"
           }</div></div>
           <div><h4 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">📏 Alcance Operativo</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.scope || "No especificado"
           }</div></div>
           <div><h4 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">👤 Responsabilidades</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.responsibles || "No especificadas"
           }</div></div>
           <div><h4 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">📝 Definiciones</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.definitions || "Ninguna"
           }</div></div>
           <div class="md:col-span-2"><h4 class="text-xs font-black text-blue-800 uppercase tracking-widest mb-2 flex items-center gap-2">🛠️ Equipos, Materiales y EPPs</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.materials || "No especificados"
           }</div></div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
           <div><h4 class="text-xs font-black text-red-800 uppercase tracking-widest mb-2 flex items-center gap-2">⏱️ Frecuencia / Monitoreo</h4><div class="text-sm text-gray-800 font-bold leading-relaxed bg-red-50 p-5 rounded-xl border border-red-100 h-full">${
             poe.monitoring || poe.frequency || "No especificada"
           }</div></div>
           <div><h4 class="text-xs font-black text-red-800 uppercase tracking-widest mb-2 flex items-center gap-2">⚠️ Acciones Correctivas (Desvíos)</h4><div class="text-sm text-gray-800 font-bold leading-relaxed bg-red-50 p-5 rounded-xl border border-red-100 h-full">${
             poe.corrective_actions || "No especificadas"
           }</div></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">📎 Registros Asociados</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.records || "Ninguno"
           }</div></div>
           <div><h4 class="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">📚 Referencias / Anexos</h4><div class="text-sm text-gray-700 font-medium leading-relaxed bg-gray-50 p-5 rounded-xl border border-gray-100 h-full">${
             poe.references || "Ninguna"
           }</div></div>
        </div>

        <div>
          <h4 class="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 border-b-2 border-gray-200 pb-3">Desarrollo del Procedimiento Operativo</h4>
          <div class="space-y-4">
            ${stepsHTML}
          </div>
        </div>
      </div>
    `;
  }

  const m = document.getElementById("viewModal");
  if (m) {
    document.getElementById("viewTitle").textContent = "Visor de Documento";
    m.classList.remove("hidden");
    m.classList.add("flex");
  }
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
          }]</span></p><div style="margin-top: 0;">${s.desc}</div>${
            s.image
              ? `<img src="${s.image}" width="400" style="border: 1px solid #ccc; margin-top: 10px;">`
              : ""
          }</div>`
      )
      .join("");
  } catch (e) {
    stepsHTML = `<p>${poe.procedure}</p>`;
  }

  const catObj = state.config.find(
    (c) => c.key === poe.category && c.type === "CATEGORY"
  );
  const catName = catObj ? catObj.value : poe.category;

  const htmlStr = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${
    poe.code
  }</title><style>body { font-family: 'Arial'; color: #000; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 8px; text-align: left; vertical-align: top; } th { background-color: #f2f2f2; width: 25%; } h1 { color: #1e3a5f; font-size: 24px; text-transform: uppercase; text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 20px; } h2 { color: #2d5a87; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 25px; } ul { list-style-type: disc; margin-left: 20px; margin-bottom: 5px; } ol { list-style-type: decimal; margin-left: 20px; margin-bottom: 5px; } ol[type="a"] { list-style-type: lower-alpha; } h3 { color: #1e3a5f; font-size: 14px; margin-top: 15px; margin-bottom: 5px; text-transform: uppercase; }</style></head><body>
      <h1>La Genovesa Agroindustrias S.A.<br><span style="font-size:16px;">Procedimiento Operativo Estandarizado</span></h1>
      <table><tr><th>Código:</th><td>${poe.code}</td><th>Versión:</th><td>v${
    poe.version
  } - ${poe.status}</td></tr><tr><th>Título:</th><td colspan="3"><strong>${
    poe.title
  }</strong></td></tr><tr><th>Área:</th><td>${catName}</td><th>Fecha:</th><td>${new Date(
    poe.date
  ).toLocaleDateString()}</td></tr></table>
      <h2>1. Contexto Operativo</h2><p><strong>Objetivo:</strong></p> ${
        poe.objective || "N/A"
      }<p><strong>Alcance:</strong></p> ${
    poe.scope || "N/A"
  }<p><strong>Responsabilidades:</strong></p> ${poe.responsibles || "N/A"}
      <h2>2. Control y Recursos</h2><p><strong>Frecuencia:</strong></p> ${
        poe.monitoring || poe.frequency || "N/A"
      }<p><strong>Acciones Correctivas:</strong></p> ${
    poe.corrective_actions || "N/A"
  }<p><strong>Equipos y Materiales:</strong></p> ${
    poe.materials || "N/A"
  }<p><strong>Definiciones:</strong></p> ${
    poe.definitions || "N/A"
  }<p><strong>Registros:</strong></p> ${poe.records || "N/A"} | ${
    poe.references || ""
  }
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

// ==========================================
// 8. MODALES AUXILIARES Y BOOTLOADER
// ==========================================
window.openModal = function () {
  const form = document.getElementById("poe-form");
  if (form) form.reset();

  state.form.editingId = null;
  document.getElementById("modalTitle").textContent =
    "Registrar Procedimiento (GFSI)";

  document
    .querySelectorAll(".rich-editor")
    .forEach((el) => (el.innerHTML = ""));

  const catSelect = document.getElementById("category");
  const subCatSelect = document.getElementById("poeSubCategory");
  const versionInput = document.getElementById("poeVersion");

  if (catSelect) {
    catSelect.disabled = false;
    catSelect.classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  if (subCatSelect) {
    subCatSelect.disabled = false;
    subCatSelect.classList.remove("bg-gray-100", "cursor-not-allowed");
  }
  if (versionInput) {
    versionInput.value = "1.0";
    versionInput.classList.remove("bg-blue-50", "text-blue-800", "font-bold");
  }

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
window.closeViewModal = function () {
  const m = document.getElementById("viewModal");
  if (m) {
    m.classList.add("hidden");
    m.classList.remove("flex");
  }
};

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
    }
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
      const oldConfig = await POEDB.getAll("sys_config");
      for (let oc of oldConfig) await POEDB.delete("sys_config", oc.key);
      for (let i of jC.data) await POEDB.save("sys_config", i);
    }
    const rP = await fetch(GAS_ENDPOINT + "?action=get_poes");
    const jP = await rP.json();
    if (jP.status === "success") {
      const q = await POEDB.getAll("sync_queue");
      const localPoes = await POEDB.getAll("poes");
      for (let local of localPoes)
        if (!q.find((x) => x.id === local.id))
          await POEDB.delete("poes", local.id);
      for (let p of jP.data)
        if (!q.find((x) => x.id === p.id)) await POEDB.save("poes", p);
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
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> <span>Destruyendo Caché...</span>`;
  btn.disabled = true;
  btn.classList.add("opacity-75", "cursor-wait");
  try {
    window.updateNet("sync");
    await window.pushSync();
    await window.pullSync();
    alert(
      "✅ Caché destruida con éxito. La base de datos local ahora es un espejo exacto de Google Sheets."
    );
  } catch (error) {
    alert("❌ Error de red al intentar sincronizar.");
  } finally {
    window.updateNet(navigator.onLine ? "online" : "offline");
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    btn.classList.remove("opacity-75", "cursor-wait");
  }
};

window.addEventListener("online", () => window.pushSync());
window.addEventListener("offline", () => window.updateNet("offline"));
document.addEventListener("DOMContentLoaded", async () => {
  window.updateNet(navigator.onLine ? "online" : "offline");
  await POEDB.init();
  window.initRichEditors(); // Inicializar Barras de Herramientas
  await window.refreshUI();

  setTimeout(async () => {
    await window.pullSync();
    window.pushSync();
  }, 1000);
});
