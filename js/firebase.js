// js/firebase.js
// Firebaseの初期化、同期、データ保存に関する処理

export const getSyncId = () => {
    let id = window.safeGetItem('teacher_planner_sync_id');
    if (!id) {
        id = Math.floor(10000000 + Math.random() * 90000000).toString();
        window.safeSetItem('teacher_planner_sync_id', id);
    }
    return id;
};

export const initFirebase = async () => {
    if (!window.fb) return;
    // セキュリティ上の理由から、実際のプロジェクトでは環境変数等で管理することが推奨されます。
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
        const app = window.fb.initializeApp(MY_FIREBASE_CONFIG);
        window.auth = window.fb.getAuth(app);
        window.db = window.fb.getFirestore(app);

        await window.fb.signInAnonymously(window.auth);
        window.fb.onAuthStateChanged(window.auth, (user) => { 
            if (user) window.startFirebaseSync(); 
        });
    } catch (e) { 
        console.error("Firebase init failed:", e); 
    }
};

export const startFirebaseSync = () => {
    const syncId = getSyncId();
    const displayElem = document.getElementById('display-sync-id');
    if (displayElem) displayElem.textContent = syncId;

    if (window.unsubscribeSnapshot) window.unsubscribeSnapshot();
    const docRef = window.fb.doc(window.db, 'planners', syncId);
    
    window.unsubscribeSnapshot = window.fb.onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const cloudTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
            if (cloudTime <= window.lastCloudUpdateTime) return; 
            
            window.lastCloudUpdateTime = cloudTime;
            let changed = false;

            if (data.planners) {
                window.allPlanners = data.planners;
                window.safeSetItem(window.LS_KEY, JSON.stringify(window.allPlanners));
                changed = true;
            }
            if (data.settings) {
                window.globalSettings = data.settings;
                window.safeSetItem('teacher_planner_settings', JSON.stringify(window.globalSettings));
                changed = true;
                if(typeof window.updateDisplayMode === 'function') window.updateDisplayMode(); 
            }
            if (data.memos) {
                window.allMemos = data.memos;
                window.safeSetItem('teacher_planner_memos', JSON.stringify(window.allMemos));
                changed = true;
            }
            if (data.folders) {
                window.allFolders = data.folders;
                window.safeSetItem('teacher_planner_folders', JSON.stringify(window.allFolders));
                changed = true;
            }

            if (changed) {
                if(typeof window.renderCurrentView === 'function') window.renderCurrentView(); 
                if (window.currentView === 'memo' && typeof window.renderMemoList === 'function') window.renderMemoList();
            }
        } else {
            if (!window.isLinkedDevice) window.saveToFirebase();
        }
    });
};

export const saveToFirebase = async () => {
    if (!window.db || !window.auth || !window.auth.currentUser) return;
    const syncId = getSyncId();
    const docRef = window.fb.doc(window.db, 'planners', syncId);
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.classList.remove('hidden');

    const now = new Date().toISOString();
    window.lastCloudUpdateTime = new Date(now).getTime(); 

    try {
        const payload = {
            planners: JSON.parse(JSON.stringify(window.allPlanners)),
            settings: JSON.parse(JSON.stringify(window.globalSettings)),
            memos: JSON.parse(JSON.stringify(window.allMemos)),
            folders: JSON.parse(JSON.stringify(window.allFolders)),
            updatedAt: now
        };
        await window.fb.setDoc(docRef, payload);
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
            window.safeSetItem('teacher_planner_sync_id', input);
            const displayElem = document.getElementById('display-sync-id');
            if (displayElem) displayElem.textContent = input;
            window.isLinkedDevice = true; 
            window.lastCloudUpdateTime = 0; 
            if (window.unsubscribeSnapshot) window.unsubscribeSnapshot();
            window.startFirebaseSync();
            alert("同期コードをリンクし、データの受信を開始しました。");
        }
    } else { 
        alert("正しい8桁の数字を入力してください。"); 
    }
};

// index.html側から呼び出せるようにwindowオブジェクトに登録
window.getSyncId = getSyncId;
window.initFirebase = initFirebase;
window.startFirebaseSync = startFirebaseSync;
window.saveToFirebase = saveToFirebase;
window.linkDevice = linkDevice;