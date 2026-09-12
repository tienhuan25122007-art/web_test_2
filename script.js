/* =====================================================================
   SỔ CHI TIÊU — script.js (v2 — refactor)
   Toàn bộ logic: lưu trữ localStorage, thêm/sửa/xóa giao dịch, lọc/tìm
   kiếm, quản lý danh mục, vẽ biểu đồ theo bộ lọc, phân trang, xuất CSV,
   chế độ sáng/tối. Không phụ thuộc backend.

   TÓM TẮT THAY ĐỔI SO VỚI BẢN TRƯỚC (đánh dấu [MỚI]/[SỬA LỖI] tại chỗ):
   1. Modal xác nhận xóa thay cho window.confirm().
   2. Biểu đồ tròn & cột vẽ theo danh sách ĐÃ LỌC (getFilteredTransactions()).
   3. Biểu đồ cột liệt kê tháng liên tục theo thời gian, tự điền 0 cho
      tháng không có dữ liệu, luôn lấy 6 tháng gần nhất theo chuỗi liên tục.
   4. Thêm chức năng Sửa giao dịch ngay trên form nhập liệu.
   5. Ô nhập số tiền tự định dạng dấu phân cách hàng nghìn khi gõ.
   6. Sau khi thêm giao dịch mới: chọn lại danh mục đầu tiên + focus lại
      ô số tiền.
   7. Phân trang bảng giao dịch, 10 dòng/trang.
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

  // [MỚI] Số dòng hiển thị trên mỗi trang của bảng giao dịch
  const PAGE_SIZE = 10;

  /* ------------------------- Trạng thái ứng dụng ------------------------- */
  let transactions = loadTransactions();
  let categories = loadCategories();
  let currentType = "income"; // loại đang chọn trên form
  let filters = { type: "all", category: "all", from: "", to: "", search: "" };
  let currentPage = 1; // [MỚI] trang hiện tại của bảng giao dịch
  let editingId = null; // [MỚI] id giao dịch đang được sửa, null = đang ở chế độ thêm mới
  let pendingConfirmAction = null; // [MỚI] hành động sẽ chạy khi người dùng bấm "Xóa" trong modal

  let pieChart = null;
  let barChart = null;

  /* ------------------------- Tham chiếu DOM ------------------------- */
  const el = {
    form: document.getElementById("transactionForm"),
    formPanelTitle: document.getElementById("formPanelTitle"),
    typeButtons: document.querySelectorAll(".type-btn"),
    amountInput: document.getElementById("amountInput"),
    dateInput: document.getElementById("dateInput"),
    categorySelect: document.getElementById("categorySelect"),
    noteInput: document.getElementById("noteInput"),
    submitBtn: document.getElementById("submitBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),

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

    // [MỚI] Phân trang
    pagination: document.getElementById("pagination"),
    pageIndicator: document.getElementById("pageIndicator"),
    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),

    // [MỚI] Modal xác nhận xóa
    confirmModal: document.getElementById("confirmModal"),
    confirmModalMessage: document.getElementById("confirmModalMessage"),
    confirmModalOk: document.getElementById("confirmModalOk"),
    confirmModalCancel: document.getElementById("confirmModalCancel"),
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
     [MỚI] ĐỊNH DẠNG SỐ TIỀN REAL-TIME TRONG Ô INPUT
     Người dùng gõ số thô (VD "1000000"), ô input tự hiển thị "1.000.000".
     Giá trị số thực luôn được lấy lại bằng cách bóc tách ký tự số qua
     getAmountValue() — tách biệt "hiển thị" và "dữ liệu" để tránh lỗi.
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
    // Định dạng lại có thể làm thay đổi độ dài chuỗi (thêm/bớt dấu chấm) —
    // đưa con trỏ về cuối để người dùng không bị "nhảy" vị trí gõ.
    if (wasAtEnd) {
      el.amountInput.setSelectionRange(el.amountInput.value.length, el.amountInput.value.length);
    }
  });

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
     [MỚI] CHẾ ĐỘ SỬA GIAO DỊCH
     Tái sử dụng chính form thêm mới: đổ dữ liệu giao dịch cần sửa vào
     form, đổi tiêu đề + nhãn nút, và khi submit sẽ cập nhật thay vì tạo
     bản ghi mới. Có nút "Hủy chỉnh sửa" để quay lại chế độ thêm mới.
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
    el.submitBtn.textContent = "Cập nhật giao dịch";
    el.cancelEditBtn.hidden = false;

    el.form.scrollIntoView({ behavior: "smooth", block: "start" });
    el.amountInput.focus();
  }

  function exitEditMode() {
    editingId = null;
    el.formPanelTitle.textContent = "Thêm giao dịch";
    el.submitBtn.textContent = "Lưu giao dịch";
    el.cancelEditBtn.hidden = true;

    currentType = "income";
    el.typeButtons.forEach((b) => b.classList.toggle("active", b.dataset.type === "income"));
    populateCategorySelect();
    el.amountInput.value = "";
    el.noteInput.value = "";
    el.dateInput.value = todayIso();
  }

  el.cancelEditBtn.addEventListener("click", exitEditMode);

  /* ====================================================================
     THÊM / CẬP NHẬT GIAO DỊCH
     ==================================================================== */
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();

    const amount = getAmountValue();
    if (!amount || amount <= 0) {
      el.amountInput.focus();
      return;
    }

    if (editingId) {
      // [MỚI] Chế độ sửa: cập nhật giao dịch đã tồn tại thay vì tạo mới
      const tx = transactions.find((t) => t.id === editingId);
      if (tx) {
        tx.type = currentType;
        tx.amount = Math.round(amount);
        tx.category = el.categorySelect.value;
        tx.date = el.dateInput.value || todayIso();
        tx.note = el.noteInput.value.trim();
      }
      saveTransactions();
      exitEditMode();
    } else {
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

      // [CẬP NHẬT — UX] Sau khi thêm thành công: xóa số tiền/ghi chú,
      // chọn lại danh mục đầu tiên trong danh sách, và focus về ô số tiền
      // để người dùng nhập liên tiếp nhiều giao dịch nhanh hơn.
      el.amountInput.value = "";
      el.noteInput.value = "";
      if (el.categorySelect.options.length > 0) {
        el.categorySelect.selectedIndex = 0;
      }
      el.amountInput.focus();
    }

    refreshAll();
  });

  /* ====================================================================
     [MỚI] MODAL XÁC NHẬN (dùng chung cho việc xóa giao dịch)
     Thay cho window.confirm() mặc định — giữ đúng phong cách thiết kế
     và cho phép đóng bằng nút Hủy, click ra ngoài, hoặc phím Esc.
     ==================================================================== */
  function showConfirmModal(message, onConfirm) {
    el.confirmModalMessage.textContent = message;
    pendingConfirmAction = onConfirm;
    el.confirmModal.hidden = false;
    el.confirmModalOk.focus();
  }

  function hideConfirmModal() {
    el.confirmModal.hidden = true;
    pendingConfirmAction = null;
  }

  el.confirmModalCancel.addEventListener("click", hideConfirmModal);
  el.confirmModalOk.addEventListener("click", () => {
    if (typeof pendingConfirmAction === "function") pendingConfirmAction();
    hideConfirmModal();
  });
  // Click ra ngoài modal-box (lên overlay) để đóng
  el.confirmModal.addEventListener("click", (e) => {
    if (e.target === el.confirmModal) hideConfirmModal();
  });
  // Nhấn Esc để đóng
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.confirmModal.hidden) hideConfirmModal();
  });

  /* ====================================================================
     XÓA GIAO DỊCH
     ==================================================================== */
  function deleteTransaction(id) {
    transactions = transactions.filter((t) => t.id !== id);
    saveTransactions();
    // Nếu đang sửa đúng giao dịch vừa bị xóa thì thoát chế độ sửa
    if (editingId === id) exitEditMode();
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

  // [CẬP NHẬT] Mỗi lần đổi bộ lọc: quay về trang 1 và vẽ lại cả bảng lẫn
  // biểu đồ, vì giờ biểu đồ cũng phụ thuộc vào bộ lọc.
  function onFiltersChanged() {
    currentPage = 1;
    renderTable();
    renderPieChart();
    renderBarChart();
  }

  el.searchInput.addEventListener("input", () => {
    filters.search = el.searchInput.value;
    onFiltersChanged();
  });
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
     HIỂN THỊ BẢNG GIAO DỊCH + [MỚI] PHÂN TRANG
     ==================================================================== */
  function renderTable() {
    const list = getFilteredTransactions();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));

    // Giữ currentPage trong phạm vi hợp lệ (VD sau khi xóa hết dòng ở trang cuối)
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    el.tableBody.innerHTML = "";

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

      // [MỚI] Cập nhật thanh phân trang — chỉ hiện khi có nhiều hơn 1 trang
      if (totalPages > 1) {
        el.pagination.hidden = false;
        el.pageIndicator.textContent = `Trang ${currentPage}/${totalPages} · ${list.length} giao dịch`;
        el.prevPageBtn.disabled = currentPage === 1;
        el.nextPageBtn.disabled = currentPage === totalPages;
      } else {
        el.pagination.hidden = true;
      }
    }

    // Gắn sự kiện xóa/sửa cho các nút vừa được tạo
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

  // [MỚI] Điều hướng phân trang
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
     TỔNG QUAN TÀI CHÍNH
     (Giữ nguyên: luôn phản ánh TOÀN BỘ giao dịch, không theo bộ lọc,
     vì đây là số dư thực tế của người dùng.)
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
     [SỬA LỖI] Cả 2 biểu đồ giờ dùng getFilteredTransactions() thay vì
     mảng transactions gốc, để phản ánh đúng bộ lọc người dùng đang áp dụng.
     ==================================================================== */
  function getThemeColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  const PALETTE = ["#AE4128", "#AD8524", "#2F6F4E", "#5C7A99", "#8A5A44", "#6B6F3B", "#9C6B9E", "#4E8B8B"];

  function renderPieChart() {
    const expenses = getFilteredTransactions().filter((t) => t.type === "expense"); // [SỬA LỖI] dùng dữ liệu đã lọc
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

  // [MỚI] Sinh danh sách các tháng "YYYY-MM" liên tục từ startMonth đến
  // endMonth (bao gồm cả 2 đầu mút), giúp biểu đồ cột không bị "nhảy cóc"
  // khi có tháng không phát sinh giao dịch nào ở giữa khoảng thời gian.
  function enumerateMonthRange(startMonth, endMonth) {
    const months = [];
    let [y, m] = startMonth.split("-").map(Number);
    const [endY, endM] = endMonth.split("-").map(Number);

    // Giới hạn an toàn để tránh vòng lặp vô hạn nếu dữ liệu ngày bị lỗi
    let safetyCounter = 0;
    while ((y < endY || (y === endY && m <= endM)) && safetyCounter < 1000) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      safetyCounter++;
    }
    return months;
  }

  function renderBarChart() {
    const filtered = getFilteredTransactions(); // [SỬA LỖI] dùng dữ liệu đã lọc

    // Gom số liệu theo tháng (YYYY-MM)
    const byMonth = {}; // { "2026-09": { income, expense } }
    filtered.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { income: 0, expense: 0 };
      byMonth[month][t.type] += t.amount;
    });

    // [SỬA LỖI/NÂNG CẤP] Sắp xếp mốc tháng theo trình tự thời gian thật
    // (không chỉ sắp xếp chuỗi các tháng CÓ dữ liệu, mà lấp đầy các tháng
    // trống ở giữa bằng giá trị 0), sau đó chỉ lấy 6 tháng gần nhất.
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
     (Xuất toàn bộ giao dịch, không giới hạn theo trang/bộ lọc, để người
     dùng luôn có bản sao lưu đầy đủ.)
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