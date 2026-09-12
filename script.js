/* =====================================================================
   SỔ CHI TIÊU — script.js
   Toàn bộ logic: lưu trữ localStorage, thêm/xóa giao dịch, lọc/tìm kiếm,
   quản lý danh mục, vẽ biểu đồ, xuất CSV, chế độ sáng/tối.
   Không phụ thuộc backend — mọi dữ liệu nằm trên trình duyệt người dùng.
   ===================================================================== */

(function () {
  "use strict";

  /* ------------------------- Khóa lưu trữ ------------------------- */
  const STORAGE_KEYS = {
    transactions: "expenseTracker_transactions",
    categories: "expenseTracker_categories",
    theme: "expenseTracker_theme",
  };

  const DEFAULT_CATEGORIES = {
    income: ["Lương", "Thưởng", "Khác"],
    expense: ["Ăn uống", "Mua sắm", "Đi lại", "Giải trí", "Hóa đơn", "Khác"],
  };

  /* ------------------------- Trạng thái ứng dụng ------------------------- */
  let transactions = loadTransactions();
  let categories = loadCategories();
  let currentType = "income"; // loại đang chọn trên form
  let filters = { type: "all", category: "all", from: "", to: "", search: "" };

  let pieChart = null;
  let barChart = null;

  /* ------------------------- Tham chiếu DOM ------------------------- */
  const el = {
    form: document.getElementById("transactionForm"),
    typeButtons: document.querySelectorAll(".type-btn"),
    amountInput: document.getElementById("amountInput"),
    dateInput: document.getElementById("dateInput"),
    categorySelect: document.getElementById("categorySelect"),
    noteInput: document.getElementById("noteInput"),

    balanceValue: document.getElementById("balanceValue"),
    totalIncome: document.getElementById("totalIncome"),
    totalExpense: document.getElementById("totalExpense"),

    tableBody: document.getElementById("transactionTableBody"),
    emptyState: document.getElementById("emptyState"),

    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    filterCategory: document.getElementById("filterCategory"),
    filterFrom: document.getElementById("filterFrom"),
    filterTo: document.getElementById("filterTo"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),

    manageCategoriesBtn: document.getElementById("manageCategoriesBtn"),
    categoryPanel: document.getElementById("categoryPanel"),
    closeCategoryPanel: document.getElementById("closeCategoryPanel"),
    incomeCategoryList: document.getElementById("incomeCategoryList"),
    expenseCategoryList: document.getElementById("expenseCategoryList"),
    newIncomeCategory: document.getElementById("newIncomeCategory"),
    newExpenseCategory: document.getElementById("newExpenseCategory"),

    exportCsvBtn: document.getElementById("exportCsvBtn"),
    themeToggle: document.getElementById("themeToggle"),
    iconSun: document.getElementById("iconSun"),
    iconMoon: document.getElementById("iconMoon"),

    pieChartCanvas: document.getElementById("pieChart"),
    barChartCanvas: document.getElementById("barChart"),
    pieEmptyState: document.getElementById("pieEmptyState"),
  };

  /* ====================================================================
     LƯU TRỮ (localStorage)
     ==================================================================== */
  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.transactions);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Không đọc được dữ liệu giao dịch:", e);
      return [];
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.categories);
      if (!raw) return structuredCloneCategories(DEFAULT_CATEGORIES);
      const parsed = JSON.parse(raw);
      // Đảm bảo luôn có đủ 2 nhóm income/expense kể cả dữ liệu cũ bị thiếu
      return {
        income: Array.isArray(parsed.income) ? parsed.income : [...DEFAULT_CATEGORIES.income],
        expense: Array.isArray(parsed.expense) ? parsed.expense : [...DEFAULT_CATEGORIES.expense],
      };
    } catch (e) {
      console.error("Không đọc được dữ liệu danh mục:", e);
      return structuredCloneCategories(DEFAULT_CATEGORIES);
    }
  }

  function structuredCloneCategories(src) {
    return { income: [...src.income], expense: [...src.expense] };
  }

  function saveCategories() {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
  }

  /* ====================================================================
     TIỆN ÍCH
     ==================================================================== */
  function formatCurrency(amount) {
    return amount.toLocaleString("vi-VN") + " ₫";
  }

  function formatDateDisplay(isoDate) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }

  function todayIso() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 10);
  }

  function generateId() {
    return "tx_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ====================================================================
     FORM: chuyển đổi Thu / Chi + danh mục tương ứng
     ==================================================================== */
  el.typeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      el.typeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentType = btn.dataset.type;
      populateCategorySelect();
    });
  });

  function populateCategorySelect() {
    const list = categories[currentType] || [];
    el.categorySelect.innerHTML = list
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
  }

  el.dateInput.value = todayIso();

  /* ====================================================================
     THÊM GIAO DỊCH
     ==================================================================== */
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const amount = parseFloat(el.amountInput.value);
    if (!amount || amount <= 0) {
      el.amountInput.focus();
      return;
    }

    const tx = {
      id: generateId(),
      type: currentType,
      amount: Math.round(amount),
      category: el.categorySelect.value,
      date: el.dateInput.value || todayIso(),
      note: el.noteInput.value.trim(),
      createdAt: Date.now(),
    };

    transactions.push(tx);
    saveTransactions();

    // Reset form nhưng giữ nguyên loại giao dịch và ngày đã chọn
    el.amountInput.value = "";
    el.noteInput.value = "";
    el.amountInput.focus();

    refreshAll();
  });

  /* ====================================================================
     XÓA GIAO DỊCH
     ==================================================================== */
  function deleteTransaction(id) {
    transactions = transactions.filter((t) => t.id !== id);
    saveTransactions();
    refreshAll();
  }

  /* ====================================================================
     LỌC & TÌM KIẾM
     ==================================================================== */
  function getFilteredTransactions() {
    return transactions
      .filter((t) => (filters.type === "all" ? true : t.type === filters.type))
      .filter((t) => (filters.category === "all" ? true : t.category === filters.category))
      .filter((t) => (filters.from ? t.date >= filters.from : true))
      .filter((t) => (filters.to ? t.date <= filters.to : true))
      .filter((t) => {
        if (!filters.search) return true;
        const q = filters.search.toLowerCase();
        return t.note.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  }

  el.searchInput.addEventListener("input", () => {
    filters.search = el.searchInput.value;
    renderTable();
  });
  el.filterType.addEventListener("change", () => {
    filters.type = el.filterType.value;
    renderTable();
  });
  el.filterCategory.addEventListener("change", () => {
    filters.category = el.filterCategory.value;
    renderTable();
  });
  el.filterFrom.addEventListener("change", () => {
    filters.from = el.filterFrom.value;
    renderTable();
  });
  el.filterTo.addEventListener("change", () => {
    filters.to = el.filterTo.value;
    renderTable();
  });
  el.clearFiltersBtn.addEventListener("click", () => {
    filters = { type: "all", category: "all", from: "", to: "", search: "" };
    el.searchInput.value = "";
    el.filterType.value = "all";
    el.filterCategory.value = "all";
    el.filterFrom.value = "";
    el.filterTo.value = "";
    renderTable();
  });

  function populateFilterCategoryOptions() {
    const allCats = Array.from(new Set([...categories.income, ...categories.expense]));
    const current = el.filterCategory.value;
    el.filterCategory.innerHTML =
      `<option value="all">Tất cả danh mục</option>` +
      allCats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if (allCats.includes(current)) el.filterCategory.value = current;
  }

  /* ====================================================================
     HIỂN THỊ BẢNG GIAO DỊCH
     ==================================================================== */
  function renderTable() {
    const list = getFilteredTransactions();
    el.tableBody.innerHTML = "";

    if (list.length === 0) {
      el.emptyState.hidden = false;
    } else {
      el.emptyState.hidden = true;
      list.forEach((t) => {
        const tr = document.createElement("tr");
        const sign = t.type === "income" ? "+" : "−";
        const amountClass = t.type === "income" ? "amount-income" : "amount-expense";

        tr.innerHTML = `
          <td>${formatDateDisplay(t.date)}</td>
          <td><span class="category-tag">${escapeHtml(t.category)}</span></td>
          <td class="note-cell">${escapeHtml(t.note) || "—"}</td>
          <td class="amount-cell ${amountClass}">${sign} ${formatCurrency(t.amount)}</td>
          <td class="col-action"><button class="btn-danger-text" data-delete-id="${t.id}" title="Xóa giao dịch">Xóa</button></td>
        `;
        el.tableBody.appendChild(tr);
      });
    }

    // Gắn sự kiện xóa cho các nút vừa được tạo
    el.tableBody.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => deleteTransaction(btn.dataset.deleteId));
    });
  }

  /* ====================================================================
     TỔNG QUAN TÀI CHÍNH
     ==================================================================== */
  function renderSummary() {
    const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;

    el.totalIncome.textContent = formatCurrency(totalIncome);
    el.totalExpense.textContent = formatCurrency(totalExpense);
    el.balanceValue.textContent = formatCurrency(balance);
    el.balanceValue.style.color = balance < 0 ? "var(--expense)" : "var(--ink)";
  }

  /* ====================================================================
     QUẢN LÝ DANH MỤC
     ==================================================================== */
  el.manageCategoriesBtn.addEventListener("click", () => {
    el.categoryPanel.hidden = !el.categoryPanel.hidden;
  });
  el.closeCategoryPanel.addEventListener("click", () => {
    el.categoryPanel.hidden = true;
  });

  document.querySelectorAll("[data-add-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.addCat;
      const input = type === "income" ? el.newIncomeCategory : el.newExpenseCategory;
      const name = input.value.trim();
      if (!name) return;
      if (categories[type].some((c) => c.toLowerCase() === name.toLowerCase())) {
        input.value = "";
        return;
      }
      categories[type].push(name);
      saveCategories();
      input.value = "";
      renderCategoryManager();
      populateCategorySelect();
      populateFilterCategoryOptions();
    });
  });

  function renderCategoryManager() {
    renderCategoryList(el.incomeCategoryList, "income");
    renderCategoryList(el.expenseCategoryList, "expense");
  }

  function renderCategoryList(container, type) {
    container.innerHTML = "";
    categories[type].forEach((cat) => {
      const inUse = transactions.some((t) => t.type === type && t.category === cat);
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${escapeHtml(cat)}</span>
        ${inUse
          ? `<span title="Đang được dùng trong giao dịch, không thể xóa" style="color:var(--ink-soft); font-size:12px;">Đang dùng</span>`
          : `<button class="btn-danger-text" data-remove-cat="${escapeHtml(cat)}" data-remove-type="${type}">Xóa</button>`
        }
      `;
      container.appendChild(li);
    });

    container.querySelectorAll("[data-remove-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.removeType;
        const cat = btn.dataset.removeCat;
        categories[type] = categories[type].filter((c) => c !== cat);
        saveCategories();
        renderCategoryManager();
        populateCategorySelect();
        populateFilterCategoryOptions();
      });
    });
  }

  /* ====================================================================
     BIỂU ĐỒ (Chart.js)
     ==================================================================== */
  function getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  const PALETTE = ["#AE4128", "#AD8524", "#2F6F4E", "#5C7A99", "#8A5A44", "#6B6F3B", "#9C6B9E", "#4E8B8B"];

  function renderPieChart() {
    const expenses = transactions.filter((t) => t.type === "expense");
    const byCategory = {};
    expenses.forEach((t) => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);

    if (pieChart) pieChart.destroy();

    if (labels.length === 0) {
      el.pieEmptyState.hidden = false;
      el.pieChartCanvas.style.display = "none";
      return;
    }
    el.pieEmptyState.hidden = true;
    el.pieChartCanvas.style.display = "block";

    pieChart = new Chart(el.pieChartCanvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: getThemeColor("--ink-soft"), boxWidth: 12, font: { family: "Work Sans", size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  function renderBarChart() {
    // Nhóm theo tháng (YYYY-MM) trong 6 tháng gần nhất có dữ liệu
    const byMonth = {}; // { "2026-09": { income, expense } }
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 };
      byMonth[month][t.type] += t.amount;
    });

    const months = Object.keys(byMonth).sort().slice(-6);
    const incomeData = months.map((m) => byMonth[m].income);
    const expenseData = months.map((m) => byMonth[m].expense);
    const labels = months.map((m) => {
      const [y, mo] = m.split("-");
      return `Th${parseInt(mo, 10)}/${y.slice(2)}`;
    });

    if (barChart) barChart.destroy();

    barChart = new Chart(el.barChartCanvas, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["Chưa có dữ liệu"],
        datasets: [
          { label: "Thu", data: incomeData, backgroundColor: getThemeColor("--income") || "#2F6F4E", borderRadius: 3 },
          { label: "Chi", data: expenseData, backgroundColor: getThemeColor("--expense") || "#AE4128", borderRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: getThemeColor("--ink-soft"), font: { family: "IBM Plex Mono", size: 11 } } },
          y: {
            grid: { color: getThemeColor("--line") },
            ticks: {
              color: getThemeColor("--ink-soft"),
              font: { family: "IBM Plex Mono", size: 10 },
              callback: (v) => (v >= 1000000 ? v / 1000000 + "tr" : v),
            },
          },
        },
        plugins: {
          legend: { position: "bottom", labels: { color: getThemeColor("--ink-soft"), boxWidth: 12, font: { family: "Work Sans", size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } },
        },
      },
    });
  }

  /* ====================================================================
     XUẤT CSV
     ==================================================================== */
  el.exportCsvBtn.addEventListener("click", () => {
    if (transactions.length === 0) {
      alert("Chưa có giao dịch nào để xuất.");
      return;
    }

    const header = ["Ngày", "Loại", "Danh mục", "Số tiền", "Ghi chú"];
    const rows = [...transactions]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => [
        t.date,
        t.type === "income" ? "Thu" : "Chi",
        t.category,
        t.amount,
        (t.note || "").replace(/"/g, '""'),
      ]);

    const csvContent =
      "\uFEFF" + // BOM để Excel đọc đúng tiếng Việt
      [header, ...rows]
        .map((r) => r.map((field) => `"${field}"`).join(","))
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `so-chi-tieu_${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ====================================================================
     CHẾ ĐỘ SÁNG / TỐI
     ==================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    el.iconSun.style.display = theme === "dark" ? "block" : "none";
    el.iconMoon.style.display = theme === "dark" ? "none" : "block";
  }

  el.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    // Vẽ lại biểu đồ để cập nhật màu chữ/lưới theo theme mới
    renderPieChart();
    renderBarChart();
  });

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ====================================================================
     LÀM MỚI TOÀN BỘ GIAO DIỆN
     ==================================================================== */
  function refreshAll() {
    renderSummary();
    renderTable();
    renderCategoryManager();
    populateFilterCategoryOptions();
    renderPieChart();
    renderBarChart();
  }

  /* ====================================================================
     KHỞI TẠO
     ==================================================================== */
  function init() {
    initTheme();
    populateCategorySelect();
    refreshAll();
  }

  init();
})();