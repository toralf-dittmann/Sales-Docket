(function() {
  const state = {
    docket: null,
    currentDraftId: '',
    registerTab: 'sales',
    lists: { drafts: [], booked: [], quotations: [] },
    customers: []
  };
  let priceModeResolver = null;
  let searchTimer = null;

  const $ = function(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('Missing element: ' + id);
    return el;
  };

  function setStatus(text) {
    $('status').textContent = text;
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
    const drafts = state.lists.drafts || [];
    $('docketSelect').innerHTML = drafts.length
      ? drafts.map(function(item) {
          return '<option value="' + esc(item.docketId) + '">' + esc(item.originalSheetName || item.docketId) + ' - ' + esc(item.customerName || 'No customer') + '</option>';
        }).join('')
      : '<option value="">No active draft dockets</option>';

    if (preferredId && drafts.some(function(item) { return item.docketId === preferredId; })) {
      $('docketSelect').value = preferredId;
      state.currentDraftId = preferredId;
    } else if ($('docketSelect').value) {
      state.currentDraftId = $('docketSelect').value;
    } else {
      state.currentDraftId = '';
    }
  }

  function renderRegister() {
    const tab = state.registerTab === 'quotations' ? 'quotations' : 'booked';
    const rows = tab === 'booked' ? state.lists.booked : state.lists.quotations;
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
            setStatus('Quotation restore failed: ' + error.message);
          }
          return;
        }

        try {
          setStatus('Loading booked sale...');
          const docket = await window.SalesDocketApi.loadDocket(docketId);
          renderDocket(docket);
          bindLineEvents();
          setStatus('Showing booked docket read only.');
        } catch (error) {
          setStatus('Booked docket load failed: ' + error.message);
        }
      });
    });
  }

  function setDocketInteractivity(docket) {
    const readOnly = !docket || docket.readOnly;
    ['title', 'customerEmail', 'orderNumber', 'paymentTerms', 'pricingMode'].forEach(function(id) {
      $(id).disabled = readOnly;
    });
    $('saveHeaderBtn').disabled = readOnly;
    $('saveQuotationBtn').disabled = readOnly;
    $('bookDocketBtn').disabled = readOnly;
  }

  function renderDocket(docket) {
    state.docket = docket;
    $('title').value = docket.header.title || '';
    $('docketNumber').value = docket.header.documentNumber || docket.docketId || '';
    $('quotationNumber').textContent = docket.header.quotationNumber || '-';
    $('customerName').value = docket.header.customerName || '';
    $('customerEmail').value = docket.header.customerEmail || '';
    $('orderNumber').value = docket.header.orderNumber || '';
    $('paymentTerms').value = docket.header.paymentTerms || '';
    $('pricingMode').value = docket.header.pricingMode || 'domestic';
    $('originalSheetName').textContent = 'Original sheet: ' + (docket.meta.originalSheetName || '-');
    $('docketStatusText').textContent = docket.status || 'draft';
    $('vatRateDefaultInline').textContent = pct(docket.header.displayVatRate || docket.header.vatRateDefault || 0);
    renderCustomers(docket.header.customerName || '');
    setDocketInteractivity(docket);

    $('lineItems').innerHTML = docket.lines.length ? docket.lines.map(function(line) {
      const imageCell = '<img class="line-image" src="' + esc(imgSrc(line.imageUrl || '')) + '" alt="" onerror="this.onerror=null;this.src=\'' + imgSrc('') + '\'">';
      const detailCell = docket.readOnly
        ? '<span class="cell-value">' + esc(line.fullDetail) + '</span>'
        : '<input class="table-input js-line-detail" value="' + esc(line.fullDetail) + '">';
      const descCell = docket.readOnly
        ? '<span class="cell-value">' + esc(line.description) + '</span>'
        : '<input class="table-input js-line-description" value="' + esc(line.description) + '">';
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
        '<td>' + detailCell + '</td>',
        '<td>' + descCell + '</td>',
        '<td>' + qtyCell + '</td>',
        '<td>' + priceCell + '</td>',
        '<td>' + amount(line.unitPriceNet) + '</td>',
        '<td>' + amount(line.unitPriceGross) + '</td>',
        '<td>' + money(line.lineTotalGross) + '</td>',
        '<td class="line-actions">' + actionCell + '</td>',
        '</tr>'
      ].join('');
    }).join('') : '<tr><td colspan="11" class="empty">No line items entered yet.</td></tr>';

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
          fullDetail: tr.querySelector('.js-line-detail').value,
          description: tr.querySelector('.js-line-description').value,
          quantity: tr.querySelector('.js-line-qty').value,
          unitPriceInput: unitPriceInput
        };
        const docket = await window.SalesDocketApi.updateDocketLine(activeId(), lineId, patch);
        syncCurrentDocket(docket);
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
          setStatus('Deleting line...');
          const docket = await window.SalesDocketApi.deleteDocketLine(activeId(), lineId);
          syncCurrentDocket(docket);
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
          setStatus('Adding ' + row.getAttribute('data-product') + '...');
          const docket = await window.SalesDocketApi.addDocketLine(state.currentDraftId, { productNr: row.getAttribute('data-product'), quantity: 1 });
          syncCurrentDocket(docket);
          setStatus('Added ' + row.getAttribute('data-product') + '.');
        } catch (error) {
          setStatus('Add failed: ' + error.message);
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
    if (!docketId) return;
    state.currentDraftId = docketId;
    try {
      const docket = await window.SalesDocketApi.loadDocket(docketId);
      syncCurrentDocket(docket);
      setStatus('Loaded ' + (docket.meta.originalSheetName || docket.docketId) + '.');
    } catch (error) {
      setStatus('Load failed: ' + error.message);
    }
  }

  async function saveHeader() {
    if (!state.currentDraftId) {
      setStatus('Create or select a draft docket first.');
      return null;
    }
    const header = {
      title: $('title').value,
      customerName: $('customerName').value,
      customerEmail: $('customerEmail').value,
      orderNumber: $('orderNumber').value,
      paymentTerms: $('paymentTerms').value,
      pricingMode: $('pricingMode').value
    };
    const docket = await window.SalesDocketApi.saveDocketHeader(state.currentDraftId, header);
    syncCurrentDocket(docket);
    return docket;
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
    const button = this;
    try {
      await runButtonAction(button, 'Creating...', async function() {
        const docket = await window.SalesDocketApi.createDocket({
          companyCode: $('companySelect').value,
          pricingMode: $('pricingMode').value
        });
        state.currentDraftId = docket.docketId;
        await refreshLists(docket.docketId);
        syncCurrentDocket(docket);
        setStatus('Created ' + (docket.meta.originalSheetName || docket.docketId) + '.');
      });
    } catch (error) {
      setStatus('Create failed: ' + error.message);
    }
  });

  $('saveHeaderBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Saving...', async function() {
        await saveHeader();
        setStatus('Header saved.');
      });
    } catch (error) {
      setStatus('Save failed: ' + error.message);
    }
  });

  $('pricingMode').addEventListener('change', async function() {
    try {
      const docket = await saveHeader();
      if (docket) setStatus('Pricing mode updated and VAT recalculated.');
    } catch (error) {
      setStatus('Mode switch failed: ' + error.message);
    }
  });

  $('docketSelect').addEventListener('change', loadSelectedDocket);

  $('customerSelect').addEventListener('change', async function() {
    if ($('customerSelect').value === '<new customer>') {
      $('newCustomerForm').classList.remove('hidden');
      return;
    }
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
        renderCustomers(customer.name);
        $('customerName').value = customer.name || '';
        $('customerEmail').value = customer.email || '';
        $('newCustomerForm').classList.add('hidden');
        await saveHeader();
        setStatus('Customer saved.');
      });
    } catch (error) {
      setStatus('Customer save failed: ' + error.message);
    }
  });

  $('bookDocketBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Booking...', async function() {
        const result = await window.SalesDocketApi.bookDocket(activeId());
        syncCurrentDocket(result.activeDocket);
        await refreshLists(result.activeDocket.docketId);
        state.registerTab = 'sales';
        renderRegister();
        setStatus('Sales booked as ' + (result.registerDocket.header.documentNumber || 'new docket') + '.');
      });
    } catch (error) {
      setStatus('Book failed: ' + error.message);
    }
  });

  $('saveQuotationBtn').addEventListener('click', async function() {
    const button = this;
    try {
      await runButtonAction(button, 'Saving...', async function() {
        const result = await window.SalesDocketApi.saveQuotation(activeId());
        syncCurrentDocket(result.activeDocket);
        await refreshLists(result.activeDocket.docketId);
        state.registerTab = 'quotations';
        renderRegister();
        setStatus('Quotation saved as ' + (result.registerDocket.header.quotationNumber || 'new quotation') + '.');
      });
    } catch (error) {
      setStatus('Quotation failed: ' + error.message);
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
      setStatus('Ping failed: ' + error.message);
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
        const data = await window.SalesDocketApi.searchProducts(query);
        renderSearch(data.products || []);
        setStatus((data.products || []).length + ' search results ready.');
      } catch (error) {
        setStatus('Search failed: ' + error.message);
      }
    }, 120);
  });

  bootstrap().catch(function(error) {
    setStatus('Bootstrap failed: ' + error.message);
  });
})();
