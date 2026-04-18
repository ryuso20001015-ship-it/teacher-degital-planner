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
// ※ 他のファイルから書き換えやすいように、一つのオブジェクトにまとめます
export const appState = {
    // データ群
    allPlanners: {}, 
    globalSettings: {},
    allMemos: [],
    allFolders: [],
    
    // メモの状態
    currentMemoFilter: 'all', 
    currentMemoFolderId: null, 
    editingMemoId: null,
    currentMemoSort: 'updatedAt_desc',
    
    // 表示とUIの状態
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
    
    // 週案簿用モーダルの状態
    wpModalTarget: { targetDateStr: null, targetPeriodId: null, targetPeriodName: null },
    wpSelectedDay: 1,
    wpSelectedPeriod: 1,

    // Undo / Redo 用
    undoStack: [],
    redoStack: []
};


// --- 設定データの初期化 ---
appState.globalSettings = JSON.parse(safeGetItem('teacher_planner_settings')) || { timetables: DEFAULT_TIMETABLES };
appState.globalSettings.displayMode = 'auto';

if (!appState.globalSettings.baseTimetablePatterns || appState.globalSettings.baseTimetablePatterns.length === 0) {
    const oldBaseTt = appState.globalSettings.baseTimetable || {1:{},2:{},3:{},4:{},5:{}};
    appState.globalSettings.baseTimetablePatterns = [
        { id: 'p_1', name: 'パターン1', startDate: '', endDate: '', data: oldBaseTt }
    ];
}