// --- モジュールのインポート ---
import { appState, safeSetItem, LS_KEY, DAYS_STR, DEFAULT_TIMETABLES } from './state.js';
import { uploadLocalData } from './firebase.js'; // 保存時にクラウドへアップロードするため

// ==========================================
// ユーティリティ・補助関数
// ==========================================

// 日付を 'YYYY-MM-DD' の文字列にする
const formatDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// 指定した日付の予定リストを取得する
const getEventsForDate = (dateStr) => {
    return appState.allPlanners[dateStr] || [];
};

// 安全に日課データ（時間割の枠）を取得する
const getSafeTimetable = () => {
    const type = appState.globalSettings.currentTimetablePattern || 'normal';
    const timetables = appState.globalSettings.timetables || DEFAULT_TIMETABLES;
    return timetables[type] || timetables['normal'] || DEFAULT_TIMETABLES['normal'];
};


// ==========================================
// エクスポートされる主要関数 (main.jsから呼ばれる)
// ==========================================

// 1. カレンダーモジュールの初期化（イベントリスナーの設定など）
export const initCalendar = () => {
    console.log("Calendar module initialized.");
    setupModalListeners();
    setupWeeklyPlanListeners();
    
    // FAB（右下の＋ボタン）のクリック
    const fabAdd = document.getElementById('fab-add');
    if (fabAdd) {
        fabAdd.addEventListener('click', () => {
            openEventModal(formatDateStr(appState.calendarDisplayDate));
        });
    }
};

// 2. 日付の変更（前へ・次へ）
export const changeDate = (delta) => {
    if (appState.currentView === 'month' || appState.currentView === 'list') {
        appState.calendarDisplayDate.setMonth(appState.calendarDisplayDate.getMonth() + delta);
    } else if (appState.currentView === 'week' || appState.currentView === 'weekly-plan') {
        appState.calendarDisplayDate.setDate(appState.calendarDisplayDate.getDate() + (delta * 7));
    }
    loadCalendar();
};

// 3. カレンダーの描画（画面の更新）
export const loadCalendar = () => {
    updateHeaderDisplay();

    switch (appState.currentView) {
        case 'month':
            renderMonthView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'list':
            renderListView();
            break;
        case 'weekly-plan':
            renderWeeklyPlanView();
            break;
    }
};

// ==========================================
// 各ビューの描画処理
// ==========================================

// ヘッダーの年月表示を更新
const updateHeaderDisplay = () => {
    const displayElement = document.getElementById('current-date-display');
    if (!displayElement) return;

    const y = appState.calendarDisplayDate.getFullYear();
    const m = appState.calendarDisplayDate.getMonth() + 1;

    if (appState.currentView === 'month' || appState.currentView === 'list') {
        displayElement.textContent = `${y}年 ${m}月`;
    } else {
        // 週ビューなどは週の始まりと終わりを表示するなどの工夫が可能
        // ここでは簡易的に該当月を表示
        displayElement.textContent = `${y}年 ${m}月 (週)`;
    }
};

// 【月ビュー】の描画
const renderMonthView = () => {
    const grid = document.getElementById('month-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const year = appState.calendarDisplayDate.getFullYear();
    const month = appState.calendarDisplayDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const todayStr = formatDateStr(new Date());

    // 前月の空白セル
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'bg-gray-50 border-r border-b border-gray-100';
        grid.appendChild(emptyCell);
    }

    // 当月のセル
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDateStr(new Date(year, month, day));
        const cell = document.createElement('div');
        cell.className = 'bg-white p-1 min-h-[100px] border-r border-b border-gray-200 flex flex-col relative cursor-pointer hover:bg-blue-50 transition-colors';
        
        // 日付のクリックで予定追加
        cell.addEventListener('click', (e) => {
            if(e.target === cell || e.target.tagName === 'SPAN') {
                openEventModal(dateStr);
            }
        });

        // 日付ラベル
        const dayHeader = document.createElement('div');
        dayHeader.className = 'text-center mb-1';
        const daySpan = document.createElement('span');
        daySpan.textContent = day;
        daySpan.className = 'inline-block text-sm font-medium w-6 h-6 leading-6 rounded-full';
        
        if (dateStr === todayStr) {
            daySpan.classList.add('bg-blue-600', 'text-white', 'font-bold');
        } else {
            daySpan.classList.add('text-gray-700');
        }
        dayHeader.appendChild(daySpan);
        cell.appendChild(dayHeader);

        // 予定の描画
        const events = getEventsForDate(dateStr);
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'flex-1 overflow-y-auto flex flex-col gap-1 px-1 custom-scrollbar';

        events.forEach(evt => {
            const eventEl = document.createElement('div');
            // 色の設定（デフォルトは青）
            const colorClass = evt.color ? `bg-${evt.color}-100 text-${evt.color}-800 border-${evt.color}-200` : 'bg-blue-100 text-blue-800 border-blue-200';
            
            eventEl.className = `text-[10px] px-1.5 py-0.5 rounded truncate border ${colorClass} font-medium cursor-pointer`;
            
            let icon = '';
            if(evt.type === 'class') icon = '<i class="fas fa-chalkboard mr-1"></i>';
            else if(evt.type === 'task') icon = '<i class="fas fa-tasks mr-1"></i>';

            eventEl.innerHTML = `${icon}${evt.title || 'タイトルなし'}`;
            
            // 予定クリックで編集
            eventEl.addEventListener('click', (e) => {
                e.stopPropagation(); // セルのクリックイベントを発火させない
                openEventModal(dateStr, evt);
            });

            eventsContainer.appendChild(eventEl);
        });

        cell.appendChild(eventsContainer);
        grid.appendChild(cell);
    }
};

// 【週ビュー】の描画 (簡略版)
const renderWeekView = () => {
    const header = document.getElementById('week-header');
    const grid = document.getElementById('week-grid');
    if (!header || !grid) return;

    // ヘッダーのリセット (日課列を残して削除)
    while (header.children.length > 1) {
        header.removeChild(header.lastChild);
    }
    grid.innerHTML = '';

    const current = new Date(appState.calendarDisplayDate);
    // 週の始まりを日曜にする（必要に応じて設定から取得）
    const startOfWeek = new Date(current.setDate(current.getDate() - current.getDay()));

    // 曜日ヘッダーの生成
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        
        const dayEl = document.createElement('div');
        dayEl.className = `border-r border-gray-100 py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-700'}`;
        dayEl.innerHTML = `<div class="text-xs">${DAYS_STR[i]}</div><div class="font-bold text-lg">${d.getDate()}</div>`;
        header.appendChild(dayEl);
    }

    // 安全に日課（コマ）を取得
    const currentTt = getSafeTimetable();
    const periods = currentTt.periods || [];

    // 各コマの行を生成
    periods.forEach(period => {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-8 min-h-[60px] border-b border-gray-200 bg-white';
        
        // 左端の時間割名
        const periodHeader = document.createElement('div');
        periodHeader.className = 'border-r border-gray-100 flex flex-col items-center justify-center bg-gray-50 text-gray-500';
        periodHeader.innerHTML = `<span class="font-bold text-sm">${period.name}</span><span class="text-[10px]">${period.s}-${period.e}</span>`;
        row.appendChild(periodHeader);

        // 7日分のセル
        for (let i = 0; i < 7; i++) {
            const cellDate = new Date(startOfWeek);
            cellDate.setDate(cellDate.getDate() + i);
            const dateStr = formatDateStr(cellDate);

            const cell = document.createElement('div');
            cell.className = 'border-r border-gray-100 p-1 cursor-pointer hover:bg-blue-50 transition';
            cell.addEventListener('click', () => {
                openEventModal(dateStr, null, 'class', period.id);
            });

            // 該当する授業・予定を表示
            const events = getEventsForDate(dateStr).filter(e => e.periodId === period.id);
            events.forEach(evt => {
                const evtEl = document.createElement('div');
                evtEl.className = 'bg-green-100 text-green-800 text-xs p-1 rounded truncate mb-1 font-medium border border-green-200 shadow-sm';
                evtEl.textContent = evt.title;
                evtEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEventModal(dateStr, evt);
                });
                cell.appendChild(evtEl);
            });

            row.appendChild(cell);
        }
        grid.appendChild(row);
    });
};

// 【リストビュー】の描画
const renderListView = () => {
    const container = document.getElementById('list-container');
    const title = document.getElementById('list-month-title');
    if (!container || !title) return;

    container.innerHTML = '';
    const year = appState.calendarDisplayDate.getFullYear();
    const month = appState.calendarDisplayDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    title.textContent = `${year}年${month + 1}月の予定`;

    let hasEvents = false;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDateStr(new Date(year, month, day));
        const events = getEventsForDate(dateStr);

        if (events.length > 0) {
            hasEvents = true;
            const dayBlock = document.createElement('div');
            dayBlock.className = 'bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden';
            
            const dayHeader = document.createElement('div');
            const dayOfWeek = new Date(year, month, day).getDay();
            dayHeader.className = 'bg-gray-50 px-4 py-2 border-b border-gray-100 font-bold text-gray-700 flex items-center justify-between';
            dayHeader.innerHTML = `<span>${month + 1}月${day}日 (${DAYS_STR[dayOfWeek]})</span>`;
            dayBlock.appendChild(dayHeader);

            const eventList = document.createElement('div');
            eventList.className = 'divide-y divide-gray-100';

            events.forEach(evt => {
                const item = document.createElement('div');
                item.className = 'px-4 py-3 flex items-start hover:bg-gray-50 cursor-pointer transition';
                item.addEventListener('click', () => openEventModal(dateStr, evt));

                let typeIcon = '<i class="fas fa-calendar text-blue-500 mt-1 mr-3 w-4 text-center"></i>';
                if(evt.type === 'class') typeIcon = '<i class="fas fa-chalkboard text-green-500 mt-1 mr-3 w-4 text-center"></i>';
                if(evt.type === 'task') typeIcon = '<i class="fas fa-tasks text-purple-500 mt-1 mr-3 w-4 text-center"></i>';

                item.innerHTML = `
                    ${typeIcon}
                    <div class="flex-1">
                        <div class="font-bold text-gray-800">${evt.title}</div>
                        ${evt.desc ? `<div class="text-sm text-gray-500 mt-0.5 line-clamp-1">${evt.desc}</div>` : ''}
                    </div>
                `;
                eventList.appendChild(item);
            });
            
            dayBlock.appendChild(eventList);
            container.appendChild(dayBlock);
        }
    }

    if (!hasEvents) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-inbox text-4xl mb-3"></i><p>この月の予定はありません</p></div>';
    }
};

// 【週案簿ビュー】の描画 (簡略版)
const renderWeeklyPlanView = () => {
    const headers = document.getElementById('wp-day-headers');
    const body = document.getElementById('wp-schedule-body');
    const title = document.getElementById('wp-week-title');
    const patternName = document.getElementById('wp-current-pattern-name');
    if (!headers || !body || !title) return;

    headers.innerHTML = '';
    body.innerHTML = '';

    const current = new Date(appState.calendarDisplayDate);
    const startOfWeek = new Date(current.setDate(current.getDate() - current.getDay() + 1)); // 月曜始まり
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 4); // 金曜まで (5日間)

    title.textContent = `${startOfWeek.getMonth()+1}/${startOfWeek.getDate()} - ${endOfWeek.getMonth()+1}/${endOfWeek.getDate()} の週案`;

    const currentTt = getSafeTimetable();
    if (patternName) patternName.textContent = currentTt.name;

    // ヘッダー（月〜金）
    for (let i = 0; i < 5; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        
        const th = document.createElement('div');
        th.className = 'flex-1 min-w-[120px] bg-white border-r border-b border-gray-200 py-1.5 flex flex-col items-center justify-center sticky top-0 z-20 shadow-sm';
        th.innerHTML = `<span class="text-xs text-gray-500 font-bold">${DAYS_STR[i+1]}</span><span class="text-sm font-black text-gray-800">${d.getDate()}</span>`;
        headers.appendChild(th);
    }

    // コマごとの行（月〜金のみ）
    const periods = currentTt.periods || [];
    periods.forEach(period => {
        const row = document.createElement('div');
        row.className = 'flex gap-[1px]';

        // 左端の時限
        const periodHeader = document.createElement('div');
        periodHeader.className = 'w-20 bg-white border-r border-gray-200 flex flex-col items-center justify-center sticky left-0 z-10';
        periodHeader.innerHTML = `<span class="font-bold text-gray-700 text-sm">${period.name}</span>`;
        row.appendChild(periodHeader);

        // 各曜日のセル
        for (let i = 0; i < 5; i++) {
            const cellDate = new Date(startOfWeek);
            cellDate.setDate(cellDate.getDate() + i);
            const dateStr = formatDateStr(cellDate);

            const cell = document.createElement('div');
            cell.className = 'flex-1 min-w-[120px] bg-white border-r border-gray-100 min-h-[80px] p-1 relative group cursor-pointer hover:bg-gray-50';
            cell.addEventListener('click', () => openEventModal(dateStr, null, 'class', period.id));

            // 予定の表示
            const events = getEventsForDate(dateStr).filter(e => e.periodId === period.id);
            events.forEach(evt => {
                const evtEl = document.createElement('div');
                evtEl.className = 'text-xs p-1 rounded bg-blue-50 text-blue-800 border border-blue-200 truncate font-bold shadow-sm';
                evtEl.textContent = evt.title;
                evtEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEventModal(dateStr, evt);
                });
                cell.appendChild(evtEl);
            });

            row.appendChild(cell);
        }
        body.appendChild(row);
    });
};

// ==========================================
// モーダル（予定追加・編集）の制御
// ==========================================

const openEventModal = (dateStr, eventObj = null, defaultType = 'schedule', periodId = null) => {
    const modal = document.getElementById('event-modal');
    if (!modal) return;

    // 値のリセット
    document.getElementById('event-title').value = eventObj ? eventObj.title : '';
    document.getElementById('event-date').value = dateStr;
    document.getElementById('event-desc').value = eventObj ? (eventObj.desc || '') : '';
    
    // タイプタブの切り替え
    const targetType = eventObj ? eventObj.type : defaultType;
    document.querySelectorAll('.type-tab').forEach(t => {
        if(t.dataset.type === targetType) {
            t.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            t.classList.remove('text-gray-500');
        } else {
            t.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
            t.classList.add('text-gray-500');
        }
    });

    // 編集モードならIDを保持
    appState.editTarget = eventObj ? { dateStr, id: eventObj.id } : null;

    // 削除ボタンの表示制御
    const deleteBtn = document.getElementById('event-delete-btn');
    if (eventObj) {
        deleteBtn.classList.remove('hidden');
    } else {
        deleteBtn.classList.add('hidden');
    }

    // モーダル表示アニメーション
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('div').classList.remove('scale-95'); }, 10);
};

const setupModalListeners = () => {
    // 閉じるボタン
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('event-modal');
            modal.classList.add('opacity-0');
            modal.querySelector('div').classList.add('scale-95');
            setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
        });
    });

    // 保存ボタン
    const saveBtn = document.getElementById('event-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const title = document.getElementById('event-title').value.trim();
            const dateStr = document.getElementById('event-date').value;
            if (!title || !dateStr) return alert("タイトルと日付は必須です。");

            // アクティブなタイプを取得
            const activeTab = document.querySelector('.type-tab.bg-white');
            const type = activeTab ? activeTab.dataset.type : 'schedule';
            const desc = document.getElementById('event-desc').value;

            // データ構造の作成
            const newEvent = {
                id: appState.editTarget ? appState.editTarget.id : 'evt_' + Date.now(),
                title,
                type,
                desc,
                periodId: document.getElementById('event-period').value // 授業の場合など
            };

            // 保存処理
            if (!appState.allPlanners[dateStr]) {
                appState.allPlanners[dateStr] = [];
            }

            if (appState.editTarget) {
                // 更新
                const oldDate = appState.editTarget.dateStr;
                if (oldDate !== dateStr) {
                    appState.allPlanners[oldDate] = appState.allPlanners[oldDate].filter(e => e.id !== newEvent.id);
                }
                const existingIdx = appState.allPlanners[dateStr].findIndex(e => e.id === newEvent.id);
                if (existingIdx >= 0) appState.allPlanners[dateStr][existingIdx] = newEvent;
                else appState.allPlanners[dateStr].push(newEvent);
            } else {
                // 新規
                appState.allPlanners[dateStr].push(newEvent);
            }

            saveAndSync();
            document.querySelector('.modal-close').click();
        });
    }

    // 削除ボタン
    const deleteBtn = document.getElementById('event-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (!appState.editTarget) return;
            if (confirm("この予定を削除しますか？")) {
                const { dateStr, id } = appState.editTarget;
                appState.allPlanners[dateStr] = appState.allPlanners[dateStr].filter(e => e.id !== id);
                saveAndSync();
                document.querySelector('.modal-close').click();
            }
        });
    }
    
    // タブ切り替え
    document.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.type-tab').forEach(t => {
                t.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
                t.classList.add('text-gray-500');
            });
            e.target.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            e.target.classList.remove('text-gray-500');
            
            // 授業タブのときだけ時限セレクタを表示する制御などをここに追加
            if(e.target.dataset.type === 'class') {
                document.getElementById('period-inputs').classList.remove('hidden');
                document.getElementById('period-inputs').classList.add('flex');
                document.getElementById('time-inputs').classList.add('hidden');
            } else {
                document.getElementById('period-inputs').classList.add('hidden');
                document.getElementById('period-inputs').classList.remove('flex');
                document.getElementById('time-inputs').classList.remove('hidden');
            }
        });
    });
};

const setupWeeklyPlanListeners = () => {
    // 週案簿固有のイベントリスナーがあればここに記述
};

// データの保存と画面再描画、Firebaseへのアップロードを行う共通関数
const saveAndSync = () => {
    safeSetItem(LS_KEY, JSON.stringify({
        allPlanners: appState.allPlanners,
        allMemos: appState.allMemos,
        allFolders: appState.allFolders
    }));
    loadCalendar();
    uploadLocalData(); // Firebaseへ保存
};