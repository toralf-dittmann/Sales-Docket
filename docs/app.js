(function() {
  const FIJI_TIME_ZONE = 'Pacific/Fiji';
  let activeDocketId = '';
  let activeDocket = null;

  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const lineItemsEl = document.getElementById('lineItems');
  const docketSelectEl = document.getElementById('docketSelect');
  const searchEl = document.getElementById('searchInput');
  const accountChipEl = document.getElementById('accountChip');
  const accountGlyphEl = document.getElementById('accountGlyph');

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function fillInput(id, value) {
    document.getElementById(id).value = value || '';
  }

  function fillText(id, value) {
    document.getElementById(id).textContent = value || '-';
  }

  function renderAccount(user) {
    const email = user && user.email ? user.email : '';
    const initial = email ? email.charAt(0).toUpperCase() : '?';
    accountGlyphEl.textContent = initial;
    accountChipEl.title = email || 'Operator account';
    accountChipEl.setAttribute('aria-label', email || 'Operator account');
  }

  function renderDocketOptions(dockets) {
    docketSelectEl.innerHTML = '';

    if (!dockets.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No dockets yet';
      docketSelectEl.appendChild(option);
      return;
    }

    dockets.forEach(function(docket) {
      const option = document.createElement('option');
      option.value = docket.docketId;
      option.textContent = formatDocketOptionLabel(docket);
      docketSelectEl.appendChild(option);
    });
  }

  function formatDocketOptionLabel(docket) {
    const customer = docket.customerName || 'Untitled customer';
    const total = formatMoney(docket.grandTotalGross || 0);
    return docket.docketId + ' - ' + customer + ' - $' + total;
  }

  function renderDocket(docket) {
    activeDocket = docket;
    activeDocketId = docket.docketId || '';

    fillInput('title', docket.header.title);
    fillInput('docketNumber', docket.header.documentNumber || docket.docketId);
    fillInput('customerName', docket.header.customerName);
    fillInput('customerEmail', docket.header.customerEmail);
    fillInput('orderNumber', docket.header.orderNumber);
    fillInput('paymentTerms', docket.header.paymentTerms);
    document.getElementById('pricingMode').value = docket.header.pricingMode || 'domestic';

    lineItemsEl.innerHTML = '';
    if (!docket.lines.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'empty';
      td.textContent = 'No line items entered yet.';
      tr.appendChild(td);
      lineItemsEl.appendChild(tr);
    } else {
      docket.lines.forEach(function(line) {
        lineItemsEl.appendChild(buildLineRow(line));
      });
    }

    fillText('subtotal', currencyText(docket.totals.subtotalNet));
    fillText('shipping', currencyText(docket.totals.shippingNet));
    fillText('vatRateDefault', percentText(docket.header.vatRateDefault));
    fillText('vatAmount', currencyText(docket.totals.vatAmount));
    fillText('grandTotal', currencyText(docket.totals.grandTotalGross));
  }

  function buildLineRow(line) {
    const tr = document.createElement('tr');

    const detailInput = createTableInput(line.fullDetail, 'text');
    const descriptionInput = createTableInput(line.description, 'text');
    const qtyInput = createTableInput(line.qty, 'number');
    qtyInput.min = '1';
    qtyInput.step = '1';
    const priceInput = createTableInput(line.unitPriceInput, 'number');
    priceInput.min = '0';
    priceInput.step = '0.01';

    const saveButton = document.createElement('button');
    saveButton.className = 'secondary compact';
    saveButton.type = 'button';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', async function() {
      try {
        saveButton.disabled = true;
        setStatus('Saving line ' + line.sortOrder + '...');
        const response = await window.SalesDocketApi.updateDocketLine(activeDocketId, line.lineId, {
          fullDetail: detailInput.value,
          description: descriptionInput.value,
          quantity: qtyInput.value,
          unitPriceInput: priceInput.value
        });
        renderDocket(response);
        await refreshDockets(activeDocketId);
        setStatus('Line updated.');
      } catch (error) {
        setStatus('Line update failed: ' + error.message);
      } finally {
        saveButton.disabled = false;
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'danger compact';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async function() {
      try {
        deleteButton.disabled = true;
        setStatus('Deleting line ' + line.sortOrder + '...');
        const response = await window.SalesDocketApi.deleteDocketLine(activeDocketId, line.lineId);
        renderDocket(response);
        await refreshDockets(activeDocketId);
        setStatus('Line deleted.');
      } catch (error) {
        setStatus('Delete failed: ' + error.message);
      } finally {
        deleteButton.disabled = false;
      }
    });

    tr.appendChild(createTextCell(String(line.sortOrder)));
    tr.appendChild(createTextCell(line.productNr));
    tr.appendChild(createInputCell(detailInput));
    tr.appendChild(createInputCell(descriptionInput));
    tr.appendChild(createInputCell(qtyInput));
    tr.appendChild(createInputCell(priceInput));
    tr.appendChild(createTextCell(currencyText(line.lineTotalGross)));

    const actionCell = document.createElement('td');
    actionCell.className = 'line-actions';
    actionCell.appendChild(saveButton);
    actionCell.appendChild(deleteButton);
    tr.appendChild(actionCell);

    return tr;
  }

  function createTextCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '';
    return td;
  }

  function createInputCell(input) {
    const td = document.createElement('td');
    td.appendChild(input);
    return td;
  }

  function createTableInput(value, type) {
    const input = document.createElement('input');
    input.className = 'table-input';
    input.type = type;
    input.value = value === undefined || value === null ? '' : value;
    return input;
  }

  function renderResults(products) {
    resultsEl.innerHTML = '';

    if (!products.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'No matching products found.';
      resultsEl.appendChild(div);
      return;
    }

    products.forEach(function(product) {
      const card = document.createElement('div');
      card.className = 'result';

      const top = document.createElement('div');
      top.className = 'result-top';
      top.innerHTML =
        '<div>' +
          '<div class="pn">' + escapeHtml(product.productNr) + '</div>' +
          '<div>' + escapeHtml(product.description || '') + '</div>' +
          '<div class="muted">' + escapeHtml(product.variant || '') + '</div>' +
        '</div>' +
        '<div class="muted">Stock ' + escapeHtml(String(product.stockLevel || 0)) + '</div>';

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const quantity = document.createElement('input');
      quantity.type = 'number';
      quantity.min = '1';
      quantity.step = '1';
      quantity.value = '1';

      const button = document.createElement('button');
      button.className = 'primary';
      button.type = 'button';
      button.textContent = 'Add Line';
      button.addEventListener('click', async function() {
        if (!activeDocketId) {
          setStatus('Create or select a docket first.');
          return;
        }

        try {
          button.disabled = true;
          setStatus('Adding ' + product.productNr + '...');
          const response = await window.SalesDocketApi.addDocketLine(activeDocketId, {
            productNr: product.productNr,
            quantity: quantity.value
          });
          renderDocket(response);
          await refreshDockets(activeDocketId);
          setStatus('Added ' + product.productNr + '.');
        } catch (error) {
          setStatus('Add failed: ' + error.message);
        } finally {
          button.disabled = false;
        }
      });

      const price = document.createElement('div');
      price.className = 'muted';
      price.textContent = 'Net ' + formatMoney(product.unitPriceNet);

      actions.appendChild(quantity);
      actions.appendChild(button);
      actions.appendChild(price);

      card.appendChild(top);
      card.appendChild(actions);
      resultsEl.appendChild(card);
    });
  }

  async function refreshDockets(preferredDocketId) {
    const dockets = await window.SalesDocketApi.listDockets();
    renderDocketOptions(dockets || []);

    if (!dockets || !dockets.length) {
      activeDocketId = '';
      activeDocket = null;
      return;
    }

    const targetId = preferredDocketId || activeDocketId || dockets[0].docketId;
    docketSelectEl.value = dockets.some(function(docket) {
      return docket.docketId === targetId;
    }) ? targetId : dockets[0].docketId;
  }

  async function loadSelectedDocket() {
    const selectedId = docketSelectEl.value;
    if (!selectedId) {
      return;
    }

    try {
      setStatus('Loading docket...');
      const docket = await window.SalesDocketApi.loadDocket(selectedId);
      renderDocket(docket);
      setStatus('Loaded ' + selectedId + '.');
    } catch (error) {
      setStatus('Load failed: ' + error.message);
    }
  }

  async function runSearch() {
    const query = searchEl.value.trim();
    if (!query) {
      resultsEl.innerHTML = '<div class="empty">Type to search products.</div>';
      return;
    }

    try {
      setStatus('Searching products...');
      const data = await window.SalesDocketApi.searchProducts(query);
      renderResults(data.products || []);
      setStatus('Search ready.');
    } catch (error) {
      setStatus('Search failed: ' + error.message);
    }
  }

  async function createDocket() {
    try {
      setStatus('Creating a new docket...');
      const docket = await window.SalesDocketApi.createDocket({
        companyCode: 'AQIML',
        pricingMode: 'domestic'
      });
      await refreshDockets(docket.docketId);
      renderDocket(docket);
      setStatus('Created ' + docket.docketId + '.');
    } catch (error) {
      setStatus('Create failed: ' + error.message);
    }
  }

  async function bootstrap() {
    try {
      const apiBaseUrl = window.SalesDocketApi.getConfig().apiBaseUrl;
      if (!apiBaseUrl) {
        setStatus('The backend URL is missing from config.js.');
        return;
      }

      const data = await window.SalesDocketApi.bootstrap();
      renderAccount(data.currentUser);
      await window.SalesDocketApi.ensureStorage();
      await refreshDockets(data.dockets && data.dockets[0] ? data.dockets[0].docketId : '');

      if (docketSelectEl.value) {
        await loadSelectedDocket();
      } else {
        setStatus('No dockets yet. Create the first one to begin.');
      }
    } catch (error) {
      setStatus('Bootstrap failed: ' + error.message);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    const numeric = Number(value || 0);
    return numeric.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function currencyText(value) {
    return '$' + formatMoney(value);
  }

  function percentText(value) {
    return (Number(value || 0) * 100).toFixed(2) + '%';
  }

  function formatFijiDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }

    return new Intl.DateTimeFormat('en-FJ', {
      timeZone: FIJI_TIME_ZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  docketSelectEl.addEventListener('change', loadSelectedDocket);

  document.getElementById('createDocketBtn').addEventListener('click', createDocket);

  document.getElementById('pingBtn').addEventListener('click', async function() {
    try {
      setStatus('Pinging server...');
      const data = await window.SalesDocketApi.ping();
      setStatus('Server reachable at ' + formatFijiDateTime(data.at));
    } catch (error) {
      setStatus('Ping failed: ' + error.message);
    }
  });

  document.getElementById('saveHeaderBtn').addEventListener('click', async function() {
    if (!activeDocketId) {
      setStatus('Create or select a docket first.');
      return;
    }

    try {
      setStatus('Saving header...');
      const docket = await window.SalesDocketApi.saveDocketHeader(activeDocketId, {
        title: document.getElementById('title').value,
        customerName: document.getElementById('customerName').value,
        customerEmail: document.getElementById('customerEmail').value,
        orderNumber: document.getElementById('orderNumber').value,
        paymentTerms: document.getElementById('paymentTerms').value,
        pricingMode: document.getElementById('pricingMode').value
      });
      renderDocket(docket);
      await refreshDockets(activeDocketId);
      setStatus('Header saved.');
    } catch (error) {
      setStatus('Save failed: ' + error.message);
    }
  });

  let searchTimer = null;
  searchEl.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  });

  bootstrap();
})();
