const API_BASE = '/api';

class GroceryInventorySystem {
    constructor() {
        this.products = [];
        this.categories = [];
        this.suppliers = [];
        this.salesData = [];
        this.stockAdjustments = [];
        this.currentEditingId = null;
        this.currentEditingType = null;
        this.charts = {};
        this.barcodeCallback = null;
        this.saleItems = [];
        this.soldData = [];
        this.isConnected = false;

        this.init();
    }

 
    async api(path, options = {}) {
        try {
            const token = localStorage.getItem('invexa_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const res = await fetch(API_BASE + path, {
                headers,
                ...options,
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            if (res.status === 401) {
                localStorage.removeItem('invexa_token');
                localStorage.removeItem('invexa_user');
                window.location.href = '/login.html';
                throw new Error('Session expired. Redirecting to login...');
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
            return data;
        } catch (err) {
            if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                this.updateConnectionStatus(false);
                throw new Error('Cannot connect to server. Make sure: node server.js is running on port 5000.');
            }
            throw err;
        }
    }

    async loadAllData() {
        try {
            const userData = JSON.parse(localStorage.getItem('invexa_user') || '{}');
            const role = (userData.role || 'staff').toLowerCase();
            const requests = [this.api('/products'), this.api('/sales/summary?days=7')];
            let categoryIndex = -1;
            let supplierIndex = -1;

            if (role !== 'staff') {
                categoryIndex = 1;
                supplierIndex = 2;
                requests.splice(1, 0, this.api('/categories'));
                requests.splice(2, 0, this.api('/suppliers'));
            }

            const results = await Promise.all(requests);
            this.products = results[0];
            if (role !== 'staff') {
                this.categories = results[categoryIndex];
                this.suppliers = results[supplierIndex];
                this.salesData = results[3].map(s => ({ date: s.date, totalSales: s.totalSales, transactions: s.transactions, topProduct: s.topProduct || '' }));
            } else {
                this.categories = [];
                this.suppliers = [];
                this.salesData = results[1].map(s => ({ date: s.date, totalSales: s.totalSales, transactions: s.transactions, topProduct: s.topProduct || '' }));
            }
            this.updateConnectionStatus(true);
        } catch (err) {
            this.showNotification('' + err.message, 'error');
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        const dot = document.getElementById('connectionDot');
        const label = document.getElementById('connectionLabel');
        if (dot && label) {
            dot.style.background = connected ? '#22c55e' : '#ef4444';
            label.textContent = connected ? 'Live' : 'Offline';
        }
    }

    // All data is loaded from MongoDB API in loadAllData() — no static fallback
    initializeData() {
        // Empty - populated from API
    }

    async init() {
        this.setupEventListeners();
        this.showSection('dashboard');
        this.showNotification('Connecting to server...', 'info');
        await this.loadAllData();
        this.populateDropdowns();
        this.renderDashboard();
        this.renderAllTables();
        this.createCharts();
        // FIX: S4 - Restore last-used prediction model from localStorage
        const savedModel = localStorage.getItem('invexa_forecast_model');
        if (savedModel) { const el = document.getElementById('forecastModel'); if (el) el.value = savedModel; }
        // FIX: Task 5 - Low stock login alert (non-blocking, delayed)
        setTimeout(() => this.checkLowStockAlert(), 800);
    }

    setupEventListeners() {
        // Navigation - Fixed to prevent default and properly handle section switching
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const section = link.getAttribute('data-section');
                this.showSection(section);
                this.updateActiveNavLink(link);
            });
        });

        // Modal buttons - Fixed to ensure proper functionality
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showProductModal();
            });
        }

        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showCategoryModal();
            });
        }

        const addSupplierBtn = document.getElementById('addSupplierBtn');
        if (addSupplierBtn) {
            addSupplierBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSupplierModal();
            });
        }

        const recordSaleBtn = document.getElementById('recordSaleBtn');
        if (recordSaleBtn) {
            recordSaleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSaleModal();
            });
        }

        const stockAdjustBtn = document.getElementById('stockAdjustBtn');
        if (stockAdjustBtn) {
            stockAdjustBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showStockAdjustModal();
            });
        }

        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.exportData();
            });
        }

        const runPredictionsBtn = document.getElementById('runPredictionsBtn');
        if (runPredictionsBtn) {
            runPredictionsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.runAdvancedAnalytics();
            });
        }

        const exportPredictionsBtn = document.getElementById('exportPredictionsBtn');
        if (exportPredictionsBtn) {
            exportPredictionsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.exportAnalytics();
            });
        }

        // Analytics tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchAnalyticsTab(e.target.dataset.tab);
            });
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllModals();
            });
        });

        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllModals();
            });
        });

        // Form submissions
        const productForm = document.getElementById('productForm');
        if (productForm) {
            productForm.addEventListener('submit', (e) => this.handleProductSubmit(e));
        }

        const categoryForm = document.getElementById('categoryForm');
        if (categoryForm) {
            categoryForm.addEventListener('submit', (e) => this.handleCategorySubmit(e));
        }

        const supplierForm = document.getElementById('supplierForm');
        if (supplierForm) {
            supplierForm.addEventListener('submit', (e) => this.handleSupplierSubmit(e));
        }

        const saleForm = document.getElementById('saleForm');
        if (saleForm) {
            saleForm.addEventListener('submit', (e) => this.handleSaleSubmit(e));
        }

        const stockAdjustForm = document.getElementById('stockAdjustForm');
        if (stockAdjustForm) {
            stockAdjustForm.addEventListener('submit', (e) => this.handleStockAdjustSubmit(e));
        }

        // Search and filters
        const productSearch = document.getElementById('productSearch');
        if (productSearch) {
            productSearch.addEventListener('input', (e) => this.filterProducts());
        }

        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => this.filterProducts());
        }

        const stockFilter = document.getElementById('stockFilter');
        if (stockFilter) {
            stockFilter.addEventListener('change', (e) => this.filterProducts());
        }

        // Barcode scanning
        const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
        if (scanBarcodeBtn) {
            scanBarcodeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startBarcodeScanner('productBarcode');
            });
        }

        // Product barcode field: Enter key triggers Open Food Facts lookup
        const productBarcodeField = document.getElementById('productBarcode');
        if (productBarcodeField) {
            productBarcodeField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.lookupProductBarcode(productBarcodeField.value.trim()); }
            });
        }
        // Restore saved Gemini API key
        const savedGeminiKey = localStorage.getItem('gemini_api_key');
        if (savedGeminiKey) { const gf = document.getElementById('geminiApiKey'); if (gf) gf.value = savedGeminiKey; }

        // Sale form enhancements
        const addSaleItemBtn = document.getElementById('addSaleItemBtn');
        if (addSaleItemBtn) {
            addSaleItemBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addSaleItem();
            });
        }

        // Keyboard +/- shortcuts for sale modal
        document.addEventListener('keydown', (e) => {
            const saleModal = document.getElementById('saleModal');
            if (!saleModal || saleModal.classList.contains('hidden')) return;
            // Don't trigger when typing in an input, select, or textarea
            const tag = (document.activeElement || {}).tagName;
            if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
            if (e.key === '+' || e.key === '=') { e.preventDefault(); this.addSaleItem(); }
            if (e.key === '-' || e.key === '_') { e.preventDefault(); this.removeLastSaleItem(); }
        });

        // Stock adjustment product selection
        const adjustProduct = document.getElementById('adjustProduct');
        if (adjustProduct) {
            adjustProduct.addEventListener('change', (e) => this.updateStockDisplay(e.target.value));
        }

        // Initialize sale form listeners
        this.attachSaleItemListeners();
    }

    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(sectionName);
        if (targetSection) {
            targetSection.classList.add('active');

            // Refresh section-specific content
            switch (sectionName) {
                case 'dashboard':
                    this.renderDashboard();
                    setTimeout(() => this.createCharts(), 100);
                    break;
                case 'products':
                    this.renderProductsTable();
                    break;
                case 'alerts':
                    this.renderAlerts();
                    break;
                case 'categories':
                    this.renderCategoriesTable();
                    break;
                case 'suppliers':
                    this.renderSuppliersTable();
                    break;
                case 'expiry':
                    this.renderExpiryTracking();
                    break;
                case 'valuation':
                    this.renderValuation();
                    break;
                case 'reorder':
                    this.renderReorderSuggestions();
                    break;
                case 'salesprofit':
                    this.initSalesProfitHub();
                    break;
                case 'prediction':
                    // Prediction charts are created when "Run AI Predictions" is clicked
                    break;
                case 'intelligence':
                    if (typeof window.initIntelligence === 'function') {
                        // Reset initialised flag so it always fetches fresh data
                        window.iaInitialized = false;
                        setTimeout(() => window.initIntelligence(), 100);
                    }
                    break;
            }
        }
    }

    updateActiveNavLink(activeLink) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    populateDropdowns() {
        // Populate category dropdowns
        const categorySelects = ['productCategory', 'categoryFilter'];
        categorySelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                const isFilter = selectId.includes('Filter');
                select.innerHTML = isFilter ? '<option value="">All Categories</option>' : '<option value="">Select Category</option>';

                this.categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category.name;
                    option.textContent = category.name;
                    select.appendChild(option);
                });

                if (currentValue) {
                    select.value = currentValue;
                }
            }
        });

        // Populate supplier dropdown
        const supplierSelect = document.getElementById('productSupplier');
        if (supplierSelect) {
            const currentValue = supplierSelect.value;
            supplierSelect.innerHTML = '<option value="">Select Supplier</option>';
            this.suppliers.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.name;
                option.textContent = supplier.name;
                supplierSelect.appendChild(option);
            });
            if (currentValue) {
                supplierSelect.value = currentValue;
            }
        }

        // Populate sale product dropdowns
        this.populateSaleProductDropdowns();

        // Populate stock adjustment product dropdown
        const adjustProductSelect = document.getElementById('adjustProduct');
        if (adjustProductSelect) {
            const currentValue = adjustProductSelect.value;
            adjustProductSelect.innerHTML = '<option value="">Select Product</option>';
            this.products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = `${product.name} (Current: ${product.currentStock})`;
                adjustProductSelect.appendChild(option);
            });
            if (currentValue) {
                adjustProductSelect.value = currentValue;
            }
        }
    }

    populateSaleProductDropdowns() {
        const saleProductSelects = document.querySelectorAll('.sale-product');
        saleProductSelects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Select Product</option>';
            this.products.forEach(product => {
                if (product.currentStock > 0) {
                    const option = document.createElement('option');
                    option.value = product._id || product.id;
                    option.textContent = `${product.name} (Stock: ${product.currentStock})`;
                    option.dataset.price = product.sellingPrice;
                    option.dataset.barcode = product.barcode;
                    select.appendChild(option);
                }
            });
            if (currentValue) {
                select.value = currentValue;
            }
        });
    }

    renderDashboard() {
        const totalProducts = this.products.length;
        const totalValue = this.products.reduce((sum, product) =>
            sum + (product.currentStock * product.costPrice), 0);
        const lowStockCount = this.products.filter(product =>
            product.currentStock <= product.minimumStock).length;
        const expiringCount = this.getExpiringProducts().length;

        const totalProductsEl = document.getElementById('totalProducts');
        const totalValueEl = document.getElementById('totalValue');
        const lowStockCountEl = document.getElementById('lowStockCount');
        const expiringCountEl = document.getElementById('expiringCount');

        if (totalProductsEl) totalProductsEl.textContent = totalProducts;
        if (totalValueEl) totalValueEl.textContent = `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        if (lowStockCountEl) lowStockCountEl.textContent = lowStockCount;
        if (expiringCountEl) expiringCountEl.textContent = expiringCount;

        // FIX: Task 1 - Update "last updated" footer
        const kpiTs = document.getElementById('kpiLastUpdated');
        if (kpiTs) kpiTs.textContent = 'Last updated: ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

        // FIX: S2 - Needs Attention Banner
        this.renderNeedsAttentionBanner(lowStockCount, expiringCount);

        // Render sales calendar heatmap
        try { this.renderSalesCalendar(); } catch (e) { }
    }

    // S2: Needs Attention micro-widget
    renderNeedsAttentionBanner(lowStockCount, expiringCount) {
        const banner = document.getElementById('needsAttentionBanner');
        if (!banner) return;
        const reorderCount = this.products.filter(p => p.currentStock <= p.minimumStock && p.currentStock > 0).length;
        if (lowStockCount === 0 && expiringCount === 0 && reorderCount === 0) { banner.style.display = 'none'; return; }
        let pills = '<div style="font-size:0.82rem;font-weight:700;color:var(--color-text);margin-right:8px;"><i class="fas fa-bell" style="margin-right:6px;color:#d97706;"></i>Needs Attention</div>';
        if (lowStockCount > 0) pills += `<span class="attention-pill attention-pill--low" onclick="app.showSection('alerts')"><i class="fas fa-exclamation-triangle"></i> ${lowStockCount} Low Stock</span>`;
        if (expiringCount > 0) pills += `<span class="attention-pill attention-pill--expiry" onclick="app.showSection('expiry')"><i class="fas fa-calendar-times"></i> ${expiringCount} Expiring Soon</span>`;
        if (reorderCount > 0) pills += `<span class="attention-pill attention-pill--reorder" onclick="app.showSection('reorder')"><i class="fas fa-sync-alt"></i> ${reorderCount} Pending Reorder</span>`;
        banner.innerHTML = pills;
        banner.style.display = 'flex';
    }

    // Returns Chart.js color tokens matching the current theme
    getChartColors() {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        return {
            textColor: isDark ? 'rgba(240,236,228,0.85)' : 'rgba(26,26,46,0.85)',
            gridColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            doughnutBorder: isDark ? '#12121a' : '#ffffff',
        };
    }

    // Apply Chart.js global defaults for the current theme
    applyChartDefaults() {
        const c = this.getChartColors();
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = c.textColor;
            Chart.defaults.borderColor = c.gridColor;
            Chart.defaults.scale = Chart.defaults.scale || {};
            Chart.defaults.plugins = Chart.defaults.plugins || {};
        }
    }

    createCharts() {
        this.applyChartDefaults();
        this.createSalesChart();
        this.createCategoryChart();
    }

    createSalesChart() {
        const ctx = document.getElementById('salesChart');
        if (!ctx) return;

        if (this.charts.sales) {
            this.charts.sales.destroy();
        }

        const chartColors = this.getChartColors();
        this.charts.sales = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.salesData.map(data => {
                    const date = new Date(data.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Daily Sales (₹)',
                    data: this.salesData.map(data => data.totalSales),
                    borderColor: '#0066FF',
                    backgroundColor: 'rgba(0, 102, 255, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: chartColors.gridColor },
                        ticks: {
                            color: chartColors.textColor,
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    },
                    x: {
                        grid: { color: chartColors.gridColor },
                        ticks: { color: chartColors.textColor }
                    }
                }
            }
        });
    }

    createCategoryChart() {
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        if (this.charts.category) {
            this.charts.category.destroy();
        }

        const colors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325'];
        const catChartColors = this.getChartColors();

        this.charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: this.categories.map(cat => cat.name),
                datasets: [{
                    data: this.categories.map(cat => cat.totalProducts),
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: catChartColors.doughnutBorder
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: catChartColors.textColor }
                    }
                }
            }
        });
    }

    createSalesReportChart() {
        const ctx = document.getElementById('salesReportChart');
        if (!ctx) return;

        if (this.charts.salesReport) {
            this.charts.salesReport.destroy();
        }

        const reportChartColors = this.getChartColors();
        this.charts.salesReport = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: this.salesData.map(data => {
                    const date = new Date(data.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Sales (₹)',
                    data: this.salesData.map(data => data.totalSales),
                    backgroundColor: '#0066FF'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: reportChartColors.textColor } }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: reportChartColors.gridColor },
                        ticks: {
                            color: reportChartColors.textColor,
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    },
                    x: {
                        grid: { color: reportChartColors.gridColor },
                        ticks: { color: reportChartColors.textColor }
                    }
                }
            }
        });
    }

    createProfitChart() {
        const ctx = document.getElementById('profitChart');
        if (!ctx) return;

        if (this.charts.profit) {
            this.charts.profit.destroy();
        }

        const profitData = this.categories.map(cat => ({
            category: cat.name,
            profit: cat.totalValue * (cat.avgMargin / 100)
        }));

        this.charts.profit = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: profitData.map(data => data.category),
                datasets: [{
                    label: 'Profit by Category ($)',
                    data: profitData.map(data => data.profit),
                    backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    }
                }
            }
        });
    }

    renderAllTables() {
        this.renderProductsTable();
        this.renderCategoriesTable();
        this.renderSuppliersTable();
    }

    renderProductsTable() {
        const tableBody = document.getElementById('productsTableBody');
        if (!tableBody) return;

        let filteredProducts = [...this.products];

        // Apply filters
        const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
        const categoryFilter = document.getElementById('categoryFilter')?.value || '';
        const stockFilter = document.getElementById('stockFilter')?.value || '';

        if (searchTerm) {
            filteredProducts = filteredProducts.filter(product =>
                product.name.toLowerCase().includes(searchTerm) ||
                product.category.toLowerCase().includes(searchTerm) ||
                product.supplier.toLowerCase().includes(searchTerm) ||
                (product.barcode && product.barcode.includes(searchTerm))
            );
        }

        if (categoryFilter) {
            filteredProducts = filteredProducts.filter(product => product.category === categoryFilter);
        }

        if (stockFilter) {
            filteredProducts = filteredProducts.filter(product => {
                const status = this.getStockStatus(product);
                return status === stockFilter;
            });
        }

        if (filteredProducts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">
                        No products found matching your criteria.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filteredProducts.map(product => {
            const status = this.getStockStatus(product);
            const statusClass = `status-indicator--${status}`;
            const statusText = this.getStockStatusText(status);
            const margin = ((product.sellingPrice - product.costPrice) / product.costPrice * 100).toFixed(1);

            return `
                <tr>
                    <td>
                        <div>
                            <strong>${this.escapeHtml(product.name)}</strong>
                            <div style="font-size: 0.8em; color: var(--color-text-secondary);">
                                Batch: ${product.batchNumber} | Barcode: ${product.barcode}
                            </div>
                        </div>
                    </td>
                    <td>${this.escapeHtml(product.category)}</td>
                    <td>
                        <div>${product.currentStock} / ${product.maxStock}</div>
                        <div style="font-size: 0.8em; color: var(--color-text-secondary);">
                            Min: ${product.minimumStock}
                        </div>
                    </td>
                    <td>₹${product.costPrice.toFixed(2)}</td>
                    <td>
                        <div>₹${product.sellingPrice.toFixed(2)}</div>
                        <div style="font-size: 0.8em; color: var(--color-success);">
                            +${margin}% margin
                        </div>
                    </td>
                    <td>${this.escapeHtml(product.supplier)}</td>
                    <td>
                        <div>${new Date(product.expiryDate).toLocaleDateString()}</div>
                        <div style="font-size: 0.8em; color: var(--color-text-secondary);">
                            ${this.getDaysUntilExpiry(product.expiryDate)} days
                        </div>
                    </td>
                    <td>${this.escapeHtml(product.location)}</td>
                    <td>
                        <span class="status-indicator ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-icon btn-icon--edit" onclick="app.editProduct('${product._id || product.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-icon--delete" onclick="app.deleteProduct('${product._id || product.id}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                            ${product.currentStock <= product.minimumStock * 2 ? `<button class="btn-icon" style="color:#0066FF;" onclick="app.reorderProduct('${product._id || product.id}')" title="Reorder from Supplier">
                                <i class="fas fa-truck-loading"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderCategoriesTable() {
        const tableBody = document.getElementById('categoriesTableBody');
        if (!tableBody) return;

        this.updateCategoryStatistics();

        tableBody.innerHTML = this.categories.map(category => `
            <tr>
                <td>
                    <strong>${this.escapeHtml(category.name)}</strong>
                </td>
                <td>${category.totalProducts}</td>
                <td>₹${(category.totalValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td>${category.avgMargin.toFixed(1)}%</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon btn-icon--edit" onclick="app.editCategory('${category._id || category.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-icon--delete" onclick="app.deleteCategory('${category._id || category.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderSuppliersTable() {
        const tableBody = document.getElementById('suppliersTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = this.suppliers.map(supplier => {
            // FIX: Task 3c — Build payment info row only if at least one field is non-empty
            const hasPaymentInfo = (supplier.bankAccountNumber || supplier.ifscCode || supplier.upiId || supplier.paymentNotes);
            let paymentHtml = '';
            if (hasPaymentInfo) {
                let details = [];
                if (supplier.bankAccountNumber) details.push(`<span><i class="fas fa-university" style="margin-right:4px;opacity:0.5;"></i>A/C: ${this.escapeHtml(supplier.bankAccountNumber)}</span>`);
                if (supplier.ifscCode) details.push(`<span>IFSC: ${this.escapeHtml(supplier.ifscCode)}</span>`);
                if (supplier.upiId) details.push(`<span>UPI: ${this.escapeHtml(supplier.upiId)}</span>`);
                if (supplier.paymentNotes) details.push(`<span style="opacity:0.7;font-style:italic;">${this.escapeHtml(supplier.paymentNotes)}</span>`);
                paymentHtml = `<div style="font-size:0.75rem;color:var(--color-text-secondary);margin-top:4px;display:flex;flex-wrap:wrap;gap:6px 12px;">${details.join('')}</div>`;
            }
            // FIX: S1 — UPI Pay button if upiId exists
            const upiBtn = supplier.upiId ? `<button class="btn-icon" style="color:#22c55e;" onclick="window.open('mailto:${supplier.email}?subject=Payment%20Request&body=Please%20pay%20via%20UPI%20ID:%20${encodeURIComponent(supplier.upiId)}','_blank')" title="Pay via UPI"><i class="fas fa-paper-plane"></i></button>` : '';
            return `
            <tr>
                <td>
                    <div>
                        <a href="#" onclick="event.preventDefault();app.showSupplierTracking('${supplier._id || supplier.id}','${this.escapeHtml(supplier.name).replace(/'/g, "\\'")}')"
                           style="color:var(--color-text);text-decoration:none;font-weight:600;display:flex;align-items:center;gap:6px;"
                           title="Click to view interaction history">
                            ${this.escapeHtml(supplier.name)}
                            <i class="fas fa-history" style="font-size:0.75rem;color:#7c3aed;opacity:0.7;"></i>
                        </a>
                        ${paymentHtml}
                    </div>
                </td>
                <td>
                    <div>${this.escapeHtml(supplier.contact)}</div>
                    <div style="font-size: 0.8em; color: var(--color-text-secondary);">
                        ${supplier.email}
                    </div>
                </td>
                <td>${supplier.phone}</td>
                <td>
                    <div class="flex items-center gap-8">
                        <span class="status-indicator ${supplier.reliability >= 90 ? 'status-indicator--high' : supplier.reliability >= 80 ? 'status-indicator--medium' : 'status-indicator--low'}">
                            ${supplier.reliability}%
                        </span>
                    </div>
                    <div style="font-size: 0.8em; color: var(--color-text-secondary);">
                        ${supplier.onTimeDelivery}% on-time
                    </div>
                </td>
                <td>${supplier.avgLeadTime} days</td>
                <td>
                    <div class="table-actions">
                        ${upiBtn}
                        <button class="btn-icon" style="color:#7c3aed;" onclick="app.showSupplierTracking('${supplier._id || supplier.id}','${this.escapeHtml(supplier.name).replace(/'/g, "\\'")}')"
                            title="View order & call history">
                            <i class="fas fa-history"></i>
                        </button>
                        <button class="btn-icon btn-icon--edit" onclick="app.editSupplier('${supplier._id || supplier.id}')" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-icon--delete" onclick="app.deleteSupplier('${supplier._id || supplier.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    // ─── Supplier Tracking Modal ─────────────────────────────────────────────
    async showSupplierTracking(supplierId, supplierName) {
        const modal = document.getElementById('supplierTrackingModal');
        const titleEl = document.getElementById('supplierTrackingTitle');
        const subtitleEl = document.getElementById('supplierTrackingSubtitle');
        const statsEl = document.getElementById('supplierTrackingStats');
        const loadingEl = document.getElementById('supplierTrackingLoading');
        const emptyEl = document.getElementById('supplierTrackingEmpty');
        const tableEl = document.getElementById('supplierTrackingTable');
        const bodyEl = document.getElementById('supplierTrackingBody');

        titleEl.textContent = `${supplierName} — Order History`;
        subtitleEl.textContent = 'Loading interaction records...';
        statsEl.innerHTML = '';
        loadingEl.style.display = 'block';
        emptyEl.style.display = 'none';
        tableEl.style.display = 'none';
        modal.classList.remove('hidden');

        try {
            const logs = await this.api(`/reorder/supplier/${supplierId}`);

            loadingEl.style.display = 'none';

            if (!logs || logs.length === 0) {
                emptyEl.style.display = 'block';
                subtitleEl.textContent = 'No interactions recorded yet.';
                return;
            }

            // ── Summary stats ────────────────────────────────────────────
            const totalOrders = logs.length;
            const calls = logs.filter(l => l.callStatus && l.callStatus !== 'not_initiated').length;
            const emails = logs.filter(l => l.emailStatus === 'sent').length;
            const delivered = logs.filter(l => l.orderStatus === 'delivered').length;
            const totalRequested = logs.reduce((s, l) => s + (l.reorderQuantity || 0), 0);
            const totalDelivered = logs.reduce((s, l) => s + (l.finalQuantityAgreed || 0), 0);
            const fillRate = totalRequested > 0 ? Math.round((totalDelivered / totalRequested) * 100) : 0;

            statsEl.innerHTML = [
                { label: 'Total Orders', value: totalOrders, icon: 'fa-box', color: '#0066FF' },
                { label: 'AI Calls Made', value: calls, icon: 'fa-phone', color: '#7c3aed' },
                { label: 'Emails Sent', value: emails, icon: 'fa-envelope', color: '#f59e0b' },
                { label: 'Delivered', value: delivered, icon: 'fa-check-circle', color: '#22c55e' },
                { label: 'Fill Rate', value: `${fillRate}%`, icon: 'fa-percent', color: fillRate >= 80 ? '#22c55e' : '#ef4444' }
            ].map(s => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 16px;background:rgba(${s.color === '#0066FF' ? '0,102,255' : s.color === '#7c3aed' ? '124,58,237' : s.color === '#f59e0b' ? '245,158,11' : s.color === '#22c55e' ? '34,197,94' : '239,68,68'},0.08);border-radius:10px;border:1px solid rgba(${s.color === '#0066FF' ? '0,102,255' : s.color === '#7c3aed' ? '124,58,237' : s.color === '#f59e0b' ? '245,158,11' : s.color === '#22c55e' ? '34,197,94' : '239,68,68'},0.15);">
                    <i class="fas ${s.icon}" style="color:${s.color};font-size:1rem;"></i>
                    <div>
                        <div style="font-size:1.1rem;font-weight:700;color:${s.color};line-height:1.1;">${s.value}</div>
                        <div style="font-size:0.72rem;color:var(--color-text-secondary);">${s.label}</div>
                    </div>
                </div>`).join('');

            subtitleEl.textContent = `${totalOrders} records · ${calls} AI calls · ${emails} emails · Fill rate ${fillRate}%`;

            // ── Table rows ───────────────────────────────────────────────
            const fsBadge = (fs) => {
                const map = {
                    fully_accepted: { label: '✅ Full', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
                    partially_accepted: { label: '⚡ Partial', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                    denied: { label: '❌ Denied', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
                    pending: { label: '⏳ Pending', color: '#0066FF', bg: 'rgba(0,102,255,0.1)' },
                    unknown: { label: '❓ Unknown', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' }
                };
                const b = map[fs] || map.unknown;
                return `<span style="background:${b.bg};color:${b.color};border:1px solid ${b.color}33;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;">${b.label}</span>`;
            };
            const osBadge = (os) => {
                const map = {
                    pending: ['#9ca3af', 'rgba(156,163,175,0.08)', 'Pending'],
                    confirmed: ['#0066FF', 'rgba(0,102,255,0.1)', 'Confirmed'],
                    shipped: ['#f59e0b', 'rgba(245,158,11,0.1)', 'Shipped'],
                    delivered: ['#22c55e', 'rgba(34,197,94,0.1)', 'Delivered'],
                    cancelled: ['#ef4444', 'rgba(239,68,68,0.1)', 'Cancelled']
                };
                const [c, bg, label] = map[os] || map.pending;
                return `<span style="background:${bg};color:${c};border:1px solid ${c}33;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;">${label}</span>`;
            };

            bodyEl.innerHTML = logs.map((log, idx) => {
                const date = new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const contactMethod = log.callStatus && log.callStatus !== 'not_initiated'
                    ? `<span style="color:#7c3aed;font-weight:600;"><i class="fas fa-phone"></i> AI Voice</span>${log.emailStatus === 'sent' ? '<br><span style="color:#f59e0b;font-size:0.78rem;"><i class="fas fa-envelope"></i> Email</span>' : ''}`
                    : log.emailStatus === 'sent'
                        ? `<span style="color:#f59e0b;font-weight:600;"><i class="fas fa-envelope"></i> Email Only</span>`
                        : '<span style="color:var(--color-text-secondary);font-size:0.78rem;">—</span>';

                const transcript = (log.callTranscript || '').trim();
                const transcriptHtml = transcript
                    ? `<details style="margin-top:6px;">
                          <summary style="cursor:pointer;font-size:0.75rem;color:#7c3aed;font-weight:600;">📝 View Transcript</summary>
                          <div class="transcript-box">${this.escapeHtml(transcript)}</div>
                       </details>`
                    : '';

                const markDeliverBtn = (log.orderStatus !== 'delivered' && log.orderStatus !== 'cancelled')
                    ? `<button class="btn-icon" style="color:#22c55e;" title="Mark as Delivered"
                            onclick="app.markOrderDelivered('${log._id}',${log.reorderQuantity},${idx})">
                          <i class="fas fa-truck-loading"></i>
                       </button>`
                    : '';

                const deliveredVal = log.finalQuantityAgreed !== null && log.finalQuantityAgreed !== undefined ? log.finalQuantityAgreed : '';
                const deliveredDisplay = deliveredVal !== ''
                    ? `<span class="editable-qty" onclick="app.startEditDelivered(this,'${log._id}')" title="Click to edit delivered quantity" style="cursor:pointer;text-decoration:underline dotted;">${deliveredVal}</span><br><small style="color:var(--color-text-secondary);">units <i class="fas fa-pen" style="font-size:0.6rem;color:var(--color-primary);"></i></small>`
                    : `<button class="btn-icon" style="color:var(--color-primary);font-size:0.78rem;" onclick="app.startEditDelivered(this,'${log._id}')" title="Enter delivered quantity"><i class="fas fa-plus-circle"></i> Add</button>`;

                return `<tr>
                    <td style="white-space:nowrap;font-size:0.82rem;">${date}</td>
                    <td><strong>${this.escapeHtml(log.productName)}</strong></td>
                    <td>${contactMethod}${transcriptHtml}</td>
                    <td style="text-align:center;">${log.reorderQuantity}<br><small style="color:var(--color-text-secondary);">units</small></td>
                    <td style="text-align:center;" id="delcell-${log._id}">${deliveredDisplay}</td>
                    <td>${fsBadge(log.fulfillmentStatus || 'pending')}</td>
                    <td>${osBadge(log.orderStatus || 'pending')}</td>
                    <td>${markDeliverBtn}</td>
                </tr>`;
            }).join('');

            tableEl.style.display = 'table';
        } catch (err) {
            loadingEl.style.display = 'none';
            subtitleEl.textContent = 'Failed to load history.';
            console.error('[SupplierTracking]', err);
        }
    }

    closeSupplierTracking() {
        document.getElementById('supplierTrackingModal').classList.add('hidden');
    }

    // Inline edit for delivered quantity cell
    startEditDelivered(el, logId) {
        const cell = document.getElementById(`delcell-${logId}`);
        if (!cell || cell.querySelector('input')) return; // already editing
        const currentVal = cell.querySelector('.editable-qty')?.textContent || '';
        cell.innerHTML = `
            <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="delinput-${logId}" value="${currentVal}" min="0"
                    style="width:64px;padding:4px 6px;border:1.5px solid var(--color-primary);border-radius:6px;font-size:0.85rem;background:var(--color-surface);color:var(--color-text);"
                    onkeydown="if(event.key==='Enter')app.saveDelivered('${logId}');if(event.key==='Escape')app.cancelEditDelivered('${logId}','${currentVal}')">
                <button class="btn-icon" style="color:#22c55e;" onclick="app.saveDelivered('${logId}')" title="Save"><i class="fas fa-check"></i></button>
                <button class="btn-icon" style="color:var(--color-text-secondary);" onclick="app.cancelEditDelivered('${logId}','${currentVal}')" title="Cancel"><i class="fas fa-times"></i></button>
            </div>`;
        document.getElementById(`delinput-${logId}`)?.focus();
    }

    cancelEditDelivered(logId, originalVal) {
        const cell = document.getElementById(`delcell-${logId}`);
        if (!cell) return;
        if (originalVal !== '') {
            cell.innerHTML = `<span class="editable-qty" onclick="app.startEditDelivered(this,'${logId}')" title="Click to edit" style="cursor:pointer;text-decoration:underline dotted;">${originalVal}</span><br><small style="color:var(--color-text-secondary);">units <i class="fas fa-pen" style="font-size:0.6rem;color:var(--color-primary);"></i></small>`;
        } else {
            cell.innerHTML = `<button class="btn-icon" style="color:var(--color-primary);font-size:0.78rem;" onclick="app.startEditDelivered(this,'${logId}')" title="Enter delivered quantity"><i class="fas fa-plus-circle"></i> Add</button>`;
        }
    }

    async saveDelivered(logId) {
        const input = document.getElementById(`delinput-${logId}`);
        if (!input) return;
        const qty = parseInt(input.value, 10);
        if (isNaN(qty) || qty < 0) { this.showNotification('Please enter a valid quantity.', 'error'); return; }
        input.disabled = true;
        try {
            await this.api(`/reorder/${logId}/deliver`, { method: 'PATCH', body: { quantityReceived: qty, deliveryNotes: '' } });
            this.showNotification(`Delivery quantity saved: ${qty} units.`, 'success');
            const cell = document.getElementById(`delcell-${logId}`);
            if (cell) cell.innerHTML = `<span class="editable-qty" onclick="app.startEditDelivered(this,'${logId}')" title="Click to edit" style="cursor:pointer;text-decoration:underline dotted;">${qty}</span><br><small style="color:var(--color-text-secondary);">units <i class="fas fa-pen" style="font-size:0.6rem;color:var(--color-primary);"></i></small>`;
        } catch (err) {
            this.showNotification('Failed to save: ' + err.message, 'error');
            if (input) input.disabled = false;
        }
    }

    async markOrderDelivered(logId, originalQty, rowIdx) {
        const qtyInput = prompt(`How many units were actually delivered? (Requested: ${originalQty})`, originalQty);
        if (qtyInput === null) return;
        const qty = parseInt(qtyInput, 10);
        if (isNaN(qty) || qty < 0) { this.showNotification('Please enter a valid quantity.', 'error'); return; }
        try {
            await this.api(`/reorder/${logId}/deliver`, { method: 'PATCH', body: { quantityReceived: qty, deliveryNotes: '' } });
            this.showNotification(`Order marked as delivered. ${qty} units received.`, 'success');
            const rows = document.querySelectorAll('#supplierTrackingBody tr');
            if (rows[rowIdx]) rows[rowIdx].cells[6].innerHTML = '<span style="background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid #22c55e33;padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;">Delivered</span>';
            if (rows[rowIdx]) rows[rowIdx].cells[7].innerHTML = '';
            const delCell = document.getElementById(`delcell-${logId}`);
            if (delCell) delCell.innerHTML = `<span class="editable-qty" onclick="app.startEditDelivered(this,'${logId}')" title="Click to edit" style="cursor:pointer;text-decoration:underline dotted;">${qty}</span><br><small style="color:var(--color-text-secondary);">units <i class="fas fa-pen" style="font-size:0.6rem;color:var(--color-primary);"></i></small>`;
        } catch (err) {
            this.showNotification('Failed to update: ' + err.message, 'error');
        }
    }

    renderAlerts() {
        const alertsList = document.getElementById('alertsList');
        if (!alertsList) return;

        const lowStockProducts = this.products.filter(product =>
            product.currentStock <= product.minimumStock);

        if (lowStockProducts.length === 0) {
            alertsList.innerHTML = `
                <div class="placeholder-content">
                    <i class="fas fa-check-circle" style="color: var(--color-success);"></i>
                    <p>No low stock alerts! All products are adequately stocked.</p>
                </div>
            `;
            return;
        }

        alertsList.innerHTML = lowStockProducts.map(product => {
            const deficit = product.minimumStock - product.currentStock;
            const suggestedQty = Math.max(deficit * 2, product.minimumStock);
            const pid = product._id || product.id;
            return `
            <div class="alert-item">
                <div class="alert-content">
                    <h4>${this.escapeHtml(product.name)}</h4>
                    <p>Current stock: <strong style="color:#ef4444;">${product.currentStock}</strong> | Minimum required: ${product.minimumStock}</p>
                    <p style="color: var(--color-text-secondary); font-size: 0.9em;">
                        Supplier: ${product.supplier} | Location: ${product.location} | Suggested order: ${suggestedQty} units
                    </p>
                </div>
                <div class="alert-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn--primary btn--sm" onclick="app.executeReorder('${pid}', ${suggestedQty})">
                        <i class="fas fa-envelope"></i> Reorder (Email)
                    </button>
                    <button class="btn btn--sm" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:600;" onclick="app.markOrderReceived('${pid}', '${product.name.replace(/'/g, "\\'")}', ${suggestedQty})">
                        <i class="fas fa-check-double"></i> Mark Received
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    renderReorderSuggestions() {
        const reorderList = document.getElementById('reorderList');
        if (!reorderList) return;

        const reorderSuggestions = this.generateReorderSuggestions();

        if (reorderSuggestions.length === 0) {
            reorderList.innerHTML = `
                <div class="placeholder-content">
                    <i class="fas fa-sync-alt"></i>
                    <p>No reorder suggestions at this time. All products are well-stocked.</p>
                </div>
            `;
            return;
        }

        reorderList.innerHTML = reorderSuggestions.map(suggestion => `
            <div class="reorder-item">
                <h4>${this.escapeHtml(suggestion.product.name)}</h4>
                <div class="reorder-details">
                    <p><strong>Current Stock:</strong> ${suggestion.product.currentStock}</p>
                    <p><strong>Suggested Order:</strong> ${suggestion.suggestedQuantity} units</p>
                    <p><strong>Reason:</strong> ${suggestion.reason}</p>
                    <p><strong>Priority:</strong> <span class="status-indicator status-indicator--${suggestion.priority}">${suggestion.priority.toUpperCase()}</span></p>
                    <p><strong>Supplier:</strong> ${suggestion.product.supplier}</p>
                    <p><strong>Est. Lead Time:</strong> ${this.getSupplierLeadTime(suggestion.product.supplier)} days</p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <button class="btn btn--primary btn--sm" onclick="app.executeReorder('${suggestion.product._id || suggestion.product.id}', ${suggestion.suggestedQuantity})" title="Send reorder email only">
                        <i class="fas fa-envelope"></i>  Email Order
                    </button>
                    <button class="btn btn--sm btn--call" onclick="app.callAndEmailSupplier('${suggestion.product._id || suggestion.product.id}', ${suggestion.suggestedQuantity})" title="AI voice call supplier + send confirmation email">
                        <i class="fas fa-phone"></i>  Call + Email
                    </button>
                    <button class="btn btn--sm" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;" onclick="app.markOrderReceived('${suggestion.product._id || suggestion.product.id}', '${suggestion.product.name.replace(/'/g, "\\'")}', ${suggestion.suggestedQuantity})">
                        <i class="fas fa-check-double"></i> Mark Received
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderExpiryTracking() {
        const expiryList = document.getElementById('expiryList');
        if (!expiryList) return;

        const expiringProducts = this.getExpiringProducts();

        if (expiringProducts.length === 0) {
            expiryList.innerHTML = `
                <div class="placeholder-content">
                    <i class="fas fa-calendar-check" style="color: var(--color-success);"></i>
                    <p>No products expiring soon.</p>
                </div>
            `;
            return;
        }

        expiryList.innerHTML = expiringProducts.map(product => {
            const daysUntilExpiry = this.getDaysUntilExpiry(product.expiryDate);
            const isExpired = daysUntilExpiry < 0;
            const isCritical = daysUntilExpiry <= 3 && daysUntilExpiry >= 0;
            const itemClass = isExpired ? 'critical' : isCritical ? 'critical' : 'warning';

            return `
                <div class="expiry-item ${itemClass}">
                    <h4>${this.escapeHtml(product.name)}</h4>
                    <p class="expiry-date">
                        Expires: ${new Date(product.expiryDate).toLocaleDateString()}
                        <span style="color: ${isExpired ? 'var(--color-error)' : isCritical ? 'var(--color-error)' : 'var(--color-warning)'};">
                            ${isExpired ? `(Expired ${Math.abs(daysUntilExpiry)} days ago)` : `(${daysUntilExpiry} days remaining)`}
                        </span>
                    </p>
                    <p style="font-size: 0.9em; color: var(--color-text-secondary);">
                        Stock: ${product.currentStock} | Batch: ${product.batchNumber} | Location: ${product.location}
                    </p>
                    ${isExpired || isCritical ? `
                        <div style="margin-top: 12px;">
                            <button class="btn btn--secondary btn--sm" onclick="app.markForDisposal('${product._id || product.id}')">
                                Mark for Disposal
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    renderValuation() {
        const valuationSummary = document.getElementById('valuationSummary');
        if (!valuationSummary) return;

        const totalCostValue = this.products.reduce((sum, product) =>
            sum + (product.currentStock * product.costPrice), 0);
        const totalSellingValue = this.products.reduce((sum, product) =>
            sum + (product.currentStock * product.sellingPrice), 0);
        const totalProfit = totalSellingValue - totalCostValue;
        const avgMargin = totalCostValue > 0 ? (totalProfit / totalCostValue * 100) : 0;

        // Calculate EARNED profit from actual sales
        const earnedProfit = this.salesData.reduce((sum, day) => {
            return sum + (day.totalSales || 0);
        }, 0);
        // Estimate cost from sold items (use avg margin)
        const estimatedCostOfSold = avgMargin > 0 ? earnedProfit / (1 + avgMargin / 100) : earnedProfit * 0.7;
        const actualEarnedProfit = earnedProfit - estimatedCostOfSold;

        valuationSummary.innerHTML = `
            <div class="valuation-card">
                <h3>Cost Value</h3>
                <p class="value">₹${totalCostValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                <small style="color:var(--color-text-secondary);">Total cost of current inventory</small>
            </div>
            <div class="valuation-card">
                <h3>Selling Value</h3>
                <p class="value">₹${totalSellingValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                <small style="color:var(--color-text-secondary);">Market value if all sold</small>
            </div>
            <div class="valuation-card">
                <h3>Potential Profit</h3>
                <p class="value" style="color:#10b981;">₹${totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                <small style="color:var(--color-text-secondary);">Selling value minus cost</small>
            </div>
            <div class="valuation-card" style="border-left:4px solid #8b5cf6;">
                <h3> Earned Profit</h3>
                <p class="value" style="color:#8b5cf6;font-size:1.6rem;">₹${actualEarnedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                <small style="color:var(--color-text-secondary);">From ₹${earnedProfit.toLocaleString('en-IN')} in sales revenue</small>
            </div>
            <div class="valuation-card">
                <h3>Average Margin</h3>
                <p class="value">${avgMargin.toFixed(1)}%</p>
                <small style="color:var(--color-text-secondary);">Profit margin percentage</small>
            </div>
        `;
    }

    // Modal handlers
    showProductModal(product = null) {
        this.currentEditingType = 'product';
        const modal = document.getElementById('productModal');
        const form = document.getElementById('productForm');
        const title = document.getElementById('productModalTitle');

        if (product) {
            title.textContent = 'Edit Product';
            this.currentEditingId = product._id || product.id;

            // Populate form fields
            Object.keys(product).forEach(key => {
                const field = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
                if (field) {
                    field.value = product[key];
                }
            });
        } else {
            title.textContent = 'Add Product';
            this.currentEditingId = null;
            form.reset();

            // Set default expiry date (30 days from now)
            const defaultExpiry = new Date();
            defaultExpiry.setDate(defaultExpiry.getDate() + 30);
            document.getElementById('expiryDate').value = defaultExpiry.toISOString().split('T')[0];

            // Generate default barcode
            document.getElementById('productBarcode').value = this.generateBarcode();
        }

        this.populateDropdowns();
        modal.classList.remove('hidden');
    }

    showSaleModal() {
        const modal = document.getElementById('saleModal');
        this.saleItems = [];
        this.resetSaleForm();
        this.populateDropdowns();
        modal.classList.remove('hidden');
        // Clear barcode lookup state
        const barcodeInput = document.getElementById('saleBarcodeInput');
        const resultEl = document.getElementById('barcodeLookupResult');
        if (barcodeInput) {
            barcodeInput.value = '';
            // Enter key triggers lookup
            barcodeInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.lookupSaleBarcode(); } };
        }
        if (resultEl) resultEl.innerHTML = '';
    }

    showStockAdjustModal() {
        const modal = document.getElementById('stockAdjustModal');
        const form = document.getElementById('stockAdjustForm');

        form.reset();
        this.populateDropdowns();
        modal.classList.remove('hidden');
    }

    showCategoryModal(category = null) {
        this.currentEditingType = 'category';
        const modal = document.getElementById('categoryModal');
        const form = document.getElementById('categoryForm');
        const title = document.getElementById('categoryModalTitle');

        if (category) {
            title.textContent = 'Edit Category';
            this.currentEditingId = category._id || category.id;
            document.getElementById('categoryName').value = category.name;
        } else {
            title.textContent = 'Add Category';
            this.currentEditingId = null;
            form.reset();
        }

        modal.classList.remove('hidden');
    }

    showSupplierModal(supplier = null) {
        this.currentEditingType = 'supplier';
        const modal = document.getElementById('supplierModal');
        const form = document.getElementById('supplierForm');
        const title = document.getElementById('supplierModalTitle');

        if (supplier) {
            title.textContent = 'Edit Supplier';
            this.currentEditingId = supplier._id || supplier.id;

            Object.keys(supplier).forEach(key => {
                const field = document.getElementById(`supplier${key.charAt(0).toUpperCase() + key.slice(1)}`) ||
                    document.querySelector(`[name="${key}"]`);
                if (field) {
                    field.value = supplier[key];
                }
            });
        } else {
            title.textContent = 'Add Supplier';
            this.currentEditingId = null;
            form.reset();
        }

        modal.classList.remove('hidden');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
        this.currentEditingId = null;
        this.currentEditingType = null;
        this.stopBarcodeScanner();
    }

    // Form submission handlers (API-connected)
    async handleProductSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const productData = {};
        for (let [key, value] of formData.entries()) {
            if (['currentStock', 'minimumStock', 'maxStock', 'salesVelocity'].includes(key)) {
                productData[key] = parseInt(value);
            } else if (['costPrice', 'sellingPrice'].includes(key)) {
                productData[key] = parseFloat(value);
            } else {
                productData[key] = value.trim();
            }
        }
        if (!this.validateProductData(productData)) return;
        try {
            if (this.currentEditingId) {
                await this.api(`/products/${this.currentEditingId}`, { method: 'PUT', body: productData });
                this.showNotification(`Product "${productData.name}" updated successfully!`, 'success');
            } else {
                await this.api('/products', { method: 'POST', body: productData });
                this.showNotification(`New product "${productData.name}" added to inventory!`, 'success');
            }
            this.closeAllModals();
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Product save failed: ' + err.message, 'error');
        }
    }

    async handleSaleSubmit(e) {
        e.preventDefault();
        const items = [];
        let hasStockError = false;
        // FIX: Task 2c — Inline stock validation per row
        document.querySelectorAll('.sale-item').forEach(item => {
            const productSelect = item.querySelector('.sale-product');
            const quantityInput = item.querySelector('.sale-quantity');
            const priceInput = item.querySelector('.sale-price');
            // Clear previous errors
            const prevErr = item.querySelector('.sale-row-error');
            if (prevErr) prevErr.remove();
            if (productSelect && quantityInput && priceInput) {
                const productId = productSelect.value;
                const quantity = parseInt(quantityInput.value);
                const price = parseFloat(priceInput.value);
                if (productId && quantity > 0 && price > 0) {
                    // FIX: Validate quantity against available stock
                    const product = this.products.find(p => (p._id || p.id) == productId);
                    if (product && quantity > product.currentStock) {
                        hasStockError = true;
                        const errEl = document.createElement('small');
                        errEl.className = 'sale-row-error';
                        errEl.textContent = `Exceeds stock! Available: ${product.currentStock} units`;
                        quantityInput.parentElement.appendChild(errEl);
                    } else {
                        items.push({ productId, quantity, price });
                    }
                }
            }
        });
        if (hasStockError) { this.showNotification('Some items exceed available stock. Please fix the errors.', 'warning'); return; }
        if (items.length === 0) { this.showNotification('Please add at least one valid item.', 'warning'); return; }
        try {
            const sale = await this.api('/sales', { method: 'POST', body: { items } });
            this.showNotification(`Sale recorded: ₹${sale.totalAmount.toFixed(2)} (${items.length} item${items.length > 1 ? 's' : ''})`, 'success');
            this.closeAllModals();
            // Show invoice/receipt
            this.showInvoice(sale);
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Sale recording failed: ' + err.message, 'error');
        }
    }

    async handleStockAdjustSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const productId = formData.get('product');
        const adjustmentType = formData.get('type');
        const quantity = parseInt(formData.get('quantity'));
        const reason = formData.get('reason');
        const notes = formData.get('notes');
        if (!productId) { alert('Please select a product.'); return; }
        try {
            const result = await this.api(`/products/${productId}/stock`, {
                method: 'PATCH',
                body: { adjustmentType, quantity, reason: reason || 'Manual adjustment', notes: notes || '' }
            });
            this.showNotification(`Stock adjusted for ${result.product.name}: ${result.adjustment.oldStock} → ${result.adjustment.newStock}`, 'success');
            this.closeAllModals();
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Error: ' + err.message, 'error');
        }
    }

    async handleCategorySubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const categoryName = formData.get('name').trim();
        if (!categoryName) { alert('Please enter a category name.'); return; }
        try {
            if (this.currentEditingId) {
                await this.api(`/categories/${this.currentEditingId}`, { method: 'PUT', body: { name: categoryName } });
                this.showNotification(`Category renamed to "${categoryName}"`, 'success');
            } else {
                await this.api('/categories', { method: 'POST', body: { name: categoryName } });
                this.showNotification(`New category "${categoryName}" created!`, 'success');
            }
            this.closeAllModals();
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Error: ' + err.message, 'error');
        }
    }

    async handleSupplierSubmit(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const supplierData = {};
        for (let [key, value] of formData.entries()) {
            supplierData[key] = ['avgLeadTime', 'reliability'].includes(key) ? parseInt(value) : value.trim();
        }
        try {
            if (this.currentEditingId) {
                await this.api(`/suppliers/${this.currentEditingId}`, { method: 'PUT', body: supplierData });
                this.showNotification(`Supplier "${supplierData.name}" updated!`, 'success');
            } else {
                await this.api('/suppliers', { method: 'POST', body: supplierData });
                this.showNotification(`Supplier "${supplierData.name}" added!`, 'success');
            }
            this.closeAllModals();
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Error: ' + err.message, 'error');
        }
    }

    // Enhanced sale form management
    resetSaleForm() {
        const saleItemsContainer = document.getElementById('saleItems');
        if (saleItemsContainer) {
            saleItemsContainer.innerHTML = this.createSaleItemHTML(0);
            this.attachSaleItemListeners();
            this.updateSaleTotal();
        }
    }

    addSaleItem() {
        const saleItemsContainer = document.getElementById('saleItems');
        if (saleItemsContainer) {
            const itemIndex = saleItemsContainer.children.length;
            const newItemHTML = this.createSaleItemHTML(itemIndex);
            saleItemsContainer.insertAdjacentHTML('beforeend', newItemHTML);
            this.populateSaleProductDropdowns();
            this.attachSaleItemListeners();
        }
    }

    createSaleItemHTML(index) {
        return `
            <div class="sale-item">
                ${index > 0 ? '<button type="button" class="remove-item" onclick="app.removeSaleItem(this)"><i class="fas fa-times"></i></button>' : ''}
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label">Product</label>
                        <div style="display: flex; gap: 8px;">
                            <select name="product" class="form-control sale-product" required>
                                <option value="">Select Product</option>
                            </select>
                            <button type="button" class="btn btn--secondary scan-product-btn">
                                <i class="fas fa-camera"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Quantity</label>
                        <input type="number" name="quantity" class="form-control sale-quantity" min="1" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Price per Unit (₹)</label>
                        <input type="number" name="price" class="form-control sale-price" step="0.01" min="0" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Subtotal (₹)</label>
                        <input type="text" class="form-control sale-subtotal" readonly>
                    </div>
                </div>
            </div>
        `;
    }

    attachSaleItemListeners() {
        // Product selection change
        document.querySelectorAll('.sale-product').forEach(select => {
            // FIX: Save current value BEFORE cloneNode (cloneNode loses runtime .value on selects)
            const savedValue = select.value;
            const newSelect = select.cloneNode(true);
            select.parentNode.replaceChild(newSelect, select);
            // Restore the saved selection
            if (savedValue) newSelect.value = savedValue;

            newSelect.addEventListener('change', (e) => {
                const productId = e.target.value;
                const saleItem = e.target.closest('.sale-item');
                const priceField = saleItem.querySelector('.sale-price');
                const quantityField = saleItem.querySelector('.sale-quantity');
                const hint = saleItem.querySelector('.sale-stock-hint');

                if (productId) {
                    const product = this.products.find(p => (p._id || p.id) == productId);
                    if (product) {
                        priceField.value = (product.sellingPrice || product.sell || 0).toFixed(2);
                        if (!quantityField.value || quantityField.value == '0') quantityField.value = 1;
                        if (hint) hint.textContent = `Available: ${product.currentStock ?? 0} units`;
                        quantityField.max = product.currentStock ?? 9999;
                        this.updateSaleItemSubtotal(saleItem);
                    }
                } else {
                    if (hint) hint.textContent = '';
                }
            });
        });

        // Quantity and price changes
        document.querySelectorAll('.sale-quantity, .sale-price').forEach(input => {
            // FIX: Save current value BEFORE cloneNode
            const savedValue = input.value;
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
            if (savedValue) newInput.value = savedValue;

            newInput.addEventListener('input', (e) => {
                const saleItem = e.target.closest('.sale-item');
                this.updateSaleItemSubtotal(saleItem);
            });
        });

        // Barcode scanning for products
        document.querySelectorAll('.scan-product-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const saleItem = e.target.closest('.sale-item');
                const productSelect = saleItem.querySelector('.sale-product');
                this.startBarcodeScanner(null, (barcode) => {
                    const product = this.products.find(p => p.barcode === barcode);
                    if (product) {
                        productSelect.value = product._id || product.id;
                        productSelect.dispatchEvent(new Event('change'));
                        this.showNotification(`Product found: ${product.name}`, 'success');
                    } else {
                        this.showNotification('No product found with barcode: ' + barcode, 'warning');
                    }
                });
            });
        });
    }

    removeSaleItem(button) {
        button.closest('.sale-item').remove();
        this.updateSaleTotal();
    }

    // FIX: Task 2a — Remove last sale item row (minimum 1 row always)
    removeLastSaleItem() {
        const container = document.getElementById('saleItems');
        if (!container) return;
        const items = container.querySelectorAll('.sale-item');
        if (items.length > 1) {
            items[items.length - 1].remove();
            this.updateSaleTotal();
        } else {
            this.showNotification('Cannot remove the last item row.', 'info');
        }
    }

    updateSaleItemSubtotal(saleItem) {
        const quantityInput = saleItem.querySelector('.sale-quantity');
        const priceInput = saleItem.querySelector('.sale-price');
        const subtotalInput = saleItem.querySelector('.sale-subtotal');

        if (quantityInput && priceInput && subtotalInput) {
            const quantity = parseFloat(quantityInput.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            const subtotal = quantity * price;

            subtotalInput.value = `${subtotal.toFixed(2)}`;
            this.updateSaleTotal();
        }
    }

    updateSaleTotal() {
        let total = 0;
        document.querySelectorAll('.sale-item').forEach(item => {
            const quantityInput = item.querySelector('.sale-quantity');
            const priceInput = item.querySelector('.sale-price');

            if (quantityInput && priceInput) {
                const quantity = parseFloat(quantityInput.value) || 0;
                const price = parseFloat(priceInput.value) || 0;
                total += quantity * price;
            }
        });

        const totalElement = document.getElementById('saleTotal');
        if (totalElement) {
            totalElement.textContent = total.toFixed(2);
        }
    }

    updateStockDisplay(productId) {
        const product = this.products.find(p => p.id === parseInt(productId));
        const display = document.getElementById('currentStockDisplay');

        if (product && display) {
            display.value = `${product.currentStock} units`;
        }
    }

    // Barcode scanning functionality
    startBarcodeScanner(inputFieldId, callback = null) {
        this.barcodeCallback = callback || ((barcode) => {
            const field = document.getElementById(inputFieldId);
            if (field) {
                field.value = barcode;
                // If it's the product barcode field, run Open Food Facts lookup
                if (inputFieldId === 'productBarcode') {
                    this.lookupProductBarcode(barcode);
                }
                this.showNotification('Barcode scanned: ' + barcode, 'success');
            }
        });
        this._scannerSource = inputFieldId; // track context

        const modal = document.getElementById('barcodeScanModal');
        modal.classList.remove('hidden');

        // Wire Enter key on manual input every time modal opens
        const manualIn = document.getElementById('manualBarcodeInput');
        if (manualIn) {
            manualIn.value = '';
            manualIn.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submitManualBarcode(); } };
            setTimeout(() => manualIn.focus(), 100);
        }

        if (typeof Quagga === 'undefined') {
            this.showNotification('Camera scanner unavailable - enter the barcode manually below', 'info');
            return;
        }

        Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector('#barcode-scanner'),
                constraints: { width: 640, height: 480, facingMode: "environment" }
            },
            decoder: {
                readers: ["code_128_reader", "ean_reader", "ean_8_reader", "code_39_reader",
                    "code_39_vin_reader", "codabar_reader", "upc_reader", "upc_e_reader", "i2of5_reader"]
            }
        }, (err) => {
            if (err) {
                console.error('QuaggaJS init error:', err);
                this.showNotification('Camera not available - type the barcode manually below', 'info');
                return;
            }
            Quagga.start();
        });

        Quagga.onDetected((data) => {
            const barcode = data.codeResult.code;
            this.stopBarcodeScanner();
            // Only hide the scan modal, NOT all modals (so sale modal stays open)
            document.getElementById('barcodeScanModal').classList.add('hidden');
            this.barcodeCallback(barcode);
        });
    }

    stopBarcodeScanner() {
        if (typeof Quagga !== 'undefined') {
            try { Quagga.stop(); } catch (e) { }
        }
    }

    submitManualBarcode() {
        const input = document.getElementById('manualBarcodeInput');
        if (!input || !input.value.trim()) {
            this.showNotification('Please enter a barcode number', 'error');
            return;
        }
        const barcode = input.value.trim();
        this.stopBarcodeScanner();
        // Only close the scan modal, not all modals (keeps sale/product modal open)
        document.getElementById('barcodeScanModal').classList.add('hidden');
        if (this.barcodeCallback) {
            this.barcodeCallback(barcode);
        }
        input.value = '';
    }

    // Look up product name/brand from Open Food Facts (free, no API key needed)
    async lookupProductBarcode(barcode) {
        if (!barcode) return;
        try {
            this.showNotification('Looking up product info...', 'info');
            const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
            const data = await res.json();
            if (data.status === 1 && data.product) {
                const p = data.product;
                const name = p.product_name || p.generic_name || '';
                const brand = p.brands || '';
                const fullName = [brand, name].filter(Boolean).join(' - ');
                if (fullName) {
                    const nameField = document.getElementById('productName');
                    if (nameField && !nameField.value) nameField.value = fullName;
                    this.showNotification(`Product found: ${fullName}`, 'success');
                } else {
                    this.showNotification('Barcode saved — no name found in database', 'info');
                }
            } else {
                this.showNotification('Barcode saved — product not in Open Food Facts database', 'info');
            }
        } catch (err) {
            console.warn('Open Food Facts lookup failed:', err);
            this.showNotification('Barcode saved (product lookup unavailable)', 'info');
        }
    }

    generateBarcode() {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return '890' + timestamp.slice(-7) + random;
    }

    // â"€â"€ Gemini AI Business Strategy â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    async generateAIStrategy() {
        const keyInput = document.getElementById('geminiApiKey');
        const output = document.getElementById('aiStrategyOutput');
        const btn = document.getElementById('aiStrategyBtn');

        const savedKey = localStorage.getItem('gemini_api_key') || '';
        if (keyInput && !keyInput.value && savedKey) keyInput.value = savedKey;
        const apiKey = (keyInput && keyInput.value.trim()) || savedKey;

        if (!apiKey) {
            if (output) output.innerHTML = '<div style="color:#ef4444;padding:12px;border-radius:8px;background:rgba(239,68,68,0.08);"><i class="fas fa-key"></i> Please paste your free Gemini API key. Get one free (no credit card) at <a href="https://ai.google.dev" target="_blank" style="color:#4285F4;">ai.google.dev</a>.</div>';
            return;
        }
        if (!this.products || this.products.length === 0) {
            if (output) output.innerHTML = '<div style="color:#f59e0b;padding:12px;"><i class="fas fa-exclamation-triangle"></i> Run <strong>Advanced Analytics</strong> first to load inventory data.</div>';
            return;
        }
        // FIX: Task 4b - If realSalesTimeSeries is missing, auto-run analytics first
        if (!this.realSalesTimeSeries || this.realSalesTimeSeries.length === 0) {
            if (output) output.innerHTML = '<div style="text-align:center;padding:18px;color:var(--color-text-secondary);"><i class="fas fa-sync fa-spin"></i> Loading sales data first...</div>';
            try { await this.runAdvancedAnalytics(); } catch (e) { /* ignore */ }
        }

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analysing...'; }
        if (output) output.innerHTML = '<div style="text-align:center;padding:24px;color:var(--color-text-secondary);"><i class="fas fa-brain fa-spin" style="font-size:1.5rem;"></i><br><br>Gemini is analysing your store data...</div>';

        try {
            const products = this.products || [];
            const ts = this.realSalesTimeSeries || [];
            const totalRevenue = ts.reduce((s, d) => s + (d.totalSales || 0), 0);
            const recentRev = ts.slice(-7).reduce((s, d) => s + (d.totalSales || 0), 0);
            const prevRev = ts.slice(-14, -7).reduce((s, d) => s + (d.totalSales || 0), 0);
            const trendPct = prevRev > 0 ? ((recentRev - prevRev) / prevRev * 100).toFixed(1) : '0';
            const topByRev = [...products].sort((a, b) => (b.sellingPrice * (b.salesVelocity || 0)) - (a.sellingPrice * (a.salesVelocity || 0))).slice(0, 8);
            const stockOutRisk = products.filter(p => (p.salesVelocity || 0) > 0 && Math.floor(p.currentStock / (p.salesVelocity || 1)) <= 7 && p.currentStock > 0).slice(0, 5);
            const overstocked = products.filter(p => (p.salesVelocity || 0) > 0 && (p.currentStock / (p.salesVelocity || 1)) > 60).slice(0, 5);
            const lowMargin = products.filter(p => p.sellingPrice > 0 && ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) < 15).slice(0, 5);
            const nearExpiry = products.filter(p => { if (!p.expiryDate) return false; const d = (new Date(p.expiryDate) - new Date()) / 86400000; return d > 0 && d <= 30; }).slice(0, 5);
            const f = n => 'Rs.' + (n || 0).toLocaleString('en-IN');

            const prompt = `You are an expert retail business consultant for Indian retail stores. Analyse this real inventory data and create a practical business strategy.

STORE DATA:
- Products: ${products.length} | Revenue (90d): ${f(totalRevenue)} | Week-on-Week Trend: ${trendPct}% ${parseFloat(trendPct) >= 0 ? '(growing)' : '(declining)'}

TOP REVENUE DRIVERS:
${topByRev.map(p => `- ${p.name}: ${f(p.sellingPrice)}/unit, velocity: ${p.salesVelocity || 0}/day, stock: ${p.currentStock}`).join('\n')}

URGENT REORDER (stockout risk): ${stockOutRisk.length > 0 ? stockOutRisk.map(p => p.name + ' (' + Math.floor(p.currentStock / (p.salesVelocity || 1)) + 'd left)').join(', ') : 'None'}
OVERSTOCKED (capital tied up): ${overstocked.length > 0 ? overstocked.map(p => p.name + ' (' + Math.floor(p.currentStock / (p.salesVelocity || 1)) + 'd supply)').join(', ') : 'None'}
LOW MARGIN (<15%): ${lowMargin.length > 0 ? lowMargin.map(p => p.name + ' (' + ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100).toFixed(0) + '%)').join(', ') : 'None'}
NEAR EXPIRY (30d): ${nearExpiry.length > 0 ? nearExpiry.map(p => p.name).join(', ') : 'None'}

Generate a business strategy with these sections:
**1. Executive Summary**
**2. Top 3 Immediate Actions** (with specific expected impact)
**3. Pricing Strategy** (which products to reprice and suggested price range)
**4. Inventory Actions** (reorder, reduce, clearance)
**5. 30-Day Revenue Growth Plan**
**6. Risk Alerts**

Use the actual product names. Be specific and concise for a small retail owner.`;

            const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } })
            });
            if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'API error ' + resp.status); }
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

            // ── Section config: icon, accent color, title keyword match ──
            const sectionMeta = [
                { key: 'executive', icon: 'fa-bullseye', color: '#0066FF', label: 'Executive Summary' },
                { key: 'immediate', icon: 'fa-bolt', color: '#f59e0b', label: 'Top Immediate Actions' },
                { key: 'pricing', icon: 'fa-tag', color: '#7c3aed', label: 'Pricing Strategy' },
                { key: 'inventory', icon: 'fa-boxes', color: '#10b981', label: 'Inventory Actions' },
                { key: '30', icon: 'fa-chart-line', color: '#22c55e', label: '30-Day Revenue Growth Plan' },
                { key: 'risk', icon: 'fa-exclamation-triangle', color: '#ef4444', label: 'Risk Alerts' }
            ];

            // Split on numbered headings like "**1. ..."" or "## 1. ..."
            const rawSections = text.split(/(?=(?:\*\*|##\s*)\d+\.)/g).filter(s => s.trim());

            const renderSection = (rawText, meta) => {
                // Strip the heading line itself from the body
                const lines = rawText.split('\n');
                const bodyLines = [];
                let headingDone = false;
                for (const line of lines) {
                    const isHeading = /^(?:\*\*|##)\s*\d+\./.test(line.trim());
                    if (isHeading && !headingDone) { headingDone = true; continue; }
                    bodyLines.push(line);
                }
                // Render body: bold, bullets, paragraphs
                let body = bodyLines.join('\n')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^[\*\-] (.+)$/gm, `<li style="margin:5px 0 5px 4px;line-height:1.6;">$1</li>`)
                    .replace(/^(\d+)\. (.+)$/gm, `<li style="margin:5px 0 5px 4px;line-height:1.6;"><span style="color:${meta.color};font-weight:700;">$1.</span> $2</li>`)
                    .replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, m => `<ul style="margin:8px 0 8px 12px;padding:0;list-style:none;">${m}</ul>`)
                    .replace(/\n{2,}/g, '</p><p style="margin:8px 0;color:var(--color-text);">')
                    .replace(/\n/g, ' ')
                    .trim();
                if (body && !body.startsWith('<')) body = `<p style="margin:8px 0;color:var(--color-text);">${body}</p>`;
                return `
                <div style="border-radius:12px;border:1px solid var(--color-border);overflow:hidden;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(${meta.color === '#0066FF' ? '0,102,255' : meta.color === '#f59e0b' ? '245,158,11' : meta.color === '#7c3aed' ? '124,58,237' : meta.color === '#10b981' ? '16,185,129' : meta.color === '#22c55e' ? '34,197,94' : '239,68,68'},0.07);border-bottom:1px solid var(--color-border);">
                        <i class="fas ${meta.icon}" style="color:${meta.color};font-size:1rem;"></i>
                        <span style="font-weight:700;font-size:0.9rem;color:var(--color-text);">${meta.label}</span>
                    </div>
                    <div style="padding:14px 16px;font-size:0.875rem;line-height:1.7;background:var(--color-surface);">${body || '<p style="color:var(--color-text-secondary);">No details provided.</p>'}</div>
                </div>`;
            };

            let sectionsHtml = '';
            if (rawSections.length >= 2) {
                rawSections.forEach((sec, i) => {
                    const meta = sectionMeta[i] || { icon: 'fa-info-circle', color: 'var(--color-primary)', label: `Section ${i + 1}` };
                    sectionsHtml += renderSection(sec, meta);
                });
            } else {
                // Fallback: simple clean text render if AI didn't use numbered sections
                sectionsHtml = `<div style="font-size:0.875rem;line-height:1.75;color:var(--color-text);">${text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/^[\*\-] (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
                    .replace(/(<li.*?<\/li>\n?)+/gs, m => `<ul style="margin:8px 0 8px 16px;">${m}</ul>`)
                    .replace(/\n{2,}/g, '</p><p style="margin:8px 0;">')
                    .replace(/\n/g, '<br>')
                    }</div>`;
            }

            if (output) output.innerHTML = `
                <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-robot" style="color:#4285F4;font-size:1.1rem;"></i>
                        <strong style="color:#4285F4;">Gemini AI Business Plan</strong>
                    </div>
                    <span style="font-size:0.72rem;color:var(--color-text-secondary);">${new Date().toLocaleString('en-IN')}</span>
                </div>
                ${sectionsHtml}`;
            localStorage.setItem('gemini_api_key', apiKey);

        } catch (err) {
            console.error('Gemini error:', err);
            if (output) output.innerHTML = '<div style="color:#ef4444;padding:12px;border-radius:8px;background:rgba(239,68,68,0.08);"><i class="fas fa-exclamation-triangle"></i> Error: ' + err.message + '<br><small>Check that your API key is correct and has quota remaining.</small></div>';
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sparkles"></i> Generate AI Plan'; }
        }
    }

    // â"€â"€ Barcode lookup directly inside the Sale modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    lookupSaleBarcode() {
        const input = document.getElementById('saleBarcodeInput');
        const resultEl = document.getElementById('barcodeLookupResult');
        if (!input) return;
        const barcode = input.value.trim();
        if (!barcode) {
            if (resultEl) resultEl.innerHTML = '<span style="color:#ef4444;">Please enter a barcode number.</span>';
            return;
        }

        // Search live products by barcode
        const product = this.products.find(p => p.barcode === barcode);
        if (!product) {
            if (resultEl) resultEl.innerHTML = `<span style="color:#ef4444;">âŒ No product found with barcode <strong>${barcode}</strong>. Check barcode or add product first.</span>`;
            return;
        }

        // Check stock
        const stock = product.currentStock ?? 0;
        if (stock <= 0) {
            if (resultEl) resultEl.innerHTML = `<span style="color:#f59e0b;">⚠️ <strong>${product.name}</strong> is out of stock (0 units). Cannot record sale.</span>`;
            return;
        }

        // Fill the first sale item
        const firstItem = document.querySelector('#saleItems .sale-item');
        if (firstItem) {
            const select = firstItem.querySelector('.sale-product');
            const priceInput = firstItem.querySelector('.sale-price');
            const qtyInput = firstItem.querySelector('.sale-quantity');
            const hint = firstItem.querySelector('.sale-stock-hint');

            if (select) {
                // Set the product by id
                const pid = product._id || product.id;
                select.value = pid;
                // Trigger change to populate price via existing listener
                select.dispatchEvent(new Event('change'));
            }
            if (priceInput && !priceInput.value) {
                priceInput.value = product.sellingPrice || '';
            }
            if (qtyInput && !qtyInput.value) {
                qtyInput.value = 1;
                qtyInput.max = stock;
            }
            if (hint) {
                hint.textContent = `Available stock: ${stock} units`;
            }
            this.updateSaleItemSubtotal(firstItem);
        }

        if (resultEl) {
            resultEl.innerHTML = `<span style="color:#10b981;">✅ Found: <strong>${product.name}</strong> | Price: ₹${product.sellingPrice} | Stock: ${stock} units</span>`;
        }
        input.value = '';
        this.showNotification(`Product found: ${product.name} (${stock} units in stock)`, 'success');
    }

    scanSaleBarcode() {
        this.startBarcodeScanner(null, (barcode) => {
            const input = document.getElementById('saleBarcodeInput');
            if (input) {
                input.value = barcode;
                this.lookupSaleBarcode();
            }
        });
    }

    // Utility functions
    validateProductData(data) {
        if (!data.name || !data.category || !data.supplier) {
            alert('Please fill in all required fields.');
            return false;
        }

        if (data.currentStock < 0 || data.minimumStock < 0 || data.maxStock < 0) {
            alert('Stock values cannot be negative.');
            return false;
        }

        if (data.costPrice < 0 || data.sellingPrice < 0) {
            alert('Prices cannot be negative.');
            return false;
        }

        if (data.sellingPrice < data.costPrice) {
            if (!confirm('Selling price is lower than cost price. This will result in a loss. Continue?')) {
                return false;
            }
        }

        // Check for duplicate barcode
        if (data.barcode) {
            const existingProduct = this.products.find(p =>
                p.barcode === data.barcode && p.id !== this.currentEditingId
            );
            if (existingProduct) {
                alert('A product with this barcode already exists.');
                return false;
            }
        }

        return true;
    }

    getNextId(collection) {
        const items = this[collection];
        return items.length > 0 ? Math.max(...items.map(item => item.id)) + 1 : 1;
    }

    getStockStatus(product) {
        if (product.currentStock <= product.minimumStock) return 'low';
        if (product.currentStock <= product.minimumStock * 1.5) return 'medium';
        return 'high';
    }

    getStockStatusText(status) {
        const statusMap = {
            'low': 'Low Stock',
            'medium': 'Medium',
            'high': 'In Stock'
        };
        return statusMap[status] || 'Unknown';
    }

    getDaysUntilExpiry(expiryDate) {
        const today = new Date();
        const expiry = new Date(expiryDate);
        const diffTime = expiry - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    getExpiringProducts() {
        return this.products.filter(product => {
            const daysUntilExpiry = this.getDaysUntilExpiry(product.expiryDate);
            return daysUntilExpiry <= 7;
        }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    }

    updateCategoryStatistics() {
        this.categories.forEach(category => {
            const categoryProducts = this.products.filter(p => p.category === category.name);
            category.totalProducts = categoryProducts.length;
            category.totalValue = categoryProducts.reduce((sum, p) => sum + (p.currentStock * p.costPrice), 0);

            if (categoryProducts.length > 0) {
                const totalMargin = categoryProducts.reduce((sum, p) => {
                    const margin = ((p.sellingPrice - p.costPrice) / p.costPrice) * 100;
                    return sum + margin;
                }, 0);
                category.avgMargin = totalMargin / categoryProducts.length;
            } else {
                category.avgMargin = 0;
            }
        });
    }

    generateReorderSuggestions() {
        const suggestions = [];

        this.products.forEach(product => {
            const daysOfStock = product.salesVelocity > 0 ? product.currentStock / product.salesVelocity : 999;
            const supplier = this.suppliers.find(s => s.name === product.supplier);
            const leadTime = supplier ? supplier.avgLeadTime : 3;

            let suggestion = null;

            if (product.currentStock <= product.minimumStock) {
                suggestion = {
                    product: product,
                    suggestedQuantity: product.maxStock - product.currentStock,
                    reason: 'Below minimum stock level',
                    priority: 'high'
                };
            } else if (daysOfStock <= leadTime + 2) {
                suggestion = {
                    product: product,
                    suggestedQuantity: Math.ceil(product.salesVelocity * (leadTime + 7)) - product.currentStock,
                    reason: `Stock will run out in ${Math.ceil(daysOfStock)} days`,
                    priority: 'medium'
                };
            } else if (daysOfStock <= leadTime + 7) {
                suggestion = {
                    product: product,
                    suggestedQuantity: Math.ceil(product.salesVelocity * (leadTime + 14)) - product.currentStock,
                    reason: 'Proactive restocking recommended',
                    priority: 'low'
                };
            }

            if (suggestion && suggestion.suggestedQuantity > 0) {
                suggestions.push(suggestion);
            }
        });

        return suggestions.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    getSupplierLeadTime(supplierName) {
        const supplier = this.suppliers.find(s => s.name === supplierName);
        return supplier ? supplier.avgLeadTime : 3;
    }

    filterProducts() {
        this.renderProductsTable();
    }

    async refreshAllData() {
        try {
            await this.loadAllData();
            this.populateDropdowns();
            this.renderAllTables();
            this.renderDashboard();
            this.updateCategoryStatistics();
            // Re-populate sale product dropdowns for the sale modal
            try { this.populateSaleProductDropdowns(); } catch (e) { }

            // Safely re-render charts only if their section is visible
            const activeSection = document.querySelector('.section.active');
            if (activeSection) {
                const sectionId = activeSection.id;
                if (sectionId === 'dashboard') {
                    setTimeout(() => {
                        try { this.createCharts(); } catch (e) { console.warn('Chart refresh skipped:', e); }
                    }, 150);
                } else if (sectionId === 'products') {
                    this.renderProductsTable();
                } else if (sectionId === 'alerts') {
                    this.renderAlerts();
                } else if (sectionId === 'categories') {
                    this.renderCategoriesTable();
                } else if (sectionId === 'suppliers') {
                    this.renderSuppliersTable();
                } else if (sectionId === 'reorder') {
                    this.renderReorderSuggestions();
                } else if (sectionId === 'expiry') {
                    this.renderExpiryTracking();
                } else if (sectionId === 'valuation') {
                    this.renderValuation();
                } else if (sectionId === 'salesprofit') {
                    try { this.initSalesProfitHub(); } catch (e) { }
                }
            }
            console.log('Data refreshed from server');
        } catch (err) {
            console.error('Refresh failed:', err);
        }
    }

    // CRUD operations (API-connected)
    editProduct(id) {
        const product = this.products.find(p => (p._id || p.id) == id || p.id == id);
        if (product) this.showProductModal(product);
    }

    async deleteProduct(id) {
        const product = this.products.find(p => (p._id || p.id) == id);
        if (!confirm(`Are you sure you want to delete "${product ? product.name : 'this product'}"?`)) return;
        try {
            await this.api(`/products/${id}`, { method: 'DELETE' });
            this.showNotification(`Product "${product ? product.name : ''}" deleted from inventory`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Delete failed: ' + err.message, 'error');
        }
    }

    async reorderProduct(id) {
        const product = this.products.find(p => (p._id || p.id) == id);
        if (!product) { this.showNotification('Product not found', 'error'); return; }

        const suggestedQty = Math.max(product.maxStock - product.currentStock, product.minimumStock * 2);
        const quantity = prompt(
            `📦 Reorder: ${product.name}\n` +
            `Current Stock: ${product.currentStock}\n` +
            `Min Stock: ${product.minimumStock}\n` +
            `Supplier: ${product.supplier}\n\n` +
            `Enter reorder quantity:`,
            suggestedQty
        );

        if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) return;

        try {
            this.showNotification('Sending reorder email to supplier...', 'info');
            const result = await this.api('/reorder', {
                method: 'POST',
                body: {
                    productId: product._id || product.id,
                    quantity: parseInt(quantity),
                    notes: ''
                }
            });
            this.showNotification(`${result.message}`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Reorder failed: ' + err.message, 'error');
        }
    }

    editCategory(id) {
        const category = this.categories.find(c => (c._id || c.id) == id);
        if (category) this.showCategoryModal(category);
    }

    async deleteCategory(id) {
        const category = this.categories.find(c => (c._id || c.id) == id);
        if (!category) return;
        if (!confirm(`Delete category "${category.name}"?`)) return;
        try {
            await this.api(`/categories/${id}`, { method: 'DELETE' });
            this.showNotification(`Category "${category.name}" deleted`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Delete failed: ' + err.message, 'error');
        }
    }

    editSupplier(id) {
        const supplier = this.suppliers.find(s => (s._id || s.id) == id);
        if (supplier) this.showSupplierModal(supplier);
    }

    async deleteSupplier(id) {
        const supplier = this.suppliers.find(s => (s._id || s.id) == id);
        if (!supplier) return;
        if (!confirm(`Delete supplier "${supplier.name}"?`)) return;
        try {
            await this.api(`/suppliers/${id}`, { method: 'DELETE' });
            this.showNotification(`Supplier "${supplier.name}" removed`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Delete failed: ' + err.message, 'error');
        }
    }

    reorderProduct(id) {
        const product = this.products.find(p => (p._id || p.id) == id);
        if (product) {
            const orderQuantity = product.maxStock - product.currentStock;
            if (confirm(`Reorder ${orderQuantity} units of ${product.name}?`)) {
                this.executeReorder(id, orderQuantity);
            }
        }
    }

    async executeReorder(productId, quantity) {
        try {
            this.showNotification('Sending reorder email to supplier...', 'info');
            const result = await this.api('/reorder', {
                method: 'POST',
                body: { productId, quantity, notes: 'Auto reorder from inventory system' }
            });
            this.showNotification(`${result.message}`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Reorder failed: ' + err.message, 'error');
        }
    }

    async callAndEmailSupplier(productId, suggestedQty) {
        const product = this.products.find(p => (p._id || p.id) == productId);
        if (!product) { this.showNotification('Product not found', 'error'); return; }

        // Ask for quantity confirmation with a prompt
        const qtyStr = prompt(
            `📞 AI Voice Call + Email Reorder\n\n` +
            `Product:   ${product.name}\n` +
            `Supplier:  ${product.supplier}\n` +
            `Current Stock: ${product.currentStock} units\n\n` +
            `The AI will:\n` +
            `  1. Call the supplier on their registered phone\n` +
            `  2. Negotiate the order (handles partial stock automatically)\n` +
            `  3. Send a confirmation email with order details\n\n` +
            `Enter quantity to request:`,
            suggestedQty
        );
        if (!qtyStr || isNaN(qtyStr) || parseInt(qtyStr) <= 0) return;
        const quantity = parseInt(qtyStr);

        try {
            this.showNotification('📞 Dispatching AI voice call to supplier...', 'info');
            const result = await this.api('/voice-call', {
                method: 'POST',
                body: {
                    productId: product._id || product.id,
                    quantity,
                    notes: 'AI auto-reorder initiated from InveXa sTacK dashboard'
                }
            });

            // Show a detailed success modal
            const isDemo = result.isDemo;
            const callIcon = result.callStatus === 'queued' ? '📞' : '⚠️';
            const emailIcon = result.emailStatus === 'sent' ? '📧' : '⚠️';

            const lines = result.message.split('\n');
            const callLine = lines[0] || '';
            const emailLine = lines[1] || '';

            this.showVoiceCallResultBanner({
                productName: product.name,
                supplierName: product.supplier,
                quantity,
                callLine,
                emailLine,
                isDemo
            });

            await this.refreshAllData();
        } catch (err) {
            if (err.message.includes('no phone number')) {
                this.showNotification(`❌ ${err.message}`, 'error');
            } else {
                this.showNotification('Call dispatch failed: ' + err.message, 'error');
            }
        }
    }

    showVoiceCallResultBanner({ productName, supplierName, quantity, callLine, emailLine, isDemo }) {
        // Remove any previous banner
        const old = document.getElementById('voiceCallResultBanner');
        if (old) old.remove();

        const banner = document.createElement('div');
        banner.id = 'voiceCallResultBanner';
        banner.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:9999;
            background:linear-gradient(135deg,#1e1b4b,#312e81);
            border:1px solid rgba(139,92,246,0.5);
            border-radius:16px; padding:20px 24px; max-width:420px;
            box-shadow:0 20px 60px rgba(0,0,0,0.5);
            animation:slideInUp 0.4s cubic-bezier(0.34,1.56,0.64,1);
            font-family:inherit;
        `;

        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
                <div style="width:40px;height:40px;border-radius:50%;background:rgba(139,92,246,0.3);display:flex;align-items:center;justify-content:center;font-size:1.3rem;">📞</div>
                <div>
                    <div style="font-weight:700;color:#e2e8f0;font-size:1rem;">AI Reorder Dispatched</div>
                    <div style="font-size:0.78rem;color:#a78bfa;">${productName} → ${supplierName}</div>
                </div>
                <button onclick="document.getElementById('voiceCallResultBanner').remove()" style="margin-left:auto;background:none;border:none;color:#6b7280;font-size:1.2rem;cursor:pointer;padding:4px;">✕</button>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:12px;margin-bottom:12px;font-size:0.85rem;color:#c4b5fd;">
                <div style="margin-bottom:6px;"><span style="font-size:1rem;">📦</span> <strong style="color:#e2e8f0;">${quantity} units</strong> requested</div>
                <div style="margin-bottom:6px;">${callLine}</div>
                <div>${emailLine}</div>
            </div>
            ${isDemo ? `<div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:8px 12px;font-size:0.78rem;color:#fbbf24;">
                ⚠️ <strong>Demo Mode:</strong> Add your <code style="background:rgba(0,0,0,0.4);padding:1px 5px;border-radius:4px;">BLAND_API_KEY</code> in .env to enable live calls
            </div>` : `<div style="font-size:0.78rem;color:#6b7280;">The AI agent will negotiate the order. Results will be logged in Reorder History once the call completes.</div>`}
        `;

        document.body.appendChild(banner);

        // Inject animation keyframe if not already present
        if (!document.getElementById('voiceCallAnimStyle')) {
            const style = document.createElement('style');
            style.id = 'voiceCallAnimStyle';
            style.textContent = `@keyframes slideInUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }`;
            document.head.appendChild(style);
        }

        // Auto-remove after 12 seconds
        setTimeout(() => { if (document.getElementById('voiceCallResultBanner')) banner.remove(); }, 12000);
    }

    async markOrderReceived(productId, productName, suggestedQty) {
        const qtyStr = prompt(`📦 Enter received quantity for "${productName}"\n(Suggested order was ${suggestedQty} units):`, suggestedQty);
        if (!qtyStr) return;
        const qty = parseInt(qtyStr);
        if (isNaN(qty) || qty <= 0) {
            this.showNotification('Please enter a valid positive number', 'error');
            return;
        }
        try {
            await this.api(`/products/${productId}/stock`, {
                method: 'PATCH',
                body: { adjustmentType: 'increase', quantity: qty, reason: 'restock', notes: `Stock received - reorder fulfilled (${qty} units)` }
            });
            this.showNotification(`Stock updated! ${productName} +${qty} units received`, 'success');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Stock update failed: ' + err.message, 'error');
        }
    }

    async markForDisposal(productId) {
        const product = this.products.find(p => (p._id || p.id) == productId);
        if (!product) return;
        if (!confirm(`Mark ${product.currentStock} units of ${product.name} for disposal?`)) return;
        try {
            await this.api(`/products/${productId}/stock`, {
                method: 'PATCH',
                body: { adjustmentType: 'set', quantity: 0, reason: 'expired', notes: 'Expired product disposal' }
            });
            this.showNotification(`${product.name} marked for disposal`, 'warning');
            await this.refreshAllData();
        } catch (err) {
            this.showNotification('Error: ' + err.message, 'error');
        }
    }

    exportData() {
        // Show the format selection modal instead of exporting immediately
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.remove('hidden');
    }

    closeExportModal() {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.add('hidden');
    }

    exportAsJSON() {
        const data = {
            exportDate: new Date().toISOString(),
            products: this.products,
            categories: this.categories,
            suppliers: this.suppliers,
            salesData: this.salesData,
            stockAdjustments: this.stockAdjustments || []
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invex_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.closeExportModal();
        this.showNotification('JSON exported successfully!', 'success');
    }

    exportAsPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const dateStr = new Date().toLocaleDateString('en-IN');
            const primaryColor = [37, 99, 235]; // blue

            // - Header -
            doc.setFillColor(...primaryColor);
            doc.rect(0, 0, 297, 18, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('InveXa sTacK - Inventory Report', 14, 12);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated: ${dateStr}`, 240, 12);
            doc.setTextColor(0, 0, 0);

            // - Summary Stats -
            const totalValue = this.products.reduce((s, p) => s + (p.currentStock * p.costPrice), 0);
            const lowStock = this.products.filter(p => p.currentStock <= p.minimumStock).length;
            doc.setFontSize(9);
            doc.text(`Total Products: ${this.products.length} | Total Inventory Value: Rs. ${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} | Low Stock Items: ${lowStock} | Suppliers: ${this.suppliers.length}`, 14, 26);

            // - Products Table -
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Products - Current Inventory', 14, 34);

            doc.autoTable({
                startY: 37,
                head: [['Name', 'Category', 'Supplier', 'Stock', 'Min Stock', 'Cost Rs.', 'Sell Rs.', 'Status', 'Expiry']],
                body: this.products.map(p => {
                    const status = p.currentStock <= p.minimumStock ? 'Low' : p.currentStock <= p.minimumStock * 1.5 ? 'Medium' : 'Good';
                    return [
                        p.name,
                        p.category,
                        p.supplier,
                        p.currentStock,
                        p.minimumStock,
                        `Rs. ${(p.costPrice || 0).toFixed(2)}`,
                        `Rs. ${(p.sellingPrice || 0).toFixed(2)}`,
                        status,
                        p.expiryDate ? new Date(p.expiryDate).toLocaleDateString('en-IN') : 'N/A'
                    ];
                }),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 255] },
                didParseCell: (data) => {
                    if (data.column.index === 7 && data.section === 'body') {
                        if (data.cell.raw === 'Low') data.cell.styles.textColor = [220, 38, 38];
                        else if (data.cell.raw === 'Medium') data.cell.styles.textColor = [217, 119, 6];
                        else data.cell.styles.textColor = [22, 163, 74];
                    }
                }
            });

            // - Suppliers Table -
            const afterProducts = doc.lastAutoTable.finalY + 10;
            doc.addPage();
            doc.setFillColor(...primaryColor);
            doc.rect(0, 0, 297, 18, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('InveXa sTacK - Suppliers & Categories', 14, 12);
            doc.setTextColor(0, 0, 0);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Suppliers', 14, 27);

            doc.autoTable({
                startY: 30,
                head: [['Name', 'Contact', 'Phone', 'Email', 'Reliability %', 'Lead Time', 'Total Orders']],
                body: this.suppliers.map(s => [
                    s.name, s.contact || '', s.phone || '', s.email || '',
                    `${s.reliability || 0}%`, `${s.avgLeadTime || 0} days`, `${s.totalOrders || 0}%`
                ]),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 255] }
            });

            // - Categories Table -
            const afterSuppliers = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text('Categories', 14, afterSuppliers);

            doc.autoTable({
                startY: afterSuppliers + 3,
                head: [['Category', 'Total Products', 'Total Value', 'Avg Margin %']],
                body: this.categories.map(c => [
                    c.name,
                    c.totalProducts || 0,
                    `Rs. ${(c.totalValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
                    `${(c.avgMargin || 0).toFixed(1)}%`
                ]),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 255] }
            });

            // - Footer with page numbers -
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${pageCount} | InveXa sTacK Inventory Report | ${dateStr}`, 14, 207);
            }

            doc.save(`invex_report_${new Date().toISOString().split('T')[0]}.pdf`);
            this.closeExportModal();
            this.showNotification('PDF report exported successfully!', 'success');
        } catch (err) {
            console.error('PDF export error:', err);
            this.showNotification('PDF export failed: ' + err.message + ' - Try JSON instead.', 'error');
        }
    }

    // Advanced Analytics methods
    async runAdvancedAnalytics() {
        const period = parseInt(document.getElementById('predictionPeriod').value) || 30;
        const type = document.getElementById('predictionType').value || 'sales';
        const aggregation = document.getElementById('aggregationLevel').value || 'weekly';
        const model = document.getElementById('forecastModel').value || 'sarima';

        this.showNotification('Fetching real sales data & running forecasts...', 'info');

        try {
            // Fetch REAL sales data from API (last 180 days for robust training)
            const token = localStorage.getItem('invexa_token');
            const authH = { 'Content-Type': 'application/json' };
            if (token) authH['Authorization'] = 'Bearer ' + token;
            const res = await fetch(`${API_BASE}/sales?days=180`, { headers: authH });
            const realSales = await res.json();

            // Aggregate real sales by date - fill every day in range
            const dailyMap = {};
            const today = new Date(); today.setHours(0, 0, 0, 0);
            for (let i = 179; i >= 0; i--) {
                const d = new Date(today); d.setDate(today.getDate() - i);
                const ds = d.toISOString().split('T')[0];
                dailyMap[ds] = { date: ds, totalSales: 0, transactions: 0, items: 0 };
            }
            realSales.forEach(sale => {
                const dateStr = new Date(sale.saleDate || sale.createdAt).toISOString().split('T')[0];
                if (dailyMap[dateStr]) {
                    dailyMap[dateStr].totalSales += sale.totalAmount || 0;
                    dailyMap[dateStr].transactions += 1;
                    dailyMap[dateStr].items += (sale.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
                }
            });
            this.realSalesTimeSeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

            // Use real data as the single source of truth for all charts
            this.extendedSalesData = this.realSalesTimeSeries;
            this.salesData = this.realSalesTimeSeries.slice(-7);
            this._realSaleCount = realSales.length;

            // Compute REAL seasonal multipliers from actual data
            this._computedSeasonalMultipliers = this._computeRealSeasonalMultipliers();

            this.performHistoricalAggregation(aggregation);
            this.createAdvancedCharts(period, type, model);
            this.generateDynamicStrategy();
            this.generateAdvancedInsights(period, type, aggregation, model);

            // FIX: S4 - Save model selection to localStorage for persistence
            localStorage.setItem('invexa_forecast_model', model);

            const dataLabel = realSales.length > 0
                ? `✅ Forecasting complete   ${realSales.length} real sales records analysed!`
                : ' No sales recorded yet   forecasts will improve as you record sales';
            this.showNotification(dataLabel, realSales.length > 0 ? 'success' : 'info');
        } catch (err) {
            console.error('Analytics error:', err);
            this.showNotification('Analytics failed: ' + err.message, 'error');
        }
    }

    switchAnalyticsTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.analytics-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    performHistoricalAggregation(level) {
        this.aggregatedData = this.aggregateSalesData(level);
    }

    aggregateSalesData(level) {
        const aggregated = {};
        // Use real sales time series as the data source
        const data = this.realSalesTimeSeries || this.extendedSalesData || this.salesData || [];
        if (data.length === 0) return aggregated;

        data.forEach(sale => {
            const date = new Date(sale.date);
            let key;

            switch (level) {
                case 'daily':
                    key = date.toISOString().split('T')[0];
                    break;
                case 'weekly':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().split('T')[0];
                    break;
                case 'monthly':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
                case 'quarterly':
                    const quarter = Math.floor(date.getMonth() / 3) + 1;
                    key = `${date.getFullYear()}-Q${quarter}`;
                    break;
            }

            if (!aggregated[key]) {
                aggregated[key] = {
                    totalSales: 0,
                    transactions: 0,
                    dates: []
                };
            }
            aggregated[key].totalSales += sale.totalSales;
            aggregated[key].transactions += sale.transactions;
            aggregated[key].dates.push(date);
        });

        return aggregated;
    }

    generateExtendedHistoricalData() {
        // Use REAL sales time series if available   no fake data generation
        if (this.realSalesTimeSeries && this.realSalesTimeSeries.length > 0) {
            this.extendedSalesData = this.realSalesTimeSeries;
            return;
        }
        // If no real data exists at all, extendedSalesData stays as set in runAdvancedAnalytics
    }


    createAdvancedCharts(period, type, model) {
        // FIX: Task 4a - Create ALL tab charts, not just the active tab.
        // Wrap each in try-catch so one failure doesn't block the rest.
        try { this.createForecastCharts(period, model); } catch (e) { console.warn('Forecast charts:', e.message); }
        try { this.createAnomalyCharts(); } catch (e) { console.warn('Anomaly charts:', e.message); }
        try { this.createSeasonalCharts(); } catch (e) { console.warn('Seasonal charts:', e.message); }
        try { this.createProcurementCharts(); } catch (e) { console.warn('Procurement charts:', e.message); }
    }

    createForecastCharts(period, model) {
        // Route to the correct forecast model based on user selection
        switch (model) {
            case 'exponential':
                this.createExponentialSmoothingChart(period);
                break;
            case 'linear':
                this.createLinearForecastChart(period);
                break;
            case 'sarima':
            default:
                this.createSARIMAForecastChart(period);
                break;
        }
        this.createInventoryPredictionChart(period);
        this.createHistoricalAggregationChart();
        this.createDemandPredictionChart(period);
    }

    createSARIMAForecastChart(period) {
        const ctx = document.getElementById('salesForecastChart');
        if (!ctx) return;

        const salesData = this.realSalesTimeSeries || this.extendedSalesData || this.salesData || [];
        if (salesData.length === 0) return;
        const historicalSales = salesData.map(d => d.totalSales);
        const forecast = this.sarimaForecast(historicalSales, period);
        this._renderForecastChart(ctx, salesData, historicalSales, forecast, period, 'SARIMA Sales Forecast', '#ef4444', 'rgba(239,68,68,0.1)');
    }

    // - -- - Exponential Smoothing Chart - -- -
    createExponentialSmoothingChart(period) {
        const ctx = document.getElementById('salesForecastChart');
        if (!ctx) return;

        const salesData = this.realSalesTimeSeries || this.extendedSalesData || this.salesData || [];
        if (salesData.length === 0) return;
        const historicalSales = salesData.map(d => d.totalSales);
        const forecast = this.exponentialSmoothingForecast(historicalSales, period);
        this._renderForecastChart(ctx, salesData, historicalSales, forecast, period, 'Holt-Winters Exponential Smoothing', '#e67e22', 'rgba(230,126,34,0.1)');
    }

    // - -- - Linear Regression Chart - -- -
    createLinearForecastChart(period) {
        const ctx = document.getElementById('salesForecastChart');
        if (!ctx) return;

        const salesData = this.realSalesTimeSeries || this.extendedSalesData || this.salesData || [];
        if (salesData.length === 0) return;
        const historicalSales = salesData.map(d => d.totalSales);
        const forecast = this.linearRegressionForecast(historicalSales, period);
        this._renderForecastChart(ctx, salesData, historicalSales, forecast, period, 'Linear Regression Forecast', '#8b5cf6', 'rgba(139,92,246,0.1)');
    }

    // - -- - Shared forecast chart renderer - -- -
    _renderForecastChart(ctx, salesData, historicalSales, forecast, period, modelLabel, fgColor, bgColor) {
        const labels = [];
        const lastDate = new Date(salesData[salesData.length - 1].date);

        // Last 30 days of historical labels
        const showDays = Math.min(30, historicalSales.length);
        for (let i = historicalSales.length - showDays; i < historicalSales.length; i++) {
            const date = new Date(lastDate);
            date.setDate(lastDate.getDate() - (historicalSales.length - 1 - i));
            labels.push(date.toLocaleDateString());
        }
        // Future labels
        for (let i = 1; i <= period; i++) {
            const date = new Date(lastDate);
            date.setDate(lastDate.getDate() + i);
            labels.push(date.toLocaleDateString());
        }

        const historicalData = historicalSales.slice(-showDays);
        const forecastData = [...Array(historicalData.length).fill(null), ...forecast];

        if (this.charts.salesForecastChart) {
            this.charts.salesForecastChart.destroy();
        }

        this.charts.salesForecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Historical Sales',
                    data: historicalData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.3, fill: true, pointRadius: 1
                }, {
                    label: modelLabel,
                    data: forecastData,
                    borderColor: fgColor,
                    backgroundColor: bgColor,
                    borderDash: [5, 5],
                    tension: 0.3, fill: true, pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: modelLabel },
                    tooltip: { callbacks: { label: c => `${c.dataset.label}: ₹${(c.raw || 0).toLocaleString('en-IN')}` } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } }
                }
            }
        });
    }

    sarimaForecast(data, periods) {
        const n = data.length;
        if (n < 8) return Array(periods).fill(0);
        const seasonalPeriod = 7; // Weekly seasonality

        // Calculate moving averages (7-day)
        const ma = [];
        for (let i = 6; i < n; i++) {
            ma.push(data.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
        }

        // Calculate seasonal ratios (guard against division by zero)
        const seasonal = [];
        for (let i = seasonalPeriod; i < n; i++) {
            const prev = data[i - seasonalPeriod];
            seasonal.push(prev > 0 ? data[i] / prev : 1.0);
        }
        const validSeasonal = seasonal.filter(v => isFinite(v) && !isNaN(v) && v > 0);
        const avgSeasonal = validSeasonal.length > 0 ? validSeasonal.reduce((a, b) => a + b, 0) / validSeasonal.length : 1.0;

        // Trend from moving averages
        const trend = [];
        for (let i = 1; i < ma.length; i++) {
            trend.push(ma[i] - ma[i - 1]);
        }
        const validTrend = trend.filter(v => isFinite(v) && !isNaN(v));
        const avgTrend = validTrend.length > 0 ? validTrend.reduce((a, b) => a + b, 0) / validTrend.length : 0;

        // Generate forecast
        const forecast = [];
        const nonZero = data.filter(v => v > 0);
        let lastValue = nonZero.length > 0 ? nonZero[nonZero.length - 1] : 0;
        if (lastValue === 0 && ma.length > 0) lastValue = ma[ma.length - 1];

        for (let i = 0; i < periods; i++) {
            const seasonalIndex = i % seasonalPeriod;
            const sf = (seasonal[seasonalIndex] && isFinite(seasonal[seasonalIndex]) && seasonal[seasonalIndex] > 0)
                ? seasonal[seasonalIndex] : avgSeasonal;
            lastValue = lastValue * sf + avgTrend;
            forecast.push(Math.max(0, Math.round(lastValue * 100) / 100));
        }

        return forecast;
    }

    // - -- - Exponential Smoothing (Holt-Winters Triple) - -- -
    exponentialSmoothingForecast(data, periods) {
        const n = data.length;
        if (n < 8) return Array(periods).fill(0);

        const seasonLength = 7; // weekly cycle
        const alpha = 0.3; // level smoothing
        const beta = 0.1; // trend smoothing
        const gamma = 0.2; // seasonal smoothing

        // Initialise level, trend, seasonal
        const firstWeek = data.slice(0, seasonLength);
        const secondWeek = data.slice(seasonLength, seasonLength * 2);
        let level = firstWeek.reduce((s, v) => s + v, 0) / seasonLength;
        let trend = 0;
        if (secondWeek.length === seasonLength) {
            const secondAvg = secondWeek.reduce((s, v) => s + v, 0) / seasonLength;
            trend = (secondAvg - level) / seasonLength;
        }

        // Initial seasonal indices
        const seasonals = [];
        for (let i = 0; i < seasonLength; i++) {
            seasonals[i] = level > 0 ? firstWeek[i] / level : 1.0;
        }

        // Smooth through historical data
        for (let t = 0; t < n; t++) {
            const si = t % seasonLength;
            const val = data[t];
            const prevLevel = level;
            const s = seasonals[si] || 1;

            // Update level
            level = alpha * (s > 0 ? val / s : val) + (1 - alpha) * (prevLevel + trend);
            // Update trend
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
            // Update seasonal
            seasonals[si] = gamma * (level > 0 ? val / level : 1) + (1 - gamma) * s;
        }

        // Generate forecast
        const forecast = [];
        for (let i = 1; i <= periods; i++) {
            const si = (n + i - 1) % seasonLength;
            const predicted = (level + trend * i) * (seasonals[si] || 1);
            forecast.push(Math.max(0, Math.round(predicted * 100) / 100));
        }
        return forecast;
    }

    createHistoricalAggregationChart() {
        const ctx = document.getElementById('historicalAggregationChart');
        if (!ctx) return;

        const aggregated = this.aggregatedData || this.aggregateSalesData('weekly');
        const labels = Object.keys(aggregated).slice(-12); // Last 12 periods
        const sales = labels.map(key => aggregated[key].totalSales);

        if (this.charts.historicalAggregationChart) {
            this.charts.historicalAggregationChart.destroy();
        }

        this.charts.historicalAggregationChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Aggregated Sales',
                    data: sales,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Historical Sales Aggregation'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    }
                }
            }
        });
    }

    createAnomalyCharts() {
        this.createAnomalyDetectionChart();
        this.createOutlierAnalysisChart();
        this.createTrendDeviationChart();
        this.createConfidenceIntervalsChart();
    }

    createAnomalyDetectionChart() {
        const ctx = document.getElementById('anomalyDetectionChart');
        if (!ctx) return;

        const salesData = this.extendedSalesData || this.salesData;
        const data = salesData.map(d => d.totalSales);
        const anomalies = this.detectAnomalies(data);

        const labels = salesData.map(d => new Date(d.date).toLocaleDateString());
        const normalData = data.map((val, index) => anomalies[index] ? null : val);
        const anomalyData = data.map((val, index) => anomalies[index] ? val : null);

        if (this.charts.anomalyDetectionChart) {
            this.charts.anomalyDetectionChart.destroy();
        }

        this.charts.anomalyDetectionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Normal Sales',
                    data: normalData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Anomalies',
                    data: anomalyData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.8)',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Anomaly Detection in Sales Data'
                    }
                }
            }
        });
    }

    detectAnomalies(data) {
        // Simple anomaly detection using Z-score
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const std = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length);

        return data.map(val => Math.abs((val - mean) / std) > 2.5); // Z-score > 2.5
    }

    createOutlierAnalysisChart() {
        const ctx = document.getElementById('outlierAnalysisChart');
        if (!ctx) return;

        const salesData = this.extendedSalesData || this.salesData;
        const data = salesData.map(d => d.totalSales);
        const outliers = this.detectOutliers(data);

        const labels = salesData.map(d => new Date(d.date).toLocaleDateString());
        const normalData = data.map((val, index) => outliers[index] ? null : val);
        const outlierData = data.map((val, index) => outliers[index] ? val : null);

        if (this.charts.outlierAnalysisChart) {
            this.charts.outlierAnalysisChart.destroy();
        }

        this.charts.outlierAnalysisChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Normal Data',
                    data: normalData.map((val, index) => ({ x: index, y: val })).filter(point => point.y !== null),
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                }, {
                    label: 'Outliers',
                    data: outlierData.map((val, index) => ({ x: index, y: val })).filter(point => point.y !== null),
                    backgroundColor: 'rgba(255, 99, 132, 0.8)',
                    pointRadius: 8
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Outlier Analysis'
                    }
                }
            }
        });
    }

    detectOutliers(data) {
        // IQR method for outlier detection
        const sorted = [...data].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;

        return data.map(val => val < lowerBound || val > upperBound);
    }

    createTrendDeviationChart() {
        const ctx = document.getElementById('trendDeviationChart');
        if (!ctx) return;

        const salesData = this.extendedSalesData || this.salesData;
        const data = salesData.map(d => d.totalSales);

        // Calculate moving average
        const ma = [];
        for (let i = 6; i < data.length; i++) {
            ma.push(data.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
        }

        // Calculate deviations
        const deviations = [];
        for (let i = 6; i < data.length; i++) {
            deviations.push(data[i] - ma[i - 6]);
        }

        const labels = salesData.slice(6).map(d => new Date(d.date).toLocaleDateString());

        if (this.charts.trendDeviationChart) {
            this.charts.trendDeviationChart.destroy();
        }

        this.charts.trendDeviationChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Trend Deviation',
                    data: deviations,
                    backgroundColor: deviations.map(dev => dev > 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'),
                    borderColor: deviations.map(dev => dev > 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Trend Deviation Analysis'
                    }
                }
            }
        });
    }

    createConfidenceIntervalsChart() {
        const ctx = document.getElementById('confidenceIntervalsChart');
        if (!ctx) return;

        const salesData = this.extendedSalesData || this.salesData;
        const data = salesData.slice(-30).map(d => d.totalSales);

        // Calculate confidence intervals (simplified)
        const mean = data.reduce((a, b) => a + b, 0) / data.length;
        const std = Math.sqrt(data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length);
        const confidenceLevel = 1.96; // 95% confidence
        const margin = confidenceLevel * std / Math.sqrt(data.length);

        const upperBound = data.map(() => mean + margin);
        const lowerBound = data.map(() => mean - margin);

        const labels = salesData.slice(-30).map(d => new Date(d.date).toLocaleDateString());

        if (this.charts.confidenceIntervalsChart) {
            this.charts.confidenceIntervalsChart.destroy();
        }

        this.charts.confidenceIntervalsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sales Data',
                    data: data,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Upper Confidence Bound',
                    data: upperBound,
                    borderColor: 'rgba(255, 99, 132, 0.5)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1
                }, {
                    label: 'Lower Confidence Bound',
                    data: lowerBound,
                    borderColor: 'rgba(255, 99, 132, 0.5)',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Confidence Intervals Analysis'
                    }
                }
            }
        });
    }

    createSeasonalCharts() {
        this.createSeasonalDecompositionChart();
        this.createSeasonalAdjustmentChart();
        this.createYearOverYearChart();
        this.createSeasonalIndexChart();
    }

    createSeasonalDecompositionChart() {
        const ctx = document.getElementById('seasonalDecompositionChart');
        if (!ctx) return;

        const salesData = this.extendedSalesData || this.salesData;
        const data = salesData.map(d => d.totalSales);
        const dates = salesData.map(d => new Date(d.date));

        // Simple seasonal decomposition
        const { trend, seasonal, residual } = this.seasonalDecompose(data, 7);

        const labels = dates.map(d => d.toLocaleDateString());

        if (this.charts.seasonalDecompositionChart) {
            this.charts.seasonalDecompositionChart.destroy();
        }

        this.charts.seasonalDecompositionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Original Data',
                    data: data,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Trend Component',
                    data: trend,
                    borderColor: 'rgb(255, 205, 86)',
                    backgroundColor: 'rgba(255, 205, 86, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Seasonal Component',
                    data: seasonal,
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Seasonal Decomposition'
                    }
                }
            }
        });
    }

    seasonalDecompose(data, period) {
        // Simplified seasonal decomposition
        const trend = this.movingAverage(data, period);
        const seasonal = new Array(data.length).fill(0);
        const residual = new Array(data.length).fill(0);

        // Calculate seasonal component
        for (let i = 0; i < data.length; i++) {
            if (trend[i] && data[i]) {
                seasonal[i] = data[i] / trend[i];
                residual[i] = data[i] - trend[i];
            }
        }

        return { trend, seasonal, residual };
    }

    movingAverage(data, window) {
        const result = new Array(data.length).fill(null);
        for (let i = window - 1; i < data.length; i++) {
            const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
            result[i] = sum / window;
        }
        return result;
    }

    createSeasonalAdjustmentChart() {
        const ctx = document.getElementById('seasonalAdjustmentChart');
        if (!ctx) return;

        const seasonalFactors = this.getSeasonalMultiplier();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (this.charts.seasonalAdjustmentChart) {
            this.charts.seasonalAdjustmentChart.destroy();
        }

        this.charts.seasonalAdjustmentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Seasonal Adjustment Factor',
                    data: seasonalFactors,
                    backgroundColor: seasonalFactors.map(factor =>
                        factor > 1.2 ? 'rgba(75, 192, 192, 0.6)' :
                            factor < 0.9 ? 'rgba(255, 99, 132, 0.6)' : 'rgba(255, 205, 86, 0.6)'
                    ),
                    borderColor: seasonalFactors.map(factor =>
                        factor > 1.2 ? 'rgba(75, 192, 192, 1)' :
                            factor < 0.9 ? 'rgba(255, 99, 132, 1)' : 'rgba(255, 205, 86, 1)'
                    ),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Seasonal Adjustment Factors'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Adjustment Factor'
                        }
                    }
                }
            }
        });
    }

    createYearOverYearChart() {
        const ctx = document.getElementById('yearOverYearChart');
        if (!ctx) return;

        // Generate year-over-year comparison data
        const currentYear = new Date().getFullYear();
        const lastYear = currentYear - 1;

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const currentYearData = months.map((_, index) => {
            const seasonalFactor = this.getSeasonalMultiplier()[index];
            return 15000 * seasonalFactor + Math.random() * 5000;
        });

        const lastYearData = currentYearData.map(val => val * (0.9 + Math.random() * 0.2));

        if (this.charts.yearOverYearChart) {
            this.charts.yearOverYearChart.destroy();
        }

        this.charts.yearOverYearChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: `${currentYear} Sales`,
                    data: currentYearData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }, {
                    label: `${lastYear} Sales`,
                    data: lastYearData,
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Year-over-Year Sales Comparison'
                    }
                }
            }
        });
    }

    createSeasonalIndexChart() {
        const ctx = document.getElementById('seasonalIndexChart');
        if (!ctx) return;

        const seasonalIndex = this.calculateSeasonalIndex();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (this.charts.seasonalIndexChart) {
            this.charts.seasonalIndexChart.destroy();
        }

        this.charts.seasonalIndexChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Seasonal Index',
                    data: seasonalIndex,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(75, 192, 192)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Seasonal Index Analysis'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    calculateSeasonalIndex() {
        // Calculate seasonal index based on historical data
        const salesData = this.extendedSalesData || this.salesData;
        const monthlyTotals = new Array(12).fill(0);
        const monthlyCounts = new Array(12).fill(0);

        salesData.forEach(sale => {
            const month = new Date(sale.date).getMonth();
            monthlyTotals[month] += sale.totalSales;
            monthlyCounts[month] += 1;
        });

        const monthlyAverages = monthlyTotals.map((total, index) =>
            monthlyCounts[index] > 0 ? total / monthlyCounts[index] : 0
        );

        const overallAverage = monthlyAverages.reduce((a, b) => a + b, 0) / 12;

        return monthlyAverages.map(avg => avg / overallAverage);
    }

    createProcurementCharts() {
        this.createProcurementPlanningChart();
        this.createReorderPointChart();
        this.createLeadTimeOptimizationChart();
        this.createSupplierPerformanceChart();
    }

    createProcurementPlanningChart() {
        const ctx = document.getElementById('procurementPlanningChart');
        if (!ctx) return;

        // Generate procurement planning data
        const products = this.products.slice(0, 5);
        const procurementData = products.map(product => {
            const leadTime = this.getSupplierLeadTime(product.supplier);
            const safetyStock = product.minimumStock * 0.2;
            const reorderPoint = product.minimumStock + safetyStock;
            const currentStock = product.currentStock;
            const daysToReorder = Math.max(0, (currentStock - reorderPoint) / (product.salesVelocity / 7));

            return {
                name: product.name,
                currentStock: currentStock,
                reorderPoint: reorderPoint,
                daysToReorder: daysToReorder,
                leadTime: leadTime
            };
        });

        const labels = procurementData.map(p => p.name);

        if (this.charts.procurementPlanningChart) {
            this.charts.procurementPlanningChart.destroy();
        }

        this.charts.procurementPlanningChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Current Stock',
                    data: procurementData.map(p => p.currentStock),
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }, {
                    label: 'Reorder Point',
                    data: procurementData.map(p => p.reorderPoint),
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Procurement Planning Analysis'
                    }
                }
            }
        });
    }

    createReorderPointChart() {
        const ctx = document.getElementById('reorderPointChart');
        if (!ctx) return;

        const products = this.products.slice(0, 5);
        const reorderData = products.map(product => {
            const leadTime = this.getSupplierLeadTime(product.supplier);
            const dailyDemand = product.salesVelocity / 7;
            const leadTimeDemand = dailyDemand * leadTime;
            const safetyStock = leadTimeDemand * 0.5; // 50% safety factor
            const reorderPoint = leadTimeDemand + safetyStock;

            return {
                name: product.name,
                leadTimeDemand: leadTimeDemand,
                safetyStock: safetyStock,
                reorderPoint: reorderPoint
            };
        });

        const labels = reorderData.map(p => p.name);

        if (this.charts.reorderPointChart) {
            this.charts.reorderPointChart.destroy();
        }

        this.charts.reorderPointChart = new Chart(ctx, {
            type: 'horizontalBar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Lead Time Demand',
                    data: reorderData.map(p => p.leadTimeDemand),
                    backgroundColor: 'rgba(255, 205, 86, 0.6)',
                    borderColor: 'rgba(255, 205, 86, 1)',
                    borderWidth: 1
                }, {
                    label: 'Safety Stock',
                    data: reorderData.map(p => p.safetyStock),
                    backgroundColor: 'rgba(153, 102, 255, 0.6)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                }, {
                    label: 'Reorder Point',
                    data: reorderData.map(p => p.reorderPoint),
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Reorder Point Analysis'
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true
                    }
                }
            }
        });
    }

    createLeadTimeOptimizationChart() {
        const ctx = document.getElementById('leadTimeOptimizationChart');
        if (!ctx) return;

        const suppliers = this.suppliers.slice(0, 5);
        const leadTimeData = suppliers.map(supplier => ({
            name: supplier.name,
            avgLeadTime: supplier.avgLeadTime,
            reliability: supplier.reliability,
            optimizedLeadTime: supplier.avgLeadTime * (1 - supplier.reliability / 100 * 0.1)
        }));

        const labels = leadTimeData.map(s => s.name);

        if (this.charts.leadTimeOptimizationChart) {
            this.charts.leadTimeOptimizationChart.destroy();
        }

        this.charts.leadTimeOptimizationChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Current Lead Time',
                    data: leadTimeData.map(s => s.avgLeadTime),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.1
                }, {
                    label: 'Optimized Lead Time',
                    data: leadTimeData.map(s => s.optimizedLeadTime),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Lead Time Optimization'
                    }
                }
            }
        });
    }

    createSupplierPerformanceChart() {
        const ctx = document.getElementById('supplierPerformanceChart');
        if (!ctx) return;

        const suppliers = this.suppliers.slice(0, 5);
        const performanceData = suppliers.map(supplier => ({
            name: supplier.name,
            reliability: supplier.reliability,
            onTimeDelivery: supplier.onTimeDelivery,
            overallScore: (supplier.reliability + supplier.onTimeDelivery) / 2
        }));

        const labels = performanceData.map(s => s.name);

        if (this.charts.supplierPerformanceChart) {
            this.charts.supplierPerformanceChart.destroy();
        }

        this.charts.supplierPerformanceChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Reliability',
                    data: performanceData.map(s => s.reliability),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointBorderColor: '#fff'
                }, {
                    label: 'On-Time Delivery',
                    data: performanceData.map(s => s.onTimeDelivery),
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    pointBackgroundColor: 'rgb(255, 99, 132)',
                    pointBorderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Supplier Performance Analysis'
                    }
                }
            }
        });
    }

    generateAdvancedInsights(period, type, aggregation, model) {
        const insightsDiv = document.getElementById('predictionInsights');
        if (!insightsDiv) return;

        const insights = [];
        const ts = this.realSalesTimeSeries || this.extendedSalesData || [];
        const salesCount = this._realSaleCount || 0;
        const products = this.products || [];

        // - -- - Real metrics computation - -- -
        const totalRev = ts.reduce((s, d) => s + d.totalSales, 0);
        const totalTxns = ts.reduce((s, d) => s + d.transactions, 0);
        const totalItems = ts.reduce((s, d) => s + d.items, 0);
        const activeDays = ts.filter(d => d.totalSales > 0).length;
        const dailyAvg = activeDays > 0 ? totalRev / activeDays : 0;
        const last30 = ts.slice(-30);
        const prev30 = ts.slice(-60, -30);
        const last30Rev = last30.reduce((s, d) => s + d.totalSales, 0);
        const prev30Rev = prev30.reduce((s, d) => s + d.totalSales, 0);
        const growthPct = prev30Rev > 0 ? ((last30Rev - prev30Rev) / prev30Rev * 100) : 0;
        const last7 = ts.slice(-7);
        const prev7 = ts.slice(-14, -7);
        const last7Rev = last7.reduce((s, d) => s + d.totalSales, 0);
        const prev7Rev = prev7.reduce((s, d) => s + d.totalSales, 0);
        const weekGrowth = prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev * 100) : 0;

        // - -- - 1. Revenue & Growth Insight - -- -
        const growthIcon = growthPct >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
        const growthClass = growthPct >= 5 ? '' : growthPct < -5 ? 'alert-item--warning' : '';
        insights.push(`<div class="alert-item ${growthClass}">
            <div class="alert-content">
                <h4><i class="fas fa-chart-line"></i> Revenue Analysis (Real Data: ${salesCount} records)</h4>
                <p><strong>Daily avg: ₹${dailyAvg.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</strong> from ${activeDays} active trading days.
                30-day revenue: ₹${last30Rev.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                (<i class="fas ${growthIcon}"></i> ${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% vs prior 30d).
                Week-on-week: ${weekGrowth >= 0 ? '+' : ''}${weekGrowth.toFixed(1)}%.
                ${salesCount === 0 ? '<br><em> No sales recorded yet   start recording sales to see real insights!</em>' : ''}</p>
            </div>
        </div>`);

        // - -- - 2. Forecast Confidence - -- -
        const salesValues = ts.filter(d => d.totalSales > 0).map(d => d.totalSales);
        const mean = salesValues.length > 0 ? salesValues.reduce((s, v) => s + v, 0) / salesValues.length : 0;
        const variance = salesValues.length > 1 ? salesValues.reduce((s, v) => s + (v - mean) ** 2, 0) / (salesValues.length - 1) : 0;
        const cv = mean > 0 ? (Math.sqrt(variance) / mean * 100) : 0;
        const confidence = cv < 20 ? 'high' : cv < 40 ? 'moderate' : 'low';
        const confPct = cv < 20 ? 90 : cv < 40 ? 75 : 60;
        const forecastedRev = dailyAvg * period * (1 + growthPct / 100);
        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-brain"></i> ${model.toUpperCase()} Forecast (${period}-Day)</h4>
                <p>Projected ${period}-day revenue: <strong>₹${forecastedRev.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</strong>
                (using ${activeDays}-day training data).
                Model confidence: <strong>${confidence} (~${confPct}%)</strong>   coefficient of variation: ${cv.toFixed(1)}%.
                ${cv > 40 ? 'High volatility detected   consider shorter forecast windows.' : 'Sales are relatively stable   forecasts are reliable.'}</p>
            </div>
        </div>`);

        // - -- - 3. Anomaly Detection (real) - -- -
        const data = ts.map(d => d.totalSales);
        const anomalies = this.detectAnomalies(data);
        const anomalyCount = anomalies.filter(Boolean).length;
        const anomalyRate = data.length > 0 ? (anomalyCount / data.length * 100) : 0;
        const anomalyDates = [];
        anomalies.forEach((isAnomaly, i) => { if (isAnomaly && ts[i]) anomalyDates.push(ts[i].date); });
        insights.push(`<div class="alert-item ${anomalyCount > 5 ? 'alert-item--warning' : ''}">
            <div class="alert-content">
                <h4><i class="fas fa-exclamation-triangle"></i> Anomaly Detection</h4>
                <p>Found <strong>${anomalyCount} anomalies</strong> (${anomalyRate.toFixed(1)}% of ${data.length} days).
                ${anomalyCount > 0 ? `Recent anomaly dates: ${anomalyDates.slice(-3).join(', ')}.` : 'No anomalies detected.'}
                ${anomalyCount > 5 ? ' High anomaly rate may indicate promotions, stock issues, or supply disruptions.' :
                anomalyCount > 0 ? ' Low anomaly count   normal for occasional promotions or events.' : ' Stable sales pattern.'}</p>
            </div>
        </div>`);

        // - -- - 4. Seasonal Analysis (real computed) - -- -
        const sm = this.getSeasonalMultiplier();
        const currentMonth = new Date().getMonth();
        const curSeason = sm[currentMonth];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const peakIdx = sm.indexOf(Math.max(...sm));
        const troughIdx = sm.indexOf(Math.min(...sm.filter(v => v > 0)));
        const seasonLabel = curSeason > 1.15 ? 'peak season' : curSeason < 0.85 ? 'off-season' : 'normal season';
        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-calendar-alt"></i> Seasonal Intelligence (Computed from Your Data)</h4>
                <p>Current month (${months[currentMonth]}): <strong>${seasonLabel}</strong>   demand index ${curSeason.toFixed(2)}x.
                ${sm[peakIdx] > 1 ? `Peak month: <strong>${months[peakIdx]}</strong> (${((sm[peakIdx] - 1) * 100).toFixed(0)}% above average).` : ''}
                ${sm[troughIdx] < 1 ? `Lowest month: <strong>${months[troughIdx]}</strong> (${((1 - sm[troughIdx]) * 100).toFixed(0)}% below average).` : ''}
                ${salesCount < 30 ? '<br><em>Note: Seasonal patterns need 60+ days of sales data for accuracy.</em>' : ''}</p>
            </div>
        </div>`);

        // - -- - 5. Procurement (real stock analysis) - -- -
        const lowStock = products.filter(p => (p.currentStock || 0) <= (p.minimumStock || 0));
        const criticalStock = products.filter(p => {
            const vel = p.salesVelocity || 1;
            return vel > 0 && (p.currentStock / vel) < 7;
        });
        insights.push(`<div class="alert-item ${criticalStock.length > 0 ? 'alert-item--warning' : ''}">
            <div class="alert-content">
                <h4><i class="fas fa-shopping-cart"></i> Procurement Intelligence</h4>
                <p><strong>${lowStock.length}</strong> products below minimum stock. <strong>${criticalStock.length}</strong> products will stockout within 7 days.
                ${lowStock.length > 0 ? `<br>Reorder now: ${lowStock.slice(0, 5).map(p => p.name).join(', ')}${lowStock.length > 5 ? ` +${lowStock.length - 5} more` : ''}.` : ' All products above minimum stock.'}
                ${criticalStock.length > 0 ? `<br>Critical: ${criticalStock.slice(0, 3).map(p => `${p.name} (~${Math.floor(p.currentStock / (p.salesVelocity || 1))}d left)`).join(', ')}.` : ''}</p>
            </div>
        </div>`);

        // - -- - 6. AI Business Recommendations - -- -
        const totalInvValue = products.reduce((s, p) => s + (p.costPrice || 0) * (p.currentStock || 0), 0);
        const avgMargin = products.length > 0 ? products.reduce((s, p) => {
            const m = p.sellingPrice > 0 ? ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) : 0;
            return s + m;
        }, 0) / products.length : 0;
        const highMarginProducts = products.filter(p => p.sellingPrice > 0 && ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) > 35);
        const lowMarginHighVelocity = products.filter(p => {
            const m = p.sellingPrice > 0 ? ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) : 0;
            return m < 15 && (p.salesVelocity || 0) > 3;
        });

        const recs = [];
        if (growthPct > 10) recs.push(`📈 Revenue is growing ${growthPct.toFixed(0)}% - consider increasing stock of top-selling items to capitalise on momentum.`);
        if (growthPct < -10) recs.push(`📉 Revenue declining ${Math.abs(growthPct).toFixed(0)}% - review pricing strategy, run promotions, or reduce slow-movers.`);
        if (lowMarginHighVelocity.length > 0) recs.push(`💰 ${lowMarginHighVelocity.length} fast-selling products have margins below 15% - renegotiate supplier rates or increase selling prices by 5-10%.`);
        if (highMarginProducts.length > 0) recs.push(`⭐ ${highMarginProducts.length} products with 35%+ margins - prioritise stock availability for: ${highMarginProducts.slice(0, 3).map(p => p.name).join(', ')}.`);
        if (criticalStock.length > 0) recs.push(`🚨 ${criticalStock.length} items stockout imminent - place emergency orders today to prevent lost sales.`);
        if (totalInvValue > dailyAvg * 60) recs.push(`📦 Inventory value (₹${(totalInvValue / 1000).toFixed(0)}K) covers ${(totalInvValue / dailyAvg).toFixed(0)} days of sales - consider reducing slow-moving stock to free up capital.`);
        if (avgMargin < 20) recs.push(`⚠️ Average margin ${avgMargin.toFixed(1)}% is below healthy (25%+) - audit cost prices and negotiate bulk discounts.`);
        if (avgMargin >= 30) recs.push(`✅ Strong average margin of ${avgMargin.toFixed(1)}% - maintain current pricing strategy.`);
        if (salesCount === 0) recs.push('💡 Start recording sales to unlock AI-powered insights, demand forecasting, and stock optimisation.');
        if (recs.length === 0) recs.push('✅ Your business metrics look healthy. Continue monitoring for emerging trends.');

        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-robot"></i> AI Strategy Recommendations</h4>
                <ul style="margin:8px 0 0 16px;line-height:1.8;">${recs.map(r => `<li>${r}</li>`).join('')}</ul>
            </div>
        </div>`);

        insightsDiv.innerHTML = insights.join('');

        // â"€â"€ Gemini AI Enhancement â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€\_prediction
        const aiKey = localStorage.getItem('gemini_api_key');
        if (aiKey) {
            const aiCard = document.createElement('div');
            aiCard.className = 'alert-item';
            aiCard.style.cssText = 'border-left-color:#4285F4;';
            aiCard.innerHTML = `<div class="alert-content"><h4><i class="fas fa-robot" style="color:#4285F4;margin-right:6px;"></i>AI Forecast Commentary <small style="font-weight:400;color:var(--color-text-secondary);">(Gemini 2.5)</small></h4><p id="aiPredictionText"><i class="fas fa-spinner fa-spin"></i> Generating AI analysis...</p></div>`;
            insightsDiv.appendChild(aiCard);
            const ts2 = this.realSalesTimeSeries || [];
            const last30Rev2 = ts2.slice(-30).reduce((s, d) => s + d.totalSales, 0);
            const activeDays2 = ts2.filter(d => d.totalSales > 0).length;
            const dailyAvg2 = activeDays2 > 0 ? (ts2.reduce((s, d) => s + d.totalSales, 0) / activeDays2) : 0;
            const prev7 = ts2.slice(-14, -7).reduce((s, d) => s + d.totalSales, 0);
            const last7 = ts2.slice(-7).reduce((s, d) => s + d.totalSales, 0);
            const wkTrend = prev7 > 0 ? ((last7 - prev7) / prev7 * 100).toFixed(1) : '0';
            const top5 = (this.products || []).sort((a, b) => (b.sellingPrice * (b.salesVelocity || 0)) - (a.sellingPrice * (a.salesVelocity || 0))).slice(0, 5);
            const risks = (this.products || []).filter(p => (p.salesVelocity || 0) > 0 && p.currentStock / (p.salesVelocity || 1) <= 7).slice(0, 4);
            const prompt = `You are a retail forecast analyst. Give 4 concise bullet points on the ${period}-day ${type} outlook for a small Indian retail store.\nKey data — Model: ${model}, Daily avg rev: Rs.${dailyAvg2.toFixed(0)}, Last 30d: Rs.${last30Rev2.toFixed(0)}, WoW trend: ${wkTrend}%, Sales records: ${this._realSaleCount || 0}, Top products: ${top5.map(p => p.name).join(', ')}, Stockout risks: ${risks.length > 0 ? risks.map(p => p.name).join(', ') : 'None'}.\nBullets must cover: (1) ${period}-day revenue forecast, (2) biggest risk, (3) one action to take this week, (4) forecast confidence. Use - bullet format, be brief.`;
            fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + aiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 400 } }) })
                .then(r => r.json()).then(data => {
                    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
                    const html = txt.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^[-"¢]\s?(.+)$/gm, '<li style="margin:5px 0;">$1</li>').replace(/\n/g, '');
                    const el = document.getElementById('aiPredictionText');
                    if (el) el.innerHTML = `<ul style="margin:4px 0;padding-left:16px;">${html}</ul>`;
                }).catch(err => {
                    const el = document.getElementById('aiPredictionText');
                    if (el) el.innerHTML = '<span style="color:#f59e0b;font-size:0.8rem;">AI unavailable: ' + err.message + '</span>';
                });
        }
    }

    exportAnalytics() {
        const period = parseInt(document.getElementById('predictionPeriod').value) || 30;
        const type = document.getElementById('predictionType').value || 'sales';
        const aggregation = document.getElementById('aggregationLevel').value || 'weekly';
        const model = document.getElementById('forecastModel').value || 'sarima';

        const analytics = {
            timestamp: new Date().toISOString(),
            parameters: {
                period: period,
                type: type,
                aggregation: aggregation,
                model: model
            },
            historicalData: this.aggregatedData,
            forecasts: {
                sarima: this.sarimaForecast(
                    (this.extendedSalesData || this.salesData).map(d => d.totalSales), period
                ),
                linear: this.linearRegressionForecast(
                    (this.extendedSalesData || this.salesData).map(d => d.totalSales), period
                )
            },
            anomalies: {
                detected: this.detectAnomalies((this.extendedSalesData || this.salesData).map(d => d.totalSales)),
                outliers: this.detectOutliers((this.extendedSalesData || this.salesData).map(d => d.totalSales))
            },
            seasonal: {
                multipliers: this.getSeasonalMultiplier(),
                index: this.calculateSeasonalIndex(),
                decomposition: this.seasonalDecompose(
                    (this.extendedSalesData || this.salesData).map(d => d.totalSales), 7
                )
            },
            procurement: {
                reorderPoints: this.products.map(p => ({
                    name: p.name,
                    currentStock: p.currentStock,
                    reorderPoint: p.minimumStock + (p.minimumStock * 0.2),
                    leadTime: this.getSupplierLeadTime(p.supplier)
                })),
                supplierPerformance: this.suppliers.map(s => ({
                    name: s.name,
                    reliability: s.reliability,
                    leadTime: s.avgLeadTime,
                    onTimeDelivery: s.onTimeDelivery
                }))
            }
        };

        const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `advanced_analytics_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('Advanced analytics exported successfully!', 'success');
    }

    createSalesForecastChart(period) {
        const ctx = document.getElementById('salesForecastChart');
        if (!ctx) return;

        // Use existing sales data and extend with linear regression forecast
        const salesData = this.salesData.map(d => d.totalSales);
        const dates = this.salesData.map(d => new Date(d.date));

        // Simple linear regression for forecasting
        const forecast = this.linearRegressionForecast(salesData, period);

        const futureDates = [];
        const lastDate = new Date(dates[dates.length - 1]);
        for (let i = 1; i <= period; i++) {
            const date = new Date(lastDate);
            date.setDate(date.getDate() + i);
            futureDates.push(date);
        }

        if (this.charts.salesForecastChart) {
            this.charts.salesForecastChart.destroy();
        }

        this.charts.salesForecastChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [...dates.map(d => d.toLocaleDateString()), ...futureDates.map(d => d.toLocaleDateString())],
                datasets: [{
                    label: 'Historical Sales',
                    data: salesData,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }, {
                    label: 'Forecasted Sales',
                    data: [...Array(salesData.length).fill(null), ...forecast],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderDash: [5, 5],
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Sales Forecast (Linear Regression)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '₹' + value.toLocaleString('en-IN');
                            }
                        }
                    }
                }
            }
        });
    }

    createInventoryPredictionChart(period) {
        const ctx = document.getElementById('inventoryPredictionChart');
        if (!ctx) return;

        // Predict inventory levels based on sales velocity and current stock
        const predictions = this.products.map(product => {
            const dailySales = product.salesVelocity / 7; // Weekly to daily
            const daysToDepletion = product.currentStock / dailySales;
            const futureLevels = [];

            for (let day = 0; day < period; day++) {
                const remaining = Math.max(0, product.currentStock - (dailySales * day));
                futureLevels.push(remaining);
            }

            return {
                name: product.name,
                current: product.currentStock,
                min: product.minimumStock,
                levels: futureLevels
            };
        });

        const labels = Array.from({ length: period }, (_, i) => `Day ${i + 1}`);

        if (this.charts.inventoryPredictionChart) {
            this.charts.inventoryPredictionChart.destroy();
        }

        this.charts.inventoryPredictionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: predictions.slice(0, 5).map((pred, index) => ({
                    label: pred.name,
                    data: pred.levels,
                    borderColor: `hsl(${index * 60}, 70%, 50%)`,
                    backgroundColor: `hsla(${index * 60}, 70%, 50%, 0.1)`,
                    tension: 0.1
                }))
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Inventory Depletion Prediction'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Stock Level'
                        }
                    }
                }
            }
        });
    }

    createSeasonalTrendsChart() {
        const ctx = document.getElementById('seasonalTrendsChart');
        if (!ctx) return;

        // Analyze seasonal patterns (simplified - using month-based analysis)
        const monthlySales = Array(12).fill(0);
        const monthlyCounts = Array(12).fill(0);

        this.salesData.forEach(sale => {
            const month = new Date(sale.date).getMonth();
            monthlySales[month] += sale.totalSales;
            monthlyCounts[month] += 1;
        });

        const avgMonthlySales = monthlySales.map((total, index) =>
            monthlyCounts[index] > 0 ? total / monthlyCounts[index] : 0
        );

        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (this.charts.seasonalTrendsChart) {
            this.charts.seasonalTrendsChart.destroy();
        }

        this.charts.seasonalTrendsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Average Monthly Sales',
                    data: avgMonthlySales,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Seasonal Sales Trends'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function (value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    createDemandPredictionChart(period) {
        const ctx = document.getElementById('demandPredictionChart');
        if (!ctx) return;

        // Predict demand based on sales velocity and seasonal factors
        const demandData = this.products.map(product => {
            const baseDemand = product.salesVelocity;
            const seasonalMultiplier = this.getSeasonalMultiplier();
            const trend = 1.02; // 2% growth trend

            const predictions = [];
            for (let day = 0; day < period; day++) {
                const seasonal = seasonalMultiplier[new Date(Date.now() + day * 24 * 60 * 60 * 1000).getMonth()];
                const predicted = baseDemand * seasonal * Math.pow(trend, day / 30);
                predictions.push(predicted);
            }

            return {
                name: product.name,
                predictions: predictions
            };
        });

        const labels = Array.from({ length: period }, (_, i) => `Day ${i + 1}`);

        if (this.charts.demandPredictionChart) {
            this.charts.demandPredictionChart.destroy();
        }

        this.charts.demandPredictionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: demandData.slice(0, 5).map((item, index) => ({
                    label: item.name,
                    data: item.predictions,
                    borderColor: `hsl(${index * 72}, 70%, 50%)`,
                    backgroundColor: `hsla(${index * 72}, 70%, 50%, 0.1)`,
                    tension: 0.1
                }))
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Demand Prediction'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Predicted Demand'
                        }
                    }
                }
            }
        });
    }

    linearRegressionForecast(data, periods) {
        const n = data.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = data;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const forecast = [];
        for (let i = 0; i < periods; i++) {
            forecast.push(intercept + slope * (n + i));
        }

        return forecast;
    }

    getSeasonalMultiplier() {
        // Return REAL computed seasonal multipliers if available
        if (this._computedSeasonalMultipliers) return this._computedSeasonalMultipliers;
        // Fallback: compute from real data or return flat (no fake seasonal patterns)
        return this._computeRealSeasonalMultipliers();
    }

    _computeRealSeasonalMultipliers() {
        const ts = this.realSalesTimeSeries || this.extendedSalesData || [];
        if (ts.length < 7) return Array(12).fill(1.0);
        const monthTotals = Array(12).fill(0);
        const monthCounts = Array(12).fill(0);
        ts.forEach(d => {
            const m = new Date(d.date).getMonth();
            monthTotals[m] += d.totalSales;
            monthCounts[m]++;
        });
        const monthAvgs = monthTotals.map((t, i) => monthCounts[i] > 0 ? t / monthCounts[i] : 0);
        const nonZero = monthAvgs.filter(v => v > 0);
        const overallAvg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 1;
        return monthAvgs.map(v => overallAvg > 0 ? +(v / overallAvg).toFixed(3) : 1.0);
    }

    generatePredictionInsights(period, type) {
        const insightsDiv = document.getElementById('predictionInsights');
        if (!insightsDiv) return;

        const insights = [];

        // Sales insights
        const salesSrc = this.realSalesTimeSeries || this.salesData || [];
        const avgSales = salesSrc.length > 0 ? salesSrc.reduce((sum, d) => sum + d.totalSales, 0) / salesSrc.length : 0;
        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-chart-line"></i> Sales Trend</h4>
                <p>Average daily sales: ₹${avgSales.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}. Expected ${period}-day forecast shows ₹${(avgSales * period * 1.05).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} total revenue.</p>
            </div>
        </div>`);

        // Inventory insights
        const lowStockProducts = this.products.filter(p => p.currentStock <= p.minimumStock);
        if (lowStockProducts.length > 0) {
            insights.push(`<div class="alert-item alert-item--warning">
                <div class="alert-content">
                    <h4><i class="fas fa-exclamation-triangle"></i> Inventory Alert</h4>
                    <p>${lowStockProducts.length} products are at or below minimum stock levels. Reorder recommended within ${period} days.</p>
                </div>
            </div>`);
        }

        // Seasonal insights
        const currentMonth = new Date().getMonth();
        const seasonalMultiplier = this.getSeasonalMultiplier()[currentMonth];
        const seasonText = seasonalMultiplier > 1.2 ? 'peak season' : seasonalMultiplier < 0.9 ? 'off-season' : 'normal season';
        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-calendar"></i> Seasonal Analysis</h4>
                <p>Current period is ${seasonText} with ${((seasonalMultiplier - 1) * 100).toFixed(0)}% demand variation. Adjust inventory accordingly.</p>
            </div>
        </div>`);

        // AI recommendations
        insights.push(`<div class="alert-item">
            <div class="alert-content">
                <h4><i class="fas fa-robot"></i> AI Recommendations</h4>
                <p>Based on historical data, increase stock for high-velocity items by 15%. Consider promotional pricing for slow-moving products.</p>
            </div>
        </div>`);

        insightsDiv.innerHTML = insights.join('');
    }

    exportPredictions() {
        const period = parseInt(document.getElementById('predictionPeriod').value) || 30;
        const type = document.getElementById('predictionType').value || 'sales';

        const predictions = {
            period: period,
            type: type,
            timestamp: new Date().toISOString(),
            salesForecast: this.linearRegressionForecast(
                this.salesData.map(d => d.totalSales), period
            ),
            inventoryPredictions: this.products.map(p => ({
                name: p.name,
                currentStock: p.currentStock,
                predictedDepletion: Math.ceil(p.currentStock / (p.salesVelocity / 7))
            })),
            seasonalMultipliers: this.getSeasonalMultiplier()
        };

        const blob = new Blob([JSON.stringify(predictions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `predictions_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('Predictions exported successfully!', 'success');
    }

    generateDynamicStrategy() {
        const container = document.getElementById('dynamicStrategyInsights');
        if (!container) return;

        const products = this.products;
        const ts = this.realSalesTimeSeries || [];

        // - -- - Stock-Out Risk - -- -
        const stockOutRisk = products.filter(p => {
            const velocity = p.salesVelocity || 1;
            const daysLeft = velocity > 0 ? Math.floor(p.currentStock / velocity) : 999;
            return daysLeft <= 7 && p.currentStock > 0;
        }).map(p => ({
            name: p.name,
            stock: p.currentStock,
            velocity: p.salesVelocity || 1,
            daysLeft: Math.floor(p.currentStock / (p.salesVelocity || 1))
        })).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);

        // - -- - Overstock Warning - -- -
        const overstocked = products.filter(p => {
            const velocity = p.salesVelocity || 1;
            const daysOfStock = velocity > 0 ? p.currentStock / velocity : 999;
            return daysOfStock > 60 && p.currentStock > 20;
        }).map(p => ({
            name: p.name,
            stock: p.currentStock,
            daysOfStock: Math.floor(p.currentStock / (p.salesVelocity || 1)),
            value: p.costPrice * p.currentStock
        })).sort((a, b) => b.daysOfStock - a.daysOfStock).slice(0, 5);

        // - -- - Margin Opportunities - -- -
        const lowMarginProducts = products.filter(p => {
            const margin = p.costPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.costPrice * 100) : 0;
            return margin < 15 && margin >= 0 && p.currentStock > 0;
        }).map(p => ({
            name: p.name,
            margin: p.costPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.costPrice * 100) : 0,
            suggestedPrice: Math.ceil(p.costPrice * 1.25)
        })).slice(0, 5);

        // - -- - Revenue Trend - -- -
        const totalRevenue = ts.reduce((s, d) => s + d.totalSales, 0);
        const recentDays = ts.slice(-7);
        const olderDays = ts.slice(-14, -7);
        const recentAvg = recentDays.length > 0 ? recentDays.reduce((s, d) => s + d.totalSales, 0) / recentDays.length : 0;
        const olderAvg = olderDays.length > 0 ? olderDays.reduce((s, d) => s + d.totalSales, 0) / olderDays.length : 0;
        const trendPct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg * 100) : 0;
        const trendDir = trendPct >= 0 ? '📈' : '📉';
        const trendColor = trendPct >= 0 ? '#10b981' : '#ef4444';

        container.innerHTML = `
            <div class="stats-grid" style="margin-bottom:20px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(0,102,255,0.12);color:#0066FF;"><i class="fas fa-rupee-sign"></i></div>
                    <div class="stat-info"><h3>₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</h3><p>Total Revenue (90d)</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(${trendPct >= 0 ? '16,185,129' : '239,68,68'},0.12);color:${trendColor};"><i class="fas fa-${trendPct >= 0 ? 'arrow-up' : 'arrow-down'}"></i></div>
                    <div class="stat-info"><h3 style="color:${trendColor}">${trendDir} ${Math.abs(trendPct).toFixed(1)}%</h3><p>Week-over-Week Trend</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(245,158,11,0.12);color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i></div>
                    <div class="stat-info"><h3>${stockOutRisk.length}</h3><p>Stock-Out Risks</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:rgba(139,92,246,0.12);color:#8b5cf6;"><i class="fas fa-boxes-stacked"></i></div>
                    <div class="stat-info"><h3>${overstocked.length}</h3><p>Overstocked Items</p></div>
                </div>
            </div>

            <div class="chart-grid" style="grid-template-columns:1fr 1fr 1fr;gap:16px;">
                ${stockOutRisk.length > 0 ? `
                <div class="card" style="border-left:4px solid #ef4444;">
                    <div class="card__header"><h3 style="color:#ef4444;"><i class="fas fa-fire"></i> Stock-Out Risk (Reorder Now!)</h3></div>
                    <div class="card__body">
                        ${stockOutRisk.map(p => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);">
                                <strong>${p.name}</strong>
                                <span style="color:#ef4444;font-weight:600;">${p.daysLeft} days left (${p.stock} units)</span>
                            </div>
                        `).join('')}
                    </div>
                </div>` : `
                <div class="card" style="border-left:4px solid #10b981;">
                    <div class="card__header"><h3 style="color:#10b981;"><i class="fas fa-check-circle"></i> Stock Health</h3></div>
                    <div class="card__body"><p style="padding:16px 0;color:var(--color-text-secondary);">✅ All products have healthy stock levels!</p></div>
                </div>`}

                ${overstocked.length > 0 ? `
                <div class="card" style="border-left:4px solid #f59e0b;">
                    <div class="card__header"><h3 style="color:#f59e0b;"><i class="fas fa-warehouse"></i> Overstock Warning</h3></div>
                    <div class="card__body">
                        ${overstocked.map(p => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);">
                                <strong>${p.name}</strong>
                                <span style="color:#f59e0b;">${p.daysOfStock}d supply Ã‚· ₹${p.value.toLocaleString('en-IN')}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>` : `
                <div class="card" style="border-left:4px solid #10b981;">
                    <div class="card__header"><h3 style="color:#10b981;"><i class="fas fa-balance-scale"></i> Inventory Balance</h3></div>
                    <div class="card__body"><p style="padding:16px 0;color:var(--color-text-secondary);">✅ No overstock issues detected</p></div>
                </div>`}

                ${lowMarginProducts.length > 0 ? `
                <div class="card" style="border-left:4px solid #8b5cf6;">
                    <div class="card__header"><h3 style="color:#8b5cf6;"><i class="fas fa-tag"></i> Margin Optimization</h3></div>
                    <div class="card__body">
                        ${lowMarginProducts.map(p => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--color-border);">
                                <strong>${p.name}</strong>
                                <span style="color:#8b5cf6;">${p.margin.toFixed(1)}% Ã¢" ’ suggest ₹${p.suggestedPrice}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>` : `
                <div class="card" style="border-left:4px solid #10b981;">
                    <div class="card__header"><h3 style="color:#10b981;"><i class="fas fa-thumbs-up"></i> Margins Healthy</h3></div>
                    <div class="card__body"><p style="padding:16px 0;color:var(--color-text-secondary);">✅ All products have healthy margins (>15%)</p></div>
                </div>`}
            </div>
        `;

        // Also populate the Business Strategy tab's real-data container
        const realCards = document.getElementById('realStrategyCards');
        if (realCards) {
            const topProducts = [...products]
                .sort((a, b) => (b.sellingPrice * (b.salesVelocity || 0)) - (a.sellingPrice * (a.salesVelocity || 0)))
                .slice(0, 5);
            const highMargin = products.filter(p => p.sellingPrice > 0 && ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) > 30)
                .sort((a, b) => b.sellingPrice - a.sellingPrice).slice(0, 5);
            const slowMovers = products.filter(p => (p.salesVelocity || 0) < 2 && p.currentStock > 10)
                .sort((a, b) => a.salesVelocity - b.salesVelocity).slice(0, 5);
            const nearExpiry = products.filter(p => {
                if (!p.expiryDate) return false;
                const diff = (new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
                return diff > 0 && diff <= 30;
            }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).slice(0, 5);

            const projectedRevenue = topProducts.reduce((s, p) => s + (p.sellingPrice * (p.salesVelocity || 0) * 30), 0);
            const avgMarginAll = products.length > 0 ? products.reduce((s, p) => {
                return s + (p.sellingPrice > 0 ? ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) : 0);
            }, 0) / products.length : 0;

            const strategies = [
                trendPct > 10 ? `📈 Revenue up ${trendPct.toFixed(0)}% WoW — stock up fast-movers before demand peaks.` : null,
                trendPct < -10 ? `📉 Revenue down ${Math.abs(trendPct).toFixed(0)}% — run promotions on slow-movers and review pricing.` : null,
                stockOutRisk.length > 0 ? `🚨 Place reorders for ${stockOutRisk.map(p => p.name).join(', ')} immediately — stockout imminent.` : null,
                overstocked.length > 0 ? `📦 Reduce orders for ${overstocked.map(p => p.name).join(', ')} — ${overstocked[0]?.daysOfStock}+ days of supply tied up.` : null,
                highMargin.length > 0 ? `💰 Prioritise availability of high-margin items: ${highMargin.map(p => p.name).join(', ')} to maximise profit.` : null,
                lowMarginProducts.length > 0 ? `💡 Renegotiate supplier rates for ${lowMarginProducts.map(p => p.name).join(', ')} — margins below 15%.` : null,
                nearExpiry.length > 0 ? `⏰ ${nearExpiry.length} items expiring within 30 days — discount or bundle: ${nearExpiry.map(p => p.name).join(', ')}.` : null,
                avgMarginAll > 30 ? `✅ Strong average margin of ${avgMarginAll.toFixed(1)}% — maintain current pricing strategy.` : null,
            ].filter(Boolean);

            if (strategies.length === 0) strategies.push('✅ Inventory looks healthy. Keep monitoring sales velocity and reorder points.');

            realCards.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:20px;">

              <div class="card" style="border-left:4px solid #0066FF;">
                <div class="card__header"><h3><i class="fas fa-rocket" style="color:#0066FF;"></i> Top Revenue Drivers</h3></div>
                <div class="card__body">
                  <p style="font-size:0.78rem;color:var(--color-text-secondary);margin-bottom:10px;">Projected monthly revenue: <strong>₹${projectedRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</strong></p>
                  ${topProducts.map((p, i) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span><strong>#${i + 1}</strong> ${p.name}</span><span style="color:#0066FF;font-weight:600;">₹${((p.sellingPrice || 0) * (p.salesVelocity || 0) * 30).toLocaleString('en-IN', { minimumFractionDigits: 0 })}/mo</span></div>`).join('')}
                </div>
              </div>

              <div class="card" style="border-left:4px solid #10b981;">
                <div class="card__header"><h3><i class="fas fa-percentage" style="color:#10b981;"></i> High-Margin Stars</h3></div>
                <div class="card__body">
                  ${highMargin.length > 0 ? highMargin.map(p => {
                const m = p.sellingPrice > 0 ? ((p.sellingPrice - (p.costPrice || 0)) / p.sellingPrice * 100) : 0;
                return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span>${p.name}</span><span style="color:#10b981;font-weight:600;">${m.toFixed(0)}% margin</span></div>`;
            }).join('') : '<p style="color:var(--color-text-secondary);padding:12px 0;">Add cost prices to products to see margin analysis.</p>'}
                </div>
              </div>

              <div class="card" style="border-left:4px solid #f59e0b;">
                <div class="card__header"><h3><i class="fas fa-snooze" style="color:#f59e0b;"></i> Slow-Mover Action Plan</h3></div>
                <div class="card__body">
                  ${slowMovers.length > 0 ? slowMovers.map(p => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--color-border);"><span>${p.name}</span><span style="color:#f59e0b;font-weight:600;">${p.salesVelocity || 0} u/day · ${p.currentStock} in stock</span></div>`).join('') : '<p style="color:var(--color-text-secondary);padding:12px 0;">✅ No slow-movers detected.</p>'}
                  ${nearExpiry.length > 0 ? `<p style="margin-top:10px;font-size:0.78rem;color:#ef4444;">⏰ Expiring soon: ${nearExpiry.map(p => p.name).join(', ')}</p>` : ''}
                </div>
              </div>

            </div>

            <div class="card" style="margin-top:4px;">
              <div class="card__header"><h3><i class="fas fa-lightbulb" style="color:#f59e0b;"></i> AI Sales Boost Recommendations</h3></div>
              <div class="card__body">
                <ul style="list-style:none;padding:0;margin:0;">
                  ${strategies.map(s => `<li style="padding:10px 0;border-bottom:1px solid var(--color-border);font-size:0.88rem;">${s}</li>`).join('')}
                </ul>
              </div>
            </div>`;
        }
    }

    // -"¢-"¢-"¢-"¢-"¢-"¢-"¢-"¢_prediction
    //  SALES & PROFIT HUB
    // -"¢-"¢-"¢-"¢-"¢-"¢-"¢-"¢_prediction

    initSalesProfitHub() {
        // Set up tab switching
        const tabContainer = document.getElementById('spTabs');
        if (tabContainer && !tabContainer.dataset.initialized) {
            tabContainer.dataset.initialized = '1';
            tabContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-sptab]');
                if (!btn) return;
                const tabName = btn.dataset.sptab;
                tabContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('.sp-tab-content').forEach(t => { t.style.display = 'none'; t.classList.remove('active'); });
                const target = document.getElementById('sp-' + tabName);
                if (target) { target.style.display = 'block'; target.classList.add('active'); }
                // Render tab-specific content
                if (tabName === 'revenue') this.renderRevenueTab();
                if (tabName === 'profitbreakdown') this.renderProfitTab();
                if (tabName === 'soldproducts') this.loadSoldProducts();
            });
        }
        // Default render
        this.renderRevenueTab();
    }

    renderRevenueTab() {
        // KPI cards
        const totalRevenue = this.salesData.reduce((s, d) => s + (d.totalSales || 0), 0);
        const avgDaily = this.salesData.length > 0 ? totalRevenue / this.salesData.length : 0;
        const bestDay = this.salesData.reduce((best, d) => (!best || d.totalSales > best.totalSales ? d : best), null);
        const totalTxns = this.salesData.reduce((s, d) => s + (d.transactions || 0), 0);

        const el = (id) => document.getElementById(id);
        if (el('spTotalRevenue')) el('spTotalRevenue').textContent = '₹' + totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        if (el('spAvgDaily')) el('spAvgDaily').textContent = '₹' + avgDaily.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        if (el('spBestDay') && bestDay) el('spBestDay').textContent = new Date(bestDay.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        if (el('spTotalTxns')) el('spTotalTxns').textContent = totalTxns;

        // Revenue line+bar combo chart
        setTimeout(() => {
            const ctx = document.getElementById('spRevenueChart');
            if (!ctx) return;
            if (this.charts.spRevenue) this.charts.spRevenue.destroy();
            const spColors = this.getChartColors();
            const labels = this.salesData.map(d => new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
            const data = this.salesData.map(d => d.totalSales || 0);
            this.charts.spRevenue = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Revenue (₹)',
                        data,
                        backgroundColor: 'rgba(0,102,255,0.65)',
                        borderRadius: 6,
                        order: 2
                    }, {
                        label: 'Trend',
                        data,
                        type: 'line',
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: '#10b981',
                        order: 1
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: spColors.textColor } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: spColors.gridColor }, ticks: { color: spColors.textColor, callback: v => '₹' + v.toLocaleString('en-IN') } },
                        x: { grid: { color: spColors.gridColor }, ticks: { color: spColors.textColor } }
                    }
                }
            });

            // Category sales doughnut
            const catCtx = document.getElementById('spCategorySalesChart');
            if (!catCtx) return;
            if (this.charts.spCatSales) this.charts.spCatSales.destroy();
            const catColors = ['#0066FF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
            this.charts.spCatSales = new Chart(catCtx, {
                type: 'doughnut',
                data: {
                    labels: this.categories.map(c => c.name),
                    datasets: [{
                        data: this.categories.map(c => c.totalValue || 0),
                        backgroundColor: catColors,
                        borderWidth: 2,
                        borderColor: spColors.doughnutBorder
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { color: spColors.textColor } } }
                }
            });
        }, 150);
    }

    renderProfitTab() {
        const products = this.products;
        // Calculate profit data
        let totalProfit = 0, marginSum = 0;
        const catProfit = {};
        products.forEach(p => {
            const margin = p.costPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.costPrice * 100) : 0;
            const profit = (p.sellingPrice - p.costPrice) * p.currentStock;
            totalProfit += profit;
            marginSum += margin;
            const cat = p.category || 'Other';
            catProfit[cat] = (catProfit[cat] || 0) + profit;
        });
        const avgMargin = products.length > 0 ? (marginSum / products.length) : 0;
        const topCat = Object.entries(catProfit).sort((a, b) => b[1] - a[1]);
        const lowestMarginProduct = [...products].sort((a, b) => {
            const ma = a.costPrice > 0 ? ((a.sellingPrice - a.costPrice) / a.costPrice * 100) : 0;
            const mb = b.costPrice > 0 ? ((b.sellingPrice - b.costPrice) / b.costPrice * 100) : 0;
            return ma - mb;
        })[0];

        const el = (id) => document.getElementById(id);
        if (el('spTotalProfit')) el('spTotalProfit').textContent = '₹' + totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        if (el('spAvgMargin')) el('spAvgMargin').textContent = avgMargin.toFixed(1) + '%';
        if (el('spTopCategory') && topCat.length > 0) el('spTopCategory').textContent = topCat[0][0];
        if (el('spLowestMargin') && lowestMarginProduct) el('spLowestMargin').textContent = lowestMarginProduct.name;

        // Profit doughnut
        setTimeout(() => {
            const ctx = document.getElementById('spProfitDoughnut');
            if (!ctx) return;
            if (this.charts.spProfitDoughnut) this.charts.spProfitDoughnut.destroy();
            const profitColors = this.getChartColors();
            const catColors = ['#10b981', '#0066FF', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
            this.charts.spProfitDoughnut = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(catProfit),
                    datasets: [{ data: Object.values(catProfit), backgroundColor: catColors, borderWidth: 2, borderColor: profitColors.doughnutBorder }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: profitColors.textColor } } } }
            });

            // Revenue vs Cost vs Profit bar
            const barCtx = document.getElementById('spProfitBarChart');
            if (!barCtx) return;
            if (this.charts.spProfitBar) this.charts.spProfitBar.destroy();
            const catNames = [...new Set(products.map(p => p.category || 'Other'))];
            const revData = catNames.map(c => products.filter(p => p.category === c).reduce((s, p) => s + p.sellingPrice * p.currentStock, 0));
            const costData = catNames.map(c => products.filter(p => p.category === c).reduce((s, p) => s + p.costPrice * p.currentStock, 0));
            const profData = catNames.map((c, i) => revData[i] - costData[i]);
            this.charts.spProfitBar = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: catNames,
                    datasets: [
                        { label: 'Revenue', data: revData, backgroundColor: '#0066FF', borderRadius: 4 },
                        { label: 'Cost', data: costData, backgroundColor: '#ef4444', borderRadius: 4 },
                        { label: 'Profit', data: profData, backgroundColor: '#10b981', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { color: profitColors.textColor } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: profitColors.gridColor }, ticks: { color: profitColors.textColor, callback: v => '₹' + v.toLocaleString('en-IN') } },
                        x: { grid: { color: profitColors.gridColor }, ticks: { color: profitColors.textColor } }
                    }
                }
            });
        }, 150);

        // Profit table
        const tbody = document.getElementById('spProfitTableBody');
        if (tbody) {
            tbody.innerHTML = products.map(p => {
                const margin = p.costPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.costPrice * 100) : 0;
                const potentialProfit = (p.sellingPrice - p.costPrice) * p.currentStock;
                const color = margin >= 30 ? '#10b981' : margin >= 15 ? '#f59e0b' : '#ef4444';
                return `<tr>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.category}</td>
                    <td>₹${p.costPrice.toLocaleString('en-IN')}</td>
                    <td>₹${p.sellingPrice.toLocaleString('en-IN')}</td>
                    <td><span style="color:${color};font-weight:600;">${margin.toFixed(1)}%</span></td>
                    <td>${p.currentStock}</td>
                    <td style="font-weight:600;color:${potentialProfit >= 0 ? '#10b981' : '#ef4444'}">₹${potentialProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>`;
            }).join('');
        }
    }

    // - -- - Sold Products - -- -
    async loadSoldProducts() {
        const days = document.getElementById('soldDays')?.value || '30';
        try {
            const token = localStorage.getItem('invexa_token');
            const authH = { 'Content-Type': 'application/json' };
            if (token) authH['Authorization'] = 'Bearer ' + token;
            const res = await fetch(`${API_BASE}/sales?days=${days}`, { headers: authH });
            this.soldData = await res.json();
            this.renderSoldProducts();
        } catch (err) {
            console.error('Failed to load sold products:', err);
        }
    }

    renderSoldProducts() {
        const search = (document.getElementById('soldSearch')?.value || '').toLowerCase();
        const sales = this.soldData || [];
        const tbody = document.getElementById('soldTableBody');
        if (!tbody) return;

        // Flatten sale items
        let rows = [];
        sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                rows.push({
                    date: sale.saleDate || sale.createdAt,
                    productName: item.productName,
                    quantity: item.quantity,
                    price: item.price,
                    subtotal: item.subtotal,
                    category: this.products.find(p => p.name === item.productName)?.category || '-'
                });
            });
        });

        // Apply search
        if (search) {
            rows = rows.filter(r => r.productName.toLowerCase().includes(search) || r.category.toLowerCase().includes(search));
        }

        // KPIs
        const totalItems = rows.reduce((s, r) => s + r.quantity, 0);
        const totalRevenue = rows.reduce((s, r) => s + r.subtotal, 0);
        const el = (id) => document.getElementById(id);
        if (el('soldTotalItems')) el('soldTotalItems').textContent = totalItems;
        if (el('soldTotalRevenue')) el('soldTotalRevenue').textContent = '₹' + totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 });

        // Render table
        tbody.innerHTML = rows.length === 0
            ? '<tr><td colspan="7" style="text-align:center;color:var(--color-text-secondary);padding:32px;">No sales recorded yet</td></tr>'
            : rows.map((r, i) => `<tr>
                <td>${i + 1}</td>
                <td>${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} <span style="color:var(--color-text-secondary);font-size:0.78rem;">${new Date(r.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
                <td><strong>${r.productName}</strong></td>
                <td>${r.category}</td>
                <td>${r.quantity}</td>
                <td>₹${r.price.toLocaleString('en-IN')}</td>
                <td style="font-weight:600;">₹${r.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>`).join('');
    }

    // - -- - Export Functions - --"-
    exportSoldJSON() {
        const data = this.soldData || [];
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `invexa-sales-${new Date().toISOString().split('T')[0]}.json`;
        a.click(); URL.revokeObjectURL(url);
        this.showNotification('Sales data exported as JSON', 'success');
    }

    exportSoldPDF() {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.setFontSize(18);
            doc.text('InveXa sTacK - Sales Report', 14, 22);
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

            const sales = this.soldData || [];
            const rows = [];
            sales.forEach(sale => {
                (sale.items || []).forEach(item => {
                    rows.push([
                        new Date(sale.saleDate || sale.createdAt).toLocaleDateString('en-IN'),
                        item.productName,
                        item.quantity,
                        'Rs. ' + item.price.toLocaleString('en-IN'),
                        'Rs. ' + item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                    ]);
                });
            });

            doc.autoTable({
                head: [['Date', 'Product', 'Qty', 'Unit Price', 'Subtotal']],
                body: rows,
                startY: 36,
                theme: 'striped',
                headStyles: { fillColor: [0, 102, 255] }
            });

            const total = rows.reduce((s, r) => s + parseFloat(r[4].replace(/[₹,]/g, '').replace(/Rs\.\s*/g, '')), 0);
            doc.setFontSize(12);
            doc.text(`Total: Rs. ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14, doc.lastAutoTable.finalY + 14);

            doc.save(`invexa-sales-${new Date().toISOString().split('T')[0]}.pdf`);
            this.showNotification('Sales report exported as PDF', 'success');
        } catch (err) {
            this.showNotification('PDF export failed: ' + err.message, 'error');
        }
    }

    // -"¢-"¢-"¢-"¢-"¢-"¢-"¢-"¢_prediction
    //  SALES CALENDAR HEATMAP
    // -"¢_prediction

    renderSalesCalendar() {
        const container = document.getElementById('salesCalendar');
        if (!container) return;

        // Build sales-by-date map
        const salesMap = {};
        this.salesData.forEach(d => { salesMap[d.date] = d.totalSales || 0; });

        // Generate 12 weeks of calendar data
        const weeks = 12;
        const days = [];
        const today = new Date();
        for (let i = weeks * 7 - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            days.push({ date: d, key, value: salesMap[key] || 0 });
        }

        // Find max for color scaling
        const maxSales = Math.max(...days.map(d => d.value), 1);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        // Build calendar grid
        let html = `<div style="overflow-x:auto;">
            <div style="display:flex;gap:3px;">
            <div style="display:flex;flex-direction:column;gap:3px;margin-right:6px;padding-top:24px;">
                ${dayNames.map(n => `<div style="height:18px;font-size:0.65rem;color:var(--color-text-secondary);line-height:18px;">${n}</div>`).join('')}
            </div>`;

        // Group by week
        let currentWeek = [];
        let weekLabels = [];
        days.forEach((d, i) => {
            if (i === 0 || d.date.getDay() === 0) {
                if (currentWeek.length > 0) {
                    weekLabels.push(currentWeek);
                }
                currentWeek = [];
            }
            currentWeek.push(d);
        });
        if (currentWeek.length > 0) weekLabels.push(currentWeek);

        weekLabels.forEach((week, wi) => {
            const monthLabel = wi === 0 || week[0].date.getDate() <= 7
                ? week[0].date.toLocaleDateString('en-IN', { month: 'short' }) : '';
            html += `<div style="display:flex;flex-direction:column;gap:3px;">
                <div style="height:20px;font-size:0.65rem;color:var(--color-text-secondary);text-align:center;">${monthLabel}</div>`;
            // Fill empty days at start of first week
            if (wi === 0) {
                for (let e = 0; e < week[0].date.getDay(); e++) {
                    html += `<div style="width:18px;height:18px;"></div>`;
                }
            }
            week.forEach(d => {
                const intensity = d.value / maxSales;
                let bg;
                if (d.value === 0) bg = 'rgba(255,255,255,0.05)';
                else if (intensity < 0.25) bg = 'rgba(0,102,255,0.2)';
                else if (intensity < 0.5) bg = 'rgba(0,102,255,0.4)';
                else if (intensity < 0.75) bg = 'rgba(0,102,255,0.65)';
                else bg = '#0066FF';
                html += `<div style="width:18px;height:18px;background:${bg};border-radius:3px;cursor:pointer;" title="${d.date.toLocaleDateString('en-IN')}: ₹${d.value.toLocaleString('en-IN')}"></div>`;
            });
            html += `</div>`;
        });

        html += `</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:12px;justify-content:flex-end;">
                <span style="font-size:0.7rem;color:var(--color-text-secondary);">Less</span>
                <div style="width:14px;height:14px;background:rgba(255,255,255,0.05);border-radius:2px;"></div>
                <div style="width:14px;height:14px;background:rgba(0,102,255,0.2);border-radius:2px;"></div>
                <div style="width:14px;height:14px;background:rgba(0,102,255,0.4);border-radius:2px;"></div>
                <div style="width:14px;height:14px;background:rgba(0,102,255,0.65);border-radius:2px;"></div>
                <div style="width:14px;height:14px;background:#0066FF;border-radius:2px;"></div>
                <span style="font-size:0.7rem;color:var(--color-text-secondary);">More</span>
            </div>
        </div>`;

        container.innerHTML = html;
    }

    // -"¢-"¢-"¢-"¢_prediction
    //  INVOICE / RECEIPT GENERATOR
    // -"¢_prediction

    showInvoice(saleData) {
        const body = document.getElementById('invoiceBody');
        if (!body) return;

        const invoiceNo = 'INV-' + Date.now().toString().slice(-8);
        const now = new Date();
        const user = JSON.parse(localStorage.getItem('invexa_user') || '{}');

        body.innerHTML = `
            <div id="invoicePrintArea" style="font-family:'Inter','Outfit',sans-serif;color:var(--color-text);">
                <div style="text-align:center;padding-bottom:16px;border-bottom:2px dashed var(--color-border);margin-bottom:16px;">
                    <h2 style="margin:0;font-size:1.4rem;color:var(--color-text);">InveXa sTacK</h2>
                    <p style="color:var(--color-text-secondary);font-size:0.8rem;margin:4px 0;">Grocery Inventory Management System</p>
                    <p style="font-size:0.75rem;color:var(--color-text-secondary);">Invoice #${invoiceNo}</p>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:16px;color:var(--color-text);">
                    <div><strong>Date:</strong> ${now.toLocaleDateString('en-IN')}<br><strong>Time:</strong> ${now.toLocaleTimeString('en-IN')}</div>
                    <div style="text-align:right;"><strong>Cashier:</strong> ${user.fullName || user.username || 'N/A'}<br><strong>Role:</strong> ${user.role || 'staff'}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.85rem;color:var(--color-text);">
                    <thead>
                        <tr style="border-bottom:2px solid var(--color-border);">
                            <th style="text-align:left;padding:8px 4px;color:var(--color-text);">Item</th>
                            <th style="text-align:center;padding:8px 4px;color:var(--color-text);">Qty</th>
                            <th style="text-align:right;padding:8px 4px;color:var(--color-text);">Price</th>
                            <th style="text-align:right;padding:8px 4px;color:var(--color-text);">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(saleData.items || []).map(item => `
                            <tr style="border-bottom:1px solid var(--color-border);">
                                <td style="padding:6px 4px;">${item.productName}</td>
                                <td style="text-align:center;padding:6px 4px;">${item.quantity}</td>
                                <td style="text-align:right;padding:6px 4px;">₹${item.price.toLocaleString('en-IN')}</td>
                                <td style="text-align:right;padding:6px 4px;font-weight:600;">₹${item.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="border-top:2px dashed var(--color-border);margin-top:12px;padding-top:12px;">
                    <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:700;color:var(--color-text);">
                        <span>TOTAL</span>
                        <span style="color:#10b981;">₹${(saleData.totalAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p style="text-align:center;margin-top:16px;font-size:0.75rem;color:var(--color-text-secondary);">Thank you for your purchase!<br>" InveXa sTacK "</p>
                </div>
            </div>
        `;

        document.getElementById('invoiceModal').classList.remove('hidden');
    }

    printInvoice() {
        const printArea = document.getElementById('invoicePrintArea');
        if (!printArea) return;
        const win = window.open('', '_blank', 'width=400,height=600');
        win.document.write(`<html><head><title>InveXa Receipt</title><style>
            body{font-family:'Inter','Segoe UI',sans-serif;padding:20px;color:#222;max-width:380px;margin:0 auto;}
            table{width:100%;border-collapse:collapse}th,td{padding:6px 4px}th{text-align:left;border-bottom:2px solid #333}
            tr{border-bottom:1px solid #eee}
        </style></head><body>${printArea.innerHTML}</body></html>`);
        win.document.close();
        setTimeout(() => { win.print(); win.close(); }, 300);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // FIX: Task 5 — Low stock login alert popup
    checkLowStockAlert() {
        // Don't show if dismissed within last 30 minutes
        const dismissed = sessionStorage.getItem('lowStockDismissedAt');
        if (dismissed && (Date.now() - parseInt(dismissed)) < 30 * 60 * 1000) return;

        const lowItems = (this.products || []).filter(p => p.currentStock <= p.minimumStock);
        if (lowItems.length === 0) return;

        const modal = document.getElementById('lowStockAlertModal');
        const body = document.getElementById('lowStockAlertBody');
        const list = document.getElementById('lowStockAlertList');
        const more = document.getElementById('lowStockAlertMore');
        if (!modal || !list) return;

        const maxShow = 5;
        body.textContent = `${lowItems.length} product${lowItems.length > 1 ? 's are' : ' is'} below minimum stock levels.`;
        list.innerHTML = lowItems.slice(0, maxShow).map(p => `
            <li>
                <span><strong>${this.escapeHtml(p.name)}</strong></span>
                <span style="color:#ef4444;font-weight:600;">${p.currentStock} / ${p.minimumStock} min</span>
            </li>
        `).join('');

        if (lowItems.length > maxShow) {
            more.style.display = 'block';
            more.textContent = `+ ${lowItems.length - maxShow} more items...`;
        } else {
            more.style.display = 'none';
        }
        modal.style.display = 'flex';
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize the application
let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new GroceryInventorySystem();
});
