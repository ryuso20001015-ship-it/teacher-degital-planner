import { safeGetItem } from './utils.js';

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

// 他のモジュールから安全にアクセス・更新できるよう、状態を一元管理するオブジェクト
export const state = {
    allPlanners: {},
    globalSettings: JSON.parse(safeGetItem('teacher_planner_settings')) || { timetables: DEFAULT_TIMETABLES, displayMode: 'auto' },
    
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
    
    wpModalTarget: { targetDateStr: null, targetPeriodId: null, targetPeriodName: null },
    wpSelectedDay: 1,
    wpSelectedPeriod: 1,

    undoStack: [],
    redoStack: [],

    // Firebase関連
    db: null,
    auth: null,
    unsubscribeSnapshot: null,
    isLinkedDevice: false,
    lastCloudUpdateTime: 0,
    
    // その他UI関連
    searchedItemId: null,
    mbsTargetDate: null,
    mbsDefaultHour: null
};

// globalSettings の初期化補正 (既存コードの引き継ぎ)
if (!state.globalSettings.baseTimetablePatterns || state.globalSettings.baseTimetablePatterns.length === 0) {
    const oldBaseTt = state.globalSettings.baseTimetable || {1:{},2:{},3:{},4:{},5:{}};
    state.globalSettings.baseTimetablePatterns = [
        { id: 'p_1', name: 'パターン1', startDate: '', endDate: '', data: oldBaseTt }
    ];
}