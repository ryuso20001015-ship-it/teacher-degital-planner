// js/state.js
// アプリケーションのグローバルな状態管理、ローカルストレージのラッパー、定数定義

window.memoryStorage = {};
window.safeGetItem = (key) => {
    try { return localStorage.getItem(key) || window.memoryStorage[key] || null; } catch(e) { return window.memoryStorage[key] || null; }
};
window.safeSetItem = (key, value) => {
    try { localStorage.setItem(key, value); } catch(e) {}
    window.memoryStorage[key] = String(value);
};
window.safeRemoveItem = (key) => {
    try { localStorage.removeItem(key); } catch(e) {}
    delete window.memoryStorage[key];
};

window.LS_KEY = 'teacher_planner_all_data';
window.DAYS_STR = ['日', '月', '火', '水', '木', '金', '土'];

window.DEFAULT_TIMETABLES = {
    normal: { name: "通常日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:30"}, {id:"p_2",name:"2限",s:"09:40",e:"10:30"}, {id:"p_3",name:"3限",s:"10:40",e:"11:30"}, {id:"p_4",name:"4限",s:"11:40",e:"12:30"}, {id:"p_5",name:"5限",s:"13:30",e:"14:20"}, {id:"p_6",name:"6限",s:"14:30",e:"15:20"} ] },
    short: { name: "短縮日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:25"}, {id:"p_2",name:"2限",s:"09:35",e:"10:20"}, {id:"p_3",name:"3限",s:"10:30",e:"11:15"}, {id:"p_4",name:"4限",s:"11:25",e:"12:10"}, {id:"p_5",name:"5限",s:"13:00",e:"13:45"}, {id:"p_6",name:"6限",s:"13:55",e:"14:40"} ] },
    special: { name: "特短日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:20"}, {id:"p_2",name:"2限",s:"09:30",e:"10:10"}, {id:"p_3",name:"3限",s:"10:20",e:"11:00"}, {id:"p_4",name:"4限",s:"11:10",e:"11:50"}, {id:"p_5",name:"5限",s:"12:40",e:"13:20"}, {id:"p_6",name:"6限",s:"13:30",e:"14:10"} ] },
    test: { name: "テスト日課", periods: [ {id:"p_1",name:"1限",s:"08:50",e:"09:40"}, {id:"p_2",name:"2限",s:"09:55",e:"10:45"}, {id:"p_3",name:"11:00",e:"11:50"} ] }
};

window.allPlanners = {}; 
window.globalSettings = JSON.parse(window.safeGetItem('teacher_planner_settings')) || { timetables: window.DEFAULT_TIMETABLES };
window.globalSettings.displayMode = 'auto';

if (!window.globalSettings.baseTimetablePatterns || window.globalSettings.baseTimetablePatterns.length === 0) {
    const oldBaseTt = window.globalSettings.baseTimetable || {1:{},2:{},3:{},4:{},5:{}};
    window.globalSettings.baseTimetablePatterns = [
        { id: 'p_1', name: 'パターン1', startDate: '', endDate: '', data: oldBaseTt }
    ];
}

window.allMemos = [];
window.allFolders = [];
window.MEMO_CATEGORIES = [
    { id: 'meeting', name: '会議', icon: 'fas fa-users', color: 'text-blue-500' },
    { id: 'guidance', name: '生徒指導', icon: 'fas fa-user-graduate', color: 'text-green-500' },
    { id: 'other', name: 'その他', icon: 'fas fa-folder', color: 'text-gray-500' }
];

window.currentMemoFilter = 'all'; 
window.currentMemoFolderId = null; 
window.editingMemoId = null;
window.currentMemoSort = 'updatedAt_desc'; 

window.tempSettings = null; 
window.currentView = 'month'; 
window.currentDateObj = new Date(); 
window.calendarDisplayDate = new Date(); 
window.selectedCellId = null; 
window.selectedSlot = null; 
window.addModalTargetDate = null;
window.editTarget = null; 
window.currentModalMode = 'schedule';

window.wpModalTarget = { targetDateStr: null, targetPeriodId: null, targetPeriodName: null };
window.wpSelectedDay = 1;
window.wpSelectedPeriod = 1;

window.undoStack = [];
window.redoStack = [];
window.MAX_HISTORY = 20;