(function() {
  const state = {
    docket: null,
    lists: { drafts: [], booked: [], quotations: [] },
    customers: []
  };

  const $ = function(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('Missing element: ' + id);
    return el;
  };

  function setStatus(text) { $('status').textContent = text; }
  function money(v) { return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pct(v) { return (Number(v || 0) * 100).toFixed(2) + '%'; }
  function esc(v) { return String(v || '').replace(/[&<>"']/g, function(ch) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' })[ch]; }); }
  function activeId() { return state.docket && state.docket.docketId ? state.docket.docketId : ''; }
  function imgSrc(value) {
    const text = String(value || '').trim();
    const match = text.match(/[-\w]{25,}/);
    if (match) return 'https://drive.google.com/thumbnail?id=' + match[0] + '&sz=w160';
    return text;
  }

  function renderAccount(user) {
    const email = user && user.email ? user.email : '';
    $('accountGlyph').textContent = email ? email.charAt(0).toUpperCase() : '?';
    $('accountChip').title = email || 'Operator account';
  }

  function renderCompanies() {
    $('companySelect').innerHTML = ['AQIML', 'TIFL', 'TIL', 'AQI', 'AQIAU'].map(function(code) {
      return '<option value="' + code + '">' + code + '</option>';
    }).join('');
  }

  function renderCustomers(preferred) {
    $('customerSelect').innerHTML = state.customers.map(function(name) {
      return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
    }).join('');
    if (preferred && state.customers.indexOf(preferred) !== -1) $('customerSelect').value = preferred;
  }

  function renderDrafts(preferredId) {
    $('docketSelect').innerHTML = state.lists.drafts.length
      ? state.lists.drafts.map(function(item) {
          return '<option value="' + esc(item.docketId) + '">' + esc(item.originalSheetName || item.docketId) + ' - ' + esc(item.customerName || 'No customer') + '</option>';
        }).join('')
      : '<option value="">No active draft dockets</option>';
    if (preferredId) $('docketSelect').value = preferredId;
  }

  function renderOverflow(kind) {
    const map = { drafts: 'Draft Dockets', booked: 'Booked Register', quotations: 'Quotations' };
    $('overflowTitle').textContent = map[kind];
    $('overflowList').innerHTML = (state.lists[kind] || []).length
      ? state.lists[kind].map(function(item) {
          return '<div class="overflow-entry"><strong>' + esc(item.originalSheetName || item.docketId) + '</strong><span>' + esc(item.customerName || 'No customer') + '</span><span>' + money(item.grandTotalGross) + '</span></div>';
        }).join('')
      : '<div class="empty">No entries yet.</div>';
    $('overflowPanel').classList.remove('hidden');
    $('overflowMenu').classList.add('hidden');
  }

  function renderDocket(docket) {
    state.docket = docket;
    $('title').value = docket.header.title || '';
    $('docketNumber').value = docket.header.documentNumber || docket.docketId || '';
    $('customerName').value = docket.header.customerName || '';
    $('customerEmail').value = docket.header.customerEmail || '';
    $('orderNumber').value = docket.header.orderNumber || '';
    $('paymentTerms').value = docket.header.paymentTerms || '';
    $('pricingMode').value = docket.header.pricingMode || 'domestic';
    $('originalSheetName').textContent = 'Original sheet: ' + (docket.meta.originalSheetName || '-');
    renderCustomers(docket.header.customerName || '');

    $('lineItems').innerHTML = docket.lines.length ? docket.lines.map(function(line) {
      return [
        '<tr data-line-id="' + esc(line.lineId) + '">',
        '<td>' + esc(line.sortOrder) + '</td>',
        '<td><img class="line-image" src="' + esc(imgSrc(line.imageUrl || '')) + '" alt=""></td>',
        '<td>' + esc(line.productNr) + '</td>',
        '<td><input class="table-input js-line-detail" value="' + esc(line.fullDetail) + '"></td>',
        '<td><input class="table-input js-line-description" value="' + esc(line.description) + '"></td>',
        '<td><input class="table-input js-line-qty" type="number" min="1" step="1" value="' + esc(line.qty) + '"></td>',
        '<td><input class="table-input js-line-price" type="number" min="0" step="0.01" value="' + esc(line.unitPriceInput) + '"></td>',
        '<td>' + money(line.lineTotalGross) + '</td>',
        '<td class="line-actions"><button class="danger compact js-line-delete" type="button">Delete</button></td>',
        '</tr>'
      ].join('');
    }).join('') : '<tr><td colspan="9" class="empty">No line items entered yet.</td></tr>';

    $('subtotal').textContent = money(docket.totals.subtotalNet);
    $('shipping').textContent = money(docket.totals.shippingNet);
    $('vatRateDefault').textContent = pct(docket.header.vatRateDefault);
    $('vatAmount').textContent = money(docket.totals.vatAmount);
    $('grandTotal').textContent = money(docket.totals.grandTotalGross);
  }

  function bindLineEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('#lineItems tr[data-line-id]'), function(tr) {
      const lineId = tr.getAttribute('data-line-id');
      const save = async function() {
        const patch = {
          fullDetail: tr.querySelector('.js-line-detail').value,
          description: tr.querySelector('.js-line-description').value,
          quantity: tr.querySelector('.js-line-qty').value,
          unitPriceInput: tr.querySelector('.js-line-price').value
        };
        const docket = await window.SalesDocketApi.updateDocketLine(activeId(), lineId, patch);
        renderDocket(docket);
        bindLineEvents();
        await refreshLists(activeId());
      };

      ['.js-line-detail', '.js-line-description', '.js-line-qty', '.js-line-price'].forEach(function(sel) {
        tr.querySelector(sel).addEventListener('change', async function() {
          try {
            setStatus('Recalculating line...');
            await save();
            setStatus('Line recalculated.');
          } catch (error) {
            setStatus('Line update failed: ' + error.message);
          }
        });
      });

      tr.querySelector('.js-line-delete').addEventListener('click', async function() {
        try {
          const docket = await window.SalesDocketApi.deleteDocketLine(activeId(), lineId);
          renderDocket(docket);
          bindLineEvents();
          await refreshLists(activeId());
          setStatus('Line deleted.');
        } catch (error) {
          setStatus('Delete failed: ' + error.message);
        }
      });
    });
  }

  function renderSearch(products) {
    $('results').innerHTML = products.length ? [
      '<table class="results-table">',
      '<tbody>',
      products.map(function(product) {
        return [
          '<tr class="result-row">',
          '<td class="result-img-cell"><img class="search-image" src="' + esc(imgSrc(product.imageSrc || product.imageUrl || '')) + '" alt=""></td>',
          '<td class="result-desc-cell">',
          '<div class="pn">' + esc(product.productNr) + '</div>',
          '<div>' + esc(product.description || '') + '</div>',
          '<div class="muted">' + esc(product.variant || '') + '</div>',
          '</td>',
          '<td class="result-meta-cell">',
          '<div class="muted">Stock ' + esc(product.stockLevel) + '</div>',
          '<div class="muted">Net ' + Number(product.unitPriceNet || 0).toFixed(2) + '</div>',
          '</td>',
          '<td class="result-action-cell">',
          '<input class="table-input search-qty js-add-qty" type="number" min="1" step="1" value="1">',
          '<button class="primary compact js-add-product" data-product="' + esc(product.productNr) + '" type="button">Add</button>',
          '</td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody>',
      '</table>'
    ].join('') : '<div class="empty">No matching products found.</div>';

    Array.prototype.forEach.call(document.querySelectorAll('#results .js-add-product'), function(button) {
      button.addEventListener('click', async function() {
        if (!activeId()) return setStatus('Create or select a draft docket first.');
        const qty = button.parentElement.querySelector('.js-add-qty').value;
        try {
          const docket = await window.SalesDocketApi.addDocketLine(activeId(), { productNr: button.dataset.product, quantity: qty });
          renderDocket(docket);
          bindLineEvents();
          await refreshLists(activeId());
          setStatus('Added ' + button.dataset.product + '.');
        } catch (error) {
          setStatus('Add failed: ' + error.message);
        }
      });
    });
  }

  async function refreshLists(preferredId) {
    const data = await Promise.all([
      window.SalesDocketApi.listDockets('draft'),
      window.SalesDocketApi.listDockets('booked'),
      window.SalesDocketApi.listDockets('quotation')
    ]);
    state.lists = { drafts: data[0], booked: data[1], quotations: data[2] };
    renderDrafts(preferredId);
  }

  async function loadSelectedDocket() {
    if (!$('docketSelect').value) return;
    try {
      const docket = await window.SalesDocketApi.loadDocket($('docketSelect').value);
      renderDocket(docket);
      bindLineEvents();
      setStatus('Loaded ' + (docket.meta.originalSheetName || docket.docketId) + '.');
    } catch (error) {
      setStatus('Load failed: ' + error.message);
    }
  }

  async function saveHeader() {
    if (!activeId()) return setStatus('Create or select a draft docket first.');
    const header = {
      title: $('title').value,
      customerName: $('customerName').value,
      customerEmail: $('customerEmail').value,
      orderNumber: $('orderNumber').value,
      paymentTerms: $('paymentTerms').value,
      pricingMode: $('pricingMode').value
    };
    const docket = await window.SalesDocketApi.saveDocketHeader(activeId(), header);
    renderDocket(docket);
    bindLineEvents();
    await refreshLists(activeId());
  }

  async function bootstrap() {
    const data = await window.SalesDocketApi.bootstrap();
    renderAccount(data.currentUser);
    renderCompanies();
    state.customers = data.customers || [];
    renderCustomers('');
    await window.SalesDocketApi.ensureStorage();
    await refreshLists(data.dockets && data.dockets[0] ? data.dockets[0].docketId : '');
    if ($('docketSelect').value) await loadSelectedDocket();
    else setStatus('No draft dockets yet. Create the first docket to begin.');
  }

  $('createDocketBtn').addEventListener('click', async function() {
    try {
      const docket = await window.SalesDocketApi.createDocket({ companyCode: $('companySelect').value, pricingMode: $('pricingMode').value });
      await refreshLists(docket.docketId);
      renderDocket(docket);
      bindLineEvents();
      setStatus('Created ' + (docket.meta.originalSheetName || docket.docketId) + '.');
    } catch (error) {
      setStatus('Create failed: ' + error.message);
    }
  });

  $('saveHeaderBtn').addEventListener('click', async function() {
    try { await saveHeader(); setStatus('Header saved.'); } catch (error) { setStatus('Save failed: ' + error.message); }
  });
  $('pricingMode').addEventListener('change', async function() {
    try { await saveHeader(); setStatus('Pricing mode updated.'); } catch (error) { setStatus('Mode switch failed: ' + error.message); }
  });
  $('docketSelect').addEventListener('change', loadSelectedDocket);
  $('customerSelect').addEventListener('change', async function() {
    if ($('customerSelect').value === '<new customer>') return $('newCustomerForm').classList.remove('hidden');
    $('newCustomerForm').classList.add('hidden');
    try {
      const customer = await window.SalesDocketApi.getCustomerByName($('customerSelect').value);
      $('customerName').value = customer.name || '';
      $('customerEmail').value = customer.email || '';
      await saveHeader();
      setStatus('Customer applied.');
    } catch (error) {
      setStatus('Customer load failed: ' + error.message);
    }
  });
  $('newCustomerBtn').addEventListener('click', function() { $('newCustomerForm').classList.toggle('hidden'); });
  $('saveCustomerBtn').addEventListener('click', async function() {
    try {
      const customer = await window.SalesDocketApi.createCustomer({
        name: $('newCustomerName').value,
        email: $('newCustomerEmail').value,
        phone: $('newCustomerPhone').value,
        address: $('newCustomerAddress').value
      });
      state.customers = await window.SalesDocketApi.listCustomers();
      renderCustomers(customer.name);
      $('customerName').value = customer.name || '';
      $('customerEmail').value = customer.email || '';
      $('newCustomerForm').classList.add('hidden');
      await saveHeader();
      setStatus('Customer saved.');
    } catch (error) {
      setStatus('Customer save failed: ' + error.message);
    }
  });
  $('bookDocketBtn').addEventListener('click', async function() {
    try {
      const docket = await window.SalesDocketApi.bookDocket(activeId());
      renderDocket(docket);
      bindLineEvents();
      await refreshLists('');
      renderOverflow('booked');
      setStatus('Sales booked.');
    } catch (error) {
      setStatus('Book failed: ' + error.message);
    }
  });
  $('saveQuotationBtn').addEventListener('click', async function() {
    try {
      const docket = await window.SalesDocketApi.saveQuotation(activeId());
      renderDocket(docket);
      bindLineEvents();
      await refreshLists('');
      renderOverflow('quotations');
      setStatus('Quotation saved.');
    } catch (error) {
      setStatus('Quotation failed: ' + error.message);
    }
  });
  $('overflowToggleBtn').addEventListener('click', function() { $('overflowMenu').classList.toggle('hidden'); });
  $('showDraftsBtn').addEventListener('click', function() { renderOverflow('drafts'); });
  $('showBookedBtn').addEventListener('click', function() { renderOverflow('booked'); });
  $('showQuotationsBtn').addEventListener('click', function() { renderOverflow('quotations'); });
  $('pingBtn').addEventListener('click', async function() {
    try {
      const data = await window.SalesDocketApi.ping();
      setStatus('Server reachable at ' + new Intl.DateTimeFormat('en-FJ', { timeZone: FIJI_TIME_ZONE, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date(data.at)));
    } catch (error) {
      setStatus('Ping failed: ' + error.message);
    }
  });
  let timer = null;
  $('searchInput').addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(async function() {
      const query = $('searchInput').value.trim();
      if (!query) return $('results').innerHTML = '<div class="empty">Type to search products.</div>';
      try {
        const data = await window.SalesDocketApi.searchProducts(query);
        renderSearch(data.products || []);
        setStatus('Search ready.');
      } catch (error) {
        setStatus('Search failed: ' + error.message);
      }
    }, 120);
  });

  bootstrap().catch(function(error) { setStatus('Bootstrap failed: ' + error.message); });
})();
