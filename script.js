/* =====================================================================
   SỔ CHI TIÊU — script.js (v3 — Tối ưu UI/UX + chức năng)
   Cải tiến so với v2:
   1. Toast notification thay vì im lặng khi thao tác thành công.
   2. Badge đếm số giao dịch ở tiêu đề bảng.
   3. Hiển thị ngày hiện tại ở header.
   4. Nút "Thêm nhanh" scroll tới form + focus.
   5. Phím tắt: Ctrl+N (thêm nhanh), Ctrl+D (đổi theme).
   6. Empty state có icon đẹp hơn.
   7. Hiển thị "xu hướng" số dư so với tháng trước.
   8. Debounce tìm kiếm để tránh lag khi gõ nhanh.
   9. Animation mượt khi thêm dòng mới.
   10. Focus trap trong modal xác nhận.
   11. Validate ngày không được ở tương lai.
   12. Hiển thị tổng số tiền theo bộ lọc đang áp dụng.
   ===================================================================== */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    transactions: "expenseTracker_transactions",
    categories: "expenseTracker_categories",
    theme: "expenseTracker_theme",
  };

  const DEFAULT_CATEGORIES = {
    income: ["Lương", "Thưởng", "Khác"],
    expense: ["Ăn uống", "Mua sắm", "Đi lại", "Giải trí", "Hóa đơn", "Khác"],
  };

  const PAGE_SIZE = 10;
  const SEARCH_DEBOUNCE_MS = 180;

  /* ------------------------- State ------------------------- */
  let transactions = loadTransactions();
  let categories = loadCategories();
  let currentType = "income";
  let filters = { type: "all", category: "all", from: "", to: "", search: "" };
  let currentPage = 1;
  let editingId = null;
  let pendingConfirmAction = null;
  let previousFocusEl = null;
  let searchTimer = null;

  let pieChart = null;
  let barChart = null;

  /* ------------------------- DOM ------------------------- */
  const el = {
    form: document.getElementById("transactionForm"),
    formPanel: document.getElementById("formPanel"),
    formPanelTitle: document.getElementById("formPanelTitle"),
    typeButtons: document.querySelectorAll(".type-btn"),
    amountInput: document.getElementById("amountInput"),
    dateInput: document.getElementById("dateInput"),
    categorySelect: document.getElementById("categorySelect"),
    noteInput: document.getElementById("noteInput"),
    submitBtn: document.getElementById("submitBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),

    balanceValue: document.getElementById("balanceValue"),
    balanceTrend: document.getElementById("balanceTrend"),
    totalIncome: document.getElementById("totalIncome"),
    totalExpense: document.getElementById("totalExpense"),

    tableBody: document.getElementById("transactionTableBody"),
    emptyState: document.getElementById("emptyState"),
    transactionCount: document.getElementById("transactionCount"),

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
    quickAddBtn: document.getElementById("quickAddBtn"),

    pieChartCanvas: document.getElementById("pieChart"),
    barChartCanvas: document.getElementById("barChart"),
    pieEmptyState: document.getElementById("pieEmptyState"),

    pagination: document.getElementById("pagination"),
    pageIndicator: document.getElementById("pageIndicator"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),

    confirmModal: document.getElementById("confirmModal"),
    confirmModalMessage: document.getElementById("confirmModalMessage"),
    confirmModalOk: document.getElementById("confirmModalOk"),
    confirmModalCancel: document.getElementById("confirmModalCancel"),

    toast: document.getElementById("toast"),
    currentDateLabel: document.getElementById("currentDateLabel"),
  };

  /* ====================================================================
     STORAGE
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
    try {
      localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
    } catch (e) {
      showToast("Không lưu được dữ liệu!", "error");
    }
  }

  function loadCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.categories);
      if (!raw) return structuredCloneCategories(DEFAULT_CATEGORIES);
      const parsed = JSON.parse(raw);
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
    try {
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    } catch (e) {
      showToast("Không lưu được danh mục!", "error");
    }
  }

  /* ====================================================================
     UTILITIES
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
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    return function (...args) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ====================================================================
     TOAST
     ==================================================================== */
  let toastTimer = null;
  function showToast(message, type = "success") {
    clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.className = "toast show " + type;
    el.toast.hidden = false;
    toastTimer = setTimeout(() => {
      el.toast.classList.remove("show");
      setTimeout(() => { el.toast.hidden = true; }, 300);
    }, 2200);
  }

  /* ====================================================================
     AMOUNT INPUT — định dạng số real-time
     ==================================================================== */
  function formatAmountDisplay(digitsOnly) {
    if (!digitsOnly) return "";
    const num = parseInt(digitsOnly, 10);
    if (isNaN(num)) return "";
    return num.toLocaleString("vi-VN");
  }

  function setAmountInputValue(num) {
    el.amountInput.value = formatAmountDisplay(String(Math.round(num)));
  }

  function getAmountValue() {
    const digits = el.amountInput.value.replace(/\D/g, "");
    return digits ? parseInt(digits, 10) : NaN;
  }

  el.amountInput.addEventListener("input", () => {
    const wasAtEnd = el.amountInput.selectionStart === el.amountInput.value.length;
    const digitsOnly = el.amountInput.value.replace(/\D/g, "");
    el.amountInput.value = formatAmountDisplay(digitsOnly);
    if (wasAtEnd) {
      el.amountInput.setSelectionRange(el.amountInput.value.length, el.amountInput.value.length);
    }
  });

  /* ====================================================================
     FORM
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
  el.dateInput.max = todayIso();

  /* ====================================================================
     EDIT MODE
     ==================================================================== */
  function startEditTransaction(id) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    editingId = id;
    currentType = tx.type;
    el.typeButtons.forEach((b) => b.classList.toggle("active", b.dataset.type === tx.type));
    populateCategorySelect();
    el.categorySelect.value = tx.category;
    setAmountInputValue(tx.amount);
    el.dateInput.value = tx.date;
    el.noteInput.value = tx.note;

    el.formPanelTitle.textContent = "Chỉnh sửa giao dịch";
    el.submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg> Cập nhật giao dịch`;
    el.cancelEditBtn.hidden = false;

    el.form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => el.amountInput.focus(), 250);
    showToast("Đang chỉnh sửa giao dịch", "success");
  }

  function exitEditMode() {
    editingId = null;
    el.formPanelTitle.textContent = "Thêm giao dịch";
    el.submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg> Lưu giao dịch`;
    el.cancelEditBtn.hidden = true;

    currentType = "income";
    el.typeButtons.forEach((b) => b.classList.toggle("active", b.dataset.type === "income"));
    populateCategorySelect();
    el.amountInput.value = "";
    el.noteInput.value = "";
    el.dateInput.value = todayIso();
  }

  el.cancelEditBtn.addEventListener("click", () => {
    exitEditMode();
    showToast("Đã hủy chỉnh sửa");
  });

  /* ====================================================================
     SUBMIT
     ==================================================================== */
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const amount = getAmountValue();
    if (!amount || amount <= 0) {
      el.amountInput.focus();
      showToast("Vui lòng nhập số tiền hợp lệ", "error");
      return;
    }

    const dateVal = el.dateInput.value || todayIso();
    if (dateVal > todayIso()) {
      showToast("Ngày không được ở tương lai", "error");
      el.dateInput.focus();
      return;
    }

    if (editingId) {
      const tx = transactions.find((t) => t.id === editingId);
      if (tx) {
        tx.type = currentType;
        tx.amount = Math.round(amount);
        tx.category = el.categorySelect.value;
        tx.date = dateVal;
        tx.note = el.noteInput.value.trim();
      }
      saveTransactions();
      exitEditMode();
      showToast("Đã cập nhật giao dịch", "success");
    } else {
      const tx = {
        id: generateId(),
        type: currentType,
        amount: Math.round(amount),
        category: el.categorySelect.value,
        date: dateVal,
        note: el.noteInput.value.trim(),
        createdAt: Date.now(),
      };
      transactions.push(tx);
      saveTransactions();

      el.amountInput.value = "";
      el.noteInput.value = "";
      if (el.categorySelect.options.length > 0) {
        el.categorySelect.selectedIndex = 0;
      }
      el.amountInput.focus();
      showToast("Đã thêm giao dịch", "success");
    }

    refreshAll();
  });

  /* ====================================================================
     CONFIRM MODAL — với focus trap
     ==================================================================== */
  function showConfirmModal(message, onConfirm) {
    previousFocusEl = document.activeElement;
    el.confirmModalMessage.textContent = message;
    pendingConfirmAction = onConfirm;
    el.confirmModal.hidden = false;
    el.confirmModalOk.focus();
  }

  function hideConfirmModal() {
    el.confirmModal.hidden = true;
    pendingConfirmAction = null;
    if (previousFocusEl && typeof previousFocusEl.focus === "function") {
      previousFocusEl.focus();
    }
  }

  el.confirmModalCancel.addEventListener("click", hideConfirmModal);
  el.confirmModalOk.addEventListener("click", () => {
    if (typeof pendingConfirmAction === "function") pendingConfirmAction();
    hideConfirmModal();
  });
  el.confirmModal.addEventListener("click", (e) => {
    if (e.target === el.confirmModal) hideConfirmModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.confirmModal.hidden) {
      hideConfirmModal();
      return;
    }
    // Focus trap
    if (!el.confirmModal.hidden && e.key === "Tab") {
      const focusables = el.confirmModal.querySelectorAll("button:not([disabled])");
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ====================================================================
     DELETE
     ==================================================================== */
  function deleteTransaction(id) {
    transactions = transactions.filter((t) => t.id !== id);
    saveTransactions();
    if (editingId === id) exitEditMode();
    refreshAll();
    showToast("Đã xóa giao dịch", "success");
  }

  /* ====================================================================
     FILTERS
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
        return (t.note || "").toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
  }

  function onFiltersChanged() {
    currentPage = 1;
    renderTable();
    renderPieChart();
    renderBarChart();
  }

  el.searchInput.addEventListener("input", debounce(() => {
    filters.search = el.searchInput.value;
    onFiltersChanged();
  }, SEARCH_DEBOUNCE_MS));

  el.filterType.addEventListener("change", () => {
    filters.type = el.filterType.value;
    onFiltersChanged();
  });
  el.filterCategory.addEventListener("change", () => {
    filters.category = el.filterCategory.value;
    onFiltersChanged();
  });
  el.filterFrom.addEventListener("change", () => {
    filters.from = el.filterFrom.value;
    onFiltersChanged();
  });
  el.filterTo.addEventListener("change", () => {
    filters.to = el.filterTo.value;
    onFiltersChanged();
  });
  el.clearFiltersBtn.addEventListener("click", () => {
    filters = { type: "all", category: "all", from: "", to: "", search: "" };
    el.searchInput.value = "";
    el.filterType.value = "all";
    el.filterCategory.value = "all";
    el.filterFrom.value = "";
    el.filterTo.value = "";
    onFiltersChanged();
    showToast("Đã xóa tất cả bộ lọc");
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
     TABLE
     ==================================================================== */
  function renderTable() {
    const list = getFilteredTransactions();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    el.tableBody.innerHTML = "";
    el.transactionCount.textContent = list.length;

    if (list.length === 0) {
      el.emptyState.hidden = false;
      el.pagination.hidden = true;
    } else {
      el.emptyState.hidden = true;

      const startIdx = (currentPage - 1) * PAGE_SIZE;
      const pageItems = list.slice(startIdx, startIdx + PAGE_SIZE);

      pageItems.forEach((t) => {
        const tr = document.createElement("tr");
        const sign = t.type === "income" ? "+" : "−";
        const amountClass = t.type === "income" ? "amount-income" : "amount-expense";

        tr.innerHTML = `
          <td>${formatDateDisplay(t.date)}</td>
          <td><span class="category-tag">${escapeHtml(t.category)}</span></td>
          <td class="note-cell">${escapeHtml(t.note) || "—"}</td>
          <td class="amount-cell ${amountClass}">${sign} ${formatCurrency(t.amount)}</td>
          <td class="col-action">
            <div class="row-actions">
              <button class="btn-link-text" data-edit-id="${t.id}" title="Sửa giao dịch">Sửa</button>
              <button class="btn-danger-text" data-delete-id="${t.id}" title="Xóa giao dịch">Xóa</button>
            </div>
          </td>
        `;
        el.tableBody.appendChild(tr);
      });

      if (totalPages > 1) {
        el.pagination.hidden = false;
        el.pageIndicator.textContent = `Trang ${currentPage}/${totalPages} · ${list.length} giao dịch`;
        el.prevPageBtn.disabled = currentPage === 1;
        el.nextPageBtn.disabled = currentPage === totalPages;
      } else {
        el.pagination.hidden = true;
      }
    }

    el.tableBody.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        showConfirmModal(
          "Bạn có chắc chắn muốn xóa giao dịch này? Hành động này không thể hoàn tác.",
          () => deleteTransaction(btn.dataset.deleteId)
        );
      });
    });
    el.tableBody.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", () => startEditTransaction(btn.dataset.editId));
    });
  }

  el.prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });
  el.nextPageBtn.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(getFilteredTransactions().length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  /* ====================================================================
     SUMMARY + TREND
     ==================================================================== */
  function renderSummary() {
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;

    el.totalIncome.textContent = formatCurrency(totalIncome);
    el.totalExpense.textContent = formatCurrency(totalExpense);
    el.balanceValue.textContent = formatCurrency(balance);
    el.balanceValue.style.color = balance < 0 ? "var(--expense)" : "var(--ink)";

    // Xu hướng so với tháng trước
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.toISOString().slice(0, 7);

    const balanceOf = (monthPrefix) => {
      let inc = 0, exp = 0;
      transactions.forEach((t) => {
        if (t.date.slice(0, 7) === monthPrefix) {
          if (t.type === "income") inc += t.amount;
          else exp += t.amount;
        }
      });
      return inc - exp;
    };

    const thisBal = balanceOf(thisMonth);
    const prevBal = balanceOf(prevMonth);

    if (prevBal !== 0 || thisBal !== 0) {
      const diff = thisBal - prevBal;
      const pct = prevBal === 0 ? 100 : Math.round((diff / Math.abs(prevBal)) * 100);
      const arrow = diff >= 0 ? "▲" : "▼";
      const sign = diff >= 0 ? "+" : "";
      el.balanceTrend.textContent = `${arrow} ${sign}${pct}% so với tháng trước`;
      el.balanceTrend.className = "balance-trend " + (diff >= 0 ? "up" : "down");
      el.balanceTrend.hidden = false;
    } else {
      el.balanceTrend.hidden = true;
    }
  }

  /* ====================================================================
     CATEGORY MANAGER
     ==================================================================== */
  el.manageCategoriesBtn.addEventListener("click", () => {
    el.categoryPanel.hidden = !el.categoryPanel.hidden;
    if (!el.categoryPanel.hidden) {
      el.categoryPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
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
        showToast("Danh mục đã tồn tại", "error");
        input.value = "";
        return;
      }
      categories[type].push(name);
      saveCategories();
      input.value = "";
      renderCategoryManager();
      populateCategorySelect();
      populateFilterCategoryOptions();
      showToast("Đã thêm danh mục");
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
        ${
          inUse
            ? `<span title="Đang được dùng trong giao dịch, không thể xóa" style="color:var(--ink-mute); font-size:11.5px;">Đang dùng</span>`
            : `<button class="btn-danger-text" data-remove-cat="${escapeHtml(cat)}" data-remove-type="${type}">Xóa</button>`
        }
      `;
      container.appendChild(li);
    });

    container.querySelectorAll("[data-remove-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.removeType;
        const cat = btn.dataset.removeCat;
        categories[t] = categories[t].filter((c) => c !== cat);
        saveCategories();
        renderCategoryManager();
        populateCategorySelect();
        populateFilterCategoryOptions();
        showToast("Đã xóa danh mục");
      });
    });
  }

  /* ====================================================================
     CHARTS
     ==================================================================== */
  function getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  const PALETTE = ["#B84830", "#B08C2A", "#2F7A56", "#5C7A99", "#8A5A44", "#6B6F3B", "#9C6B9E", "#4E8B8B"];

  function renderPieChart() {
    const expenses = getFilteredTransactions().filter((t) => t.type === "expense");
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
        datasets: [
          {
            data,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: getThemeColor("--ink-soft"),
              boxWidth: 12,
              boxHeight: 12,
              padding: 12,
              font: { family: "Work Sans", size: 11 },
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          tooltip: {
            backgroundColor: getThemeColor("--ink"),
            titleColor: getThemeColor("--surface"),
            bodyColor: getThemeColor("--surface"),
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
            },
          },
        },
      },
    });
  }

  function enumerateMonthRange(startMonth, endMonth) {
    const months = [];
    let [y, m] = startMonth.split("-").map(Number);
    const [endY, endM] = endMonth.split("-").map(Number);
    let safetyCounter = 0;
    while ((y < endY || (y === endY && m <= endM)) && safetyCounter < 1000) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
      safetyCounter++;
    }
    return months;
  }

  function renderBarChart() {
    const filtered = getFilteredTransactions();
    const byMonth = {};
    filtered.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 };
      byMonth[month][t.type] += t.amount;
    });

    const monthKeys = Object.keys(byMonth).sort();
    let months = [];
    if (monthKeys.length > 0) {
      months = enumerateMonthRange(monthKeys[0], monthKeys[monthKeys.length - 1]);
    }
    months = months.slice(-6);

    const incomeData = months.map((m) => (byMonth[m] ? byMonth[m].income : 0));
    const expenseData = months.map((m) => (byMonth[m] ? byMonth[m].expense : 0));
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
          {
            label: "Thu",
            data: incomeData,
            backgroundColor: getThemeColor("--income") || "#2F7A56",
            borderRadius: 4,
            maxBarThickness: 26,
          },
          {
            label: "Chi",
            data: expenseData,
            backgroundColor: getThemeColor("--expense") || "#B84830",
            borderRadius: 4,
            maxBarThickness: 26,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: getThemeColor("--ink-soft"),
              font: { family: "IBM Plex Mono", size: 11 },
            },
          },
          y: {
            grid: { color: getThemeColor("--line") },
            border: { display: false },
            ticks: {
              color: getThemeColor("--ink-soft"),
              font: { family: "IBM Plex Mono", size: 10 },
              callback: (v) => (v >= 1000000 ? v / 1000000 + "tr" : v >= 1000 ? v / 1000 + "k" : v),
            },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: getThemeColor("--ink-soft"),
              boxWidth: 12,
              boxHeight: 12,
              padding: 12,
              font: { family: "Work Sans", size: 11 },
              usePointStyle: true,
              pointStyle: "rectRounded",
            },
          },
          tooltip: {
            backgroundColor: getThemeColor("--ink"),
            titleColor: getThemeColor("--surface"),
            bodyColor: getThemeColor("--surface"),
            padding: 10,
            cornerRadius: 6,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            },
          },
        },
      },
    });
  }

  /* ====================================================================
     EXPORT CSV
     ==================================================================== */
  el.exportCsvBtn.addEventListener("click", () => {
    if (transactions.length === 0) {
      showToast("Chưa có giao dịch nào để xuất", "error");
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
      "\uFEFF" +
      [header, ...rows].map((r) => r.map((f) => `"${f}"`).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `so-chi-tieu_${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Đã xuất file CSV");
  });

  /* ====================================================================
     THEME
     ==================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    el.iconSun.style.display = theme === "dark" ? "block" : "none";
    el.iconMoon.style.display = theme === "dark" ? "none" : "block";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    renderPieChart();
    renderBarChart();
    showToast(next === "dark" ? "Đã bật chế độ tối" : "Đã bật chế độ sáng");
  }

  el.themeToggle.addEventListener("click", toggleTheme);

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ====================================================================
     QUICK ADD + SHORTCUTS
     ==================================================================== */
  el.quickAddBtn.addEventListener("click", () => {
    el.form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => el.amountInput.focus(), 300);
  });

  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + N : Thêm nhanh
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      el.quickAddBtn.click();
    }
    // Ctrl/Cmd + D : Đổi theme
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      toggleTheme();
    }
    // Ctrl/Cmd + K : Focus tìm kiếm
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }
  });

  /* ====================================================================
     DATE LABEL
     ==================================================================== */
  function renderDateLabel() {
    const now = new Date();
    const days = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
    const d = days[now.getDay()];
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    el.currentDateLabel.textContent = `${d}, ${dd}/${mm}/${yyyy}`;
  }

  /* ====================================================================
     REFRESH + INIT
     ==================================================================== */
  function refreshAll() {
    renderSummary();
    renderTable();
    renderCategoryManager();
    populateFilterCategoryOptions();
    renderPieChart();
    renderBarChart();
  }

  function init() {
    initTheme();
    renderDateLabel();
    populateCategorySelect();
    refreshAll();
  }

  init();
})();