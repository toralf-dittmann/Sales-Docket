(function() {
  const state = {
    docket: null,
    currentDraftId: '',
    selectedCompany: 'AQIML',
    showAllCompanies: false,
    registerTab: 'sales',
    lists: { drafts: [], booked: [], quotations: [] },
    customers: []
  };
  let priceModeResolver = null;
  let searchTimer = null;
  let statusTimer = null;
  let autoSaveTimer = null;
  let customerTimer = null;

  const $ = function(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('Missing element: ' + id);
    return el;
  };

  function applyStatusTone(highlight) {
    const el = $('status');
    if (highlight) {
      el.classList.add('status-fresh');
      el.style.color = '#e2008a';
      el.style.backgroundColor = '#fff8fc';
      el.style.borderColor = 'rgba(226, 0, 138, 0.22)';
      return;
    }

    el.classList.remove('status-fresh');
    el.style.color = '#1f2933';
    el.style.backgroundColor = '#f1f3f4';
    el.style.borderColor = '#d8dee4';
  }

  function setStatus(text, options) {
    const el = $('status');
    const settings = options || {};
    const highlight = settings.highlight !== false;
    const holdMs = settings.holdMs || 5000;

    el.textContent = text;
    applyStatusTone(highlight);

    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }

    if (highlight) {
      statusTimer = setTimeout(function() {
        applyStatusTone(false);
        statusTimer = null;
      }, holdMs);
    }
  }

  function money(v) {
    return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function amount(v) {
    return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function pct(v) {
    return (Number(v || 0) * 100).toFixed(2) + '%';
  }

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function activeId() {
    return state.docket && state.docket.docketId ? state.docket.docketId : '';
  }

  function getDomesticRate() {
    if (state.docket && state.docket.header) {
      return Number(state.docket.header.standardDomesticVatRate || state.docket.header.vatRateDefault || 0);
    }
    return 0.15;
  }

  function imgSrc(value) {
    const text = String(value || '').trim();
    const match = text.match(/[-\w]{25,}/);
    if (match) return 'https://drive.google.com/thumbnail?id=' + match[0] + '&sz=w160';
    if (text) return text;
    return "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='46' height='46'%3E%3Crect width='100%25' height='100%25' rx='8' fill='%23f0f4f4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='9' fill='%2390a4a7'%3ENo image%3C/text%3E%3C/svg%3E";
  }

  function setButtonBusy(button, busy, busyText, idleText) {
    if (!button) return;
    if (!button.dataset.idleText) button.dataset.idleText = idleText || button.textContent;
    button.disabled = !!busy;
    button.textContent = busy ? (busyText || button.dataset.idleText) : button.dataset.idleText;
  }

  async function runButtonAction(button, busyText, fn) {
    try {
      setButtonBusy(button, true, busyText);
      return await fn();
    } finally {
      setButtonBusy(button, false);
    }
  }

  function chooseExportPriceMode() {
    $('priceModeModal').classList.remove('hidden');
    return new Promise(function(resolve) {
      priceModeResolver = resolve;
    });
  }

  function closePriceMode(choice) {
    $('priceModeModal').classList.add('hidden');
    if (priceModeResolver) {
      const resolve = priceModeResolver;
      priceModeResolver = null;
      resolve(choice);
    }
  }

  function renderAccount(user) {
    const email = user && user.email ? user.email : '';
    $('accountGlyph').textContent = email ? email.charAt(0).toUpperCase() : '?';
    $('accountChip').title = email || 'Operator account';
  }

  function filterRowsBySelectedCompany(rows) {
    return (rows || []).filter(function(item) {
      return String(item.companyCode || '').trim().toUpperCase() === state.selectedCompany;
    });
  }

  function companyFilteredRows(rows) {
    if (state.showAllCompanies) return rows || [];
    return filterRowsBySelectedCompany(rows);
  }

  function renderCompanies() {
    const companies = ['AQIML', 'TIFL', 'TIL', 'AQI', 'AQIAU'];
    $('companyTabs').innerHTML = companies.map(function(code) {
      return '<button class="company-tab' + (code === state.selectedCompany ? ' is-active' : '') + '" data-company="' + code + '" type="button">' + code + '</button>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('#companyTabs .company-tab'), function(button) {
      button.addEventListener('click', function() {
        state.selectedCompany = button.getAttribute('data-company');
        state.currentDraftId = '';
        renderCompanies();
        renderDrafts('');
        renderRegister();
        renderEmptyDocketState('Select a draft docket or create a new one for ' + state.selectedCompany + '.');
        setStatus('Company switched to ' + state.selectedCompany + '.');
      });
    });
  }

  function renderCustomerMatches(preferredQuery) {
    const query = String(preferredQuery || '').trim().toLowerCase();
    const matches = state.customers
      .filter(function(name) { return name && name !== '<new customer>'; })
      .filter(function(name) {
        return !query || name.toLowerCase().indexOf(query) !== -1;
      })
      .slice(0, 25);

    $('customerResults').innerHTML = matches.length
      ? matches.map(function(name) {
          return '<button class="lookup-row" data-customer="' + esc(name) + '" type="button">' + esc(name) + '</button>';
        }).join('')
      : '<div class="empty">No matching customers.</div>';

    $('customerResults').classList.toggle('hidden', !matches.length);

    Array.prototype.forEach.call(document.querySelectorAll('#customerResults .lookup-row'), function(button) {
      button.addEventListener('click', async function() {
        const name = button.getAttribute('data-customer');
        try {
          setStatus('Loading customer ' + name + '...', { highlight: false });
          const customer = await window.SalesDocketApi.getCustomerByName(name);
          $('customerSearch').value = customer.name || '';
          $('customerEmail').value = customer.email || '';
          $('customerResults').classList.add('hidden');
          await saveHeader();
          setStatus('Customer applied.');
        } catch (error) {
          setStatus('Customer load failed: ' + error.message, { highlight: false });
        }
      });
    });
  }

  function renderDrafts(preferredId) {
    const drafts = filterRowsBySelectedCompany(state.lists.drafts);
    $('docketSelect').innerHTML = drafts.length
      ? ['<option value="">Select a draft docket</option>'].concat(drafts.map(function(item) {
          return '<option value="' + esc(item.docketId) + '">' + esc(item.originalSheetName || item.docketId) + ' - ' + esc(item.customerName || 'No customer') + '</option>';
        })).join('')
      : '<option value="">No active draft dockets</option>';

    if (preferredId && drafts.some(function(item) { return item.docketId === preferredId; })) {
      $('docketSelect').value = preferredId;
      state.currentDraftId = preferredId;
    } else {
      $('docketSelect').value = '';
      state.currentDraftId = '';
    }
  }

  function renderRegister() {
    const tab = state.registerTab === 'quotations' ? 'quotations' : 'booked';
    const rows = companyFilteredRows(tab === 'booked' ? state.lists.booked : state.lists.quotations);
    $('salesTabBtn').classList.toggle('is-active', tab === 'booked');
    $('quotationsTabBtn').classList.toggle('is-active', tab === 'quotations');
    $('registerNumberLabel').textContent = tab === 'booked' ? 'Sales #' : 'Quotation #';

    $('registerRows').innerHTML = rows.length ? rows.map(function(item) {
      const number = tab === 'booked' ? (item.documentNumber || '-') : (item.quotationNumber || '-');
      return [
        '<tr data-docket-id="' + esc(item.docketId) + '" data-kind="' + esc(tab) + '">',
        '<td class="number-cell">' + esc(number) + '</td>',
        '<td>' + esc(item.originalSheetName || item.docketId) + '</td>',
        '<td>' + esc(item.customerName || '') + '</td>',
        '<td>' + esc(item.updatedAt || item.createdAt || '') + '</td>',
        '<td class="amount-cell">' + money(item.grandTotalGross) + '</td>',
        '</tr>'
      ].join('');
    }).join('') : '<tr><td colspan="5" class="empty">No ' + (tab === 'booked' ? 'sales' : 'quotations') + ' yet.</td></tr>';

    Array.prototype.forEach.call(document.querySelectorAll('#registerRows tr[data-docket-id]'), function(row) {
      row.addEventListener('click', async function() {
        const docketId = row.getAttribute('data-docket-id');
        const kind = row.getAttribute('data-kind');
        if (kind === 'quotations') {
          if (!state.currentDraftId) {
            setStatus('Select or create a draft docket first so the quotation has somewhere to load.');
            return;
          }
          try {
            setStatus('Restoring quotation...');
            const docket = await window.SalesDocketApi.restoreQuotation(state.currentDraftId, docketId);
            syncCurrentDocket(docket);
            await refreshLists(state.currentDraftId);
            setStatus('Quotation restored into ' + (docket.meta.originalSheetName || docket.docketId) + '.');
          } catch (error) {
            setStatus('Quotation restore failed: ' + error.message, { highlight: false });
          }
          return;
        }

        try {
          setStatus('Loading sales docket ' + (row.cells[1] ? row.cells[1].textContent : docketId) + '...', { highlight: false });
          const docket = await window.SalesDocketApi.loadDocket(docketId);
          renderDocket(docket);
          bindLineEvents();
          setStatus('Showing booked docket read only.');
        } catch (error) {
          setStatus('Booked docket load failed: ' + error.message, { highlight: false });
        }
      });
    });
  }

  function renderEmptyDocketState(message) {
    state.docket = null;
    $('title').value = '';
    $('docketNumber').value = '';
    $('quotationNumber').textContent = '-';
    $('customerSearch').value = '';
    $('customerEmail').value = '';
    $('orderNumber').value = '';
    $('paymentTerms').value = '';
    $('pricingMode').value = 'domestic';
    $('originalSheetName').textContent = 'Original sheet: -';
    $('docketStatusText').textContent = message || 'No docket loaded';
    $('customerResults').classList.add('hidden');
    $('lineItems').innerHTML = '<tr><td colspan="10" class="empty">No docket loaded yet.</td></tr>';
    $('subtotal').textContent = money(0);
    $('shipping').textContent = money(0);
    $('vatRateDefault').textContent = pct(0);
    $('vatAmount').textContent = money(0);
    $('grandTotal').textContent = money(0);
    setDocketInteractivity(null);
  }

  function setDocketInteractivity(docket) {
    const readOnly = !docket || docket.readOnly;
    ['title', 'customerSearch', 'customerEmail', 'orderNumber', 'paymentTerms', 'pricingMode'].forEach(function(id) {
      $(id).disabled = readOnly;
    });
    $('saveQuotationBtn').disabled = readOnly;
    $('bookDocketBtn').disabled = readOnly;
  }

  function renderDocket(docket) {
    state.docket = docket;
    $('title').value = docket.header.title || '';
    $('docketNumber').value = docket.header.documentNumber || docket.docketId || '';
    $('quotationNumber').textContent = docket.header.quotationNumber || '-';
    $('customerSearch').value = docket.header.customerName || '';
    $('customerEmail').value = docket.header.customerEmail || '';
    $('orderNumber').value = docket.header.orderNumber || '';
    $('paymentTerms').value = docket.header.paymentTerms || '';
    $('pricingMode').value = docket.header.pricingMode || 'domestic';
    $('originalSheetName').textContent = 'Original sheet: ' + (docket.meta.originalSheetName || '-');
    $('docketStatusText').textContent = docket.status || 'draft';
    $('customerResults').classList.add('hidden');
    setDocketInteractivity(docket);

    $('lineItems').innerHTML = docket.lines.length ? docket.lines.map(function(line) {
      const imageCell = '<img class="line-image" src="' + esc(imgSrc(line.imageUrl || '')) + '" alt="" onerror="this.onerror=null;this.src=\'' + imgSrc('') + '\'">';
      const descCell = docket.readOnly
        ? '<span class="cell-value">' + esc(line.description) + '</span>'
        : '<textarea class="table-input description-input js-line-description" rows="2">' + esc(line.description) + '</textarea>';
      const qtyCell = docket.readOnly
        ? '<span class="cell-value">' + esc(line.qty) + '</span>'
        : '<input class="table-input js-line-qty" type="number" min="1" step="1" value="' + esc(line.qty) + '">';
      const priceCell = docket.readOnly
        ? '<span class="cell-value">' + amount(line.unitPriceInput) + '</span>'
        : '<input class="table-input js-line-price" type="number" min="0" step="0.01" value="' + esc(line.unitPriceInput) + '">';
      const actionCell = docket.readOnly
        ? '<span class="cell-value">Read only</span>'
        : '<button class="danger compact js-line-delete" type="button">Delete</button>';

      return [
        '<tr class="' + (docket.readOnly ? 'read-only-row' : '') + '" data-line-id="' + esc(line.lineId) + '">',
        '<td>' + esc(line.sortOrder) + '</td>',
        '<td>' + imageCell + '</td>',
        '<td>' + esc(line.productNr) + '</td>',
        '<td class="description-cell">' + descCell + '</td>',
        '<td>' + qtyCell + '</td>',
        '<td>' + priceCell + '</td>',
        '<td>' + amount(line.unitPriceNet) + '</td>',
        '<td>' + amount(line.unitPriceGross) + '</td>',
        '<td>' + money(line.lineTotalGross) + '</td>',
        '<td class="line-actions">' + actionCell + '</td>',
        '</tr>'
      ].join('');
    }).join('') : '<tr><td colspan="10" class="empty">No line items entered yet.</td></tr>';

    $('subtotal').textContent = money(docket.totals.subtotalNet);
    $('shipping').textContent = money(docket.totals.shippingNet);
    $('vatRateDefault').textContent = pct(docket.header.displayVatRate || docket.header.vatRateDefault || 0);
    $('vatAmount').textContent = money(docket.totals.vatAmount);
    $('grandTotal').textContent = money(docket.totals.grandTotalGross);
  }

  function syncCurrentDocket(docket) {
    if (docket && docket.status === 'draft') state.currentDraftId = docket.docketId;
    renderDocket(docket);
    bindLineEvents();
  }

  function bindLineEvents() {
    if (!state.docket || state.docket.readOnly) return;

    Array.prototype.forEach.call(document.querySelectorAll('#lineItems tr[data-line-id]'), function(tr) {
      const lineId = tr.getAttribute('data-line-id');
      const save = async function() {
        const line = state.docket.lines.find(function(item) { return item.lineId === lineId; }) || {};
        let unitPriceInput = tr.querySelector('.js-line-price').value;
        if (state.docket.header.pricingMode === 'export' && !line.isTaxExempt) {
          const entered = Number(unitPriceInput || 0);
          if (isFinite(entered) && entered > 0) {
            $('priceModeModalText').textContent = 'For export mode, decide whether ' + amount(entered) + ' is VIP inclusive or already VEP / net.';
            const mode = await chooseExportPriceMode();
            if (mode === 'inclusive') {
              const rate = getDomesticRate();
              if (rate > 0) {
                unitPriceInput = (Math.round((entered / (1 + rate)) * 100) / 100).toFixed(2);
                tr.querySelector('.js-line-price').value = unitPriceInput;
                setStatus('Export mode: VIP converted to VEP.');
              }
            } else {
              setStatus('Export mode: entered price kept as VEP.');
            }
          }
        }

        const patch = {
          description: tr.querySelector('.js-line-description').value,
          quantity: tr.querySelector('.js-line-qty').value,
          unitPriceInput: unitPriceInput
        };
        const docket = await window.SalesDocketApi.updateDocketLine(activeId(), lineId, patch);
        syncCurrentDocket(docket);
      };

      ['.js-line-description', '.js-line-qty', '.js-line-price'].forEach(function(sel) {
        tr.querySelector(sel).addEventListener('change', async function() {
          try {
            setStatus('Recalculating line...', { highlight: false });
            await save();
            setStatus('Line recalculated.');
          } catch (error) {
            setStatus('Line update failed: ' + error.message, { highlight: false });
          }
        });
      });

      tr.querySelector('.js-line-delete').addEventListener('click', async function() {
        try {
          setStatus('Deleting line...', { highlight: false });
          const docket = await window.SalesDocketApi.deleteDocketLine(activeId(), lineId);
          syncCurrentDocket(docket);
          setStatus('Line deleted.');
        } catch (error) {
          setStatus('Delete failed: ' + error.message, { highlight: false });
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
          '<tr class="result-row" data-product="' + esc(product.productNr) + '">',
          '<td class="result-img-cell"><img class="search-image" src="' + esc(imgSrc(product.imageSrc || product.imageUrl || '')) + '" alt="" onerror="this.onerror=null;this.src=\'' + imgSrc('') + '\'"></td>',
          '<td class="result-desc-cell">',
          '<div class="pn">' + esc(product.productNr) + '</div>',
          '<div>' + esc(product.description || '') + '</div>',
          '<div class="muted">' + esc(product.variant || '') + '</div>',
          '</td>',
          '<td class="result-meta-cell">',
          '<div class="muted">Stock ' + esc(product.stockLevel) + '</div>',
          '<div class="muted">VEP ' + amount(product.unitPriceNet || 0) + '</div>',
          '<div class="muted">VIP ' + amount(Number(product.unitPriceNet || 0) * (1 + getDomesticRate())) + '</div>',
          '</td>',
          '</tr>'
        ].join('');
      }).join(''),
      '</tbody>',
      '</table>'
    ].join('') : '<div class="empty">No matching products found.</div>';

    Array.prototype.forEach.call(document.querySelectorAll('#results .result-row'), function(row) {
      row.addEventListener('click', async function() {
        if (!state.currentDraftId) {
          setStatus('Create or select a draft docket first.');
          return;
        }
        try {
          row.classList.add('result-row-busy');
          setStatus('Adding ' + row.getAttribute('data-product') + '...', { highlight: false });
          const docket = await window.SalesDocketApi.addDocketLine(state.currentDraftId, { productNr: row.getAttribute('data-product'), quantity: 1 });
          syncCurrentDocket(docket);
          setStatus('Added ' + row.getAttribute('data-product') + '.');
        } catch (error) {
          setStatus('Add failed: ' + error.message, { highlight: false });
        } finally {
          row.classList.remove('result-row-busy');
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
    renderDrafts(preferredId || state.currentDraftId);
    renderRegister();
  }

  async function loadSelectedDocket() {
    const docketId = $('docketSelect').value;
    if (!docketId) {
      state.currentDraftId = '';
      renderEmptyDocketState('Select a draft docket or create a new one for ' + state.selectedCompany + '.');
      setStatus('No draft docket selected.', { highlight: false });
      return;
    }
    state.currentDraftId = docketId;
    try {
      const selectedLabel = $('docketSelect').selectedOptions[0] ? $('docketSelect').selectedOptions[0].textContent : docketId;
      setStatus('Loading sales docket ' + selectedLabel + '...', { highlight: false });
      const docket = await window.SalesDocketApi.loadDocket(docketId);
      syncCurrentDocket(docket);
      setStatus('Loaded ' + (docket.meta.originalSheetName || docket.docketId) + '.');
    } catch (error) {
      setStatus('Load failed: ' + error.message, { highlight: false });
    }
  }

  async function saveHeader() {
    if (!state.currentDraftId) {
      setStatus('Create or select a draft docket first.', { highlight: false });
      return null;
    }
    const header = {
      title: $('title').value,
      customerName: $('customerSearch').value,
      customerEmail: $('customerEmail').value,
      orderNumber: $('orderNumber').value,
      paymentTerms: $('paymentTerms').value,
      pricingMode: $('pricingMode').value
    };
    const docket = await window.SalesDocketApi.saveDocketHeader(state.currentDraftId, header);
    syncCurrentDocket(docket);
    return docket;
  }

  function queueAutoSave(message) {
    if (!state.currentDraftId || !state.docket || state.docket.readOnly) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async function() {
      try {
        setStatus(message || 'Saving changes...', { highlight: false });
        await saveHeader();
        setStatus('Changes saved.');
      } catch (error) {
        setStatus('Autosave failed: ' + error.message, { highlight: false });
      } finally {
        autoSaveTimer = null;
      }
    }, 200);
  }

  async function bootstrap() {
    setStatus('Loading Sales Docket application...', { highlight: false });
    const data = await window.SalesDocketApi.bootstrap();
    renderAccount(data.currentUser);
    renderCompanies();
    state.customers = data.customers || [];
    setStatus('Preparing Sales Docket storage...', { highlight: false });
    await window.SalesDocketApi.ensureStorage();
    setStatus('Loading draft dockets...', { highlight: false });
    await refreshLists('');
    renderEmptyDocketState('Select a company and choose or create a docket.');
    setStatus('Choose a company to begin.');
  }

  $('createDocketBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Creating...', async function() {
        const docket = await window.SalesDocketApi.createDocket({
          companyCode: state.selectedCompany,
          pricingMode: $('pricingMode').value
        });
        state.currentDraftId = docket.docketId;
        await refreshLists(docket.docketId);
        syncCurrentDocket(docket);
        setStatus('Created ' + (docket.meta.originalSheetName || docket.docketId) + '.');
      });
    } catch (error) {
      setStatus('Create failed: ' + error.message, { highlight: false });
    }
  });

  $('pricingMode').addEventListener('change', async function() {
    try {
      setStatus('Switching pricing mode...', { highlight: false });
      const docket = await saveHeader();
      if (docket) setStatus('Pricing mode updated and VAT recalculated.');
    } catch (error) {
      setStatus('Mode switch failed: ' + error.message, { highlight: false });
    }
  });

  ['title', 'customerEmail', 'orderNumber', 'paymentTerms'].forEach(function(id) {
    $(id).addEventListener('change', function() {
      queueAutoSave('Saving changes to sales docket...');
    });
  });

  $('customerSearch').addEventListener('input', function() {
    clearTimeout(customerTimer);
    customerTimer = setTimeout(function() {
      renderCustomerMatches($('customerSearch').value);
    }, 80);
  });

  $('customerSearch').addEventListener('focus', function() {
    renderCustomerMatches($('customerSearch').value);
  });

  $('customerSearch').addEventListener('change', function() {
    $('customerResults').classList.add('hidden');
    queueAutoSave('Saving customer details...');
  });

  $('docketSelect').addEventListener('change', loadSelectedDocket);

  $('newCustomerBtn').addEventListener('click', function() {
    $('newCustomerForm').classList.toggle('hidden');
  });

  $('saveCustomerBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Saving...', async function() {
        const customer = await window.SalesDocketApi.createCustomer({
          name: $('newCustomerName').value,
          email: $('newCustomerEmail').value,
          phone: $('newCustomerPhone').value,
          address: $('newCustomerAddress').value
        });
        state.customers = await window.SalesDocketApi.listCustomers();
        $('customerSearch').value = customer.name || '';
        $('customerEmail').value = customer.email || '';
        $('newCustomerForm').classList.add('hidden');
        await saveHeader();
        setStatus('Customer saved.');
      });
    } catch (error) {
      setStatus('Customer save failed: ' + error.message, { highlight: false });
    }
  });

  $('bookDocketBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Booking...', async function() {
        setStatus('Booking sales docket ' + ($('originalSheetName').textContent.replace('Original sheet: ', '') || activeId()) + '...', { highlight: false });
        const result = await window.SalesDocketApi.bookDocket(activeId());
        syncCurrentDocket(result.activeDocket);
        await refreshLists(result.activeDocket.docketId);
        state.registerTab = 'sales';
        renderRegister();
        setStatus('Sales booked as ' + (result.registerDocket.header.documentNumber || 'new docket') + '.');
      });
    } catch (error) {
      setStatus('Book failed: ' + error.message, { highlight: false });
    }
  });

  $('saveQuotationBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Saving...', async function() {
        setStatus('Saving quotation for ' + ($('originalSheetName').textContent.replace('Original sheet: ', '') || activeId()) + '...', { highlight: false });
        const result = await window.SalesDocketApi.saveQuotation(activeId());
        syncCurrentDocket(result.activeDocket);
        await refreshLists(result.activeDocket.docketId);
        state.registerTab = 'quotations';
        renderRegister();
        setStatus('Quotation saved as ' + (result.registerDocket.header.quotationNumber || 'new quotation') + '.');
      });
    } catch (error) {
      setStatus('Quotation failed: ' + error.message, { highlight: false });
    }
  });

  $('salesTabBtn').addEventListener('click', function() {
    state.registerTab = 'sales';
    renderRegister();
  });

  $('quotationsTabBtn').addEventListener('click', function() {
    state.registerTab = 'quotations';
    renderRegister();
  });

  $('showAllCompanies').addEventListener('change', function() {
    state.showAllCompanies = $('showAllCompanies').checked;
    renderRegister();
    setStatus(state.showAllCompanies ? 'Showing activities for all companies.' : 'Showing activities for ' + state.selectedCompany + '.');
  });

  $('pingBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Pinging...', async function() {
        const data = await window.SalesDocketApi.ping();
        setStatus('Server reachable at ' + new Intl.DateTimeFormat('en-FJ', {
          timeZone: FIJI_TIME_ZONE,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date(data.at)));
      });
    } catch (error) {
      setStatus('Ping failed: ' + error.message, { highlight: false });
    }
  });

  $('priceModeExclusiveBtn').addEventListener('click', function() {
    closePriceMode('exclusive');
  });

  $('priceModeInclusiveBtn').addEventListener('click', function() {
    closePriceMode('inclusive');
  });

  $('priceModeModal').addEventListener('click', function(event) {
    if (event.target === $('priceModeModal')) closePriceMode('exclusive');
  });

  $('searchInput').addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async function() {
      const query = $('searchInput').value.trim();
      if (!query) {
        $('results').innerHTML = '<div class="empty">Type to search products.</div>';
        return;
      }
      try {
        setStatus('Searching products for "' + query + '"...', { highlight: false });
        const data = await window.SalesDocketApi.searchProducts(query);
        renderSearch(data.products || []);
        setStatus((data.products || []).length + ' search results ready.');
      } catch (error) {
        setStatus('Search failed: ' + error.message, { highlight: false });
      }
    }, 120);
  });

  bootstrap().catch(function(error) {
    setStatus('Bootstrap failed: ' + error.message, { highlight: false });
  });
})();
