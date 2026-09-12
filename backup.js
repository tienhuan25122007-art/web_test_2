/* =====================================================================
   BACKUP/RESTORE — Sao lưu & phục hồi dữ liệu qua file JSON
   Cách dùng:
   - Bấm nút ⬇ để tải file sao lưu về máy
   - Bấm nút ⬆ để chọn file và khôi phục
   ===================================================================== */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    transactions: "expenseTracker_transactions",
    categories: "expenseTracker_categories",
  };

  // DOM
  const backupBtn = document.getElementById("backupBtn");
  const restoreBtn = document.getElementById("restoreBtn");
  const restoreFileInput = document.getElementById("restoreFileInput");

  /* --------------------------------------------------------------------
     TIỆN ÍCH
     -------------------------------------------------------------------- */
  function todayStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function readStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Fallback toast nếu script.js chưa load
  function toast(msg, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(msg, type);
      return;
    }
    // Toast tạm nếu chưa có
    let t = document.getElementById("__backup_toast__");
    if (!t) {
      t = document.createElement("div");
      t.id = "__backup_toast__";
      t.style.cssText = `
        position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
        background: ${type === "error" ? "#B84830" : "#2F7A56"}; color: #fff;
        padding: 12px 22px; border-radius: 10px; font-size: 13.5px;
        font-weight: 500; z-index: 99999; box-shadow: 0 12px 32px rgba(0,0,0,0.3);
        transition: opacity .25s; font-family: sans-serif;
      `;
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  // Fallback modal xác nhận nếu script.js chưa load
  function askConfirm(message, onOk) {
    if (typeof window.showConfirmModal === "function") {
      window.showConfirmModal(message, onOk);
      return;
    }
    if (window.confirm(message)) onOk();
  }

  // Gọi refresh UI sau khi phục hồi (script.js đã expose chưa? Chưa — ta dùng location.reload)
  function refreshUI() {
    // Cách đơn giản: reload trang để mọi thứ đọc lại localStorage
    // Nhưng để smooth hơn, thử trigger sự kiện nếu app có
    window.dispatchEvent(new CustomEvent("backup:restored"));
  }

  /* --------------------------------------------------------------------
     SAO LƯU — Tải file JSON
     -------------------------------------------------------------------- */
  function handleBackup() {
    const transactions = readStorage(STORAGE_KEYS.transactions) || [];
    const categories = readStorage(STORAGE_KEYS.categories);
    const theme = localStorage.getItem("expenseTracker_theme") || "light";

    if (transactions.length === 0 && !categories) {
      toast("Chưa có dữ liệu để sao lưu", "error");
      return;
    }

    const backup = {
      app: "SoChiTieu",
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: {
        transactionCount: transactions.length,
        incomeCount: transactions.filter(t => t.type === "income").length,
        expenseCount: transactions.filter(t => t.type === "expense").length,
      },
      theme: theme,
      transactions: transactions,
      categories: categories || null,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `so-chi-tieu_backup_${todayStamp()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Đã tải ${transactions.length} giao dịch về máy`);
  }

  /* --------------------------------------------------------------------
     PHỤC HỒI — Đọc file JSON và ghi đè localStorage
     -------------------------------------------------------------------- */
  function handleRestoreFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (ev) => {
      let data;
      try {
        data = JSON.parse(ev.target.result);
      } catch (err) {
        toast("File JSON không hợp lệ", "error");
        return;
      }

      // Kiểm tra cấu trúc tối thiểu
      if (!data || typeof data !== "object" || !Array.isArray(data.transactions)) {
        toast("File không phải bản sao lưu của Sổ Chi Tiêu", "error");
        return;
      }

      const txCount = data.transactions.length;
      const exportedAt = data.exportedAt
        ? new Date(data.exportedAt).toLocaleString("vi-VN")
        : "không rõ";

      const msg =
        `Phục hồi từ file?\n\n` +
        `• Số giao dịch: ${txCount}\n` +
        `• Xuất lúc: ${exportedAt}\n\n` +
        `⚠ Dữ liệu hiện tại sẽ bị GHI ĐÈ HOÀN TOÀN.`;

      askConfirm(msg, () => {
        // Ghi đè transactions
        writeStorage(STORAGE_KEYS.transactions, data.transactions);

        // Ghi đè categories nếu có
        if (data.categories && typeof data.categories === "object") {
          writeStorage(STORAGE_KEYS.categories, {
            income: Array.isArray(data.categories.income) ? data.categories.income : [],
            expense: Array.isArray(data.categories.expense) ? data.categories.expense : [],
          });
        }

        // Ghi đè theme nếu có
        if (data.theme === "dark" || data.theme === "light") {
          localStorage.setItem("expenseTracker_theme", data.theme);
        }

        toast(`Đã phục hồi ${txCount} giao dịch`);

        // Reload sau 800ms để đảm bảo mọi thứ đồng bộ
        setTimeout(() => location.reload(), 800);
      });
    };

    reader.onerror = () => {
      toast("Không đọc được file", "error");
    };

    reader.readAsText(file, "utf-8");
  }

  /* --------------------------------------------------------------------
     GẮN SỰ KIỆN
     -------------------------------------------------------------------- */
  backupBtn.addEventListener("click", handleBackup);

  restoreBtn.addEventListener("click", () => {
    restoreFileInput.click();
  });

  restoreFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleRestoreFile(file);
    // Reset value để có thể chọn lại cùng 1 file
    e.target.value = "";
  });

  // Hỗ trợ kéo-thả file JSON vào trang để phục hồi
  document.addEventListener("dragover", (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      document.body.style.outline = "3px dashed var(--gold, #B08C2A)";
      document.body.style.outlineOffset = "-8px";
    }
  });

  document.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) {
      document.body.style.outline = "";
    }
  });

  document.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".json")) {
        e.preventDefault();
        document.body.style.outline = "";
        handleRestoreFile(file);
      }
    }
  });

  console.log("💾 Backup/Restore module đã sẵn sàng");
})();