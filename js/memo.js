import { appState, safeSetItem, MEMO_CATEGORIES, DAYS_STR } from './state.js';
import { saveToFirebase } from './firebase.js';

// ==========================================
// 手書きキャンバス用のモジュール内変数
// ==========================================
let isMemoDrawing = false;
let isMemoDrawingMode = false;
let memoCurrentTool = 'pen';
let memoCurrentColor = '#000000';
let memoCurrentLineWidth = 4;
let memoLastX = 0, memoLastY = 0;
let memoCanvas = null, memoCtx = null;
let autoSaveTimeout = null;

// ==========================================
// 内部のみで使うヘルパー関数
// ==========================================
const formatDateForMemo = (timestamp) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getFolderPath = (folderId) => {
    let path = [];
    let curr = appState.allFolders.find(f => f.id === folderId);
    while (curr) {
        path.unshift(curr);
        curr = appState.allFolders.find(f => f.id === curr.parentId);
    }
    return path;
};

const isCanvasBlank = (canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const pixelBuffer = new Uint32Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    return !pixelBuffer.some(color => color !== 0);
};

const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text; 
    textArea.style.position = "fixed"; textArea.style.top = "0"; textArea.style.left = "0";
    document.body.appendChild(textArea); 
    textArea.focus(); textArea.select();
    try { 
        const successful = document.execCommand('copy'); 
        if (successful) alert("テキストをコピーしました"); 
    } catch (err) {}
    document.body.removeChild(textArea);
};


// ==========================================
// UI・リストの描画と制御
// ==========================================
export const toggleMemoSidebar = () => {
    const sidebar = document.getElementById('memo-sidebar');
    const overlay = document.getElementById('memo-sidebar-overlay');
    const openBtnPc = document.getElementById('memo-sidebar-open-btn-pc');
    const isMobile = window.innerWidth < 640;
    
    if (isMobile) {
        if (sidebar.classList.contains('-ml-48')) {
            sidebar.classList.remove('-ml-48'); sidebar.classList.add('ml-0');
            overlay.classList.remove('hidden');
        } else {
            sidebar.classList.remove('ml-0'); sidebar.classList.add('-ml-48');
            overlay.classList.add('hidden');
        }
    } else {
        if (sidebar.classList.contains('sm:-ml-48')) {
            sidebar.classList.remove('sm:-ml-48'); sidebar.classList.add('sm:ml-0');
            if (openBtnPc) openBtnPc.classList.add('hidden');
        } else {
            sidebar.classList.remove('sm:ml-0'); sidebar.classList.add('sm:-ml-48');
            if (openBtnPc) openBtnPc.classList.remove('hidden');
        }
    }
};

export const renderMemoSidebar = () => {
    const list = document.getElementById('memo-category-list');
    let html = '';
    MEMO_CATEGORIES.forEach(cat => {
        html += `
            <button onclick="window.selectMemoFilter('${cat.id}')" class="w-full text-left px-3 py-1.5 hover:bg-gray-200 flex items-center gap-2 transition" id="memo-filter-${cat.id}">
                <i class="${cat.icon} w-4 text-center ${cat.color} text-xs"></i> <span class="font-bold text-xs text-gray-700">${cat.name}</span>
            </button>
        `;
    });
    html += `
        <div class="px-3 mt-4 mb-1"><span class="text-[10px] font-bold text-gray-400">システム</span></div>
        <button onclick="window.selectMemoFilter('trash')" class="w-full text-left px-3 py-1.5 hover:bg-gray-200 flex items-center gap-2 transition" id="memo-filter-trash">
            <i class="fas fa-trash-alt w-4 text-center text-red-500 text-xs"></i> <span class="font-bold text-xs text-gray-700">ごみ箱</span>
        </button>
    `;
    list.innerHTML = html;
};

export const selectMemoFilter = (filter) => {
    appState.currentMemoFilter = filter;
    appState.currentMemoFolderId = null; 
    renderMemoList();
    
    ['all', 'favorite', 'trash', ...MEMO_CATEGORIES.map(c=>c.id)].forEach(id => {
        const btn = document.getElementById(`memo-filter-${id}`);
        if(btn) {
            if(id === filter) btn.classList.add('bg-blue-50');
            else btn.classList.remove('bg-blue-50');
        }
    });

    if (window.innerWidth < 640 && document.getElementById('memo-sidebar-overlay').classList.contains('hidden') === false) {
        toggleMemoSidebar();
    }
};

export const changeMemoSort = (value) => {
    if(value) appState.currentMemoSort = value;
    const pSel = document.getElementById('memo-sort-select-pc');
    const mSel = document.getElementById('memo-sort-select-mobile');
    if(pSel && pSel.value !== appState.currentMemoSort) pSel.value = appState.currentMemoSort;
    if(mSel && mSel.value !== appState.currentMemoSort) mSel.value = appState.currentMemoSort;
    renderMemoList();
};

export const renderMemoList = () => {
    const container = document.getElementById('memo-list-container');
    const backBtnPc = document.getElementById('memo-back-btn');
    const backBtnSp = document.getElementById('memo-back-btn-mobile');
    const addFolderBtnPc = document.getElementById('memo-add-folder-btn');
    const addFolderBtnSp = document.getElementById('memo-add-folder-btn-mobile');
    
    let filteredMemos = [];
    let currentFolders = [];

    if (appState.currentMemoFilter === 'favorite') {
        filteredMemos = appState.allMemos.filter(m => m.isFavorite && m.categoryId !== 'trash');
        addFolderBtnPc?.classList.add('hidden'); addFolderBtnSp?.classList.add('hidden');
    } else if (appState.currentMemoFilter === 'all') {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        filteredMemos = appState.allMemos.filter(m => {
            if (m.categoryId === 'trash') return false;
            const targetTime = m.lastOpenedAt || m.updatedAt || 0;
            return targetTime >= oneWeekAgo;
        });
        addFolderBtnPc?.classList.add('hidden'); addFolderBtnSp?.classList.add('hidden');
    } else if (appState.currentMemoFilter === 'trash') {
        filteredMemos = appState.allMemos.filter(m => m.categoryId === 'trash');
        addFolderBtnPc?.classList.add('hidden'); addFolderBtnSp?.classList.add('hidden');
    } else {
        addFolderBtnPc?.classList.remove('hidden'); addFolderBtnSp?.classList.remove('hidden');
        currentFolders = appState.allFolders.filter(f => f.categoryId === appState.currentMemoFilter && f.parentId === appState.currentMemoFolderId);
        filteredMemos = appState.allMemos.filter(m => m.categoryId === appState.currentMemoFilter && m.folderId === appState.currentMemoFolderId);
    }

    // ソート処理
    filteredMemos.sort((a, b) => {
        const [key, order] = appState.currentMemoSort.split('_');
        let valA, valB;
        if (key === 'title') {
            valA = a.title || ''; valB = b.title || '';
            return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (key === 'createdAt') {
            valA = a.createdAt || a.updatedAt || 0; valB = b.createdAt || b.updatedAt || 0;
        } else {
            valA = a.updatedAt || 0; valB = b.updatedAt || 0;
        }
        return order === 'asc' ? valA - valB : valB - valA;
    });

    let title = "";
    if (appState.currentMemoFilter === 'favorite') title = "お気に入り";
    else if (appState.currentMemoFilter === 'all') title = "最近使ったメモ";
    else if (appState.currentMemoFilter === 'trash') title = "ごみ箱";
    else {
        const cat = MEMO_CATEGORIES.find(c => c.id === appState.currentMemoFilter);
        title = cat ? cat.name : "メモ";
        if (appState.currentMemoFolderId) {
            const path = getFolderPath(appState.currentMemoFolderId);
            if (path.length > 0) title = path[path.length - 1].name;
            
            backBtnPc?.classList.remove('hidden'); backBtnSp?.classList.remove('hidden');
            const parentId = path.length > 1 ? path[path.length - 2].id : null;
            if(backBtnPc) backBtnPc.onclick = () => { enterFolder(parentId); };
            if(backBtnSp) backBtnSp.onclick = () => { enterFolder(parentId); };
        } else {
            backBtnPc?.classList.add('hidden'); backBtnSp?.classList.add('hidden');
        }
    }
    
    document.getElementById('memo-list-title').textContent = title;
    const titleMobile = document.getElementById('memo-list-title-mobile');
    if (titleMobile) titleMobile.textContent = title;

    if (filteredMemos.length === 0 && currentFolders.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400 font-bold"><i class="fas fa-folder-open text-3xl mb-3 opacity-50"></i><p class="text-xs">アイテムがありません</p></div>`;
        return;
    }

    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">';
    
    currentFolders.forEach(folder => {
        html += `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 shadow-sm hover:shadow-md hover:bg-blue-100 cursor-pointer transition flex items-center gap-2 h-12 group relative" onclick="window.enterFolder('${folder.id}')">
                <i class="fas fa-folder text-blue-400 text-lg"></i>
                <h3 class="font-bold text-[#4a5f73] truncate text-sm flex-1">${folder.name}</h3>
                <button onclick="event.stopPropagation(); window.deleteFolder('${folder.id}')" class="absolute right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-1.5 bg-white/80 rounded"><i class="fas fa-trash-alt text-xs"></i></button>
            </div>
        `;
    });

    filteredMemos.forEach(memo => {
        const cat = MEMO_CATEGORIES.find(c => c.id === memo.categoryId) || { icon: 'fas fa-trash-alt', color: 'text-red-500' };
        const dateStr = formatDateForMemo(memo.updatedAt);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = memo.content || '';
        const plainText = tempDiv.innerText || tempDiv.textContent || '';
        const preview = plainText.replace(/\n/g, ' ').substring(0, 60) || '本文なし';
        
        const favIcon = memo.isFavorite ? '<i class="fas fa-star text-yellow-400"></i>' : '';
        const hasDrawing = memo.canvasData ? '<i class="fas fa-pen-nib text-blue-400 ml-1.5 text-[10px]" title="手書きメモあり"></i>' : '';

        html += `
            <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md cursor-pointer transition flex flex-col h-24 group" onclick="window.openMemoEdit('${memo.id}')">
                <div class="flex justify-between items-start mb-1.5">
                    <div class="flex items-center gap-1.5 max-w-[85%]">
                        <i class="${cat.icon} ${cat.color} opacity-70 text-[10px]"></i>
                        <h3 class="font-bold text-[#4a5f73] truncate text-sm flex-1">${memo.title || '無題のメモ'}</h3>
                        ${hasDrawing}
                    </div>
                    <div class="shrink-0 text-[10px]">${favIcon}</div>
                </div>
                <div class="text-[9px] sm:text-[10px] text-gray-400 font-bold mb-1.5">${dateStr}</div>
                <div class="text-[10px] sm:text-xs text-gray-500 truncate flex-1 leading-relaxed opacity-80 group-hover:opacity-100 transition">${preview}</div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
};


// ==========================================
// フォルダ管理
// ==========================================
export const enterFolder = (folderId) => {
    appState.currentMemoFolderId = folderId;
    renderMemoList();
};

export const createNewFolder = () => {
    const name = prompt("新しいフォルダの名前を入力してください");
    if (!name) return;
    
    const newFolder = {
        id: 'folder_' + Date.now() + Math.random().toString(36).substr(2, 5),
        name: name,
        categoryId: appState.currentMemoFilter,
        parentId: appState.currentMemoFolderId
    };
    appState.allFolders.push(newFolder);
    safeSetItem('teacher_planner_folders', JSON.stringify(appState.allFolders));
    saveToFirebase();
    renderMemoList();
};

export const deleteFolder = (folderId) => {
    if(confirm("フォルダを削除しますか？中にあるメモや子フォルダはカテゴリーのルートに移動されます。")) {
        appState.allMemos.forEach(m => { if(m.folderId === folderId) m.folderId = null; });
        appState.allFolders = appState.allFolders.filter(f => f.id !== folderId);
        appState.allFolders.forEach(f => { if(f.parentId === folderId) f.parentId = null; });
        
        safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
        safeSetItem('teacher_planner_folders', JSON.stringify(appState.allFolders));
        saveToFirebase();
        renderMemoList();
    }
};

export const updateMemoFolderOptions = () => {
    const catId = document.getElementById('memo-edit-category').value;
    const folderSelect = document.getElementById('memo-edit-folder');
    const foldersInCat = appState.allFolders.filter(f => f.categoryId === catId);
    
    let html = '<option value="">(ルート)</option>';
    const buildOptions = (parentId, depth) => {
        const children = foldersInCat.filter(f => f.parentId === parentId);
        children.forEach(child => {
            const prefix = '・'.repeat(depth);
            html += `<option value="${child.id}">${prefix} ${child.name}</option>`;
            buildOptions(child.id, depth + 1);
        });
    };
    buildOptions(null, 0);
    folderSelect.innerHTML = html;
};


// ==========================================
// メモ編集処理
// ==========================================
export const updateMemoDateLabel = () => {
    const val = document.getElementById('memo-edit-date').value;
    const label = document.getElementById('memo-edit-day-of-week');
    if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            label.textContent = `(${DAYS_STR[d.getDay()]})`;
            return;
        }
    }
    label.textContent = '';
};

export const triggerAutoSaveMemo = () => {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveMemoLocally();
    }, 800);
};

export const updateDeleteMemoButtonText = () => {
    const btnText = document.getElementById('memo-delete-btn-text');
    const btnIcon = document.getElementById('memo-delete-btn-icon');
    if (appState.editingMemoId) {
        const memo = appState.allMemos.find(m => m.id === appState.editingMemoId);
        if (memo && memo.categoryId === 'trash') {
            if (btnText) btnText.textContent = '完全に削除';
            if (btnIcon) btnIcon.className = 'fas fa-eraser';
            return;
        }
    }
    if (btnText) btnText.textContent = '削除';
    if (btnIcon) btnIcon.className = 'fas fa-trash-alt';
};

export const openMemoEdit = (memoId = null) => {
    appState.editingMemoId = memoId;
    const modal = document.getElementById('memo-edit-modal');
    const titleInput = document.getElementById('memo-edit-title');
    const contentInput = document.getElementById('memo-edit-content');
    const catSelect = document.getElementById('memo-edit-category');
    const folderSelect = document.getElementById('memo-edit-folder');
    const dateInput = document.getElementById('memo-edit-date');
    const favBtn = document.getElementById('memo-edit-fav-btn');

    updateDeleteMemoButtonText();

    if (memoId) {
        const memo = appState.allMemos.find(m => m.id === memoId);
        if (memo) {
            memo.lastOpenedAt = Date.now(); 
            titleInput.value = memo.title;
            contentInput.innerHTML = memo.content || ''; 
            catSelect.value = memo.categoryId || 'other';
            
            updateMemoFolderOptions(); 
            folderSelect.value = memo.folderId || '';

            const d = new Date(memo.createdAt || memo.updatedAt);
            const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            dateInput.value = dStr;
            updateMemoDateLabel();

            if (memo.isFavorite) favBtn.classList.replace('text-gray-300', 'text-yellow-400');
            else favBtn.classList.replace('text-yellow-400', 'text-gray-300');

            if (memoCtx) {
                memoCtx.clearRect(0, 0, memoCanvas.width, memoCanvas.height);
                if (memo.canvasData) {
                    const img = new Image();
                    img.onload = () => {
                        if (appState.editingMemoId === memoId) { 
                            memoCtx.clearRect(0, 0, memoCanvas.width, memoCanvas.height);
                            memoCtx.drawImage(img, 0, 0, memoCanvas.width, memoCanvas.height);
                        }
                    };
                    img.src = memo.canvasData;
                }
            }
        }
    } else {
        titleInput.value = ''; contentInput.innerHTML = ''; 
        const defaultCat = (appState.currentMemoFilter !== 'all' && appState.currentMemoFilter !== 'favorite' && appState.currentMemoFilter !== 'trash') ? appState.currentMemoFilter : 'meeting';
        catSelect.value = defaultCat;
        
        updateMemoFolderOptions();
        folderSelect.value = appState.currentMemoFolderId || '';

        const d = new Date();
        const dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        dateInput.value = dStr;
        updateMemoDateLabel();

        favBtn.classList.replace('text-yellow-400', 'text-gray-300');
        if (memoCtx) memoCtx.clearRect(0, 0, memoCanvas.width, memoCanvas.height);

        const newMemo = {
            id: 'memo_' + Date.now() + Math.random().toString(36).substr(2, 9),
            title: '', content: '', categoryId: defaultCat, folderId: folderSelect.value || null,
            isFavorite: false, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now(), canvasData: ''
        };
        appState.allMemos.push(newMemo);
        appState.editingMemoId = newMemo.id;
    }

    if(isMemoDrawingMode) toggleMemoDrawMode();

    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => { 
        if(!memoId) titleInput.focus(); 
        resizeMemoCanvas(); 
    }, 100);
};

export const toggleMemoFavorite = () => {
    const favBtn = document.getElementById('memo-edit-fav-btn');
    if (favBtn.classList.contains('text-yellow-400')) favBtn.classList.replace('text-yellow-400', 'text-gray-300');
    else favBtn.classList.replace('text-gray-300', 'text-yellow-400');
    if (appState.editingMemoId) triggerAutoSaveMemo(); 
};

export const saveMemoLocally = () => {
    if (!appState.editingMemoId) return;
    const title = document.getElementById('memo-edit-title').value.trim();
    const content = document.getElementById('memo-edit-content').innerHTML; 
    const categoryId = document.getElementById('memo-edit-category').value;
    const folderId = document.getElementById('memo-edit-folder').value || null;
    const isFavorite = document.getElementById('memo-edit-fav-btn').classList.contains('text-yellow-400');
    
    let createTimeVal = Date.now();
    const dateInputVal = document.getElementById('memo-edit-date').value;
    if (dateInputVal) {
        const d = new Date(dateInputVal);
        createTimeVal = d.getTime(); 
    }

    let canvasData = '';
    if (memoCanvas) {
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = memoCanvas.width; tempCanvas.height = memoCanvas.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(memoCanvas, 0, 0);
        canvasData = tempCanvas.toDataURL('image/png', 0.5);
    }

    const memo = appState.allMemos.find(m => m.id === appState.editingMemoId);
    if (memo) {
        memo.title = title; 
        memo.content = content; 
        memo.categoryId = categoryId; 
        if(categoryId !== 'trash') memo.deletedAt = null; 
        
        memo.folderId = folderId;
        memo.isFavorite = isFavorite; 
        memo.createdAt = createTimeVal; 
        memo.updatedAt = Date.now(); 
        memo.canvasData = canvasData;
    }

    safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
    saveToFirebase(); 
    renderMemoList(); 
};

export const saveAndCloseMemo = () => {
    saveMemoLocally();
    
    const memo = appState.allMemos.find(m => m.id === appState.editingMemoId);
    if (memo && !memo.title.trim() && !memo.content.trim() && (!memoCanvas || isCanvasBlank(memoCanvas))) {
        appState.allMemos = appState.allMemos.filter(m => m.id !== appState.editingMemoId);
        safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
        saveToFirebase();
        renderMemoList();
    }
    
    document.getElementById('memo-edit-modal').classList.add('hidden');
    document.getElementById('memo-edit-modal').classList.remove('flex');
    appState.editingMemoId = null;
};

export const deleteMemo = () => {
    if (!appState.editingMemoId) { saveAndCloseMemo(); return; }
    
    const memo = appState.allMemos.find(m => m.id === appState.editingMemoId);
    if (!memo) return;

    if (memo.categoryId === 'trash') {
        if (confirm("このメモを完全に削除してもよろしいですか？（復元できません）")) {
            appState.allMemos = appState.allMemos.filter(m => m.id !== appState.editingMemoId);
            safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
            saveToFirebase(); renderMemoList();
            document.getElementById('memo-edit-modal').classList.add('hidden');
            document.getElementById('memo-edit-modal').classList.remove('flex');
            appState.editingMemoId = null;
        }
    } else {
        if (confirm("このメモをごみ箱に移動しますか？（1ヶ月後に完全に削除されます）")) {
            memo.categoryId = 'trash';
            memo.folderId = null; 
            memo.deletedAt = Date.now();
            memo.isFavorite = false;
            safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
            saveToFirebase(); renderMemoList();
            document.getElementById('memo-edit-modal').classList.add('hidden');
            document.getElementById('memo-edit-modal').classList.remove('flex');
            appState.editingMemoId = null;
        }
    }
};

export const copyMemoText = () => {
    const title = document.getElementById('memo-edit-title').value;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = document.getElementById('memo-edit-content').innerHTML;
    const contentPlain = tempDiv.innerText || tempDiv.textContent;
    const text = `【${title}】\n${contentPlain}`;
    
    try {
        navigator.clipboard.writeText(text).then(() => alert("テキストをコピーしました")).catch(() => fallbackCopyTextToClipboard(text));
    } catch(e) { fallbackCopyTextToClipboard(text); }
};

export const printMemo = () => {
    saveMemoLocally();
    setTimeout(() => window.print(), 100);
};


// ==========================================
// 手書きキャンバスの制御
// ==========================================
export const initMemoCanvas = () => {
    memoCanvas = document.getElementById('memo-drawing-canvas');
    if (!memoCanvas) return;
    memoCtx = memoCanvas.getContext('2d', { willReadFrequently: true });

    const getMemoCoords = (e) => { 
        const rect = memoCanvas.getBoundingClientRect(); 
        return (e.touches && e.touches.length > 0) ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top } : { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
    };

    const startMemoDrawing = (e) => {
        if (!isMemoDrawingMode || (e.type === 'mousedown' && e.button !== 0)) return;
        isMemoDrawing = true; const coords = getMemoCoords(e); memoLastX = coords.x; memoLastY = coords.y;
        if (memoCurrentTool === 'eraser') { memoCtx.globalCompositeOperation = 'destination-out'; memoCtx.lineWidth = memoCurrentLineWidth * 5; memoCtx.fillStyle = 'rgba(0,0,0,1)'; } 
        else if (memoCurrentTool === 'highlighter') { memoCtx.globalCompositeOperation = 'source-over'; const hex = memoCurrentColor; const rgbaColor = `rgba(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}, 0.3)`; memoCtx.strokeStyle = rgbaColor; memoCtx.fillStyle = rgbaColor; memoCtx.lineWidth = memoCurrentLineWidth * 4; } 
        else { memoCtx.globalCompositeOperation = 'source-over'; memoCtx.strokeStyle = memoCurrentColor; memoCtx.fillStyle = memoCurrentColor; memoCtx.lineWidth = memoCurrentLineWidth; }
        memoCtx.beginPath(); memoCtx.arc(memoLastX, memoLastY, memoCtx.lineWidth / 2, 0, Math.PI * 2); memoCtx.fill(); e.preventDefault();
    };

    const drawMemo = (e) => { 
        if (!isMemoDrawing) return; 
        const coords = getMemoCoords(e); memoCtx.beginPath(); memoCtx.moveTo(memoLastX, memoLastY); memoCtx.lineTo(coords.x, coords.y); memoCtx.stroke(); memoLastX = coords.x; memoLastY = coords.y; e.preventDefault(); 
    };
    
    const stopMemoDrawing = () => { 
        if (isMemoDrawing) { 
            isMemoDrawing = false; 
            triggerAutoSaveMemo(); 
        } 
    };

    memoCanvas.addEventListener('mousedown', startMemoDrawing); memoCanvas.addEventListener('mousemove', drawMemo); memoCanvas.addEventListener('mouseup', stopMemoDrawing); memoCanvas.addEventListener('mouseout', stopMemoDrawing);
    memoCanvas.addEventListener('touchstart', startMemoDrawing, { passive: false }); memoCanvas.addEventListener('touchmove', drawMemo, { passive: false }); memoCanvas.addEventListener('touchend', stopMemoDrawing); memoCanvas.addEventListener('touchcancel', stopMemoDrawing);
};

export const resizeMemoCanvas = () => {
    if (!memoCanvas || !memoCtx) return;
    const parent = memoCanvas.parentElement; if(!parent || parent.clientWidth === 0) return;
    const tempCanvas = document.createElement('canvas'); tempCanvas.width = memoCanvas.width; tempCanvas.height = memoCanvas.height;
    tempCanvas.getContext('2d').drawImage(memoCanvas, 0, 0);
    memoCanvas.width = parent.clientWidth; memoCanvas.height = parent.clientHeight;
    memoCtx.drawImage(tempCanvas, 0, 0); memoCtx.lineCap = 'round'; memoCtx.lineJoin = 'round';
};

export const toggleMemoDrawMode = () => {
    isMemoDrawingMode = !isMemoDrawingMode;
    const btn = document.getElementById('memo-draw-toggle-btn'), tb = document.getElementById('memo-drawing-toolbar');
    if (isMemoDrawingMode) {
        btn.classList.replace('bg-gray-200', 'bg-blue-500'); btn.classList.replace('hover:bg-gray-300', 'hover:bg-blue-600');
        btn.classList.replace('text-gray-600', 'text-white');
        document.getElementById('memo-draw-toggle-text').textContent = '手書き: ON';
        tb.classList.remove('toolbar-hidden'); tb.classList.add('toolbar-visible'); memoCanvas.classList.remove('pointer-events-none');
    } else {
        btn.classList.replace('bg-blue-500', 'bg-gray-200'); btn.classList.replace('hover:bg-blue-600', 'hover:bg-gray-300');
        btn.classList.replace('text-white', 'text-gray-600');
        document.getElementById('memo-draw-toggle-text').textContent = '手書き: OFF';
        tb.classList.add('toolbar-hidden'); tb.classList.remove('toolbar-visible'); memoCanvas.classList.add('pointer-events-none');
    }
};

export const setMemoTool = (t) => { 
    memoCurrentTool = t; 
    ['pen', 'highlighter', 'eraser'].forEach(tool => document.getElementById(`memo-tool-${tool}`).classList.toggle('bg-gray-600', t === tool)); 
};

export const setMemoColor = (c, btn) => { 
    memoCurrentColor = c; 
    setMemoTool('pen'); 
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('ring-1', 'ring-offset-0.5', 'ring-offset-[#4a5f73]', 'ring-blue-300', 'border-white')); 
    btn.classList.add('ring-1', 'ring-offset-0.5', 'ring-offset-[#4a5f73]', 'ring-blue-300', 'border-white'); 
};

export const setMemoLineWidth = (w, btn) => { 
    memoCurrentLineWidth = w; 
    ['memo-line-thin', 'memo-line-medium', 'memo-line-thick'].forEach(id => document.getElementById(id).classList.replace('opacity-100', 'opacity-50')); 
    btn.classList.replace('opacity-50', 'opacity-100'); 
};

export const clearMemoCanvas = () => { 
    if (memoCtx && memoCanvas) memoCtx.clearRect(0, 0, memoCanvas.width, memoCanvas.height); 
    triggerAutoSaveMemo(); 
};