import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  push,
  get,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔥 FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAxqkp6klBJtGJyF6XMAxEzCyVwwy84B_w",
  authDomain: "door-watcher.firebaseapp.com",
  databaseURL:
    "https://door-watcher-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "door-watcher",
};

// 🔥 GOOGLE SCRIPT URL
const scriptURL =
  "https://script.google.com/macros/s/AKfycbxt6Pmj65oBojiiD1r7ADnDHgHJDBI2BC640ThrXyGCWCTJonVmeJxLsr-AR_NYrSUF/exec";

// 🌦️ WETTER API
const apiKey = "f4254125e68a1402e44bf932d8939722";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// LOGIN
window.login = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then(() => {
      document.getElementById("login").style.display = "none";
      document.getElementById("nav").style.display = "block";

      showTab("dashboard");
      loadData();
      loadWeather();
    })
    .catch((e) => alert(e.message));
};

// TABS
window.showTab = function (tab) {
  document.querySelectorAll(".tab").forEach((t) => (t.style.display = "none"));
  document.getElementById(tab).style.display = "block";

  if (tab === "med") {
    loadMed();
  }
};

// LIVE DATEN
function loadData() {
  onValue(ref(db, "live"), (snap) => {
    const d = snap.val() || {};

    document.getElementById("temp").innerText = d.temp || "-";
    document.getElementById("hum").innerText = d.humidity || "-";
    document.getElementById("klima").innerText = d.klima || "-";
    document.getElementById("motion").innerText = d.motion ? "JA" : "NEIN";
  });
}

// WETTER
async function loadWeather() {
  try {
    // Koordinaten für Bischheim RLP
    const lat = 49.766;
    const lon = 8.083;

    // aktuelle Daten
    const currentRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=de&appid=${apiKey}`,
    );

    const current = await currentRes.json();

    const tempNow = current.main.temp;

    document.getElementById("wTemp").innerText = tempNow.toFixed(1);
    document.getElementById("wDesc").innerText = current.weather[0].description;

    // Forecast (3h Schritte)
    const forecastRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=de&appid=${apiKey}`,
    );

    const forecast = await forecastRes.json();

    // 👉 finde morgen ca. 06–09 Uhr
    let morningTemp = null;

    for (let entry of forecast.list) {
      const date = new Date(entry.dt_txt);
      const hour = date.getHours();

      if (hour >= 6 && hour <= 9) {
        morningTemp = entry.main.temp;
        break;
      }
    }

    document.getElementById("wTempMorning").innerText = morningTemp
      ? morningTemp.toFixed(1)
      : "-";

    // 🧥 JACKEN LOGIK
    let text = "";

    if (tempNow < 6) {
      text += "❄️ Jetzt unter 6°C – Chico Jacke anziehen!\n";
    }

    if (morningTemp !== null && morningTemp < 6) {
      text += "🌅 Morgen früh unter 6°C – Chico Jacke!";
    }

    document.getElementById("jackeHinweis").innerText = text;
  } catch (e) {
    console.log("Wetter Fehler:", e);
  }
}

// 🐕 GASSI
let start = null;
let timer = null;

window.startGassi = function () {
  start = Date.now();

  timer = setInterval(() => {
    document.getElementById("gassiTime").innerText = Math.floor(
      (Date.now() - start) / 60000,
    );
  }, 1000);
};

window.logGassi = function (type) {
  push(ref(db, "gassi/logs"), {
    type: type,
    time: new Date().toISOString(),
  });
};

window.endGassi = async function () {
  clearInterval(timer);

  const duration = Math.floor((Date.now() - start) / 60000);

  const data = {
    date: new Date().toLocaleDateString(),
    start: new Date(start).toLocaleTimeString(),
    end: new Date().toLocaleTimeString(),
    duration,
  };

  // Firebase speichern
  push(ref(db, "gassi/sessions"), data);

  // Google Drive senden
  try {
    await fetch(scriptURL, {
      method: "POST",
      body: JSON.stringify(data),
    });

    alert("Gespeichert + Drive Upload ✅");
  } catch (e) {
    alert("Drive Fehler ❌");
    console.log(e);
  }
};

// CSV EXPORT
window.exportCSV = async function () {
  const snap = await get(ref(db, "gassi/sessions"));
  const data = snap.val();

  let csv = "Start,Ende,Dauer\n";

  Object.values(data || {}).forEach((s) => {
    csv += `${s.start},${s.end},${s.duration}\n`;
  });

  const blob = new Blob([csv]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gassi.csv";
  a.click();
};

// 📊 STATISTIK
window.loadStats = async function () {
  const snap = await get(ref(db, "gassi/sessions"));
  const data = snap.val();
  if (!data) return;

  const sessions = Object.values(data);

  let days = {};

  sessions.forEach((s) => {
    const d = new Date(s.start).toLocaleDateString();

    if (!days[d]) days[d] = { count: 0, duration: 0 };

    days[d].count++;
    days[d].duration += s.duration;
  });

  // TEXT
  let out = "";
  Object.keys(days).forEach((d) => {
    out += `${d} → ${days[d].count}x (${days[d].duration}min)\n`;
  });

  document.getElementById("monthStats").innerText = out;

  // AVG
  const avg = (
    sessions.reduce((a, b) => a + b.duration, 0) / sessions.length
  ).toFixed(1);

  document.getElementById("avgStats").innerText = `Ø Dauer: ${avg} min`;

  // CHART
  const ctx = document.getElementById("chart");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(days),
      datasets: [
        {
          label: "Minuten",
          data: Object.values(days).map((d) => d.duration),
        },
      ],
    },
  });

  // 💩 Analyse
  const logSnap = await get(ref(db, "gassi/logs"));
  const logs = logSnap.val();

  let hours = [];

  Object.values(logs || {}).forEach((l) => {
    if (l.type === "kaka") {
      hours.push(new Date(l.time).getHours());
    }
  });

  if (hours.length) {
    const avgH = hours.reduce((a, b) => a + b, 0) / hours.length;

    document.getElementById("avgStats").innerText +=
      ` | 💩 Ø ${avgH.toFixed(1)} Uhr`;
  }
  }; // ← ENDE loadStats()

// 🔥 SPLASH SCREEN (JETZT RICHTIG)
window.addEventListener("load", () => {
  const splash = document.getElementById("splash");

  if (!splash) return;

  setTimeout(() => {
    splash.style.opacity = "0";

    setTimeout(() => {
      splash.style.display = "none";
    }, 500);

  }, 2000);
});

// 💊 MED SYSTEM (NEU)
const medTimes = [8, 11, 15, 18];

// Daten holen
function getMedStatus() {
  const today = new Date().toDateString();
  const data = JSON.parse(localStorage.getItem("med") || "{}");

  if (data.date !== today) {
    return { date: today, done: {} };
  }

  return data;
}

// speichern
function saveMedStatus(data) {
  localStorage.setItem("med", JSON.stringify(data));
}

// nächste offene Zeit
function getNextMedTime(data) {
  const now = new Date();
  const currentHour = now.getHours();

  for (let h of medTimes) {
    if (!data.done[h] && h >= currentHour) {
      return h;
    }
  }

  return null;
}

// ➕ Button
window.takeNextMed = function () {
  let data = getMedStatus();

  const next = getNextMedTime(data);

  if (next !== null) {
    data.done[next] = true;
    saveMedStatus(data);
    loadMed();
  }
};

// UI
window.loadMed = function () {
  const container = document.getElementById("medList");
  container.innerHTML = "";

  let data = getMedStatus();

  let takenCount = Object.keys(data.done).length;

  // STATUS
  document.getElementById("medStatus").innerText =
    `Heute: ${takenCount} / 4 genommen`;

  // NEXT
  const next = getNextMedTime(data);

  if (next !== null) {
    const now = new Date();
    const target = new Date();
    target.setHours(next, 0, 0, 0);

    let diff = Math.floor((target - now) / 60000);
    if (diff < 0) diff = 0;

    const h = Math.floor(diff / 60);
    const m = diff % 60;

    document.getElementById("medNext").innerText =
      `Nächste Einnahme: ${next}:00 Uhr (in ${h}h ${m}min)`;
  } else {
    document.getElementById("medNext").innerText =
      "✅ Alles genommen!";
  }

  // Liste
  medTimes.forEach((h) => {
    const done = data.done[h];

    const div = document.createElement("div");
    div.innerHTML = `<p>${h}:00 → ${done ? "✅" : "❌"}</p>`;
    container.appendChild(div);
  });
};

// 🔄 Auto Update
setInterval(() => {
  const medTab = document.getElementById("med");

  if (medTab && medTab.style.display !== "none") {
    loadMed();
  }
}, 30000);






