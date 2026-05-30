import { initialDSRs, initialCustomers, initialTransactions } from './mockData.js';

// Keys for localStorage
const KEY_DSRS = 'castrol_promo_dsrs';
const KEY_CUSTOMERS = 'castrol_promo_customers';
const KEY_TRANSACTIONS = 'castrol_promo_transactions';

// Initialize DB with Mock Data if empty
export function initDB() {
  const currentVer = localStorage.getItem('castrol_db_version');
  if (currentVer !== 'v3') {
    localStorage.removeItem(KEY_DSRS);
    localStorage.removeItem(KEY_CUSTOMERS);
    localStorage.removeItem(KEY_TRANSACTIONS);
    localStorage.setItem('castrol_db_version', 'v3');
  }

  if (!localStorage.getItem(KEY_DSRS)) {
    localStorage.setItem(KEY_DSRS, JSON.stringify(initialDSRs));
  }
  if (!localStorage.getItem(KEY_CUSTOMERS)) {
    localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(initialCustomers));
  }
  if (!localStorage.getItem(KEY_TRANSACTIONS)) {
    localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(initialTransactions));
  }
}

// Get raw data
export function getDSRs() {
  initDB();
  return JSON.parse(localStorage.getItem(KEY_DSRS)) || [];
}

export function getCustomers() {
  initDB();
  return JSON.parse(localStorage.getItem(KEY_CUSTOMERS)) || [];
}

export function getTransactions() {
  initDB();
  return JSON.parse(localStorage.getItem(KEY_TRANSACTIONS)) || [];
}

// Save raw data
export function saveDSRs(dsrs) {
  localStorage.setItem(KEY_DSRS, JSON.stringify(dsrs));
}

export function saveCustomers(customers) {
  localStorage.setItem(KEY_CUSTOMERS, JSON.stringify(customers));
}

export function saveTransactions(txns) {
  localStorage.setItem(KEY_TRANSACTIONS, JSON.stringify(txns));
}

// Business Calculations
export function getCustomerStats(customerId) {
  const txns = getTransactions().filter(t => t.customerId === customerId);
  
  let accumulated = 0;
  let claimed = 0;
  let pendingClaim = 0;

  txns.forEach(t => {
    if (t.type === 'earn') {
      accumulated += Number(t.promoVal || 0);
    } else if (t.type === 'claim') {
      if (t.status === 'approved' || t.status === 'approved_delivery' || t.status === 'delivered') {
        claimed += Number(t.promoVal || 0);
      } else if (t.status === 'pending') {
        pendingClaim += Number(t.promoVal || 0);
      }
    }
  });

  const remaining = accumulated - claimed;
  const availableToClaim = remaining - pendingClaim;

  return {
    accumulated: Math.round(accumulated),
    claimed: Math.round(claimed),
    pendingClaim: Math.round(pendingClaim),
    remaining: Math.round(remaining),
    availableToClaim: Math.round(availableToClaim)
  };
}

export function getGlobalStats() {
  const customers = getCustomers();
  const txns = getTransactions();

  let totalAccumulated = 0;
  let totalClaimed = 0;
  let totalPending = 0;

  txns.forEach(t => {
    if (t.type === 'earn') {
      totalAccumulated += Number(t.promoVal || 0);
    } else if (t.type === 'claim') {
      if (t.status === 'approved' || t.status === 'approved_delivery' || t.status === 'delivered') {
        totalClaimed += Number(t.promoVal || 0);
      } else if (t.status === 'pending') {
        totalPending += Number(t.promoVal || 0);
      }
    }
  });

  const totalRemaining = totalAccumulated - totalClaimed;

  // Province Stats
  const provinceStats = {};
  customers.forEach(c => {
    const stats = getCustomerStats(c.id);
    if (!provinceStats[c.province]) {
      provinceStats[c.province] = {
        province: c.province,
        accumulated: 0,
        claimed: 0,
        remaining: 0
      };
    }
    provinceStats[c.province].accumulated += stats.accumulated;
    provinceStats[c.province].claimed += stats.claimed;
    provinceStats[c.province].remaining += stats.remaining;
  });

  return {
    totalAccumulated: Math.round(totalAccumulated),
    totalClaimed: Math.round(totalClaimed),
    totalPending: Math.round(totalPending),
    totalRemaining: Math.round(totalRemaining),
    provinces: Object.values(provinceStats)
  };
}

// Add operations
export function addCustomer(customer) {
  const customers = getCustomers();
  if (!customer.id) {
    customer.id = 'CUST-' + Date.now().toString().slice(-6);
  }
  customers.push(customer);
  saveCustomers(customers);
  return customer;
}

export function addDSR(dsr) {
  const dsrs = getDSRs();
  if (!dsr.id) {
    dsr.id = 'DSR-' + Date.now().toString().slice(-4);
  }
  dsrs.push(dsr);
  saveDSRs(dsrs);
  return dsr;
}

export function addTransaction(txn) {
  const txns = getTransactions();
  txn.id = 'TXN-' + txn.type.toUpperCase() + '-' + Date.now();
  txn.status = txn.type === 'earn' ? 'approved' : 'pending';
  txn.promoVal = Math.round(Number(txn.promoVal || 0));
  txn.amount = Math.round(Number(txn.amount || 0));
  txns.push(txn);
  saveTransactions(txns);
  return txn;
}

// Audit operations
export function approveClaim(txnId) {
  const txns = getTransactions();
  const index = txns.findIndex(t => t.id === txnId);
  if (index !== -1 && txns[index].status === 'pending') {
    txns[index].status = 'approved_delivery';
    saveTransactions(txns);
    return true;
  }
  return false;
}

export function rejectClaim(txnId, reason) {
  const txns = getTransactions();
  const index = txns.findIndex(t => t.id === txnId);
  if (index !== -1 && txns[index].status === 'pending') {
    txns[index].status = 'rejected';
    txns[index].rejectReason = reason || 'ข้อมูลหลักฐานไม่ครบถ้วน';
    saveTransactions(txns);
    return true;
  }
  return false;
}

// Delivery operation
export function deliverClaim(txnId, deliveryPhotoUrl) {
  const txns = getTransactions();
  const index = txns.findIndex(t => t.id === txnId);
  if (index !== -1 && txns[index].status === 'approved_delivery') {
    txns[index].status = 'delivered';
    txns[index].deliveryPhotoUrl = deliveryPhotoUrl;
    txns[index].deliveryDate = new Date().toISOString().split('T')[0];
    saveTransactions(txns);
    return true;
  }
  return false;
}

// Export/Import Database
export function exportData() {
  const data = {
    dsrs: getDSRs(),
    customers: getCustomers(),
    transactions: getTransactions()
  };
  return JSON.stringify(data, null, 2);
}

export function importData(jsonDataStr) {
  try {
    const data = JSON.parse(jsonDataStr);
    if (data.dsrs && data.customers && data.transactions) {
      saveDSRs(data.dsrs);
      saveCustomers(data.customers);
      saveTransactions(data.transactions);
      return true;
    }
  } catch (e) {
    console.error('Import failed', e);
  }
  return false;
}
