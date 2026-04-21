// --- メモリとローカルストレージの管理 ---
export const memoryStorage = {};
export const safeGetItem = (key) => {
    try { return localStorage.getItem(key) || memoryStorage[key] || null; } catch(e) { return memoryStorage[key] || null; }
};
export const safeSetItem = (key, value) => {
    try { localStorage.setItem(key, value); } catch(e) {}
    memoryStorage[key] = String(value);
};
export const safeRemoveItem = (key) => {
    try { localStorage.removeItem(key); } catch(e) {}
    delete memoryStorage[key];
};

// --- 定数（絶対に変わらないデータ） ---
export const LS_KEY = 'teacher_planner_all_data';
export const DAYS_STR = ['日', '月', '火', '水', '木', '金', '土'];
export const MAX_HISTORY = 20;

export const DEFAULT_TIMETABLES = {
    normal: { name: "通常日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:30"}, {id:"p_2",name:"2限",s:"09:40",e:"10:30"}, {id:"p_3",name:"3限",s:"10:40",e:"11:30"}, {id:"p_4",name:"4限",s:"11:40",e:"12:30"}, {id:"p_5",name:"5限",s:"13:30",e:"14:20"}, {id:"p_6",name:"6限",s:"14:30",e:"15:20"} ] },
    short: { name: "短縮日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:25"}, {id:"p_2",name:"2限",s:"09:35",e:"10:20"}, {id:"p_3",name:"3限",s:"10:30",e:"11:15"}, {id:"p_4",name:"4限",s:"11:25",e:"12:10"}, {id:"p_5",name:"5限",s:"13:00",e:"13:45"}, {id:"p_6",name:"6限",s:"13:55",e:"14:40"} ] },
    special: { name: "特短日課", periods: [ {id:"p_1",name:"1限",s:"08:40",e:"09:20"}, {id:"p_2",name:"2限",s:"09:30",e:"10:10"}, {id:"p_3",name:"3限",s:"10:20",e:"11:00"}, {id:"p_4",name:"4限",s:"11:10",e:"11:50"}, {id:"p_5",name:"5限",s:"12:40",e:"13:20"}, {id:"p_6",name:"6限",s:"13:30",e:"14:10"} ] },
    test: { name: "テスト日課", periods: [ {id:"p_1",name:"1限",s:"08:50",e:"09:40"}, {id:"p_2",name:"2限",s:"09:55",e:"10:45"}, {id:"p_3",name:"11:00",e:"11:50"} ] }
};

export const MEMO_CATEGORIES = [
    { id: 'meeting', name: '会議', icon: 'fas fa-users', color: 'text-blue-500' },
    { id: 'guidance', name: '生徒指導', icon: 'fas fa-user-graduate', color: 'text-green-500' },
    { id: 'other', name: 'その他', icon: 'fas fa-folder', color: 'text-gray-500' }
];

// --- 状態管理（アプリ全体で共有する変数） ---
export const appState = {
    allPlanners: {}, 
    globalSettings: {},
    allMemos: [],
    allFolders: [],
    currentMemoFilter: 'all', 
    currentMemoFolderId: null, 
    editingMemoId: null,
    currentMemoSort: 'updatedAt_desc',
    tempSettings: null, 
    currentView: 'month', 
    currentDateObj: new Date(), 
    calendarDisplayDate: new Date(), 
    selectedCellId: null, 
    selectedSlot: null, 
    addModalTargetDate: null,
    editTarget: null, 
    currentModalMode: 'schedule',
    searchedItemId: null,
    wpModalTarget: { targetDateStr: null, targetPeriodId: null, targetPeriodName: null },
    wpSelectedDay: 1,
    wpSelectedPeriod: 1,
    undoStack: [],
    redoStack: []
};

// --- 設定データの初期化と強力な安全対策 ---
let loadedSettings = null;
try {
    const lsData = safeGetItem('teacher_planner_settings');
    if (lsData) {
        loadedSettings = JSON.parse(lsData);
    }
} catch (e) {
    console.error("設定の読み込みに失敗しました", e);
}

appState.globalSettings = loadedSettings || {};

// ★ 対策1：timetablesが存在しない、または空の場合は必ずデフォルトをセットする
if (!appState.globalSettings.timetables || Object.keys(appState.globalSettings.timetables).length === 0) {
    appState.globalSettings.timetables = DEFAULT_TIMETABLES;
}

appState.globalSettings.displayMode = appState.globalSettings.displayMode || 'auto';

// ★ 対策2：baseTimetablePatternsが存在しない場合も必ずデフォルトをセットする
if (!appState.globalSettings.baseTimetablePatterns || appState.globalSettings.baseTimetablePatterns.length === 0) {
    const oldBaseTt = appState.globalSettings.baseTimetable || {1:{},2:{},3:{},4:{},5:{}};
    appState.globalSettings.baseTimetablePatterns = [
        { id: 'p_1', name: 'パターン1', startDate: '', endDate: '', data: oldBaseTt }
    ];
}