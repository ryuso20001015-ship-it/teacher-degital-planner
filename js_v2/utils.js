export const memoryStorage = {};

export const safeGetItem = (key) => {
    try { 
        return localStorage.getItem(key) || memoryStorage[key] || null; 
    } catch(e) { 
        return memoryStorage[key] || null; 
    }
};

export const safeSetItem = (key, value) => {
    try { localStorage.setItem(key, value); } catch(e) {}
    memoryStorage[key] = String(value);
};

export const safeRemoveItem = (key) => {
    try { localStorage.removeItem(key); } catch(e) {}
    delete memoryStorage[key];
};

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
            packGroup(columns); 
            columns = []; 
            lastEventEnding = null;
        }
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
            let col = columns[c];
            if (col[col.length - 1].endPos <= ev.startPos) { 
                col.push(ev); 
                placed = true; 
                break; 
            }
        }
        if (!placed) columns.push([ev]);
        if (lastEventEnding === null || ev.endPos > lastEventEnding) lastEventEnding = ev.endPos;
    });
    
    if (columns.length > 0) packGroup(columns);

    function packGroup(cols) {
        let numCols = cols.length;
        cols.forEach((col, colIdx) => { 
            col.forEach(e => { 
                e.colIndex = colIdx; 
                e.numCols = numCols; 
            }); 
        });
    }
};