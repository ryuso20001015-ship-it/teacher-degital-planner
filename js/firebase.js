import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 先ほど作成した state.js からデータや関数をインポート
import { appState, safeGetItem, safeSetItem, LS_KEY } from './state.js';

// --- モジュール内変数 ---
let db, auth;
let unsubscribeSnapshot = null;
let isLinkedDevice = false; 
let lastCloudUpdateTime = 0; 

// --- データ更新時のコールバック（main.jsから登録される） ---
let onDataChangedCallback = () => {};
export const setOnDataChangedCallback = (callback) => {
    onDataChangedCallback = callback;
};

// --- 同期コード取得 ---
export const getSyncId = () => {
    let id = safeGetItem('teacher_planner_sync_id');
    if (!id) {
        id = Math.floor(10000000 + Math.random() * 90000000).toString();
        safeSetItem('teacher_planner_sync_id', id);
    }
    return id;
};

// --- Firebase初期化 ---
export const initFirebase = async () => {
    const MY_FIREBASE_CONFIG = {
        apiKey: "AIzaSyBQ86uhJYjw2H5_ioH1PgHXE8vjCckeys0",
        authDomain: "teacher-degital-planner.firebaseapp.com",
        databaseURL: "https://teacher-degital-planner-default-rtdb.firebaseio.com",
        projectId: "teacher-degital-planner",
        storageBucket: "teacher-degital-planner.firebasestorage.app",
        messagingSenderId: "134884141905",
        appId: "1:134884141905:web:cf16ccdcd6bbe9907b4170",
        measurementId: "G-Z7CPJ3KNV6"
    }; 
    
    try {
        const app = initializeApp(MY_FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);

        await signInAnonymously(auth);
        onAuthStateChanged(auth, (user) => { 
            if (user) startFirebaseSync(); 
        });
    } catch (e) { 
        console.error("Firebase init failed:", e); 
    }
};

// --- 同期の開始（リアルタイムリスナー） ---
export const startFirebaseSync = () => {
    const syncId = getSyncId();
    const displayElem = document.getElementById('display-sync-id');
    if (displayElem) displayElem.textContent = syncId;

    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const docRef = doc(db, 'planners', syncId);
    
    unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const cloudTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
            if (cloudTime <= lastCloudUpdateTime) return; 
            
            lastCloudUpdateTime = cloudTime;
            let changed = false;

            if (data.planners) {
                appState.allPlanners = data.planners;
                safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners));
                changed = true;
            }
            if (data.settings) {
                appState.globalSettings = data.settings;
                safeSetItem('teacher_planner_settings', JSON.stringify(appState.globalSettings));
                changed = true;
            }
            if (data.memos) {
                appState.allMemos = data.memos;
                safeSetItem('teacher_planner_memos', JSON.stringify(appState.allMemos));
                changed = true;
            }
            if (data.folders) {
                appState.allFolders = data.folders;
                safeSetItem('teacher_planner_folders', JSON.stringify(appState.allFolders));
                changed = true;
            }

            if (changed) {
                // データが変更されたことを司令塔（main.js）に通知し、UI再描画を依頼する
                onDataChangedCallback();
            }
        } else {
            if (!isLinkedDevice) saveToFirebase();
        }
    });
};

// --- データをFirebaseへ保存 ---
export const saveToFirebase = async () => {
    if (!db || !auth || !auth.currentUser) return;
    const syncId = getSyncId();
    const docRef = doc(db, 'planners', syncId);
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.classList.remove('hidden');

    const now = new Date().toISOString();
    lastCloudUpdateTime = new Date(now).getTime(); 

    try {
        const payload = {
            planners: JSON.parse(JSON.stringify(appState.allPlanners)),
            settings: JSON.parse(JSON.stringify(appState.globalSettings)),
            memos: JSON.parse(JSON.stringify(appState.allMemos)),
            folders: JSON.parse(JSON.stringify(appState.allFolders)),
            updatedAt: now
        };
        await setDoc(docRef, payload);
    } catch (e) {
        console.error("Firebase save failed:", e);
    } finally {
        setTimeout(() => { if (statusEl) statusEl.classList.add('hidden'); }, 1000);
    }
};

// --- 他の端末とリンク ---
export const linkDevice = () => {
    const input = document.getElementById('input-sync-id').value.trim();
    if (/^\d{8}$/.test(input)) {
        if (confirm(`同期コード ${input} にリンクします。\n現在のこの端末のデータは失われ、リンク先のデータで上書きされますがよろしいですか？`)) {
            safeSetItem('teacher_planner_sync_id', input);
            const displayElem = document.getElementById('display-sync-id');
            if (displayElem) displayElem.textContent = input;
            
            isLinkedDevice = true; 
            lastCloudUpdateTime = 0; 
            
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            startFirebaseSync();
            
            alert("同期コードをリンクし、データの受信を開始しました。");
        }
    } else { 
        alert("正しい8桁の数字を入力してください。"); 
    }
};