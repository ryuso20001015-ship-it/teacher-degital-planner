import { state, LS_KEY, DAYS_STR, MAX_HISTORY } from './state.js';
import { safeGetItem, safeSetItem, getFormatDateStr } from './utils.js';
import * as firebaseMod from './firebase.js';
import * as memoMod from './memo.js';
import * as calendarMod from './calendar.js';
import * as settingsMod from './settings.js';

export const updateDisplayMode = () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        document.body.classList.add('mode-mobile'); document.body.classList.remove('mode-desktop');
    } else {
        document.body.classList.add('mode-desktop'); document.body.classList.remove('mode-mobile');
    }
    if (typeof window.resizeMemoCanvas === 'function') setTimeout(window.resizeMemoCanvas, 100);
};
window.addEventListener('resize', updateDisplayMode);

export const switchView = (viewName) => {
    state.currentView = viewName; 
    if (typeof window.clearCellSelection === 'function') window.clearCellSelection();
    
    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + viewName).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-btn-' + viewName).classList.add('active');
    
    if(viewName === 'settings') {
        window.initSettingsView();
        const dSync = document.getElementById('display-sync-id');
        if(dSync) dSync.textContent = window.getSyncId();
    }

    if(viewName === 'memo') {
        window.renderMemoSidebar();
        window.selectMemoFilter(state.currentMemoFilter);
    }

    renderCurrentView();

    if (viewName === 'agenda') {
        setTimeout(() => {
            const todayStr = getFormatDateStr(new Date());
            const el = document.getElementById(`agenda-date-${todayStr}`);
            if (el) {
                const container = document.getElementById('agenda-view-list');
                container.scrollTo({ top: el.offsetTop - container.offsetTop - 10, behavior: 'smooth' });
            }
        }, 50);
    }
};

export const renderCurrentView = () => {
    if (state.currentView === 'month') window.renderMonthView();
    else if (state.currentView === 'week') window.renderWeekView();
    else if (state.currentView === 'agenda') window.renderAgendaView();
    else if (state.currentView === 'weekly-plan') window.renderWeeklyPlanView();
    else if (state.currentView === 'memo') window.renderMemoList();
};

export const saveStateToHistory = () => {
    state.undoStack.push(JSON.stringify(state.allPlanners));
    if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
    state.redoStack = []; 
    updateUndoRedoButtons();
};

export const undo = () => {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(JSON.stringify(state.allPlanners));
    state.allPlanners = JSON.parse(state.undoStack.pop());
    safeSetItem(LS_KEY, JSON.stringify(state.allPlanners));
    window.saveToFirebase(); 
    updateUndoRedoButtons(); 
    renderCurrentView();
};

export const redo = () => {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(JSON.stringify(state.allPlanners));
    state.allPlanners = JSON.parse(state.redoStack.pop());
    safeSetItem(LS_KEY, JSON.stringify(state.allPlanners));
    window.saveToFirebase(); 
    updateUndoRedoButtons(); 
    renderCurrentView();
};

export const updateUndoRedoButtons = () => {
    const undoBtn = document.getElementById('btn-undo'), redoBtn = document.getElementById('btn-redo');
    if (undoBtn) { undoBtn.style.opacity = state.undoStack.length > 0 ? '1' : '0.3'; undoBtn.style.pointerEvents = state.undoStack.length > 0 ? 'auto' : 'none'; }
    if (redoBtn) { redoBtn.style.opacity = state.redoStack.length > 0 ? '1' : '0.3'; redoBtn.style.pointerEvents = state.redoStack.length > 0 ? 'auto' : 'none'; }
};

export const initDataSync = () => {
    const localData = safeGetItem(LS_KEY);
    if (localData) { try { state.allPlanners = JSON.parse(localData); } catch(e){} }
    const localMemos = safeGetItem('teacher_planner_memos');
    if (localMemos) { try { state.allMemos = JSON.parse(localMemos); } catch(e){} }
    const localFolders = safeGetItem('teacher_planner_folders');
    if (localFolders) { try { state.allFolders = JSON.parse(localFolders); } catch(e){} }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let memoChanged = false;
    state.allMemos = state.allMemos.filter(m => {
        if (m.categoryId === 'trash' && m.deletedAt && (now - m.deletedAt) > thirtyDays) {
            memoChanged = true;
            return false;
        }
        return true;
    });
    if (memoChanged) {
        safeSetItem('teacher_planner_memos', JSON.stringify(state.allMemos));
        window.saveToFirebase();
    }

    initTodayButtons(); 
    updateUndoRedoButtons(); 
    renderCurrentView(); 
};

const initTodayButtons = () => {
    const today = new Date();
    const dateStr = today.getDate(), dayStr = `(${DAYS_STR[today.getDay()]})`;
    document.querySelectorAll('.today-btn-date').forEach(el => el.textContent = dateStr);
    document.querySelectorAll('.today-btn-day').forEach(el => el.textContent = dayStr);
};

export const goToToday = () => {
    const today = new Date(); 
    state.currentDateObj = new Date(today); 
    state.calendarDisplayDate = new Date(today);
    renderCurrentView();
    if (state.currentView === 'agenda') {
        const todayStr = getFormatDateStr(today);
        const el = document.getElementById(`agenda-date-${todayStr}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

export const handleMonthSearch = () => {
    renderCurrentView(); 
    
    const searchWord = document.getElementById('month-search-input').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('month-search-results');
    
    if (!searchWord) {
        resultsContainer.classList.add('hidden');
        return;
    }

    let resultsHtml = '';
    let count = 0;

    const sortedDates = Object.keys(state.allPlanners).sort();

    sortedDates.forEach(dateStr => {
        const data = state.allPlanners[dateStr];
        const dObj = new Date(dateStr);
        const dateLabel = `${dObj.getMonth()+1}/${dObj.getDate()}(${DAYS_STR[dObj.getDay()]})`;
        
        if (data.events) {
            data.events.forEach(ev => {
                if (ev.title.toLowerCase().includes(searchWord) || (ev.memo && ev.memo.toLowerCase().includes(searchWord))) {
                    let timeLabel = ev.isAllDay ? "終日" : (ev.start ? ev.start.split('T').pop().substring(0,5) : "");
                    let badgeColor = "bg-gray-100 text-gray-700 border-gray-200";
                    if(ev.category === 'work') badgeColor = "bg-red-50 text-red-700 border-red-200";
                    else if(ev.category === 'club') badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                    else if(ev.category === 'private') badgeColor = "bg-orange-50 text-orange-700 border-orange-200";

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

export const goToDateFromSearch = (dateStr, itemId) => {
    const resultsContainer = document.getElementById('month-search-results');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    
    const searchInput = document.getElementById('month-search-input');
    if (searchInput) searchInput.value = '';
    
    const targetDate = new Date(dateStr);
    state.calendarDisplayDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    state.currentDateObj = new Date(targetDate);
    
    state.searchedItemId = itemId;
    
    window.switchView('month');
    
    if (typeof window.handleMonthCellClick === 'function') {
        window.clearCellSelection();
        state.searchedItemId = itemId; 
        window.handleMonthCellClick(dateStr);
    }
    
    setTimeout(() => {
        const cell = document.getElementById(`month-cell-${dateStr}`);
        if (cell) {
            cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
};

export const handleStartTimeChange = () => {
    const startDateStr = document.getElementById('add-modal-start-date').value;
    const startTimeStr = document.getElementById('add-modal-start-time').value;
    if (!startDateStr || !startTimeStr) return;

    const startObj = new Date(`${startDateStr}T${startTimeStr}`);
    if (isNaN(startObj.getTime())) return;

    startObj.setHours(startObj.getHours() + 1); 

    const endDateStr = getFormatDateStr(startObj);
    const endHH = String(startObj.getHours()).padStart(2, '0');
    const endMM = String(startObj.getMinutes()).padStart(2, '0');

    document.getElementById('add-modal-end-date').value = endDateStr;
    document.getElementById('add-modal-end-time').value = `${endHH}:${endMM}`;
};

export const changeDate = (dateParam) => {
    const newDate = typeof dateParam === 'string' ? new Date(dateParam) : dateParam;
    state.currentDateObj = newDate; state.calendarDisplayDate = new Date(newDate);
    renderCurrentView();
};

// ==========================================
// モジュールの全関数を window に登録 (HTMLのonclick等から呼ぶため)
// ==========================================
Object.assign(window, firebaseMod);
Object.assign(window, memoMod);
Object.assign(window, calendarMod);
Object.assign(window, settingsMod);

window.updateDisplayMode = updateDisplayMode;
window.switchView = switchView;
window.renderCurrentView = renderCurrentView;
window.saveStateToHistory = saveStateToHistory;
window.undo = undo;
window.redo = redo;
window.updateUndoRedoButtons = updateUndoRedoButtons;
window.initDataSync = initDataSync;
window.goToToday = goToToday;
window.handleMonthSearch = handleMonthSearch;
window.goToDateFromSearch = goToDateFromSearch;
window.handleStartTimeChange = handleStartTimeChange;
window.changeDate = changeDate;

// ==========================================
// スワイプ処理等のイベントリスナー
// ==========================================
let swipeStartX = 0;
let swipeStartY = 0;
let swipeTargetElem = null;
let swipeStartScrollLeft = 0;
let swipeStartScrollWidth = 0;
let swipeStartClientWidth = 0;
let isSwiping = false;
let swipeDirectionDetermined = false;
let activeViewElem = null;

document.addEventListener('touchstart', (e) => {
    if (!document.getElementById('add-modal').classList.contains('hidden') ||
        !document.getElementById('weekly-plan-modal').classList.contains('hidden') ||
        !document.getElementById('memo-edit-modal').classList.contains('hidden')) {
        return;
    }

    if (state.currentView !== 'month' && state.currentView !== 'week' && state.currentView !== 'weekly-plan') {
        return;
    }

    swipeStartX = e.touches[0].screenX;
    swipeStartY = e.touches[0].screenY;
    swipeTargetElem = null;
    isSwiping = false;
    swipeDirectionDetermined = false;
    
    activeViewElem = document.getElementById(`${state.currentView}-animation-area`);

    let target = e.target;
    while (target && target !== document.body) {
        if (target.scrollWidth > target.clientWidth) {
            const style = window.getComputedStyle(target);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll' || target.classList.contains('overflow-x-auto') || target.classList.contains('custom-scrollbar')) {
                swipeTargetElem = target;
                swipeStartScrollLeft = target.scrollLeft;
                swipeStartScrollWidth = target.scrollWidth;
                swipeStartClientWidth = target.clientWidth;
                break;
            }
        }
        target = target.parentNode;
    }
    
    if (activeViewElem) {
        activeViewElem.style.transition = 'none';
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!swipeStartX || !activeViewElem) return;

    const touchX = e.touches[0].screenX;
    const touchY = e.touches[0].screenY;
    const diffX = touchX - swipeStartX;
    const diffY = touchY - swipeStartY;

    if (!swipeDirectionDetermined) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            swipeDirectionDetermined = true;
            if (Math.abs(diffX) > Math.abs(diffY)) {
                isSwiping = true;
            } else {
                swipeStartX = null; 
                return;
            }
        } else {
            return; 
        }
    }

    if (isSwiping) {
        if (swipeTargetElem) {
            if (diffX < 0) { 
                if (Math.ceil(swipeStartScrollLeft + swipeStartClientWidth) < swipeStartScrollWidth - 5) return; 
            } else { 
                if (swipeStartScrollLeft > 5) return; 
            }
        }

        const translateX = diffX * 0.5; 
        activeViewElem.style.transform = `translateX(${translateX}px)`;
        activeViewElem.style.opacity = Math.max(0.3, 1 - Math.abs(translateX) / window.innerWidth * 1.5);
    }
}, { passive: true });

document.addEventListener('touchend', (e) => {
    if (!activeViewElem || !swipeDirectionDetermined || !isSwiping) {
        if (activeViewElem) {
            activeViewElem.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
            activeViewElem.style.transform = 'translateX(0)';
            activeViewElem.style.opacity = '1';
            setTimeout(() => { if (activeViewElem) activeViewElem.style.transition = 'none'; }, 150);
        }
        swipeStartX = null;
        return;
    }

    const swipeEndX = e.changedTouches[0].screenX;
    const diffX = swipeEndX - swipeStartX;

    activeViewElem.style.transition = 'transform 0.1s ease-out, opacity 0.1s ease-out';

    if (Math.abs(diffX) > 60) {
        const sign = diffX > 0 ? 1 : -1;
        activeViewElem.style.transform = `translateX(${sign * 30}px)`; 
        activeViewElem.style.opacity = '0';

        setTimeout(() => {
            if (diffX < 0) {
                if (state.currentView === 'month') window.changeMonthView(1);
                else if (state.currentView === 'week') window.changeWeekView(1);
                else if (state.currentView === 'weekly-plan') window.changeWeeklyPlanView(1);
            } else {
                if (state.currentView === 'month') window.changeMonthView(-1);
                else if (state.currentView === 'week') window.changeWeekView(-1);
                else if (state.currentView === 'weekly-plan') window.changeWeeklyPlanView(-1);
            }

            activeViewElem.style.transition = 'none';
            activeViewElem.style.transform = `translateX(${-sign * 20}px)`;
            
            void activeViewElem.offsetWidth;

            activeViewElem.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
            activeViewElem.style.transform = 'translateX(0)';
            activeViewElem.style.opacity = '1';

            setTimeout(() => { if (activeViewElem) activeViewElem.style.transition = 'none'; }, 150);

        }, 100); 

    } else {
        activeViewElem.style.transform = 'translateX(0)';
        activeViewElem.style.opacity = '1';
        setTimeout(() => { if (activeViewElem) activeViewElem.style.transition = 'none'; }, 100);
    }

    swipeStartX = null;
    isSwiping = false;
});

// ==========================================
// アプリ初期化処理
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.initMemoCanvas === 'function') window.initMemoCanvas();
    
    const memoEditor = document.getElementById('memo-edit-content');
    if (memoEditor) {
        memoEditor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
            }
        });
    }
});

if (window.fb) window.initFirebase();
else window.addEventListener('firebase-loaded', () => window.initFirebase());

initDataSync();
updateDisplayMode();