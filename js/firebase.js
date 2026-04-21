// --- Firebase SDK のインポート (CDN経由) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// --- 状態管理データの読み込み ---
import { appState, safeGetItem, safeSetItem, LS_KEY } from "./state.js";

// ==========================================
// Firebase設定
// ※ ここにご自身のFirebaseプロジェクトの設定オブジェクトを貼り付けてください
// ※ セキュリティルールは「テストモード」に設定していることを前提としています
// ==========================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let app, db, auth;
let unsubscribeSnapshot = null;
let isUploading = false; // 自分がアップロードした直後の受信ループを防ぐフラグ

// --- Firebaseの初期化と匿名ログイン ---
export const initFirebase = () => {
    // もし firebaseConfig がデフォルトのままなら初期化をスキップ
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("Firebase: APIキーが設定されていないため、ローカルモードで起動します。");
        updateSyncStatus('offline');
        return;
    }

    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // 匿名ログインを実行
        signInAnonymously(auth).catch((error) => {
            console.error("Firebase Auth エラー:", error);
            updateSyncStatus('error');
        });

        // ログイン状態の監視
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Firebase: 匿名ログイン成功", user.uid);
                checkAndStartSync();
            } else {
                console.log("Firebase: ログアウト状態");
            }
        });
    } catch (error) {
        console.error("Firebase 初期化エラー:", error);
        updateSyncStatus('error');
    }
};

// --- 同期IDの確認と同期開始 ---
const checkAndStartSync = () => {
    const syncId = safeGetItem('teacher_planner_sync_id');
    if (syncId) {
        startSync(syncId);
    } else {
        updateSyncStatus('offline');
    }
};

// --- 同期の開始（他端末の監視） ---
export const startSync = (syncId) => {
    if (!db) return;
    
    // 既存の監視があれば一度解除する
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    safeSetItem('teacher_planner_sync_id', syncId);
    const docRef = doc(db, "planners", syncId);

    updateSyncStatus('connecting');

    // Firestoreのドキュメントをリアルタイム監視
    unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        // 自分がデータを保存した直後に発生するイベントは無視する（ループ防止）
        if (isUploading) return; 

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // クラウドのデータをローカルの appState に反映
            appState.allPlanners = data.allPlanners || {};
            appState.allMemos = data.allMemos || [];
            appState.allFolders = data.allFolders || [];
            if (data.globalSettings) {
                appState.globalSettings = data.globalSettings;
            }

            // ローカルストレージ（バックアップ）も更新
            const localDataToSave = {
                allPlanners: appState.allPlanners,
                allMemos: appState.allMemos,
                allFolders: appState.allFolders
            };
            safeSetItem(LS_KEY, JSON.stringify(localDataToSave));
            safeSetItem('teacher_planner_settings', JSON.stringify(appState.globalSettings));

            // データが更新されたことを全体（main.js等）に通知し、画面を再描画させる
            window.dispatchEvent(new CustomEvent('data-synced'));
            updateSyncStatus('synced');
            console.log("Firebase: クラウドからデータを受信・反映しました");

        } else {
            // 初回: クラウドにデータが存在しない場合は、現在の端末のデータをアップロードして新規作成
            console.log("Firebase: 新しい同期IDとしてデータを初期化します");
            uploadLocalData();
        }
    }, (error) => {
        console.error("Firebase Sync エラー:", error);
        updateSyncStatus('error');
    });
};

// --- データのアップロード（クラウドへ保存） ---
export const uploadLocalData = async () => {
    const syncId = safeGetItem('teacher_planner_sync_id');
    if (!db || !syncId) return;

    isUploading = true;
    updateSyncStatus('syncing');

    try {
        const docRef = doc(db, "planners", syncId);
        const dataToSync = {
            allPlanners: appState.allPlanners,
            allMemos: appState.allMemos,
            allFolders: appState.allFolders,
            globalSettings: appState.globalSettings,
            updatedAt: new Date().toISOString()
        };
        
        await setDoc(docRef, dataToSync);
        updateSyncStatus('synced');
        console.log("Firebase: データをクラウドに保存しました");
    } catch (error) {
        console.error("Firebase データ保存エラー:", error);
        updateSyncStatus('error');
    } finally {
        // 保存直後の Snapshot を無視するため、わずかに遅延させてフラグを下ろす
        setTimeout(() => { isUploading = false; }, 500);
    }
};

// --- 同期の停止 ---
export const stopSync = () => {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }
    safeSetItem('teacher_planner_sync_id', '');
    updateSyncStatus('offline');
};

// --- 新しい同期IDの生成（ランダムな文字列） ---
export const generateNewSyncId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'tp-';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
};

// --- UIへの状態通知 ---
const updateSyncStatus = (status) => {
    // main.jsなどで受け取って、アイコンの色などを変えるためのイベント
    window.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { status } }));
};