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
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 🔥 HIER EINTRAGEN
const firebaseConfig = {
  apiKey: "AIzaSyAxqkp6klBJtGJyF6XMAxEzCyVwwy84B_w",
  authDomain: "door-watcher.firebaseapp.com",
  databaseURL:
    "https://door-watcher-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "door-watcher",
};

const scriptURL =
  "https://script.google.com/macros/s/AKfycbxt6Pmj65oBojiiD1r7ADnDHgHJDBI2BC640ThrXyGCWCTJonVmeJxLsr-AR_NYrSUF/exec";
const apiKey = "f4254125e68a1402e44bf932d8939722";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// LOGIN
window.login = function () {
  signInWithEmailAndPassword(
    auth,
    document.getElementById("email").value,
    document.getElementById("password").value,
  )
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
};

// LIVE DATEN
function loadData() {
  onValue(ref(db, "live"), (snap) => {
    const d = snap.val() || {};
    temp.innerText = d.temp || "-";
    hum.innerText = d.humidity || "-";
    klima.innerText = d.klima || "-";
    motion.innerText = d.motion ? "JA" : "NEIN";
  });
}

// PWM
window.setPWM = function (val) {
  pwmValue.innerText = val;

  const icon = document.getElementById("pwmIcon");
  if (icon) {
    icon.style.filter = `brightness(${0.5 + val / 255})`;
    icon.style.boxShadow = `0 0 ${val / 10}px yellow`;
  }

  set(ref(db, "control/pwm"), Number(val));
};

// WETTER
async function loadWeather() {
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=Frankfurt&units=metric&appid=${apiKey}`,
  );
  const data = await res.json();

  const t = data.main.temp;
  wTemp.innerText = t.toFixed(1);
  wDesc.innerText = data.weather[0].description;

  jackeHinweis.innerText = t < 6 ? "❄️ Unter 6°C – Chico Jacke!" : "";
}

// GASSI
let start, timer;

window.startGassi = function () {
  start = Date.now();
  timer = setInterval(() => {
    gassiTime.innerText = Math.floor((Date.now() - start) / 60000);
  }, 1000);
};

window.logGassi = function (type) {
  push(ref(db, "gassi/logs"), {
    type,
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

  push(ref(db, "gassi/sessions"), data);

  await fetch(scriptURL, {
    method: "POST",
    body: JSON.stringify(data),
  });

  alert("Gespeichert ✅");
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
  monthStats.innerText = out;

  // AVG
  const avg = (
    sessions.reduce((a, b) => a + b.duration, 0) / sessions.length
  ).toFixed(1);
  avgStats.innerText = `Ø Dauer: ${avg} min`;

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
    avgStats.innerText += ` | 💩 Ø ${avgH.toFixed(1)} Uhr`;
  }
};
