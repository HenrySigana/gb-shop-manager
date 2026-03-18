/* ============================================================
   GB SHOP MANAGER — script.js
   Full application logic: Auth, Products, Sales, Customers, Reports
============================================================ */

// ============================================================
// 🔧 CONFIGURATION — REPLACE WITH YOUR SUPABASE CREDENTIALS
// ============================================================
const SUPABASE_URL  = 'https://ycrhedxrapspfbszlydc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcmhlZHhyYXBzcGZic3pseWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTY2NTYsImV4cCI6MjA4OTM5MjY1Nn0.aQvRzk9p-L8IZar2-bVM2XlYFpu6DhT4fWqIW-ZOteA';
// ============================================================

// Initialize Supabase client
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ---- App State ----
let allProducts  = [];
let allCustomers = [];
let currentUser  = null;
let currentReport = 'daily'; // 'daily' | 'monthly'

// ============================================================
// 🕐 CLOCK — Updates every second in topbar
// ============================================================
function startClock() {
  const badge = document.getElementById('timeBadge');
  function update() {
    const now = new Date();
    badge.textContent = now.toLocaleString('en-KE', {
      weekday: 'short', day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
  }
  update();
  setInterval(update, 30000);
}

// ============================================================
// 🍞 TOAST NOTIFICATIONS
// ============================================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ============================================================
// 🔐 AUTHENTICATION
// ============================================================

// ---- PIN Configuration ----
const CORRECT_PIN = '7526';

/** Add a digit to the PIN input */
function addPin(digit) {
  const input = document.getElementById('pin');
  if (input.value.length < 4) {
    input.value += digit;
    updatePinDots(input.value);
    // Auto-submit when 4 digits entered
    if (input.value.length === 4) {
      setTimeout(() => document.getElementById('loginForm').dispatchEvent(new Event('submit')), 150);
    }
  }
}

/** Clear last digit from PIN */
function clearPin() {
  const input = document.getElementById('pin');
  input.value = input.value.slice(0, -1);
  updatePinDots(input.value);
  document.getElementById('pinError').classList.add('hidden');
}

/** Update the dot indicators */
function updatePinDots(value) {
  const dots = document.querySelectorAll('.pin-dots span');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < value.length);
  });
}

/** Handle PIN login */
function handleLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('pin').value;
  const errEl = document.getElementById('pinError');

  if (pin === CORRECT_PIN) {
    errEl.classList.add('hidden');
    currentUser = { email: 'owner@gbshop.local' };
    // Store session in sessionStorage so refresh doesn't log out
    sessionStorage.setItem('gb_logged_in', '1');
    showApp();
  } else {
    errEl.classList.remove('hidden');
    document.getElementById('pin').value = '';
    updatePinDots('');
    // Shake the dots
    const dots = document.getElementById('pinDots');
    dots.style.animation = 'none';
    void dots.offsetWidth;
    dots.style.animation = 'shake 0.4s ease';
  }
}

/** Handle logout */
function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('gb_logged_in');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('pin').value = '';
  updatePinDots('');
  showToast('Signed out successfully', 'success');
}

/** Check existing session on page load */
function checkSession() {
  if (sessionStorage.getItem('gb_logged_in') === '1') {
    currentUser = { email: 'owner@gbshop.local' };
    showApp();
  }
}

/** Show main app after login */
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userInfo').textContent = '👤 Shop Owner';
  startClock();
  initApp();
}

// ============================================================
// 🚀 APP INITIALIZATION
// ============================================================
async function initApp() {
  await Promise.all([
    loadProducts(),
    loadCustomers(),
  ]);
  loadDashboard();
  populateSaleDropdowns();
  setDefaultReportDate();
}

// ============================================================
// 🧭 NAVIGATION
// ============================================================
function showSection(name, linkEl) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  // Show target section
  const section = document.getElementById('section' + capitalize(name));
  if (section) section.classList.add('active');
  if (linkEl) linkEl.classList.add('active');

  // Update page title
  const titles = {
    dashboard: 'Dashboard', products: 'Products',
    sales: 'Record Sale', customers: 'Customers', reports: 'Reports'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;

  // Refresh data for the section
  if (name === 'dashboard')  loadDashboard();
  if (name === 'sales')      { loadTodaySales(); populateSaleDropdowns(); }
  if (name === 'reports')    loadDailyReport();

  closeSidebar();
  return false;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---- Sidebar toggle ----
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.remove('hidden');
  document.getElementById('sidebarOverlay').classList.add('visible');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  document.getElementById('sidebarOverlay').classList.add('hidden');
}

// ============================================================
// 📦 PRODUCTS
// ============================================================

/** Load all products from Supabase */
async function loadProducts() {
  const { data, error } = await db.from('products').select('*').order('name');
  if (error) { showToast('Failed to load products: ' + error.message, 'error'); return; }
  allProducts = data || [];
  renderProducts(allProducts);
}

/** Render products into table */
function renderProducts(products) {
  const tbody = document.getElementById('productsBody');
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No products found. Add your first product!</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    const margin = p.selling_price > 0
      ? Math.round(((p.selling_price - p.buying_price) / p.selling_price) * 100)
      : 0;
    const stockClass = p.stock === 0 ? 'stock-out' : p.stock < 3 ? 'stock-low' : 'stock-ok';
    return `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td class="mono">KSh ${fmt(p.buying_price)}</td>
        <td class="mono">KSh ${fmt(p.selling_price)}</td>
        <td><span class="${stockClass}">${p.stock}</span></td>
        <td><span class="margin-badge">${margin}%</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-outline" onclick="openEditProduct('${p.id}')">✏️ Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}', '${escHtml(p.name)}')">🗑️</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

/** Filter products by search input */
function filterProducts() {
  const q = document.getElementById('productSearch').value.toLowerCase();
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(q));
  renderProducts(filtered);
}

/** Open add-product modal */
function openProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add New Product';
  document.getElementById('productId').value        = '';
  document.getElementById('productName').value      = '';
  document.getElementById('productBuyPrice').value  = '';
  document.getElementById('productSellPrice').value = '';
  document.getElementById('productStock').value     = '';
  document.getElementById('productModal').classList.remove('hidden');
}

/** Open edit-product modal */
function openEditProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productId').value        = p.id;
  document.getElementById('productName').value      = p.name;
  document.getElementById('productBuyPrice').value  = p.buying_price;
  document.getElementById('productSellPrice').value = p.selling_price;
  document.getElementById('productStock').value     = p.stock;
  document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

/** Save (add or edit) product */
async function handleSaveProduct(e) {
  e.preventDefault();
  const id        = document.getElementById('productId').value;
  const name      = document.getElementById('productName').value.trim();
  const buyPrice  = parseFloat(document.getElementById('productBuyPrice').value);
  const sellPrice = parseFloat(document.getElementById('productSellPrice').value);
  const stock     = parseInt(document.getElementById('productStock').value);

  if (sellPrice < buyPrice) {
    showToast('⚠️ Selling price cannot be less than buying price!', 'warning');
    return;
  }

  const payload = {
    name,
    buying_price: buyPrice,
    selling_price: sellPrice,
    stock
  };

  let error;
  if (id) {
    // Update existing
    ({ error } = await db.from('products').update(payload).eq('id', id));
  } else {
    // Insert new
    ({ error } = await db.from('products').insert([payload]));
  }

  if (error) { showToast('❌ ' + error.message, 'error'); return; }

  showToast(id ? '✅ Product updated!' : '✅ Product added!', 'success');
  closeProductModal();
  await loadProducts();
  populateSaleDropdowns();
  updateLowStockBanner();
}

/** Delete a product */
async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(`🗑️ "${name}" deleted`, 'success');
  await loadProducts();
  updateLowStockBanner();
}

// ============================================================
// 🛒 SALES
// ============================================================

/** Populate product and customer dropdowns in sale form */
function populateSaleDropdowns() {
  // Products dropdown
  const productSel = document.getElementById('saleProduct');
  const currentVal = productSel.value;
  productSel.innerHTML = '<option value="">-- Choose a product --</option>';
  allProducts.forEach(p => {
    if (p.stock > 0) {
      productSel.innerHTML += `<option value="${p.id}" data-sell="${p.selling_price}" data-buy="${p.buying_price}" data-stock="${p.stock}">
        ${escHtml(p.name)} (Stock: ${p.stock})
      </option>`;
    }
  });
  if (currentVal) productSel.value = currentVal;

  // Customers dropdown
  const custSel = document.getElementById('saleCustomer');
  custSel.innerHTML = '<option value="">-- Walk-in Customer --</option>';
  allCustomers.forEach(c => {
    custSel.innerHTML += `<option value="${c.id}">${escHtml(c.name)} (${c.phone})</option>`;
  });

  updateSalePreview();
}

/** Update live sale preview (unit price, total, profit) */
function updateSalePreview() {
  const sel = document.getElementById('saleProduct');
  const qty = parseInt(document.getElementById('saleQty').value) || 0;
  const opt = sel.options[sel.selectedIndex];

  const sellPrice = opt ? parseFloat(opt.dataset.sell || 0) : 0;
  const buyPrice  = opt ? parseFloat(opt.dataset.buy  || 0) : 0;
  const total     = sellPrice * qty;
  const profit    = (sellPrice - buyPrice) * qty;

  document.getElementById('previewUnitPrice').textContent = `KSh ${fmt(sellPrice)}`;
  document.getElementById('previewQty').textContent       = qty;
  document.getElementById('previewTotal').textContent     = `KSh ${fmt(total)}`;
  document.getElementById('previewProfit').textContent    = `KSh ${fmt(profit)}`;
}

/** Record a sale */
async function handleRecordSale(e) {
  e.preventDefault();
  const productId  = document.getElementById('saleProduct').value;
  const customerId = document.getElementById('saleCustomer').value || null;
  const qty        = parseInt(document.getElementById('saleQty').value);

  if (!productId) { showToast('Please select a product', 'warning'); return; }
  if (qty < 1)    { showToast('Quantity must be at least 1', 'warning'); return; }

  const product = allProducts.find(p => p.id === productId);
  if (!product) { showToast('Product not found', 'error'); return; }
  if (qty > product.stock) {
    showToast(`⚠️ Only ${product.stock} in stock!`, 'warning');
    return;
  }

  const totalPrice = product.selling_price * qty;
  const profit     = (product.selling_price - product.buying_price) * qty;

  const btn = document.getElementById('saleBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Processing...';

  // Insert sale record
  const { error: saleError } = await db.from('sales').insert([{
    product_id:  productId,
    customer_id: customerId,
    quantity:    qty,
    total_price: totalPrice,
    profit:      profit
  }]);

  if (saleError) {
    showToast('❌ ' + saleError.message, 'error');
    btn.disabled = false;
    btn.textContent = '✅ Record Sale';
    return;
  }

  // Reduce stock
  const { error: stockError } = await db.from('products')
    .update({ stock: product.stock - qty })
    .eq('id', productId);

  if (stockError) {
    showToast('⚠️ Sale saved but stock not updated: ' + stockError.message, 'warning');
  }

  showToast(`✅ Sale recorded! Total: KSh ${fmt(totalPrice)}`, 'success');

  // Reset form
  document.getElementById('saleForm').reset();
  btn.disabled = false;
  btn.textContent = '✅ Record Sale';

  // Refresh data
  await loadProducts();
  populateSaleDropdowns();
  loadTodaySales();
  updateLowStockBanner();
}

/** Load and display today's sales in the sales section table */
async function loadTodaySales() {
  const today = todayDateString();
  const { data, error } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .order('created_at', { ascending: false });

  if (error) return;

  const tbody = document.getElementById('todaySalesBody');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No sales recorded today yet</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td>${escHtml(s.products?.name || 'Unknown')}</td>
      <td>${escHtml(s.customers?.name || 'Walk-in')}</td>
      <td class="mono">${s.quantity}</td>
      <td class="mono">KSh ${fmt(s.total_price)}</td>
      <td class="mono" style="color:var(--teal)">KSh ${fmt(s.profit)}</td>
      <td style="color:var(--text-muted);font-size:12px">${timeString(s.created_at)}</td>
    </tr>
  `).join('');
}

// ============================================================
// 👥 CUSTOMERS
// ============================================================

/** Load customers from Supabase */
async function loadCustomers() {
  const { data, error } = await db.from('customers').select('*').order('name');
  if (error) { showToast('Failed to load customers: ' + error.message, 'error'); return; }
  allCustomers = data || [];
  renderCustomers(allCustomers);
}

/** Render customers table */
function renderCustomers(customers) {
  const tbody = document.getElementById('customersBody');
  if (!customers.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No customers yet. Add your first customer!</td></tr>';
    return;
  }
  tbody.innerHTML = customers.map((c, i) => `
    <tr>
      <td class="mono" style="color:var(--text-muted)">${i + 1}</td>
      <td><strong>${escHtml(c.name)}</strong></td>
      <td>${escHtml(c.phone)}</td>
      <td style="color:var(--text-muted);font-size:12px">${dateString(c.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline" onclick="openEditCustomer('${c.id}')">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}', '${escHtml(c.name)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

/** Filter customers by search */
function filterCustomers() {
  const q = document.getElementById('customerSearch').value.toLowerCase();
  const filtered = allCustomers.filter(c =>
    c.name.toLowerCase().includes(q) || c.phone.includes(q)
  );
  renderCustomers(filtered);
}

/** Open add-customer modal */
function openCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add New Customer';
  document.getElementById('customerId').value    = '';
  document.getElementById('customerName').value  = '';
  document.getElementById('customerPhone').value = '';
  document.getElementById('customerModal').classList.remove('hidden');
}

/** Open edit-customer modal */
function openEditCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('customerModalTitle').textContent = 'Edit Customer';
  document.getElementById('customerId').value    = c.id;
  document.getElementById('customerName').value  = c.name;
  document.getElementById('customerPhone').value = c.phone;
  document.getElementById('customerModal').classList.remove('hidden');
}

function closeCustomerModal() {
  document.getElementById('customerModal').classList.add('hidden');
}

/** Save customer (add or edit) */
async function handleSaveCustomer(e) {
  e.preventDefault();
  const id    = document.getElementById('customerId').value;
  const name  = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();

  const payload = { name, phone };
  let error;

  if (id) {
    ({ error } = await db.from('customers').update(payload).eq('id', id));
  } else {
    ({ error } = await db.from('customers').insert([payload]));
  }

  if (error) { showToast('❌ ' + error.message, 'error'); return; }

  showToast(id ? '✅ Customer updated!' : '✅ Customer added!', 'success');
  closeCustomerModal();
  await loadCustomers();
  populateSaleDropdowns();
}

/** Delete a customer */
async function deleteCustomer(id, name) {
  if (!confirm(`Delete customer "${name}"?`)) return;
  const { error } = await db.from('customers').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(`🗑️ Customer "${name}" deleted`, 'success');
  await loadCustomers();
}

// ============================================================
// 📊 DASHBOARD
// ============================================================

async function loadDashboard() {
  const today = todayDateString();

  // Fetch today's sales
  const { data: todaySales } = await db.from('sales')
    .select('*, products(name)')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .order('created_at', { ascending: false });

  const totalSales  = (todaySales || []).reduce((s, r) => s + r.total_price, 0);
  const totalProfit = (todaySales || []).reduce((s, r) => s + r.profit, 0);

  // Low stock items
  const lowStock = allProducts.filter(p => p.stock < 3);

  // Update stat cards
  document.getElementById('statSalesToday').textContent  = `KSh ${fmt(totalSales)}`;
  document.getElementById('statProfitToday').textContent = `KSh ${fmt(totalProfit)}`;
  document.getElementById('statProducts').textContent    = allProducts.length;
  document.getElementById('statLowStock').textContent    = lowStock.length;

  // Low stock alert list
  const listEl = document.getElementById('lowStockList');
  if (lowStock.length === 0) {
    listEl.innerHTML = '<p class="empty-state">✅ All products are well stocked!</p>';
  } else {
    listEl.innerHTML = lowStock.map(p => `
      <div class="low-stock-item">
        <span>⚠️ ${escHtml(p.name)}</span>
        <span class="stock-badge">${p.stock} left</span>
      </div>
    `).join('');
  }

  // Recent sales table (last 5)
  const recentBody = document.getElementById('recentSalesBody');
  const recent5 = (todaySales || []).slice(0, 5);
  if (!recent5.length) {
    recentBody.innerHTML = '<tr><td colspan="5" class="empty-state">No sales yet today</td></tr>';
  } else {
    recentBody.innerHTML = recent5.map(s => `
      <tr>
        <td>${escHtml(s.products?.name || 'Unknown')}</td>
        <td class="mono">${s.quantity}</td>
        <td class="mono">KSh ${fmt(s.total_price)}</td>
        <td class="mono" style="color:var(--teal)">KSh ${fmt(s.profit)}</td>
        <td style="color:var(--text-muted);font-size:12px">${timeString(s.created_at)}</td>
      </tr>
    `).join('');
  }

  updateLowStockBanner();
}

/** Show/hide low stock alert banner at top */
function updateLowStockBanner() {
  const lowStock = allProducts.filter(p => p.stock < 3);
  const banner   = document.getElementById('lowStockBanner');
  if (lowStock.length > 0) {
    const names = lowStock.map(p => `${p.name} (${p.stock})`).join(', ');
    document.getElementById('lowStockMessage').textContent =
      `Low stock alert: ${names}`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ============================================================
// 📈 REPORTS
// ============================================================

/** Set default date to today */
function setDefaultReportDate() {
  const today = todayDateString();
  document.getElementById('reportDate').value  = today;
  document.getElementById('reportMonth').value = new Date().getMonth() + 1;
  document.getElementById('reportYear').value  = new Date().getFullYear();
  loadDailyReport();
}

/** Switch between daily / monthly reports */
function switchReport(type, btn) {
  currentReport = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('dailyControls').classList.toggle('hidden',   type !== 'daily');
  document.getElementById('monthlyControls').classList.toggle('hidden', type !== 'monthly');

  if (type === 'daily')   loadDailyReport();
  if (type === 'monthly') loadMonthlyReport();
}

/** Load daily report */
async function loadDailyReport() {
  const date = document.getElementById('reportDate').value;
  if (!date) return;

  document.getElementById('reportTableTitle').textContent = `Sales on ${date}`;

  const { data, error } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', date + 'T00:00:00')
    .lte('created_at', date + 'T23:59:59')
    .order('created_at', { ascending: false });

  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  renderReport(data || []);
}

/** Load monthly report */
async function loadMonthlyReport() {
  const month = parseInt(document.getElementById('reportMonth').value);
  const year  = parseInt(document.getElementById('reportYear').value);
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = getMonthEnd(year, month);

  document.getElementById('reportTableTitle').textContent =
    `Monthly Report — ${getMonthName(month)} ${year}`;

  const { data, error } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', start + 'T00:00:00')
    .lte('created_at', end + 'T23:59:59')
    .order('created_at', { ascending: false });

  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  renderReport(data || []);
}

/** Render report table and summary stats */
function renderReport(sales) {
  const totalSales  = sales.reduce((s, r) => s + r.total_price, 0);
  const totalProfit = sales.reduce((s, r) => s + r.profit, 0);

  document.getElementById('rptTotalSales').textContent  = `KSh ${fmt(totalSales)}`;
  document.getElementById('rptTotalProfit').textContent = `KSh ${fmt(totalProfit)}`;
  document.getElementById('rptTransactions').textContent = sales.length;

  const tbody = document.getElementById('reportBody');
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No sales found for this period</td></tr>';
    return;
  }

  tbody.innerHTML = sales.map(s => `
    <tr>
      <td>${escHtml(s.products?.name || 'Unknown')}</td>
      <td>${escHtml(s.customers?.name || 'Walk-in')}</td>
      <td class="mono">${s.quantity}</td>
      <td class="mono">KSh ${fmt(s.total_price)}</td>
      <td class="mono" style="color:var(--teal)">KSh ${fmt(s.profit)}</td>
      <td style="color:var(--text-muted);font-size:12px">${dateTimeString(s.created_at)}</td>
    </tr>
  `).join('');
}

// ============================================================
// 📲 WHATSAPP REPORT
// ============================================================

async function sendWhatsAppReport() {
  const today = todayDateString();

  // Fetch today's sales
  const { data: sales } = await db.from('sales')
    .select('*, products(name)')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59');

  const totalSales  = (sales || []).reduce((s, r) => s + r.total_price, 0);
  const totalProfit = (sales || []).reduce((s, r) => s + r.profit, 0);
  const txCount     = (sales || []).length;

  // Low stock items
  const lowStock = allProducts.filter(p => p.stock < 3);
  const lowStockText = lowStock.length
    ? lowStock.map(p => `  • ${p.name}: ${p.stock} remaining`).join('\n')
    : '  ✅ All products well stocked';

  // Build message
  const msg = `
🛍️ *GB SHOP MANAGER — DAILY REPORT*
📅 Date: ${today}
──────────────────────
💰 *Total Sales Today:* KSh ${fmt(totalSales)}
📈 *Total Profit Today:* KSh ${fmt(totalProfit)}
🛒 *Transactions:* ${txCount}
──────────────────────
⚠️ *Low Stock Alerts:*
${lowStockText}
──────────────────────
_Report generated by GB Shop Manager_
  `.trim();

  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ============================================================
// 🛠️ HELPERS / UTILITIES
// ============================================================

/** Format number as KSh with commas */
function fmt(num) {
  if (isNaN(num) || num === null) return '0.00';
  return parseFloat(num).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** Returns today's date as YYYY-MM-DD */
function todayDateString() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/** Returns the last day of a given month as YYYY-MM-DD */
function getMonthEnd(year, month) {
  const last = new Date(year, month, 0);
  return last.toISOString().split('T')[0];
}

/** Returns month name from number */
function getMonthName(n) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[n - 1] || '';
}

/** Format ISO timestamp to time only (e.g. "02:45 PM") */
function timeString(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

/** Format ISO timestamp to date only */
function dateString(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format ISO timestamp to full date+time */
function dateTimeString(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/** Escape HTML to prevent XSS */
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// 🔑 PAGE LOAD — Check session and start
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
