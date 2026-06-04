// ==========================================
// SMART TRASH MOBILE CONTROLLER (RENDERER)
// ==========================================

let dbUrl = localStorage.getItem('firebaseDbUrl') || 'https://smart-trash-iot-c0ec4-default-rtdb.asia-southeast1.firebasedatabase.app';
let eventSource = null;
let distributionChart = null;
let soundActive = true;

// DOM Elements
const dryCountEl = document.getElementById('dry-count');
const wetCountEl = document.getElementById('wet-count');
const metalCountEl = document.getElementById('metal-count');
const currentMoistureEl = document.getElementById('current-moisture');
const moistureGaugeCircle = document.getElementById('moisture-gauge-circle');
const moistureStatusLabel = document.getElementById('moisture-status-label');
const cloudStatusText = document.getElementById('cloud-status-text');
const quickLogsList = document.getElementById('quick-logs-list');
const metalAlert = document.getElementById('metal-alert');
const closeAlertBtn = document.getElementById('close-alert');

// Navigation View Tabs
const btnDashboard = document.getElementById('btn-dashboard');
const btnLogs = document.getElementById('btn-logs');
const btnSettings = document.getElementById('btn-settings');
const viewDashboard = document.getElementById('view-dashboard');
const viewLogs = document.getElementById('view-logs');
const viewSettings = document.getElementById('view-settings');

// Logs View DOM Elements
const historyTableBody = document.getElementById('history-table-body');
const filterType = document.getElementById('filter-type');
const btnRefreshHistory = document.getElementById('btn-refresh-history');

// Settings Fields
const inputDbUrl = document.getElementById('firebase-db-url');
const checkboxSound = document.getElementById('buzzer-sound-active');
const btnSaveSettings = document.getElementById('btn-save-settings');

// Voice Assistant DOM Elements
const btnVoiceAssistant = document.getElementById('btn-voice-assistant');
const voiceOverlay = document.getElementById('voice-overlay');
const btnCloseVoice = document.getElementById('btn-close-voice');
const voiceStatusText = document.getElementById('voice-status-text');
const userSpeechBubble = document.getElementById('user-speech-bubble');
const userSpeechText = document.getElementById('user-speech-text');
const aiResponseBubble = document.getElementById('ai-response-bubble');
const aiResponseText = document.getElementById('ai-response-text');

// OpenRouter and Mode state variables
let aiMode = 'db'; // 'db' or 'llm'
const btnModeDb = document.getElementById('btn-mode-db');
const btnModeLlm = document.getElementById('btn-mode-llm');
const openRouterApiKey = '';
const openRouterModel = 'openrouter/owl-alpha';

// Clock Update (Mobile Format: Hour:Minute)
setInterval(() => {
  const now = new Date();
  document.getElementById('current-time').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

// Initialize Navigation Event Handlers
btnDashboard.addEventListener('click', () => switchTab('dashboard'));
btnLogs.addEventListener('click', () => switchTab('logs'));
btnSettings.addEventListener('click', () => switchTab('settings'));

function switchTab(tab) {
  // Gỡ bỏ class active trên tất cả các nút
  btnDashboard.classList.remove('active');
  btnLogs.classList.remove('active');
  btnSettings.classList.remove('active');
  
  // Ẩn tất cả các màn hình
  viewDashboard.classList.add('hidden');
  viewLogs.classList.add('hidden');
  viewSettings.classList.add('hidden');

  if (tab === 'dashboard') {
    btnDashboard.classList.add('active');
    viewDashboard.classList.remove('hidden');
  } else if (tab === 'logs') {
    btnLogs.classList.add('active');
    viewLogs.classList.remove('hidden');
    loadDetailedLogs(); // Tự động truy vấn lịch sử khi mở tab Logs
  } else if (tab === 'settings') {
    btnSettings.classList.add('active');
    viewSettings.classList.remove('hidden');
  }
}

// Cấu hình settings mặc định
inputDbUrl.value = dbUrl;
checkboxSound.addEventListener('change', (e) => {
  soundActive = e.target.checked;
});

btnSaveSettings.addEventListener('click', () => {
  let url = inputDbUrl.value.trim();
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  
  localStorage.setItem('firebaseDbUrl', url);
  dbUrl = url;
  
  alert('Đã lưu cấu hình thành công!');
  connectToFirebase();
  switchTab('dashboard');
});

// Web Audio API - Hệ thống bíp cảnh báo kim loại (9 tiếng bíp chia làm 3 nhóm)
let audioCtx = null;
let sirenTimeouts = [];
let pendingMetalAlarm = false; // Ghi nhớ nếu cảnh báo bị chặn bởi autoplay policy
let userHasInteracted = false;

function playSiren() {
  if (!soundActive) return;
  
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Nếu audioCtx bị trình duyệt chặn (suspended) và chưa có tương tác người dùng
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
      if (!userHasInteracted) {
        pendingMetalAlarm = true; // Ghi nhớ để phát khi người dùng click
        console.log("Âm thanh bị chặn bởi autoplay policy, chờ người dùng tương tác...");
        return;
      }
    }
    
    stopSiren();
    
    // Khoảng thời gian kích hoạt các tiếng bíp (mili-giây):
    // Nhóm 1: 0ms, 250ms, 500ms
    // Nhóm 2: 1300ms, 1550ms, 1800ms (nghỉ 800ms)
    // Nhóm 3: 2600ms, 2850ms, 3100ms (nghỉ 800ms)
    const delays = [0, 250, 500, 1300, 1550, 1800, 2600, 2850, 3100];
    
    delays.forEach((delay) => {
      const timeoutId = setTimeout(() => {
        if (!soundActive) return;
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime); // Tần số 800Hz ấm như tiếng gõ "cốc"
        
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15); // Tiếng gõ dài 150ms
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.15);
      }, delay);
      
      sirenTimeouts.push(timeoutId);
    });
  } catch (error) {
    console.error("Không thể khởi tạo Web Audio API:", error);
  }
}

function stopSiren() {
  sirenTimeouts.forEach(id => clearTimeout(id));
  sirenTimeouts = [];
}

// Close Metal Alarm Banner
closeAlertBtn.addEventListener('click', () => {
  metalAlert.classList.add('hidden');
  stopSiren();
  pendingMetalAlarm = false;
});

// Alarm logic for metal detection
function checkMetalAlarm(type) {
  if (type === 'metal') {
    metalAlert.classList.remove('hidden');
    playSiren();
  } else {
    metalAlert.classList.add('hidden');
    stopSiren();
    pendingMetalAlarm = false;
  }
}

// Click anywhere to unlock audio autoplay + phát bíp nếu đang có cảnh báo chờ
document.body.addEventListener('click', () => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    userHasInteracted = true;
    
    // Nếu có cảnh báo kim loại đang chờ, phát ngay lập tức
    if (pendingMetalAlarm) {
      pendingMetalAlarm = false;
      playSiren();
    }
  } catch (e) {
    console.error("Lỗi khởi tạo AudioContext:", e);
  }
});

// Initialize Chart.js
function initChart() {
  const ctx = document.getElementById('distribution-chart').getContext('2d');
  
  distributionChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Rác Khô', 'Rác Ướt', 'Rác Kim Loại'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: [
          '#ff9800', // orange
          '#0ea5e9', // sky blue
          '#94a3b8'  // slate
        ],
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9ca3af',
            font: {
              family: 'Outfit',
              size: 11
            },
            padding: 12
          }
        }
      },
      cutout: '72%'
    }
  });
}

// Update Database Statistics and Gauge
function updateUI(stats) {
  if (!stats) return;

  const dry = stats.dryCount || 0;
  const wet = stats.wetCount || 0;
  const metal = stats.metalCount || 0;
  
  // Update Cards numbers
  dryCountEl.innerText = dry;
  wetCountEl.innerText = wet;
  metalCountEl.innerText = metal;

  // Realtime active moisture update
  if (stats.currentTrash) {
    const activeMoisture = stats.currentTrash.moisture || 0;
    currentMoistureEl.innerText = activeMoisture + '%';
    
    // Draw Circular Gauge
    const circumference = 251.2;
    const offset = circumference - (activeMoisture / 100) * circumference;
    moistureGaugeCircle.style.strokeDashoffset = offset;

    // Moisture status text label helper
    if (activeMoisture > 50) {
      moistureStatusLabel.innerText = "Trạng thái: Ẩm Ướt Cao 💧";
      moistureStatusLabel.style.color = '#38bdf8';
    } else if (activeMoisture > 20) {
      moistureStatusLabel.innerText = "Trạng thái: Hơi Ẩm 🌤️";
      moistureStatusLabel.style.color = '#fbbf24';
    } else {
      moistureStatusLabel.innerText = "Trạng thái: Khô Ráo 🏜️";
      moistureStatusLabel.style.color = '#10b981';
    }
  }

  // Update Doughnut Chart values
  if (distributionChart) {
    distributionChart.data.datasets[0].data = [dry, wet, metal];
    distributionChart.update();
  }
}

// Push to Recent Activity Logs list
function addNewLog(type, moisture, timestamp) {
  const logTime = new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  // Tránh thêm log trùng lặp về mặt thời gian hiển thị
  const isDuplicate = Array.from(quickLogsList.querySelectorAll('.log-item')).some(item => {
    return item.querySelector('.log-time').innerText === logTime;
  });
  if (isDuplicate) return;

  // Clear empty state
  const emptyState = quickLogsList.querySelector('.empty-state');
  if (emptyState) {
    quickLogsList.innerHTML = '';
  }

  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  
  let VietnameseType = 'Rác Khô';
  let badgeClass = 'dry';
  if (type === 'wet') { VietnameseType = 'Rác Ướt'; badgeClass = 'wet'; }
  if (type === 'metal') { VietnameseType = 'Kim Loại'; badgeClass = 'metal'; }

  logItem.innerHTML = `
    <div class="log-item-details">
      <span class="log-badge ${badgeClass}">${VietnameseType}</span>
      <span class="log-moisture">Độ ẩm: ${moisture}%</span>
    </div>
    <span class="log-time">${logTime}</span>
  `;

  // Insert to the top
  quickLogsList.insertBefore(logItem, quickLogsList.firstChild);

  // Keep max 5 items in mobile dashboard
  if (quickLogsList.children.length > 5) {
    quickLogsList.removeChild(quickLogsList.lastChild);
  }
}

// Tải 100 bản ghi lịch sử logs gần nhất từ Firebase Realtime Database
let loadedLogs = [];

async function loadDetailedLogs() {
  if (!historyTableBody) return;
  historyTableBody.innerHTML = `
    <tr>
      <td colspan="4" class="table-empty">Đang đồng bộ và tải lịch sử chi tiết từ Firebase...</td>
    </tr>
  `;
  
  try {
    const res = await fetch(`${dbUrl}/history_logs.json?orderBy="$key"&limitToLast=100`);
    const data = await res.json();
    
    if (data && !data.error) {
      loadedLogs = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      
      // Sắp xếp: Bản ghi phân loại mới nhất lên trên cùng bảng
      loadedLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      renderLogsTable();
    } else {
      historyTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="table-empty">Không tìm thấy dữ liệu lịch sử.</td>
        </tr>
      `;
    }
  } catch (error) {
    console.error("Lỗi khi tải lịch sử logs chi tiết:", error);
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="table-empty">Lỗi kết nối Firebase. Vui lòng cấu hình lại liên kết.</td>
      </tr>
    `;
  }
}

function renderLogsTable() {
  if (!historyTableBody) return;
  
  const selectedType = filterType.value;
  
  // Lọc theo loại rác được chọn ở Dropdown
  const filtered = loadedLogs.filter(log => {
    if (selectedType === 'all') return true;
    return log.type === selectedType;
  });
  
  if (filtered.length === 0) {
    historyTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="table-empty">Không tìm thấy bản ghi nào.</td>
      </tr>
    `;
    return;
  }
  
  historyTableBody.innerHTML = '';
  
  filtered.forEach((log, index) => {
    const row = document.createElement('tr');
    
    let VietnameseType = 'Rác Khô';
    let badgeClass = 'dry';
    if (log.type === 'wet') { VietnameseType = 'Rác Ướt'; badgeClass = 'wet'; }
    if (log.type === 'metal') { VietnameseType = 'Kim Loại'; badgeClass = 'metal'; }
    
    const formattedTime = new Date(log.timestamp || Date.now()).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });
    
    row.innerHTML = `
      <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${index + 1}</td>
      <td><span class="log-badge ${badgeClass}">${VietnameseType}</span></td>
      <td style="font-weight: 600;">${log.moisture || 0}%</td>
      <td style="color: var(--text-muted); font-size: 10px;">${formattedTime}</td>
    `;
    
    historyTableBody.appendChild(row);
  });
}

// Gắn sự kiện thay đổi bộ lọc loại rác và làm mới dữ liệu
if (filterType) {
  filterType.addEventListener('change', renderLogsTable);
}
if (btnRefreshHistory) {
  btnRefreshHistory.addEventListener('click', loadDetailedLogs);
}

// Tự động đồng bộ sự kiện rác mới thời gian thực vào danh sách của Tab Lịch sử chi tiết
function syncRealtimeLogToDetailedTable(trash) {
  if (!trash || !trash.type) return;
  
  const isDuplicate = loadedLogs.some(log => log.timestamp === trash.timestamp);
  if (!isDuplicate) {
    const newLog = {
      type: trash.type,
      moisture: trash.moisture,
      timestamp: trash.timestamp
    };
    loadedLogs.unshift(newLog);
    if (loadedLogs.length > 100) {
      loadedLogs.pop();
    }
    renderLogsTable();
  }
}

// Connect to Firebase Realtime Database using Server-Sent Events (SSE / EventSource)
function connectToFirebase() {
  if (eventSource) {
    eventSource.close();
  }

  // Tải trước các logs lịch sử cũ đã lưu trên Firebase
  fetchRecentLogs();

  // SSE endpoint for Firebase
  const sseUrl = `${dbUrl}/system_status.json`;
  
  cloudStatusText.innerText = "Đang Kết Nối...";
  cloudStatusText.className = "status-badge";

  try {
    eventSource = new EventSource(sseUrl);

    // Initial load or full update
    eventSource.addEventListener('put', (e) => {
      cloudStatusText.innerText = "Trực Tuyến";
      cloudStatusText.className = "status-badge online";

      const res = JSON.parse(e.data);
      if (res && res.data) {
        const payload = res.data;
        updateUI(payload);
        
        if (payload.currentTrash && payload.currentTrash.type) {
          const trash = payload.currentTrash;
          addNewLog(trash.type, trash.moisture, trash.timestamp);
          syncRealtimeLogToDetailedTable(trash);
          checkMetalAlarm(trash.type);
        }
      }
    });

    // Partial updates
    eventSource.addEventListener('patch', (e) => {
      const res = JSON.parse(e.data);
      if (res && res.data) {
        fetchFullData();
      }
    });

    eventSource.onerror = (err) => {
      console.error("SSE EventSource error:", err);
      cloudStatusText.innerText = "Ngoại Tuyến";
      cloudStatusText.className = "status-badge offline";
    };

  } catch (error) {
    console.error("Error setting up connection:", error);
    cloudStatusText.innerText = "Lỗi kết nối";
    cloudStatusText.className = "status-badge offline";
  }
}

// Helper: Fetch Recent logs at startup
async function fetchRecentLogs() {
  try {
    const res = await fetch(`${dbUrl}/history_logs.json?orderBy="$key"&limitToLast=100`);
    const data = await res.json();
    if (data && !data.error) {
      const emptyState = quickLogsList.querySelector('.empty-state');
      if (emptyState) {
        quickLogsList.innerHTML = '';
      }

      const logsArray = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      
      // Sắp xếp rác thải mới nhất lên đầu cho loadedLogs
      logsArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      loadedLogs = [...logsArray];
      
      // Sắp xếp tăng dần theo thời gian để hiển thị đúng thứ tự khi thêm vào quickLogs (max 6 cái)
      const recentToOld = [...logsArray].slice(0, 6).reverse();
      recentToOld.forEach(log => {
        if (log && log.type) {
          addNewLog(log.type, log.moisture || 0, log.timestamp || Date.now());
        }
      });
    }
  } catch (err) {
    console.error("Lỗi khi tải lịch sử logs gần nhất từ Firebase:", err);
  }
}

// Helper: Fetch Full Data immediately on patches
async function fetchFullData() {
  try {
    const res = await fetch(`${dbUrl}/system_status.json`);
    const data = await res.json();
    if (data) {
      updateUI(data);
      if (data.currentTrash && data.currentTrash.type) {
        addNewLog(data.currentTrash.type, data.currentTrash.moisture, data.currentTrash.timestamp);
        syncRealtimeLogToDetailedTable(data.currentTrash);
        checkMetalAlarm(data.currentTrash.type);
      }
    }
  } catch (err) {
    console.error("Fetch full data error:", err);
  }
}


// ==========================================
// VOICE AI ASSISTANT FUNCTIONALITY
// ==========================================

let recognition = null;
let synth = window.speechSynthesis;
let currentUtterance = null;

function initVoiceAssistant() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Trình duyệt này không hỗ trợ Web Speech API.");
    if (btnVoiceAssistant) btnVoiceAssistant.style.display = 'none';
    return;
  }

  // Bind click handlers for the mode buttons to change AI mode
  if (btnModeDb && btnModeLlm) {
    btnModeDb.addEventListener('click', () => {
      aiMode = 'db';
      btnModeDb.classList.add('active');
      btnModeLlm.classList.remove('active');
      if (synth && synth.speaking) synth.cancel();
      speakResponse("Đã chuyển sang chế độ tra cứu thông tin thiết bị.");
    });
    btnModeLlm.addEventListener('click', () => {
      aiMode = 'llm';
      btnModeLlm.classList.add('active');
      btnModeDb.classList.remove('active');
      if (synth && synth.speaking) synth.cancel();
      speakResponse("Đã kích hoạt chế độ hỏi đáp tự do.");
    });
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'vi-VN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    voiceStatusText.innerText = "Đang lắng nghe...";
    voiceStatusText.className = "voice-status-text";
    userSpeechBubble.classList.add('hidden');
    aiResponseBubble.classList.add('hidden');
    
    const ring = document.querySelector('.pulse-ring');
    if (ring) {
      ring.style.animationPlayState = 'running';
      ring.style.display = 'block';
    }
  };

  recognition.onresult = async (event) => {
    const speechText = event.results[0][0].transcript;
    console.log("Người dùng nói:", speechText);

    userSpeechText.innerText = speechText;
    userSpeechBubble.classList.remove('hidden');

    voiceStatusText.innerText = "Đang phân tích...";
    voiceStatusText.className = "voice-status-text thinking";
    
    const ring = document.querySelector('.pulse-ring');
    if (ring) ring.style.animationPlayState = 'paused';

    await processVoiceQueryWithAI(speechText);
  };

  recognition.onerror = (event) => {
    console.error("Lỗi Speech Recognition:", event.error);
    voiceStatusText.innerText = "Lỗi nhận diện. Đang thử lại...";
    const ring = document.querySelector('.pulse-ring');
    if (ring) ring.style.animationPlayState = 'paused';

    // Tự động khởi động lại khi gặp lỗi nếu overlay còn mở
    if (voiceOverlay && !voiceOverlay.classList.contains('hidden')) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {
          console.warn("Lỗi tự động khởi động lại sau lỗi:", e);
        }
      }, 1000);
    }
  };

  recognition.onend = () => {
    const ring = document.querySelector('.pulse-ring');
    if (ring && voiceStatusText.innerText === "Đang lắng nghe...") {
      ring.style.animationPlayState = 'paused';
      voiceStatusText.innerText = "Đã dừng nghe.";
    }

    // Nếu dừng tự nhiên (như im lặng quá lâu - no-speech) và overlay vẫn mở, tự động nghe lại
    const isAnalyzingOrSpeaking = voiceStatusText.innerText === "Đang phân tích..." || 
                                  voiceStatusText.innerText === "Đang trả lời..." || 
                                  voiceStatusText.className.includes("speaking") ||
                                  voiceStatusText.className.includes("thinking") ||
                                  (synth && synth.speaking);
                                  
    if (voiceOverlay && !voiceOverlay.classList.contains('hidden') && !isAnalyzingOrSpeaking) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {
          console.warn("Lỗi tự động nghe lại từ onend:", e);
        }
      }, 500);
    }
  };

  if (btnVoiceAssistant) {
    btnVoiceAssistant.addEventListener('click', () => {
      voiceOverlay.classList.remove('hidden');
      
      if (synth && synth.speaking) {
        synth.cancel();
      }

      try {
        recognition.start();
      } catch (e) {
        console.warn("Speech recognition is already running:", e);
      }
    });
  }

  if (btnCloseVoice) {
    btnCloseVoice.addEventListener('click', () => {
      voiceOverlay.classList.add('hidden');
      if (recognition) {
        try { recognition.stop(); } catch(e) {}
      }
      if (synth) {
        synth.cancel();
      }
    });
  }
}

async function processVoiceQueryWithAI(userQuestion) {
  if (aiMode === 'llm') {
    await queryOpenRouterLLM(userQuestion);
    return;
  }

  const q = userQuestion.toLowerCase().trim();
  
  const moisture = currentMoistureEl ? parseInt(currentMoistureEl.innerText) || 0 : 0;
  const dryCount = dryCountEl ? parseInt(dryCountEl.innerText) || 0 : 0;
  const wetCount = wetCountEl ? parseInt(wetCountEl.innerText) || 0 : 0;
  const metalCount = metalCountEl ? parseInt(metalCountEl.innerText) || 0 : 0;
  const totalCount = dryCount + wetCount + metalCount;
  
  let aiText = "";
  
  const getVietnameseType = (type) => {
    if (type === 'dry') return 'Rác khô';
    if (type === 'wet') return 'Rác ướt';
    if (type === 'metal') return 'Kim loại';
    return 'Không xác định';
  };
  
  if (q.includes("khô")) {
    aiText = `Tổng số lượng rác khô hiện có là ${dryCount} túi.`;
  } else if (q.includes("ướt") || q.includes("ước")) {
    aiText = `Tổng số lượng rác ướt hiện có là ${wetCount} túi.`;
  } else if (q.includes("kim loại") || q.includes("kim") || (q.includes("loại") && !q.includes("phân loại") && !q.includes("loại rác"))) {
    aiText = `Tổng số lượng rác kim loại phát hiện hiện có là ${metalCount} lần.`;
  } else if (q.includes("tổng") || q.includes("tất cả") || q.includes("đã phân loại") || q.includes("tăng") || q.includes("tấm") || q.includes("tầm") || q.includes("thông")) {
    aiText = `Tổng lượng rác thải đã phân loại là ${totalCount} túi.`;
  } else if (q.includes("độ") || q.includes("ẩm") || q.includes("đồ")) {
    let moistureStatus = "khô ráo";
    if (moisture > 50) moistureStatus = "ẩm ướt cao";
    else if (moisture > 20) moistureStatus = "hơi ẩm";
    aiText = `Độ ẩm gần nhất đo được là ${moisture} phần trăm, trạng thái ${moistureStatus}.`;
  } else if (q.includes("tỷ") || q.includes("tỉ") || q.includes("lệ") || q.includes("thành") || q.includes("phần") || q.includes("phân phối") || q.includes("phần trăm") || q.includes("phần trăn") || q.includes("tỉ số") || q.includes("tỷ số")) {
    if (totalCount === 0) {
      aiText = "Chưa có rác phân loại để tính tỉ lệ phân phối.";
    } else {
      const pDry = ((dryCount / totalCount) * 100).toFixed(0);
      const pWet = ((wetCount / totalCount) * 100).toFixed(0);
      const pMetal = ((metalCount / totalCount) * 100).toFixed(0);
      aiText = `Tỉ lệ phân phối hiện tại là: Rác khô chiếm ${pDry} phần trăm, rác ướt chiếm ${pWet} phần trăm, và rác kim loại chiếm ${pMetal} phần trăm.`;
    }
  } else if (q.includes("thứ 2") || q.includes("thứ hai")) {
    if (loadedLogs && loadedLogs.length > 1) {
      const log = loadedLogs[1];
      const timeStr = new Date(log.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      aiText = `Thông tin rác thải gần thứ hai là ${getVietnameseType(log.type)} với độ ẩm là ${log.moisture || 0} phần trăm, được phân loại lúc ${timeStr}.`;
    } else {
      aiText = "Chưa có đủ lịch sử rác thải gần thứ hai.";
    }
  } else if (q.includes("thứ 3") || q.includes("thứ ba")) {
    if (loadedLogs && loadedLogs.length > 2) {
      const log = loadedLogs[2];
      const timeStr = new Date(log.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      aiText = `Thông tin rác thải gần thứ ba là ${getVietnameseType(log.type)} với độ ẩm là ${log.moisture || 0} phần trăm, lúc ${timeStr}.`;
    } else {
      aiText = "Chưa có đủ dữ liệu rác thải gần thứ ba.";
    }
  } else if (q.includes("thứ 4") || q.includes("thứ tư")) {
    if (loadedLogs && loadedLogs.length > 3) {
      const log = loadedLogs[3];
      const timeStr = new Date(log.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      aiText = `Thông tin rác thải gần thứ tư là ${getVietnameseType(log.type)} với độ ẩm là ${log.moisture || 0} phần trăm, lúc ${timeStr}.`;
    } else {
      aiText = "Chưa có đủ dữ liệu rác thải gần thứ tư.";
    }
  } else if (q.includes("thứ 5") || q.includes("thứ năm")) {
    if (loadedLogs && loadedLogs.length > 4) {
      const log = loadedLogs[4];
      const timeStr = new Date(log.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      aiText = `Thông tin rác thải gần thứ năm là ${getVietnameseType(log.type)} với độ ẩm là ${log.moisture || 0} phần trăm, lúc ${timeStr}.`;
    } else {
      aiText = "Chưa có đủ dữ liệu rác thải gần thứ năm.";
    }
  } else if (q.includes("gần") || q.includes("nhất") || q.includes("mới") || q.includes("thứ 1") || q.includes("vừa") || q.includes("gần đây")) {
    if (loadedLogs && loadedLogs.length > 0) {
      const itemsToRead = loadedLogs.slice(0, 3);
      const logDescriptions = itemsToRead.map((log, index) => {
        const timeStr = new Date(log.timestamp || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const orderName = index === 0 ? "nhất" : (index === 1 ? "thứ hai" : "thứ ba");
        return `lần gần ${orderName} là ${getVietnameseType(log.type)} với độ ẩm ${log.moisture || 0} phần trăm lúc ${timeStr}`;
      });
      aiText = `Thông tin 3 lần phân loại gần đây là: ${logDescriptions.join("; và ")}.`;
    } else {
      aiText = "Chưa ghi nhận đủ thông tin rác thải gần đây.";
    }
  } else {
    aiText = "Tôi có thể báo cáo về rác khô, rác ướt, kim loại, độ ẩm, hoặc thông tin các lần phân loại gần nhất. Bạn muốn hỏi gì?";
  }

  aiResponseText.innerText = aiText;
  aiResponseBubble.classList.remove('hidden');

  voiceStatusText.innerText = "Đang trả lời...";
  voiceStatusText.className = "voice-status-text speaking";

  speakResponse(aiText);
}

// ==========================================
// LOCAL RAG RETRIEVAL ENGINE & LLM INTEGRATION
// ==========================================

let ragKnowledgeBase = null;

async function loadRAGKnowledgeBase() {
  if (ragKnowledgeBase) return ragKnowledgeBase;
  try {
    const res = await fetch(`${dbUrl}/rag_knowledge_base.json`);
    if (res.ok) {
      ragKnowledgeBase = await res.json();
      console.log("Đã nạp cơ sở dữ liệu tri thức RAG gồm 99 bài viết từ Firebase.");
      return ragKnowledgeBase;
    } else {
      console.error("Không thể lấy dữ liệu RAG từ Firebase, mã lỗi:", res.status);
      return [];
    }
  } catch (e) {
    console.error("Lỗi nạp rag_knowledge_base từ Firebase:", e);
    return [];
  }
}

function retrieveRelevantArticles(userQuestion, articles, limit = 2) {
  const queryWords = userQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return [];

  const scored = articles.map(art => {
    let score = 0;
    const titleLower = art.title.toLowerCase();
    const contentLower = art.content.toLowerCase();
    
    queryWords.forEach(word => {
      if (titleLower.includes(word)) score += 3;
      if (contentLower.includes(word)) score += 1;
    });
    
    return { ...art, score };
  });

  return scored
    .filter(art => art.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Hàm gửi câu hỏi tự do lên OpenRouter API sử dụng mô hình owl-alpha kết hợp công nghệ RAG
async function queryOpenRouterLLM(userQuestion) {
  try {
    // 1. Tải RAG Knowledge Base chứa 99 bài viết từ nguồn JSON
    const articles = await loadRAGKnowledgeBase();
    
    // 2. Tìm kiếm các tài liệu liên quan thông qua từ khóa (RAG Retrieval)
    const matchedArticles = retrieveRelevantArticles(userQuestion, articles, 2);
    
    let ragKnowledgeStr = "Không tìm thấy tài liệu cụ thể phù hợp trong cơ sở kiến thức.";
    if (matchedArticles.length > 0) {
      ragKnowledgeStr = matchedArticles.map(art => `* TIÊU ĐỀ: ${art.title}\n  NỘI DUNG: ${art.content}`).join('\n\n');
    }

    // 3. Trích xuất chỉ số IoT thực tế để làm giàu ngữ cảnh (RAG IoT Enrichment)
    const moisture = currentMoistureEl ? parseInt(currentMoistureEl.innerText) || 0 : 0;
    const dryCount = dryCountEl ? parseInt(dryCountEl.innerText) || 0 : 0;
    const wetCount = wetCountEl ? parseInt(wetCountEl.innerText) || 0 : 0;
    const metalCount = metalCountEl ? parseInt(metalCountEl.innerText) || 0 : 0;
    const totalCount = dryCount + wetCount + metalCount;

    let recentLogsStr = "Chưa có hoạt động phân loại gần đây.";
    if (loadedLogs && loadedLogs.length > 0) {
      recentLogsStr = loadedLogs.slice(0, 3).map((log, idx) => {
        const typeMap = { 'dry': 'Rác khô', 'wet': 'Rác ướt', 'metal': 'Kim loại' };
        const order = idx === 0 ? "gần nhất" : (idx === 1 ? "thứ hai" : "thứ ba");
        return `- Lần phân loại ${order}: ${typeMap[log.type] || 'Không xác định'} (Độ ẩm: ${log.moisture || 0}%)`;
      }).join('\n');
    }

    // 4. Lắp ráp RAG System Prompt chứa toàn bộ dữ liệu IoT + Tri thức môi trường từ Firebase
    const promptRes = await fetch(`${dbUrl}/system_prompt.json`);
    if (!promptRes.ok) {
      throw new Error(`Không thể lấy system_prompt từ Firebase. Mã lỗi: ${promptRes.status}`);
    }
    const systemPromptTemplate = await promptRes.json();
    if (!systemPromptTemplate || typeof systemPromptTemplate !== 'string') {
      throw new Error("Dữ liệu system_prompt tải từ Firebase không hợp lệ.");
    }

    const systemPrompt = systemPromptTemplate
      .replace(/{dryCount}/g, dryCount)
      .replace(/{wetCount}/g, wetCount)
      .replace(/{metalCount}/g, metalCount)
      .replace(/{totalCount}/g, totalCount)
      .replace(/{moisture}/g, moisture)
      .replace(/{recentLogsStr}/g, recentLogsStr)
      .replace(/{ragKnowledgeStr}/g, ragKnowledgeStr);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userQuestion
          }
        ]
      })
    });

    const data = await response.json();
    let aiText = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
      aiText = data.choices[0].message.content.trim();
    } else {
      aiText = 'Xin lỗi, tôi gặp sự cố kết nối với hệ thống trí tuệ nhân tạo.';
    }

    aiResponseText.innerText = aiText;
    aiResponseBubble.classList.remove('hidden');

    voiceStatusText.innerText = "Đang trả lời...";
    voiceStatusText.className = "voice-status-text speaking";

    speakResponse(aiText);
  } catch (error) {
    console.error("Lỗi OpenRouter API:", error);
    const errText = "Không thể kết nối với dịch vụ hỏi đáp tự do. Vui lòng kiểm tra mạng.";
    aiResponseText.innerText = errText;
    aiResponseBubble.classList.remove('hidden');
    voiceStatusText.innerText = "Lỗi kết nối!";
    voiceStatusText.className = "voice-status-text";
    speakResponse(errText);
  }
}

function speakResponse(text) {
  if (!synth) return;

  if (synth.speaking) {
    synth.cancel();
  }

  currentUtterance = new SpeechSynthesisUtterance(text);
  
  const voices = synth.getVoices();
  const vietnameseVoice = voices.find(voice => voice.lang.includes('vi-VN'));
  if (vietnameseVoice) {
    currentUtterance.voice = vietnameseVoice;
  }

  currentUtterance.rate = 1.05;
  currentUtterance.pitch = 1.0;

  currentUtterance.onend = () => {
    voiceStatusText.innerText = "Trợ lý ảo sẵn sàng!";
    voiceStatusText.className = "voice-status-text";
    const ring = document.querySelector('.pulse-ring');
    if (ring) ring.style.animationPlayState = 'paused';

    // Trò chuyện liên tục: Nếu ô Trợ lý đang mở, tự động nghe lại sau khi trả lời xong
    if (voiceOverlay && !voiceOverlay.classList.contains('hidden') && recognition) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {
          console.warn("Lỗi tự động nghe lại:", e);
        }
      }, 600); // Trễ 600ms để tránh nhận diện nhầm âm thanh phản hồi cuối cùng
    }
  };

  currentUtterance.onerror = (e) => {
    console.error("Lỗi SpeechSynthesis:", e);
    voiceStatusText.innerText = "Trợ lý ảo sẵn sàng!";
    voiceStatusText.className = "voice-status-text";
  };

  synth.speak(currentUtterance);
}

// Main Window Startup Initialization
window.addEventListener('DOMContentLoaded', () => {
  initChart();
  connectToFirebase();
  initVoiceAssistant();
});
