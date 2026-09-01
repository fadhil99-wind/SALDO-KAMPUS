/* ==========================================================
   SaldoKampus — script.js
   Semua logika aplikasi: LocalStorage, CRUD transaksi,
   dashboard, filter, laporan, budget, insight, export Excel.
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Konstanta ---------- */
  const STORAGE_KEY = "saldokampus_transactions";
  const BUDGET_KEY = "saldokampus_budget"; // { "2026-08": 2000000 }

  const KATEGORI_PEMASUKAN = [
    "Uang Saku", "Kiriman Orang Tua", "Beasiswa", "Part Time", "Jualan", "Lainnya"
  ];
  const KATEGORI_PENGELUARAN = [
    "Makan", "Transportasi", "Kuliah", "Kos", "Belanja", "Nongkrong",
    "Hiburan", "Pulsa & Internet", "Lainnya"
  ];

  /* ---------- State ---------- */
  let transactions = loadTransactions();
  let currentJenisInModal = "pemasukan";
  let lastReport = null; // simpan hasil laporan terakhir untuk export

  /* ---------- Util ---------- */
  function uid() {
    return "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function formatRupiah(num) {
    const n = Math.round(Number(num) || 0);
    return "Rp" + n.toLocaleString("id-ID");
  }

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function formatTanggalTampil(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function monthKeyOf(iso) {
    return iso.slice(0, 7); // "YYYY-MM"
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- Storage ---------- */
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Gagal membaca data:", e);
      return [];
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function loadBudgets() {
    try {
      const raw = localStorage.getItem(BUDGET_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveBudgets(obj) {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(obj));
  }

  /* ==========================================================
     NAVIGASI TAB
     ========================================================== */
  function switchView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + viewName).classList.add("active");
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });
    if (viewName === "transaksi") renderTransactionTable();
    if (viewName === "budget") renderBudgetView();
    if (viewName === "dashboard") renderDashboard();
  }

  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  document.querySelectorAll("[data-goto]").forEach(el => {
    el.addEventListener("click", () => switchView(el.dataset.goto));
  });

  /* ==========================================================
     MODAL TAMBAH / EDIT TRANSAKSI
     ========================================================== */
  const modalOverlay = document.getElementById("modalOverlay");
  const txForm = document.getElementById("txForm");
  const txKategoriSelect = document.getElementById("txKategori");

  function populateKategoriOptions(jenis, selectEl, includeAll) {
    selectEl.innerHTML = "";
    if (includeAll) {
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "Semua Kategori";
      selectEl.appendChild(optAll);
    }
    const list = jenis === "pemasukan" ? KATEGORI_PEMASUKAN : KATEGORI_PENGELUARAN;
    list.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      selectEl.appendChild(opt);
    });
  }

  function setModalJenis(jenis) {
    currentJenisInModal = jenis;
    document.getElementById("jenisIn").classList.toggle("active", jenis === "pemasukan");
    document.getElementById("jenisOut").classList.toggle("active", jenis === "pengeluaran");
    populateKategoriOptions(jenis, txKategoriSelect, false);
  }

  document.getElementById("jenisIn").addEventListener("click", () => setModalJenis("pemasukan"));
  document.getElementById("jenisOut").addEventListener("click", () => setModalJenis("pengeluaran"));

  function openModal(editTx) {
    document.getElementById("modalTitle").textContent = editTx ? "Edit Transaksi" : "Tambah Transaksi";
    document.getElementById("txId").value = editTx ? editTx.id : "";
    setModalJenis(editTx ? editTx.jenis : "pemasukan");
    document.getElementById("txNominal").value = editTx ? editTx.nominal : "";
    document.getElementById("txKeterangan").value = editTx ? editTx.keterangan : "";
    document.getElementById("txTanggal").value = editTx ? editTx.tanggal : todayISO();
    if (editTx) txKategoriSelect.value = editTx.kategori;
    modalOverlay.classList.add("open");
  }

  function closeModal() {
    modalOverlay.classList.remove("open");
    txForm.reset();
  }

  document.getElementById("openAddModalTop").addEventListener("click", () => openModal(null));
  document.getElementById("openAddModalMid").addEventListener("click", () => openModal(null));
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

  txForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("txId").value;
    const nominal = Number(document.getElementById("txNominal").value);
    const kategori = txKategoriSelect.value;
    const keterangan = document.getElementById("txKeterangan").value.trim();
    const tanggal = document.getElementById("txTanggal").value;

    if (!nominal || nominal <= 0) { showToast("Nominal harus lebih dari 0"); return; }
    if (!keterangan) { showToast("Keterangan tidak boleh kosong"); return; }
    if (!tanggal) { showToast("Tanggal wajib diisi"); return; }

    if (id) {
      const idx = transactions.findIndex(t => t.id === id);
      if (idx !== -1) {
        transactions[idx] = { ...transactions[idx], jenis: currentJenisInModal, nominal, kategori, keterangan, tanggal };
      }
      showToast("Transaksi berhasil diperbarui ✓");
    } else {
      transactions.push({
        id: uid(),
        jenis: currentJenisInModal,
        nominal, kategori, keterangan, tanggal,
        createdAt: Date.now()
      });
      showToast("Transaksi berhasil disimpan ✓");
    }

    saveTransactions();
    closeModal();
    renderAll();
  });

  /* ==========================================================
     RIWAYAT TRANSAKSI — tabel, filter, search
     ========================================================== */
  const searchInput = document.getElementById("searchInput");
  const filterJenis = document.getElementById("filterJenis");
  const filterKategori = document.getElementById("filterKategori");
  const filterTanggal = document.getElementById("filterTanggal");

  function refreshFilterKategoriOptions() {
    const jenis = filterJenis.value;
    filterKategori.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Semua Kategori";
    filterKategori.appendChild(optAll);

    let list;
    if (jenis === "pemasukan") list = KATEGORI_PEMASUKAN;
    else if (jenis === "pengeluaran") list = KATEGORI_PENGELUARAN;
    else list = [...new Set([...KATEGORI_PEMASUKAN, ...KATEGORI_PENGELUARAN])];

    list.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      filterKategori.appendChild(opt);
    });
  }

  function getFilteredTransactions() {
    const q = searchInput.value.trim().toLowerCase();
    const jenis = filterJenis.value;
    const kategori = filterKategori.value;
    const tanggal = filterTanggal.value;

    return transactions
      .filter(t => !q || t.keterangan.toLowerCase().includes(q))
      .filter(t => !jenis || t.jenis === jenis)
      .filter(t => !kategori || t.kategori === kategori)
      .filter(t => !tanggal || t.tanggal === tanggal)
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : b.createdAt - a.createdAt));
  }

  function renderTransactionTable() {
    const list = getFilteredTransactions();
    const tbody = document.getElementById("txTableBody");
    const emptyState = document.getElementById("txEmptyState");
    tbody.innerHTML = "";

    if (list.length === 0) {
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
    }

    list.forEach((t, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${formatTanggalTampil(t.tanggal)}</td>
        <td>${escapeHtml(t.keterangan)}</td>
        <td>${escapeHtml(t.kategori)}</td>
        <td><span class="badge ${t.jenis}">${t.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran"}</span></td>
        <td class="amount-pos">${t.jenis === "pemasukan" ? formatRupiah(t.nominal) : "-"}</td>
        <td class="amount-neg">${t.jenis === "pengeluaran" ? formatRupiah(t.nominal) : "-"}</td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-edit="${t.id}" title="Edit">✏️</button>
            <button class="icon-btn" data-del="${t.id}" title="Hapus">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("txTableBody").addEventListener("click", (e) => {
    const editId = e.target.closest("[data-edit]")?.dataset.edit;
    const delId = e.target.closest("[data-del]")?.dataset.del;
    if (editId) {
      const tx = transactions.find(t => t.id === editId);
      if (tx) openModal(tx);
    }
    if (delId) {
      if (confirm("Hapus transaksi ini?")) {
        transactions = transactions.filter(t => t.id !== delId);
        saveTransactions();
        renderAll();
        showToast("Transaksi dihapus");
      }
    }
  });

  [searchInput, filterJenis, filterKategori, filterTanggal].forEach(el => {
    el.addEventListener("input", () => {
      if (el === filterJenis) refreshFilterKategoriOptions();
      renderTransactionTable();
    });
  });

  document.getElementById("resetFilterBtn").addEventListener("click", () => {
    searchInput.value = "";
    filterJenis.value = "";
    filterTanggal.value = "";
    refreshFilterKategoriOptions();
    renderTransactionTable();
  });

  /* ==========================================================
     DASHBOARD
     ========================================================== */
  function renderDashboard() {
    const totalIncome = transactions.filter(t => t.jenis === "pemasukan").reduce((s, t) => s + t.nominal, 0);
    const totalExpense = transactions.filter(t => t.jenis === "pengeluaran").reduce((s, t) => s + t.nominal, 0);
    const saldo = totalIncome - totalExpense;
    const today = todayISO();
    const todayExpense = transactions
      .filter(t => t.jenis === "pengeluaran" && t.tanggal === today)
      .reduce((s, t) => s + t.nominal, 0);

    document.getElementById("statSaldo").textContent = formatRupiah(saldo);
    document.getElementById("statIncome").textContent = formatRupiah(totalIncome);
    document.getElementById("statExpense").textContent = formatRupiah(totalExpense);
    document.getElementById("statToday").textContent = formatRupiah(todayExpense);

    document.getElementById("saldoSub").textContent =
      transactions.length === 0
        ? "Belum ada transaksi tercatat"
        : `Dari ${transactions.length} transaksi tercatat`;

    const now = new Date();
    document.getElementById("lastUpdated").textContent =
      now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    renderRecentList();
    renderInsights(totalIncome, totalExpense);
  }

  function renderRecentList() {
    const wrap = document.getElementById("recentList");
    const list = [...transactions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    if (list.length === 0) {
      wrap.innerHTML = `<p class="empty-state">Belum ada transaksi. Yuk catat pengeluaran atau pemasukan pertamamu!</p>`;
      return;
    }

    wrap.innerHTML = list.map(t => `
      <div class="recent-item">
        <div class="recent-meta">
          <p class="r-title">${escapeHtml(t.keterangan)}</p>
          <p class="r-sub">${t.kategori} • ${formatTanggalTampil(t.tanggal)}</p>
        </div>
        <div class="recent-amount ${t.jenis === "pemasukan" ? "pos" : "neg"}">
          ${t.jenis === "pemasukan" ? "+" : "-"}${formatRupiah(t.nominal)}
        </div>
      </div>
    `).join("");
  }

  /* ==========================================================
     FINANCIAL INSIGHT
     ========================================================== */
  function renderInsights(totalIncome, totalExpense) {
    const wrap = document.getElementById("insightList");
    const insights = [];

    if (transactions.length === 0) {
      wrap.innerHTML = `<div class="insight-item">Mulai catat transaksi pertamamu supaya insight keuangan bisa muncul di sini 💡</div>`;
      return;
    }

    // Kategori pengeluaran terbesar bulan ini
    const nowMonth = monthKeyOf(todayISO());
    const monthExpenses = transactions.filter(t => t.jenis === "pengeluaran" && monthKeyOf(t.tanggal) === nowMonth);
    if (monthExpenses.length > 0) {
      const byKategori = {};
      monthExpenses.forEach(t => { byKategori[t.kategori] = (byKategori[t.kategori] || 0) + t.nominal; });
      const top = Object.entries(byKategori).sort((a, b) => b[1] - a[1])[0];
      insights.push(`💡 Pengeluaran terbesar kamu bulan ini adalah kategori <strong>${top[0]}</strong> (${formatRupiah(top[1])}).`);
    }

    // Budget usage
    const budgets = loadBudgets();
    const budgetThisMonth = budgets[nowMonth];
    if (budgetThisMonth) {
      const used = monthExpenses.reduce((s, t) => s + t.nominal, 0);
      const pct = Math.round((used / budgetThisMonth) * 100);
      insights.push(`💡 Kamu sudah menggunakan <strong>${pct}%</strong> dari budget bulan ini.`);
    }

    // Perbandingan minggu ini vs minggu lalu
    const weekRanges = getWeekRange(new Date());
    const lastWeekRanges = getWeekRange(new Date(Date.now() - 7 * 86400000));
    const thisWeekExpense = sumExpenseInRange(weekRanges.start, weekRanges.end);
    const lastWeekExpense = sumExpenseInRange(lastWeekRanges.start, lastWeekRanges.end);
    if (lastWeekExpense > 0) {
      if (thisWeekExpense > lastWeekExpense) {
        const pct = Math.round(((thisWeekExpense - lastWeekExpense) / lastWeekExpense) * 100);
        insights.push(`💡 Pengeluaran minggu ini meningkat <strong>${pct}%</strong> dibanding minggu sebelumnya.`);
      } else if (thisWeekExpense < lastWeekExpense) {
        const pct = Math.round(((lastWeekExpense - thisWeekExpense) / lastWeekExpense) * 100);
        insights.push(`💡 Pengeluaran minggu ini turun <strong>${pct}%</strong> dibanding minggu sebelumnya. Mantap!`);
      }
    }

    // Saldo negatif warning
    if (totalIncome - totalExpense < 0) {
      insights.push(`⚠️ Saldo kamu saat ini minus. Coba kurangi pengeluaran yang tidak penting dulu ya.`);
    }

    if (insights.length === 0) {
      insights.push("💡 Terus catat transaksimu supaya insight makin akurat.");
    }

    wrap.innerHTML = insights.map(i => `<div class="insight-item">${i}</div>`).join("");
  }

  function getWeekRange(dateObj) {
    const d = new Date(dateObj);
    const day = d.getDay(); // 0 = minggu
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toISO(start), end: toISO(end) };
  }

  function toISO(d) {
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function sumExpenseInRange(start, end) {
    return transactions
      .filter(t => t.jenis === "pengeluaran" && t.tanggal >= start && t.tanggal <= end)
      .reduce((s, t) => s + t.nominal, 0);
  }

  /* ==========================================================
     LAPORAN KEUANGAN
     ========================================================== */
  const reportPeriod = document.getElementById("reportPeriod");

  function updateReportControlsVisibility() {
    const val = reportPeriod.value;
    document.getElementById("reportDateSingleWrap").style.display = val === "harian" || val === "mingguan" ? "flex" : "none";
    document.getElementById("reportMonthWrap").style.display = val === "bulanan" ? "flex" : "none";
    document.getElementById("reportRangeStartWrap").style.display = val === "custom" ? "flex" : "none";
    document.getElementById("reportRangeEndWrap").style.display = val === "custom" ? "flex" : "none";
  }

  reportPeriod.addEventListener("change", updateReportControlsVisibility);
  updateReportControlsVisibility();
  document.getElementById("reportDateSingle").value = todayISO();
  document.getElementById("reportMonth").value = todayISO().slice(0, 7);

  function computeReportRange() {
    const val = reportPeriod.value;
    if (val === "harian") {
      const d = document.getElementById("reportDateSingle").value || todayISO();
      return { start: d, end: d, label: `Harian — ${formatTanggalTampil(d)}` };
    }
    if (val === "mingguan") {
      const d = document.getElementById("reportDateSingle").value || todayISO();
      const range = getWeekRange(new Date(d + "T00:00:00"));
      return { start: range.start, end: range.end, label: `Mingguan — ${formatTanggalTampil(range.start)} s/d ${formatTanggalTampil(range.end)}` };
    }
    if (val === "bulanan") {
      const m = document.getElementById("reportMonth").value || todayISO().slice(0, 7);
      const [y, mo] = m.split("-").map(Number);
      const start = `${m}-01`;
      const lastDay = new Date(y, mo, 0).getDate();
      const end = `${m}-${String(lastDay).padStart(2, "0")}`;
      const bulanNama = new Date(y, mo - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      return { start, end, label: `Bulanan — ${bulanNama}`, monthLabel: bulanNama };
    }
    // custom
    const start = document.getElementById("reportRangeStart").value;
    const end = document.getElementById("reportRangeEnd").value;
    return { start, end, label: `${formatTanggalTampil(start)} s/d ${formatTanggalTampil(end)}` };
  }

  document.getElementById("generateReportBtn").addEventListener("click", () => {
    const { start, end, label, monthLabel } = computeReportRange();
    if (!start || !end) { showToast("Pilih tanggal terlebih dahulu"); return; }

    const list = transactions
      .filter(t => t.tanggal >= start && t.tanggal <= end)
      .sort((a, b) => (a.tanggal > b.tanggal ? 1 : a.tanggal < b.tanggal ? -1 : a.createdAt - b.createdAt));

    let runningSaldo = 0;
    const rows = list.map((t, i) => {
      runningSaldo += t.jenis === "pemasukan" ? t.nominal : -t.nominal;
      return {
        no: i + 1,
        tanggal: t.tanggal,
        keterangan: t.keterangan,
        kategori: t.kategori,
        jenis: t.jenis,
        pemasukan: t.jenis === "pemasukan" ? t.nominal : 0,
        pengeluaran: t.jenis === "pengeluaran" ? t.nominal : 0,
        saldo: runningSaldo
      };
    });

    const totalIncome = rows.reduce((s, r) => s + r.pemasukan, 0);
    const totalExpense = rows.reduce((s, r) => s + r.pengeluaran, 0);
    const saldoAkhir = totalIncome - totalExpense;

    const byKategori = {};
    rows.filter(r => r.jenis === "pengeluaran").forEach(r => {
      byKategori[r.kategori] = (byKategori[r.kategori] || 0) + r.pengeluaran;
    });

    const nama = document.getElementById("reportName").value.trim();

    lastReport = {
      periodValue: reportPeriod.value,
      periodLabel: label,
      monthLabel,
      start, end, nama,
      rows, totalIncome, totalExpense, saldoAkhir,
      byKategori
    };

    renderReportTable(lastReport);
  });

  function renderReportTable(report) {
    document.getElementById("reportResult").style.display = "block";
    document.getElementById("reportNameLine").textContent = report.nama ? `Nama: ${report.nama}` : "Nama: -";
    document.getElementById("reportPeriodLine").textContent = `Periode: ${report.periodLabel}`;

    const tbody = document.getElementById("reportTableBody");
    const emptyState = document.getElementById("reportEmptyState");
    tbody.innerHTML = "";

    if (report.rows.length === 0) {
      emptyState.style.display = "block";
    } else {
      emptyState.style.display = "none";
    }

    report.rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.no}</td>
        <td>${formatTanggalTampil(r.tanggal)}</td>
        <td>${escapeHtml(r.keterangan)}</td>
        <td>${escapeHtml(r.kategori)}</td>
        <td><span class="badge ${r.jenis}">${r.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran"}</span></td>
        <td class="amount-pos">${r.pemasukan ? formatRupiah(r.pemasukan) : "-"}</td>
        <td class="amount-neg">${r.pengeluaran ? formatRupiah(r.pengeluaran) : "-"}</td>
        <td>${formatRupiah(r.saldo)}</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("sumIncome").textContent = formatRupiah(report.totalIncome);
    document.getElementById("sumExpense").textContent = formatRupiah(report.totalExpense);
    document.getElementById("sumFinal").textContent = formatRupiah(report.saldoAkhir);
  }

  /* ==========================================================
     EXPORT SPREADSHEET (.xlsx) — SheetJS
     ========================================================== */
  document.getElementById("downloadXlsxBtn").addEventListener("click", () => {
    if (!lastReport || lastReport.rows.length === 0) {
      showToast("Tidak ada data untuk diekspor pada periode ini");
      return;
    }
    exportReportToXlsx(lastReport);
  });

  function periodFileLabel(report) {
    if (report.periodValue === "bulanan" && report.monthLabel) {
      return report.monthLabel.replace(" ", "-");
    }
    return `${report.start}_sd_${report.end}`;
  }

  function exportReportToXlsx(report) {
    const wb = XLSX.utils.book_new();

    /* ---- SHEET 1: Laporan Keuangan ---- */
    const sheet1Data = [];
    sheet1Data.push(["LAPORAN KEUANGAN MAHASISWA"]);
    sheet1Data.push([`Nama Mahasiswa: ${report.nama || "-"}`]);
    sheet1Data.push([`Periode Laporan: ${report.periodLabel}`]);
    sheet1Data.push([`Tanggal Dibuat: ${formatTanggalTampil(todayISO())}`]);
    sheet1Data.push([]);

    const headerRowIdx = sheet1Data.length; // 0-indexed row of header
    sheet1Data.push(["No", "Tanggal", "Keterangan", "Kategori", "Jenis Transaksi", "Pemasukan", "Pengeluaran", "Saldo"]);

    report.rows.forEach(r => {
      sheet1Data.push([
        r.no,
        formatTanggalTampil(r.tanggal),
        r.keterangan,
        r.kategori,
        r.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran",
        r.pemasukan || 0,
        r.pengeluaran || 0,
        r.saldo
      ]);
    });

    sheet1Data.push([]);
    const totalIncomeRowIdx = sheet1Data.length;
    sheet1Data.push(["", "", "", "", "", "Total Pemasukan", report.totalIncome]);
    const totalExpenseRowIdx = sheet1Data.length;
    sheet1Data.push(["", "", "", "", "", "Total Pengeluaran", report.totalExpense]);
    const saldoAkhirRowIdx = sheet1Data.length;
    sheet1Data.push(["", "", "", "", "", "Saldo Akhir", report.saldoAkhir]);

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

    // Merge judul
    ws1["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }
    ];

    // Lebar kolom otomatis (perkiraan)
    ws1["!cols"] = [
      { wch: 5 }, { wch: 12 }, { wch: 28 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
    ];

    styleHeaderRow(ws1, headerRowIdx, 8);
    styleTitle(ws1, 0);
    applyCurrencyFormat(ws1, headerRowIdx + 1, headerRowIdx + report.rows.length, [5, 6, 7]);
    applyCurrencyFormat(ws1, totalIncomeRowIdx, saldoAkhirRowIdx, [6]);
    boldRow(ws1, totalIncomeRowIdx, 8);
    boldRow(ws1, totalExpenseRowIdx, 8);
    boldRow(ws1, saldoAkhirRowIdx, 8);

    XLSX.utils.book_append_sheet(wb, ws1, "Laporan Keuangan");

    /* ---- SHEET 2: Ringkasan Keuangan ---- */
    const sheet2Data = [];
    sheet2Data.push(["RINGKASAN KEUANGAN"]);
    sheet2Data.push([]);
    sheet2Data.push(["Keterangan", "Jumlah"]);
    sheet2Data.push(["Total Pemasukan", report.totalIncome]);
    sheet2Data.push(["Total Pengeluaran", report.totalExpense]);
    sheet2Data.push(["Saldo Akhir", report.saldoAkhir]);
    sheet2Data.push([]);
    sheet2Data.push(["Pengeluaran Berdasarkan Kategori"]);
    sheet2Data.push(["Kategori", "Total"]);

    const kategoriEntries = Object.entries(report.byKategori).sort((a, b) => b[1] - a[1]);
    kategoriEntries.forEach(([kat, total]) => sheet2Data.push([kat, total]));
    if (kategoriEntries.length === 0) sheet2Data.push(["-", 0]);

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2["!cols"] = [{ wch: 26 }, { wch: 18 }];
    ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    styleTitle(ws2, 0);
    styleHeaderRow(ws2, 2, 2);
    boldRow(ws2, 2, 2);
    applyCurrencyFormat(ws2, 3, 5, [1]);
    styleHeaderRow(ws2, 8, 2);
    boldRow(ws2, 8, 2);
    applyCurrencyFormat(ws2, 9, 9 + kategoriEntries.length, [1]);

    XLSX.utils.book_append_sheet(wb, ws2, "Ringkasan Keuangan");

    /* ---- SHEET 3: Data Transaksi ---- */
    const sheet3Data = [["ID", "Tanggal", "Keterangan", "Kategori", "Jenis", "Nominal"]];
    // gunakan seluruh transaksi mentah pada rentang laporan
    transactions
      .filter(t => t.tanggal >= report.start && t.tanggal <= report.end)
      .sort((a, b) => (a.tanggal > b.tanggal ? 1 : a.tanggal < b.tanggal ? -1 : 0))
      .forEach(t => {
        sheet3Data.push([t.id, formatTanggalTampil(t.tanggal), t.keterangan, t.kategori,
          t.jenis === "pemasukan" ? "Pemasukan" : "Pengeluaran", t.nominal]);
      });

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    styleHeaderRow(ws3, 0, 6);
    applyCurrencyFormat(ws3, 1, sheet3Data.length - 1, [5]);

    XLSX.utils.book_append_sheet(wb, ws3, "Data Transaksi");

    const fileName = `Laporan-Keuangan-${periodFileLabel(report)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast("Spreadsheet berhasil diunduh ✓");
  }

  function cellRef(r, c) { return XLSX.utils.encode_cell({ r, c }); }

  function styleTitle(ws, rowIdx) {
    const ref = cellRef(rowIdx, 0);
    if (!ws[ref]) return;
    ws[ref].s = {
      font: { bold: true, sz: 14, color: { rgb: "065F46" } },
      alignment: { horizontal: "center" }
    };
  }

  function styleHeaderRow(ws, rowIdx, numCols) {
    for (let c = 0; c < numCols; c++) {
      const ref = cellRef(rowIdx, c);
      if (!ws[ref]) continue;
      ws[ref].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "059669" } },
        alignment: { horizontal: "center" }
      };
    }
  }

  function boldRow(ws, rowIdx, numCols) {
    for (let c = 0; c < numCols; c++) {
      const ref = cellRef(rowIdx, c);
      if (!ws[ref]) continue;
      ws[ref].s = Object.assign({}, ws[ref].s, { font: { bold: true } });
    }
  }

  function applyCurrencyFormat(ws, startRow, endRow, cols) {
    for (let r = startRow; r <= endRow; r++) {
      cols.forEach(c => {
        const ref = cellRef(r, c);
        if (!ws[ref]) return;
        ws[ref].z = '"Rp"#,##0';
      });
    }
  }

  /* ==========================================================
     BUDGET BULANAN
     ========================================================== */
  function currentMonthKey() { return todayISO().slice(0, 7); }

  function renderBudgetView() {
    const budgets = loadBudgets();
    const mKey = currentMonthKey();
    const budget = budgets[mKey] || 0;

    document.getElementById("budgetInput").value = budget || "";

    const used = transactions
      .filter(t => t.jenis === "pengeluaran" && monthKeyOf(t.tanggal) === mKey)
      .reduce((s, t) => s + t.nominal, 0);

    const left = budget - used;
    const pct = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;

    document.getElementById("budgetTotal").textContent = formatRupiah(budget);
    document.getElementById("budgetUsed").textContent = formatRupiah(used);
    document.getElementById("budgetLeft").textContent = formatRupiah(Math.max(0, left));

    const fill = document.getElementById("budgetProgressFill");
    fill.style.width = pct + "%";
    fill.classList.remove("warn", "danger");

    const warnBox = document.getElementById("budgetWarning");
    warnBox.style.display = "none";
    warnBox.classList.remove("warn", "danger");

    if (budget > 0) {
      if (used >= budget) {
        fill.classList.add("danger");
        warnBox.style.display = "block";
        warnBox.classList.add("danger");
        warnBox.textContent = "⚠️ Budget bulan ini sudah habis! Coba lebih hemat sampai akhir bulan ya.";
      } else if (used / budget >= 0.8) {
        fill.classList.add("warn");
        warnBox.style.display = "block";
        warnBox.classList.add("warn");
        warnBox.textContent = "⚠️ Kamu sudah menggunakan lebih dari 80% budget bulan ini.";
      }
    }

    document.getElementById("budgetProgressText").textContent = `${pct}% terpakai`;
  }

  document.getElementById("saveBudgetBtn").addEventListener("click", () => {
    const val = Number(document.getElementById("budgetInput").value);
    if (!val || val <= 0) { showToast("Masukkan jumlah budget yang valid"); return; }
    const budgets = loadBudgets();
    budgets[currentMonthKey()] = val;
    saveBudgets(budgets);
    renderBudgetView();
    showToast("Budget bulan ini berhasil disimpan ✓");
  });

  /* ==========================================================
     INIT
     ========================================================== */
  function renderAll() {
    renderDashboard();
    renderTransactionTable();
    if (document.getElementById("view-budget").classList.contains("active")) renderBudgetView();
  }

  refreshFilterKategoriOptions();
  populateKategoriOptions("pemasukan", txKategoriSelect, false);
  document.getElementById("txTanggal").value = todayISO();
  renderAll();
})();
