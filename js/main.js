// --- モジュールのインポート ---
import { appState } from './state.js';
import { initFirebase } from './firebase.js';

// ※ 注意：以下のインポートは、今後 calendar.js や memo.js を修正していく際に
// export される関数名と一致している必要があります。
// 現時点で calendar.js 等が未修正の場合、ブラウザのコンソールにエラーが出る場合があります。
import { initCalendar, loadCalendar, changeDate } from './calendar.js';
import { initMemo } from './memo.js';
// もし setting.js を作成している場合は以下も有効にします
// import { initSettings } from './setting.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("Teacher Planner: アプリを初期化します...");

    // 1. 各機能の初期化処理を呼び出す
    try {
        if (typeof initCalendar === 'function') initCalendar();
        if (typeof initMemo === 'function') initMemo();
        // if (typeof initSettings === 'function') initSettings();
    } catch (e) {
        console.warn("モジュールの初期化中にエラーが発生しました（後続の修正で直る予定です）:", e);
    }

    // 2. Firebase同期の開始
    initFirebase();

    // 3. UIイベントのセットアップ（ボタンのクリックなど）
    setupUIListeners();

    // 4. 初回描画
    if (typeof loadCalendar === 'function') {
        loadCalendar();
    }
});

// ------------------------------------------
// UIイベントリスナーの設定
// ------------------------------------------
function setupUIListeners() {
    // --- ヘッダーのナビゲーション（月・週・一覧などの切り替え） ---
    const viewBtns = document.querySelectorAll('.view-btn');
    const viewSections = document.querySelectorAll('.view-section');

    viewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetView = e.target.getAttribute('data-view');
            appState.currentView = targetView;

            // すべてのボタンの色をリセット
            document.querySelectorAll('.view-btn').forEach(b => {
                b.classList.remove('active-view', 'bg-blue-600', 'text-white');
                b.classList.add('text-blue-200');
            });
            // 選択されたビューのボタン（モバイル用も含む）をアクティブ色に
            document.querySelectorAll(`.view-btn[data-view="${targetView}"]`).forEach(b => {
                b.classList.add('active-view', 'bg-blue-600', 'text-white');
                b.classList.remove('text-blue-200');
            });

            // 画面セクションの表示/非表示切り替え
            viewSections.forEach(section => {
                if (section.id === `view-${targetView}`) {
                    section.classList.remove('hidden');
                    section.classList.add('flex'); // Tailwindでレイアウトを維持するため flex を追加
                } else {
                    section.classList.add('hidden');
                    section.classList.remove('flex');
                }
            });

            // 画面が切り替わったらカレンダーを再描画
            if (typeof loadCalendar === 'function') {
                loadCalendar();
            }
        });
    });

    // --- 日付操作ボタン（前へ、次へ、今日） ---
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const todayBtn = document.getElementById('today-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (typeof changeDate === 'function') changeDate(-1);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (typeof changeDate === 'function') changeDate(1);
        });
    }
    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            appState.calendarDisplayDate = new Date();
            if (typeof loadCalendar === 'function') loadCalendar();
        });
    }

    // --- 設定モーダルの開閉 ---
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                // アニメーション用に少し遅延させて透明度を変更
                setTimeout(() => { modal.classList.remove('opacity-0'); }, 10);
            }
        });
    }

    const settingsCloseBtns = document.querySelectorAll('.settings-close');
    settingsCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) {
                modal.classList.add('opacity-0');
                // アニメーションの完了を待ってから非表示にする
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }, 200); 
            }
        });
    });
}

// ------------------------------------------
// カスタムイベントの購読（Firebaseからの通知など）
// ------------------------------------------

// Firebaseから最新データを受信したとき
window.addEventListener('data-synced', () => {
    console.log('Main: クラウドから最新データを受信しました。画面を再描画します。');
    if (typeof loadCalendar === 'function') {
        loadCalendar();
    }
});

// Firebaseの同期ステータスが変わったとき（右上の雲アイコンの色を変える）
window.addEventListener('sync-status-changed', (e) => {
    const status = e.detail.status;
    const icon = document.getElementById('sync-icon');
    const badge = document.getElementById('sync-badge');
    
    if (!icon || !badge) return;

    // 一旦クラスをリセット
    icon.className = 'fas fa-cloud';
    badge.className = 'absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-blue-600';

    switch (status) {
        case 'synced':
            // 同期完了（緑）
            icon.classList.add('text-green-400');
            badge.classList.add('bg-green-500');
            break;
        case 'syncing':
            // 同期中（くるくる回る青）
            icon.className = 'fas fa-sync fa-spin text-blue-300';
            badge.classList.add('hidden');
            break;
        case 'connecting':
            // 接続中（黄色）
            icon.classList.add('text-yellow-400');
            badge.classList.add('bg-yellow-500');
            break;
        case 'error':
            // エラー（赤）
            icon.className = 'fas fa-cloud-meatball text-red-400';
            badge.classList.add('bg-red-500');
            break;
        case 'offline':
        default:
            // オフライン（グレー）
            icon.classList.add('text-gray-300');
            badge.classList.add('bg-gray-500');
            break;
    }
});