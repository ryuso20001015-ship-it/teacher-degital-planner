// js/main.js
// アプリケーションの初期化、イベントリスナー、グローバルな操作関数を管理
// ※ 状態（変数）の定義は state.js に移動済みです。

import { initFirebase, getSyncId, startFirebaseSync, saveToFirebase, linkDevice } from './firebase.js';

// ----------------------------------------------------
// UI・イベント制御関数
// ----------------------------------------------------

window.updateDisplayMode = () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        document.body.classList.add('mode-mobile'); document.body.classList.remove('mode-desktop');
    } else {
        document.body.classList.add('mode-desktop'); document.body.classList.remove('mode-mobile');
    }
    if (typeof window.resizeMemoCanvas === 'function') setTimeout(window.resizeMemoCanvas, 100);
};
window.addEventListener('resize', window.updateDisplayMode);


const initDataSync = () => {
    const localData = window.safeGetItem(window.LS_KEY);
    if (localData) { try { window.allPlanners = JSON.parse(localData); } catch(e){} }
    const localMemos = window.safeGetItem('teacher_planner_memos');
    if (localMemos) { try { window.allMemos = JSON.parse(localMemos); } catch(e){} }
    const localFolders = window.safeGetItem('teacher_planner_folders');
    if (localFolders) { try { window.allFolders = JSON.parse(localFolders); } catch(e){} }

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let memoChanged = false;
    window.allMemos = window.allMemos.filter(m => {
        if (m.categoryId === 'trash' && m.deletedAt && (now - m.deletedAt) > thirtyDays) {
            memoChanged = true;
            return false;
        }
        return true;
    });
    if (memoChanged) {
        window.safeSetItem('teacher_planner_memos', JSON.stringify(window.allMemos));
        if (typeof window.saveToFirebase === 'function') window.saveToFirebase();
    }

    initTodayButtons(); 
    if (typeof window.updateUndoRedoButtons === 'function') window.updateUndoRedoButtons(); 
    if (typeof window.renderCurrentView === 'function') window.renderCurrentView(); 
};

const initTodayButtons = () => {
    const today = new Date();
    const dateStr = today.getDate(), dayStr = `(${window.DAYS_STR[today.getDay()]})`;
    document.querySelectorAll('.today-btn-date').forEach(el => el.textContent = dateStr);
    document.querySelectorAll('.today-btn-day').forEach(el => el.textContent = dayStr);
};

window.goToToday = () => {
    const today = new Date(); 
    window.currentDateObj = new Date(today); 
    window.calendarDisplayDate = new Date(today);
    
    if (typeof window.renderCurrentView === 'function') window.renderCurrentView();
    
    if (window.currentView === 'agenda') {
        const todayStr = window.getFormatDateStr(today);
        const el = document.getElementById(`agenda-date-${todayStr}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.switchView = (viewName) => {
    window.currentView = viewName; 
    if (typeof window.clearCellSelection === 'function') window.clearCellSelection();
    
    document.querySelectorAll('.view-container').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-' + viewName).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-btn-' + viewName).classList.add('active');
    
    if(viewName === 'settings') {
        if (typeof window.initSettingsView === 'function') window.initSettingsView();
        const dSync = document.getElementById('display-sync-id');
        if(dSync) dSync.textContent = getSyncId();
    }

    if(viewName === 'memo') {
        if (typeof window.renderMemoSidebar === 'function') window.renderMemoSidebar();
        if (typeof window.selectMemoFilter === 'function') window.selectMemoFilter(window.currentMemoFilter);
    }

    if (typeof window.renderCurrentView === 'function') window.renderCurrentView();

    if (viewName === 'agenda') {
        setTimeout(() => {
            const todayStr = window.getFormatDateStr(new Date());
            const el = document.getElementById(`agenda-date-${todayStr}`);
            if (el) {
                const container = document.getElementById('agenda-view-list');
                container.scrollTo({ top: el.offsetTop - container.offsetTop - 10, behavior: 'smooth' });
            }
        }, 50);
    }
};

window.getFormatDateStr = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
window.isHoliday = (d) => d.getDay() === 0 || d.getDay() === 6;

window.getEventColorClass = (category) => {
    if (category === 'work') return "bg-red-100 text-red-800 border-red-300";
    if (category === 'club') return "bg-blue-100 text-blue-800 border-blue-300";
    if (category === 'private') return "bg-orange-100 text-orange-800 border-orange-300";
    return "bg-gray-100 text-gray-800 border-gray-300";
};
window.getMultiDayColorClass = (category) => {
    if (category === 'work') return "border-red-400 text-red-800";
    if (category === 'club') return "border-blue-400 text-blue-800";
    if (category === 'private') return "border-orange-400 text-orange-800";
    return "border-gray-400 text-gray-800";
};
window.getClassColorClass = (cls, sub) => {
    const subStr = String(sub || "").trim();
    if (['学活', '総合', '道徳'].includes(subStr)) return "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100";
    const clsStr = String(cls || "").trim();
    if (clsStr.startsWith('1') || clsStr.includes('1年')) return "bg-red-50 text-red-800 border-red-200 hover:bg-red-100";
    else if (clsStr.startsWith('2') || clsStr.includes('2年')) return "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100";
    else if (clsStr.startsWith('3') || clsStr.includes('3年')) return "bg-green-50 text-green-800 border-green-200 hover:bg-green-100";
    return "bg-gray-50 text-gray-800 border-gray-300 hover:bg-gray-100";
};

// ----------------------------------------------------
// イベントリスナー登録
// ----------------------------------------------------

document.addEventListener('click', (e) => { 
    if (!document.body.contains(e.target)) return;
    if (!e.target.closest('.calendar-cell') && !e.target.closest('.timeline-cell') && !e.target.closest('#add-modal') && !e.target.closest('.nav-btn') && !e.target.closest('#week-view-allday') && !e.target.closest('#month-bottom-sheet') && !e.target.closest('#memo-edit-modal') && !e.target.closest('#weekly-plan-modal')) {
        if (typeof window.clearCellSelection === 'function') window.clearCellSelection(); 
    } 
    const searchResults = document.getElementById('month-search-results');
    if (searchResults && !searchResults.classList.contains('hidden') && !e.target.closest('#month-search-input') && !e.target.closest('#month-search-results')) {
        searchResults.classList.add('hidden');
    }
});

// スワイプ処理用変数
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
    if (window.isMemoDrawingMode) return;
    
    if (!document.getElementById('add-modal').classList.contains('hidden') ||
        !document.getElementById('weekly-plan-modal').classList.contains('hidden') ||
        !document.getElementById('memo-edit-modal').classList.contains('hidden')) {
        return;
    }

    if (window.currentView !== 'month' && window.currentView !== 'week' && window.currentView !== 'weekly-plan') {
        return;
    }

    swipeStartX = e.touches[0].screenX;
    swipeStartY = e.touches[0].screenY;
    swipeTargetElem = null;
    isSwiping = false;
    swipeDirectionDetermined = false;
    
    activeViewElem = document.getElementById(`${window.currentView}-animation-area`);

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
                if (window.currentView === 'month' && typeof window.changeMonthView === 'function') window.changeMonthView(1);
                else if (window.currentView === 'week' && typeof window.changeWeekView === 'function') window.changeWeekView(1);
                else if (window.currentView === 'weekly-plan' && typeof window.changeWeeklyPlanView === 'function') window.changeWeeklyPlanView(1);
            } else {
                if (window.currentView === 'month' && typeof window.changeMonthView === 'function') window.changeMonthView(-1);
                else if (window.currentView === 'week' && typeof window.changeWeekView === 'function') window.changeWeekView(-1);
                else if (window.currentView === 'weekly-plan' && typeof window.changeWeeklyPlanView === 'function') window.changeWeeklyPlanView(-1);
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

document.addEventListener('DOMContentLoaded', () => {
    // メモ初期化
    if(typeof window.initMemoCanvas === 'function') window.initMemoCanvas();

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


// ----------------------------------------------------
// 初期化実行
// ----------------------------------------------------
if (window.fb) {
    initFirebase();
} else {
    window.addEventListener('firebase-loaded', () => initFirebase());
}

initDataSync();
window.updateDisplayMode();