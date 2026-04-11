import { state } from './state.js';
import { safeSetItem } from './utils.js';
import { saveToFirebase } from './firebase.js';

let tempSettings = null;

export const initSettingsView = () => {
    tempSettings = JSON.parse(JSON.stringify(state.globalSettings));
    tempSettings.activePatternIndex = 0;
    renderSettingsView();
};

export const syncTempSettingsFromDOM = () => {
    if (!tempSettings) return;
    Object.keys(tempSettings.timetables).forEach(key => {
        const tt = tempSettings.timetables[key];
        const nameInput = document.getElementById(`set-tt-${key}-name`);
        if (nameInput) tt.name = nameInput.value;
        
        tt.periods.forEach((p, idx) => {
            if (p.id === 'p_allday') return; 
            const nameEl = document.getElementById(`set-tt-${key}-${idx}-name`);
            const sEl = document.getElementById(`set-tt-${key}-${idx}-s`);
            const eEl = document.getElementById(`set-tt-${key}-${idx}-e`);
            if (nameEl) p.name = nameEl.value;
            if (sEl) p.s = sEl.value;
            if (eEl) p.e = eEl.value;
        });
    });

    if (tempSettings.baseTimetablePatterns) {
        const activeIdx = tempSettings.activePatternIndex || 0;
        const activePat = tempSettings.baseTimetablePatterns[activeIdx];
        if (activePat) {
            const nameEl = document.getElementById('settings-pattern-name');
            if (nameEl) activePat.name = nameEl.value;

            const sy = document.getElementById('settings-pattern-start-y').value;
            const sm = document.getElementById('settings-pattern-start-m').value;
            const sd = document.getElementById('settings-pattern-start-d').value;
            if (sy && sm && sd) activePat.startDate = `${sy}-${sm}-${sd}`;
            else activePat.startDate = "";

            const ey = document.getElementById('settings-pattern-end-y').value;
            const em = document.getElementById('settings-pattern-end-m').value;
            const ed = document.getElementById('settings-pattern-end-d').value;
            if (ey && em && ed) activePat.endDate = `${ey}-${em}-${ed}`;
            else activePat.endDate = "";

            delete activePat.startMonth;
            delete activePat.endMonth;

            const days = [1,2,3,4,5]; 
            const pNames = ["1限","2限","3限","4限","5限","6限"];
            days.forEach(d => {
                pNames.forEach(pn => {
                    const clsEl = document.getElementById(`base-tt-${d}-${pn}-cls`);
                    const subEl = document.getElementById(`base-tt-${d}-${pn}-sub`);
                    const memoEl = document.getElementById(`base-tt-${d}-${pn}-memo`);
                    if (clsEl && subEl && memoEl) {
                        if (!activePat.data[d]) activePat.data[d] = {};
                        if (clsEl.value || subEl.value || memoEl.value) {
                            activePat.data[d][pn] = { cls: clsEl.value, sub: subEl.value, memo: memoEl.value };
                        } else {
                            activePat.data[d][pn] = null;
                        }
                    }
                });
            });
        }
    }
};

export const renderSettingsView = () => {
    let html = '';
    Object.keys(tempSettings.timetables).forEach(key => {
        const tt = tempSettings.timetables[key];
        html += `<div class="border border-gray-200 rounded bg-gray-50 p-3 mb-3">
            <div class="flex justify-between items-center mb-2">
                <input type="text" id="set-tt-${key}-name" class="font-bold text-sm text-gray-700 bg-transparent border-b border-dashed border-gray-400 outline-none w-1/2 focus:border-[#4a5f73]" value="${tt.name}">
                <button onclick="window.addTtPeriod('${key}')" class="text-[10px] bg-white border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 shadow-sm transition flex items-center gap-1"><i class="fas fa-plus text-[#4a5f73]"></i> 行を追加</button>
            </div>
            <div class="space-y-1">
                <div class="flex text-[9px] font-bold text-gray-400 px-1 gap-1.5">
                    <div class="w-20">枠の名前</div><div class="flex-1">開始 - 終了時刻</div>
                </div>`;
        
        tt.periods.forEach((p, idx) => {
            if (p.id === 'p_allday') return;
            html += `
            <div class="flex items-center gap-1.5 bg-white p-1 border border-gray-200 rounded shadow-sm">
                <input type="text" id="set-tt-${key}-${idx}-name" value="${p.name || ''}" class="w-20 font-bold text-xs text-gray-700 outline-none border border-transparent focus:border-[#4a5f73] bg-gray-50 rounded px-1" placeholder="例: 1限">
                <input type="time" id="set-tt-${key}-${idx}-s" value="${p.s || ''}" class="w-20 text-xs outline-none bg-gray-50 border border-gray-200 rounded px-1 focus:border-[#4a5f73]">
                <span class="text-gray-400 text-[10px]">-</span>
                <input type="time" id="set-tt-${key}-${idx}-e" value="${p.e || ''}" class="w-20 text-xs outline-none bg-gray-50 border border-gray-200 rounded px-1 focus:border-[#4a5f73]">
                <button onclick="window.removeTtPeriod('${key}', ${idx})" class="ml-auto text-gray-300 hover:text-red-500 p-1 transition"><i class="fas fa-trash-alt text-[10px]"></i></button>
            </div>`;
        });
        html += `</div></div>`;
    });
    document.getElementById('settings-timetables-container').innerHTML = html;

    const activeIdx = tempSettings.activePatternIndex || 0;
    const activePat = tempSettings.baseTimetablePatterns[activeIdx];

    const generateDateSelects = (prefix, dateStr) => {
        let y = "", m = "", d = "";
        if (dateStr) {
            const parts = dateStr.split('-');
            y = parts[0]; m = parts[1]; d = parts[2];
        }
        
        let yOpts = '<option value="">--</option>';
        for(let i=2020; i<=2035; i++) yOpts += `<option value="${i}" ${y==i?'selected':''}>${i}</option>`;
        
        let mOpts = '<option value="">--</option>';
        for(let i=1; i<=12; i++) {
            let pad = String(i).padStart(2, '0');
            mOpts += `<option value="${pad}" ${m==pad?'selected':''}>${i}</option>`;
        }
        
        let dOpts = '<option value="">--</option>';
        for(let i=1; i<=31; i++) {
            let pad = String(i).padStart(2, '0');
            dOpts += `<option value="${pad}" ${d==pad?'selected':''}>${i}</option>`;
        }

        return `
            <select id="${prefix}-y" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${yOpts}</select><span class="text-[10px] text-gray-500 mx-0.5">年</span>
            <select id="${prefix}-m" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${mOpts}</select><span class="text-[10px] text-gray-500 mx-0.5">月</span>
            <select id="${prefix}-d" class="border border-gray-300 rounded px-1 py-0.5 text-xs outline-none focus:border-[#4a5f73] text-gray-700 bg-white">${dOpts}</select><span class="text-[10px] text-gray-500 ml-0.5">日</span>
        `;
    };

    let sDate = activePat.startDate;
    if (!sDate && activePat.startMonth) sDate = activePat.startMonth + "-01";
    let eDate = activePat.endDate;
    if (!eDate && activePat.endMonth) eDate = activePat.endMonth + "-31";

    const startSelects = generateDateSelects('settings-pattern-start', sDate);
    const endSelects = generateDateSelects('settings-pattern-end', eDate);

    let baseHtml = `
    <div class="flex items-center gap-2 mb-2">
        <select id="settings-pattern-select" class="border border-gray-300 rounded px-1.5 py-1 text-xs outline-none focus:border-[#4a5f73] font-bold text-gray-700 bg-white" onchange="window.changeSettingsPattern(this.value)">
            ${tempSettings.baseTimetablePatterns.map((p, i) => `<option value="${i}" ${i === activeIdx ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
        <button onclick="window.addSettingsPattern()" class="text-[10px] bg-white border border-gray-300 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 transition shadow-sm flex items-center gap-1"><i class="fas fa-plus"></i> 追加</button>
        ${tempSettings.baseTimetablePatterns.length > 1 ? `<button onclick="window.removeSettingsPattern()" class="text-[10px] bg-white border border-gray-300 text-red-500 px-2 py-1 rounded hover:bg-red-50 transition shadow-sm flex items-center gap-1"><i class="fas fa-trash-alt"></i> 削除</button>` : ''}
    </div>

    <div class="flex flex-col gap-2 mb-3 bg-gray-50 p-2 rounded border border-gray-200">
        <div class="flex flex-col sm:flex-row gap-3">
            <div>
                <label class="block text-[9px] font-bold text-gray-500 mb-0.5">パターン名</label>
                <input type="text" id="settings-pattern-name" value="${activePat.name}" onchange="window.updatePatternName(this.value)" class="border border-gray-300 rounded px-1.5 py-1 text-xs outline-none w-40 focus:border-[#4a5f73] font-bold text-gray-800">
            </div>
            <div>
                <label class="block text-[9px] font-bold text-gray-500 mb-0.5">適用期間</label>
                <div class="flex flex-wrap items-center gap-1">
                    <div class="flex items-center">${startSelects}</div>
                    <span class="text-gray-400 font-bold mx-0.5 text-[10px]">〜</span>
                    <div class="flex items-center">${endSelects}</div>
                </div>
            </div>
        </div>
    </div>
    `;

    const days = [{d:1,n:"月"},{d:2,n:"火"},{d:3,n:"水"},{d:4,n:"木"},{d:5,n:"金"}];
    const pNames = ["1限","2限","3限","4限","5限","6限"]; 

    baseHtml += `<div class="overflow-x-auto"><table class="w-full text-xs text-left border-collapse min-w-[400px]">
        <thead><tr class="bg-gray-100 text-gray-500"><th class="border border-gray-200 p-1 w-10 text-center">時限</th>
            ${days.map(day => `<th class="border border-gray-200 p-1 text-center w-[18%]">${day.n}</th>`).join('')}
        </tr></thead><tbody>`;

    pNames.forEach(pn => {
        baseHtml += `<tr><td class="border border-gray-200 p-1 text-center font-bold text-gray-600 bg-gray-50 text-[10px]">${pn}</td>`;
        days.forEach(day => {
            const val = activePat.data[day.d] && activePat.data[day.d][pn] ? activePat.data[day.d][pn] : {};
            const clsVal = typeof val === 'string' ? val.split(' ')[0] || '' : val.cls || '';
            const subVal = typeof val === 'string' ? val.split(' ').slice(1).join(' ') || '' : val.sub || '';
            const memoVal = typeof val === 'string' ? '' : val.memo || '';
            
            baseHtml += `<td class="border border-gray-200 p-0.5 bg-white align-top">
                <div class="flex flex-col gap-0.5">
                    <input type="text" id="base-tt-${day.d}-${pn}-cls" value="${clsVal}" list="class-list" placeholder="ｸﾗｽ" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                    <input type="text" id="base-tt-${day.d}-${pn}-sub" value="${subVal}" list="sub-list" placeholder="教科・内容" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                    <input type="text" id="base-tt-${day.d}-${pn}-memo" value="${memoVal}" placeholder="予定/ﾒﾓ" class="w-full outline-none p-0.5 text-[9px] sm:text-[10px] bg-gray-50 focus:bg-blue-50 border border-gray-200 rounded">
                </div>
            </td>`;
        });
        baseHtml += `</tr>`;
    });
    baseHtml += `</tbody></table></div>`;
    document.getElementById('settings-basetimetable-container').innerHTML = baseHtml;
};

export const changeSettingsPattern = (idxStr) => {
    syncTempSettingsFromDOM();
    tempSettings.activePatternIndex = parseInt(idxStr);
    renderSettingsView();
};

export const updatePatternName = (val) => {
    const activeIdx = tempSettings.activePatternIndex || 0;
    if (tempSettings.baseTimetablePatterns[activeIdx]) {
        tempSettings.baseTimetablePatterns[activeIdx].name = val;
        const select = document.getElementById('settings-pattern-select');
        if (select && select.options[activeIdx]) {
            select.options[activeIdx].text = val;
        }
    }
};

export const addSettingsPattern = () => {
    syncTempSettingsFromDOM();
    const newIdx = tempSettings.baseTimetablePatterns.length;
    tempSettings.baseTimetablePatterns.push({
        id: 'p_' + Date.now(),
        name: '新しいパターン',
        startDate: '',
        endDate: '',
        data: {1:{},2:{},3:{},4:{},5:{}}
    });
    tempSettings.activePatternIndex = newIdx;
    renderSettingsView();
};

export const removeSettingsPattern = () => {
    if (tempSettings.baseTimetablePatterns.length <= 1) {
        alert("パターンは最低1つ必要です。");
        return;
    }
    if (confirm("現在表示しているパターンを削除しますか？")) {
        const activeIdx = tempSettings.activePatternIndex || 0;
        tempSettings.baseTimetablePatterns.splice(activeIdx, 1);
        tempSettings.activePatternIndex = 0;
        renderSettingsView();
    }
};

export const addTtPeriod = (key) => {
    syncTempSettingsFromDOM();
    const tt = tempSettings.timetables[key];
    const pId = 'p_' + Date.now();
    const nextNum = tt.periods.filter(p=>p.id!=='p_allday'&&!p.isAllDay).length + 1;
    tt.periods.push({ id: pId, name: `${nextNum}限`, s: "", e: "" });
    renderSettingsView();
};

export const removeTtPeriod = (key, idx) => {
    if (confirm("この行を削除しますか？")) {
        syncTempSettingsFromDOM();
        tempSettings.timetables[key].periods.splice(idx, 1);
        renderSettingsView();
    }
};

export const saveSettings = () => {
    syncTempSettingsFromDOM();
    state.globalSettings = JSON.parse(JSON.stringify(tempSettings));
    safeSetItem('teacher_planner_settings', JSON.stringify(state.globalSettings));
    saveToFirebase();
    if (typeof window.updateDisplayMode === 'function') window.updateDisplayMode();
    if (typeof window.renderCurrentView === 'function') window.renderCurrentView();
    alert("設定を保存しました。");
};