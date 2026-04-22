// js/memo.js
// メモのリスト表示、エディタの制御、手書きキャンバス (Canvas API) の処理

export const initMemoCanvas = () => {
    window.memoCanvas = document.getElementById('memo-drawing-canvas');
    if (!window.memoCanvas) return;
    window.memoCtx = window.memoCanvas.getContext('2d', { willReadFrequently: true });

    const getMemoCoords = (e) => { 
        const rect = window.memoCanvas.getBoundingClientRect(); 
        return (e.touches && e.touches.length > 0) ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top } : { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
    };

    const startMemoDrawing = (e) => {
        if (!window.isMemoDrawingMode || (e.type === 'mousedown' && e.button !== 0)) return;
        window.isMemoDrawing = true; 
        const coords = getMemoCoords(e); 
        window.memoLastX = coords.x; 
        window.memoLastY = coords.y;
        
        if (window.memoCurrentTool === 'eraser') { 
            window.memoCtx.globalCompositeOperation = 'destination-out'; 
            window.memoCtx.lineWidth = window.memoCurrentLineWidth * 5; 
            window.memoCtx.fillStyle = 'rgba(0,0,0,1)'; 
        } 
        else if (window.memoCurrentTool === 'highlighter') { 
            window.memoCtx.globalCompositeOperation = 'source-over'; 
            const hex = window.memoCurrentColor; 
            const rgbaColor = `rgba(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}, 0.3)`; 
            window.memoCtx.strokeStyle = rgbaColor; 
            window.memoCtx.fillStyle = rgbaColor; 
            window.memoCtx.lineWidth = window.memoCurrentLineWidth * 4; 
        } 
        else { 
            window.memoCtx.globalCompositeOperation = 'source-over'; 
            window.memoCtx.strokeStyle = window.memoCurrentColor; 
            window.memoCtx.fillStyle = window.memoCurrentColor; 
            window.memoCtx.lineWidth = window.memoCurrentLineWidth; 
        }
        window.memoCtx.beginPath(); 
        window.memoCtx.arc(window.memoLastX, window.memoLastY, window.memoCtx.lineWidth / 2, 0, Math.PI * 2); 
        window.memoCtx.fill(); 
        e.preventDefault();
    };

    const drawMemo = (e) => { 
        if (!window.isMemoDrawing) return; 
        const coords = getMemoCoords(e); 
        window.memoCtx.beginPath(); 
        window.memoCtx.moveTo(window.memoLastX, window.memoLastY); 
        window.memoCtx.lineTo(coords.x, coords.y); 
        window.memoCtx.stroke(); 
        window.memoLastX = coords.x; 
        window.memoLastY = coords.y; 
        e.preventDefault(); 
    };
    
    const stopMemoDrawing = () => { 
        if (window.isMemoDrawing) { 
            window.isMemoDrawing = false; 
            if (typeof window.triggerAutoSaveMemo === 'function') window.triggerAutoSaveMemo(); 
        } 
    };

    window.memoCanvas.addEventListener('mousedown', startMemoDrawing); 
    window.memoCanvas.addEventListener('mousemove', drawMemo); 
    window.memoCanvas.addEventListener('mouseup', stopMemoDrawing); 
    window.memoCanvas.addEventListener('mouseout', stopMemoDrawing);
    window.memoCanvas.addEventListener('touchstart', startMemoDrawing, { passive: false }); 
    window.memoCanvas.addEventListener('touchmove', drawMemo, { passive: false }); 
    window.memoCanvas.addEventListener('touchend', stopMemoDrawing); 
    window.memoCanvas.addEventListener('touchcancel', stopMemoDrawing);
};

export const resizeMemoCanvas = () => {
    if (!window.memoCanvas || !window.memoCtx) return;
    const parent = window.memoCanvas.parentElement; 
    if(!parent || parent.clientWidth === 0) return;
    
    const tempCanvas = document.createElement('canvas'); 
    tempCanvas.width = window.memoCanvas.width; 
    tempCanvas.height = window.memoCanvas.height;
    tempCanvas.getContext('2d').drawImage(window.memoCanvas, 0, 0);
    
    window.memoCanvas.width = parent.clientWidth; 
    window.memoCanvas.height = parent.clientHeight;
    window.memoCtx.drawImage(tempCanvas, 0, 0); 
    window.memoCtx.lineCap = 'round'; 
    window.memoCtx.lineJoin = 'round';
};

export const toggleMemoDrawMode = () => {
    window.isMemoDrawingMode = !window.isMemoDrawingMode;
    const btn = document.getElementById('memo-draw-toggle-btn'), tb = document.getElementById('memo-drawing-toolbar');
    if (!btn || !tb || !window.memoCanvas) return;
    
    if (window.isMemoDrawingMode) {
        btn.classList.replace('bg-gray-200', 'bg-blue-500'); 
        btn.classList.replace('hover:bg-gray-300', 'hover:bg-blue-600');
        btn.classList.replace('text-gray-600', 'text-white');
        const textEl = document.getElementById('memo-draw-toggle-text');
        if (textEl) textEl.textContent = '手書き: ON';
        tb.classList.remove('toolbar-hidden'); 
        tb.classList.add('toolbar-visible'); 
        window.memoCanvas.classList.remove('pointer-events-none');
    } else {
        btn.classList.replace('bg-blue-500', 'bg-gray-200'); 
        btn.classList.replace('hover:bg-blue-600', 'hover:bg-gray-300');
        btn.classList.replace('text-white', 'text-gray-600');
        const textEl = document.getElementById('memo-draw-toggle-text');
        if (textEl) textEl.textContent = '手書き: OFF';
        tb.classList.add('toolbar-hidden'); 
        tb.classList.remove('toolbar-visible'); 
        window.memoCanvas.classList.add('pointer-events-none');
    }
};

export const setMemoTool = (t) => { 
    window.memoCurrentTool = t; 
    ['pen', 'highlighter', 'eraser'].forEach(tool => {
        const el = document.getElementById(`memo-tool-${tool}`);
        if(el) el.classList.toggle('bg-gray-600', t === tool);
    }); 
};

export const setMemoColor = (c, btn) => { 
    window.memoCurrentColor = c; 
    setMemoTool('pen'); 
    if (btn && btn.parentElement) {
        btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('ring-1', 'ring-offset-0.5', 'ring-offset-[#4a5f73]', 'ring-blue-300', 'border-white')); 
        btn.classList.add('ring-1', 'ring-offset-0.5', 'ring-offset-[#4a5f73]', 'ring-blue-300', 'border-white'); 
    }
};

export const setMemoLineWidth = (w, btn) => { 
    window.memoCurrentLineWidth = w; 
    ['memo-line-thin', 'memo-line-medium', 'memo-line-thick'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.replace('opacity-100', 'opacity-50');
    }); 
    if (btn) btn.classList.replace('opacity-50', 'opacity-100'); 
};

export const clearMemoCanvas = () => { 
    if(window.memoCtx && window.memoCanvas) {
        window.memoCtx.clearRect(0, 0, window.memoCanvas.width, window.memoCanvas.height); 
        if (typeof window.triggerAutoSaveMemo === 'function') window.triggerAutoSaveMemo(); 
    }
};


// ----------------------------------------------------
// UI, メモリスト・フォルダ操作
// ----------------------------------------------------

export const renderMemoSidebar = () => {
    const list = document.getElementById('memo-category-list');
    if(!list) return;
    let html = '';
    window.MEMO_CATEGORIES.forEach(cat => {
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

export const renderMemoList = () => {
    const container = document.getElementById('memo-list-container');
    if(!container) return;
    const backBtnPc = document.getElementById('memo-back-btn');
    const backBtnSp = document.getElementById('memo-back-btn-mobile');
    const addFolderBtnPc = document.getElementById('memo-add-folder-btn');
    const addFolderBtnSp = document.getElementById('memo-add-folder-btn-mobile');
    
    let filteredMemos = [];
    let currentFolders = [];

    if (window.currentMemoFilter === 'favorite') {
        filteredMemos = window.allMemos.filter(m => m.isFavorite && m.categoryId !== 'trash');
        addFolderBtnPc?.classList.add('hidden');
        addFolderBtnSp?.classList.add('hidden');
    } else if (window.currentMemoFilter === 'all') {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        filteredMemos = window.allMemos.filter(m => {
            if (m.categoryId === 'trash') return false;
            const targetTime = m.lastOpenedAt || m.updatedAt || 0;
            return targetTime >= oneWeekAgo;
        });
        addFolderBtnPc?.classList.add('hidden');
        addFolderBtnSp?.classList.add('hidden');
    } else if (window.currentMemoFilter === 'trash') {
        filteredMemos = window.allMemos.filter(m => m.categoryId === 'trash');
        addFolderBtnPc?.classList.add('hidden');
        addFolderBtnSp?.classList.add('hidden');
    } else {
        addFolderBtnPc?.classList.remove('hidden');
        addFolderBtnSp?.classList.remove('hidden');
        currentFolders = window.allFolders.filter(f => f.categoryId === window.currentMemoFilter && f.parentId === window.currentMemoFolderId);
        filteredMemos = window.allMemos.filter(m => m.categoryId === window.currentMemoFilter && m.folderId === window.currentMemoFolderId);
    }

    filteredMemos.sort((a, b) => {
        const [key, order] = window.currentMemoSort.split('_');
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
    if (window.currentMemoFilter === 'favorite') title = "お気に入り";
    else if (window.currentMemoFilter === 'all') title = "最近使ったメモ";
    else if (window.currentMemoFilter === 'trash') title = "ごみ箱";
    else {
        const cat = window.MEMO_CATEGORIES.find(c => c.id === window.currentMemoFilter);
        title = cat ? cat.name : "メモ";
        if (window.currentMemoFolderId) {
            const path = getFolderPath(window.currentMemoFolderId);
            if (path.length > 0) title = path[path.length - 1].name;
            
            backBtnPc?.classList.remove('hidden');
            backBtnSp?.classList.remove('hidden');
            
            const parentId = path.length > 1 ? path[path.length - 2].id : null;
            if(backBtnPc) backBtnPc.onclick = () => { window.enterFolder(parentId); };
            if(backBtnSp) backBtnSp.onclick = () => { window.enterFolder(parentId); };
        } else {
            backBtnPc?.classList.add('hidden');
            backBtnSp?.classList.add('hidden');
        }
    }
    
    const listTitleEl = document.getElementById('memo-list-title');
    if (listTitleEl) listTitleEl.textContent = title;
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

    const formatDateForMemo = (timestamp) => {
        const d = new Date(timestamp);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    filteredMemos.forEach(memo => {
        const cat = window.MEMO_CATEGORIES.find(c => c.id === memo.categoryId) || { icon: 'fas fa-trash-alt', color: 'text-red-500' };
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

const getFolderPath = (folderId) => {
    let path = [];
    let curr = window.allFolders.find(f => f.id === folderId);
    while (curr) {
        path.unshift(curr);
        curr = window.allFolders.find(f => f.id === curr.parentId);
    }
    return path;
};

// ----------------------------------------------------
// グローバル空間（window）へのエクスポート
// ----------------------------------------------------

// 状態・変数（canvas関連）
window.isMemoDrawing = false;
window.isMemoDrawingMode = false;
window.memoCurrentTool = 'pen';
window.memoCurrentColor = '#000000';
window.memoCurrentLineWidth = 4;
window.memoLastX = 0; 
window.memoLastY = 0;
window.memoCanvas = null; 
window.memoCtx = null;

// 関数
window.initMemoCanvas = initMemoCanvas;
window.resizeMemoCanvas = resizeMemoCanvas;
window.toggleMemoDrawMode = toggleMemoDrawMode;
window.setMemoTool = setMemoTool;
window.setMemoColor = setMemoColor;
window.setMemoLineWidth = setMemoLineWidth;
window.clearMemoCanvas = clearMemoCanvas;
window.renderMemoSidebar = renderMemoSidebar;
window.renderMemoList = renderMemoList;
window.getFolderPath = getFolderPath;