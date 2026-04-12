import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { state, LS_KEY } from './state.js?v=2';
import { safeGetItem, safeSetItem } from './utils.js?v=2';

const MY_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBQ86uhJYJw2H5_ioH1PgHXE8vjcckeys0",
    authDomain: "teacher-degital-planner.firebaseapp.com",
    databaseURL: "https://teacher-degital-planner-default-rtdb.firebaseio.com",
    projectId: "teacher-degital-planner",
    storageBucket: "teacher-degital-planner.firebasestorage.app",
    messagingSenderId: "134884141905",
    appId: "1:134884141905:web:cf16ccdcd6bbe9907b4170",
    measurementId: "G-Z7CPJ3KNV6"
};

// Firebase通信の内部でのみ使用する変数
let db = null;
let auth = null;
let unsubscribeSnapshot = null;
let isLinkedDevice = false;
let lastCloudUpdateTime = 0;

export const getSyncId = () => {
    let id = safeGetItem('teacher_planner_sync_id');
    if (!id) {
        id = Math.floor(10000000 + Math.random() * 90000000).toString();
        safeSetItem('teacher_planner_sync_id', id);
    }
    return id;
};

export const initFirebase = async () => {
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

            // リモートのデータで state を上書き
            if (data.planners) {
                state.allPlanners = data.planners;
                safeSetItem(LS_KEY, JSON.stringify(state.allPlanners));
                changed = true;
            }
            if (data.settings) {
                state.globalSettings = data.settings;
                safeSetItem('teacher_planner_settings', JSON.stringify(state.globalSettings));
                changed = true;
                if (typeof window.updateDisplayMode === 'function') window.updateDisplayMode(); 
            }
            if (data.memos) {
                state.allMemos = data.memos;
                safeSetItem('teacher_planner_memos', JSON.stringify(state.allMemos));
                changed = true;
            }
            if (data.folders) {
                state.allFolders = data.folders;
                safeSetItem('teacher_planner_folders', JSON.stringify(state.allFolders));
                changed = true;
            }

            if (changed) {
                if (typeof window.renderCurrentView === 'function') window.renderCurrentView(); 
                if (state.currentView === 'memo' && typeof window.renderMemoList === 'function') {
                    window.renderMemoList();
                }
            }
        } else {
            if (!isLinkedDevice) saveToFirebase();
        }
    }, (error) => {
        console.error("Firestore snapshot error:", error);
    });
};

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
            planners: JSON.parse(JSON.stringify(state.allPlanners)),
            settings: JSON.parse(JSON.stringify(state.globalSettings)),
            memos: JSON.parse(JSON.stringify(state.allMemos)),
            folders: JSON.parse(JSON.stringify(state.allFolders)),
            updatedAt: now
        };
        await setDoc(docRef, payload);
    } catch (e) {
        console.error("Firebase save failed:", e);
    } finally {
        setTimeout(() => { if (statusEl) statusEl.classList.add('hidden'); }, 1000);
    }
};

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