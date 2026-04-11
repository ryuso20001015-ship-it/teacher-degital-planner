import * as stateModule from './state.js';
import * as utils from './utils.js';
import * as firebase from './firebase.js';
import * as memo from './memo.js';
import * as calendar from './calendar.js';
import * as settings from './settings.js';

// stateの読み込み（AIの出力形式の揺れを吸収する安全な書き方）
const state = stateModule.state || stateModule;

// ==========================================
// 1. HTML連携用のグローバル登録 (超重要)
// ==========================================
// HTMLの onclick="window.xxx()" から呼び出せるよう、
// 各ファイルで export されたすべての関数を window に一括登録します。
Object.assign(window, utils);
Object.assign(window, firebase);
Object.assign(window, memo);
Object.assign(window, calendar);
Object.assign(window, settings);

// ★ Firebaseの連携（念のため明示的に手動でも登録）
window.saveToFirebase = firebase.saveToFirebase;
window.linkDevice = firebase.linkDevice;

// ==========================================
// 2. アプリ全体の操作（Undo/Redo, 画面切替）
// ==========================================
const MAX_HISTORY = 20;

window.saveStateToHistory = () => {
    if (!state.undoStack) state.undoStack = [];
    state.undoStack.push(JSON.stringify(state.allPlanners));
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.redoStack = [];
    window.updateUndoRedoButtons();
};

window.undo = () => {
    if (!state.undoStack || state.undoStack.length === 0) return;
    if (!state.redoStack) state.redoStack = [];
    state.redoStack.push(JSON.stringify(state.allPlanners));
    state.allPlanners = JSON.parse(state.undoStack.pop());
    utils.safeSetItem(state.LS_KEY || 'teacher_planner_all_data', JSON.stringify(state.allPlanners));
    firebase.saveToFirebase();
    window.updateUndoRedoButtons();
    window.renderCurrentView();
};

window.redo = () => {
    if (!state.redoStack || state.redoStack.length === 0) return;
    if (!state.undoStack) state.undoStack = [];
    state.undoStack.push(JSON.stringify(state.allPlanners));
    state.allPlanners = JSON.parse(state.redoStack.pop());
    utils.safeSetItem(state.LS_KEY || 'teacher_planner_all_data', JSON.stringify(state.allPlanners));
    firebase.saveToFirebase();
    window.updateUndoRedoButtons();
    window.renderCurrentView();
};

window.updateUndoRedoButtons = () => {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) {
        undoBtn.style.opacity = (state.undoStack && state.undoStack.length > 0) ? '1' : '0.3';
        undoBtn.style.pointerEvents = (state.undoStack && state.undoStack.length > 0) ? 'auto' : 'none';
    }
    if (redoBtn) {
        redoBtn.style.opacity = (state.redoStack && state.redoStack.length > 0) ? '1' : '0.3';
        redoBtn.style.pointerEvents = (state.redoStack && state.redoStack.length > 0) ? 'auto' : 'none';
    }
};

window.switchView = (viewName) => {
    state.currentView = viewName;
    if (typeof calendar.clearCellSelection === 'function') calendar.clearCellSelection();

    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    const targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById('nav-btn-' + viewName);
    if (navBtn) navBtn.classList.add('active');
    
    if (viewName === 'settings' && typeof settings.initSettingsView === 'function') {
        settings.initSettingsView();
        const dSync = document.getElementById('display-sync-id');
        if (dSync && typeof firebase.getSyncId === 'function') dSync.textContent = firebase.getSyncId();
    }

    if (viewName === 'memo' && typeof memo.renderMemoSidebar === 'function') {
        memo.renderMemoSidebar();
        memo.selectMemoFilter(state.currentMemoFilter || 'all');
    }

    window.renderCurrentView();

    if (viewName === 'agenda') {
        setTimeout(() => {
            const todayStr = utils.getFormatDateStr(new Date());
            const el = document.getElementById(`agenda-date-${todayStr}`);
            if (el) {
                const container = document.getElementById('agenda-view-list');
                if (container) container.scrollTo({ top: el.offsetTop - container.offsetTop - 10, behavior: 'smooth' });
            }
        }, 50);
    }
};

window.renderCurrentView = () => {
    if (state.currentView === 'month' && typeof calendar.renderMonthView === 'function') calendar.renderMonthView();
    else if (state.currentView === 'week' && typeof calendar.renderWeekView === 'function') calendar.renderWeekView();
    else if (state.currentView === 'agenda' && typeof calendar.renderAgendaView === 'function') calendar.renderAgendaView();
    else if (state.currentView === 'weekly-plan' && typeof calendar.renderWeeklyPlanView === 'function') calendar.renderWeeklyPlanView();
    else if (state.currentView === 'memo' && typeof memo.renderMemoList === 'function') memo.renderMemoList();
};

window.goToToday = () => {
    const today = new Date();
    state.currentDateObj = new Date(today);
    state.calendarDisplayDate = new Date(today);
    window.renderCurrentView();
    if (state.currentView === 'agenda') {
        const todayStr = utils.getFormatDateStr(today);
        const el = document.getElementById(`agenda-date-${todayStr}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.updateDisplayMode = () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        document.body.classList.add('mode-mobile');
        document.body.classList.remove('mode-desktop');
    } else {
        document.body.classList.add('mode-desktop');
        document.body.classList.remove('mode-mobile');
    }
    if (typeof memo.resizeMemoCanvas === 'function') setTimeout(memo.resizeMemoCanvas, 100);
};

// ==========================================
// 3. 検索機能
// ==========================================
window.handleMonthSearch = () => {
    window.renderCurrentView(); 
    const searchInput = document.getElementById('month-search-input');
    if (!searchInput) return;
    
    const searchWord = searchInput.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('month-search-results');
    
    if (!searchWord) {
        resultsContainer.classList.add('hidden');
        return;
    }
    
    let resultsHtml = '';
    let count = 0;
    const sortedDates = Object.keys(state.allPlanners || {}).sort();

    sortedDates.forEach(dateStr => {
        const data = state.allPlanners[dateStr];
        const dObj = new Date(dateStr);
        const daysStrArr = state.DAYS_STR || ['日', '月', '火', '水', '木', '金', '土'];
        const dateLabel = `${dObj.getMonth()+1}/${dObj.getDate()}(${daysStrArr[dObj.getDay()]})`;
        
        if (data.events) {
            data.events.forEach(ev => {
                if (ev.title.toLowerCase().includes(searchWord) || (ev.memo && ev.memo.toLowerCase().includes(searchWord))) {
                    let timeLabel = ev.isAllDay ? "終日" : (ev.start ? ev.start.split('T').pop().substring(0,5) : "");
                    let badgeColor = "bg-gray-100 text-gray-700 border-gray-200";
                    if (ev.category === 'work') badgeColor = "bg-red-50 text-red-700 border-red-200";
                    else if (ev.category === 'club') badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                    else if (ev.category === 'private') badgeColor = "bg-orange-50 text-orange-700 border-orange-200";

                    resultsHtml += `
                        <div class="p-2 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition" onclick="event.stopPropagation(); window.goToDateFromSearch('${dateStr}', '${ev.id}')">
                            <div class="flex justify-between items-baseline mb-1">
                                <span class="font-bold text-xs text-[#4a5f73] truncate pr-2">${ev.title}</span>
                                <span class="text-[9px] font-bold text-gray-400 whitespace-nowrap shrink-0">${dateLabel}</span>
                            </div>
                            <div class="text-[9px] text-gray-500 flex items-center gap-1 truncate">
                                <span class="px-1 py-0.5 rounded border ${badgeColor} font-bold leading-none">${timeLabel}</span>
                                <span class="truncate">${ev.memo || ''}</span>
                            </div>
                        </div>
                    `;
                    count++;
                }
            });
        }

        if (data.reminders) {
            data.reminders.forEach(task => {
                if (task.title.toLowerCase().includes(searchWord) || (task.memo && task.memo.toLowerCase().includes(searchWord))) {
                    const statusIcon = task.completed ? '<i class="fas fa-check-square text-blue-400 mr-1"></i>' : '<i class="far fa-square text-gray-400 mr-1"></i>';
                    const titleStyle = task.completed ? 'line-through opacity-70' : '';
                    resultsHtml += `
                        <div class="p-2 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition" onclick="event.stopPropagation(); window.goToDateFromSearch('${dateStr}', '${task.id}')">
                            <div class="flex justify-between items-baseline mb-1">
                                <span class="font-bold text-xs text-[#4a5f73] truncate pr-2 ${titleStyle}">${statusIcon}${task.title}</span>
                                <span class="text-[9px] font-bold text-gray-400 whitespace-nowrap shrink-0">${dateLabel}</span>
                            </div>
                            <div class="text-[9px] text-gray-500 truncate pl-3">${task.memo || ''}</div>
                        </div>
                    `;
                    count++;
                }
            });
        }
    });

    if (count === 0) {
        resultsHtml = '<div class="p-3 text-center text-gray-400 text-[10px] font-bold">一致する予定・タスクは見つかりませんでした</div>';
    }
    resultsContainer.innerHTML = resultsHtml;
    resultsContainer.classList.remove('hidden');
};

window.goToDateFromSearch = (dateStr, itemId) => {
    const resultsContainer = document.getElementById('month-search-results');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    
    const searchInput = document.getElementById('month-search-input');
    if (searchInput) searchInput.value = '';
    
    const targetDate = new Date(dateStr);
    state.calendarDisplayDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    state.currentDateObj = new Date(targetDate);
    
    state.selectedCellId = `month-cell-${dateStr}`;
    state.selectedSlot = null;
    state.searchedItemId = itemId;
    
    window.switchView('month');
    
    setTimeout(() => {
        const cell = document.getElementById(`month-cell-${dateStr}`);
        if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
};

// ==========================================
// 4. アプリ起動時の初期化
// ==========================================
window.initDataSync = () => {
    const localData = utils.safeGetItem(state.LS_KEY || 'teacher_planner_all_data');
    if (localData) { try { state.allPlanners = JSON.parse(localData); } catch(e){} }
    
    const localMemos = utils.safeGetItem('teacher_planner_memos');
    if (localMemos) { try { state.allMemos = JSON.parse(localMemos); } catch(e){} }
    
    const localFolders = utils.safeGetItem('teacher_planner_folders');
    if (localFolders) { try { state.allFolders = JSON.parse(localFolders); } catch(e){} }

    const localSettings = utils.safeGetItem('teacher_planner_settings');
    if (localSettings) { try { state.globalSettings = JSON.parse(localSettings); } catch(e){} }

    // ゴミ箱の古いメモ削除処理
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let memoChanged = false;
    if (state.allMemos) {
        state.allMemos = state.allMemos.filter(m => {
            if (m.categoryId === 'trash' && m.deletedAt && (now - m.deletedAt) > thirtyDays) {
                memoChanged = true; return false;
            }
            return true;
        });
        if (memoChanged) {
            utils.safeSetItem('teacher_planner_memos', JSON.stringify(state.allMemos));
            firebase.saveToFirebase();
        }
    }

    // Todayボタンの日付更新
    const today = new Date();
    const daysStrArr = state.DAYS_STR || ['日', '月', '火', '水', '木', '金', '土'];
    const dateStr = today.getDate(), dayStr = `(${daysStrArr[today.getDay()]})`;
    document.querySelectorAll('.today-btn-date').forEach(el => el.textContent = dateStr);
    document.querySelectorAll('.today-btn-day').forEach(el => el.textContent = dayStr);

    window.updateUndoRedoButtons();
    window.renderCurrentView(); 
};

// DOM読み込み完了時に実行される処理
document.addEventListener('DOMContentLoaded', () => {
    // Canvasの初期化（メモ画面用）
    if (typeof memo.initMemoCanvas === 'function') memo.initMemoCanvas();
    
    // データの読み込みと画面描画
    window.initDataSync();
    window.updateDisplayMode();
    window.addEventListener('resize', window.updateDisplayMode);
    
    // Firebase通信の開始
    if (typeof firebase.initFirebase === 'function') {
        firebase.initFirebase();
    }
});

// （※スワイプ処理等のUIイベントリスナーは、必要に応じてここに追加してください）