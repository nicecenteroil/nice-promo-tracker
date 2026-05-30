import * as db from './db.js';

// ==========================================
// STATE MANAGEMENT & GLOBALS
// ==========================================
let currentTab = 'dashboard';
let currentRole = 'admin'; // 'admin' or 'dsr'
let uploadedReceiptBase64 = '';
let uploadedDeliveryPhotoBase64 = '';
let selectedDsrRate = 3; // default 3%
let selectedDsrId = ''; // selected DSR for DSR tab
let selectedModalDsrRate = 3; // default 3% for modal
let uploadedModalReceiptBase64 = ''; // base64 for modal receipt

// ==========================================
// DOM ELEMENT SELECTORS
// ==========================================
const sidebarNavItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.tab-content');
const pageTitleEl = document.getElementById('page-title');
const pageSubtitleEl = document.getElementById('page-subtitle');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const approvalBadge = document.getElementById('approval-badge');
const roleSelect = document.getElementById('role-select');

// ==========================================
// CORE APP INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  db.initDB();
  
  // Load User Theme Preference
  const savedTheme = localStorage.getItem('castrol_theme') || 'dark-theme';
  document.body.className = savedTheme;

  // Load User Role Preference
  currentRole = localStorage.getItem('castrol_active_role') || 'admin';
  if (roleSelect) {
    roleSelect.value = currentRole;
  }
  
  setupEventListeners();
  applyRolePermissions(currentRole);
  updateApprovalBadgeCount();
  switchTab(currentTab);
  
  // Set default dates to today
  const today = new Date().toISOString().split('T')[0];
  const earnDateInput = document.getElementById('earn-date');
  const claimDateInput = document.getElementById('claim-date');
  if (earnDateInput) earnDateInput.value = today;
  if (claimDateInput) claimDateInput.value = today;

  // Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

// ==========================================
// ROLE PERMISSIONS CONTROL
// ==========================================
function applyRolePermissions(role) {
  currentRole = role;
  localStorage.setItem('castrol_active_role', role);

  const userAvatarChar = document.getElementById('user-avatar-char');
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayRole = document.getElementById('user-display-role');
  
  const navDashboard = document.getElementById('nav-dashboard');
  const navDsrs = document.getElementById('nav-dsrs');
  const navApproval = document.getElementById('nav-approval');
  const navSettings = document.getElementById('nav-settings');
  const dashToApprovalBtn = document.getElementById('dashboard-to-approval-btn');

  const isDsr = role.startsWith('DSR-');
  
  if (isDsr) {
    const dsrs = db.getDSRs();
    const dsrObj = dsrs.find(d => d.id === role);
    
    if (userAvatarChar) userAvatarChar.innerText = dsrObj ? dsrObj.name[0] : 'ส';
    if (userDisplayName) userDisplayName.innerText = dsrObj ? dsrObj.name : 'พนักงานขาย DSR';
    if (userDisplayRole) userDisplayRole.innerText = 'พนักงานขาย / เซลล์ DSR';

    if (navDashboard) navDashboard.style.display = 'none';
    if (navDsrs) navDsrs.style.display = 'none';
    if (navApproval) navApproval.style.display = 'none';
    if (navSettings) navSettings.style.display = 'none';
    if (dashToApprovalBtn) dashToApprovalBtn.style.display = 'none';

    // Force switch DSR to Customers tab
    switchTab('customers');
  } else {
    if (userAvatarChar) userAvatarChar.innerText = 'ภ';
    if (userDisplayName) userDisplayName.innerText = 'คุณภูมิ';
    if (userDisplayRole) userDisplayRole.innerText = 'ผู้ดูแลระบบ / แอดมิน';

    if (navDashboard) navDashboard.style.display = 'flex';
    if (navDsrs) navDsrs.style.display = 'flex';
    if (navApproval) navApproval.style.display = 'flex';
    if (navSettings) navSettings.style.display = 'flex';
    if (dashToApprovalBtn) dashToApprovalBtn.style.display = 'inline-flex';
  }
}

// ==========================================
// IMAGE COMPRESSION UTILITY (HTML5 CANVAS)
// ==========================================
function compressImage(base64Str, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
  });
}

// ==========================================
// EVENT LISTENERS REGISTER
// ==========================================
function setupEventListeners() {
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      applyRolePermissions(e.target.value);
      showToast('สลับบทบาท', `เปลี่ยนบทบาทผู้ใช้งานเป็น ${e.target.value === 'admin' ? 'แอดมิน' : 'เซลล์ DSR'} แล้ว`, 'info');
    });
  }

  const dashToApprovalBtn = document.getElementById('dashboard-to-approval-btn');
  if (dashToApprovalBtn) {
    dashToApprovalBtn.addEventListener('click', () => switchTab('approval'));
  }

  // Tab Navigation Click Handlers
  sidebarNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Theme Toggle Handler
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Customer Tab Search and Filter
  document.getElementById('customer-search-input').addEventListener('input', renderCustomers);
  document.getElementById('filter-province').addEventListener('change', renderCustomers);
  document.getElementById('filter-segment').addEventListener('change', renderCustomers);
  document.getElementById('hide-zero-budget-checkbox').addEventListener('change', renderCustomers);

  // DSR Overview Search
  const dsrSearchInput = document.getElementById('dsr-customer-search-input');
  if (dsrSearchInput) {
    dsrSearchInput.addEventListener('input', renderDsrDetails);
  }

  // Quick search and DSR scoping for Earn & Claim
  setupEarnCustomerFilter();
  setupClaimCustomerFilter();

  // Open Add Customer Modal
  document.getElementById('open-add-customer-modal-btn').addEventListener('click', () => {
    openModal('add-customer-modal');
    populateDsrDropdown('new-cust-dsr');
  });

  // Modal Closures
  document.getElementById('btn-close-add-customer').addEventListener('click', () => closeModal('add-customer-modal'));
  document.getElementById('btn-cancel-customer').addEventListener('click', () => closeModal('add-customer-modal'));
  document.getElementById('btn-close-ledger').addEventListener('click', () => closeModal('ledger-modal'));
  document.getElementById('btn-close-reject').addEventListener('click', () => closeModal('reject-modal'));
  document.getElementById('btn-cancel-reject').addEventListener('click', () => closeModal('reject-modal'));
  document.getElementById('btn-close-lightbox').addEventListener('click', () => closeModal('receipt-lightbox'));
  document.getElementById('btn-close-delivery-modal').addEventListener('click', () => closeModal('delivery-upload-modal'));
  document.getElementById('btn-cancel-delivery').addEventListener('click', () => closeModal('delivery-upload-modal'));

  // Add Customer Form Submit
  document.getElementById('add-customer-form').addEventListener('submit', handleAddCustomerSubmit);

  // Earn Form: Rate Selector buttons
  const rateBtns = document.querySelectorAll('.btn-rate');
  const customRateInput = document.getElementById('earn-custom-rate');
  const earnAmountInput = document.getElementById('earn-amount');

  rateBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      rateBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedDsrRate = parseFloat(e.target.getAttribute('data-rate'));
      customRateInput.value = '';
      calculateEarnPromoValue();
    });
  });

  customRateInput.addEventListener('input', () => {
    rateBtns.forEach(b => b.classList.remove('active'));
    selectedDsrRate = parseFloat(customRateInput.value) || 0;
    calculateEarnPromoValue();
  });

  earnAmountInput.addEventListener('input', calculateEarnPromoValue);

  // Earn Form Submit
  document.getElementById('earn-form').addEventListener('submit', handleEarnFormSubmit);

  // Claim Form: Customer selection change (shows available budget)
  document.getElementById('claim-customer-select').addEventListener('change', handleClaimCustomerChange);

  // Claim Form: Check budget on input
  document.getElementById('claim-amount').addEventListener('input', validateClaimAmountLimit);

  // Claim Receipt Image Handling
  const receiptDropZone = document.getElementById('receipt-drop-zone');
  const receiptFileInput = document.getElementById('claim-receipt-input');
  
  receiptDropZone.addEventListener('click', () => receiptFileInput.click());
  receiptFileInput.addEventListener('change', handleReceiptFileSelect);

  receiptDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    receiptDropZone.classList.add('dragover');
  });

  ['dragleave', 'drop'].forEach(eventName => {
    receiptDropZone.addEventListener(eventName, () => receiptDropZone.classList.remove('dragover'));
  });

  receiptDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      processReceiptFile(e.dataTransfer.files[0]);
    }
  });

  // Remove Receipt Image
  document.getElementById('btn-remove-receipt').addEventListener('click', (e) => {
    e.stopPropagation();
    resetReceiptUpload();
  });

  // Delivery Photo Upload triggers
  const deliveryDropZone = document.getElementById('delivery-drop-zone');
  const deliveryFileInput = document.getElementById('delivery-photo-input');
  
  deliveryDropZone.addEventListener('click', () => deliveryFileInput.click());
  deliveryFileInput.addEventListener('change', handleDeliveryPhotoSelect);

  deliveryDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    deliveryDropZone.classList.add('dragover');
  });

  ['dragleave', 'drop'].forEach(eventName => {
    deliveryDropZone.addEventListener(eventName, () => deliveryDropZone.classList.remove('dragover'));
  });

  deliveryDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      processDeliveryPhoto(e.dataTransfer.files[0]);
    }
  });

  document.getElementById('btn-remove-delivery-photo').addEventListener('click', (e) => {
    e.stopPropagation();
    resetDeliveryPhotoUpload();
  });

  // Claim Form Submit
  document.getElementById('claim-form').addEventListener('submit', handleClaimFormSubmit);

  // Delivery Form Submit
  document.getElementById('delivery-upload-form').addEventListener('submit', handleDeliveryFormSubmit);

  // Reject Form Submit
  document.getElementById('reject-form').addEventListener('submit', handleRejectFormSubmit);

  // Database Management Handlers (Settings Tab)
  document.getElementById('btn-export-db').addEventListener('click', handleDatabaseExport);
  document.getElementById('btn-trigger-import').addEventListener('click', () => {
    document.getElementById('import-db-input').click();
  });
  document.getElementById('import-db-input').addEventListener('change', handleDatabaseImport);
  document.getElementById('btn-reset-db').addEventListener('click', handleDatabaseReset);

  // ==========================================
  // NEW MODALS EVENT LISTENERS
  // ==========================================
  // Close buttons
  document.getElementById('btn-close-earn-modal').addEventListener('click', () => closeModal('earn-modal'));
  document.getElementById('btn-cancel-earn-modal').addEventListener('click', () => closeModal('earn-modal'));
  document.getElementById('btn-close-claim-modal').addEventListener('click', () => closeModal('claim-modal'));
  document.getElementById('btn-cancel-claim-modal').addEventListener('click', () => closeModal('claim-modal'));

  // Earn Modal Form Inputs
  const modalRateBtns = document.querySelectorAll('#earn-modal-form .btn-rate');
  const modalCustomRateInput = document.getElementById('earn-modal-custom-rate');
  const modalEarnAmountInput = document.getElementById('earn-modal-amount');

  modalRateBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      modalRateBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedModalDsrRate = parseFloat(e.target.getAttribute('data-rate'));
      modalCustomRateInput.value = '';
      calculateEarnModalPromoValue();
    });
  });

  modalCustomRateInput.addEventListener('input', () => {
    modalRateBtns.forEach(b => b.classList.remove('active'));
    selectedModalDsrRate = parseFloat(modalCustomRateInput.value) || 0;
    calculateEarnModalPromoValue();
  });

  modalEarnAmountInput.addEventListener('input', calculateEarnModalPromoValue);

  // Claim Modal Form Inputs
  document.getElementById('claim-modal-amount').addEventListener('input', validateModalClaimAmountLimit);

  // Modal Upload Zone Listeners
  const receiptModalDropZone = document.getElementById('receipt-modal-drop-zone');
  const receiptModalFileInput = document.getElementById('claim-modal-receipt-input');

  receiptModalDropZone.addEventListener('click', () => receiptModalFileInput.click());
  receiptModalFileInput.addEventListener('change', handleModalReceiptFileSelect);

  receiptModalDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    receiptModalDropZone.classList.add('dragover');
  });

  ['dragleave', 'drop'].forEach(eventName => {
    receiptModalDropZone.addEventListener(eventName, () => receiptModalDropZone.classList.remove('dragover'));
  });

  receiptModalDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      processModalReceiptFile(e.dataTransfer.files[0]);
    }
  });

  document.getElementById('btn-remove-modal-receipt').addEventListener('click', (e) => {
    e.stopPropagation();
    resetModalReceiptUpload();
  });

  // Modal Forms Submit
  document.getElementById('earn-modal-form').addEventListener('submit', handleEarnModalFormSubmit);
  document.getElementById('claim-modal-form').addEventListener('submit', handleClaimModalFormSubmit);
}

// Switch tabs and trigger refresh of active views
window.switchTab = function(tabId) {
  currentTab = tabId;
  
  sidebarNavItems.forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  tabSections.forEach(section => {
    if (section.id === `${tabId}-tab`) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });

  switch (tabId) {
    case 'dashboard':
      pageTitleEl.innerText = 'แผงควบคุม (Dashboard)';
      pageSubtitleEl.innerText = 'ภาพรวมงบสะสมและการแลกเปลี่ยนของแถมคาสตรอล';
      renderDashboard();
      break;
    case 'customers':
      pageTitleEl.innerText = 'ข้อมูลร้านค้า & สมุดบัญชี';
      pageSubtitleEl.innerText = 'จัดการประวัติงบสะสมรายร้านค้า (Customer Ledgers)';
      renderCustomers();
      renderPendingDeliveries();
      break;
    case 'dsrs':
      pageTitleEl.innerText = 'ข้อมูลแยกตามราย DSR';
      pageSubtitleEl.innerText = 'สถิติงบประมาณสะสมและการเคลมแยกตามพนักงานขาย DSR';
      renderDsrTab();
      break;
    case 'earn':
      pageTitleEl.innerText = 'สะสมงบประมาณใหม่';
      pageSubtitleEl.innerText = 'คำนวณและสะสมงบประมาณส่งเสริมการขายจากบิลคาสตรอล';
      populateEarnDropdowns();
      break;
    case 'claim':
      pageTitleEl.innerText = 'แลกของแถมและประวัติการนำส่ง';
      pageSubtitleEl.innerText = 'แจ้งความต้องการนำงบไปซื้อของแถม และยืนยันส่งมอบของให้ลูกค้า';
      populateClaimDropdowns();
      renderPendingDeliveries();
      break;
    case 'approval':
      pageTitleEl.innerText = 'ตรวจสอบ & อนุมัติบิล';
      pageSubtitleEl.innerText = 'ตรวจสอบหลักฐานใบเสร็จของแถมจากเซลล์เพื่อตัดงบประมาณ';
      renderApproval();
      break;
    case 'settings':
      pageTitleEl.innerText = 'ตั้งค่าระบบฐานข้อมูล';
      pageSubtitleEl.innerText = 'สำรองข้อมูลและจัดการสภาพแวดล้อมจำลอง';
      break;
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
};

// ==========================================
// RENDERERS
// ==========================================

// 1. Dashboard Renderer
function renderDashboard() {
  const stats = db.getGlobalStats();
  
  document.getElementById('stat-total-accumulated').innerHTML = `${stats.totalAccumulated.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span class="currency">฿</span>`;
  document.getElementById('stat-total-claimed').innerHTML = `${stats.totalClaimed.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span class="currency">฿</span>`;
  document.getElementById('stat-total-pending').innerHTML = `${stats.totalPending.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span class="currency">฿</span>`;
  document.getElementById('stat-total-remaining').innerHTML = `${stats.totalRemaining.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span class="currency">฿</span>`;

  // Render Province Bars
  const provinceListEl = document.getElementById('province-list');
  provinceListEl.innerHTML = '';
  
  const sortedProvinces = [...stats.provinces].sort((a, b) => b.accumulated - a.accumulated);
  const maxAccumulated = sortedProvinces.length > 0 ? Math.max(...sortedProvinces.map(p => p.accumulated), 1) : 1;

  if (sortedProvinces.length === 0) {
    provinceListEl.innerHTML = '<p class="text-muted text-center py-4">ไม่มีข้อมูลยอดขายในพื้นที่</p>';
  }

  sortedProvinces.forEach(p => {
    const percentage = (p.accumulated / maxAccumulated) * 100;
    const barHtml = `
      <div class="province-bar-item">
        <div class="province-bar-info">
          <span>${p.province}</span>
          <span class="font-semibold text-success">${p.remaining.toLocaleString('th-TH')} ฿ คงเหลือ</span>
        </div>
        <div class="province-progress-track">
          <div class="province-progress-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="province-bar-stats">
          <span>สะสม: ${p.accumulated.toLocaleString('th-TH')} ฿</span>
          <span>•</span>
          <span>เคลมแล้ว: ${p.claimed.toLocaleString('th-TH')} ฿</span>
        </div>
      </div>
    `;
    provinceListEl.insertAdjacentHTML('beforeend', barHtml);
  });

  // Render Recent Pending Approvals (Max 3)
  const recentPendingEl = document.getElementById('recent-pending-claims');
  recentPendingEl.innerHTML = '';
  
  const pendingTxns = db.getTransactions()
    .filter(t => t.type === 'claim' && t.status === 'pending')
    .slice(0, 3);
  
  const customers = db.getCustomers();
  
  if (pendingTxns.length === 0) {
    recentPendingEl.innerHTML = `
      <div class="text-center py-8 text-muted">
        <i data-lucide="check-circle" style="width:32px;height:32px;color:var(--color-success);margin: 0 auto 8px;"></i>
        <p>ไม่มีคำขอเบิกของแถมค้างตรวจสอบ</p>
      </div>
    `;
  } else {
    pendingTxns.forEach(t => {
      const custName = customers.find(c => c.id === t.customerId)?.name || 'ไม่พบชื่อร้าน';
      const actionBtn = currentRole === 'admin' 
        ? `<button class="btn btn-sm btn-secondary" onclick="switchTab('approval')">ตรวจบิล</button>` 
        : `<span class="status-tag pending">รอตรวจบิล</span>`;
      
      const itemHtml = `
        <div class="claim-strip-item">
          <div class="claim-strip-left">
            <span class="claim-strip-title">${custName}</span>
            <span class="claim-strip-subtitle">
              <span>แลก: ${t.description}</span>
              <span>•</span>
              <span>${formatThaiDate(t.date)}</span>
            </span>
          </div>
          <div class="claim-strip-right">
            <span class="claim-strip-val">-${t.promoVal.toLocaleString('th-TH')} ฿</span>
            ${actionBtn}
          </div>
        </div>
      `;
      recentPendingEl.insertAdjacentHTML('beforeend', itemHtml);
    });
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// 2. Customer List Renderer with Segment & Budget Filters
function renderCustomers() {
  const searchQuery = document.getElementById('customer-search-input').value.toLowerCase();
  const filterProvince = document.getElementById('filter-province').value;
  const filterSegment = document.getElementById('filter-segment').value;
  const hideZeroBudget = document.getElementById('hide-zero-budget-checkbox').checked;
  
  const customers = db.getCustomers();
  const dsrs = db.getDSRs();
  const tbody = document.getElementById('customers-list-tbody');
  tbody.innerHTML = '';

  const isDsr = currentRole.startsWith('DSR-');

  const filtered = customers.filter(c => {
    // DSR-specific customer view scoping
    if (isDsr && c.dsrId !== currentRole) {
      return false;
    }

    const dsrName = dsrs.find(d => d.id === c.dsrId)?.name || '';
    const stats = db.getCustomerStats(c.id);

    // Filter Search
    const matchesSearch = c.name.toLowerCase().includes(searchQuery) || 
                          c.id.toLowerCase().includes(searchQuery) ||
                          c.province.toLowerCase().includes(searchQuery) ||
                          dsrName.toLowerCase().includes(searchQuery);
    
    // Filter Province
    const matchesProvince = filterProvince === '' || c.province === filterProvince;
    
    // Filter Product Segment (PCO/MCO)
    let matchesSegment = true;
    if (filterSegment === 'PCO') {
      matchesSegment = c.segment.includes('PCO') || c.segment === 'ทั้งคู่';
    } else if (filterSegment === 'MCO') {
      matchesSegment = c.segment.includes('MCO') || c.segment === 'ทั้งคู่';
    } else if (filterSegment === 'both') {
      matchesSegment = c.segment === 'ทั้งคู่';
    }

    // Filter Zero Accumulated Budget
    let matchesZeroBudget = true;
    if (hideZeroBudget) {
      matchesZeroBudget = stats.accumulated > 0;
    }

    return matchesSearch && matchesProvince && matchesSegment && matchesZeroBudget;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-8">
          ไม่พบข้อมูลร้านค้าตามเงื่อนไขที่เลือก
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(c => {
    const dsrName = dsrs.find(d => d.id === c.dsrId)?.name || 'ไม่มีผู้ดูแล';
    const stats = db.getCustomerStats(c.id);
    
    const remainingClass = stats.remaining < 0 ? 'text-danger' : 'text-primary';

    // Check for pending deliveries
    const txns = db.getTransactions();
    const hasPendingDelivery = txns.some(t => t.customerId === c.id && t.type === 'claim' && t.status === 'approved_delivery');
    const deliveryBadge = hasPendingDelivery ? ` <span class="status-tag approved_delivery" style="font-size: 10px; padding: 1px 4px; margin-left: 4px;">รอส่งมอบ</span>` : '';

    // Badge styling for customer segment
    let segmentBadge = '';
    if (c.segment === 'ทั้งคู่') {
      segmentBadge = `<br><span class="status-tag approved mt-1" style="font-size: 10px; padding: 1px 4px;">PCO & MCO</span>`;
    } else if (c.segment.includes('PCO')) {
      segmentBadge = `<br><span class="status-tag info mt-1" style="font-size: 10px; padding: 1px 4px; background-color: rgba(14, 165, 233, 0.08); color: var(--color-info); border: 1px solid rgba(14, 165, 233, 0.15)">PCO (รถยนต์)</span>`;
    } else {
      segmentBadge = `<br><span class="status-tag warning mt-1" style="font-size: 10px; padding: 1px 4px; background-color: rgba(245, 158, 11, 0.08); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.15)">MCO (มอไซค์)</span>`;
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${c.id}</strong></td>
      <td><span class="font-semibold">${c.name}</span>${deliveryBadge}<br><span class="text-muted text-xs">${c.address || ''}</span></td>
      <td><span class="tag-province">${c.province}</span>${segmentBadge}</td>
      <td>${dsrName}</td>
      <td style="font-weight:600;">${Math.round(stats.accumulated).toLocaleString('th-TH')} ฿</td>
      <td class="text-success" style="font-weight:600;">${Math.round(stats.claimed).toLocaleString('th-TH')} ฿</td>
      <td class="${remainingClass}" style="font-weight:700;">${Math.round(stats.remaining).toLocaleString('th-TH')} ฿</td>
      <td>
        <div class="action-btn-group">
          <button class="btn btn-sm btn-success" onclick="openEarnModal('${c.id}')">
            <i data-lucide="plus-circle" style="width:12px;height:12px;"></i> สะสมงบ
          </button>
          <button class="btn btn-sm btn-primary" style="background-color: var(--color-info); border-color: var(--color-info);" onclick="openClaimModal('${c.id}')">
            <i data-lucide="gift" style="width:12px;height:12px;"></i> เบิกของแถม
          </button>
          <button class="btn btn-sm btn-secondary" onclick="openLedger('${c.id}')">
            <i data-lucide="book-open" style="width:12px;height:12px;"></i> สมุดบัญชี
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// LEDGER DETAIL MODAL & STATEMENT
// ==========================================
window.openLedger = function(customerId) {
  const customer = db.getCustomers().find(c => c.id === customerId);
  const dsrs = db.getDSRs();
  
  if (!customer) return;

  const dsrName = dsrs.find(d => d.id === customer.dsrId)?.name || 'ไม่มี';
  const stats = db.getCustomerStats(customerId);

  // Set Modal Info Headers
  document.getElementById('modal-cust-name').innerText = customer.name;
  document.getElementById('modal-cust-province').innerText = `${customer.province} | กลุ่มสินค้า: ${customer.segment}`;
  document.getElementById('modal-cust-address').innerText = customer.address || '';
  document.getElementById('modal-cust-dsr').innerText = dsrName;

  // Set Modal Summary Cards
  document.getElementById('modal-stat-accumulated').innerText = `${stats.accumulated.toLocaleString('th-TH')} ฿`;
  document.getElementById('modal-stat-claimed').innerText = `${stats.claimed.toLocaleString('th-TH')} ฿`;
  
  const pendingEl = document.getElementById('modal-stat-pending');
  pendingEl.innerText = `${stats.pendingClaim.toLocaleString('th-TH')} ฿`;
  
  const availableEl = document.getElementById('modal-stat-available');
  availableEl.innerText = `${stats.availableToClaim.toLocaleString('th-TH')} ฿`;
  if (stats.availableToClaim < 0) {
    availableEl.className = 'val text-danger';
  } else {
    availableEl.className = 'val text-info';
  }

  // Render Ledger History Table (Simplified - No Qty/DSR/Invoice clutter per row)
  const txns = db.getTransactions()
    .filter(t => t.customerId === customerId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const ledgerTbody = document.getElementById('ledger-history-tbody');
  ledgerTbody.innerHTML = '';

  if (txns.length === 0) {
    ledgerTbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-6">ไม่มีรายการความเคลื่อนไหวบัญชี</td>
      </tr>
    `;
  } else {
    txns.forEach(t => {
      let earnCol = '-';
      let claimCol = '-';
      let statusHtml = '';

      if (t.type === 'earn') {
        earnCol = `<span class="text-success font-semibold">+${t.promoVal.toLocaleString('th-TH')} ฿</span>`;
        statusHtml = `<span class="status-tag approved">สะสมสำเร็จ</span>`;
      } else if (t.type === 'claim') {
        let receiptLink = '';
        if (t.receiptUrl) {
          receiptLink = `<button class="btn btn-sm btn-text p-0 text-info font-semibold" style="font-size:11px;" onclick="openLightbox('${t.receiptUrl}', 'ใบเสร็จจัดซื้อ: ${t.description}')">🔎 ดูบิลซื้อ</button>`;
        }
        
        let deliveryLink = '';
        if (t.deliveryPhotoUrl) {
          deliveryLink = `<button class="btn btn-sm btn-text p-0 text-success font-semibold ml-2" style="font-size:11px;" onclick="openLightbox('${t.deliveryPhotoUrl}', 'ภาพส่งมอบของแถม: ${t.description}')">📸 ดูรูปส่งมอบ</button>`;
        }
        
        claimCol = `<span class="text-warning font-semibold">-${t.promoVal.toLocaleString('th-TH')} ฿</span><br><div class="flex-align gap-2 mt-1">${receiptLink} ${deliveryLink}</div>`;
        
        if (t.status === 'approved_delivery') {
          statusHtml = `<span class="status-tag approved_delivery">อนุมัติแล้ว/รอส่งมอบ</span>`;
        } else if (t.status === 'delivered') {
          statusHtml = `<span class="status-tag delivered">ส่งมอบสำเร็จ</span>`;
        } else if (t.status === 'pending') {
          statusHtml = `<span class="status-tag pending">รอตรวจบิล</span>`;
        } else if (t.status === 'rejected') {
          statusHtml = `<span class="status-tag rejected" title="เหตุผล: ${t.rejectReason || ''}">ปฏิเสธบิล ⚠️</span>`;
        }
      }

      let clickAttr = '';
      let cursorClass = '';
      if (t.type === 'claim' && (t.receiptUrl || t.deliveryPhotoUrl)) {
        const previewUrl = t.deliveryPhotoUrl || t.receiptUrl;
        const previewTitle = t.deliveryPhotoUrl ? `ภาพส่งมอบของแถม: ${t.description}` : `ใบเสร็จจัดซื้อ: ${t.description}`;
        clickAttr = `onclick="openLightbox('${previewUrl}', '${previewTitle}')"`;
        cursorClass = 'clickable-ledger-item';
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="vertical-align:top;">${formatThaiDate(t.date)}</td>
        <td style="vertical-align:top;">
          <span class="font-semibold text-xs ${cursorClass}" ${clickAttr}>${t.description}</span>
        </td>
        <td style="text-align: center; vertical-align:top; font-weight: 500;">
          ${t.qty || '-'}
        </td>
        <td style="text-align: right; vertical-align:top;">${earnCol}</td>
        <td style="text-align: right; vertical-align:top;">${claimCol}</td>
        <td style="text-align: center; vertical-align:top;">${statusHtml}</td>
      `;
      ledgerTbody.appendChild(row);
    });
  }

  openModal('ledger-modal');
};

// ==========================================
// DROPDOWNS POPULATE & QUICK SEARCH
// ==========================================
function populateDsrDropdown(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML = '<option value="">-- เลือก DSR --</option>';
  db.getDSRs().forEach(d => {
    select.insertAdjacentHTML('beforeend', `<option value="${d.id}">${d.name} (${d.id})</option>`);
  });
}

function populateFilteredCustomerDropdown(elementId, dsrId, searchQuery = '') {
  const select = document.getElementById(elementId);
  if (!select) return;
  select.innerHTML = '<option value="">-- เลือกร้านค้า --</option>';
  
  const customers = db.getCustomers();
  const dsrs = db.getDSRs();
  const query = searchQuery.toLowerCase().trim();
  
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  
  const filtered = sorted.filter(c => {
    // Filter by DSR
    const matchesDsr = !dsrId || c.dsrId === dsrId;
    
    // Filter by Search Query (code, name, province, or dsr name)
    let matchesSearch = true;
    if (query) {
      const dsrName = dsrs.find(d => d.id === c.dsrId)?.name || '';
      matchesSearch = c.name.toLowerCase().includes(query) || 
                      c.id.toLowerCase().includes(query) || 
                      c.province.toLowerCase().includes(query) || 
                      dsrName.toLowerCase().includes(query);
    }
    
    return matchesDsr && matchesSearch;
  });
  
  filtered.forEach(c => {
    select.insertAdjacentHTML('beforeend', `<option value="${c.id}">${c.name} (${c.id} - ${c.province})</option>`);
  });
}

function setupEarnCustomerFilter() {
  const dsrSelect = document.getElementById('earn-dsr-select');
  const searchInput = document.getElementById('earn-customer-search');
  const customerSelect = document.getElementById('earn-customer-select');
  
  const filterHandler = () => {
    const dsrId = dsrSelect.value;
    const query = searchInput.value;
    populateFilteredCustomerDropdown('earn-customer-select', dsrId, query);
  };
  
  dsrSelect.addEventListener('change', filterHandler);
  searchInput.addEventListener('input', filterHandler);
  
  customerSelect.addEventListener('change', (e) => {
    const custId = e.target.value;
    const cust = db.getCustomers().find(c => c.id === custId);
    if (cust && cust.dsrId && !dsrSelect.value) {
      dsrSelect.value = cust.dsrId;
    }
    handleEarnCustomerSegmentChange(custId);
  });
}

function setupClaimCustomerFilter() {
  const dsrSelect = document.getElementById('claim-dsr-select');
  const searchInput = document.getElementById('claim-customer-search');
  const customerSelect = document.getElementById('claim-customer-select');
  
  const filterHandler = () => {
    const dsrId = dsrSelect.value;
    const query = searchInput.value;
    populateFilteredCustomerDropdown('claim-customer-select', dsrId, query);
  };
  
  dsrSelect.addEventListener('change', filterHandler);
  searchInput.addEventListener('input', filterHandler);
  
  customerSelect.addEventListener('change', (e) => {
    const custId = e.target.value;
    const cust = db.getCustomers().find(c => c.id === custId);
    if (cust && cust.dsrId && !dsrSelect.value) {
      dsrSelect.value = cust.dsrId;
    }
    handleClaimCustomerChange(e);
  });
}

function handleEarnCustomerSegmentChange(custId) {
  const rateBtns = document.querySelectorAll('#earn-form .btn-rate');
  const customRateInput = document.getElementById('earn-custom-rate');
  
  if (!custId) {
    rateBtns.forEach(btn => btn.removeAttribute('disabled'));
    return;
  }
  
  const cust = db.getCustomers().find(c => c.id === custId);
  if (!cust) return;
  
  const segment = cust.segment; // "PCO (รถยนต์)", "MCO (มอเตอร์ไซค์)", "ทั้งคู่"
  let validSegment = '';
  if (segment === 'PCO (รถยนต์)') {
    validSegment = 'PCO';
  } else if (segment === 'MCO (มอเตอร์ไซค์)') {
    validSegment = 'MCO';
  }
  
  let currentActiveBtn = document.querySelector('#earn-form .btn-rate.active');
  let isCurrentActiveValid = true;

  rateBtns.forEach(btn => {
    const btnSegment = btn.getAttribute('data-segment');
    if (validSegment && btnSegment && btnSegment !== validSegment) {
      btn.setAttribute('disabled', 'true');
      btn.classList.remove('active');
      if (btn === currentActiveBtn) {
        isCurrentActiveValid = false;
      }
    } else {
      btn.removeAttribute('disabled');
    }
  });
  
  if (!isCurrentActiveValid) {
    const firstEnabled = document.querySelector('#earn-form .btn-rate:not([disabled])');
    if (firstEnabled) {
      firstEnabled.classList.add('active');
      selectedDsrRate = parseFloat(firstEnabled.getAttribute('data-rate'));
      customRateInput.value = '';
    }
  }
  
  calculateEarnPromoValue();
}

function populateEarnDropdowns() {
  populateDsrDropdown('earn-dsr-select');
  const searchInput = document.getElementById('earn-customer-search');
  if (searchInput) searchInput.value = '';
  populateFilteredCustomerDropdown('earn-customer-select', '', '');
  handleEarnCustomerSegmentChange('');
}

function populateClaimDropdowns() {
  populateDsrDropdown('claim-dsr-select');
  const searchInput = document.getElementById('claim-customer-search');
  if (searchInput) searchInput.value = '';
  populateFilteredCustomerDropdown('claim-customer-select', '', '');
}

// ==========================================
// FORMS LOGIC & CALCULATIONS
// ==========================================
function calculateEarnPromoValue() {
  const amount = parseFloat(document.getElementById('earn-amount').value) || 0;
  const promoVal = Math.round((amount * selectedDsrRate) / 100);
  document.getElementById('earn-calculated-val').innerText = `${promoVal.toLocaleString('th-TH')} บาท`;
}

// Add New Customer Form handler
function handleAddCustomerSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-cust-name').value.trim();
  const province = document.getElementById('new-cust-province').value;
  const dsrId = document.getElementById('new-cust-dsr').value;
  const address = document.getElementById('new-cust-address').value.trim();

  if (!name || !province || !dsrId) {
    showToast('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
    return;
  }

  db.addCustomer({ name, province, dsrId, address, segment: 'PCO (รถยนต์)' });
  showToast('สำเร็จ', `เพิ่มร้านค้า "${name}" สำเร็จแล้ว`, 'success');
  closeModal('add-customer-modal');
  
  e.target.reset();
  renderCustomers();
}

// Add Sales Earn budget submit handler
function handleEarnFormSubmit(e) {
  e.preventDefault();
  const customerId = document.getElementById('earn-customer-select').value;
  const dsrId = document.getElementById('earn-dsr-select').value;
  const date = document.getElementById('earn-date').value;
  const amount = parseFloat(document.getElementById('earn-amount').value) || 0;
  const description = document.getElementById('earn-desc').value.trim() || 'สะสมงบยอดซื้อน้ำมันเครื่อง';

  if (!customerId || !dsrId || !date || amount <= 0) {
    showToast('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกข้อมูลที่มีเครื่องหมายดาว (*) ให้ครบถ้วน', 'warning');
    return;
  }

  const promoVal = (amount * selectedDsrRate) / 100;

  db.addTransaction({
    customerId,
    dsrId,
    date,
    type: 'earn',
    amount,
    rate: selectedDsrRate,
    promoVal,
    description,
    status: 'approved',
    receiptUrl: ''
  });

  showToast('สะสมงบประมาณสำเร็จ', `เพิ่มงบให้ลูกค้า ${promoVal.toLocaleString('th-TH')} บาท เรียบร้อยแล้ว`, 'success');
  e.target.reset();
  
  document.getElementById('earn-date').value = new Date().toISOString().split('T')[0];
  selectedDsrRate = 3;
  document.querySelectorAll('.btn-rate').forEach(b => {
    b.classList.remove('active');
    if (b.getAttribute('data-rate') === '3') b.classList.add('active');
  });
  document.getElementById('earn-calculated-val').innerText = '0.00 บาท';
  
  switchTab('dashboard');
}

// When claim customer select changes, show current budget
function handleClaimCustomerChange(e) {
  const customerId = e.target.value;
  const budgetInfoBox = document.getElementById('claim-budget-info');

  if (!customerId) {
    budgetInfoBox.style.display = 'none';
    return;
  }

  const stats = db.getCustomerStats(customerId);
  document.getElementById('claim-info-accumulated').innerText = `${stats.accumulated.toLocaleString('th-TH')} ฿`;
  document.getElementById('claim-info-claimed').innerText = `${stats.claimed.toLocaleString('th-TH')} ฿`;
  document.getElementById('claim-info-pending').innerText = `${stats.pendingClaim.toLocaleString('th-TH')} ฿`;
  
  const availableEl = document.getElementById('claim-info-available');
  availableEl.innerText = `${stats.availableToClaim.toLocaleString('th-TH')} ฿`;
  if (stats.availableToClaim < 0) {
    availableEl.className = 'val text-danger';
  } else {
    availableEl.className = 'val text-info';
  }

  budgetInfoBox.style.display = 'block';
  validateClaimAmountLimit();
}

// Check budget limit in real-time (Warning only - do NOT lock button)
function validateClaimAmountLimit() {
  const customerId = document.getElementById('claim-customer-select').value;
  const amount = parseFloat(document.getElementById('claim-amount').value) || 0;
  const warningEl = document.getElementById('claim-amount-warning');

  if (!customerId) return;

  const stats = db.getCustomerStats(customerId);
  
  if (amount > stats.availableToClaim) {
    warningEl.style.display = 'block';
    warningEl.innerHTML = `⚠️ ยอดเบิกของแถม (${amount.toLocaleString('th-TH')} ฿) เกินงบคงเหลือที่มี (${stats.availableToClaim.toLocaleString('th-TH')} ฿) ยอดคงเหลือจะติดลบ และจะหักล้างภายหลัง`;
  } else {
    warningEl.style.display = 'none';
  }
}

// ==========================================
// RECEIPT UPLOAD & COMPRESSION LOGIC
// ==========================================
function handleReceiptFileSelect(e) {
  if (e.target.files.length) {
    processReceiptFile(e.target.files[0]);
  }
}

function processReceiptFile(file) {
  if (!file.type.match('image.*')) {
    showToast('ไฟล์ไม่รองรับ', 'กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (JPG, PNG)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const rawBase64 = e.target.result;
    
    showToast('กำลังบีบอัดรูปภาพ', 'บีบอัดและปรับคุณภาพภาพบิลให้เหมาะสม...', 'info');
    uploadedReceiptBase64 = await compressImage(rawBase64, 800, 0.6);
    
    document.getElementById('upload-prompt').style.display = 'none';
    const previewContainer = document.getElementById('receipt-preview-container');
    previewContainer.style.display = 'block';
    document.getElementById('receipt-preview-img').src = uploadedReceiptBase64;
    
    document.getElementById('claim-receipt-input').removeAttribute('required');
    showToast('บีบอัดสำเร็จ', 'ภาพถูกบีบอัดให้มีขนาดเล็กเหมาะสมเรียบร้อย', 'success');
  };
  reader.readAsDataURL(file);
}

function resetReceiptUpload() {
  uploadedReceiptBase64 = '';
  document.getElementById('claim-receipt-input').value = '';
  document.getElementById('claim-receipt-input').setAttribute('required', 'true');
  document.getElementById('upload-prompt').style.display = 'flex';
  document.getElementById('receipt-preview-container').style.display = 'none';
  document.getElementById('receipt-preview-img').src = '';
}

// Claim form submit
function handleClaimFormSubmit(e) {
  e.preventDefault();
  const customerId = document.getElementById('claim-customer-select').value;
  const dsrId = document.getElementById('claim-dsr-select').value;
  const date = document.getElementById('claim-date').value;
  const amount = parseFloat(document.getElementById('claim-amount').value) || 0;
  const description = document.getElementById('claim-desc').value.trim();

  if (!customerId || !dsrId || !date || amount <= 0 || !description) {
    showToast('กรอกข้อมูลไม่ครบ', 'กรุณาระบุข้อมูลทุกช่องที่มีเครื่องหมายดาว (*)', 'warning');
    return;
  }

  if (!uploadedReceiptBase64) {
    showToast('ขาดหลักฐานบิล', 'กรุณาอัปโหลดรูปภาพบิลหรือใบเสร็จรับเงินด้วยค่ะ', 'warning');
    return;
  }

  db.addTransaction({
    customerId,
    dsrId,
    date,
    type: 'claim',
    amount: 0,
    rate: 0,
    promoVal: amount, // Claimed Value
    description,
    receiptUrl: uploadedReceiptBase64
  });

  showToast('ยื่นเรื่องคำขอเบิกแล้ว', 'คำขอถูกบันทึกและส่งไปยังขั้นตอนรอการอนุมัติบิล', 'success');
  
  e.target.reset();
  document.getElementById('claim-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('claim-budget-info').style.display = 'none';
  resetReceiptUpload();
  updateApprovalBadgeCount();

  switchTab('dashboard');
}

// ==========================================
// DELIVERY FLOW & PHOTO UPLOAD LOGIC
// ==========================================
function renderPendingDeliveries() {
  const isDsr = currentRole.startsWith('DSR-');
  const txns = db.getTransactions().filter(t => t.type === 'claim' && t.status === 'approved_delivery');
  const customers = db.getCustomers();
  const dsrs = db.getDSRs();
  
  // 1. Render in the claim tab if exists (admin view)
  const tbodyClaim = document.getElementById('delivery-pending-tbody');
  if (tbodyClaim) {
    tbodyClaim.innerHTML = '';
    if (txns.length === 0) {
      tbodyClaim.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-6">
            🎉 ไม่มีของแถมที่รอนำส่งมอบแก่ลูกค้า (ทุกรายการส่งของและถ่ายรูปครบถ้วนแล้ว)
          </td>
        </tr>
      `;
    } else {
      txns.forEach(t => {
        const cust = customers.find(c => c.id === t.customerId);
        const dsr = dsrs.find(d => d.id === t.dsrId);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${cust?.name || 'ไม่พบร้าน'}</strong><br><span class="text-muted text-xs">${cust?.province || ''}</span></td>
          <td>${t.description}</td>
          <td style="font-weight:600;">${Math.round(t.promoVal).toLocaleString('th-TH')} ฿</td>
          <td>${dsr?.name || 'ไม่มี'}</td>
          <td style="text-align: center;">
            <button class="btn btn-sm btn-success" onclick="openDeliveryModal('${t.id}')">
              <i data-lucide="camera" style="width:12px;height:12px;"></i> ยืนยันส่งมอบของ
            </button>
          </td>
        `;
        tbodyClaim.appendChild(row);
      });
    }
  }

  // 2. Render in the customers tab if DSR is logged in
  const tbodyCustTab = document.getElementById('customers-delivery-pending-tbody');
  const dsrDeliveriesPanel = document.getElementById('customers-delivery-tracking-panel');
  if (tbodyCustTab && dsrDeliveriesPanel) {
    if (isDsr) {
      dsrDeliveriesPanel.style.display = 'block';
      const dsrTxns = txns.filter(t => t.dsrId === currentRole);
      tbodyCustTab.innerHTML = '';
      if (dsrTxns.length === 0) {
        tbodyCustTab.innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-muted py-6">
              🎉 ไม่มีของแถมที่รอนำส่งมอบ (ทุกรายการส่งของครบถ้วนแล้ว)
            </td>
          </tr>
        `;
      } else {
        dsrTxns.forEach(t => {
          const cust = customers.find(c => c.id === t.customerId);
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><strong>${cust?.name || 'ไม่พบร้าน'}</strong><br><span class="text-muted text-xs">${cust?.province || ''}</span></td>
            <td>${t.description}</td>
            <td style="font-weight:600;">${Math.round(t.promoVal).toLocaleString('th-TH')} ฿</td>
            <td style="text-align: center;">
              <button class="btn btn-sm btn-success" onclick="openDeliveryModal('${t.id}')">
                <i data-lucide="camera" style="width:12px;height:12px;"></i> ยืนยันส่งมอบของ
              </button>
            </td>
          `;
          tbodyCustTab.appendChild(row);
        });
      }
    } else {
      dsrDeliveriesPanel.style.display = 'none';
    }
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

window.openDeliveryModal = function(txnId) {
  const txn = db.getTransactions().find(t => t.id === txnId);
  const custName = db.getCustomers().find(c => c.id === txn?.customerId)?.name || '';
  
  document.getElementById('delivery-txn-id').value = txnId;
  document.getElementById('delivery-modal-subtitle').innerText = `ร้านค้า: ${custName} | ของแถม: ${txn?.description}`;
  
  resetDeliveryPhotoUpload();
  openModal('delivery-upload-modal');
};

function handleDeliveryPhotoSelect(e) {
  if (e.target.files.length) {
    processDeliveryPhoto(e.target.files[0]);
  }
}

function processDeliveryPhoto(file) {
  if (!file.type.match('image.*')) {
    showToast('ไฟล์ไม่รองรับ', 'กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (JPG, PNG)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const rawBase64 = e.target.result;
    
    showToast('กำลังบีบอัดรูปภาพ', 'บีบอัดคุณภาพรูปส่งมอบให้เบาลงเพื่อป้องกันระบบช้า...', 'info');
    uploadedDeliveryPhotoBase64 = await compressImage(rawBase64, 800, 0.6);
    
    document.getElementById('delivery-upload-prompt').style.display = 'none';
    const previewContainer = document.getElementById('delivery-preview-container');
    previewContainer.style.display = 'block';
    document.getElementById('delivery-preview-img').src = uploadedDeliveryPhotoBase64;
    
    document.getElementById('delivery-photo-input').removeAttribute('required');
    showToast('บีบอัดสำเร็จ', 'ภาพส่งมอบถูกบีบอัดเรียบร้อย', 'success');
  };
  reader.readAsDataURL(file);
}

function resetDeliveryPhotoUpload() {
  uploadedDeliveryPhotoBase64 = '';
  document.getElementById('delivery-photo-input').value = '';
  document.getElementById('delivery-photo-input').setAttribute('required', 'true');
  document.getElementById('delivery-upload-prompt').style.display = 'flex';
  document.getElementById('delivery-preview-container').style.display = 'none';
  document.getElementById('delivery-preview-img').src = '';
}

function handleDeliveryFormSubmit(e) {
  e.preventDefault();
  const txnId = document.getElementById('delivery-txn-id').value;

  if (!txnId) {
    showToast('ข้อผิดพลาด', 'ไม่พบรหัสธุรกรรม', 'error');
    return;
  }

  if (!uploadedDeliveryPhotoBase64) {
    showToast('ขาดรูปภาพ', 'กรุณาแนบรูปภาพถ่ายยืนยันการส่งมอบด้วยค่ะ', 'warning');
    return;
  }

  const success = db.deliverClaim(txnId, uploadedDeliveryPhotoBase64);
  if (success) {
    showToast('ยืนยันสำเร็จ', 'บันทึกภาพถ่ายการส่งมอบของแถมสมบูรณ์ ปิดจบรายการเรียบร้อย', 'success');
    closeModal('delivery-upload-modal');
    renderPendingDeliveries();
    renderDashboard();
  } else {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการส่งมอบได้', 'error');
  }
}

// ==========================================
// APPROVAL & AUDIT BOARD
// ==========================================
function renderApproval() {
  const txns = db.getTransactions().filter(t => t.type === 'claim' && t.status === 'pending');
  const customers = db.getCustomers();
  const dsrs = db.getDSRs();
  const container = document.getElementById('audit-claims-list');
  
  container.innerHTML = '';
  document.getElementById('approval-count-badge').innerText = `${txns.length} รายการรอดำเนินการ`;

  if (txns.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-muted">
        <i data-lucide="check-circle" style="width:48px;height:48px;color:var(--color-success);margin:0 auto 16px;"></i>
        <h3>ไม่มีรายการค้างอนุมัติ</h3>
        <p class="text-sm mt-2">DSR ได้ส่งใบเบิกครบถ้วนและได้รับอนุมัติเรียบร้อยทั้งหมดแล้ว</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  txns.forEach(t => {
    const cust = customers.find(c => c.id === t.customerId);
    const dsr = dsrs.find(d => d.id === t.dsrId);
    const stats = db.getCustomerStats(t.customerId);
    
    const remainingAfter = stats.remaining - t.promoVal;
    const remainingAfterClass = remainingAfter < 0 ? 'text-danger' : 'text-primary';

    const auditCard = `
      <div class="audit-card" id="audit-card-${t.id}">
        <div class="audit-card-body">
          <!-- Left: Receipt Image Preview -->
          <div class="audit-receipt-wrapper" onclick="openLightbox('${t.receiptUrl}', 'หลักฐานเคลม: ${t.description}')">
            <img src="${t.receiptUrl}" alt="Receipt Document">
            <div class="audit-receipt-overlay">
              <i data-lucide="maximize-2" style="width:16px;height:16px;margin-right:6px;"></i> ขยายรูป
            </div>
          </div>
          
          <!-- Right: Audit details -->
          <div class="audit-info-panel">
            <div>
              <div class="flex-between" style="border-bottom: 1px solid var(--border-color); padding-bottom:8px; margin-bottom:12px;">
                <h3 class="font-semibold text-primary" style="font-size:15px;">${cust?.name || 'ร้านค้า'}</h3>
                <span class="tag-province">${cust?.province || 'ไม่ระบุ'}</span>
              </div>

              <div class="audit-row-grid">
                <div>
                  <span class="audit-item-lbl">รายละเอียดของแถม</span>
                  <div class="audit-item-val">${t.description}</div>
                </div>
                <div>
                  <span class="audit-item-lbl">ยอดเบิกของแถม</span>
                  <div class="audit-item-val text-warning" style="font-size:16px;font-weight:700;">${t.promoVal.toLocaleString('th-TH')} ฿</div>
                </div>
                <div>
                  <span class="audit-item-lbl">ผู้ยื่นคำขอ (DSR)</span>
                  <div class="audit-item-val">${dsr?.name || 'ไม่พบชื่อ'} (DSR: ${t.dsrId})</div>
                </div>
                <div>
                  <span class="audit-item-lbl">วันที่แจ้งซื้อ</span>
                  <div class="audit-item-val">${formatThaiDate(t.date)}</div>
                </div>
                <div>
                  <span class="audit-item-lbl">งบคงเหลือก่อนหน้า</span>
                  <div class="audit-item-val text-success">${stats.remaining.toLocaleString('th-TH')} ฿</div>
                </div>
                <div>
                  <span class="audit-item-lbl">งบเหลือคาดการณ์หลังอนุมัติ</span>
                  <div class="audit-item-val ${remainingAfterClass}">${remainingAfter.toLocaleString('th-TH')} ฿</div>
                </div>
              </div>
            </div>

            <div class="audit-actions">
              <button class="btn btn-secondary text-danger" onclick="triggerRejectClaim('${t.id}')">
                <i data-lucide="x-circle"></i> ปฏิเสธบิล
              </button>
              <button class="btn btn-success" onclick="approveClaim('${t.id}', '${cust?.name || ''}')">
                <i data-lucide="check-circle-2"></i> อนุมัติและรอส่งมอบ
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', auditCard);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Approve claim
window.approveClaim = function(txnId, customerName) {
  const success = db.approveClaim(txnId);
  if (success) {
    showToast('อนุมัติบิลสำเร็จ', `อนุมัติของแถมของร้าน "${customerName}" เรียบร้อยแล้ว (สถานะรอนำส่งของ)`, 'success');
    renderApproval();
    updateApprovalBadgeCount();
  } else {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถอนุมัติรายการนี้ได้', 'error');
  }
};

// Open reject dialog
window.triggerRejectClaim = function(txnId) {
  document.getElementById('reject-txn-id').value = txnId;
  document.getElementById('reject-reason-input').value = '';
  openModal('reject-modal');
};

function handleRejectFormSubmit(e) {
  e.preventDefault();
  const txnId = document.getElementById('reject-txn-id').value;
  const reason = document.getElementById('reject-reason-input').value.trim();

  if (!txnId || !reason) {
    showToast('ข้อมูลไม่ครบ', 'กรุณากรอกเหตุผลที่ปฏิเสธ', 'warning');
    return;
  }

  const success = db.rejectClaim(txnId, reason);
  if (success) {
    showToast('ปฏิเสธคำขอสำเร็จ', 'ระบบส่งคืนเรื่องกลับไปยังเซลล์ DSR พร้อมเหตุผลเรียบร้อย', 'info');
    closeModal('reject-modal');
    renderApproval();
    updateApprovalBadgeCount();
  } else {
    showToast('เกิดข้อผิดพลาด', 'ไม่สามารถดำเนินการปฏิเสธบิลนี้ได้', 'error');
  }
}

function updateApprovalBadgeCount() {
  const pendingCount = db.getTransactions().filter(t => t.type === 'claim' && t.status === 'pending').length;
  if (pendingCount > 0) {
    approvalBadge.style.display = 'inline-block';
    approvalBadge.innerText = pendingCount;
  } else {
    approvalBadge.style.display = 'none';
  }
}

// ==========================================
// DATA BACKUP & SETTINGS
// ==========================================
function handleDatabaseExport() {
  const jsonStr = db.exportData();
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(jsonStr);
  const exportFileDefaultName = `castrol_promo_backup_${new Date().toISOString().split('T')[0]}.json`;
  
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();

  showToast('ส่งออกสำเร็จ', 'ไฟล์ฐานข้อมูลถูกดาวน์โหลดเก็บไว้ที่เครื่องของคุณเรียบร้อย', 'success');
}

function handleDatabaseImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById('import-file-name').innerText = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const success = db.importData(evt.target.result);
    if (success) {
      showToast('นำเข้าข้อมูลสำเร็จ', 'ระบบทำการกู้คืนข้อมูลประวัติและงบสะสมทั้งหมดเรียบร้อยแล้ว', 'success');
      updateApprovalBadgeCount();
      setTimeout(() => {
        location.reload();
      }, 1000);
    } else {
      showToast('นำเข้าข้อมูลล้มเหลว', 'รูปแบบไฟล์ JSON ไม่ถูกต้องสำหรับระบบนี้', 'error');
    }
  };
  reader.readAsText(file);
}

function handleDatabaseReset() {
  if (confirm('⚠️ คำเตือน: คุณต้องการล้างข้อมูลปัจจุบันทั้งหมดเพื่อกลับไปใช้ข้อมูลจากสเปรดชีตจริงพฤษภาคม 2569 ใช่หรือไม่?')) {
    localStorage.removeItem('castrol_promo_dsrs');
    localStorage.removeItem('castrol_promo_customers');
    localStorage.removeItem('castrol_promo_transactions');
    showToast('รีเซ็ตสำเร็จ', 'กำลังโหลดฐานข้อมูลเดือน พ.ค. 2569 ใหม่...', 'info');
    setTimeout(() => {
      location.reload();
    }, 1000);
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Theme Toggler
function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('castrol_theme', 'light-theme');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('castrol_theme', 'dark-theme');
  }
}

// Modal Control
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
};

// Lightbox preview for receipts & photos
window.openLightbox = function(imgSrc, title) {
  const lightbox = document.getElementById('receipt-lightbox');
  const img = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  
  if (lightbox && img) {
    img.src = imgSrc;
    if (titleEl) titleEl.innerText = title || 'หลักฐานเอกสาร/ภาพส่งมอบ';
    lightbox.classList.add('active');
  }
};

// Format Date to Thai locale readable layout
function formatThaiDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const months = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear() + 543; // Buddhist Era
  return `${day} ${month} ${year}`;
}

// Toast Notifications System
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toastId = 'toast-' + Date.now();
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'error') iconName = 'x-circle';

  const toastHtml = `
    <div class="toast ${type}" id="${toastId}">
      <div class="toast-icon">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" onclick="document.getElementById('${toastId}').remove()">
        <i data-lucide="x" style="width:14px;height:14px;"></i>
      </button>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);
  
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Auto remove toast after 4.5 seconds
  setTimeout(() => {
    const el = document.getElementById(toastId);
    if (el) {
      el.style.animation = 'slideIn 0.3s reverse';
      el.addEventListener('animationend', () => el.remove());
    }
  }, 4500);
}

// ==========================================
// PHASE 3: DSR OVERVIEW RENDERING FUNCTIONS
// ==========================================
function renderDsrTab() {
  const dsrs = db.getDSRs();
  const customers = db.getCustomers();
  const txns = db.getTransactions();
  
  if (dsrs.length === 0) return;
  if (!selectedDsrId) selectedDsrId = dsrs[0].id;
  
  // Update titles
  const selectedDsr = dsrs.find(d => d.id === selectedDsrId);
  if (selectedDsr) {
    document.getElementById('dsr-selected-title').innerHTML = `<i data-lucide="users"></i> ร้านค้าในการดูแลของ ${selectedDsr.name}`;
    document.getElementById('dsr-delivery-title').innerHTML = `<i data-lucide="truck"></i> งานส่งมอบที่ค้างของ ${selectedDsr.name}`;
  }

  // Render cards
  const cardsContainer = document.getElementById('dsr-cards-container');
  cardsContainer.innerHTML = '';
  
  dsrs.forEach(d => {
    const dsrCusts = customers.filter(c => c.dsrId === d.id);
    let dsrAccumulated = 0;
    let dsrClaimed = 0;
    let dsrRemaining = 0;
    let dsrPendingDeliveries = 0;
    
    dsrCusts.forEach(c => {
      const stats = db.getCustomerStats(c.id);
      dsrAccumulated += stats.accumulated;
      dsrClaimed += stats.claimed;
      dsrRemaining += stats.remaining;
    });
    
    const pendingTxns = txns.filter(t => t.dsrId === d.id && t.type === 'claim' && t.status === 'approved_delivery');
    dsrPendingDeliveries = pendingTxns.length;
    
    const isActive = d.id === selectedDsrId ? 'active' : '';
    const badgeHtml = dsrPendingDeliveries > 0 ? `<span class="dsr-card-badge">รอส่งมอบ ${dsrPendingDeliveries}</span>` : '';
    
    const cardHtml = `
      <div class="dsr-card ${isActive}" data-dsr-id="${d.id}">
        ${badgeHtml}
        <div class="dsr-card-header">
          <span class="dsr-card-name">${d.name}</span>
          <span class="dsr-card-phone">${d.phone || ''}</span>
        </div>
        <div class="dsr-card-stats">
          <div class="dsr-card-stat">
            <span class="lbl">ร้านค้า</span>
            <span class="val">${dsrCusts.length} แห่ง</span>
          </div>
          <div class="dsr-card-stat">
            <span class="lbl">งบสะสม</span>
            <span class="val text-success">${dsrAccumulated.toLocaleString('th-TH')} ฿</span>
          </div>
          <div class="dsr-card-stat">
            <span class="lbl">เบิกแล้ว</span>
            <span class="val text-warning">${dsrClaimed.toLocaleString('th-TH')} ฿</span>
          </div>
          <div class="dsr-card-stat">
            <span class="lbl">คงเหลือ</span>
            <span class="val text-primary" style="font-weight:700;">${dsrRemaining.toLocaleString('th-TH')} ฿</span>
          </div>
        </div>
      </div>
    `;
    cardsContainer.insertAdjacentHTML('beforeend', cardHtml);
  });
  
  // Bind Card Click Events
  document.querySelectorAll('.dsr-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedDsrId = card.getAttribute('data-dsr-id');
      renderDsrTab();
    });
  });

  // Render Details
  renderDsrDetails();
}

function renderDsrDetails() {
  const searchQueryEl = document.getElementById('dsr-customer-search-input');
  const searchQuery = searchQueryEl ? searchQueryEl.value.toLowerCase().trim() : '';
  const customers = db.getCustomers();
  const txns = db.getTransactions();
  
  const dsrCusts = customers.filter(c => c.dsrId === selectedDsrId && 
    (c.name.toLowerCase().includes(searchQuery) || c.id.toLowerCase().includes(searchQuery) || c.province.toLowerCase().includes(searchQuery))
  );
  
  // Table Tbody
  const tbody = document.getElementById('dsr-customers-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    
    if (dsrCusts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-6">ไม่พบร้านค้าในเขตนี้</td></tr>`;
    } else {
      dsrCusts.forEach(c => {
        const stats = db.getCustomerStats(c.id);
        const remainingClass = stats.remaining < 0 ? 'text-danger' : 'text-primary';
        
        // Check for pending deliveries
        const hasPendingDelivery = txns.some(t => t.customerId === c.id && t.type === 'claim' && t.status === 'approved_delivery');
        const deliveryBadge = hasPendingDelivery ? ` <span class="status-tag approved_delivery" style="font-size: 10px; padding: 1px 4px; margin-left:4px;">รอส่งมอบ</span>` : '';
        
        let segmentBadge = '';
        if (c.segment === 'ทั้งคู่') {
          segmentBadge = `<span class="status-tag approved" style="font-size: 10px; padding: 1px 4px;">PCO & MCO</span>`;
        } else if (c.segment.includes('PCO')) {
          segmentBadge = `<span class="status-tag info" style="font-size: 10px; padding: 1px 4px; background-color: rgba(14, 165, 233, 0.08); color: var(--color-info); border: 1px solid rgba(14, 165, 233, 0.15)">PCO</span>`;
        } else {
          segmentBadge = `<span class="status-tag warning" style="font-size: 10px; padding: 1px 4px; background-color: rgba(245, 158, 11, 0.08); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.15)">MCO</span>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${c.id}</strong></td>
          <td><span class="font-semibold">${c.name}</span>${deliveryBadge}</td>
          <td><span class="tag-province">${c.province}</span><br>${segmentBadge}</td>
          <td style="font-weight:600;">${Math.round(stats.accumulated).toLocaleString('th-TH')} ฿</td>
          <td class="text-success" style="font-weight:600;">${Math.round(stats.claimed).toLocaleString('th-TH')} ฿</td>
          <td class="${remainingClass}" style="font-weight:700;">${Math.round(stats.remaining).toLocaleString('th-TH')} ฿</td>
          <td>
            <div class="action-btn-group">
              <button class="btn btn-sm btn-success" onclick="openEarnModal('${c.id}')">
                <i data-lucide="plus-circle" style="width:12px;height:12px;"></i> สะสมงบ
              </button>
              <button class="btn btn-sm btn-primary" style="background-color: var(--color-info); border-color: var(--color-info);" onclick="openClaimModal('${c.id}')">
                <i data-lucide="gift" style="width:12px;height:12px;"></i> เบิกของแถม
              </button>
              <button class="btn btn-sm btn-secondary" onclick="openLedger('${c.id}')">
                <i data-lucide="book-open" style="width:12px;height:12px;"></i> สมุดบัญชี
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
    }
  }

  // Render DSR Pending Deliveries
  const pendingListEl = document.getElementById('dsr-pending-deliveries-list');
  if (pendingListEl) {
    pendingListEl.innerHTML = '';
    
    const pendingTxns = txns.filter(t => t.dsrId === selectedDsrId && t.type === 'claim' && t.status === 'approved_delivery');
    
    if (pendingTxns.length === 0) {
      pendingListEl.innerHTML = `
        <div class="text-center py-8 text-muted">
          <i data-lucide="check-circle" style="width:32px;height:32px;color:var(--color-success);margin: 0 auto 8px;"></i>
          <p>ไม่มีงานค้างส่งมอบของ DSR นี้</p>
        </div>
      `;
    } else {
      pendingTxns.forEach(t => {
        const custName = customers.find(c => c.id === t.customerId)?.name || 'ไม่พบชื่อร้าน';
        
        const itemHtml = `
          <div class="claim-strip-item">
            <div class="claim-strip-left">
              <span class="claim-strip-title">${custName}</span>
              <span class="claim-strip-subtitle">
                <span>ของแถม: ${t.description}</span>
                <span>•</span>
                <span>มูลค่า: ${t.promoVal.toLocaleString('th-TH')} ฿</span>
              </span>
            </div>
            <div class="claim-strip-right">
              <button class="btn btn-sm btn-success" onclick="openDeliveryModal('${t.id}')">
                <i data-lucide="camera" style="width:10px;height:10px;"></i> นำส่งของ
              </button>
            </div>
          </div>
        `;
        pendingListEl.insertAdjacentHTML('beforeend', itemHtml);
      });
    }
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// ROW ACTIONS: EARN AND CLAIM MODALS LOGIC
// ==========================================

function handleEarnModalCustomerSegmentChange(custId) {
  const rateBtns = document.querySelectorAll('#earn-modal-form .btn-rate');
  const customRateInput = document.getElementById('earn-modal-custom-rate');
  
  if (!custId) {
    rateBtns.forEach(btn => btn.removeAttribute('disabled'));
    return;
  }
  
  const cust = db.getCustomers().find(c => c.id === custId);
  if (!cust) return;
  
  const segment = cust.segment;
  let validSegment = '';
  if (segment === 'PCO (รถยนต์)') {
    validSegment = 'PCO';
  } else if (segment === 'MCO (มอเตอร์ไซค์)') {
    validSegment = 'MCO';
  }
  
  let currentActiveBtn = document.querySelector('#earn-modal-form .btn-rate.active');
  let isCurrentActiveValid = true;

  rateBtns.forEach(btn => {
    const btnSegment = btn.getAttribute('data-segment');
    if (validSegment && btnSegment && btnSegment !== validSegment) {
      btn.setAttribute('disabled', 'true');
      btn.classList.remove('active');
      if (btn === currentActiveBtn) {
        isCurrentActiveValid = false;
      }
    } else {
      btn.removeAttribute('disabled');
    }
  });
  
  if (!isCurrentActiveValid) {
    const firstEnabled = document.querySelector('#earn-modal-form .btn-rate:not([disabled])');
    if (firstEnabled) {
      firstEnabled.classList.add('active');
      selectedModalDsrRate = parseFloat(firstEnabled.getAttribute('data-rate'));
      customRateInput.value = '';
    }
  } else if (currentActiveBtn) {
    selectedModalDsrRate = parseFloat(currentActiveBtn.getAttribute('data-rate'));
  }
  
  calculateEarnModalPromoValue();
}

function calculateEarnModalPromoValue() {
  const amount = parseFloat(document.getElementById('earn-modal-amount').value) || 0;
  const promoVal = Math.round((amount * selectedModalDsrRate) / 100);
  document.getElementById('earn-modal-calculated-val').innerText = `${promoVal.toLocaleString('th-TH')} ฿`;
}

window.openEarnModal = function(customerId) {
  const customer = db.getCustomers().find(c => c.id === customerId);
  const dsrs = db.getDSRs();
  
  if (!customer) return;
  
  const dsrObj = dsrs.find(d => d.id === customer.dsrId);
  const dsrName = dsrObj ? dsrObj.name : customer.dsrId;
  
  document.getElementById('earn-modal-cust-id').value = customerId;
  document.getElementById('earn-modal-cust-name').innerText = `${customer.name} (${customer.id})`;
  
  document.getElementById('earn-modal-dsr-id').value = customer.dsrId;
  document.getElementById('earn-modal-dsr-name').innerText = dsrName;
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('earn-modal-date').value = today;
  document.getElementById('earn-modal-qty').value = 1;
  document.getElementById('earn-modal-amount').value = '';
  document.getElementById('earn-modal-desc').value = '';
  
  const rateBtns = document.querySelectorAll('#earn-modal-form .btn-rate');
  rateBtns.forEach(b => b.classList.remove('active'));
  
  const segment = customer.segment;
  let defaultRate = '3';
  if (segment === 'MCO (มอเตอร์ไซค์)') {
    defaultRate = '1.5';
  }
  
  const defaultBtn = Array.from(rateBtns).find(b => b.getAttribute('data-rate') === defaultRate);
  if (defaultBtn) {
    defaultBtn.classList.add('active');
    selectedModalDsrRate = parseFloat(defaultRate);
  }
  
  document.getElementById('earn-modal-custom-rate').value = '';
  
  handleEarnModalCustomerSegmentChange(customerId);
  calculateEarnModalPromoValue();
  
  openModal('earn-modal');
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
};

window.openClaimModal = function(customerId) {
  const customer = db.getCustomers().find(c => c.id === customerId);
  const dsrs = db.getDSRs();
  
  if (!customer) return;
  
  const dsrObj = dsrs.find(d => d.id === customer.dsrId);
  const dsrName = dsrObj ? dsrObj.name : customer.dsrId;
  
  document.getElementById('claim-modal-cust-id').value = customerId;
  document.getElementById('claim-modal-cust-name').innerText = `${customer.name} (${customer.id})`;
  
  document.getElementById('claim-modal-dsr-id').value = customer.dsrId;
  document.getElementById('claim-modal-dsr-name').innerText = dsrName;
  
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('claim-modal-date').value = today;
  document.getElementById('claim-modal-amount').value = '';
  document.getElementById('claim-modal-desc').value = '';
  document.getElementById('claim-modal-amount-warning').style.display = 'none';
  
  resetModalReceiptUpload();
  
  const stats = db.getCustomerStats(customerId);
  document.getElementById('claim-modal-info-accumulated').innerText = `${Math.round(stats.accumulated).toLocaleString('th-TH')} ฿`;
  document.getElementById('claim-modal-info-claimed').innerText = `${Math.round(stats.claimed).toLocaleString('th-TH')} ฿`;
  document.getElementById('claim-modal-info-pending').innerText = `${Math.round(stats.pendingClaim).toLocaleString('th-TH')} ฿`;
  
  const availableEl = document.getElementById('claim-modal-info-available');
  availableEl.innerText = `${Math.round(stats.availableToClaim).toLocaleString('th-TH')} ฿`;
  if (stats.availableToClaim < 0) {
    availableEl.className = 'val text-danger';
  } else {
    availableEl.className = 'val text-info';
  }
  
  openModal('claim-modal');
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
};

function resetModalReceiptUpload() {
  uploadedModalReceiptBase64 = '';
  document.getElementById('claim-modal-receipt-input').value = '';
  document.getElementById('claim-modal-receipt-input').setAttribute('required', 'true');
  document.getElementById('receipt-modal-upload-prompt').style.display = 'flex';
  document.getElementById('receipt-modal-preview-container').style.display = 'none';
  document.getElementById('receipt-modal-preview-img').src = '';
}

function handleModalReceiptFileSelect(e) {
  if (e.target.files.length) {
    processModalReceiptFile(e.target.files[0]);
  }
}

function processModalReceiptFile(file) {
  if (!file.type.match('image.*')) {
    showToast('ไฟล์ไม่รองรับ', 'กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ (JPG, PNG)', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const rawBase64 = e.target.result;
    
    showToast('กำลังบีบอัดรูปภาพ', 'บีบอัดและปรับคุณภาพภาพบิลให้เหมาะสม...', 'info');
    uploadedModalReceiptBase64 = await compressImage(rawBase64, 800, 0.6);
    
    document.getElementById('receipt-modal-upload-prompt').style.display = 'none';
    const previewContainer = document.getElementById('receipt-modal-preview-container');
    previewContainer.style.display = 'block';
    document.getElementById('receipt-modal-preview-img').src = uploadedModalReceiptBase64;
    
    document.getElementById('claim-modal-receipt-input').removeAttribute('required');
    showToast('บีบอัดสำเร็จ', 'ภาพถูกบีบอัดเรียบร้อย', 'success');
  };
  reader.readAsDataURL(file);
}

function validateModalClaimAmountLimit() {
  const customerId = document.getElementById('claim-modal-cust-id').value;
  const amount = parseFloat(document.getElementById('claim-modal-amount').value) || 0;
  const warningEl = document.getElementById('claim-modal-amount-warning');

  if (!customerId) return;

  const stats = db.getCustomerStats(customerId);
  
  if (amount > stats.availableToClaim) {
    warningEl.style.display = 'block';
    warningEl.innerHTML = `⚠️ ยอดเบิกของแถม (${Math.round(amount).toLocaleString('th-TH')} ฿) เกินงบคงเหลือที่มี (${Math.round(stats.availableToClaim).toLocaleString('th-TH')} ฿) ยอดคงเหลือจะติดลบ`;
  } else {
    warningEl.style.display = 'none';
  }
}

function handleEarnModalFormSubmit(e) {
  e.preventDefault();
  const customerId = document.getElementById('earn-modal-cust-id').value;
  const dsrId = document.getElementById('earn-modal-dsr-id').value;
  const date = document.getElementById('earn-modal-date').value;
  const qty = parseInt(document.getElementById('earn-modal-qty').value) || 1;
  const amount = parseFloat(document.getElementById('earn-modal-amount').value) || 0;
  const description = document.getElementById('earn-modal-desc').value.trim() || 'สะสมงบยอดซื้อน้ำมันเครื่อง';

  if (!customerId || !dsrId || !date || amount <= 0) {
    showToast('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน', 'warning');
    return;
  }

  const promoVal = Math.round((amount * selectedModalDsrRate) / 100);

  db.addTransaction({
    customerId,
    dsrId,
    date,
    type: 'earn',
    amount,
    qty,
    rate: selectedModalDsrRate,
    promoVal,
    description: `${description} (จำนวน ${qty} ลัง)`,
    status: 'approved',
    receiptUrl: ''
  });

  showToast('สะสมงบประมาณสำเร็จ', `เพิ่มงบให้ลูกค้า ${Math.round(promoVal).toLocaleString('th-TH')} บาท เรียบร้อยแล้ว`, 'success');
  closeModal('earn-modal');
  renderCustomers();
  renderDashboard();
  renderPendingDeliveries();
}

function handleClaimModalFormSubmit(e) {
  e.preventDefault();
  const customerId = document.getElementById('claim-modal-cust-id').value;
  const dsrId = document.getElementById('claim-modal-dsr-id').value;
  const date = document.getElementById('claim-modal-date').value;
  const amount = parseFloat(document.getElementById('claim-modal-amount').value) || 0;
  const description = document.getElementById('claim-modal-desc').value.trim();

  if (!customerId || !dsrId || !date || amount <= 0 || !description) {
    showToast('กรอกข้อมูลไม่ครบ', 'กรุณาระบุข้อมูลให้ครบถ้วน', 'warning');
    return;
  }

  if (!uploadedModalReceiptBase64) {
    showToast('ขาดหลักฐานบิล', 'กรุณาอัปโหลดรูปภาพบิลหรือใบเสร็จรับเงินด้วยค่ะ', 'warning');
    return;
  }

  db.addTransaction({
    customerId,
    dsrId,
    date,
    type: 'claim',
    amount: 0,
    qty: 0,
    rate: 0,
    promoVal: amount,
    description,
    receiptUrl: uploadedModalReceiptBase64
  });

  showToast('ยื่นเรื่องคำขอเบิกแล้ว', 'คำขอถูกส่งไปยังขั้นตอนรอการอนุมัติบิล', 'success');
  closeModal('claim-modal');
  updateApprovalBadgeCount();
  renderCustomers();
  renderDashboard();
  renderPendingDeliveries();
}
