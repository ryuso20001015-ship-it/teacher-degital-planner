import { appState, safeGetItem, safeSetItem, LS_KEY, DAYS_STR, MAX_HISTORY } from './state.js';
import { initFirebase, saveToFirebase, linkDevice, setOnDataChangedCallback, getSyncId } from './firebase.js';
import { 
    renderMonthView, changeMonthView, openMonthBottomSheet, closeMonthBottomSheet,
    renderWeekView, changeWeekView,
    renderAgendaView,
    renderWeeklyPlanView, changeWeeklyPlanView, updateWeeklyPlanPeriods, saveWeeklyPlan,
    getFormatDateStr,
    openWeeklyPlanModal, closeWeeklyPlanModal, saveWeeklyPlanModal, deleteWeeklyPlanModal,
    resetWeeklyPlanModal, toggleCutWeeklyPlanModal, renderWpModalButtons, changeWpModalSource, updateWpModalBaseStatus
} from './calendar.js';
import * as Memo from './memo.js';

// ==========================================
// Undo / Redo 管理
// ==========================================
export const saveStateToHistory = () => {
    appState.undoStack.push(JSON.stringify(appState.allPlanners));
    if (appState.undoStack.length > MAX_HISTORY) appState.undoStack.shift();
    appState.redoStack = []; 
    updateUndoRedoButtons();
};

const undo = () => {
    if (appState.undoStack.length === 0) return;
    appState.redoStack.push(JSON.stringify(appState.allPlanners));
    appState.allPlanners = JSON.parse(appState.undoStack.pop());
    safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners));
    saveToFirebase(); updateUndoRedoButtons(); renderCurrentView();
};

const redo = () => {
    if (appState.redoStack.length === 0) return;
    appState.undoStack.push(JSON.stringify(appState.allPlanners));
    appState.allPlanners = JSON.parse(appState.redoStack.pop());
    safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners));
    saveToFirebase(); updateUndoRedoButtons(); renderCurrentView();
};

const updateUndoRedoButtons = () => {
    const undoBtn = document.getElementById('btn-undo'), redoBtn = document.getElementById('btn-redo');
    if (undoBtn) { undoBtn.style.opacity = appState.undoStack.length > 0 ? '1' : '0.3'; undoBtn.style.pointerEvents = appState.undoStack.length > 0 ? 'auto' : 'none'; }
    if (redoBtn) { redoBtn.style.opacity = appState.redoStack.length > 0 ? '1' : '0.3'; redoBtn.style.pointerEvents = appState.redoStack.length > 0 ? 'auto' : 'none'; }
};


// ==========================================
// 初期化・表示切替
// ==========================================
const initDataSync = () => {
    const localData = safeGetItem(LS_KEY);
    if (localData) { try { appState.allPlanners = JSON.parse(localData); } catch(e){} }
    const localMemos = safeGetItem('teacher_planner_memos');
    if (localMemos) { try { appState.allMemos = JSON.parse(localMemos); } catch(e){} }
    const localFolders = safeGetItem('teacher_planner_folders');
    if (localFolders) { try { appState.allFolders = JSON.parse(localFolders); } catch(e){} }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let memoChanged = false;
    appState.allMemos = appState.allMemos.filter(m => {
        if (m.categoryId === 'trash' && m.deletedAt && (now - m.deletedAt) > thirtyDays) {
            memoChanged = true; return false;
        }
        return true;
    });
    if (memoChanged) {
        safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
        saveToFirebase();
    }

    initTodayButtons(); updateUndoRedoButtons(); renderCurrentView(); 
};

const initTodayButtons = () => {
    const today = new Date();
    const dateStr = today.getDate(), dayStr = `(${DAYS_STR[today.getDay()]})`;
    document.querySelectorAll('.today-btn-date').forEach(el => el.textContent = dateStr);
    document.querySelectorAll('.today-btn-day').forEach(el => el.textContent = dayStr);
};

const goToToday = () => {
    const today = new Date(); appState.currentDateObj = new Date(today); appState.calendarDisplayDate = new Date(today);
    renderCurrentView();
    if (appState.currentView === 'agenda') {
        const todayStr = getFormatDateStr(today);
        const el = document.getElementById(`agenda-date-${todayStr}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

const updateDisplayMode = () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        document.body.classList.add('mode-mobile'); document.body.classList.remove('mode-desktop');
    } else {
        document.body.classList.add('mode-desktop'); document.body.classList.remove('mode-mobile');
    }
    if (typeof Memo.resizeMemoCanvas === 'function') setTimeout(Memo.resizeMemoCanvas, 100);
};

const renderCurrentView = () => {
    if (appState.currentView === 'month') renderMonthView();
    else if (appState.currentView === 'week') renderWeekView();
    else if (appState.currentView === 'agenda') renderAgendaView();
    else if (appState.currentView === 'weekly-plan') renderWeeklyPlanView();
    else if (appState.currentView === 'memo') Memo.renderMemoList();
};

const switchView = (viewName) => {
    appState.currentView = viewName; clearCellSelection();
    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + viewName).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-btn-' + viewName).classList.add('active');
    
    if(viewName === 'settings') {
        initSettingsView();
        const dSync = document.getElementById('display-sync-id');
        if(dSync) dSync.textContent = getSyncId();
    }

    if(viewName === 'memo') {
        Memo.renderMemoSidebar();
        Memo.selectMemoFilter(appState.currentMemoFilter);
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


// ==========================================
// 予定・タスク追加 モーダル制御
// ==========================================
const openAddMenu = (dateStr, defaultTime = null, isAllDay = true) => {
    appState.addModalTargetDate = dateStr; appState.editTarget = null;
    const dateYMD = getFormatDateStr(new Date(dateStr));
    const startHHMM = defaultTime || "09:00";
    let endHHMM = "10:00";
    if (defaultTime) { const [h, m] = defaultTime.split(':').map(Number); endHHMM = `${String(h+1).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
    
    document.getElementById('add-modal-title').value = ''; document.getElementById('add-modal-location').value = '';
    document.getElementById('add-modal-memo-sched').value = ''; document.getElementById('add-modal-memo-task').value = '';
    document.getElementById('add-modal-delete-container').classList.add('hidden');
    document.getElementById('add-modal-allday').checked = isAllDay;
    document.getElementById('add-modal-start-date').value = dateYMD; document.getElementById('add-modal-start-time').value = startHHMM;
    document.getElementById('add-modal-end-date').value = dateYMD; document.getElementById('add-modal-end-time').value = endHHMM;
    document.getElementById('add-modal-due-date').value = dateYMD; 
    
    document.getElementById('add-modal-category-sched').value = 'work';
    document.getElementById('add-modal-category-task').value = 'work';

    document.getElementById('modal-header-toggle').classList.remove('hidden'); document.getElementById('modal-header-class').classList.add('hidden');
    document.querySelector('input[name="add-type"][value="schedule"]').checked = true;
    toggleAddModalType(); toggleAllDay();
    updateModalColor(); 

    document.getElementById('add-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('add-modal-title').focus(), 100);
};

const openClassEditMenu = (dateStr, periodId, periodName) => {
    appState.addModalTargetDate = dateStr; appState.editTarget = { dateStr, idOrIndex: periodId }; appState.currentModalMode = 'class';
    document.getElementById('modal-header-toggle').classList.add('hidden'); document.getElementById('modal-header-class').classList.remove('hidden');
    document.getElementById('view-schedule-task').classList.add('hidden'); document.getElementById('view-class-edit').classList.remove('hidden');
    document.getElementById('add-modal-delete-container').classList.add('hidden');
    document.getElementById('class-edit-period-name').textContent = `${periodName} の授業変更`;
    
    const data = appState.allPlanners[dateStr] || {}; let cls = "", sub = "";
    if (data.classes && data.classes[periodId]) { cls = data.classes[periodId].cls; sub = data.classes[periodId].sub; }
    document.getElementById('class-edit-cls').value = cls; document.getElementById('class-edit-sub').value = sub;

    document.getElementById('add-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('class-edit-cls').focus(), 100);
};

const openEditMenu = (dateStr, type, evId) => {
    closeMonthBottomSheet(); 
    appState.addModalTargetDate = dateStr; appState.editTarget = { dateStr, idOrIndex: evId };
    const data = appState.allPlanners[dateStr] || {};
    document.getElementById('add-modal-delete-container').classList.remove('hidden');
    document.getElementById('modal-header-toggle').classList.remove('hidden'); document.getElementById('modal-header-class').classList.add('hidden');

    if (type === 'schedule') {
        document.querySelector('input[name="add-type"][value="schedule"]').checked = true; toggleAddModalType(); 
        const ev = (data.events || []).find(e => e.id === evId);
        if (ev) {
            document.getElementById('add-modal-title').value = ev.title || ''; document.getElementById('add-modal-location').value = ev.location || '';
            document.getElementById('add-modal-allday').checked = !!ev.isAllDay;
            if (ev.start) { const parts = ev.start.split('T'); document.getElementById('add-modal-start-date').value = parts[0]; if(parts[1]) document.getElementById('add-modal-start-time').value = parts[1]; }
            if (ev.end) { const parts = ev.end.split('T'); document.getElementById('add-modal-end-date').value = parts[0]; if(parts[1]) document.getElementById('add-modal-end-time').value = parts[1]; }
            document.getElementById('add-modal-category-sched').value = ev.category || 'work'; document.getElementById('add-modal-memo-sched').value = ev.memo || '';
        }
        toggleAllDay();
    } else if (type === 'task') {
        document.querySelector('input[name="add-type"][value="task"]').checked = true; toggleAddModalType();
        const task = (data.reminders || []).find(t => t.id === evId);
        if (task) {
            document.getElementById('add-modal-title').value = task.title || '';
            if (task.dueDate) { const parts = task.dueDate.split('T'); document.getElementById('add-modal-due-date').value = parts[0]; }
            document.getElementById('add-modal-category-task').value = task.category || 'work'; 
            document.getElementById('add-modal-memo-task').value = task.memo || '';
        }
    }
    updateModalColor(); 
    document.getElementById('add-modal').classList.remove('hidden');
};

const closeAddMenu = () => document.getElementById('add-modal').classList.add('hidden');

const saveAddMenu = () => {
    saveStateToHistory(); 
    const dateStr = appState.addModalTargetDate;
    if (!appState.allPlanners[dateStr]) appState.allPlanners[dateStr] = { classes: {}, reminders: [], events: [] };

    if (appState.currentModalMode === 'class') {
        const cls = document.getElementById('class-edit-cls').value.trim(), sub = document.getElementById('class-edit-sub').value.trim();
        if (!appState.allPlanners[dateStr].classes) appState.allPlanners[dateStr].classes = {};
        if (!cls && !sub) { delete appState.allPlanners[dateStr].classes[appState.editTarget.idOrIndex]; } 
        else { appState.allPlanners[dateStr].classes[appState.editTarget.idOrIndex] = { cls, sub }; }
    } else {
        const title = document.getElementById('add-modal-title').value.trim();
        if (!title) return;

        if (appState.currentModalMode === 'schedule') {
            const isAllDay = document.getElementById('add-modal-allday').checked;
            const startD = document.getElementById('add-modal-start-date').value, startT = document.getElementById('add-modal-start-time').value;
            const endD = document.getElementById('add-modal-end-date').value, endT = document.getElementById('add-modal-end-time').value;
            const ev = {
                id: appState.editTarget ? appState.editTarget.idOrIndex : Date.now().toString(),
                title, isAllDay, category: document.getElementById('add-modal-category-sched').value,
                location: document.getElementById('add-modal-location').value, memo: document.getElementById('add-modal-memo-sched').value,
                start: isAllDay ? startD : `${startD}T${startT}`, end: isAllDay ? endD : `${endD}T${endT}`
            };
            if (!appState.allPlanners[dateStr].events) appState.allPlanners[dateStr].events = [];
            if (appState.editTarget) {
                const idx = appState.allPlanners[dateStr].events.findIndex(e => e.id === ev.id);
                if(idx >= 0) appState.allPlanners[dateStr].events[idx] = ev; else appState.allPlanners[dateStr].events.push(ev);
            } else { appState.allPlanners[dateStr].events.push(ev); }
        } else if (appState.currentModalMode === 'task') {
            const dueStr = document.getElementById('add-modal-due-date').value;
            const cat = document.getElementById('add-modal-category-task').value; 
            const tsk = {
                id: appState.editTarget ? appState.editTarget.idOrIndex : Date.now().toString(),
                title, completed: false, dueDate: dueStr, category: cat, memo: document.getElementById('add-modal-memo-task').value
            };
            if (!appState.allPlanners[dateStr].reminders) appState.allPlanners[dateStr].reminders = [];
            if (appState.editTarget) {
                const taskObj = appState.allPlanners[dateStr].reminders.find(t => t.id === tsk.id);
                if (taskObj) Object.assign(taskObj, tsk);
            } else { appState.allPlanners[dateStr].reminders.push(tsk); }
        }
    }
    safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners)); saveToFirebase(); closeAddMenu(); renderCurrentView(); 
};

const deleteFromMenu = () => {
    if (!appState.editTarget) return;
    saveStateToHistory();
    const { dateStr, idOrIndex } = appState.editTarget;
    if (appState.currentModalMode === 'schedule') {
        if (appState.allPlanners[dateStr] && appState.allPlanners[dateStr].events) appState.allPlanners[dateStr].events = appState.allPlanners[dateStr].events.filter(e => e.id !== idOrIndex);
    } else if (appState.currentModalMode === 'task') {
        if (appState.allPlanners[dateStr] && appState.allPlanners[dateStr].reminders) appState.allPlanners[dateStr].reminders = appState.allPlanners[dateStr].reminders.filter(t => t.id !== idOrIndex);
    } else if (appState.currentModalMode === 'class') {
        if (appState.allPlanners[dateStr] && appState.allPlanners[dateStr].classes) delete appState.allPlanners[dateStr].classes[idOrIndex];
    }
    safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners)); saveToFirebase(); closeAddMenu(); renderCurrentView();
};

const toggleAllDay = () => {
    const isAllDay = document.getElementById('add-modal-allday').checked;
    document.getElementById('add-modal-start-time').classList.toggle('hidden', isAllDay); document.getElementById('add-modal-end-time').classList.toggle('hidden', isAllDay);
};

const toggleAddModalType = () => {
    appState.currentModalMode = document.querySelector('input[name="add-type"]:checked').value;
    const isSched = appState.currentModalMode === 'schedule';
    document.getElementById('view-class-edit').classList.add('hidden'); document.getElementById('view-schedule-task').classList.remove('hidden');
    document.getElementById('fields-location').style.display = isSched ? 'flex' : 'none';
    document.getElementById('fields-schedule-datetime').style.display = isSched ? 'block' : 'none';
    document.getElementById('fields-task-datetime').style.display = isSched ? 'none' : 'block';
    document.getElementById('fields-schedule-options').style.display = isSched ? 'block' : 'none';
    document.getElementById('fields-task-options').style.display = isSched ? 'none' : 'block';
    updateModalColor(); 
};

const updateModalColor = () => {
    const mode = document.querySelector('input[name="add-type"]:checked').value;
    const cat = document.getElementById(`add-modal-category-${mode === 'schedule' ? 'sched' : 'task'}`).value;
    const indicator = document.getElementById('add-modal-color-indicator');
    if(!indicator) return;
    
    indicator.className = 'w-2 h-2 rounded-full shrink-0 transition-colors duration-200';
    if (cat === 'work') indicator.classList.add('bg-red-500');
    else if (cat === 'club') indicator.classList.add('bg-blue-500');
    else if (cat === 'private') indicator.classList.add('bg-orange-500');
    else indicator.classList.add('bg-[#4a5f73]');
};

const handleStartTimeChange = () => {
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

const toggleTaskGlobal = (dateStr, taskId, completed) => {
    saveStateToHistory();
    if (appState.allPlanners[dateStr] && appState.allPlanners[dateStr].reminders) {
        const task = appState.allPlanners[dateStr].reminders.find(t => t.id === taskId);
        if (task) {
            task.completed = completed;
            safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners));
            saveToFirebase();
            renderCurrentView();
        }
    }
};


// ==========================================
// 設定画面制御
// ==========================================
const initSettingsView = () => {
    appState.tempSettings = JSON.parse(JSON.stringify(appState.globalSettings));
    appState.tempSettings.activePatternIndex = 0;
    renderSettingsView();
};

const syncTempSettingsFromDOM = () => {
    if (!appState.tempSettings) return;
    Object.keys(appState.tempSettings.timetables).forEach(key => {
        const tt = appState.tempSettings.timetables[key];
        const nameInput = document.getElementById(`set-tt-${key}-name`);
        if (nameInput) tt.name = nameInput.value;
        
        tt.periods.forEach((p, idx) => {
            if (p.id === 'p_allday') return; 
            const nameEl = document.getElementById(`set-tt-${key}-${idx}-name`);
            const sEl = document.getElementById(`set-tt-${key}-${idx}-s`);
            const eEl = document.getElementById(`set-tt-${key}-${idx}-e`);
            if (nameEl) p.name = nameEl.value;
            if (sEl) p.s = sEl.value;
            if (eEl) p.e = eEl.value;
        });
    });

    if (appState.tempSettings.baseTimetablePatterns) {
        const activeIdx = appState.tempSettings.activePatternIndex || 0;
        const activePat = appState.tempSettings.baseTimetablePatterns[activeIdx];
        if (activePat) {
            const nameEl = document.getElementById('settings-pattern-name');
            if (nameEl) activePat.name = nameEl.value;

            const sy = document.getElementById('settings-pattern-start-y').value;
            const sm = document.getElementById('settings-pattern-start-m').value;
            const sd = document.getElementById('settings-pattern-start-d').value;
            if (sy && sm && sd) activePat.startDate = `${sy}-${sm}-${sd}`;
            else activePat.startDate = "";

            const ey = document.getElementById('settings-pattern-end-y').value;
            const em = document.getElementById('settings-pattern-end-m').value;
            const ed = document.getElementById('settings-pattern-end-d').value;
            if (ey && em && ed) activePat.endDate = `${ey}-${em}-${ed}`;
            else activePat.endDate = "";

            delete activePat.startMonth; delete activePat.endMonth;

            const days = [1,2,3,4,5]; 
            const pNames = ["1限","2限","3限","4限","5限","6限"];
            days.forEach(d => {
                pNames.forEach(pn => {
                    const clsEl = document.getElementById(`base-tt-${d}-${pn}-cls`);
                    const subEl = document.getElementById(`base-tt-${d}-${pn}-sub`);
                    const memoEl = document.getElementById(`base-tt-${d}-${pn}-memo`);
                    if (clsEl && subEl && memoEl) {
                        if (!activePat.data[d]) activePat.data[d] = {};
                        if (clsEl.value || subEl.value || memoEl.value) {
                            activePat.data[d][pn] = { cls: clsEl.value, sub: subEl.value, memo: memoEl.value };
                        } else {
                            activePat.data[d][pn] = null;
                        }
                    }
                });
            });
        }
    }
};

const renderSettingsView = () => {
    let html = '';
    Object.keys(appState.tempSettings.timetables).forEach(key => {
        const tt = appState.tempSettings.timetables[key];
        html += `<div class="border border-gray-200 rounded bg-gray-50 p-3 mb-3">
            <div class="flex justify-between items-center mb-2">
                <input type="text" id="set-tt-${key}-name" class="font-bold text-sm text-gray-700 bg-transparent border-b border-dashed border-gray-400 outline-none w-1/2 focus:border-[#4a5f73]" value="${tt.name}">
                <button onclick="window.addTtPeriod('${key}')" class="text-[10px] bg-white border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 shadow-sm transition flex items-center gap-1"><i class="fas fa-plus text-[#4a5f73]"></i> 行を追加</button>
            </div>
            <div class="space-y-1">
                <div class="flex text-[9px] font-bold text-gray-400 px-1 gap-1.5">
                    <div class="w-20">枠の名前</div><div class="flex-1">開始 - 終了時刻</div>
                </div>`;
        
        tt.periods.forEach((p, idx) => {
            if (p.id === 'p_allday') return;
            html += `
            <div class="flex items-center gap-1.5 bg-white p-1 border border-gray-200 rounded shadow-sm">
                <input type="text" id="set-tt-${key}-${idx}-name" value="${p.name || ''}" class="w-20 font-bold text-xs text-gray-700 outline-none border border-transparent focus:border-[#4a5f73] bg-gray-50 rounded px-1" placeholder="例: 1限">
                <input type="time" id="set-tt-${key}-${idx}-s" value="${p.s || ''}" class="w-20 text-xs outline-none bg-gray-50 border border-gray-200 rounded px-1 focus:border-[#4a5f73]">
                <span class="text-gray-400 text-[10px]">-</span>
                <input type="time" id="set-tt-${key}-${idx}-e" value="${p.e || ''}" class="w-20 text-xs outline-none bg-gray-50 border border-gray-200 rounded px-1 focus:border-[#4a5f73]">
                <button onclick="window.removeTtPeriod('${key}', ${idx})" class="ml-auto text-gray-300 hover:text-red-500 p-1 transition"><i class="fas fa-trash-alt text-[10px]"></i></button>
            </div>`;
        });
        html += `</div></div>`;
    });
    document.getElementById('settings-timetables-container').innerHTML = html;

    const activeIdx = appState.tempSettings.activePatternIndex || 0;
    const activePat = appState.tempSettings.baseTimetablePatterns[activeIdx];

    const generateDateSelects = (prefix, dateStr) => {
        let y = "", m = "", d = "";
        if (dateStr) { const parts = dateStr.split('-'); y = parts[0]; m = parts[1]; d = parts[2]; }
        let yOpts = '<option value="">--</option>'; for(let i=2020; i<=2035; i++) yOpts += `<option value="${i}" ${y==i?'selected':''}>${i}</option>`;
        let mOpts = '<option value="">--</option>'; for(let i=1; i<=12; i++) { let pad = String(i).padStart(2, '0'); mOpts += `<option value="${pad}" ${m==pad?'selected':''}>${i}</option>`; }
        let dOpts = '<option value="">--</option>'; for(let i=1; i<=31; i++) { let pad = String(i).padStart(2, '0'); dOpts += `<option value="${pad}" ${d==pad?'selected':''}>${i}</option>`; }
        return `
            <select id="${prefix}-y" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${yOpts}</select><span class="text-[10px] text-gray-500 mx-0.5">年</span>
            <select id="${prefix}-m" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${mOpts}</select><span class="text-[10px] text-gray-500 mx-0.5">月</span>
            <select id="${prefix}-d" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${dOpts}</select><span class="text-[10px] text-gray-500 ml-0.5">日</span>
        `;
    };

    let sDate = activePat.startDate; if (!sDate && activePat.startMonth) sDate = activePat.startMonth + "-01";
    let eDate = activePat.endDate; if (!eDate && activePat.endMonth) eDate = activePat.endMonth + "-31";

    const startSelects = generateDateSelects('settings-pattern-start', sDate);
    const endSelects = generateDateSelects('settings-pattern-end', eDate);

    let baseHtml = `
    <div class="flex items-center gap-2 mb-2">
        <select id="settings-pattern-select" class="border border-gray-300 rounded px-1.5 py-1 text-xs outline-none focus:border-[#4a5f73] font-bold text-gray-700 bg-white" onchange="window.changeSettingsPattern(this.value)">
            ${appState.tempSettings.baseTimetablePatterns.map((p, i) => `<option value="${i}" ${i === activeIdx ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
        <button onclick="window.addSettingsPattern()" class="text-[10px] bg-white border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition shadow-sm flex items-center gap-1"><i class="fas fa-plus"></i> 追加</button>
        ${appState.tempSettings.baseTimetablePatterns.length > 1 ? `<button onclick="window.removeSettingsPattern()" class="text-[10px] bg-white border border-gray-300 text-red-500 px-2 py-1 rounded hover:bg-red-50 transition shadow-sm flex items-center gap-1"><i class="fas fa-trash-alt"></i> 削除</button>` : ''}
    </div>

    <div class="flex flex-col gap-2 mb-3 bg-gray-50 p-2 rounded border border-gray-200">
        <div class="flex flex-col sm:flex-row gap-3">
            <div>
                <label class="block text-[9px] font-bold text-gray-500 mb-0.5">パターン名</label>
                <input type="text" id="settings-pattern-name" value="${activePat.name}" onchange="window.updatePatternName(this.value)" class="border border-gray-300 rounded px-1.5 py-1 text-xs outline-none w-40 focus:border-[#4a5f73] font-bold text-gray-800">
            </div>
            <div>
                <label class="block text-[9px] font-bold text-gray-500 mb-0.5">適用期間</label>
                <div class="flex flex-wrap items-center gap-1">
                    <div class="flex items-center">${startSelects}</div>
                    <span class="text-gray-400 font-bold mx-0.5 text-[10px]">〜</span>
                    <div class="flex items-center">${endSelects}</div>
                </div>
            </div>
        </div>
    </div>
    `;

    const days = [{d:1,n:"月"},{d:2,n:"火"},{d:3,n:"水"},{d:4,n:"木"},{d:5,n:"金"}];
    const pNames = ["1限","2限","3限","4限","5限","6限"]; 

    baseHtml += `<div class="overflow-x-auto"><table class="w-full text-xs text-left border-collapse min-w-[400px]">
        <thead><tr class="bg-gray-100 text-gray-500"><th class="border border-gray-200 p-1 w-10 text-center">時限</th>
            ${days.map(day => `<th class="border border-gray-200 p-1 text-center w-[18%]">${day.n}</th>`).join('')}
        </tr></thead><tbody>`;

    pNames.forEach(pn => {
        baseHtml += `<tr><td class="border border-gray-200 p-1 text-center font-bold text-gray-600 bg-gray-50 text-[10px]">${pn}</td>`;
        days.forEach(day => {
            const val = activePat.data[day.d] && activePat.data[day.d][pn] ? activePat.data[day.d][pn] : {};
            const clsVal = typeof val === 'string' ? val.split(' ')[0] || '' : val.cls || '';
            const subVal = typeof val === 'string' ? val.split(' ').slice(1).join(' ') || '' : val.sub || '';
            const memoVal = typeof val === 'string' ? '' : val.memo || '';
            
            baseHtml += `<td class="border border-gray-200 p-0.5 bg-white align-top">
                <div class="flex flex-col gap-0.5">
                    <input type="text" id="base-tt-${day.d}-${pn}-cls" value="${clsVal}" list="class-list" placeholder="ｸﾗｽ" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                    <input type="text" id="base-tt-${day.d}-${pn}-sub" value="${subVal}" list="sub-list" placeholder="教科・内容" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                    <input type="text" id="base-tt-${day.d}-${pn}-memo" value="${memoVal}" placeholder="予定/ﾒﾓ" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                </div>
            </td>`;
        });
        baseHtml += `</tr>`;
    });
    baseHtml += `</tbody></table></div>`;
    document.getElementById('settings-basetimetable-container').innerHTML = baseHtml;
};

const changeSettingsPattern = (idxStr) => {
    syncTempSettingsFromDOM();
    appState.tempSettings.activePatternIndex = parseInt(idxStr);
    renderSettingsView();
};

const updatePatternName = (val) => {
    const activeIdx = appState.tempSettings.activePatternIndex || 0;
    if (appState.tempSettings.baseTimetablePatterns[activeIdx]) {
        appState.tempSettings.baseTimetablePatterns[activeIdx].name = val;
        const select = document.getElementById('settings-pattern-select');
        if (select && select.options[activeIdx]) {
            select.options[activeIdx].text = val;
        }
    }
};

const addSettingsPattern = () => {
    syncTempSettingsFromDOM();
    const newIdx = appState.tempSettings.baseTimetablePatterns.length;
    appState.tempSettings.baseTimetablePatterns.push({
        id: 'p_' + Date.now(), name: '新しいパターン', startDate: '', endDate: '', data: {1:{},2:{},3:{},4:{},5:{}}
    });
    appState.tempSettings.activePatternIndex = newIdx;
    renderSettingsView();
};

const removeSettingsPattern = () => {
    if (appState.tempSettings.baseTimetablePatterns.length <= 1) { alert("パターンは最低1つ必要です。"); return; }
    if (confirm("現在表示しているパターンを削除しますか？")) {
        const activeIdx = appState.tempSettings.activePatternIndex || 0;
        appState.tempSettings.baseTimetablePatterns.splice(activeIdx, 1);
        appState.tempSettings.activePatternIndex = 0;
        renderSettingsView();
    }
};

const addTtPeriod = (key) => {
    syncTempSettingsFromDOM();
    const tt = appState.tempSettings.timetables[key];
    const pId = 'p_' + Date.now();
    const nextNum = tt.periods.filter(p=>p.id!=='p_allday'&&!p.isAllDay).length + 1;
    tt.periods.push({ id: pId, name: `${nextNum}限`, s: "", e: "" });
    renderSettingsView();
};

const removeTtPeriod = (key, idx) => {
    if (confirm("この行を削除しますか？")) {
        syncTempSettingsFromDOM();
        appState.tempSettings.timetables[key].periods.splice(idx, 1);
        renderSettingsView();
    }
};

const saveSettings = () => {
    syncTempSettingsFromDOM();
    appState.globalSettings = JSON.parse(JSON.stringify(appState.tempSettings));
    safeSetItem('teacher_planner_settings', JSON.stringify(appState.globalSettings));
    saveToFirebase(); updateDisplayMode(); renderCurrentView();
    alert("設定を保存しました。");
};


// ==========================================
// 検索・クリック・グローバルイベント
// ==========================================
const handleMonthSearch = () => {
    renderCurrentView(); 
    const searchWord = document.getElementById('month-search-input').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('month-search-results');
    
    if (!searchWord) { resultsContainer.classList.add('hidden'); return; }

    let resultsHtml = ''; let count = 0;
    const sortedDates = Object.keys(appState.allPlanners).sort();

    sortedDates.forEach(dateStr => {
        const data = appState.allPlanners[dateStr];
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

    if (count === 0) resultsHtml = '<div class="p-3 text-center text-gray-400 text-[10px] font-bold">一致する予定・タスクは見つかりませんでした</div>';
    resultsContainer.innerHTML = resultsHtml;
    resultsContainer.classList.remove('hidden');
};

const goToDateFromSearch = (dateStr, itemId) => {
    const resultsContainer = document.getElementById('month-search-results');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    const searchInput = document.getElementById('month-search-input');
    if (searchInput) searchInput.value = '';
    
    const targetDate = new Date(dateStr);
    appState.calendarDisplayDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    appState.currentDateObj = new Date(targetDate);
    
    appState.selectedCellId = `month-cell-${dateStr}`;
    appState.selectedSlot = null;
    appState.searchedItemId = itemId;
    
    switchView('month');
    
    setTimeout(() => {
        const cell = document.getElementById(`month-cell-${dateStr}`);
        if (cell) cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
};

const clearCellSelection = () => { 
    let changed = false;
    if (appState.selectedCellId) { appState.selectedCellId = null; changed = true; }
    if (appState.selectedSlot) { appState.selectedSlot = null; changed = true; }
    if (appState.searchedItemId) { appState.searchedItemId = null; changed = true; }
    closeMonthBottomSheet();
    if (changed) renderCurrentView(); 
};

const handleCellClick = (viewType, dateStr, hour) => {
    openMonthBottomSheet(dateStr, hour);
    appState.selectedSlot = { view: viewType, date: dateStr, hour: hour }; appState.selectedCellId = null;
    renderCurrentView();
};

const handleMonthCellClick = (dStr) => {
    const cellId = `month-cell-${dStr}`;
    if (appState.selectedCellId === cellId) { clearCellSelection(); } 
    else { appState.selectedCellId = cellId; appState.selectedSlot = null; renderCurrentView(); openMonthBottomSheet(dStr); }
};

// スワイプ処理用の変数
let swipeStartX = 0, swipeStartY = 0, swipeTargetElem = null, swipeStartScrollLeft = 0, swipeStartScrollWidth = 0, swipeStartClientWidth = 0;
let isSwiping = false, swipeDirectionDetermined = false, activeViewElem = null;

// ==========================================
// イベントリスナーの登録
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initDataSync();
    
    // Firebase初期化とデータ変更コールバックの登録
    initFirebase();
    setOnDataChangedCallback(() => {
        updateDisplayMode();
        renderCurrentView();
    });

    Memo.initMemoCanvas();
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

window.addEventListener('resize', updateDisplayMode);

document.addEventListener('click', (e) => { 
    if (!document.body.contains(e.target)) return;
    if (!e.target.closest('.calendar-cell') && !e.target.closest('.timeline-cell') && !e.target.closest('#add-modal') && !e.target.closest('.nav-btn') && !e.target.closest('#week-view-allday') && !e.target.closest('#month-bottom-sheet') && !e.target.closest('#memo-edit-modal') && !e.target.closest('#weekly-plan-modal')) {
        clearCellSelection(); 
    } 
    const searchResults = document.getElementById('month-search-results');
    if (searchResults && !searchResults.classList.contains('hidden') && !e.target.closest('#month-search-input') && !e.target.closest('#month-search-results')) {
        searchResults.classList.add('hidden');
    }
});

// スワイプイベント登録
document.addEventListener('touchstart', (e) => {
    if (document.getElementById('memo-drawing-canvas') && document.getElementById('memo-drawing-canvas').style.pointerEvents !== 'none') return;
    if (!document.getElementById('add-modal').classList.contains('hidden') ||
        !document.getElementById('weekly-plan-modal').classList.contains('hidden') ||
        !document.getElementById('memo-edit-modal').classList.contains('hidden')) {
        return;
    }
    if (appState.currentView !== 'month' && appState.currentView !== 'week' && appState.currentView !== 'weekly-plan') return;

    swipeStartX = e.touches[0].screenX; swipeStartY = e.touches[0].screenY;
    swipeTargetElem = null; isSwiping = false; swipeDirectionDetermined = false;
    activeViewElem = document.getElementById(`${appState.currentView}-animation-area`);

    let target = e.target;
    while (target && target !== document.body) {
        if (target.scrollWidth > target.clientWidth) {
            const style = window.getComputedStyle(target);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll' || target.classList.contains('overflow-x-auto') || target.classList.contains('custom-scrollbar')) {
                swipeTargetElem = target; swipeStartScrollLeft = target.scrollLeft; swipeStartScrollWidth = target.scrollWidth; swipeStartClientWidth = target.clientWidth;
                break;
            }
        }
        target = target.parentNode;
    }
    if (activeViewElem) activeViewElem.style.transition = 'none';
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!swipeStartX || !activeViewElem) return;
    const diffX = e.touches[0].screenX - swipeStartX;
    const diffY = e.touches[0].screenY - swipeStartY;

    if (!swipeDirectionDetermined) {
        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            swipeDirectionDetermined = true;
            if (Math.abs(diffX) > Math.abs(diffY)) isSwiping = true;
            else { swipeStartX = null; return; }
        } else return; 
    }

    if (isSwiping) {
        if (swipeTargetElem) {
            if (diffX < 0) { if (Math.ceil(swipeStartScrollLeft + swipeStartClientWidth) < swipeStartScrollWidth - 5) return; } 
            else { if (swipeStartScrollLeft > 5) return; }
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
            activeViewElem.style.transform = 'translateX(0)'; activeViewElem.style.opacity = '1';
            setTimeout(() => { if (activeViewElem) activeViewElem.style.transition = 'none'; }, 150);
        }
        swipeStartX = null; return;
    }
    const diffX = e.changedTouches[0].screenX - swipeStartX;
    activeViewElem.style.transition = 'transform 0.1s ease-out, opacity 0.1s ease-out';

    if (Math.abs(diffX) > 60) {
        const sign = diffX > 0 ? 1 : -1;
        activeViewElem.style.transform = `translateX(${sign * 30}px)`; 
        activeViewElem.style.opacity = '0';
        setTimeout(() => {
            if (diffX < 0) {
                if (appState.currentView === 'month') changeMonthView(1);
                else if (appState.currentView === 'week') changeWeekView(1);
                else if (appState.currentView === 'weekly-plan') changeWeeklyPlanView(1);
            } else {
                if (appState.currentView === 'month') changeMonthView(-1);
                else if (appState.currentView === 'week') changeWeekView(-1);
                else if (appState.currentView === 'weekly-plan') changeWeeklyPlanView(-1);
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
        activeViewElem.style.transform = 'translateX(0)'; activeViewElem.style.opacity = '1';
        setTimeout(() => { if (activeViewElem) activeViewElem.style.transition = 'none'; }, 100);
    }
    swipeStartX = null; isSwiping = false;
});


// ==========================================
// グローバル関数エクスポート（HTMLから呼ぶ用）
// ==========================================
// 画面・View切り替え
window.switchView = switchView;
window.renderCurrentView = renderCurrentView;
window.goToToday = goToToday;
window.changeMonthView = changeMonthView;
window.changeWeekView = changeWeekView;
window.changeWeeklyPlanView = changeWeeklyPlanView;
window.updateWeeklyPlanPeriods = updateWeeklyPlanPeriods;
window.saveWeeklyPlan = saveWeeklyPlan;

// カレンダークリック・検索
window.handleCellClick = handleCellClick;
window.handleMonthCellClick = handleMonthCellClick;
window.openMonthBottomSheet = openMonthBottomSheet;
window.closeMonthBottomSheet = closeMonthBottomSheet;
window.handleMonthSearch = handleMonthSearch;
window.goToDateFromSearch = goToDateFromSearch;

// 予定追加・編集モーダル
window.openAddMenu = openAddMenu;
window.openClassEditMenu = openClassEditMenu;
window.openEditMenu = openEditMenu;
window.closeAddMenu = closeAddMenu;
window.saveAddMenu = saveAddMenu;
window.deleteFromMenu = deleteFromMenu;
window.toggleAllDay = toggleAllDay;
window.toggleAddModalType = toggleAddModalType;
window.updateModalColor = updateModalColor;
window.handleStartTimeChange = handleStartTimeChange;
window.toggleTaskGlobal = toggleTaskGlobal;

// Undo / Redo
window.undo = undo;
window.redo = redo;
window.saveStateToHistory = saveStateToHistory;

// 同期
window.linkDevice = linkDevice;

// 設定モーダル
window.saveSettings = saveSettings;
window.changeSettingsPattern = changeSettingsPattern;
window.updatePatternName = updatePatternName;
window.addSettingsPattern = addSettingsPattern;
window.removeSettingsPattern = removeSettingsPattern;
window.addTtPeriod = addTtPeriod;
window.removeTtPeriod = removeTtPeriod;

// メモ関連
window.toggleMemoSidebar = Memo.toggleMemoSidebar;
window.selectMemoFilter = Memo.selectMemoFilter;
window.changeMemoSort = Memo.changeMemoSort;
window.enterFolder = Memo.enterFolder;
window.createNewFolder = Memo.createNewFolder;
window.deleteFolder = Memo.deleteFolder;
window.updateMemoFolderOptions = Memo.updateMemoFolderOptions;
window.updateMemoDateLabel = Memo.updateMemoDateLabel;
window.triggerAutoSaveMemo = Memo.triggerAutoSaveMemo;
window.openMemoEdit = Memo.openMemoEdit;
window.toggleMemoFavorite = Memo.toggleMemoFavorite;
window.saveMemoLocally = Memo.saveMemoLocally;
window.saveAndCloseMemo = Memo.saveAndCloseMemo;
window.deleteMemo = Memo.deleteMemo;
window.copyMemoText = Memo.copyMemoText;
window.printMemo = Memo.printMemo;
window.toggleMemoDrawMode = Memo.toggleMemoDrawMode;
window.setMemoTool = Memo.setMemoTool;
window.setMemoColor = Memo.setMemoColor;
window.setMemoLineWidth = Memo.setMemoLineWidth;
window.clearMemoCanvas = Memo.clearMemoCanvas;

// 週案簿モーダル（calendar.jsから紐付け）
import { 
    closeWeeklyPlanModal, saveWeeklyPlanModal, deleteWeeklyPlanModal, resetWeeklyPlanModal,
    toggleCutWeeklyPlanModal, renderWpModalButtons, changeWpModalSource, updateWpModalBaseStatus
} from './calendar.js';

window.closeWeeklyPlanModal = closeWeeklyPlanModal;
window.saveWeeklyPlanModal = saveWeeklyPlanModal;
window.deleteWeeklyPlanModal = deleteWeeklyPlanModal;
window.resetWeeklyPlanModal = resetWeeklyPlanModal;
window.toggleCutWeeklyPlanModal = toggleCutWeeklyPlanModal;
window.renderWpModalButtons = renderWpModalButtons;
window.changeWpModalSource = changeWpModalSource;
window.updateWpModalBaseStatus = updateWpModalBaseStatus;