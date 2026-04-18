import { appState, safeSetItem, LS_KEY, DAYS_STR } from './state.js';
import { saveToFirebase } from './firebase.js';

// ==========================================
// ヘルパー関数（日付・色・計算）
// ==========================================
export const getFormatDateStr = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const isHoliday = (d) => d.getDay() === 0 || d.getDay() === 6;

export const getEventColorClass = (category) => {
    if (category === 'work') return "bg-red-100 text-red-800 border-red-300";
    if (category === 'club') return "bg-blue-100 text-blue-800 border-blue-300";
    if (category === 'private') return "bg-orange-100 text-orange-800 border-orange-300";
    return "bg-gray-100 text-gray-800 border-gray-300";
};

export const getMultiDayColorClass = (category) => {
    if (category === 'work') return "border-red-400 text-red-800";
    if (category === 'club') return "border-blue-400 text-blue-800";
    if (category === 'private') return "border-orange-400 text-orange-800";
    return "border-gray-400 text-gray-800";
};

export const getClassColorClass = (cls, sub) => {
    const subStr = String(sub || "").trim();
    if (['学活', '総合', '道徳'].includes(subStr)) return "bg-yellow-50 text-yellow-800 border-yellow-200 hover:bg-yellow-100";
    const clsStr = String(cls || "").trim();
    if (clsStr.startsWith('1') || clsStr.includes('1年')) return "bg-red-50 text-red-800 border-red-200 hover:bg-red-100";
    else if (clsStr.startsWith('2') || clsStr.includes('2年')) return "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100";
    else if (clsStr.startsWith('3') || clsStr.includes('3年')) return "bg-green-50 text-green-800 border-green-200 hover:bg-green-100";
    return "bg-gray-50 text-gray-800 border-gray-300 hover:bg-gray-100";
};

export const timeToPct = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    if (h < 5) return 0;
    if (h >= 24) return 100;
    const totalMinutes = 19 * 60;
    const minutes = (h - 5) * 60 + m;
    return (minutes / totalMinutes) * 100;
};

export const packTimeEvents = (events) => {
    if (!events || events.length === 0) return;
    events.forEach(ev => {
        ev.startPos = timeToPct(ev.drawStart);
        let endPos = timeToPct(ev.drawEnd);
        if (endPos <= ev.startPos) endPos = ev.startPos + (15 / (19 * 60)) * 100;
        ev.endPos = endPos;
    });
    events.sort((a, b) => a.startPos - b.startPos || b.endPos - a.endPos);

    let columns = [];
    let lastEventEnding = null;
    events.forEach(ev => {
        if (lastEventEnding !== null && ev.startPos >= lastEventEnding) {
            packGroup(columns); columns = []; lastEventEnding = null;
        }
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
            let col = columns[c];
            if (col[col.length - 1].endPos <= ev.startPos) { col.push(ev); placed = true; break; }
        }
        if (!placed) columns.push([ev]);
        if (lastEventEnding === null || ev.endPos > lastEventEnding) lastEventEnding = ev.endPos;
    });
    if (columns.length > 0) packGroup(columns);

    function packGroup(cols) {
        let numCols = cols.length;
        cols.forEach((col, colIdx) => { col.forEach(e => { e.colIndex = colIdx; e.numCols = numCols; }); });
    }
};

export const getTtType = (dStr) => {
    const data = appState.allPlanners[dStr] || {};
    if (data.timetableType !== undefined) return data.timetableType;
    if (data.classes && Object.keys(data.classes).length > 0) return 'normal';
    return 'normal';
};

export const getBaseTimetableForDate = (dObj) => {
    if (!appState.globalSettings.baseTimetablePatterns || appState.globalSettings.baseTimetablePatterns.length === 0) return {1:{},2:{},3:{},4:{},5:{}};
    const yyyyMmDd = getFormatDateStr(dObj);
    const matchedPattern = appState.globalSettings.baseTimetablePatterns.find(p => {
        let sDate = p.startDate; if (!sDate && p.startMonth) sDate = p.startMonth + "-01";
        let eDate = p.endDate; if (!eDate && p.endMonth) eDate = p.endMonth + "-31";
        const afterStart = sDate ? yyyyMmDd >= sDate : true;
        const beforeEnd = eDate ? yyyyMmDd <= eDate : true;
        return afterStart && beforeEnd;
    });
    if (matchedPattern && matchedPattern.data) return matchedPattern.data;
    return {1:{},2:{},3:{},4:{},5:{}};
};

export const getPeriodClass = (dateStr, period, dObj) => {
    const data = appState.allPlanners[dateStr] || {};
    let cls = "", sub = "", memo = "", isBase = false;
    let sourceDay = dObj.getDay(), sourcePeriod = 1;
    
    const ttType = getTtType(dateStr);
    const ttPeriods = ttType !== 'none' && appState.globalSettings.timetables[ttType] ? appState.globalSettings.timetables[ttType].periods.filter(p => p.id !== 'p_allday' && !p.isAllDay) : [];
    const pIdx = ttPeriods.findIndex(p => p.id === period.id);
    if (pIdx !== -1) sourcePeriod = pIdx + 1;
    else sourcePeriod = parseInt(period.name.replace(/[^0-9]/g, '')) || 1;
    
    const baseTt = getBaseTimetableForDate(dObj);

    if (data.classes && data.classes[period.id]) {
        const cData = data.classes[period.id];
        if (cData.disabled) return null; 
        cls = cData.cls || ""; sub = cData.sub || ""; memo = cData.memo || "";
        if (cData.sourceDay !== undefined) { sourceDay = cData.sourceDay; sourcePeriod = cData.sourcePeriod; }
    } else {
        let bData = null;
        if (baseTt[dObj.getDay()] && baseTt[dObj.getDay()][period.name]) {
            bData = baseTt[dObj.getDay()][period.name];
        } else {
            const fallbackName = `${sourcePeriod}限`;
            if (baseTt[dObj.getDay()] && baseTt[dObj.getDay()][fallbackName]) {
                bData = baseTt[dObj.getDay()][fallbackName];
            }
        }
        if (bData) {
            cls = bData.cls || ""; sub = bData.sub || ""; memo = bData.memo || ""; isBase = true;
        }
    }
    if (!cls && !sub && !memo) return null;
    return { cls, sub, memo, isBase, sourceDay, sourcePeriod };
};


// ==========================================
// ボトムシート（月カレンダーセルクリック時）
// ==========================================
export const openMonthBottomSheet = (dStr, defaultHour = null) => {
    window.mbsTargetDate = dStr;
    window.mbsDefaultHour = defaultHour;
    const dObj = new Date(dStr);
    document.getElementById('mbs-date-title').textContent = `${dObj.getMonth()+1}月${dObj.getDate()}日 (${DAYS_STR[dObj.getDay()]})`;

    const data = appState.allPlanners[dStr] || {};
    const isHoli = isHoliday(dObj);
    const ttType = getTtType(dStr);
    const ttPeriods = ttType !== 'none' ? appState.globalSettings.timetables[ttType].periods : [];

    let schedHtml = '', taskHtml = '';
    
    if (!isHoli && ttType !== 'none') {
        const lessonCount = data.lessonCount !== undefined ? data.lessonCount : ttPeriods.length;
        const displayPeriods = ttPeriods.slice(0, lessonCount);

        displayPeriods.forEach(p => {
            if(p.id === 'p_allday' || p.isAllDay) return;
            const cData = getPeriodClass(dStr, p, dObj);
            if (cData) { 
                const colorClass = getClassColorClass(cData.cls, cData.sub);
                let titleHtml = cData.cls || cData.sub ? `${cData.cls} ${cData.sub}` : (cData.memo ? cData.memo : `(${DAYS_STR[cData.sourceDay]}${cData.sourcePeriod})`);
                let memoHtml = (cData.memo && (cData.cls || cData.sub)) ? `<div class="opacity-80 text-[10px] mt-1.5 whitespace-pre-wrap break-words border-t border-gray-200/50 pt-1.5 w-full">${cData.memo}</div>` : '';
                schedHtml += `<div class="text-xs px-2.5 py-2 rounded border flex flex-col cursor-pointer transition bg-white shadow-sm hover:shadow-md ${colorClass}" onclick="event.stopPropagation(); window.openWeeklyPlanModal('${dStr}', '${p.id}', '${p.name}')">
                    <div class="flex items-start gap-2 w-full">
                        <span class="font-bold w-auto min-w-[2.5rem] whitespace-nowrap shrink-0 opacity-80 mt-0.5">${p.name}</span>
                        <span class="break-words font-bold flex-1">${titleHtml}</span>
                    </div>
                    ${memoHtml}
                </div>`; 
            }
        });
    }
    
    let eventsForDay = [];
    for (const dateKey in appState.allPlanners) {
        const events = appState.allPlanners[dateKey].events || [];
        events.forEach(ev => {
            const sDate = ev.start ? ev.start.split('T')[0] : dateKey;
            const eDate = ev.end ? ev.end.split('T')[0] : sDate;
            if (dStr >= sDate && dStr <= eDate) eventsForDay.push({ ...ev, originalDateKey: dateKey });
        });
    }

    const uniqueEvents = []; const seenIds = new Set();
    eventsForDay.forEach(ev => { if (!seenIds.has(ev.id)) { seenIds.add(ev.id); uniqueEvents.push(ev); } });

    uniqueEvents.forEach(ev => {
        let label = "", isMultiDay = false;
        if (ev.start && ev.end && ev.start.split('T')[0] !== ev.end.split('T')[0]) {
            const sD = new Date(ev.start.split('T')[0]); const eD = new Date(ev.end.split('T')[0]);
            label = `${sD.getMonth()+1}/${sD.getDate()}〜${eD.getMonth()+1}/${eD.getDate()}`; isMultiDay = true;
        } else { label = ev.isAllDay ? "終日" : (ev.start ? ev.start.split('T').pop().substring(0, 5) : ""); }

        let badgeClass = isMultiDay ? `bg-transparent border-0 border-b-2 ${getMultiDayColorClass(ev.category)} hover:bg-gray-50` : `${getEventColorClass(ev.category)} border shadow-sm hover:brightness-95`;
        const memoPreview = ev.memo ? `<div class="text-[10px] opacity-80 mt-1.5 whitespace-pre-wrap break-words border-t border-black/10 pt-1.5 w-full">${ev.memo}</div>` : '';

        schedHtml += `
            <div class="text-xs ${badgeClass} px-2.5 py-2 rounded flex flex-col cursor-pointer transition hover:shadow-md" onclick="event.stopPropagation(); window.openEditMenu('${ev.originalDateKey || dStr}', 'schedule', '${ev.id}')">
                <div class="flex items-start gap-2 w-full">
                    <span class="font-bold w-auto min-w-[2.5rem] whitespace-nowrap shrink-0 opacity-70 mt-0.5">${label}</span>
                    <span class="break-words font-bold flex-1">${ev.title}</span>
                </div>
                ${memoPreview}
            </div>`; 
    });

    if (data.reminders) {
        data.reminders.forEach(t => { 
            const icon = t.completed ? '<i class="fas fa-check-circle text-blue-500"></i>' : '<i class="far fa-square text-gray-300"></i>'; 
            const style = t.completed ? 'text-gray-400 line-through opacity-70' : 'text-[#4a5f73]'; 
            const memoHtml = t.memo ? `<div class="text-[10px] opacity-80 mt-1.5 whitespace-pre-wrap break-words border-t border-gray-200 pt-1.5 w-full ml-5">${t.memo}</div>` : '';
            taskHtml += `<div class="text-xs flex flex-col px-2.5 py-2 ${style} cursor-pointer bg-white shadow-sm hover:shadow-md hover:bg-gray-50 border border-gray-200 rounded transition font-bold" onclick="event.stopPropagation(); window.openEditMenu('${dStr}', 'task', '${t.id}')">
                <div class="flex items-start gap-2 w-full">
                    <div class="shrink-0 cursor-pointer flex items-center justify-center mt-0.5 text-sm" onclick="event.stopPropagation(); window.toggleTaskGlobal('${dStr}', '${t.id}', ${!t.completed})">${icon}</div>
                    <span class="break-words flex-1 mt-0.5">${t.title}</span>
                </div>
                ${memoHtml}
            </div>`; 
        });
    }

    let html = '';
    if (schedHtml) html += `<div class="text-[10px] font-bold text-gray-400 mb-1.5 flex items-center gap-1 border-b border-gray-200 pb-1"><i class="far fa-calendar-alt"></i> 予定・授業</div><div class="space-y-2 mb-4">${schedHtml}</div>`;
    if (taskHtml) html += `<div class="text-[10px] font-bold text-gray-400 mb-1.5 flex items-center gap-1 border-b border-gray-200 pb-1"><i class="fas fa-check-square"></i> タスク</div><div class="space-y-2">${taskHtml}</div>`;
    if (!html) html = '<div class="text-center py-4 text-gray-400 text-xs font-bold">予定・タスクはありません</div>';
    
    document.getElementById('mbs-content').innerHTML = html;
    document.getElementById('mbs-add-btn').onclick = () => { 
        let defaultTime = null;
        let isAllDay = true;
        if (window.mbsDefaultHour !== null && window.mbsDefaultHour !== 'allday') {
            defaultTime = `${String(window.mbsDefaultHour).padStart(2, '0')}:00`;
            isAllDay = false;
        }
        window.openAddMenu(window.mbsTargetDate, defaultTime, isAllDay); 
        closeMonthBottomSheet(); 
    };
    document.getElementById('month-bottom-sheet').classList.remove('translate-y-full');
};

export const closeMonthBottomSheet = () => { 
    const sheet = document.getElementById('month-bottom-sheet'); 
    if (sheet) sheet.classList.add('translate-y-full'); 
};


// ==========================================
// 月カレンダー（Month View）
// ==========================================
export const changeMonthView = (offset) => { 
    appState.calendarDisplayDate.setMonth(appState.calendarDisplayDate.getMonth() + offset); 
    renderMonthView(); 
};

export const renderMonthView = () => {
    const year = appState.calendarDisplayDate.getFullYear();
    const month = appState.calendarDisplayDate.getMonth();
    document.getElementById('month-view-title').textContent = `${year}年 ${month + 1}月`;
    
    const startDay = new Date(year, month, 1).getDay(); const startOffset = startDay === 0 ? 6 : startDay - 1; 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('month-view-grid');
    
    // その月に必要な週数（行数）を計算（月によって4〜6週になる）
    const totalWeeks = Math.ceil((daysInMonth + startOffset) / 7);
    const totalCells = totalWeeks * 7;
    grid.style.gridTemplateRows = `repeat(${totalWeeks}, minmax(0, 1fr))`;
    
    const searchWord = document.getElementById('month-search-input').value.toLowerCase();
    const filterCat = document.getElementById('month-category-filter').value;
    const maxRows = document.body.classList.contains('mode-mobile') ? 5 : 7; const rowHeight = 15;

    const cellDates = []; let dayCountForCalc = 1, nextDayCountForCalc = 1;
    for (let i = 0; i < totalCells; i++) {
        let dObj;
        if (i < startOffset) { dObj = new Date(year, month, -(startOffset - i - 1)); } 
        else if (dayCountForCalc <= daysInMonth) { dObj = new Date(year, month, dayCountForCalc++); }
        else { dObj = new Date(year, month + 1, nextDayCountForCalc++); }
        cellDates.push({ dateStr: getFormatDateStr(dObj), dateObj: dObj });
    }
    const viewStartDateStr = cellDates[0].dateStr; const viewEndDateStr = cellDates[totalCells - 1].dateStr;

    let multiDayEvents = []; let singleDayAllDayEvents = {};  let singleDayTimeEvents = {};   
    for (const dateKey in appState.allPlanners) {
        const events = appState.allPlanners[dateKey].events || [];
        events.forEach(ev => {
            const sDate = ev.start ? ev.start.split('T')[0] : dateKey; const eDate = ev.end ? ev.end.split('T')[0] : sDate;
            if (sDate !== eDate) multiDayEvents.push({ ...ev, sDate, eDate, originalDateKey: dateKey });
            else {
                if (ev.isAllDay) { if (!singleDayAllDayEvents[sDate]) singleDayAllDayEvents[sDate] = []; singleDayAllDayEvents[sDate].push({ ...ev, originalDateKey: dateKey }); } 
                else { if (!singleDayTimeEvents[sDate]) singleDayTimeEvents[sDate] = []; singleDayTimeEvents[sDate].push({ ...ev, originalDateKey: dateKey }); }
            }
        });
    }

    const allDaySlots = Array(totalCells).fill(null).map(() => []); const overflowCounts = Array(totalCells).fill(0);

    multiDayEvents.sort((a, b) => {
        const lenA = new Date(a.eDate) - new Date(a.sDate); const lenB = new Date(b.eDate) - new Date(b.sDate);
        if (lenA !== lenB) return lenB - lenA; return a.sDate.localeCompare(b.sDate); 
    });

    multiDayEvents.forEach(ev => {
        let sIdx = -1, eIdx = -1;
        for (let i = 0; i < totalCells; i++) { if (cellDates[i].dateStr === ev.sDate) sIdx = i; if (cellDates[i].dateStr === ev.eDate) eIdx = i; }
        if (sIdx === -1 && ev.sDate < viewStartDateStr) sIdx = 0; if (eIdx === -1 && ev.eDate > viewEndDateStr) eIdx = totalCells - 1;
        
        if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
            let row = 0;
            while (true) {
                let isFree = true;
                for (let i = sIdx; i <= eIdx; i++) { if (allDaySlots[i][row] !== undefined) { isFree = false; break; } }
                if (isFree) break; row++;
            }
            for (let i = sIdx; i <= eIdx; i++) {
                const weekStart = Math.floor(i / 7) * 7; const weekEnd = weekStart + 6;
                const evWeekStart = Math.max(sIdx, weekStart); const evWeekEnd = Math.min(eIdx, weekEnd);
                allDaySlots[i][row] = { type: 'multi', event: ev, isSegmentStart: i === evWeekStart, segmentLength: evWeekEnd - evWeekStart + 1 };
            }
        }
    });

    for (let i = 0; i < totalCells; i++) {
        const dStr = cellDates[i].dateStr; const dObj = cellDates[i].dateObj; const data = appState.allPlanners[dStr] || {};
        let dayItems = [];
        (singleDayAllDayEvents[dStr] || []).forEach(ev => dayItems.push({ type: 'allday', event: ev }));
        (singleDayTimeEvents[dStr] || []).forEach(ev => dayItems.push({ type: 'time', event: ev }));

        if (!isHoliday(dObj) && (filterCat === 'all' || filterCat === 'jugyo')) {
            const ttType = getTtType(dStr); const ttPeriods = ttType !== 'none' ? appState.globalSettings.timetables[ttType].periods : [];
            const lessonCount = data.lessonCount !== undefined ? data.lessonCount : ttPeriods.length;
            ttPeriods.slice(0, lessonCount).forEach(p => {
                if (p.id === 'p_allday' || p.isAllDay) return;
                const cData = getPeriodClass(dStr, p, dObj); if (cData) dayItems.push({ type: 'class', event: cData, period: p });
            });
        }
        (data.reminders || []).forEach(t => dayItems.push({ type: 'task', event: t }));

        dayItems.forEach(item => { let row = 0; while(allDaySlots[i][row] !== undefined) row++; allDaySlots[i][row] = item; });
    }

    let html = '';
    for (let i = 0; i < totalCells; i++) {
        const dObj = cellDates[i].dateObj; const dStr = cellDates[i].dateStr;
        const isCurrentMonth = dObj.getMonth() === month; const isToday = dStr === getFormatDateStr(new Date());
        const cellId = `month-cell-${dStr}`; const isSelectedClass = appState.selectedCellId === cellId ? 'cell-selected' : '';
        const dateNumClass = isToday ? 'bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-sm' : (isCurrentMonth ? 'text-gray-800' : 'text-gray-400');
        const cellBgClass = (dObj.getDay() === 0 || dObj.getDay() === 6) ? 'bg-indigo-50/50' : 'bg-white';
        
        let cellContentHtml = ''; let overCount = 0;

        for (let r = 0; r < allDaySlots[i].length; r++) {
            const slot = allDaySlots[i][r]; if (!slot) continue;
            const ev = slot.event; let shouldSkip = false;

            if (slot.type === 'class') {
                if (filterCat === 'work_club' || filterCat === 'private') shouldSkip = true;
            } else {
                const cat = ev.category || 'work'; 
                if (filterCat === 'work_club' && cat !== 'work' && cat !== 'club') shouldSkip = true;
                if (filterCat === 'private' && cat !== 'private') shouldSkip = true;
                if (filterCat === 'jugyo') shouldSkip = true;
                if (searchWord && !ev.title.toLowerCase().includes(searchWord) && !(ev.memo && ev.memo.toLowerCase().includes(searchWord))) shouldSkip = true;
            }

            if (shouldSkip) continue;

            if (r >= maxRows) { overCount++; continue; }
            const topPx = r * rowHeight; const isSearched = (ev && appState.searchedItemId === ev.id) ? 'ring-2 ring-blue-500 shadow-md transform scale-105 z-20 relative' : '';

            if (slot.type === 'multi') {
                if (slot.isSegmentStart) {
                    let multiColorClass = getMultiDayColorClass(ev.category); const days = slot.segmentLength;
                    cellContentHtml += `<div class="absolute left-[2px] flex items-center bg-transparent border-b-2 ${multiColorClass} ${isSearched} z-20 transition cursor-pointer hover:brightness-95" style="top: ${topPx}px; height: 14px; width: calc(${days * 100}% - 4px);" onclick="event.stopPropagation(); window.openEditMenu('${ev.originalDateKey}', 'schedule', '${ev.id}')"><span class="font-bold text-[9px] w-full text-center truncate px-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">${ev.title}</span></div>`;
                }
            } else if (slot.type === 'allday') {
                let bgColorClass = getEventColorClass(ev.category);
                cellContentHtml += `<div class="absolute left-[2px] right-[2px] rounded-sm flex items-center shadow-sm cursor-pointer border ${bgColorClass} ${isSearched} transition hover:brightness-95" style="top: ${topPx}px; height: 14px;" onclick="event.stopPropagation(); window.openEditMenu('${ev.originalDateKey}', 'schedule', '${ev.id}')"><span class="font-bold truncate text-[9px] px-1">${ev.title}</span></div>`;
            } else if (slot.type === 'time') {
                let label = ev.start ? ev.start.split('T').pop().substring(0,5) : "";
                let dotColor = ev.category === 'work' ? "bg-red-400" : (ev.category === 'club' ? "bg-blue-400" : (ev.category === 'private' ? "bg-orange-400" : "bg-gray-400"));
                cellContentHtml += `<div class="absolute left-[2px] right-[2px] px-0.5 flex items-center bg-transparent cursor-pointer hover:bg-gray-100 rounded ${isSearched} transition" style="top: ${topPx}px; height: 14px;" onclick="event.stopPropagation(); window.openEditMenu('${ev.originalDateKey}', 'schedule', '${ev.id}')"><div class="w-1 h-1 rounded-full ${dotColor} shrink-0 mr-0.5"></div><span class="font-bold text-gray-500 shrink-0 mr-0.5 text-[8px]">${label}</span><span class="font-bold text-gray-800 truncate text-[9px]">${ev.title}</span></div>`;
            } else if (slot.type === 'class') {
                const p = slot.period; const cData = slot.event; const colorClass = getClassColorClass(cData.cls, cData.sub); 
                let titleHtml = cData.cls || cData.sub ? `${cData.cls} ${cData.sub}` : (cData.memo ? cData.memo : `(${DAYS_STR[cData.sourceDay]}${cData.sourcePeriod})`);
                cellContentHtml += `<div class="absolute left-[2px] right-[2px] rounded-sm px-0.5 flex items-center cursor-pointer border ${colorClass} transition hover:brightness-95" style="top: ${topPx}px; height: 14px;" onclick="event.stopPropagation(); window.openWeeklyPlanModal('${dStr}', '${p.id}', '${p.name}')"><span class="font-bold opacity-70 shrink-0 mr-0.5 text-[8px]">${p.name}</span><span class="font-bold truncate text-[9px]">${titleHtml}</span></div>`;
            } else if (slot.type === 'task') {
                const icon = ev.completed ? '<i class="fas fa-check-circle text-blue-500"></i>' : '<i class="far fa-square text-gray-300"></i>'; 
                const style = ev.completed ? 'text-gray-400 line-through opacity-70' : 'text-[#4a5f73]'; 
                cellContentHtml += `<div class="absolute left-[2px] right-[2px] px-0.5 flex items-center bg-transparent border border-gray-200 rounded cursor-pointer bg-white hover:bg-gray-100 shadow-sm ${style} ${isSearched} transition" style="top: ${topPx}px; height: 14px;" onclick="event.stopPropagation(); window.openEditMenu('${dStr}', 'task', '${ev.id}')"><div class="shrink-0 mr-0.5 text-[8px] flex items-center" onclick="event.stopPropagation(); window.toggleTaskGlobal('${dStr}', '${ev.id}', ${!ev.completed})">${icon}</div><span class="font-bold truncate text-[9px]">${ev.title}</span></div>`;
            }
        }
        let overflowHtml = overCount > 0 ? `<div class="absolute bottom-0 right-0.5 z-30 text-[9px] sm:text-[10px] font-bold text-[#4a5f73] bg-gray-100/90 px-1 py-0.5 rounded shadow-sm border border-gray-200 pointer-events-none">+${overCount}</div>` : '';
        
        html += `
            <div id="${cellId}" class="calendar-cell ${cellBgClass} relative min-h-0 h-full ${isSelectedClass}" onclick="event.stopPropagation(); window.handleMonthCellClick('${dStr}')">
                <div class="absolute top-0.5 right-0.5 z-30 pointer-events-none text-right text-[10px] font-bold flex justify-end shrink-0"><span class="date-link ${dateNumClass}">${dObj.getDate()}</span></div>
                <div class="absolute left-0 right-0 z-20 pointer-events-none" style="top: 18px; bottom: 0;">${cellContentHtml}</div>
                ${overflowHtml}
            </div>`;
    }
    grid.innerHTML = html;
};


// ==========================================
// 週カレンダー（Week View）
// ==========================================
export const changeWeekView = (offset) => { 
    appState.calendarDisplayDate.setDate(appState.calendarDisplayDate.getDate() + (offset * 7)); 
    renderWeekView(); 
};

export const renderWeekView = () => {
    const d = new Date(appState.calendarDisplayDate);
    const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));
    document.getElementById('week-view-title').textContent = `${startOfWeek.getFullYear()}年 ${startOfWeek.getMonth()+1}月`;

    let timeLabelsHtml = '';
    for(let i = 5; i <= 23; i++) {
        const topPct = ((i - 5) / 19) * 100;
        timeLabelsHtml += `<div class="absolute w-full text-right pr-2 text-[9px] text-gray-500 -mt-1.5" style="top: ${topPct}%;">${i}:00</div>`;
    }
    document.getElementById('week-time-labels').innerHTML = timeLabelsHtml;

    const weekDates = []; const weekDateObjs = [];
    for (let i = 0; i < 7; i++) {
        const cur = new Date(startOfWeek); cur.setDate(startOfWeek.getDate() + i); 
        weekDates.push(getFormatDateStr(cur)); weekDateObjs.push(cur);
    }
    const viewStartDateStr = weekDates[0]; const viewEndDateStr = weekDates[6];

    let multiDayEvents = []; let singleDayAllDayEvents = {};  let timeEventsByDay = Array(7).fill(null).map(() => []);

    for (const dateKey in appState.allPlanners) {
        const events = appState.allPlanners[dateKey].events || [];
        events.forEach(ev => {
            const sDate = ev.start ? ev.start.split('T')[0] : dateKey; const eDate = ev.end ? ev.end.split('T')[0] : sDate;
            if (eDate >= viewStartDateStr && sDate <= viewEndDateStr) {
                if (ev.isAllDay) {
                    if (sDate !== eDate) multiDayEvents.push({ ...ev, sDate, eDate, originalDateKey: dateKey });
                    else { if (!singleDayAllDayEvents[sDate]) singleDayAllDayEvents[sDate] = []; singleDayAllDayEvents[sDate].push({ ...ev, originalDateKey: dateKey }); }
                } else {
                    if (sDate !== eDate) {
                        for (let i = 0; i < 7; i++) {
                            const curDateStr = weekDates[i];
                            if (curDateStr >= sDate && curDateStr <= eDate) {
                                let drawStart = (curDateStr === sDate) ? ev.start.split('T')[1] : "05:00"; 
                                let drawEnd = (curDateStr === eDate) ? ev.end.split('T')[1] : "23:00";   
                                timeEventsByDay[i].push({ ...ev, drawStart, drawEnd, originalDateKey: dateKey });
                            }
                        }
                    } else {
                        const dayIdx = weekDates.indexOf(sDate);
                        if (dayIdx !== -1) {
                            let drawStart = ev.start ? ev.start.split('T')[1] : "09:00"; 
                            let drawEnd = ev.end ? ev.end.split('T')[1] : "10:00";
                            timeEventsByDay[dayIdx].push({ ...ev, drawStart, drawEnd, originalDateKey: dateKey });
                        }
                    }
                }
            }
        });
    }

    const allDaySlots = Array(7).fill(null).map(() => []);
    multiDayEvents.sort((a, b) => {
        const lenA = new Date(a.eDate) - new Date(a.sDate); const lenB = new Date(b.eDate) - new Date(b.sDate);
        if (lenA !== lenB) return lenB - lenA; return a.sDate.localeCompare(b.sDate); 
    });

    multiDayEvents.forEach(ev => {
        let sIdx = weekDates.indexOf(ev.sDate); let eIdx = weekDates.indexOf(ev.eDate);
        if (sIdx === -1 && ev.sDate < viewStartDateStr) sIdx = 0; if (eIdx === -1 && ev.eDate > viewEndDateStr) eIdx = 6;
        if (sIdx !== -1 && eIdx !== -1 && sIdx <= eIdx) {
            let row = 0;
            while (true) {
                let isFree = true;
                for (let i = sIdx; i <= eIdx; i++) { if (allDaySlots[i][row] !== undefined) { isFree = false; break; } }
                if (isFree) break; row++;
            }
            const segmentLength = eIdx - sIdx + 1;
            for (let i = sIdx; i <= eIdx; i++) allDaySlots[i][row] = { type: 'multi', event: ev, isSegmentStart: i === sIdx, segmentLength };
        }
    });

    for (let i = 0; i < 7; i++) {
        const dStr = weekDates[i]; const data = appState.allPlanners[dStr] || {}; let dayItems = [];
        (singleDayAllDayEvents[dStr] || []).forEach(ev => dayItems.push({ type: 'allday', event: ev }));
        (data.reminders || []).forEach(t => dayItems.push({ type: 'task', event: t }));
        dayItems.forEach(item => { let row = 0; while(allDaySlots[i][row] !== undefined) row++; allDaySlots[i][row] = item; });
    }

    let allDayHtml = `<div class="relative w-full h-full min-h-[30px] overflow-hidden"><div class="absolute inset-0 grid grid-cols-7 pointer-events-none">`;
    for(let i=0; i<7; i++){ allDayHtml += `<div class="border-r border-gray-200 ${(weekDateObjs[i].getDay() === 0 || weekDateObjs[i].getDay() === 6) ? 'bg-indigo-50/50' : 'bg-transparent'}"></div>`; }
    allDayHtml += `</div>`;
    
    let maxRow = -1;
    for(let i=0; i<7; i++){ allDaySlots[i].forEach((slot, r) => { if(slot) maxRow = Math.max(maxRow, r); }); }
    
    const ALLDAY_ROW_HEIGHT = 15;
    for(let r = 0; r <= maxRow; r++) {
        for(let c = 0; c < 7; c++) {
            const slot = allDaySlots[c][r]; if (!slot) continue;
            const topPx = r * ALLDAY_ROW_HEIGHT + 1;
            
            if (slot.type === 'multi') {
                if (slot.isSegmentStart) {
                    const ev = slot.event; let multiColorClass = getMultiDayColorClass(ev.category);
                    const leftPct = (c / 7) * 100; const widthPct = (slot.segmentLength / 7) * 100;
                    const isSearched = (appState.searchedItemId === ev.id) ? 'ring-2 ring-blue-500 shadow-md transform scale-[1.02] z-20' : '';
                    allDayHtml += `<div class="absolute flex items-center bg-transparent border-b-2 cursor-pointer hover:brightness-95 transition ${multiColorClass} ${isSearched}" style="top: ${topPx}px; left: calc(${leftPct}% + 2px); width: calc(${widthPct}% - 4px); height: 13px; z-index: 10;" onclick="event.stopPropagation(); window.openMonthBottomSheet('${weekDates[c]}')"><span class="font-bold text-[8px] w-full text-center truncate px-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">${ev.title}</span></div>`;
                }
            } else if (slot.type === 'allday') {
                const ev = slot.event; let bgColorClass = getEventColorClass(ev.category);
                const leftPct = (c / 7) * 100; const widthPct = (1 / 7) * 100;
                const isSearched = (appState.searchedItemId === ev.id) ? 'ring-2 ring-blue-500 shadow-md transform scale-[1.02] z-20' : '';
                allDayHtml += `<div class="absolute rounded-sm flex items-center shadow-sm cursor-pointer hover:brightness-110 transition border ${bgColorClass} ${isSearched}" style="top: ${topPx}px; left: calc(${leftPct}% + 2px); width: calc(${widthPct}% - 4px); height: 13px; z-index: 10;" onclick="event.stopPropagation(); window.openMonthBottomSheet('${weekDates[c]}')"><span class="font-bold text-[8px] truncate px-1">${ev.title}</span></div>`;
            } else if (slot.type === 'task') {
                const t = slot.event; const icon = t.completed ? '<i class="fas fa-check-circle text-blue-500"></i>' : '<i class="far fa-square text-gray-300"></i>'; 
                const style = t.completed ? 'text-gray-400 line-through opacity-70' : 'text-[#4a5f73]'; 
                const leftPct = (c / 7) * 100; const widthPct = (1 / 7) * 100;
                const isSearched = (appState.searchedItemId === t.id) ? 'ring-2 ring-blue-500 shadow-md transform scale-[1.02] z-20' : '';
                allDayHtml += `<div class="absolute rounded-sm flex items-center shadow-sm cursor-pointer hover:bg-gray-100 transition bg-white border border-gray-200 ${style} ${isSearched}" style="top: ${topPx}px; left: calc(${leftPct}% + 2px); width: calc(${widthPct}% - 4px); height: 13px; z-index: 10;" onclick="event.stopPropagation(); window.openMonthBottomSheet('${weekDates[c]}')"><div class="shrink-0 cursor-pointer flex items-center justify-center pl-0.5" onclick="event.stopPropagation(); window.toggleTaskGlobal('${weekDates[c]}', '${t.id}', ${!t.completed})">${icon}</div><span class="font-bold text-[8px] truncate px-1">${t.title}</span></div>`;
            }
        }
    }
    
    for (let i = 0; i < 7; i++) {
        const isSelAllDay = appState.selectedSlot && appState.selectedSlot.view === 'allday' && appState.selectedSlot.date === weekDates[i];
        allDayHtml += `<div class="absolute top-0 bottom-0 cursor-pointer transition-colors ${isSelAllDay ? 'bg-blue-200/50' : 'hover:bg-gray-200/50'}" style="left: ${(i / 7) * 100}%; width: ${(1 / 7) * 100}%; z-index: 1;" onclick="event.stopPropagation(); window.handleCellClick('allday', '${weekDates[i]}', 'allday')"></div>`;
    }
    allDayHtml += `</div>`;
    
    const alldayContainer = document.getElementById('week-view-allday'); 
    alldayContainer.innerHTML = allDayHtml; 
    alldayContainer.style.minHeight = `${Math.max(30, (maxRow + 1) * ALLDAY_ROW_HEIGHT + 10)}px`;

    let headerHtml = `<div class="bg-gray-50 border-r border-gray-300"></div>`;
    let colsHtml = Array(7).fill('');

    for (let i = 0; i < 7; i++) {
        const curStr = weekDates[i]; const cur = weekDateObjs[i]; const isToday = curStr === getFormatDateStr(new Date()); const isHoli = isHoliday(cur);
        const color = cur.getDay()===0 ? 'text-red-500' : (cur.getDay()===6 ? 'text-blue-500' : 'text-[#4a5f73]');
        const headerBg = isToday ? 'bg-blue-50' : ((cur.getDay() === 0 || cur.getDay() === 6) ? 'bg-indigo-50/50' : 'bg-white');

        headerHtml += `<div class="border-r border-gray-300 flex flex-col justify-center items-center py-0.5 relative ${headerBg}"><span class="text-[9px] pointer-events-none ${color}">${DAYS_STR[cur.getDay()]}</span><span class="text-xs font-bold ${isToday?'bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center':''}">${cur.getDate()}</span></div>`;

        let colContent = `<div class="absolute inset-0 flex flex-col pointer-events-auto border-r border-gray-200 z-0">`;
        for (let h = 5; h < 24; h++) {
            const isSel = appState.selectedSlot && appState.selectedSlot.view === 'timeline' && appState.selectedSlot.date === curStr && appState.selectedSlot.hour === h;
            colContent += `<div class="timeline-cell w-full cursor-pointer transition-colors box-border border-b border-transparent ${isSel ? 'slot-selected z-10 border-t border-b border-blue-500' : 'hover:bg-blue-50/50 border-t border-transparent z-0'}" style="height: calc(100% / 19);" onclick="event.stopPropagation(); window.handleCellClick('timeline', '${curStr}', ${h})"></div>`;
        }
        colContent += `</div>`;

        let combinedEvents = [];
        const data = appState.allPlanners[curStr] || {}; const ttType = getTtType(curStr); const ttPeriods = ttType !== 'none' ? appState.globalSettings.timetables[ttType].periods : [];

        if (!isHoli && ttType !== 'none') {
            const lessonCount = data.lessonCount !== undefined ? data.lessonCount : ttPeriods.length;
            ttPeriods.slice(0, lessonCount).forEach(p => {
                if (p.id === 'p_allday' || p.isAllDay) return;
                const cData = getPeriodClass(curStr, p, cur);
                if (cData) combinedEvents.push({ isClass: true, drawStart: p.s || "09:00", drawEnd: p.e || "10:00", period: p, cData: cData });
            });
        }
        timeEventsByDay[i].forEach(ev => combinedEvents.push({ isClass: false, drawStart: ev.drawStart, drawEnd: ev.drawEnd, ev: ev }));
        packTimeEvents(combinedEvents);

        combinedEvents.forEach(item => {
            const leftStr = `calc(${(item.colIndex / item.numCols) * 100}% + 2px)`; const widthStr = `calc(${(1 / item.numCols) * 100}% - 4px)`;
            let heightPct = Math.max(1, item.endPos - item.startPos); 

            if (item.isClass) {
                const p = item.period; const cData = item.cData; const blockClass = getClassColorClass(cData.cls, cData.sub); 
                let titleHtml = cData.cls || cData.sub ? `${cData.cls} ${cData.sub}` : (cData.memo ? cData.memo : `(${DAYS_STR[cData.sourceDay]}${cData.sourcePeriod})`);
                colContent += `<div class="absolute rounded-sm p-0.5 overflow-hidden flex flex-col leading-tight transition shadow-sm border pointer-events-auto z-10 cursor-pointer hover:brightness-95 ${blockClass}" style="top: ${item.startPos}%; left: ${leftStr}; width: ${widthStr}; height: ${heightPct}%; opacity: 0.95;" onclick="event.stopPropagation(); window.openMonthBottomSheet('${curStr}')"><div class="flex items-center gap-0.5 w-full truncate pointer-events-none"><span class="font-bold text-[8px] opacity-80 shrink-0">${p.name || ''}</span><span class="font-bold text-[9px] truncate">${titleHtml}</span></div></div>`;
            } else {
                const ev = item.ev; let bgColorClass = getEventColorClass(ev.category);
                const isSearched = (appState.searchedItemId === ev.id) ? 'ring-2 ring-blue-500 shadow-lg transform scale-[1.02] z-30' : '';
                colContent += `<div class="absolute rounded-sm p-0.5 overflow-hidden flex flex-col leading-tight shadow-md border z-20 cursor-pointer hover:brightness-110 transition pointer-events-auto ${bgColorClass} ${isSearched}" style="top: ${item.startPos}%; left: ${leftStr}; width: ${widthStr}; height: ${heightPct}%;" onclick="event.stopPropagation(); window.openMonthBottomSheet('${curStr}')"><span class="font-bold opacity-90 text-[8px] mb-0.5 pointer-events-none">${ev.drawStart}</span><span class="truncate text-[9px] font-bold pointer-events-none leading-snug">${ev.title}</span></div>`;
            }
        });
        colsHtml[i] = colContent;
    }

    document.getElementById('week-view-header').innerHTML = headerHtml;
    let gridHtml = '';
    for(let i=0; i<7; i++) { 
        const cur = new Date(startOfWeek); cur.setDate(startOfWeek.getDate() + i);
        gridHtml += `<div class="relative w-full h-full border-r border-gray-200 border-dashed ${(cur.getDay() === 0 || cur.getDay() === 6) ? 'bg-indigo-50/50' : 'bg-transparent'}">${colsHtml[i]}</div>`; 
    }
    document.getElementById('week-view-grid').innerHTML = gridHtml;
};


// ==========================================
// 一覧カレンダー（Agenda View）
// ==========================================
export const renderAgendaView = () => {
    const dateSet = new Set(Object.keys(appState.allPlanners)); const today = new Date(); const todayStr = getFormatDateStr(today);
    for (let i = 0; i <= 30; i++) { const d = new Date(today); d.setDate(today.getDate() + i); dateSet.add(getFormatDateStr(d)); }
    const dates = Array.from(dateSet).sort((a,b)=>a.localeCompare(b)); 
    let html = '', count = 0;

    dates.forEach(dStr => {
        const data = appState.allPlanners[dStr] || {}; const dObj = new Date(dStr);
        const isHoli = isHoliday(dObj); const ttType = getTtType(dStr); const ttPeriods = ttType !== 'none' ? appState.globalSettings.timetables[ttType].periods : [];
        let schedHtml = '', taskHtml = '';
        
        if (!isHoli && ttType !== 'none') {
            const lessonCount = data.lessonCount !== undefined ? data.lessonCount : ttPeriods.length;
            ttPeriods.slice(0, lessonCount).forEach(p => {
                if (p.id === 'p_allday' || p.isAllDay) return;
                const cData = getPeriodClass(dStr, p, dObj);
                if (cData) { 
                    let titleHtml = cData.cls || cData.sub ? `${cData.cls} ${cData.sub}` : (cData.memo ? cData.memo : `(${DAYS_STR[cData.sourceDay]}${cData.sourcePeriod})`);
                    let memoHtml = (cData.memo && (cData.cls || cData.sub)) ? `<div class="opacity-70 text-[9px] mt-1 border-t border-gray-200/50 pt-1 whitespace-pre-wrap pl-11">${cData.memo}</div>` : '';
                    schedHtml += `<div class="text-[10px] px-2 py-1.5 rounded border flex flex-col cursor-pointer transition hover:shadow-sm ${getClassColorClass(cData.cls, cData.sub)}" onclick="event.stopPropagation(); window.openMonthBottomSheet('${dStr}')">
                        <div class="flex items-start gap-1.5 w-full">
                            <span class="font-bold w-auto min-w-[2.5rem] whitespace-nowrap shrink-0 opacity-80 mt-0.5">${p.name}</span>
                            <span class="font-bold break-words flex-1">${titleHtml}</span>
                        </div>
                        ${memoHtml}
                    </div>`; 
                }
            });
        }
        
        if (data.events) {
            data.events.forEach(ev => {
                let label = "", isMultiDay = false;
                if (ev.start && ev.end && ev.start.split('T')[0] !== ev.end.split('T')[0]) {
                    const sD = new Date(ev.start.split('T')[0]); const eD = new Date(ev.end.split('T')[0]);
                    label = `${sD.getMonth()+1}/${sD.getDate()}〜${eD.getMonth()+1}/${eD.getDate()}`; isMultiDay = true;
                } else { label = ev.isAllDay ? "終日" : (ev.start ? ev.start.split('T').pop().substring(0, 5) : ""); }
                let badgeClass = isMultiDay ? `bg-transparent border-0 border-b-2 ${getMultiDayColorClass(ev.category)} hover:bg-gray-50` : `${getEventColorClass(ev.category)} border shadow-sm hover:brightness-95`;
                const memoPreview = ev.memo ? `<div class="text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-words border-t border-black/10 pt-1 w-full">${ev.memo}</div>` : '';
                schedHtml += `<div class="text-[10px] ${badgeClass} px-2 py-1.5 rounded flex flex-col cursor-pointer transition hover:shadow-sm" onclick="event.stopPropagation(); window.openMonthBottomSheet('${dStr}')">
                    <div class="flex items-start gap-1.5 w-full">
                        <span class="font-bold w-auto min-w-[2.5rem] whitespace-nowrap shrink-0 opacity-70 mt-0.5">${label}</span>
                        <span class="break-words font-bold flex-1">${ev.title}</span>
                    </div>
                    ${memoPreview}
                </div>`; 
            });
        }

        if (data.reminders) data.reminders.forEach(t => { 
            const icon = t.completed ? '<i class="fas fa-check-circle text-blue-500"></i>' : '<i class="far fa-square text-gray-300"></i>'; 
            const style = t.completed ? 'text-gray-400 line-through' : 'text-gray-700'; 
            const taskMemoHtml = t.memo ? `<div class="text-[9px] opacity-70 mt-1 whitespace-pre-wrap break-words border-t border-gray-200 pt-1 w-full ml-5">${t.memo}</div>` : '';
            taskHtml += `<div class="text-[10px] flex flex-col px-2 py-1.5 ${style} cursor-pointer bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded transition hover:shadow-sm" onclick="event.stopPropagation(); window.openMonthBottomSheet('${dStr}')">
                <div class="flex items-start gap-1.5 w-full">
                    <div class="shrink-0 cursor-pointer flex items-center justify-center mt-0.5" onclick="event.stopPropagation(); window.toggleTaskGlobal('${dStr}', '${t.id}', ${!t.completed})">${icon}</div>
                    <span class="break-words flex-1 font-bold">${t.title}</span>
                </div>
                ${taskMemoHtml}
            </div>`; 
        });

        if (!schedHtml && !taskHtml) return;
        count++;
        html += `<div id="agenda-date-${dStr}" class="${(dObj.getDay() === 0 || dObj.getDay() === 6) ? 'bg-indigo-50/50' : 'bg-white'} p-2.5 rounded-lg shadow-sm border border-gray-200"><div class="flex items-center gap-2 mb-2 border-b border-gray-100 pb-1.5"><div class="text-sm font-bold text-gray-700">${dObj.getFullYear()}年 ${dObj.getMonth()+1}月${dObj.getDate()}日 <span class="text-[10px] font-normal text-gray-500">(${DAYS_STR[dObj.getDay()]})</span></div></div><div class="flex flex-col sm:flex-row gap-2.5"><div class="flex-1 space-y-1"><div class="text-[9px] font-bold text-gray-400 mb-0.5 flex items-center gap-1 border-b border-gray-100 pb-0.5"><i class="far fa-calendar-alt"></i> 予定・授業</div>${schedHtml || '<div class="text-[9px] text-gray-400 p-0.5">予定なし</div>'}</div><div class="w-px bg-gray-100 hidden sm:block"></div><div class="flex-1 space-y-1"><div class="text-[9px] font-bold text-gray-400 mb-0.5 flex items-center gap-1 border-b border-gray-100 pb-0.5"><i class="fas fa-check-square"></i> タスク</div>${taskHtml || '<div class="text-[9px] text-gray-400 p-0.5">タスクなし</div>'}</div></div></div>`;
    });
    if (count === 0) html = '<div class="text-center py-6 text-gray-400"><i class="fas fa-mug-hot text-2xl mb-2"></i><p class="text-xs">登録されている今後の予定やタスクはありません。</p></div>';
    document.getElementById('agenda-view-list').innerHTML = html;

    let incompleteTasks = [];
    for (const dateKey in appState.allPlanners) {
        if (appState.allPlanners[dateKey].reminders) {
            appState.allPlanners[dateKey].reminders.forEach(t => {
                if (!t.completed) { let taskDate = t.dueDate || dateKey; if (taskDate <= todayStr) incompleteTasks.push({ ...t, originalDateKey: dateKey, taskDate: taskDate }); }
            });
        }
    }
    incompleteTasks.sort((a, b) => a.taskDate.localeCompare(b.taskDate));

    let incompleteHtml = '';
    if (incompleteTasks.length === 0) incompleteHtml = '<div class="text-center py-4 text-gray-400 text-[10px] font-bold">未完了のタスクはありません</div>';
    else {
        incompleteTasks.forEach(t => {
            const isOverdue = t.taskDate < todayStr;
            incompleteHtml += `<div class="text-[10px] flex items-start gap-1.5 px-1.5 py-1.5 bg-white border ${isOverdue ? 'border-red-200 shadow-sm' : 'border-gray-200'} rounded cursor-pointer hover:bg-gray-50 transition" onclick="event.stopPropagation(); window.openMonthBottomSheet('${t.originalDateKey}')"><div class="mt-px shrink-0 cursor-pointer flex items-center justify-center" onclick="event.stopPropagation(); window.toggleTaskGlobal('${t.originalDateKey}', '${t.id}', true)"><i class="far fa-square text-gray-400 hover:text-blue-500 transition text-sm"></i></div><div class="flex flex-col flex-1 min-w-0"><div class="flex items-center gap-1 w-full"><span class="font-bold text-[#4a5f73] truncate">${t.title}</span>${isOverdue ? `<span class="text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded ml-auto shrink-0 font-bold border border-red-200">超過</span>` : `<span class="text-[8px] bg-yellow-100 text-yellow-700 px-1 py-0.5 rounded ml-auto shrink-0 font-bold border border-yellow-200">本日</span>`}</div>${t.memo ? `<div class="text-[9px] text-gray-500 truncate mt-0.5">${t.memo}</div>` : ''}<div class="text-[8px] text-gray-400 mt-0.5">${t.taskDate}</div></div></div>`;
        });
    }
    document.getElementById('agenda-incomplete-tasks').innerHTML = incompleteHtml;
};


// ==========================================
// 週案簿（Weekly Plan View）
// ==========================================
export const calculateTechCountsForWeek = (startOfWeek) => {
    const friday = new Date(startOfWeek); friday.setDate(friday.getDate() + 4);
    const year = friday.getMonth() >= 3 ? friday.getFullYear() : friday.getFullYear() - 1;
    const startDate = new Date(year, 3, 1); 
    const counts = {}; const lessonCountMap = {}; 
    let curDate = new Date(startDate);
    while (curDate <= friday) {
        const dStr = getFormatDateStr(curDate);
        if (!isHoliday(curDate)) {
            const data = appState.allPlanners[dStr] || {}; const ttType = getTtType(dStr);
            if (ttType !== 'none') {
                const ttPeriods = appState.globalSettings.timetables[ttType].periods;
                const lessonCount = data.lessonCount !== undefined ? data.lessonCount : ttPeriods.length;
                ttPeriods.slice(0, lessonCount).forEach(p => {
                    if (p.id === 'p_allday' || p.isAllDay) return;
                    const cData = getPeriodClass(dStr, p, curDate);
                    if (cData && String(cData.sub).trim() === '技術') {
                        const cls = String(cData.cls).trim();
                        if (cls) { counts[cls] = (counts[cls] || 0) + 1; lessonCountMap[`${dStr}_${p.id}`] = counts[cls]; }
                    }
                });
            }
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    return lessonCountMap;
};

export const changeWeeklyPlanView = (offset) => { 
    appState.calendarDisplayDate.setDate(appState.calendarDisplayDate.getDate() + (offset * 7)); 
    renderWeeklyPlanView(); 
};

export const renderWeeklyPlanView = () => {
    const d = new Date(appState.calendarDisplayDate);
    const dayOfWeekNum = d.getDay() === 0 ? 7 : d.getDay(); 
    const startOfWeek = new Date(d.setDate(d.getDate() - dayOfWeekNum + 1));
    document.getElementById('weekly-plan-title').textContent = `${startOfWeek.getFullYear()}年 ${startOfWeek.getMonth()+1}月`;

    const workDays = [];
    for(let i=0; i<5; i++) { const cur = new Date(startOfWeek); cur.setDate(startOfWeek.getDate() + i); workDays.push(cur); }
    const techCountsMap = calculateTechCountsForWeek(startOfWeek);

    // h-full と min-w-full を削除し、スマホでも最低500pxの幅と自然な高さを確保（潰れ防止）
    let html = '<table class="w-full border-collapse min-w-[500px] sm:min-w-[600px] bg-white rounded shadow-sm border border-gray-300 table-fixed">';
    html += '<thead><tr class="h-6"><th class="border-b border-r border-gray-300 p-0.5 w-6 sm:w-10 bg-gray-50 sticky-col z-10"></th>';
    workDays.forEach(day => {
        html += `<th class="border-b border-r border-gray-300 p-0.5 text-center font-bold text-[#4a5f73] bg-gray-50"><div class="text-[8px] sm:text-[9px] text-gray-500">${day.getMonth()+1}/${day.getDate()}</div><div class="text-[10px] sm:text-xs">${DAYS_STR[day.getDay()]}</div></th>`;
    });
    html += '</tr><tr class="h-5"><th class="border-b border-r border-gray-300 p-0.5 text-center text-[9px] sm:text-[10px] font-bold text-gray-600 bg-gray-50 sticky-col z-10">日課</th>';
    
    const ttOrder = ['normal', 'short', 'special', 'test'];

    workDays.forEach(day => {
        const dStr = getFormatDateStr(day); const data = appState.allPlanners[dStr] || {}; const ttType = getTtType(dStr);
        const selectBgClass = ttType === 'normal' ? 'bg-white text-[#4a5f73] border-gray-300' : (ttType === 'none' ? 'bg-gray-100 text-gray-500 border-gray-300' : 'bg-red-100 text-red-800 border-red-300 shadow-inner');
        
        let optionsHtml = '';
        ttOrder.forEach(k => {
            if (appState.globalSettings.timetables[k]) {
                optionsHtml += `<option value="${k}" ${ttType === k ? 'selected' : ''}>${appState.globalSettings.timetables[k].name}</option>`;
            }
        });
        Object.keys(appState.globalSettings.timetables).forEach(k => {
            if (!ttOrder.includes(k)) {
                optionsHtml += `<option value="${k}" ${ttType === k ? 'selected' : ''}>${appState.globalSettings.timetables[k].name}</option>`;
            }
        });
        optionsHtml += `<option value="none" ${ttType === 'none' ? 'selected' : ''}>休日</option>`;

        html += `<td class="border-b border-r border-gray-200 p-0.5 text-center"><select id="wp-tt-${dStr}" class="w-full ${selectBgClass} border rounded p-0 text-[8px] sm:text-[10px] outline-none font-bold cursor-pointer focus:border-[#4a5f73] transition-colors" onchange="window.updateWeeklyPlanPeriods('${dStr}')">${optionsHtml}</select></td>`;
    });
    html += '</tr><tr class="h-5"><th class="border-b border-r border-gray-300 p-0.5 text-center text-[9px] sm:text-[10px] font-bold text-gray-600 bg-gray-50 sticky-col z-10">授業数</th>';
    workDays.forEach(day => {
        const dStr = getFormatDateStr(day); const data = appState.allPlanners[dStr] || {}; const ttType = getTtType(dStr);
        let maxLessons = 0; if (ttType !== 'none') maxLessons = appState.globalSettings.timetables[ttType].periods.filter(p=>p.id!=='p_allday'&&!p.isAllDay).length;
        const lessonCount = data.lessonCount !== undefined ? data.lessonCount : maxLessons;
        html += `<td class="border-b border-r border-gray-200 p-0.5 text-center"><select id="wp-lc-${dStr}" class="w-full bg-white border border-gray-300 rounded p-0 text-[8px] sm:text-[10px] outline-none font-bold text-[#4a5f73] cursor-pointer focus:border-[#4a5f73]" onchange="window.saveWeeklyPlan(false)">
            <option value="0" ${lessonCount === 0 ? 'selected' : ''}>0時間</option>
            ${[1,2,3,4,5,6,7,8].slice(0, maxLessons).map(n => `<option value="${n}" ${lessonCount === n ? 'selected' : ''}>${n}時間</option>`).join('')}
        </select></td>`;
    });
    html += '</tr></thead><tbody>';

    let maxPeriodsInWeek = 0; const weekPeriodsMap = []; 
    for (let i = 0; i < 5; i++) {
        const cur = workDays[i]; const dStr = getFormatDateStr(cur); const ttType = getTtType(dStr);
        const periods = ttType !== 'none' ? appState.globalSettings.timetables[ttType].periods.filter(p => p.id !== 'p_allday' && !p.isAllDay) : [];
        weekPeriodsMap.push(periods); if (periods.length > maxPeriodsInWeek) maxPeriodsInWeek = periods.length;
    }
    if (maxPeriodsInWeek === 0) maxPeriodsInWeek = 6; 

    const rowsToRender = [];
    rowsToRender.push({ type: 'special', id: 'sp_morning', name: '朝' });
    for (let pIdx = 0; pIdx < maxPeriodsInWeek; pIdx++) {
        rowsToRender.push({ type: 'period', index: pIdx });
        if (pIdx === 3) rowsToRender.push({ type: 'special', id: 'sp_noon', name: '昼' });
    }
    if (maxPeriodsInWeek <= 3) rowsToRender.push({ type: 'special', id: 'sp_noon', name: '昼' });
    rowsToRender.push({ type: 'special', id: 'sp_after_school', name: '放' });

    for (let r of rowsToRender) {
        const rowClass = r.type === 'special' ? 'h-8 sm:h-10' : 'h-16 sm:h-20';
        html += `<tr class="${rowClass}">`;
        
        if (r.type === 'special') {
            html += `<td class="border-b border-r border-gray-300 p-0 text-center font-bold text-gray-500 bg-orange-50/50 text-[10px] sticky-col z-10 w-6 sm:w-10 relative"><div class="absolute inset-0 flex items-center justify-center pt-1"><span style="writing-mode: vertical-rl; text-orientation: upright; letter-spacing: -2px; font-size: 8px;">${r.name}</span></div></td>`;
            
            for (let dIdx = 0; dIdx < 5; dIdx++) {
                const day = workDays[dIdx]; const dStr = getFormatDateStr(day); const data = appState.allPlanners[dStr] || {};
                const cData = (data.classes && data.classes[r.id]) ? data.classes[r.id] : {};
                const isCut = cData.isCut;
                const memo = cData.memo || "";
                
                let btnContent = "";
                let borderClass = "border border-gray-200", bgClass = "bg-white hover:bg-gray-50";
                
                if (isCut) {
                    bgClass = "bg-gray-100 text-gray-400";
                    btnContent = `<div class="font-bold text-[10px] w-full text-center tracking-widest"><i class="fas fa-ban mr-1"></i>カット</div>`;
                    borderClass = "border border-dashed border-gray-300";
                } else if (memo) {
                    bgClass = "bg-yellow-50 text-yellow-800 hover:bg-yellow-100";
                    borderClass = "border border-yellow-200 shadow-sm";
                    btnContent = `<div class="text-[9px] sm:text-[10px] truncate w-full px-1 whitespace-normal leading-tight">${memo}</div>`;
                } else {
                    btnContent = `<div class="text-[8px] text-gray-300 w-full text-center"><i class="fas fa-plus mr-0.5"></i></div>`;
                }
                
                html += `<td class="border-b border-r border-gray-200 p-0 text-center align-middle relative"><div class="absolute inset-[1px]"><button class="relative w-full h-full rounded-sm transition flex flex-col justify-center items-center overflow-hidden ${borderClass} ${bgClass}" onclick="window.openWeeklyPlanModal('${dStr}', '${r.id}', '${r.name}')">${btnContent}</button></div></td>`;
            }
        } else {
            const pIdx = r.index;
            html += `<td class="border-b border-r border-gray-300 p-0 text-center font-bold text-gray-600 bg-gray-50 text-[10px] sticky-col z-10 w-6 sm:w-10 relative"><div class="absolute inset-0 flex items-center justify-center">${pIdx + 1}</div></td>`;
            
            for (let dIdx = 0; dIdx < 5; dIdx++) {
                const day = workDays[dIdx]; const dStr = getFormatDateStr(day); const data = appState.allPlanners[dStr] || {};
                const periods = weekPeriodsMap[dIdx]; const p = periods[pIdx];
                const lessonCount = data.lessonCount !== undefined ? data.lessonCount : periods.length;

                if (!p || pIdx >= lessonCount) { html += `<td class="border-b border-r border-gray-200 p-0.5 bg-gray-100 opacity-50 h-full relative"></td>`; continue; }

                const baseTt = getBaseTimetableForDate(day);
                let baseCls = "", baseSub = "", baseMemo = "";
                let bData = null;
                if (baseTt[day.getDay()] && baseTt[day.getDay()][p.name]) {
                    bData = baseTt[day.getDay()][p.name];
                } else {
                    const fallbackName = `${pIdx + 1}限`;
                    if (baseTt[day.getDay()] && baseTt[day.getDay()][fallbackName]) {
                        bData = baseTt[day.getDay()][fallbackName];
                    }
                }
                if (bData) {
                    baseCls = bData.cls || ""; baseSub = bData.sub || ""; baseMemo = bData.memo || "";
                }

                let currentCls = "", currentSub = "", currentMemo = "", isExcluded = false, hasCustom = false;
                let sourceDay = day.getDay(), sourcePeriod = pIdx + 1;

                if (data.classes && data.classes[p.id]) {
                    const cData = data.classes[p.id];
                    currentCls = cData.cls || ""; currentSub = cData.sub || ""; currentMemo = cData.memo || ""; hasCustom = true;
                    if (cData.sourceDay !== undefined) { sourceDay = cData.sourceDay; sourcePeriod = cData.sourcePeriod; }
                    if (cData.disabled) isExcluded = true;
                }

                let displayCls = hasCustom ? currentCls : baseCls, displaySub = hasCustom ? currentSub : baseSub, displayMemo = hasCustom ? currentMemo : baseMemo;
                let btnContent = "", borderClass = "border border-gray-200", bgClass = "bg-white hover:bg-gray-50";

                const isChanged = (sourceDay !== day.getDay()) || (sourcePeriod !== (pIdx + 1));
                const labelColorClass = isChanged ? "bg-orange-100 text-orange-800 border-orange-300" : "bg-white text-[#4a5f73] border-gray-200";
                const labelHtml = `<div class="absolute top-0 left-0 px-1.5 py-1 text-[10px] sm:text-xs font-bold rounded-br border-r border-b ${labelColorClass} z-10 leading-none">${DAYS_STR[sourceDay]}${sourcePeriod}</div>`;

                if (isExcluded) {
                    btnContent = labelHtml; borderClass = "border border-dashed border-gray-300";
                } else if (displayCls || displaySub || displayMemo || hasCustom) {
                    const colorClass = getClassColorClass(displayCls, displaySub);
                    bgClass = colorClass.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('hover:bg-')).join(' ');
                    const textColor = colorClass.split(' ').find(c => c.startsWith('text-')) || "text-gray-800";
                    let memoHtml = (displayMemo && (displayCls || displaySub)) ? `<div class="text-[7px] sm:text-[8px] opacity-70 truncate px-0.5 w-full mt-0.5 leading-tight">${displayMemo}</div>` : '';
                    let mainContent = '', techCountHtml = '';

                    if (displayCls || displaySub) {
                        mainContent = `<div class="font-bold text-[9px] sm:text-xs ${textColor} truncate px-0.5 w-full leading-tight">${displayCls}</div><div class="font-bold text-[9px] sm:text-xs ${textColor} truncate px-0.5 w-full leading-tight">${displaySub}</div>${memoHtml}`;
                        if (displaySub.trim() === '技術') {
                            const currentCount = techCountsMap[`${dStr}_${p.id}`] || 0;
                            let denominator = (displayCls.startsWith('3') || displayCls.includes('3年')) ? 17.5 : 35;
                            techCountHtml = `<div class="absolute bottom-0 right-0 px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-blue-600 bg-blue-50/90 rounded-tl border-t border-l border-blue-100 shadow-sm z-10 leading-none">${currentCount}/${denominator}</div>`;
                        }
                    } else if (displayMemo) {
                        mainContent = `<div class="font-bold text-[9px] sm:text-xs ${textColor} truncate px-0.5 w-full leading-tight whitespace-normal">${displayMemo}</div>`;
                    } else { mainContent = `<div class="text-[9px] text-gray-400 font-bold opacity-70">未設定</div>`; }

                    btnContent = `${labelHtml}<div class="w-full h-full flex flex-col justify-center items-center pt-2 pb-0.5 overflow-hidden relative z-0">${mainContent}</div>${techCountHtml}`;
                    borderClass = "border border-[#4a5f73]/50 shadow-sm";
                } else { btnContent = labelHtml; borderClass = "border border-gray-200"; }

                html += `<td class="border-b border-r border-gray-200 p-0 text-center align-middle relative"><div class="absolute inset-[1px]"><button class="relative w-full h-full rounded-sm transition flex flex-col justify-center items-center overflow-hidden ${borderClass} ${bgClass}" onclick="window.openWeeklyPlanModal('${dStr}', '${p.id}', '${p.name}')">${btnContent}</button></div></td>`;
            }
        }
        html += `</tr>`;
    }
    html += '</tbody></table>';
    document.getElementById('weekly-plan-container').innerHTML = html;
};

export const updateWeeklyPlanPeriods = (dStr) => {
    const select = document.getElementById(`wp-tt-${dStr}`);
    if (!appState.allPlanners[dStr]) appState.allPlanners[dStr] = { classes: {}, reminders: [], events: [] };
    appState.allPlanners[dStr].timetableType = select.value;
    if (select.value === 'none') { appState.allPlanners[dStr].lessonCount = 0; } 
    else { appState.allPlanners[dStr].lessonCount = appState.globalSettings.timetables[select.value].periods.filter(p=>p.id!=='p_allday'&&!p.isAllDay).length; }
    saveWeeklyPlan(false); 
};

export const saveWeeklyPlan = (showAlert = true) => {
    if(window.saveStateToHistory) window.saveStateToHistory(); 
    const d = new Date(appState.calendarDisplayDate); const startOfWeek = new Date(d.setDate(d.getDate() - (d.getDay() === 0 ? 7 : d.getDay()) + 1));
    for (let i = 0; i < 5; i++) {
        const cur = new Date(startOfWeek); cur.setDate(startOfWeek.getDate() + i); 
        const dStr = getFormatDateStr(cur); const ttSelect = document.getElementById(`wp-tt-${dStr}`);
        if (!ttSelect) continue;
        const lessonCount = parseInt(document.getElementById(`wp-lc-${dStr}`).value);
        if (!appState.allPlanners[dStr]) appState.allPlanners[dStr] = { classes: {}, reminders: [], events: [] };
        appState.allPlanners[dStr].timetableType = ttSelect.value; appState.allPlanners[dStr].lessonCount = lessonCount;
        if (!appState.allPlanners[dStr].classes) appState.allPlanners[dStr].classes = {};
    }
    safeSetItem(LS_KEY, JSON.stringify(appState.allPlanners)); saveToFirebase(); 
    if (showAlert) { alert("週の授業計画を保存しました。"); window.renderCurrentView(); } else { renderWeeklyPlanView(); }
};