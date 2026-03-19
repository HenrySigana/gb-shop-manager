/* ============================================================
   GB SHOP MANAGER v2 — script.js
   Features: Multi-user PIN, Categories, Suppliers, Sales+Discounts,
   M-Pesa tracking, Receipts, Expenses, Mkopo/Debt, Restock Log,
   Customers+Location, Charts, Excel/PDF Export, WhatsApp Reports,
   Low Stock Alerts, Reorder Levels, Barcode Scanner, Margin Colors
============================================================ */

// ============================================================
// 🔧 SUPABASE CONFIG
// ============================================================
const SUPABASE_URL  = 'https://ycrhedxrapspfbszlydc.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljcmhlZHhyYXBzcGZic3pseWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTY2NTYsImV4cCI6MjA4OTM5MjY1Nn0.aQvRzk9p-L8IZar2-bVM2XlYFpu6DhT4fWqIW-ZOteA';

// ============================================================
// 👥 USERS
// ============================================================
const USERS = [
  { id: 'owner',  name: 'Owner', role: 'Admin',   pin: '7526', avatar: '👑' },
  { id: 'staff1', name: 'Staff', role: 'Cashier', pin: '7526', avatar: '👤' },
];

// ============================================================
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ---- State ----
let allProducts   = [];
let allCustomers  = [];
let allCategories = [];
let allSuppliers  = [];
let currentUser   = null;
let currentReport = 'daily';
let reportChart   = null;
let lastSaleData  = null;

// ---- Low Stock ----
const LOW_STOCK_THRESHOLD = 3;

// ============================================================
// 🕐 CLOCK
// ============================================================
function startClock() {
  const badge = document.getElementById('timeBadge');
  function tick() {
    badge.textContent = new Date().toLocaleString('en-KE', {
      weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
    });
  }
  tick();
  setInterval(tick, 30000);
}

// ============================================================
// 🍞 TOAST
// ============================================================
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

// ============================================================
// 🔔 LOW STOCK SOUND
// ============================================================
function playLowStockSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function checkAndAlertLowStock(product) {
  const level = product.reorder_level || LOW_STOCK_THRESHOLD;
  if (product.stock === 0) {
    playLowStockSound();
    setTimeout(() => playLowStockSound(), 600);
    showToast(`🚨 OUT OF STOCK: ${product.name}!`, 'error');
  } else if (product.stock <= level) {
    playLowStockSound();
    showToast(`⚠️ Low stock: ${product.name} — only ${product.stock} left!`, 'warning');
  }
}

// ============================================================
// 🔐 MULTI-USER LOGIN
// ============================================================
let selectedUser = null;
let pinValue = '';

function buildUserSelect() {
  const grid = document.getElementById('loginUserSelect');
  grid.innerHTML = USERS.map(u => `
    <div class="user-select-btn" onclick="selectUser('${u.id}')">
      <div class="user-avatar">${u.avatar}</div>
      <div class="user-name">${u.name}</div>
      <div class="user-role">${u.role}</div>
    </div>
  `).join('');
}

function selectUser(id) {
  selectedUser = USERS.find(u => u.id === id);
  if (!selectedUser) return;
  document.getElementById('loginUserSelect').classList.add('hidden');
  document.getElementById('pinSection').classList.remove('hidden');
  document.getElementById('pinUserName').textContent = selectedUser.name;
  pinValue = '';
  updatePinDots('');
  document.getElementById('pinError').classList.add('hidden');
}

function backToUserSelect() {
  document.getElementById('loginUserSelect').classList.remove('hidden');
  document.getElementById('pinSection').classList.add('hidden');
  selectedUser = null;
  pinValue = '';
}

function addPin(digit) {
  if (pinValue.length >= 4) return;
  pinValue += digit;
  updatePinDots(pinValue);
  if (pinValue.length === 4) setTimeout(checkPin, 150);
}

function clearPin() {
  pinValue = pinValue.slice(0, -1);
  updatePinDots(pinValue);
  document.getElementById('pinError').classList.add('hidden');
}

function updatePinDots(val) {
  document.querySelectorAll('.pin-dots span').forEach((d, i) => {
    d.classList.toggle('filled', i < val.length);
  });
}

function checkPin() {
  if (!selectedUser) return;
  if (pinValue === selectedUser.pin) {
    document.getElementById('pinError').classList.add('hidden');
    currentUser = selectedUser;
    sessionStorage.setItem('gb_user', JSON.stringify(currentUser));
    showApp();
  } else {
    document.getElementById('pinError').classList.remove('hidden');
    pinValue = '';
    updatePinDots('');
    const dots = document.getElementById('pinDots');
    dots.style.animation = 'none';
    void dots.offsetWidth;
    dots.style.animation = 'shake .4s ease';
  }
}

function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('gb_user');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginUserSelect').classList.remove('hidden');
  document.getElementById('pinSection').classList.add('hidden');
  selectedUser = null;
  pinValue = '';
  buildUserSelect();
  showToast('Signed out', 'success');
}

function checkSession() {
  const saved = sessionStorage.getItem('gb_user');
  if (saved) {
    try { currentUser = JSON.parse(saved); showApp(); }
    catch(e) { sessionStorage.removeItem('gb_user'); }
  }
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userInfo').textContent =
    `${currentUser.avatar || '👤'} ${currentUser.name} (${currentUser.role})`;
  startClock();
  initApp();
}

// ============================================================
// 🚀 INIT
// ============================================================
async function initApp() {
  await Promise.all([loadCategories(), loadSuppliers(), loadProducts(), loadCustomers()]);
  loadDashboard();
  populateSaleDropdowns();
  setDefaultReportDate();
  setDefaultExpenseDate();
  startIdleWatcher();
}

// ============================================================
// 🧭 NAVIGATION
// ============================================================
function showSection(name, linkEl) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const section = document.getElementById('section' + name.charAt(0).toUpperCase() + name.slice(1));
  if (section) section.classList.add('active');
  if (linkEl) linkEl.classList.add('active');
  const titles = {
    dashboard:'Dashboard', products:'Products', categories:'Categories',
    suppliers:'Suppliers', sales:'Record Sale', expenses:'Expenses',
    mkopo:'Mkopo / Debt', restock:'Restock Log', customers:'Customers', reports:'Reports'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  if (name === 'dashboard')  loadDashboard();
  if (name === 'sales')      { loadTodaySales(); populateSaleDropdowns(); }
  if (name === 'reports')    loadDailyReport();
  if (name === 'expenses')   loadExpenses();
  if (name === 'mkopo')      loadMkopo();
  if (name === 'restock')    loadRestock();
  if (name === 'categories') loadCategories().then(renderCategories);
  if (name === 'suppliers')  loadSuppliers().then(renderSuppliers);
  closeSidebar();
  return false;
}

function openSidebar()  {
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
// 🏷️ CATEGORIES
// ============================================================
async function loadCategories() {
  const { data } = await db.from('categories').select('*').order('name');
  allCategories = data || [];
  populateCategoryDropdowns();
  return allCategories;
}

function renderCategories() {
  const tbody = document.getElementById('categoriesBody');
  if (!allCategories.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No categories yet</td></tr>'; return; }
  tbody.innerHTML = allCategories.map(c => {
    const count = allProducts.filter(p => p.category_id === c.id).length;
    return `<tr>
      <td><strong>${escHtml(c.name)}</strong></td>
      <td>${count} products</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-outline" onclick="openEditCategory('${c.id}')">✏️ Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCategory('${c.id}','${escHtml(c.name)}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function populateCategoryDropdowns() {
  const opts = '<option value="">-- No Category --</option>' +
    allCategories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  const els = ['productCategory', 'productCategoryFilter'];
  els.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = id === 'productCategoryFilter'
      ? '<option value="">All Categories</option>' + allCategories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')
      : opts;
    el.value = prev;
  });
}

function openCategoryModal() {
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('categoryId').value = '';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryModal').classList.remove('hidden');
}
function openEditCategory(id) {
  const c = allCategories.find(x => x.id === id);
  if (!c) return;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('categoryId').value = c.id;
  document.getElementById('categoryName').value = c.name;
  document.getElementById('categoryModal').classList.remove('hidden');
}
function closeCategoryModal() { document.getElementById('categoryModal').classList.add('hidden'); }

async function handleSaveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const name = document.getElementById('categoryName').value.trim();
  let error;
  if (id) { ({ error } = await db.from('categories').update({ name }).eq('id', id)); }
  else    { ({ error } = await db.from('categories').insert([{ name }])); }
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(id ? '✅ Category updated!' : '✅ Category added!', 'success');
  closeCategoryModal();
  await loadCategories();
  renderCategories();
}

async function deleteCategory(id, name) {
  if (!confirm(`Delete category "${name}"?`)) return;
  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(`🗑️ Deleted`, 'success');
  await loadCategories();
  renderCategories();
}

// ============================================================
// 🏭 SUPPLIERS
// ============================================================
async function loadSuppliers() {
  const { data } = await db.from('suppliers').select('*').order('name');
  allSuppliers = data || [];
  populateSupplierDropdowns();
  return allSuppliers;
}

function renderSuppliers() {
  const tbody = document.getElementById('suppliersBody');
  if (!allSuppliers.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No suppliers yet</td></tr>'; return; }
  tbody.innerHTML = allSuppliers.map(s => `<tr>
    <td><strong>${escHtml(s.name)}</strong></td>
    <td>${escHtml(s.phone)}</td>
    <td>${escHtml(s.location || '—')}</td>
    <td>${escHtml(s.products_supplied || '—')}</td>
    <td><div class="action-btns">
      <button class="btn btn-sm btn-outline" onclick="openEditSupplier('${s.id}')">✏️ Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSupplier('${s.id}','${escHtml(s.name)}')">🗑️</button>
      <a href="https://wa.me/254${s.phone.replace(/^0/,'')}" target="_blank" class="btn btn-sm btn-whatsapp" style="padding:6px 10px">📲</a>
    </div></td>
  </tr>`).join('');
}

function populateSupplierDropdowns() {
  const opts = '<option value="">-- No Supplier --</option>' +
    allSuppliers.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  ['productSupplier','restockSupplier'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const v = el.value; el.innerHTML = opts; el.value = v; }
  });
}

function openSupplierModal() {
  document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
  ['supplierId','supplierName','supplierPhone','supplierLocation','supplierProducts'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('supplierModal').classList.remove('hidden');
}
function openEditSupplier(id) {
  const s = allSuppliers.find(x => x.id === id);
  if (!s) return;
  document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
  document.getElementById('supplierId').value          = s.id;
  document.getElementById('supplierName').value        = s.name;
  document.getElementById('supplierPhone').value       = s.phone;
  document.getElementById('supplierLocation').value    = s.location || '';
  document.getElementById('supplierProducts').value    = s.products_supplied || '';
  document.getElementById('supplierModal').classList.remove('hidden');
}
function closeSupplierModal() { document.getElementById('supplierModal').classList.add('hidden'); }

async function handleSaveSupplier(e) {
  e.preventDefault();
  const id = document.getElementById('supplierId').value;
  const payload = {
    name: document.getElementById('supplierName').value.trim(),
    phone: document.getElementById('supplierPhone').value.trim(),
    location: document.getElementById('supplierLocation').value.trim(),
    products_supplied: document.getElementById('supplierProducts').value.trim()
  };
  let error;
  if (id) { ({ error } = await db.from('suppliers').update(payload).eq('id', id)); }
  else    { ({ error } = await db.from('suppliers').insert([payload])); }
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast('✅ Supplier saved!', 'success');
  closeSupplierModal();
  await loadSuppliers();
  renderSuppliers();
}

async function deleteSupplier(id, name) {
  if (!confirm(`Delete supplier "${name}"?`)) return;
  const { error } = await db.from('suppliers').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(`🗑️ Deleted`, 'success');
  await loadSuppliers();
  renderSuppliers();
}

// ============================================================
// 📦 PRODUCTS
// ============================================================
async function loadProducts() {
  const { data, error } = await db.from('products').select('*, categories(name), suppliers(name)').order('name');
  if (error) { showToast('Failed to load products', 'error'); return; }
  allProducts = data || [];
  renderProducts(allProducts);
}

function renderProducts(products) {
  const tbody = document.getElementById('productsBody');
  if (!products.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No products found</td></tr>'; return; }
  tbody.innerHTML = products.map(p => {
    const margin = p.selling_price > 0 ? Math.round(((p.selling_price - p.buying_price) / p.selling_price) * 100) : 0;
    const mc = margin >= 30 ? 'margin-high' : margin >= 15 ? 'margin-mid' : 'margin-low';
    const mi = margin >= 30 ? '🟢' : margin >= 15 ? '🟡' : '🔴';
    const rl = p.reorder_level || LOW_STOCK_THRESHOLD;
    const sc = p.stock === 0 ? 'stock-out' : p.stock <= rl ? 'stock-low' : 'stock-ok';
    return `<tr>
      <td><strong>${escHtml(p.name)}</strong></td>
      <td>${escHtml(p.categories?.name || '—')}</td>
      <td class="mono" style="color:var(--text-muted);font-size:11px">${escHtml(p.product_code || '—')}</td>
      <td class="mono">KSh ${fmt(p.buying_price)}</td>
      <td class="mono">KSh ${fmt(p.selling_price)}</td>
      <td><span class="${sc}">${p.stock}</span><span style="font-size:10px;color:var(--text-muted);margin-left:4px">min:${rl}</span></td>
      <td><span class="margin-badge ${mc}">${mi} ${margin}%</span></td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-outline" onclick="openEditProduct('${p.id}')">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}','${escHtml(p.name)}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterProducts() {
  const q   = document.getElementById('productSearch').value.toLowerCase();
  const cat = document.getElementById('productCategoryFilter').value;
  const filtered = allProducts.filter(p =>
    p.name.toLowerCase().includes(q) && (!cat || p.category_id === cat)
  );
  renderProducts(filtered);
}

function openProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add New Product';
  ['productId','productName','productCode','productBuyPrice','productSellPrice','productStock'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('productCategory').value = '';
  document.getElementById('productSupplier').value = '';
  const rl = document.getElementById('productReorderLevel');
  if (rl) rl.value = 3;
  document.getElementById('productModal').classList.remove('hidden');
}

function openEditProduct(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productId').value        = p.id;
  document.getElementById('productName').value      = p.name;
  document.getElementById('productCode').value      = p.product_code || '';
  document.getElementById('productBuyPrice').value  = p.buying_price;
  document.getElementById('productSellPrice').value = p.selling_price;
  document.getElementById('productStock').value     = p.stock;
  document.getElementById('productCategory').value  = p.category_id || '';
  document.getElementById('productSupplier').value  = p.supplier_id || '';
  const rl = document.getElementById('productReorderLevel');
  if (rl) rl.value = p.reorder_level || 3;
  document.getElementById('productModal').classList.remove('hidden');
}
function closeProductModal() { document.getElementById('productModal').classList.add('hidden'); }

async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const buyPrice  = parseFloat(document.getElementById('productBuyPrice').value);
  const sellPrice = parseFloat(document.getElementById('productSellPrice').value);
  if (sellPrice < buyPrice) { showToast('⚠️ Selling price < buying price!', 'warning'); return; }
  const rlEl = document.getElementById('productReorderLevel');
  const payload = {
    name:          document.getElementById('productName').value.trim(),
    product_code:  document.getElementById('productCode').value.trim() || null,
    buying_price:  buyPrice,
    selling_price: sellPrice,
    stock:         parseInt(document.getElementById('productStock').value),
    category_id:   document.getElementById('productCategory').value || null,
    supplier_id:   document.getElementById('productSupplier').value || null,
    reorder_level: rlEl ? (parseInt(rlEl.value) || 3) : 3,
  };
  let error;
  if (id) { ({ error } = await db.from('products').update(payload).eq('id', id)); }
  else    { ({ error } = await db.from('products').insert([payload])); }
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(id ? '✅ Product updated!' : '✅ Product added!', 'success');
  closeProductModal();
  await loadProducts();
  populateSaleDropdowns();
  updateLowStockBanner();
}

async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  const { error } = await db.from('products').delete().eq('id', id);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast(`🗑️ Deleted`, 'success');
  await loadProducts();
  updateLowStockBanner();
}

// ============================================================
// 🛒 SALES
// ============================================================
function populateSaleDropdowns() {
  const sel = document.getElementById('saleProduct');
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Choose a product --</option>';
  allProducts.forEach(p => {
    if (p.stock > 0)
      sel.innerHTML += `<option value="${p.id}" data-sell="${p.selling_price}" data-buy="${p.buying_price}" data-stock="${p.stock}">${escHtml(p.name)} (Stock: ${p.stock})</option>`;
  });
  sel.value = prev;

  const csel = document.getElementById('saleCustomer');
  csel.innerHTML = '<option value="">-- Walk-in Customer --</option>';
  allCustomers.forEach(c => csel.innerHTML += `<option value="${c.id}">${escHtml(c.name)} (${c.phone})</option>`);

  updateSalePreview();
}

function updateSalePreview() {
  const sel  = document.getElementById('saleProduct');
  const qty  = parseInt(document.getElementById('saleQty').value) || 0;
  const disc = parseFloat(document.getElementById('saleDiscount').value) || 0;
  const opt  = sel.options[sel.selectedIndex];
  const sell = opt ? parseFloat(opt.dataset.sell || 0) : 0;
  const buy  = opt ? parseFloat(opt.dataset.buy  || 0) : 0;
  const total  = Math.max(0, sell * qty - disc);
  const profit = Math.max(0, (sell - buy) * qty - disc);
  document.getElementById('previewUnitPrice').textContent = `KSh ${fmt(sell)}`;
  document.getElementById('previewQty').textContent       = qty;
  document.getElementById('previewDiscount').textContent  = `KSh ${fmt(disc)}`;
  document.getElementById('previewTotal').textContent     = `KSh ${fmt(total)}`;
  document.getElementById('previewProfit').textContent    = `KSh ${fmt(profit)}`;
}

async function handleRecordSale(e) {
  e.preventDefault();
  const productId  = document.getElementById('saleProduct').value;
  const customerId = document.getElementById('saleCustomer').value || null;
  const qty        = parseInt(document.getElementById('saleQty').value);
  const discount   = parseFloat(document.getElementById('saleDiscount').value) || 0;
  const payment    = document.getElementById('salePayment').value;
  const mpesaRef   = document.getElementById('mpesaRef').value.trim() || null;

  if (!productId) { showToast('Please select a product', 'warning'); return; }
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  if (qty > product.stock) { showToast(`⚠️ Only ${product.stock} in stock!`, 'warning'); return; }

  const totalPrice = Math.max(0, product.selling_price * qty - discount);
  const profit     = Math.max(0, (product.selling_price - product.buying_price) * qty - discount);

  const btn = document.getElementById('saleBtn');
  btn.disabled = true; btn.textContent = '⏳ Processing...';

  const { data: saleData, error } = await db.from('sales').insert([{
    product_id: productId, customer_id: customerId,
    quantity: qty, total_price: totalPrice, profit,
    discount, payment_method: payment, mpesa_ref: mpesaRef
  }]).select().single();

  if (error) { showToast('❌ ' + error.message, 'error'); btn.disabled = false; btn.textContent = '✅ Record Sale'; return; }

  await db.from('products').update({ stock: product.stock - qty }).eq('id', productId);

  if (payment === 'Credit' && customerId) {
    const cust = allCustomers.find(c => c.id === customerId);
    await db.from('mkopo').insert([{
      customer_name: cust?.name || 'Unknown', phone: cust?.phone || '',
      item: `${product.name} x${qty}`, amount: totalPrice, status: 'pending'
    }]);
  }

  lastSaleData = { sale: saleData, product, qty, discount, totalPrice, profit, payment, mpesaRef, customerId };
  showToast(`✅ Sale recorded! KSh ${fmt(totalPrice)}`, 'success');

  btn.disabled = false; btn.textContent = '✅ Record Sale';
  document.getElementById('saleForm').reset();
  document.getElementById('saleDiscount').value = '0';
  updateSalePreview();

  await loadProducts();
  populateSaleDropdowns();
  loadTodaySales();

  // Low stock alert after sale
  const newStock = product.stock - qty;
  const reorderLevel = product.reorder_level || LOW_STOCK_THRESHOLD;
  if (newStock <= reorderLevel) {
    setTimeout(() => checkAndAlertLowStock({ ...product, stock: newStock }), 800);
  }

  updateLowStockBanner();
  showReceipt(lastSaleData);
}

async function loadTodaySales() {
  const today = todayStr();
  const { data } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('todaySalesBody');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No sales today</td></tr>'; return; }
  tbody.innerHTML = data.map(s => `<tr>
    <td>${escHtml(s.products?.name || '?')}</td>
    <td>${escHtml(s.customers?.name || 'Walk-in')}</td>
    <td class="mono">${s.quantity}</td>
    <td class="mono">${s.discount > 0 ? 'KSh ' + fmt(s.discount) : '—'}</td>
    <td class="mono">KSh ${fmt(s.total_price)}</td>
    <td><span class="pay-${(s.payment_method||'cash').toLowerCase().replace('-','')}">${s.payment_method || 'Cash'}</span></td>
    <td><button class="btn btn-sm btn-outline" onclick="viewReceiptById('${s.id}')">🧾</button></td>
  </tr>`).join('');
}

// ============================================================
// 🧾 RECEIPTS
// ============================================================
function showReceipt({ product, qty, discount, totalPrice, profit, payment, mpesaRef, customerId }) {
  const cust = customerId ? allCustomers.find(c => c.id === customerId) : null;
  const receiptNo = 'RCP-' + Date.now().toString().slice(-6);
  const now = new Date().toLocaleString('en-KE', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt-header">
      <div style="font-size:1.5rem">🛍️</div>
      <h3>GB Shop Manager</h3>
      <div style="font-size:12px;color:var(--text-muted)">Bag & Retail Management System</div>
    </div>
    <div class="receipt-row"><span>Receipt No:</span><span>${receiptNo}</span></div>
    <div class="receipt-row"><span>Date:</span><span>${now}</span></div>
    <div class="receipt-row"><span>Cashier:</span><span>${currentUser.name}</span></div>
    ${cust ? `<div class="receipt-row"><span>Customer:</span><span>${escHtml(cust.name)}</span></div>` : ''}
    <div style="border-top:1px dashed var(--border);margin:.5rem 0;padding-top:.5rem">
      <div class="receipt-row"><span>${escHtml(product.name)}</span></div>
      <div class="receipt-row"><span>${qty} × KSh ${fmt(product.selling_price)}</span><span>KSh ${fmt(product.selling_price * qty)}</span></div>
      ${discount > 0 ? `<div class="receipt-row"><span>Discount:</span><span>- KSh ${fmt(discount)}</span></div>` : ''}
    </div>
    <div class="receipt-row receipt-total"><span>TOTAL</span><span>KSh ${fmt(totalPrice)}</span></div>
    <div class="receipt-row"><span>Payment:</span><span>${payment}${mpesaRef ? ' (' + mpesaRef + ')' : ''}</span></div>
    <div class="receipt-footer">Thank you for shopping with us!<br>📱 GB Shop Manager</div>
  `;
  document.getElementById('receiptModal').classList.remove('hidden');
}

async function viewReceiptById(saleId) {
  const { data } = await db.from('sales').select('*, products(name, selling_price), customers(name)').eq('id', saleId).single();
  if (!data) return;
  showReceipt({
    product: data.products, qty: data.quantity,
    discount: data.discount || 0, totalPrice: data.total_price,
    profit: data.profit, payment: data.payment_method || 'Cash',
    mpesaRef: data.mpesa_ref, customerId: data.customer_id
  });
}

function closeReceiptModal() { document.getElementById('receiptModal').classList.add('hidden'); }

function shareReceiptWhatsApp() {
  const text = document.getElementById('receiptContent').innerText;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

// ============================================================
// 💸 EXPENSES
// ============================================================
function setDefaultExpenseDate() {
  const el = document.getElementById('expenseDate');
  if (el) el.value = todayStr();
  loadExpenses();
}

async function loadExpenses() {
  const date = document.getElementById('expenseDate')?.value || todayStr();
  const { data } = await db.from('expenses')
    .select('*')
    .gte('created_at', date + 'T00:00:00')
    .lte('created_at', date + 'T23:59:59')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('expensesBody');
  const expenses = data || [];
  if (!expenses.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No expenses for this date</td></tr>'; }
  else {
    tbody.innerHTML = expenses.map(ex => `<tr>
      <td>${escHtml(ex.description)}</td>
      <td>${escHtml(ex.category)}</td>
      <td class="mono">KSh ${fmt(ex.amount)}</td>
      <td style="color:var(--text-muted);font-size:12px">${timeStr(ex.created_at)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteExpense('${ex.id}')">🗑️</button></td>
    </tr>`).join('');
  }

  const todayTotal = expenses.reduce((s, r) => s + r.amount, 0);
  document.getElementById('expStatToday').textContent = `KSh ${fmt(todayTotal)}`;

  const m = new Date(); const ms = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-01`;
  const { data: monthData } = await db.from('expenses').select('amount').gte('created_at', ms + 'T00:00:00');
  const mTotal = (monthData || []).reduce((s, r) => s + r.amount, 0);
  document.getElementById('expStatMonth').textContent = `KSh ${fmt(mTotal)}`;
}

function openExpenseModal() { document.getElementById('expenseModal').classList.remove('hidden'); }
function closeExpenseModal() { document.getElementById('expenseModal').classList.add('hidden'); }

async function handleSaveExpense(e) {
  e.preventDefault();
  const payload = {
    description: document.getElementById('expenseDesc').value.trim(),
    category:    document.getElementById('expenseCategory').value,
    amount:      parseFloat(document.getElementById('expenseAmount').value)
  };
  const { error } = await db.from('expenses').insert([payload]);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast('✅ Expense saved!', 'success');
  closeExpenseModal();
  document.getElementById('expenseForm').reset();
  loadExpenses();
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await db.from('expenses').delete().eq('id', id);
  showToast('🗑️ Deleted', 'success');
  loadExpenses();
}

// ============================================================
// 📋 MKOPO / DEBT
// ============================================================
async function loadMkopo() {
  const { data } = await db.from('mkopo').select('*').order('created_at', { ascending: false });
  const debts = data || [];
  const unpaid = debts.filter(d => d.status !== 'paid');
  const total = unpaid.reduce((s, r) => s + r.amount, 0);
  document.getElementById('mkopoTotal').textContent = `KSh ${fmt(total)}`;
  document.getElementById('mkopoCount').textContent  = unpaid.length;

  const tbody = document.getElementById('mkopoBody');
  if (!debts.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No debts recorded</td></tr>'; return; }

  tbody.innerHTML = debts.map(d => {
    const due = d.due_date ? new Date(d.due_date) : null;
    const now = new Date();
    let status = d.status || 'pending';
    if (status === 'pending' && due && due < now) status = 'overdue';
    return `<tr>
      <td><strong>${escHtml(d.customer_name)}</strong></td>
      <td>${escHtml(d.phone)}</td>
      <td>${escHtml(d.item)}</td>
      <td class="mono">KSh ${fmt(d.amount)}</td>
      <td style="font-size:12px">${d.due_date || '—'}</td>
      <td><span class="badge badge-${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span></td>
      <td><div class="action-btns">
        ${status !== 'paid' ? `<button class="btn btn-sm btn-outline" onclick="markMkopoPaid('${d.id}')">✅ Paid</button>` : ''}
        <a href="https://wa.me/254${d.phone.replace(/^0/,'')}" target="_blank" class="btn btn-sm btn-whatsapp" style="padding:6px 10px">📲</a>
        <button class="btn btn-sm btn-danger" onclick="deleteMkopo('${d.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openMkopoModal() {
  document.getElementById('mkopoModalTitle').textContent = 'Add Debt (Mkopo)';
  ['mkopoId','mkopoCustomer','mkopoPhone','mkopoAmount','mkopoItem','mkopoDue'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mkopoModal').classList.remove('hidden');
}
function closeMkopoModal() { document.getElementById('mkopoModal').classList.add('hidden'); }

async function handleSaveMkopo(e) {
  e.preventDefault();
  const payload = {
    customer_name: document.getElementById('mkopoCustomer').value.trim(),
    phone:         document.getElementById('mkopoPhone').value.trim(),
    amount:        parseFloat(document.getElementById('mkopoAmount').value),
    item:          document.getElementById('mkopoItem').value.trim(),
    due_date:      document.getElementById('mkopoDue').value || null,
    status:        'pending'
  };
  const { error } = await db.from('mkopo').insert([payload]);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast('✅ Debt recorded!', 'success');
  closeMkopoModal();
  loadMkopo();
}

async function markMkopoPaid(id) {
  await db.from('mkopo').update({ status: 'paid' }).eq('id', id);
  showToast('✅ Marked as paid!', 'success');
  loadMkopo();
}
async function deleteMkopo(id) {
  if (!confirm('Delete this debt record?')) return;
  await db.from('mkopo').delete().eq('id', id);
  showToast('🗑️ Deleted', 'success');
  loadMkopo();
}

// ============================================================
// 🔄 RESTOCK LOG
// ============================================================
async function loadRestock() {
  const { data } = await db.from('restock_log')
    .select('*, products(name), suppliers(name)')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('restockBody');
  const logs = data || [];
  if (!logs.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No restock entries</td></tr>'; return; }
  tbody.innerHTML = logs.map(r => `<tr>
    <td>${escHtml(r.products?.name || '?')}</td>
    <td>${escHtml(r.suppliers?.name || 'Direct')}</td>
    <td class="mono">+${r.quantity}</td>
    <td class="mono">KSh ${fmt(r.cost_per_unit)}</td>
    <td class="mono">KSh ${fmt(r.quantity * r.cost_per_unit)}</td>
    <td style="color:var(--text-muted);font-size:12px">${dateStr(r.created_at)}</td>
  </tr>`).join('');
}

function openRestockModal() {
  const sel = document.getElementById('restockProduct');
  sel.innerHTML = '<option value="">-- Select Product --</option>' +
    allProducts.map(p => `<option value="${p.id}">${escHtml(p.name)} (Stock: ${p.stock})</option>`).join('');
  ['restockQty','restockCost'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('restockModal').classList.remove('hidden');
}
function closeRestockModal() { document.getElementById('restockModal').classList.add('hidden'); }

async function handleSaveRestock(e) {
  e.preventDefault();
  const productId   = document.getElementById('restockProduct').value;
  const supplierId  = document.getElementById('restockSupplier').value || null;
  const qty         = parseInt(document.getElementById('restockQty').value);
  const costPerUnit = parseFloat(document.getElementById('restockCost').value);

  if (!productId) { showToast('Select a product', 'warning'); return; }

  const { error } = await db.from('restock_log').insert([{
    product_id: productId, supplier_id: supplierId,
    quantity: qty, cost_per_unit: costPerUnit
  }]);
  if (error) { showToast('❌ ' + error.message, 'error'); return; }

  const product = allProducts.find(p => p.id === productId);
  if (product) await db.from('products').update({ stock: product.stock + qty }).eq('id', productId);

  showToast(`✅ Restocked! +${qty} units`, 'success');
  closeRestockModal();
  await loadProducts();
  populateSaleDropdowns();
  loadRestock();
  updateLowStockBanner();
}

// ============================================================
// 👥 CUSTOMERS
// ============================================================
async function loadCustomers() {
  const { data } = await db.from('customers').select('*').order('name');
  allCustomers = data || [];
  renderCustomers(allCustomers);
}

function renderCustomers(customers) {
  const tbody = document.getElementById('customersBody');
  if (!customers.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No customers yet</td></tr>'; return; }
  tbody.innerHTML = customers.map((c, i) => `<tr>
    <td class="mono" style="color:var(--text-muted)">${i+1}</td>
    <td><strong>${escHtml(c.name)}</strong></td>
    <td>${escHtml(c.phone)}</td>
    <td>${escHtml(c.location || '—')}</td>
    <td class="mono">KSh ${fmt(c.total_purchases || 0)}</td>
    <td><div class="action-btns">
      <button class="btn btn-sm btn-outline" onclick="openEditCustomer('${c.id}')">✏️</button>
      <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}','${escHtml(c.name)}')">🗑️</button>
      <a href="https://wa.me/254${c.phone.replace(/^0/,'')}" target="_blank" class="btn btn-sm btn-whatsapp" style="padding:6px 10px">📲</a>
    </div></td>
  </tr>`).join('');
}

function filterCustomers() {
  const q = document.getElementById('customerSearch').value.toLowerCase();
  renderCustomers(allCustomers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)));
}

function openCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  ['customerId','customerName','customerPhone','customerLocation'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('customerModal').classList.remove('hidden');
}
function openEditCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('customerModalTitle').textContent = 'Edit Customer';
  document.getElementById('customerId').value       = c.id;
  document.getElementById('customerName').value     = c.name;
  document.getElementById('customerPhone').value    = c.phone;
  document.getElementById('customerLocation').value = c.location || '';
  document.getElementById('customerModal').classList.remove('hidden');
}
function closeCustomerModal() { document.getElementById('customerModal').classList.add('hidden'); }

async function handleSaveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('customerId').value;
  const payload = {
    name:     document.getElementById('customerName').value.trim(),
    phone:    document.getElementById('customerPhone').value.trim(),
    location: document.getElementById('customerLocation').value.trim() || null
  };
  let error;
  if (id) { ({ error } = await db.from('customers').update(payload).eq('id', id)); }
  else    { ({ error } = await db.from('customers').insert([payload])); }
  if (error) { showToast('❌ ' + error.message, 'error'); return; }
  showToast('✅ Customer saved!', 'success');
  closeCustomerModal();
  await loadCustomers();
  populateSaleDropdowns();
}

async function deleteCustomer(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  await db.from('customers').delete().eq('id', id);
  showToast('🗑️ Deleted', 'success');
  await loadCustomers();
}

// ============================================================
// 📊 DASHBOARD
// ============================================================
async function loadDashboard() {
  const today = todayStr();
  const { data: sales } = await db.from('sales').select('*, products(name)')
    .gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59')
    .order('created_at', { ascending: false });

  const totalSales  = (sales||[]).reduce((s,r) => s + r.total_price, 0);
  const totalProfit = (sales||[]).reduce((s,r) => s + r.profit, 0);
  const lowStock    = allProducts.filter(p => p.stock < (p.reorder_level || LOW_STOCK_THRESHOLD));

  document.getElementById('statSalesToday').textContent  = `KSh ${fmt(totalSales)}`;
  document.getElementById('statProfitToday').textContent = `KSh ${fmt(totalProfit)}`;
  document.getElementById('statProducts').textContent    = allProducts.length;
  document.getElementById('statLowStock').textContent    = lowStock.length;

  const { data: expData } = await db.from('expenses').select('amount')
    .gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59');
  const totalExp = (expData||[]).reduce((s,r) => s + r.amount, 0);
  document.getElementById('statExpenses').textContent = `KSh ${fmt(totalExp)}`;

  const { data: debtData } = await db.from('mkopo').select('amount').neq('status','paid');
  const totalDebt = (debtData||[]).reduce((s,r) => s + r.amount, 0);
  document.getElementById('statDebts').textContent = `KSh ${fmt(totalDebt)}`;

  const listEl = document.getElementById('lowStockList');
  listEl.innerHTML = lowStock.length
    ? lowStock.map(p => `<div class="low-stock-item"><span>⚠️ ${escHtml(p.name)}</span><span class="stock-badge">${p.stock} left</span></div>`).join('')
    : '<p class="empty-state">✅ All products well stocked!</p>';

  const tbody = document.getElementById('recentSalesBody');
  const recent = (sales||[]).slice(0,5);
  tbody.innerHTML = recent.length
    ? recent.map(s => `<tr>
        <td>${escHtml(s.products?.name||'?')}</td>
        <td class="mono">${s.quantity}</td>
        <td class="mono">KSh ${fmt(s.total_price)}</td>
        <td><span class="pay-${(s.payment_method||'cash').toLowerCase().replace('-','')}">${s.payment_method||'Cash'}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${timeStr(s.created_at)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">No sales yet today</td></tr>';

  updateLowStockBanner();
}

function updateLowStockBanner() {
  const low = allProducts.filter(p => p.stock <= (p.reorder_level || LOW_STOCK_THRESHOLD));
  const oos = low.filter(p => p.stock === 0);
  const banner = document.getElementById('lowStockBanner');
  if (low.length > 0) {
    const oosNames = oos.map(p => p.name).join(', ');
    const lowNames = low.filter(p => p.stock > 0).map(p => `${p.name} (${p.stock})`).join(', ');
    const msg = oos.length > 0
      ? `🚨 OUT OF STOCK: ${oosNames}${lowNames ? ' | ⚠️ Low: ' + lowNames : ''}`
      : `⚠️ Low stock: ${lowNames}`;
    document.getElementById('lowStockMessage').textContent = msg;
    banner.classList.remove('hidden');
    banner.style.background = oos.length > 0 ? 'linear-gradient(135deg,#7f1d1d,#991b1b)' : '';
  } else {
    banner.classList.add('hidden');
    banner.style.background = '';
  }
}

// ============================================================
// 📈 REPORTS + CHARTS
// ============================================================
function setDefaultReportDate() {
  const el = document.getElementById('reportDate');
  if (el) el.value = todayStr();
  const m = new Date();
  const rm = document.getElementById('reportMonth');
  const ry = document.getElementById('reportYear');
  if (rm) rm.value = m.getMonth() + 1;
  if (ry) ry.value = m.getFullYear();
  loadDailyReport();
}

function switchReport(type, btn) {
  currentReport = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('dailyControls').classList.toggle('hidden',       type !== 'daily');
  document.getElementById('monthlyControls').classList.toggle('hidden',     type !== 'monthly');
  document.getElementById('bestsellingControls').classList.toggle('hidden', type !== 'bestselling');
  if (type === 'daily')       loadDailyReport();
  if (type === 'monthly')     loadMonthlyReport();
  if (type === 'bestselling') loadBestSelling();
}

async function loadDailyReport() {
  const date = document.getElementById('reportDate').value;
  if (!date) return;
  document.getElementById('reportTableTitle').textContent = `Sales — ${date}`;
  const { data } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', date + 'T00:00:00').lte('created_at', date + 'T23:59:59')
    .order('created_at', { ascending: false });
  renderReport(data || []);
  renderSalesChart(data || [], 'daily');
}

async function loadMonthlyReport() {
  const month = parseInt(document.getElementById('reportMonth').value);
  const year  = parseInt(document.getElementById('reportYear').value);
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = monthEnd(year, month);
  document.getElementById('reportTableTitle').textContent = `Monthly — ${getMonthName(month)} ${year}`;
  const { data } = await db.from('sales')
    .select('*, products(name), customers(name)')
    .gte('created_at', start + 'T00:00:00').lte('created_at', end + 'T23:59:59')
    .order('created_at', { ascending: false });
  renderReport(data || []);
  renderSalesChart(data || [], 'monthly');
}

async function loadBestSelling() {
  const topN = parseInt(document.getElementById('topN').value) || 5;
  document.getElementById('reportTableTitle').textContent = `Top ${topN} Best Selling Products`;
  const { data } = await db.from('sales').select('product_id, quantity, total_price, products(name)');
  const map = {};
  (data || []).forEach(s => {
    const name = s.products?.name || 'Unknown';
    if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
    map[name].qty     += s.quantity;
    map[name].revenue += s.total_price;
  });
  const sorted = Object.values(map).sort((a,b) => b.qty - a.qty).slice(0, topN);

  document.getElementById('rptTotalSales').textContent   = `KSh ${fmt(sorted.reduce((s,r) => s + r.revenue, 0))}`;
  document.getElementById('rptTotalProfit').textContent  = '—';
  document.getElementById('rptTransactions').textContent = sorted.length;

  const tbody = document.getElementById('reportBody');
  tbody.innerHTML = sorted.length
    ? sorted.map((r, i) => `<tr>
        <td><strong>${i+1}. ${escHtml(r.name)}</strong></td>
        <td colspan="2">—</td>
        <td class="mono">${r.qty} units</td>
        <td colspan="2" class="mono">KSh ${fmt(r.revenue)}</td>
        <td>—</td><td>—</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty-state">No sales data</td></tr>';

  renderBestSellingChart(sorted);
}

function renderReport(sales) {
  const totalSales  = sales.reduce((s,r) => s + r.total_price, 0);
  const totalProfit = sales.reduce((s,r) => s + r.profit, 0);
  document.getElementById('rptTotalSales').textContent   = `KSh ${fmt(totalSales)}`;
  document.getElementById('rptTotalProfit').textContent  = `KSh ${fmt(totalProfit)}`;
  document.getElementById('rptTransactions').textContent = sales.length;

  const tbody = document.getElementById('reportBody');
  tbody.innerHTML = sales.length
    ? sales.map(s => `<tr>
        <td>${escHtml(s.products?.name||'?')}</td>
        <td>${escHtml(s.customers?.name||'Walk-in')}</td>
        <td class="mono">${s.quantity}</td>
        <td class="mono">${s.discount > 0 ? 'KSh ' + fmt(s.discount) : '—'}</td>
        <td class="mono">KSh ${fmt(s.total_price)}</td>
        <td class="mono" style="color:var(--teal)">KSh ${fmt(s.profit)}</td>
        <td><span class="pay-${(s.payment_method||'cash').toLowerCase().replace('-','')}">${s.payment_method||'Cash'}</span></td>
        <td style="color:var(--text-muted);font-size:12px">${dtStr(s.created_at)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty-state">No sales for this period</td></tr>';
}

function renderSalesChart(sales, mode) {
  const ctx = document.getElementById('reportChart').getContext('2d');
  if (reportChart) { reportChart.destroy(); reportChart = null; }

  if (mode === 'daily') {
    const hours = Array.from({length:24}, (_,i) => `${String(i).padStart(2,'0')}:00`);
    const totals = new Array(24).fill(0);
    sales.forEach(s => { const h = new Date(s.created_at).getHours(); totals[h] += s.total_price; });
    document.getElementById('chartTitle').textContent = '📊 Sales by Hour';
    reportChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: hours, datasets: [{ label: 'Sales (KSh)', data: totals, backgroundColor: '#2d5a27', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  } else {
    const dayMap = {};
    sales.forEach(s => { const d = s.created_at.split('T')[0]; dayMap[d] = (dayMap[d] || 0) + s.total_price; });
    const labels = Object.keys(dayMap).sort();
    const vals = labels.map(l => dayMap[l]);
    document.getElementById('chartTitle').textContent = '📊 Sales by Day';
    reportChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Sales (KSh)', data: vals, borderColor: '#3d8b37', backgroundColor: 'rgba(61,139,55,.15)', fill: true, tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }
}

function renderBestSellingChart(data) {
  const ctx = document.getElementById('reportChart').getContext('2d');
  if (reportChart) { reportChart.destroy(); reportChart = null; }
  document.getElementById('chartTitle').textContent = '🏆 Best Selling Products';
  reportChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.name),
      datasets: [{ label: 'Units Sold', data: data.map(d => d.qty), backgroundColor: '#2d5a27', borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
  });
}

// ============================================================
// 📥 EXPORT EXCEL
// ============================================================
function exportToExcel() {
  const table = document.getElementById('reportTable');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
  XLSX.writeFile(wb, `GB_Shop_Report_${todayStr()}.xlsx`);
  showToast('📥 Excel file downloaded!', 'success');
}

// ============================================================
// 📄 EXPORT PDF
// ============================================================
function exportToPDF() {
  const title  = document.getElementById('reportTableTitle').textContent;
  const total  = document.getElementById('rptTotalSales').textContent;
  const profit = document.getElementById('rptTotalProfit').textContent;
  const txns   = document.getElementById('rptTransactions').textContent;
  const table  = document.getElementById('reportTable').outerHTML;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:12px}
      h1{color:#1a2e1a;font-size:16px}
      .summary{display:flex;gap:20px;margin:10px 0;background:#e8f5e2;padding:10px;border-radius:8px}
      .summary div{flex:1}
      .summary strong{display:block;font-size:14px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th{background:#1a2e1a;color:white;padding:8px;text-align:left;font-size:11px}
      td{padding:7px 8px;border-bottom:1px solid #dde}
      tr:nth-child(even){background:#f4f7f3}
      .footer{margin-top:15px;color:#888;font-size:11px;text-align:center}
    </style></head><body>
    <h1>🛍️ GB Shop Manager — ${title}</h1>
    <div class="summary">
      <div><small>Total Sales</small><strong>${total}</strong></div>
      <div><small>Total Profit</small><strong>${profit}</strong></div>
      <div><small>Transactions</small><strong>${txns}</strong></div>
      <div><small>Generated</small><strong>${new Date().toLocaleString('en-KE')}</strong></div>
    </div>
    ${table}
    <div class="footer">Generated by GB Shop Manager</div>
    </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
  showToast('📄 PDF ready to print/save!', 'success');
}

// ============================================================
// 📲 WHATSAPP REPORT
// ============================================================
async function sendWhatsAppReport() {
  const today = todayStr();
  const { data: sales }    = await db.from('sales').select('total_price,profit,payment_method').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59');
  const { data: expenses } = await db.from('expenses').select('amount').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59');
  const { data: debts }    = await db.from('mkopo').select('amount').neq('status','paid');

  const totalSales   = (sales||[]).reduce((s,r) => s + r.total_price, 0);
  const totalProfit  = (sales||[]).reduce((s,r) => s + r.profit, 0);
  const totalExp     = (expenses||[]).reduce((s,r) => s + r.amount, 0);
  const totalDebt    = (debts||[]).reduce((s,r) => s + r.amount, 0);
  const mpesaSales   = (sales||[]).filter(s => s.payment_method === 'M-Pesa').reduce((s,r) => s + r.total_price, 0);
  const cashSales    = (sales||[]).filter(s => s.payment_method === 'Cash').reduce((s,r) => s + r.total_price, 0);
  const lowStock     = allProducts.filter(p => p.stock < (p.reorder_level || LOW_STOCK_THRESHOLD));

  const msg = `
🛍️ *GB SHOP MANAGER — DAILY REPORT*
📅 ${today} | 👤 ${currentUser.name}
────────────────────
💰 *Total Sales:* KSh ${fmt(totalSales)}
   • Cash: KSh ${fmt(cashSales)}
   • M-Pesa: KSh ${fmt(mpesaSales)}
📈 *Profit:* KSh ${fmt(totalProfit)}
💸 *Expenses:* KSh ${fmt(totalExp)}
📊 *Net:* KSh ${fmt(totalProfit - totalExp)}
📋 *Unpaid Debts:* KSh ${fmt(totalDebt)}
────────────────────
⚠️ *Low Stock (${lowStock.length}):*
${lowStock.length ? lowStock.map(p => `  • ${p.name}: ${p.stock} left`).join('\n') : '  ✅ All stocked'}
────────────────────
_GB Shop Manager_`.trim();

  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

// ============================================================
// 📷 BARCODE SCANNER
// ============================================================
let barcodeStream = null;

function openBarcodeScanner() {
  document.getElementById('barcodeScannerModal').classList.remove('hidden');
  startBarcodeCamera();
}

function closeBarcodeScanner() {
  stopBarcodeCamera();
  document.getElementById('barcodeScannerModal').classList.add('hidden');
}

async function startBarcodeCamera() {
  const video    = document.getElementById('barcodeVideo');
  const statusEl = document.getElementById('barcodeStatus');
  try {
    barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = barcodeStream;
    video.play();
    if ('BarcodeDetector' in window) {
      statusEl.textContent = '📷 Camera ready — point at barcode';
      statusEl.style.color = '#3d8b37';
      const detector = new BarcodeDetector({
        formats: ['code_128','code_39','ean_13','ean_8','qr_code','upc_a','upc_e']
      });
      const scanInterval = setInterval(async () => {
        if (!barcodeStream) { clearInterval(scanInterval); return; }
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) { clearInterval(scanInterval); handleScannedCode(barcodes[0].rawValue); }
        } catch(e) {}
      }, 300);
    } else {
      statusEl.textContent = '⚠️ Auto-scan not supported — use manual entry below';
      statusEl.style.color = '#d97706';
    }
  } catch(err) {
    statusEl.textContent = '❌ Camera access denied — use manual entry below';
    statusEl.style.color = '#dc2626';
    video.style.display = 'none';
  }
}

function stopBarcodeCamera() {
  if (barcodeStream) { barcodeStream.getTracks().forEach(t => t.stop()); barcodeStream = null; }
  const video = document.getElementById('barcodeVideo');
  if (video) { video.srcObject = null; video.style.display = 'block'; }
}

function handleScannedCode(code) {
  closeBarcodeScanner();
  const product = allProducts.find(p => p.product_code === code);
  if (product) {
    const sel = document.getElementById('saleProduct');
    if (sel) { sel.value = product.id; updateSalePreview(); }
    showToast(`✅ Scanned: ${product.name}`, 'success');
  } else {
    showToast(`🔍 Code "${code}" not found`, 'warning');
    const manualInput = document.getElementById('barcodeManualInput');
    if (manualInput) manualInput.value = code;
  }
}

function submitManualBarcode() {
  const code = document.getElementById('barcodeManualInput').value.trim();
  if (!code) { showToast('Enter a product code', 'warning'); return; }
  handleScannedCode(code);
}

// ============================================================
// 🛠️ HELPERS
// ============================================================
function fmt(n) {
  if (isNaN(n) || n === null) return '0.00';
  return parseFloat(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayStr()        { return new Date().toISOString().split('T')[0]; }
function monthEnd(y, m)    { return new Date(y, m, 0).toISOString().split('T')[0]; }
function getMonthName(n)   { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][n-1]||''; }
function timeStr(iso)      { return iso ? new Date(iso).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : ''; }
function dateStr(iso)      { return iso ? new Date(iso).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : ''; }
function dtStr(iso)        { return iso ? new Date(iso).toLocaleString('en-KE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''; }
function escHtml(s)        { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// 🔑 BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  buildUserSelect();
  checkSession();
  if (sessionStorage.getItem('gb_locked') === '1' && sessionStorage.getItem('gb_user')) {
    const saved = sessionStorage.getItem('gb_user');
    if (saved) { try { currentUser = JSON.parse(saved); } catch(e) {} }
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    lockApp();
  }
  const paymentSel = document.getElementById('salePayment');
  if (paymentSel) {
    paymentSel.addEventListener('change', function() {
      const mpesaGroup = document.getElementById('mpesaRefGroup');
      if (mpesaGroup) mpesaGroup.style.display = this.value === 'M-Pesa' ? 'block' : 'none';
    });
  }
});

// ============================================================
// 🔒 LOCK SCREEN
// ============================================================
let lockPin   = '';
let idleTimer = null;
const IDLE_MINUTES = 5;

function lockApp() {
  lockPin = '';
  updateLockDots('');
  document.getElementById('lockPinError').classList.add('hidden');
  document.getElementById('lockUserName').textContent = `${currentUser?.avatar || '👤'} ${currentUser?.name || 'User'}`;
  document.getElementById('lockScreen').classList.remove('hidden');
  sessionStorage.setItem('gb_locked', '1');
  clearIdleTimer();
}

function unlockApp() {
  document.getElementById('lockScreen').classList.add('hidden');
  sessionStorage.removeItem('gb_locked');
  lockPin = '';
  updateLockDots('');
  resetIdleTimer();
  showToast('🔓 Unlocked!', 'success');
}

function addLockPin(digit) {
  if (lockPin.length >= 4) return;
  lockPin += digit;
  updateLockDots(lockPin);
  if (lockPin.length === 4) setTimeout(checkLockPin, 150);
}

function clearLockPin() {
  lockPin = lockPin.slice(0, -1);
  updateLockDots(lockPin);
  document.getElementById('lockPinError').classList.add('hidden');
}

function checkLockPin() {
  if (!currentUser) return;
  const user = USERS.find(u => u.id === currentUser.id);
  const correctPin = user ? user.pin : '7526';
  if (lockPin === correctPin) {
    unlockApp();
  } else {
    document.getElementById('lockPinError').classList.remove('hidden');
    lockPin = '';
    updateLockDots('');
    const dots = document.getElementById('lockPinDots');
    dots.style.animation = 'none';
    void dots.offsetWidth;
    dots.style.animation = 'shake 0.4s ease';
  }
}

function updateLockDots(val) {
  document.querySelectorAll('#lockPinDots span').forEach((d, i) => {
    d.classList.toggle('filled', i < val.length);
  });
}

function resetIdleTimer() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    if (currentUser && document.getElementById('lockScreen').classList.contains('hidden')) {
      lockApp();
      showToast('🔒 Auto-locked due to inactivity', 'warning');
    }
  }, IDLE_MINUTES * 60 * 1000);
}

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

function startIdleWatcher() {
  ['click','keydown','mousemove','touchstart','scroll'].forEach(evt => {
    document.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  resetIdleTimer();
}
